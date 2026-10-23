/* ---------- Redstone, etapa 4: sculk, ejetor e liberador, funil, fabricador, bloco de comando, pistão ---------- */
/* Continua src/redstone.js (mesma agenda rs.q, mesmo rsSet: tudo o que muda entra no passo de desfazer da ação que
   causou).

   Conteúdo dos contêineres (rsFill): até a etapa 3 era só o "nível que o comparador lê" (1 a 15). Agora o valor pode
   ser também uma quantidade de itens de um tipo: v >= 16 quer dizer 16 + quantidade + 4096 × tipo (RS_ITEMS). O nível
   sai da conta do jogo: piso(1 + (quantidade / pilha) / espaços × 14). Um nível escolhido à mão (1 a 15, sem itens)
   vira a menor quantidade que dá esse nível quando um item entra ou sai.

   Ejetor (dropper) e liberador (dispenser): quando o sinal chega (subida, 4 tiques depois, como no jogo; sem
   quase-conectividade, como no Bedrock) soltam um item: o ejetor põe no contêiner da frente (baú, funil, outro
   ejetor...) ou joga no chão; o liberador atira flechas, bolas de neve e ovos (src/projectiles.js, velocidade 1,1),
   põe e recolhe água e lava com balde, usa farinha de osso (árvores e plantações crescem), acende fogo e velas com o
   isqueiro, e joga o resto no chão. Item no chão: cai como no jogo, fica 5 minutos, aperta placas de madeira e de
   peso, dispara a linha de armadilha e entra no funil em que cair.
   Funil: a cada 8 tiques passa 1 item para o contêiner para onde aponta e puxa 1 do contêiner de cima (travado com
   sinal). Fabricador: com espaços ocupados (Usar escolhe de 0 a 9; o comparador lê esse número), o sinal fabrica um
   item (sai para o contêiner da frente ou cai no chão) e esvazia os espaços.

   Sensor de sculk (alcance 8) e sensor calibrado (16): ouvem as vibrações dos eventos do jogo (frequência 1 a 15):
   colocar bloco 13, quebrar 12, mudar um bloco 11, abrir/ativar 10 (porta, alçapão, portão, alavanca, botão, placa,
   pistão estendendo, bloco musical tocando), fechar/desativar 9, projétil atirado 3, projétil batendo 2. A vibração
   anda 1 bloco por tique; o sensor liga com força 15 − piso(15 × distância / alcance) (no mínimo 1) por 30 tiques (o
   calibrado, 10), depois descansa 10 tiques. Lã entre o evento e o sensor bloqueia. O comparador lê a frequência da
   última vibração enquanto o sensor está ligado. O calibrado, com sinal entrando por trás, só ouve a frequência igual
   a esse sinal.

   Bloco de comando: Usar abre o comando. Impulso (roda uma vez quando o sinal chega), Repetição (a cada tique enquanto
   tem sinal) e Corrente (roda logo depois do bloco que aponta para ele); Condicional (só se o de trás deu certo) e
   Sempre ativo. Comandos: say, tellraw, title, setblock, fill, clone, testforblock, execute if/unless block ... run,
   time. O comparador lê quantas vezes o último comando deu certo. Coordenadas: as do jogo com um mundo aberto, as do
   editor sem mundo; ~ é relativo ao bloco.

   Pistão: depois de mover, quebra o que ficou sem apoio (pó, tochas, trilhos, placas, botões, alavancas, plantas,
   tapetes...) e a água e a lava em volta voltam a escorrer (src/fluids.js). */

/* ---------- Itens dos contêineres ---------- */
var RS_ITEMS = [
  { k: 'item', name: 'Itens comuns', s: 64 },
  { k: 'arrow', name: 'Flechas', s: 64 },
  { k: 'snowball', name: 'Bolas de neve', s: 16 },
  { k: 'egg', name: 'Ovos', s: 16 },
  { k: 'water', name: 'Balde de água', s: 1 },
  { k: 'lava', name: 'Balde de lava', s: 1 },
  { k: 'bucket', name: 'Baldes vazios', s: 16 },
  { k: 'bone', name: 'Farinha de osso', s: 64 },
  { k: 'flint', name: 'Isqueiro', s: 1 }
];
function rsSlots(j) {
  if (/^(dropper|dispenser|crafter)$/.test(j)) return 9;
  if (j === 'hopper' || j === 'brewing_stand') return 5;
  if (/furnace$|^smoker$/.test(j)) return 3;
  if (j === 'jukebox' || j === 'decorated_pot') return 1;
  return 27;
}
/* Conteúdo em i (célula do bloco j): { code, n } (n = quantidade de itens) */
function rsInv(i, j) {
  var v = rsFill.get(i) || 0;
  if (!v) return { code: 0, n: 0 };
  if (v >= 16) { var r = v - 16; return { code: Math.floor(r / 4096), n: r % 4096 }; }
  var S = rsSlots(j) * 64; return { code: 0, n: Math.max(1, Math.ceil((v - 1) * S / 14)) }; // nível escolhido à mão
}
function rsInvCap(j, code) { return code === 4 || code === 5 ? 1 : rsSlots(j) * RS_ITEMS[code].s; } // balde cheio: um só (vira balde vazio)
function rsInvSet(i, code, n) { rsFillLog(i, n > 0 ? 16 + n + 4096 * code : 0); }
/* Grava no passo de desfazer em andamento (a ação que causou), como rsSet */
function rsFillLog(i, val) {
  var old = rsFill.get(i) || 0; if (old === val) return;
  if (val) rsFill.set(i, val); else rsFill.delete(i);
  rsFillSave = true; bentMark(i);
  var top = batch || histTop(); if (top) top.add(-(RS_FILL_BASE + i), old, val);
}
/* Nível que o comparador lê */
function rsLevel(x, y, z, j) {
  var i = idx(x, y, z), v = rsFill.get(i) || 0;
  if (j === 'jukebox' || j === 'crafter') return v; // disco tocando / espaços ocupados
  if (v < 16) return v;
  var q = rsInv(i, j); if (!q.n) return 0;
  return Math.min(15, Math.floor(1 + q.n / RS_ITEMS[q.code].s / rsSlots(j) * 14));
}
function rsContJ(x, y, z) { if (!inB(x, y, z)) return null; var v = gget(x, y, z); if (!v || cellBlock(v) === PRES_BI) return null; var j = BLOCKS[cellBlock(v)].java; return RS_CONT.test(j) && j !== 'jukebox' && j !== 'crafter' ? j : null; }
/* Põe n itens do tipo code no contêiner em p; devolve quantos couberam */
function rsInvAdd(p, code, n) {
  var j = rsContJ(p[0], p[1], p[2]); if (!j) return 0;
  var i = idx(p[0], p[1], p[2]), q = rsInv(i, j);
  if (q.n && q.code !== code) return 0; // um tipo por contêiner (o site não guarda espaço por espaço)
  var cap = rsInvCap(j, code), k = Math.min(n, cap - q.n); if (k <= 0) return 0;
  rsInvSet(i, code, q.n + k); rsInvChanged(p); return k;
}
function rsInvTake(p) {
  var j = rsContJ(p[0], p[1], p[2]); if (!j) return null;
  var i = idx(p[0], p[1], p[2]), q = rsInv(i, j); if (!q.n) return null;
  rsInvSet(i, q.code, q.n - 1); rsInvChanged(p); return q.code;
}
/* O conteúdo mudou: comparadores em volta e funis que podem passar itens */
function rsInvChanged(p) {
  rs.touched.push(p.slice());
  var near = [[0, 0, 0], [0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]];
  near.forEach(function (d) { var c = rsAt(p[0] + d[0], p[1] + d[1], p[2] + d[2]); if (c && c.k === 'hopper') rsLater(8, 'hop', c); });
}

/* ---------- Ejetor, liberador, fabricador ---------- */
function rsFront(c) {
  var f = c.k === 'crafter' ? rsCrafterFacing(c) : c.b.ori.o[cellOri(c.v)][0];
  var v = DV[f]; return { f: f, p: [c.x + v[0], c.y + v[1], c.z + v[2]], d: v };
}
function rsCrafterFacing(c) { return c.b.ori.o[cellOri(c.v)][0].split('_')[0]; }
/* Liga na subida do sinal (memória rs.trig) */
function rsTrigEval(c) {
  var i = rsIdx(c), pw = rsInput(c.x, c.y, c.z) > 0, was = rs.trig.get(i) || false;
  rs.trig.set(i, pw);
  if (pw && !was) rsLater(4, 'fire', c);
}
function rsFire(c) {
  if (c.k === 'crafter') { rsCraft(c); return; }
  var j = c.b.java, i = rsIdx(c), q = rsInv(i, j);
  var F = rsFront(c), fp = F.p, pos = [c.x + 0.5 + F.d[0] * 0.7, c.y + 0.5 + F.d[1] * 0.7, c.z + 0.5 + F.d[2] * 0.7];
  if (!q.n) { rsVibe(c.x, c.y, c.z, 10); return; } // vazio: só o clique
  var it = RS_ITEMS[q.code], used = true, msg = '';
  if (j === 'dropper') {
    if (rsContJ(fp[0], fp[1], fp[2])) { if (!rsInvAdd(fp, q.code, 1)) return; } // contêiner cheio: não solta
    else rsDropItem(pos, F.d, q.code);
  } else if (it.k === 'arrow' || it.k === 'snowball' || it.k === 'egg') {
    var dd = [F.d[0], F.d[1] + (F.d[1] ? 0 : 0.1), F.d[2]], l = Math.hypot(dd[0], dd[1], dd[2]);
    projShoot(it.k, pos, [dd[0] / l, dd[1] / l, dd[2] / l], 1.1);
  } else if (it.k === 'water' || it.k === 'lava') {
    var fv = inB(fp[0], fp[1], fp[2]) ? gget(fp[0], fp[1], fp[2]) : -1;
    if (fv === 0 || (fv > 0 && fluidType(fv) && fluidLv(fv) !== 0)) { rsSet(fp[0], fp[1], fp[2], fluidCell(it.k, 0)); rsVibe(fp[0], fp[1], fp[2], 13); fluidTouch(fp[0], fp[1], fp[2]); rsInvSet(i, 6, 1); rsInvChanged([c.x, c.y, c.z]); return; }
    rsDropItem(pos, F.d, q.code);
  } else if (it.k === 'bucket') {
    var bv = inB(fp[0], fp[1], fp[2]) ? gget(fp[0], fp[1], fp[2]) : 0, ft = bv && fluidType(bv);
    if (ft && fluidLv(bv) === 0) {
      rsSet(fp[0], fp[1], fp[2], 0); rsVibe(fp[0], fp[1], fp[2], 12); fluidTouch(fp[0], fp[1], fp[2]);
      rsInvSet(i, q.n > 1 ? 6 : (ft === 'water' ? 4 : 5), q.n > 1 ? q.n - 1 : 1); // um balde enche (com mais de um, o cheio cai fora)
      if (q.n > 1) rsDropItem(pos, F.d, ft === 'water' ? 4 : 5);
      rsInvChanged([c.x, c.y, c.z]); return;
    }
    rsDropItem(pos, F.d, q.code);
  } else if (it.k === 'bone') {
    used = !!growAt(fp, false); if (!used) msg = 'nada para crescer';
  } else if (it.k === 'flint') {
    var lv = inB(fp[0], fp[1], fp[2]) ? gget(fp[0], fp[1], fp[2]) : -1;
    if (lv > 0 && BLOCKS[cellBlock(lv)].shape && /candle|campfire/.test(BLOCKS[cellBlock(lv)].java)) {
      var lb = BLOCKS[cellBlock(lv)], lp = stateProps(lb, cellOri(lv)); if (lp.lit === 'false') { lp.lit = 'true'; rsSet(fp[0], fp[1], fp[2], mkCell(cellBlock(lv), stateIndex(lb, lp))); }
    } else if (lv === 0 && inB(fp[0], fp[1] - 1, fp[2]) && gget(fp[0], fp[1] - 1, fp[2])) { rsSet(fp[0], fp[1], fp[2], cellOf('fire', {})); rsVibe(fp[0], fp[1], fp[2], 13); }
    rsInvChanged([c.x, c.y, c.z]); return; // o isqueiro não acaba (gasta durabilidade)
  } else rsDropItem(pos, F.d, q.code);
  if (used) { rsInvSet(i, q.code, q.n - 1); rsInvChanged([c.x, c.y, c.z]); }
  if (msg) { /* liberador clicou sem efeito */ }
}
function rsCraft(c) {
  var i = rsIdx(c), k = rsFill.get(i) || 0; if (!k) return;
  var F = rsFront(c), pos = [c.x + 0.5 + F.d[0] * 0.7, c.y + 0.5 + F.d[1] * 0.7, c.z + 0.5 + F.d[2] * 0.7];
  if (rsContJ(F.p[0], F.p[1], F.p[2])) { if (!rsInvAdd(F.p, 0, 1)) return; } else rsDropItem(pos, F.d, 0);
  rsFillLog(i, 0); rs.touched.push([c.x, c.y, c.z]); rsVibe(c.x, c.y, c.z, 10);
}
/* Item jogado no chão (entidade): sai devagar na direção da frente e cai */
function rsDropItem(pos, d, code) {
  var v = [d[0] * 0.25, d[1] * 0.25 + (d[1] ? 0 : 0.2), d[2] * 0.25];
  projSpawn('item', pos, v, { code: code });
}

/* ---------- Funil ---------- */
function rsHop(c) {
  var p = rsP(c); if (p.enabled === 'false') return;
  var me = [c.x, c.y, c.z], moved = false, i = rsIdx(c), q = rsInv(i, 'hopper');
  if (q.n) { var v = DV[p.facing || 'down'], t = [c.x + v[0], c.y + v[1], c.z + v[2]]; if (rsContJ(t[0], t[1], t[2]) && rsInvAdd(t, q.code, 1)) { rsInvSet(i, q.code, q.n - 1); moved = true; } }
  var up = [c.x, c.y + 1, c.z], uj = rsContJ(up[0], up[1], up[2]);
  if (uj) { var u = rsInv(idx(up[0], up[1], up[2]), uj), h = rsInv(i, 'hopper'); if (u.n && (!h.n || h.code === u.code) && h.n < rsInvCap('hopper', u.code)) { rsInvTake(up); rsInvSet(i, u.code, h.n + 1); moved = true; } }
  if (moved) { rsInvChanged(me); rsLater(8, 'hop', c); }
}

/* ---------- Sensor de sculk ---------- */
var RS_SK_RANGE = { sculk_sensor: 8, calibrated_sculk_sensor: 16 };
var rsSk = { ver: -1, list: [] };
function rsSculkAll() {
  if (rsSk.ver === verCounter) return rsSk.list;
  var out = [];
  W.forEach(function (ch) {
    var pal = ch.d ? ch.pal : [ch.u];
    if (!pal.some(function (v) { return v && rsKind(cellBlock(v)) === 'sculk'; })) return;
    var x0 = ch.cx << 4, y0 = ch.cy << 4, z0 = ch.cz << 4;
    for (var o = 0; o < 4096; o++) { var v = ch.d ? ch.pal[ch.d[o]] : ch.u; if (v && rsKind(cellBlock(v)) === 'sculk') out.push([x0 + (o & 15), y0 + (o >> 8), z0 + ((o >> 4) & 15)]); }
  });
  rsSk.ver = verCounter; rsSk.list = out; return out;
}
/* Lã entre a e b bloqueia a vibração */
function rsSkBlocked(a, b) {
  var d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], n = Math.ceil(Math.max(Math.abs(d[0]), Math.abs(d[1]), Math.abs(d[2])) * 2);
  for (var k = 1; k < n; k++) {
    var t = k / n, x = Math.floor(a[0] + d[0] * t), y = Math.floor(a[1] + d[1] * t), z = Math.floor(a[2] + d[2] * t);
    if ((x === Math.floor(a[0]) && y === Math.floor(a[1]) && z === Math.floor(a[2])) || (x === Math.floor(b[0]) && y === Math.floor(b[1]) && z === Math.floor(b[2]))) continue;
    var v = inB(x, y, z) ? gget(x, y, z) : 0; if (v && /_wool$/.test(BLOCKS[cellBlock(v)].java)) return true;
  }
  return false;
}
/* Um evento do jogo em (x, y, z) com a frequência f: cada sensor perto que está quieto recebe a vibração */
function rsVibe(x, y, z, f) {
  if (!rsOn || !f) return;
  var L = rsSculkAll(); if (!L.length) return;
  var src = [x + 0.5, y + 0.5, z + 0.5];
  L.forEach(function (s) {
    if (s[0] === Math.floor(x) && s[1] === Math.floor(y) && s[2] === Math.floor(z)) return;
    var c = rsAt(s[0], s[1], s[2]); if (!c || c.k !== 'sculk') return;
    var R = RS_SK_RANGE[c.b.java] || 8, ctr = [s[0] + 0.5, s[1] + 0.5, s[2] + 0.5];
    var dist = Math.hypot(ctr[0] - src[0], ctr[1] - src[1], ctr[2] - src[2]); if (dist > R) return;
    var i = rsIdx(c), p = rsP(c);
    if ((p.sculk_sensor_phase || 'inactive') !== 'inactive' || rs.skv.has(i)) return;
    if (c.b.java === 'calibrated_sculk_sensor') { var inp = rsSkInput(c); if (inp > 0 && inp !== f) return; }
    if (rsSkBlocked(src, ctr)) return;
    rs.skv.set(i, { pw: Math.max(1, 15 - Math.floor(15 / R * dist)), f: f });
    rsLater(Math.max(1, Math.floor(dist)), 'vib', c);
    rsVibFx(src, ctr, Math.max(1, Math.floor(dist)));
  });
}
/* Sinal que entra no calibrado: pelo lado de trás (oposto à frente) */
function rsSkInput(c) {
  var b = OPP[rsP(c).facing], n = rsN(c.x, c.y, c.z, b), nc = rsAt(n[0], n[1], n[2]); if (!nc) return 0;
  if (nc.k === 'solid' || rsCond(n[0], n[1], n[2])) return rsBlock(n[0], n[1], n[2], false);
  if (nc.k === 'wire') return rsWireLv(nc);
  return rsWeak(n[0], n[1], n[2], OPP[b]);
}
function rsVibArrive(c) {
  var i = rsIdx(c), e = rs.skv.get(i); rs.skv.delete(i);
  if (!e || c.k !== 'sculk' || (rsP(c).sculk_sensor_phase || 'inactive') !== 'inactive') return;
  rs.skf.set(i, e.f);
  rsProp(c, { sculk_sensor_phase: 'active', power: String(e.pw) });
  rsLater(c.b.java === 'calibrated_sculk_sensor' ? 10 : 30, 'skOff', c);
}
/* Vibração viajando: um ponto azul do evento até o sensor (como a partícula do jogo), no tempo do jogo: com a redstone
   pausada (passo a passo), fica parada no caminho e anda a cada tique */
var rsFx = [];
function rsVibFx(a, b, ticks) {
  if (typeof scene === 'undefined' || !scene) return;
  var m = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.26, 0.26), new THREE.MeshBasicMaterial({ color: 0x3fd6e0, transparent: true, opacity: 0.95, depthTest: false }));
  m.renderOrder = 9; scene.add(m);
  rsFx.push({ m: m, a: a, b: b, g0: rs.gt, n: ticks });
  if (rsFx.length === 1) requestAnimationFrame(rsFxFrame);
}
function rsFxClear() { rsFx.forEach(function (f) { scene.remove(f.m); f.m.geometry.dispose(); f.m.material.dispose(); }); rsFx = []; }
function rsFxFrame(now) {
  var frac = rs.timer && !rs.paused && rs.tickAt ? Math.min(1, (now - rs.tickAt) / 50) : 0;
  rsFx = rsFx.filter(function (f) {
    var k = (rs.gt - f.g0 + frac) / f.n;
    if (k >= 1 || rs.gt < f.g0) { scene.remove(f.m); f.m.geometry.dispose(); f.m.material.dispose(); return false; }
    f.m.position.set(f.a[0] + (f.b[0] - f.a[0]) * k, f.a[1] + (f.b[1] - f.a[1]) * k + Math.sin(k * Math.PI) * 0.4, f.a[2] + (f.b[2] - f.a[2]) * k);
    return true;
  });
  requestRender();
  if (rsFx.length) requestAnimationFrame(rsFxFrame);
}
/* Frequência de uma mudança de bloco (old -> v); sim: mudança feita pela simulação (só as que o jogo anuncia) */
function rsVibeFreq(old, v, sim) {
  if (!old && v) return sim ? 0 : 13;
  if (old && !v) return 12;
  if (!old || !v) return 0;
  var ba = cellBlock(old), bb = cellBlock(v);
  if (ba !== bb) return sim ? 0 : 13;
  var k = rsKind(bb), b = BLOCKS[bb];
  if (k === 'sculk' || !b.shape) return sim ? 0 : 11;
  var pa = stateProps(b, cellOri(old)), pb = stateProps(b, cellOri(v));
  if (pa.open !== pb.open && pb.open != null) return pb.open === 'true' ? 10 : 9;
  if (k === 'piston' && pa.extended !== pb.extended) return pb.extended === 'true' ? 10 : 9;
  if ((k === 'lever' || k === 'button' || k === 'plate') && pa.powered !== pb.powered) return pb.powered === 'true' ? 10 : 9;
  if (k === 'note' && pa.powered !== pb.powered && pb.powered === 'true') return 10;
  return sim ? 0 : 11;
}

/* ---------- Bloco de comando ---------- */
/* rs.cmds: célula -> { c: comando, auto: sempre ativo, ok: sucesso da última vez, out: saída, dirty: mudou (exportar) } */
var RS_CMD_KIND = { command_block: 'impulse', repeating_command_block: 'repeat', chain_command_block: 'chain' };
function rsCmdGet(i) { var e = rs.cmds.get(i); if (!e) { e = { c: '', auto: false, ok: 0, out: '' }; rs.cmds.set(i, e); } return e; }
function rsCmdEval(c) {
  var i = rsIdx(c), e = rs.cmds.get(i), pw = rsInput(c.x, c.y, c.z) > 0, was = rs.trig.get(i) || false, kind = RS_CMD_KIND[c.b.java];
  rs.trig.set(i, pw);
  if (kind === 'impulse' && pw && !was && !(e && e.auto)) rsLater(1, 'cmd', c);
  if (kind === 'repeat' && (pw || (e && e.auto))) rsLater(1, 'cmd', c);
}
function rsCmdTick(c) {
  var i = rsIdx(c), e = rs.cmds.get(i), kind = RS_CMD_KIND[c.b.java]; if (!kind) return;
  var active = (e && e.auto) || rsInput(c.x, c.y, c.z) > 0;
  if (kind === 'repeat' && !active) return;
  rsCmdRun(c, 0);
  if (kind === 'repeat') rsLater(1, 'cmd', c);
}
/* Roda o bloco e segue a corrente para a frente */
function rsCmdRun(c, depth) {
  var seen = new Set(), cur = c, prevOk = null;
  while (cur && seen.size < 512) {
    var i = rsIdx(cur); if (seen.has(i)) break; seen.add(i);
    var e = rsCmdGet(i), p = rsP(cur), kind = RS_CMD_KIND[cur.b.java];
    if (cur !== c) { // bloco de corrente: precisa estar ativo
      if (kind !== 'chain') break;
      if (!e.auto && !(rsInput(cur.x, cur.y, cur.z) > 0)) break;
    }
    var cond = p.conditional === 'true', ok;
    if (cond) {
      var back = rsN(cur.x, cur.y, cur.z, OPP[p.facing]), bc = rsAt(back[0], back[1], back[2]);
      var bok = prevOk != null ? prevOk : (bc && bc.k === 'cmd' ? rsCmdGet(rsIdx(bc)).ok : 0);
      if (!bok) { e.ok = 0; e.out = 'Condicional: o bloco de trás não deu certo.'; prevOk = 0; ok = 0; }
    }
    if (ok === undefined) { var r = rsCmdExec(e.c, cur); e.ok = r.ok; e.out = r.out; prevOk = r.ok; }
    rs.touched.push([cur.x, cur.y, cur.z]); // comparador lendo o bloco
    var v = DV[p.facing], nx = cur.x + v[0], ny = cur.y + v[1], nz = cur.z + v[2], nc = rsAt(nx, ny, nz);
    cur = nc && nc.k === 'cmd' && RS_CMD_KIND[nc.b.java] === 'chain' ? nc : null;
  }
}
/* Divide o comando em partes (colchetes, chaves e aspas ficam juntos) */
function rsCmdSplit(s) {
  var out = [], cur = '', depth = 0, q = false;
  for (var k = 0; k < s.length; k++) {
    var ch = s[k];
    if (q) { cur += ch; if (ch === '"' && s[k - 1] !== '\\') q = false; continue; }
    if (ch === '"') { q = true; cur += ch; continue; }
    if (ch === '[' || ch === '{') depth++;
    if (ch === ']' || ch === '}') depth--;
    if (ch === ' ' && depth <= 0) { if (cur) out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur) out.push(cur);
  // estados do Bedrock separados do nome por espaço: "stone ["a"=1]" -> junta
  for (var i = out.length - 1; i > 0; i--) if (out[i][0] === '[' && /^[a-z_:]+$/i.test(out[i - 1])) { out[i - 1] += out[i]; out.splice(i, 1); }
  return out;
}
/* Coordenadas do jogo <-> editor */
function rsGameOff() { if (wio && wio.area) { var A = wio.area; return [A.x0, wioDim(A.dim).min, A.z0]; } return [0, 0, 0]; }
function rsCoords(t, c) {
  var off = rsGameOff(), base = [c.x + off[0], c.y + off[1], c.z + off[2]], out = [];
  for (var k = 0; k < 3; k++) {
    var s = t[k]; if (s == null) return null;
    if (s[0] === '^') return null;
    var n = s[0] === '~' ? base[k] + (s.length > 1 ? Math.floor(+s.slice(1)) : 0) : Math.floor(+s);
    if (isNaN(n)) return null;
    out.push(n - off[k]);
  }
  return out;
}
/* Bloco do comando: nome Java (com [estado=valor]) ou Bedrock (com ["estado"=valor]); devolve { v, props } */
function rsCmdBlock(s) {
  if (!s) return null;
  s = s.replace(/^minecraft:/, '');
  var m = /^([a-z0-9_]+)(\[(.*)\])?$/i.exec(s); if (!m) return null;
  if (m[1] === 'air') return { v: 0, props: null };
  var props = {};
  if (m[3]) m[3].split(',').forEach(function (pv) { var a = pv.split('='); if (a.length === 2) props[a[0].trim().replace(/"/g, '')] = a[1].trim().replace(/"/g, ''); });
  var v = cellFromJava(m[1] + (m[3] && !/"/.test(m[3]) ? '[' + m[3] + ']' : ''));
  if (!v) { var st = {}; for (var k in props) st[k] = /^-?\d+$/.test(props[k]) ? +props[k] : props[k] === 'true' ? 1 : props[k] === 'false' ? 0 : props[k]; v = cellFromBedrock('minecraft:' + m[1], st); }
  return v ? { v: v, props: m[3] ? props : null, name: m[1] } : null;
}
function rsCmdMatch(cur, want) {
  if (!want) return false;
  if (!want.v) return !cur;
  if (!cur || cellBlock(cur) !== cellBlock(want.v)) return false;
  if (!want.props) return true;
  var b = BLOCKS[cellBlock(cur)]; if (!b.shape) return cur === want.v;
  var p = stateProps(b, cellOri(cur)), w = stateProps(b, cellOri(want.v));
  for (var k in want.props) if (k in w && p[k] !== w[k]) return false;
  return true;
}
function rsCmdSetCell(x, y, z, v, mode) {
  if (!inB(x, y, z)) return false;
  var cur = gget(x, y, z);
  if (mode === 'keep' && cur) return false;
  if (cur === v) return false;
  rsSet(x, y, z, v); return true;
}
var RS_CMD_MAX = 32768; // o jogo também limita fill e clone a 32.768 blocos
function rsCmdExec(cmd, c) {
  var t = rsCmdSplit(String(cmd || '').trim().replace(/^\//, '')), op = (t[0] || '').toLowerCase();
  var fail = function (m) { return { ok: 0, out: m }; }, A, B, D, b, n, x, y, z;
  try {
    switch (op) {
      case '': return fail('Sem comando.');
      case 'say': { var msg = t.slice(1).join(' '); toast('[@] ' + msg, 5000); return { ok: 1, out: msg }; }
      case 'tellraw': case 'title': case 'titleraw': {
        var rest = t.slice(op === 'tellraw' ? 2 : 3).join(' '), txt = rest;
        if (/^[\[{]/.test(rest)) { txt = ''; rest.replace(/"text"\s*:\s*"((?:[^"\\]|\\.)*)"/g, function (_, s1) { txt += s1.replace(/\\"/g, '"'); return ''; }); }
        toast(txt, 5000); return { ok: 1, out: txt };
      }
      case 'setblock':
        A = rsCoords(t.slice(1, 4), c); b = rsCmdBlock(t[4]);
        if (!A) return fail('Coordenadas inválidas.'); if (!b) return fail('Bloco desconhecido: ' + t[4]);
        if (!inB(A[0], A[1], A[2])) return fail('Fora do espaço.');
        return rsCmdSetCell(A[0], A[1], A[2], b.v, (t[5] || 'replace').toLowerCase()) ? { ok: 1, out: 'Bloco colocado.' } : fail('Não mudou nada.');
      case 'fill': {
        A = rsCoords(t.slice(1, 4), c); B = rsCoords(t.slice(4, 7), c); b = rsCmdBlock(t[7]);
        if (!A || !B) return fail('Coordenadas inválidas.'); if (!b) return fail('Bloco desconhecido: ' + t[7]);
        var mode = (t[8] || 'replace').toLowerCase(), filt = mode === 'replace' && t[9] ? rsCmdBlock(t[9]) : null;
        var lo = [Math.min(A[0], B[0]), Math.min(A[1], B[1]), Math.min(A[2], B[2])], hi = [Math.max(A[0], B[0]), Math.max(A[1], B[1]), Math.max(A[2], B[2])];
        var vol = (hi[0] - lo[0] + 1) * (hi[1] - lo[1] + 1) * (hi[2] - lo[2] + 1); if (vol > RS_CMD_MAX) return fail('Área grande demais (' + vol + ' blocos; o máximo é 32768).');
        n = 0;
        for (y = lo[1]; y <= hi[1]; y++) for (z = lo[2]; z <= hi[2]; z++) for (x = lo[0]; x <= hi[0]; x++) {
          var edge = x === lo[0] || x === hi[0] || y === lo[1] || y === hi[1] || z === lo[2] || z === hi[2];
          if (mode === 'outline' && !edge) continue;
          var want = mode === 'hollow' && !edge ? 0 : b.v;
          if (filt && !rsCmdMatch(inB(x, y, z) ? gget(x, y, z) : 0, filt)) continue;
          if (rsCmdSetCell(x, y, z, want, mode === 'keep' ? 'keep' : 'replace')) n++;
        }
        return n ? { ok: n, out: n + ' blocos preenchidos.' } : fail('Nenhum bloco mudou.');
      }
      case 'clone': {
        A = rsCoords(t.slice(1, 4), c); B = rsCoords(t.slice(4, 7), c); D = rsCoords(t.slice(7, 10), c);
        if (!A || !B || !D) return fail('Coordenadas inválidas.');
        var l2 = [Math.min(A[0], B[0]), Math.min(A[1], B[1]), Math.min(A[2], B[2])], h2 = [Math.max(A[0], B[0]), Math.max(A[1], B[1]), Math.max(A[2], B[2])];
        var sz = [h2[0] - l2[0] + 1, h2[1] - l2[1] + 1, h2[2] - l2[2] + 1]; if (sz[0] * sz[1] * sz[2] > RS_CMD_MAX) return fail('Área grande demais (o máximo é 32768).');
        var masked = (t[10] || '').toLowerCase() === 'masked', buf = [];
        for (y = 0; y < sz[1]; y++) for (z = 0; z < sz[2]; z++) for (x = 0; x < sz[0]; x++) buf.push(inB(l2[0] + x, l2[1] + y, l2[2] + z) ? gget(l2[0] + x, l2[1] + y, l2[2] + z) : 0);
        n = 0; var k2 = 0;
        for (y = 0; y < sz[1]; y++) for (z = 0; z < sz[2]; z++) for (x = 0; x < sz[0]; x++, k2++) { if (masked && !buf[k2]) continue; if (rsCmdSetCell(D[0] + x, D[1] + y, D[2] + z, buf[k2], 'replace')) n++; }
        return n ? { ok: n, out: n + ' blocos copiados.' } : fail('Nenhum bloco mudou.');
      }
      case 'testforblock': {
        A = rsCoords(t.slice(1, 4), c); b = rsCmdBlock(t[4]); if (!A || !b) return fail('Comando inválido.');
        return rsCmdMatch(inB(A[0], A[1], A[2]) ? gget(A[0], A[1], A[2]) : 0, b) ? { ok: 1, out: 'O bloco confere.' } : fail('O bloco não confere.');
      }
      case 'execute': {
        var k = 1, cond = true;
        while (k < t.length) {
          var w = t[k].toLowerCase();
          if ((w === 'if' || w === 'unless') && (t[k + 1] || '').toLowerCase() === 'block') {
            A = rsCoords(t.slice(k + 2, k + 5), c); b = rsCmdBlock(t[k + 5]); if (!A || !b) return fail('Condição inválida.');
            var hit = rsCmdMatch(inB(A[0], A[1], A[2]) ? gget(A[0], A[1], A[2]) : 0, b); if ((w === 'if') !== hit) cond = false;
            k += 6; continue;
          }
          if (w === 'run') { if (!cond) return fail('A condição não passou.'); return rsCmdExec(t.slice(k + 1).join(' '), c); }
          if (w === 'as' || w === 'at') { k += 2; continue; } // sem entidades: ignora o seletor
          return fail('Parte do execute que o editor não faz: ' + t[k]);
        }
        return cond ? { ok: 1, out: 'A condição passou.' } : fail('A condição não passou.');
      }
      case 'time': {
        var sub = (t[1] || '').toLowerCase(), val = (t[2] || '').toLowerCase(), named = { day: 1000, noon: 6000, sunset: 12000, night: 13000, midnight: 18000, sunrise: 23000 };
        if (sub === 'set') { var tv = val in named ? named[val] : +val; if (isNaN(tv)) return fail('Hora inválida.'); setRsTime(tv); return { ok: 1, out: 'Hora: ' + rsTimeTxt(rsTime) }; }
        if (sub === 'add') { if (isNaN(+val)) return fail('Tempo inválido.'); setRsTime(rsTime + +val); return { ok: 1, out: 'Hora: ' + rsTimeTxt(rsTime) }; }
        if (sub === 'query') return { ok: Math.floor(rsTime) % 24000, out: 'Hora: ' + rsTime };
        return fail('Use time set, time add ou time query.');
      }
      default: return fail('O editor não faz o comando /' + op + ' (sem criaturas, itens nem placar). Funcionam: say, tellraw, title, setblock, fill, clone, testforblock, execute if/unless block … run, time.');
    }
  } catch (x) { return fail('Erro: ' + (x.message || x)); }
}
/* Janela do bloco de comando (Usar) */
function openCmd(c) {
  var v = gget(c[0], c[1], c[2]), b = BLOCKS[cellBlock(v)], p = stateProps(b, cellOri(v)), i = idx(c[0], c[1], c[2]), e = rsCmdGet(i);
  var kind = RS_CMD_KIND[b.java], off = rsGameOff();
  openDialog('<h3>Bloco de comando</h3><p class="pen">Em ' + (c[0] + off[0]) + ', ' + (c[1] + off[1]) + ', ' + (c[2] + off[2]) + (wio && wio.area ? ' (coordenadas do jogo)' : ' (coordenadas do editor; com um mundo aberto, valem as do jogo)') + '.</p>' +
    '<label>Comando<input type="text" id="cmdT" maxlength="2000" spellcheck="false" placeholder="ex.: setblock ~ ~2 ~ gold_block"></label>' +
    '<div class="row"><label>Tipo<select id="cmdK"><option value="impulse">Impulso</option><option value="chain">Corrente</option><option value="repeat">Repetição</option></select></label>' +
    '<label>Condição<select id="cmdC"><option value="false">Incondicional</option><option value="true">Condicional</option></select></label>' +
    '<label>Redstone<select id="cmdA"><option value="false">Precisa de redstone</option><option value="true">Sempre ativo</option></select></label></div>' +
    '<p class="pen">Última saída: <b id="cmdOut"></b></p>' +
    '<p class="pen">Funcionam: <code>say</code>, <code>tellraw</code>, <code>title</code>, <code>setblock</code>, <code>fill</code>, <code>clone</code>, <code>testforblock</code>, <code>execute if/unless block … run …</code> e <code>time</code>. O comando vai junto para o .mcstructure e para o mundo do Bedrock.</p>' +
    '<div class="row"><button class="btn primary" id="cmdOk">Salvar</button><button class="btn" id="cmdRun">Rodar agora</button><button class="btn" id="cmdNo">Cancelar</button></div>', function () {
      $('cmdT').value = e.c; $('cmdK').value = kind; $('cmdC').value = p.conditional || 'false'; $('cmdA').value = String(!!e.auto);
      $('cmdOut').textContent = e.out || '—';
      $('cmdNo').onclick = closeDialog;
      var save = function () {
        e.c = $('cmdT').value.trim(); e.auto = $('cmdA').value === 'true'; e.dirty = true; rsCmdSave = true;
        var nk = $('cmdK').value, cond = $('cmdC').value, nj = { impulse: 'command_block', chain: 'chain_command_block', repeat: 'repeating_command_block' }[nk];
        var nb = BY_JAVA[nj], np = Object.assign({}, p, { conditional: cond });
        beginBatch('Bloco de comando'); editSet(c[0], c[1], c[2], mkCell(nb, stateIndex(BLOCKS[nb], np))); endBatch();
        if (wio && wio.area) wio.edited.add((c[0] >> 4) + ',' + (c[1] >> 4) + ',' + (c[2] >> 4));
        autosave();
        var cc = rsAt(c[0], c[1], c[2]);
        if (cc && rsOn && e.auto && nk !== 'chain') rsLater(1, 'cmd', cc);
      };
      $('cmdOk').onclick = function () { save(); closeDialog(); toast('Comando salvo.'); };
      $('cmdRun').onclick = function () { save(); var cc = rsAt(c[0], c[1], c[2]); if (!cc) return; rs.steps = 0; rsCmdRun(cc, 0); rsSettle(); requestRender(); updateStatus(); $('cmdOut').textContent = rsCmdGet(i).out || '—'; };
      $('cmdT').focus();
    });
}
var rsCmdSave = false;
function rsCmdRecord() { var o = []; rs.cmds.forEach(function (e, i) { if (e.c || e.auto) o.push([i, e.c, e.auto ? 1 : 0]); }); return o; }
function rsCmdFrom(a) { rs.cmds = new Map(); (a || []).forEach(function (r) { rs.cmds.set(r[0], { c: r[1] || '', auto: !!r[2], ok: 0, out: '' }); }); rsCmdSave = false; }
/* Exportação para o Bedrock: o bloco de entidade com o comando */
function rsCmdEnt(x, y, z, j) {
  var e = rs.cmds.get(idx(x, y, z)), mode = { command_block: 0, repeating_command_block: 1, chain_command_block: 2 }[j];
  return { id: 'CommandBlock', Command: { t: 'string', v: e ? e.c : '' }, CustomName: { t: 'string', v: '' }, auto: e && e.auto ? 1 : 0, powered: 0, conditionMet: 0,
    TrackOutput: 1, LastOutput: { t: 'string', v: '' }, LPCommandMode: { t: 'int', v: mode }, LPCondionalMode: 0, LPRedstoneMode: e && e.auto ? 0 : 1, TickDelay: { t: 'int', v: 0 },
    ExecuteOnFirstTick: 1, SuccessCount: { t: 'int', v: 0 }, Version: { t: 'int', v: 42 } };
}
/* Mundo do Bedrock aberto: os comandos dos blocos de comando da área (bloco de entidade CommandBlock) */
function rsCmdLoadWorld(list, ox, oy, oz) {
  (list || []).forEach(function (e) {
    var o = e.o; if (!o || o.id !== 'CommandBlock') return;
    var x = o.x - ox, y = o.y - oy, z = o.z - oz; if (!inB(x, y, z)) return;
    rs.cmds.set(idx(x, y, z), { c: String(o.Command || ''), auto: !!o.auto, ok: 0, out: '' });
  });
}

/* ---------- Pistão: o que fica sem apoio cai, e os fluidos voltam a escorrer ---------- */
var RS_FLOOR = /redstone_wire|^repeater$|^comparator$|rail$|pressure_plate$|_carpet$|^snow$|_sapling$|flower|^poppy$|^dandelion$|tulip$|^allium$|^azure_bluet$|^blue_orchid$|^oxeye_daisy$|^cornflower$|^lily_of_the_valley$|^wither_rose$|^short_grass$|^tall_grass$|^fern$|^large_fern$|^dead_bush$|mushroom$|^wheat$|^carrots$|^potatoes$|^beetroots$|^sugar_cane$|^cactus$|_door$|^redstone_torch$|^torch$|^soul_torch$|^copper_torch$|_sign$|_banner$|^candle$|_candle$|flower_pot|^lantern$|^soul_lantern$|_bush$|^pink_petals$|^leaf_litter$/;
var RS_WALL = /wall_torch$|_wall_sign$|_wall_banner$|^ladder$|^tripwire_hook$/;
/* Direção do apoio do bloco v em p (null = não precisa) */
function rsSupportDir(v) {
  var b = BLOCKS[cellBlock(v)], j = b.java; if (!b.shape) return null;
  var p = stateProps(b, cellOri(v));
  if (/_button$|^lever$/.test(j)) return p.face === 'floor' ? 'down' : p.face === 'ceiling' ? 'up' : OPP[p.facing];
  if (RS_WALL.test(j)) return OPP[p.facing];
  if (/lantern$/.test(j)) return p.hanging === 'true' ? 'up' : 'down';
  if (/_door$/.test(j)) return p.half === 'lower' ? 'down' : null;
  if (/_sign$/.test(j) && /hanging/.test(j)) return 'up';
  if (RS_FLOOR.test(j)) return 'down';
  return null;
}
/* moved: células de onde um bloco saiu (o que estava preso nele cai, mesmo que outro bloco entre no lugar) */
function rsPopAround(cells, moved) {
  var seen = new Set(), pop = [];
  cells.forEach(function (c) {
    for (var k = 0; k < 6; k++) {
      var d = RS_D6[k], n = rsN(c[0], c[1], c[2], d); if (!inB(n[0], n[1], n[2])) continue;
      var key = n.join(); if (seen.has(key)) continue; seen.add(key);
      var v = gget(n[0], n[1], n[2]); if (!v) continue;
      var sd = rsSupportDir(v); if (!sd) continue;
      var s = rsN(n[0], n[1], n[2], sd), sv = inB(s[0], s[1], s[2]) ? gget(s[0], s[1], s[2]) : 1;
      if (!sv || fluidType(sv) || (moved && moved.has(s.join()))) pop.push(n);
    }
  });
  pop.forEach(function (n) { if (gget(n[0], n[1], n[2])) { rsBreak(n[0], n[1], n[2]); rsVibe(n[0], n[1], n[2], 12); } });
  return pop.length;
}
function rsCmdDirtyAt(x, y, z) { var e = rs.cmds.get(idx(x, y, z)); return !!(e && e.dirty); }

/* ---------- Força do pó de redstone na tela ---------- */
/* Projeto → Força do pó: sim/não. Em cada pó, o número da força (0 a 15) deitado no bloco, virado para quem olha
   (gira de 90 em 90 graus com a câmera). Um InstancedMesh por número; refeito quando a construção muda (só os chunks
   que têm pó são percorridos) ou quando a câmera vira para outro lado. Respeita a Camada. */
var rsNum = { on: false, key: null, meshes: [], tex: [], q: 0 };
try { rsNum.on = localStorage.getItem('bloco-a-bloco-rsnum') === '1'; } catch (e) {}
function rsNumTex(n) {
  if (rsNum.tex[n]) return rsNum.tex[n];
  var c = document.createElement('canvas'); c.width = c.height = 64; var g = c.getContext('2d');
  g.font = 'bold ' + (n > 9 ? 40 : 46) + 'px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 8; g.strokeStyle = 'rgba(20,4,4,.95)'; g.strokeText(String(n), 32, 35);
  g.fillStyle = n ? 'rgb(255,' + Math.round(150 + n * 7) + ',' + Math.round(120 + n * 9) + ')' : '#b9b9b9'; g.fillText(String(n), 32, 35);
  var t = new THREE.CanvasTexture(c); t.minFilter = THREE.LinearFilter; t.anisotropy = 4;
  return (rsNum.tex[n] = t);
}
function rsNumClear() { rsNum.meshes.forEach(function (m) { scene.remove(m); m.geometry.dispose(); m.material.dispose(); }); rsNum.meshes = []; }
function updateRsNums() {
  if (!scene) return;
  var yaw = walk ? walk.yaw : cam.yaw, q = ((Math.round(yaw / (Math.PI / 2)) % 4) + 4) % 4;
  var key = rsNum.on ? verCounter + '|' + q + '|' + (layerOn ? layerY : -1) + '|' + SX : null;
  if (key === rsNum.key) return;
  rsNum.key = key; rsNumClear();
  if (!rsNum.on) return;
  var WI = BY_JAVA.redstone_wire, lists = []; for (var n = 0; n <= 15; n++) lists.push([]);
  var total = 0;
  W.forEach(function (ch) {
    var pal = ch.d ? ch.pal : [ch.u];
    if (!pal.some(function (v) { return v && cellBlock(v) === WI; })) return;
    var x0 = ch.cx << 4, y0 = ch.cy << 4, z0 = ch.cz << 4;
    for (var o = 0; o < 4096 && total < 60000; o++) {
      var v = ch.d ? ch.pal[ch.d[o]] : ch.u; if (!v || cellBlock(v) !== WI) continue;
      var y = y0 + (o >> 8); if (layerOn && y > layerY) continue;
      lists[+stateProps(BLOCKS[WI], cellOri(v)).power || 0].push(x0 + (o & 15), y, z0 + ((o >> 4) & 15)); total++;
    }
  });
  var d = new THREE.Object3D(); d.rotation.order = 'YXZ'; d.rotation.set(-Math.PI / 2, q * Math.PI / 2, 0);
  lists.forEach(function (L, n) {
    if (!L.length) return;
    var m = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.62, 0.62), new THREE.MeshBasicMaterial({ map: rsNumTex(n), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }), L.length / 3);
    for (var k = 0; k < L.length; k += 3) { d.position.set(L[k] + 0.5, L[k + 1] + 0.075, L[k + 2] + 0.5); d.updateMatrix(); m.setMatrixAt(k / 3, d.matrix); }
    m.instanceMatrix.needsUpdate = true; m.renderOrder = 7; m.frustumCulled = false;
    scene.add(m); rsNum.meshes.push(m);
  });
}
function setRsNums(on) {
  rsNum.on = on; try { localStorage.setItem('bloco-a-bloco-rsnum', on ? '1' : '0'); } catch (e) {}
  var b = $('rsNumBtn'); if (b) b.textContent = 'Força do pó de redstone: ' + (on ? 'sim' : 'não');
  rsNum.key = null; requestRender();
}
