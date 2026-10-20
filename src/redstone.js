/* ---------- Redstone funcionando ---------- */
/* Simulação no tempo do jogo: 20 tiques por segundo (um tique de redstone = 2 tiques). Segue as regras do Java/Bedrock
   para o que não depende de criaturas nem de itens:
   - Fontes: alavanca, botão (solta sozinho: 1 s o de pedra, 1,5 s o de madeira), placa de pressão (Usar aperta por 1 s;
     as de peso guardam a força escolhida), tocha, bloco de redstone, sensor de luz (pela hora do dia), observador.
   - Pó: força 15 na fonte, perde 1 por bloco; sobe e desce degraus (um bloco sólido em cima do degrau corta).
   - Blocos sólidos: "fortemente" energizados por alavanca/botão presos neles, tocha embaixo, repetidor ou comparador
     apontando para eles, placa em cima; isso energiza o pó em volta. O pó apontando para um bloco (ou em cima dele) o
     energiza "fracamente": liga lâmpadas, portas, pistões e repetidores ao lado, mas não outro pó.
   - Tocha: apaga quando o bloco que a segura está energizado (1 tique de redstone de atraso); queima se piscar 8
     vezes em 3 s, como no jogo, e volta depois.
   - Repetidor: atraso de 1 a 4 tiques de redstone, renova a força para 15; travado por outro repetidor ou comparador
     apontando para o lado dele.
   - Comparador: comparar (atrás >= lado: passa a força de trás) ou subtrair (atrás - lado). Não lê baús e afins.
   - Lâmpada (apaga com 2 tiques de atraso), portas, alçapões e portões (abrem e fecham quando o sinal muda; o que
     você abriu com Usar fica até o sinal mudar), trilhos energizados e ativadores (passam o sinal até 8 trilhos).
   - Pistão e pistão grudento: empurram até 12 blocos; obsidiana, rocha-mãe e afins não se movem; plantas, tochas, pó,
     portas e afins quebram. O grudento puxa o bloco da frente ao recolher. Sem quasi-conectividade (como no Bedrock).
     Blocos de slime e de mel levam junto os blocos encostados neles (nos 6 lados), que levam os da frente: tudo conta
     no limite de 12. Slime não gruda em mel (nem mel em slime) e terracota esmaltada não gruda em nenhum dos dois (e o
     grudento não a puxa); o que quebra ou não se move só fica para trás.
   - Comparador lendo blocos (atrás dele, ou atrás de um bloco sólido que está atrás dele): bolo, composteira,
     caldeirões, âncora de renascimento, colmeia, moldura do portal do End, atril, estante entalhada, e os contêineres
     (baú, barril, funil, fornalhas, ejetor, liberador, suporte de poções, caixa de shulker, toca-discos...) pelo
     "nível de conteúdo" de 0 a 15 que o usuário escolhe com Usar (o site não guarda itens).
   - Alvo: Usar acerta o alvo como uma flecha: força de 1 a 15 conforme a distância do centro da face clicada, por
     1 s (20 tiques). Lâmpada de cobre: troca acesa/apagada a cada vez que o sinal chega (não a cada vez que some);
     o comparador lê 15 com ela acesa. Bloco musical e sino: tocam quando o sinal chega (som no navegador; o
     instrumento do bloco musical vem do bloco embaixo, como no jogo). Funil: travado enquanto tem sinal.
   - Observador: um pulso de 1 tique de redstone pela parte de trás quando o bloco da frente muda.
   - Baú com armadilha: Usar abre e fecha (aberto = um jogador olhando: força 1, e forte no bloco de baixo). Atril:
     Usar com livro vira a página (pulso de 15 por 2 tiques de redstone). Toca-discos: com disco (nível de conteúdo
     acima de 0), força 15. Para-raios: Usar é um raio (15 por 8 tiques). Trilho detector: Usar põe ou tira um
     carrinho (com carrinho, 15, e forte no bloco de baixo). Gancho de armadilha: Usar na linha ou num gancho dispara a
     armadilha (dois ganchos virados um para o outro, só linha entre eles, até 40 blocos): os ganchos dão 15 por 10
     tiques, e forte no bloco em que estão presos. Sensor de luz: força pela hora do dia (a conta do jogo, com o céu
     aberto); Usar inverte (modo noite).
   Cada mudança feita pela simulação entra no mesmo passo de desfazer da ação que a causou (como a água). A avaliação
   é local: parte das células mudadas e percorre só a rede de redstone ligada a elas. */
var rsOn = true;
try { rsOn = localStorage.getItem('bloco-a-bloco-redstone') !== '0'; } catch (e) {}
var rs = { gt: 0, q: [], pend: new Map(), timer: 0, lv: null, cmp: new Map(), obs: new Map(), door: new Map(), burn: new Map(), touched: [], steps: 0, open: new Set(),
  trig: new Map(), skv: new Map(), skf: new Map(), cmds: new Map() }; // etapa 4 (src/redstone4.js): subida do sinal, vibrações, frequência, comandos
var RS_H = ['north', 'east', 'south', 'west'], RS_D6 = ['up', 'down', 'north', 'south', 'east', 'west'];
var rsKinds = [];
function rsKind(bi) {
  var k = rsKinds[bi]; if (k !== undefined) return k;
  var b = BLOCKS[bi], j = b.java;
  k = j === 'redstone_wire' ? 'wire' : j === 'lever' ? 'lever' : /_button$/.test(j) ? 'button'
    : /weighted_pressure_plate$/.test(j) ? 'wplate' : /_pressure_plate$/.test(j) ? 'plate'
    : j === 'redstone_torch' || j === 'redstone_wall_torch' ? 'torch' : j === 'redstone_block' ? 'rblock'
    : j === 'repeater' ? 'repeater' : j === 'comparator' ? 'comparator' : j === 'observer' ? 'observer'
    : j === 'redstone_lamp' ? 'lamp' : /_door$/.test(j) ? 'door' : /_trapdoor$/.test(j) ? 'trapdoor' : /_fence_gate$/.test(j) ? 'gate'
    : j === 'piston' || j === 'sticky_piston' ? 'piston' : j === 'piston_head' ? 'head'
    : j === 'powered_rail' || j === 'activator_rail' ? 'rail' : j === 'daylight_detector' ? 'day'
    : j === 'target' ? 'target' : j === 'note_block' ? 'note' : /copper_bulb$/.test(j) ? 'bulb' : j === 'bell' ? 'bell' : j === 'hopper' ? 'hopper'
    : j === 'trapped_chest' ? 'tchest' : j === 'lectern' ? 'lectern' : j === 'jukebox' ? 'juke' : j === 'lightning_rod' ? 'rod'
    : j === 'detector_rail' ? 'drail' : j === 'tripwire_hook' ? 'hook' : j === 'tripwire' ? 'trip'
    : j === 'sculk_sensor' || j === 'calibrated_sculk_sensor' ? 'sculk' : j === 'dispenser' || j === 'dropper' ? 'disp' : j === 'crafter' ? 'crafter'
    : /command_block$/.test(j) ? 'cmd'
    : (!b.shape || b.shape.fc) && b.solid && !b.isAir && !NOT_STURDY.test(j) ? 'solid' : null;
  rsKinds[bi] = k; return k;
}
function rsAt(x, y, z) {
  if (!inB(x, y, z)) return null;
  var v = gget(x, y, z); if (!v) return null;
  var bi = cellBlock(v), k = rsKind(bi); return k ? { v: v, bi: bi, b: BLOCKS[bi], k: k, x: x, y: y, z: z } : null;
}
function rsP(c) { return c.p || (c.p = c.b.shape ? stateProps(c.b, cellOri(c.v)) : c.k === 'observer' ? { facing: c.b.ori.o[cellOri(c.v)][0] } : {}); }
function rsN(x, y, z, d) { var v = DV[d]; return [x + v[0], y + v[1], z + v[2]]; }
function rsIdx(c) { return idx(c.x, c.y, c.z); }
function rsCond(x, y, z) { var c = rsAt(x, y, z); return !!c && (c.k === 'solid' || c.k === 'note' || c.k === 'bulb' || c.k === 'disp' || c.k === 'crafter' || c.k === 'cmd'); } // bloco musical, lâmpada de cobre, ejetor, liberador, fabricador e bloco de comando também conduzem
function rsAttach(c) { var p = rsP(c); return p.face === 'floor' ? 'down' : p.face === 'ceiling' ? 'up' : OPP[p.facing]; }
function rsTorchSup(c) { return c.b.java === 'redstone_torch' ? 'down' : OPP[rsP(c).facing]; }
function rsWireLv(c) { var i = rsIdx(c); return rs.lv && rs.lv.has(i) ? rs.lv.get(i) : +rsP(c).power || 0; }
function rsCmpLv(c) { var i = rsIdx(c); return rs.cmp.has(i) ? rs.cmp.get(i) : rsP(c).powered === 'true' ? 15 : 0; }
/* O pó aponta para o lado d? (as conexões calculadas pelos vizinhos; sem nenhuma, vira cruz e aponta para os 4) */
function rsWireSide(c, d) { var fp = fullProps(c.b, cellOri(c.v), c.x, c.y, c.z); return fp[d] && fp[d] !== 'none'; }
/* Força que a célula manda para a vizinha na direção d (os blocos sólidos são tratados por quem pergunta) */
function rsWeak(x, y, z, d) {
  var c = rsAt(x, y, z); if (!c) return 0;
  var p;
  switch (c.k) {
    case 'lever': case 'button': case 'plate': return rsP(c).powered === 'true' ? 15 : 0;
    case 'wplate': case 'day': case 'target': return +rsP(c).power || 0;
    case 'lectern': case 'rod': case 'drail': case 'hook': return rsP(c).powered === 'true' ? 15 : 0;
    case 'tchest': return rs.open.has(rsIdx(c)) ? 1 : 0;
    case 'juke': return rsFillGet(c.x, c.y, c.z) > 0 ? 15 : 0;
    case 'sculk': p = rsP(c); return c.b.java === 'calibrated_sculk_sensor' && d === OPP[p.facing] ? 0 : +p.power || 0;
    case 'torch': return rsP(c).lit === 'true' && d !== rsTorchSup(c) ? 15 : 0;
    case 'rblock': return 15;
    case 'repeater': p = rsP(c); return p.powered === 'true' && d === OPP[p.facing] ? 15 : 0;
    case 'comparator': return d === OPP[rsP(c).facing] ? rsCmpLv(c) : 0;
    case 'observer': return rs.obs.get(rsIdx(c)) && d === OPP[rsP(c).facing] ? 15 : 0;
    case 'wire': if (d === 'up') return 0; var l = rsWireLv(c); return l && (d === 'down' || rsWireSide(c, d)) ? l : 0;
  }
  return 0;
}
/* Força "forte" que a célula põe no bloco sólido vizinho na direção d (forWire: o pó perguntando, que não conta pó) */
function rsStrong(x, y, z, d, forWire) {
  var c = rsAt(x, y, z); if (!c) return 0;
  var p;
  switch (c.k) {
    case 'lever': case 'button': return rsP(c).powered === 'true' && d === rsAttach(c) ? 15 : 0;
    case 'plate': return d === 'down' && rsP(c).powered === 'true' ? 15 : 0;
    case 'wplate': return d === 'down' ? +rsP(c).power || 0 : 0;
    case 'lectern': case 'drail': return d === 'down' && rsP(c).powered === 'true' ? 15 : 0;
    case 'rod': case 'hook': return d === OPP[rsP(c).facing] && rsP(c).powered === 'true' ? 15 : 0;
    case 'tchest': return d === 'down' && rs.open.has(rsIdx(c)) ? 1 : 0;
    case 'sculk': return d === 'down' ? +rsP(c).power || 0 : 0;
    case 'torch': return d === 'up' && rsP(c).lit === 'true' ? 15 : 0;
    case 'repeater': p = rsP(c); return d === OPP[p.facing] && p.powered === 'true' ? 15 : 0;
    case 'comparator': return d === OPP[rsP(c).facing] ? rsCmpLv(c) : 0;
    case 'observer': return d === OPP[rsP(c).facing] && rs.obs.get(rsIdx(c)) ? 15 : 0;
    case 'wire': return forWire ? 0 : rsWeak(x, y, z, d);
  }
  return 0;
}
/* Energia de um bloco sólido: a maior força forte que chega nele */
function rsBlock(x, y, z, forWire) {
  var m = 0;
  for (var k = 0; k < 6; k++) { var d = RS_D6[k], n = rsN(x, y, z, d), s = rsStrong(n[0], n[1], n[2], OPP[d], forWire); if (s > m) m = s; }
  return m;
}
/* Força que chega numa posição (para lâmpada, porta, pistão...): das fontes vizinhas e dos blocos sólidos energizados */
function rsInput(x, y, z, skip) {
  var m = 0;
  for (var k = 0; k < 6; k++) {
    var d = RS_D6[k]; if (d === skip) continue;
    var n = rsN(x, y, z, d), s = rsCond(n[0], n[1], n[2]) ? rsBlock(n[0], n[1], n[2], false) : rsWeak(n[0], n[1], n[2], OPP[d]);
    if (s > m) m = s;
  }
  return m;
}
/* Entrada de trás do repetidor e do comparador (o pó entra com a força dele; o bloco sólido, com a energia dele) */
function rsBack(c) {
  var f = rsP(c).facing, n = rsN(c.x, c.y, c.z, f), nc = rsAt(n[0], n[1], n[2]);
  if (c.k === 'comparator') { // como no jogo: lê o bloco de trás; atrás de um bloco sólido sem sinal 15, lê o seguinte
    var r = rsRead(n[0], n[1], n[2]); if (r >= 0) return r;
    if (nc && nc.k === 'solid') {
      var sb = rsBlock(n[0], n[1], n[2], false);
      if (sb < 15) { var n2 = rsN(n[0], n[1], n[2], f), r2 = rsRead(n2[0], n2[1], n2[2]); if (r2 >= 0) return r2; }
      return sb;
    }
  }
  if (!nc) return 0;
  if (nc.k === 'solid') return rsBlock(n[0], n[1], n[2], false);
  if (nc.k === 'wire') return rsWireLv(nc);
  return rsWeak(n[0], n[1], n[2], OPP[f]);
}
/* Entradas dos lados: só pó, repetidor, comparador e bloco de redstone (lock = só repetidor e comparador) */
function rsSide(c, lockOnly) {
  var f = rsP(c).facing, m = 0;
  [CW[f], CCW[f]].forEach(function (s) {
    var n = rsN(c.x, c.y, c.z, s), nc = rsAt(n[0], n[1], n[2]); if (!nc) return;
    var gate = nc.k === 'repeater' || nc.k === 'comparator';
    if (lockOnly ? !gate : !(gate || nc.k === 'wire' || nc.k === 'rblock')) return;
    var v = rsWeak(n[0], n[1], n[2], OPP[s]); if (v > m) m = v;
  });
  return m;
}
function rsCmpOut(c) { var b = rsBack(c), s = rsSide(c, false); return rsP(c).mode === 'subtract' ? Math.max(0, b - s) : b >= s ? b : 0; }

/* ---------- Blocos que o comparador lê ---------- */
var RS_CONT = /^(chest|trapped_chest|barrel|hopper|dropper|dispenser|furnace|blast_furnace|smoker|brewing_stand|crafter|jukebox|decorated_pot|(\w+_)?shulker_box|(waxed_)?((exposed|weathered|oxidized)_)?copper_chest)$/;
/* Nível de conteúdo dos contêineres (o site não guarda itens): índice da célula -> 1..15. Entra no histórico com índice
   -(RS_FILL_BASE + célula), salva no projeto (fill) e no navegador (w:fill). */
var rsFill = new Map(), rsFillSave = false, RS_FILL_BASE = 1125899906842624; // 2^50
function rsFillGet(x, y, z) { return rsFill.get(idx(x, y, z)) || 0; }
function rsFillSet(i, lv, log) {
  var old = rsFill.get(i) || 0; if (old === lv) return;
  if (lv) rsFill.set(i, lv); else rsFill.delete(i);
  rsFillSave = true;
  if (log && batch) batch.add(-(RS_FILL_BASE + i), old, lv);
}
function rsFillApplyLog(i, val) { rsFillSet(-i - RS_FILL_BASE, val, false); }
function rsFillRecord() { return Array.from(rsFill); }
function rsFillFrom(a) { rsFill = new Map(a || []); rsFillSave = false; }
/* Sinal que o comparador tira do bloco (-1 = o bloco não tem leitura) */
function rsRead(x, y, z) {
  if (!inB(x, y, z)) return -1;
  var v = gget(x, y, z); if (!v) return -1;
  var bi = cellBlock(v), b = BLOCKS[bi], j = b.java; if (bi === PRES_BI) return -1;
  if (RS_CONT.test(j)) return rsLevel(x, y, z, j); // itens (src/redstone4.js)
  var p = b.shape ? stateProps(b, cellOri(v)) : {};
  switch (j) {
    case 'sculk_sensor': case 'calibrated_sculk_sensor': return p.sculk_sensor_phase === 'active' ? rs.skf.get(idx(x, y, z)) || 0 : 0; // frequência da última vibração
    case 'command_block': case 'chain_command_block': case 'repeating_command_block': { var ce = rs.cmds.get(idx(x, y, z)); return ce ? Math.min(15, ce.ok) : 0; }
    case 'cake': return (7 - (+p.bites || 0)) * 2;
    case 'composter': return +p.level || 0;
    case 'cauldron': return 0;
    case 'water_cauldron': case 'powder_snow_cauldron': return +p.level || 0;
    case 'lava_cauldron': return 3;
    case 'copper_bulb': case 'exposed_copper_bulb': case 'weathered_copper_bulb': case 'oxidized_copper_bulb': case 'waxed_copper_bulb': case 'waxed_exposed_copper_bulb': case 'waxed_weathered_copper_bulb': case 'waxed_oxidized_copper_bulb': return p.lit === 'true' ? 15 : 0;
    case 'respawn_anchor': return Math.floor((+p.charges || 0) * 15 / 4);
    case 'beehive': case 'bee_nest': return +p.honey_level || 0;
    case 'end_portal_frame': return p.eye === 'true' ? 15 : 0;
    case 'lectern': return p.has_book === 'true' ? 1 : 0; // livro aberto na primeira página
    case 'chiseled_bookshelf': return rsBookLast(x, y, z, p);
    case 'frame': case 'glow_frame': return 0; // moldura sem item
  }
  return -1;
}
/* Estante entalhada: o comparador dá o número do último nicho mexido (1 a 6); sem essa memória, o do último livro */
var rsBook = new Map();
function rsBookLast(x, y, z, p) {
  var m = rsBook.get(idx(x, y, z)); if (m) return m;
  for (var i = 5; i >= 0; i--) if (p['slot_' + i + '_occupied'] === 'true') return i + 1;
  return 0;
}
/* Slime e mel: grudam nos blocos encostados (menos um no outro e na terracota esmaltada) */
function rsSticky(j) { return j === 'slime_block' || j === 'honey_block'; }
function rsSticks(a, bj) {
  if (/glazed_terracotta$/.test(bj)) return false;
  if ((a === 'slime_block' && bj === 'honey_block') || (a === 'honey_block' && bj === 'slime_block')) return false;
  return true;
}

/* ---------- Mudanças e agenda ---------- */
function rsSet(x, y, z, v) {
  var old = gget(x, y, z); if (old === v) return;
  setRaw(x, y, z, v);
  rsLogCell(x, y, z, old, v); // gráfico do passo a passo (src/rsstep.js)
  var vf = rsVibeFreq(old, v, true); if (vf) rsVibe(x, y, z, vf); // sensor de sculk (src/redstone4.js)
  if (flowOn) fluidTouch(x, y, z); // a água e a lava em volta voltam a escorrer
  // entra no passo de desfazer da ação que causou; um relógio ligado para sempre não enche o histórico: depois de
  // 5.000 mudanças na mesma ação, as próximas não são guardadas para desfazer
  var top = histTop(); if (top && (top.rsN = (top.rsN || 0) + 1) <= 5000) top.add(idx(x, y, z), old, v);
  rs.touched.push([x, y, z]); rs.steps++;
  rsSeen(x, y, z);
}
function rsProp(c, o) { var p = Object.assign({}, rsP(c), o); rsSet(c.x, c.y, c.z, mkCell(c.bi, stateIndex(c.b, p))); }
/* Observadores olhando para a célula que mudou: pulso daqui a 1 tique de redstone */
function rsSeen(x, y, z) {
  for (var k = 0; k < 6; k++) {
    var d = RS_D6[k], n = rsN(x, y, z, d), c = rsAt(n[0], n[1], n[2]);
    if (c && c.k === 'observer' && rsP(c).facing === OPP[d] && !rs.obs.get(rsIdx(c))) rsLater(2, 'obsOn', c);
  }
}
function rsLater(dt, type, c) {
  var key = type + rsIdx(c); if (rs.pend.has(key)) return;
  rs.pend.set(key, 1); rs.q.push({ t: rs.gt + dt, type: type, p: [c.x, c.y, c.z], key: key });
  if (!rs.timer && !rs.paused) rs.timer = setInterval(rsTick, 50); // pausada (passo a passo): só avança nos cliques
}
function rsStop() { rs.q = []; rs.pend.clear(); clearInterval(rs.timer); rs.timer = 0; rs.touched = []; rs.skv.clear(); if (rsFx.length) rsFxClear(); }
function rsReset() { if (rsLog.on) rsLogClear(); rsStop(); rs.cmp.clear(); rs.obs.clear(); rs.door.clear(); rs.burn.clear(); rsFill.clear(); rsFillSave = true; rsBook.clear(); rs.open.clear(); rs.trig.clear(); rs.skf.clear(); rs.cmds.clear(); rsCmdSave = true; }
function rsTick() {
  rs.gt++; rs.tickAt = performance.now();
  var due = rs.q.filter(function (e) { return e.t <= rs.gt; });
  if (due.length) rs.q = rs.q.filter(function (e) { return e.t > rs.gt; });
  rs.steps = 0;
  due.forEach(function (e) { rs.pend.delete(e.key); rsRun(e); });
  if (rs.touched.length) rsSettle();
  if (rs.steps) { requestRender(); updateStatus(); if (!rs.save) rs.save = setTimeout(function () { rs.save = 0; autosave(); }, 1500); }
  if (!rs.q.length) { clearInterval(rs.timer); rs.timer = 0; }
  if (rsLog.on) { rsPanelUI(); rsLogDraw(); }
}
function rsRun(e) {
  var c = rsAt(e.p[0], e.p[1], e.p[2]), i = idx(e.p[0], e.p[1], e.p[2]);
  // o pulso do observador também é uma mudança de estado: outro observador olhando para ele vê (relógio de observadores)
  if (e.type === 'obsOn') { if (c && c.k === 'observer') { rs.obs.set(i, true); rsLogObs(c, true); rs.touched.push(e.p); rsLater(2, 'obsOff', c); rsSeen(e.p[0], e.p[1], e.p[2]); } return; }
  if (e.type === 'obsOff') { if (rs.obs.delete(i)) { if (c && c.k === 'observer') rsLogObs(c, false); rs.touched.push(e.p); rsSeen(e.p[0], e.p[1], e.p[2]); } return; }
  if (!c) return;
  var p = rsP(c);
  switch (e.type) {
    case 'lamp': if (c.k === 'lamp' && p.lit === 'true' && !rsInput(c.x, c.y, c.z)) rsProp(c, { lit: 'false' }); break;
    case 'torch': if (c.k === 'torch') { var want = rsTorchWant(c, i); if ((p.lit === 'true') !== want) { if (!want) rsBurnCount(i); rsProp(c, { lit: String(want) }); } } break;
    case 'rep': if (c.k === 'repeater' && !rsSide(c, true)) { var on = rsBack(c) > 0; if ((p.powered === 'true') !== on) rsProp(c, { powered: String(on) }); } break;
    case 'cmp':
      if (c.k === 'comparator') {
        var out = rsCmpOut(c), was = rsCmpLv(c); rs.cmp.set(i, out);
        if ((p.powered === 'true') !== out > 0) rsProp(c, { powered: String(out > 0) });
        else if (out !== was) rs.touched.push(e.p);
        if (out !== was) rsLogCmp(c, out, was);
      }
      break;
    case 'release':
      if ((c.k === 'button' || c.k === 'plate') && p.powered === 'true') {
        if (projHolding(c.x, c.y, c.z)) rsLater(c.k === 'button' ? 30 : 20, 'release', c); // flecha cravada nele (src/projectiles.js): continua
        else rsProp(c, { powered: 'false' });
      }
      break;
    case 'targetOff': if (c.k === 'target' && +p.power) rsProp(c, { power: '0' }); break;
    case 'pageOff': if (c.k === 'lectern' && p.powered === 'true') rsProp(c, { powered: 'false' }); break;
    case 'rodOff': if (c.k === 'rod' && p.powered === 'true') rsProp(c, { powered: 'false' }); break;
    case 'tripOff': if (c.k === 'hook') { var ln = rsTripLine(c); (ln ? ln.all : [c]).forEach(function (t) { if (rsP(t).powered === 'true') rsProp(t, { powered: 'false' }); }); } break;
    case 'piston': if (c.k === 'piston') rsPiston(c); break;
    case 'fire': if (c.k === 'disp' || c.k === 'crafter') rsFire(c); break;
    case 'hop': if (c.k === 'hopper') rsHop(c); break;
    case 'vib': if (c.k === 'sculk') rsVibArrive(c); break;
    case 'skOff': if (c.k === 'sculk' && p.sculk_sensor_phase === 'active') { rsProp(c, { sculk_sensor_phase: 'cooldown', power: '0' }); rsLater(10, 'skCool', c); } break;
    case 'skCool': if (c.k === 'sculk' && p.sculk_sensor_phase === 'cooldown') rsProp(c, { sculk_sensor_phase: 'inactive' }); break;
    case 'cmd': if (c.k === 'cmd') rsCmdTick(c); break;
  }
}
/* Tocha: acesa se o bloco que a segura não está energizado; queimada não acende */
function rsTorchWant(c, i) {
  var bt = rs.burn.get(i); if (bt && bt.until > rs.gt) { rsLater(bt.until - rs.gt, 'torch', c); return false; }
  var s = rsN(c.x, c.y, c.z, rsTorchSup(c));
  return !(rsCond(s[0], s[1], s[2]) && rsBlock(s[0], s[1], s[2], false) > 0);
}
function rsBurnCount(i) {
  var bt = rs.burn.get(i) || { t: [], until: 0 };
  bt.t = bt.t.filter(function (t) { return t > rs.gt - 60; }); bt.t.push(rs.gt);
  if (bt.t.length >= 8) { bt.until = rs.gt + 160; bt.t = []; }
  rs.burn.set(i, bt);
}

/* ---------- Avaliação ---------- */
/* Rede ligada às células mudadas: componentes de redstone e os blocos sólidos encostados neles */
function rsNetwork(seeds) {
  var comps = [], seen = new Set(), solidSeen = new Set(), st = [];
  var push = function (x, y, z, via) { if (inB(x, y, z)) st.push(x, y, z, via); };
  var around = function (x, y, z, via, diag) {
    for (var k = 0; k < 6; k++) { var v = DV[RS_D6[k]]; push(x + v[0], y + v[1], z + v[2], via); }
    if (diag) for (var h = 0; h < 4; h++) { var w = DV[RS_H[h]]; push(x + w[0], y + 1, z + w[2], via); push(x + w[0], y - 1, z + w[2], via); }
  };
  seeds.forEach(function (p) { push(p[0], p[1], p[2], 1); around(p[0], p[1], p[2], 1, true); });
  while (st.length && comps.length < 40000) {
    var via = st.pop(), z = st.pop(), y = st.pop(), x = st.pop(), i = idx(x, y, z);
    var c = rsAt(x, y, z); if (!c) continue;
    if (c.k === 'solid') { if (!via || solidSeen.has(i)) continue; solidSeen.add(i); around(x, y, z, 0, false); continue; }
    if (seen.has(i)) continue; seen.add(i); comps.push(c);
    around(x, y, z, 1, c.k === 'wire');
    if (c.k === 'door') { var o = rsP(c).half === 'lower' ? 1 : -1; push(x, y + o, z, 1); }
  }
  return comps;
}
/* Ligações de um pó com os vizinhos (mesmo nível, degrau acima sem bloco sólido em cima, degrau abaixo sem bloco no caminho) */
function rsWireLinks(c) {
  var out = [], x = c.x, y = c.y, z = c.z, upFree = !rsCond(x, y + 1, z);
  for (var h = 0; h < 4; h++) {
    var w = DV[RS_H[h]], ax = x + w[0], az = z + w[2], n;
    if ((n = rsAt(ax, y, az)) && n.k === 'wire') out.push(n);
    if (upFree && (n = rsAt(ax, y + 1, az)) && n.k === 'wire') out.push(n);
    if (!rsCond(ax, y, az) && (n = rsAt(ax, y - 1, az)) && n.k === 'wire') out.push(n);
  }
  return out;
}
function rsEval(seeds) {
  var comps = rsNetwork(seeds); if (!comps.length) return;
  // 1. força do pó: a maior força que chega direto (fontes vizinhas e blocos fortemente energizados), menos 1 por pó
  var wires = comps.filter(function (c) { return c.k === 'wire'; }), lv = new Map(), byI = new Map(), bucket = [];
  for (var l = 0; l <= 15; l++) bucket.push([]);
  wires.forEach(function (c) {
    var i = rsIdx(c), m = 0; byI.set(i, c);
    for (var k = 0; k < 6; k++) {
      var d = RS_D6[k], n = rsN(c.x, c.y, c.z, d), nc = rsAt(n[0], n[1], n[2]); if (!nc || nc.k === 'wire') continue;
      var s = nc.k === 'solid' ? rsBlock(n[0], n[1], n[2], true) : rsWeak(n[0], n[1], n[2], OPP[d]); if (s > m) m = s;
    }
    lv.set(i, m); if (m) bucket[m].push(c);
  });
  for (var L = 15; L > 1; L--) bucket[L].forEach(function (c) {
    if (lv.get(rsIdx(c)) !== L) return;
    rsWireLinks(c).forEach(function (n) { var j = rsIdx(n); if (!byI.has(j)) return; if (lv.get(j) < L - 1) { lv.set(j, L - 1); bucket[L - 1].push(n); } });
  });
  rs.lv = lv;
  try {
    wires.forEach(function (c) { var want = lv.get(rsIdx(c)); if ((+rsP(c).power || 0) !== want) rsProp(c, { power: String(want) }); });
    var rails = [];
    comps.forEach(function (c) {
      var p = rsP(c), i = rsIdx(c), pw;
      switch (c.k) {
        case 'lamp':
          pw = rsInput(c.x, c.y, c.z) > 0;
          if (pw && p.lit !== 'true') rsProp(c, { lit: 'true' }); else if (!pw && p.lit === 'true') rsLater(4, 'lamp', c);
          break;
        case 'torch': if ((p.lit === 'true') !== rsTorchWant(c, i)) rsLater(2, 'torch', c); break;
        case 'repeater': {
          var lk = rsSide(c, true) > 0;
          if ((p.locked === 'true') !== lk) rsProp(c, { locked: String(lk) });
          if (!lk && (rsBack(c) > 0) !== (p.powered === 'true')) rsLater(2 * (+p.delay || 1), 'rep', c);
          break;
        }
        case 'comparator': if (rsCmpOut(c) !== rsCmpLv(c)) rsLater(2, 'cmp', c); break;
        case 'button': if (p.powered === 'true') rsLater(/stone/.test(c.b.java) ? 20 : 30, 'release', c); break;
        case 'plate': if (p.powered === 'true') rsLater(20, 'release', c); break;
        case 'door': case 'trapdoor': case 'gate': rsOpenable(c, i); break;
        case 'piston': {
          var ext = p.extended === 'true', want = rsInput(c.x, c.y, c.z, p.facing) > 0, f = rsN(c.x, c.y, c.z, p.facing), h = rsAt(f[0], f[1], f[2]);
          if (ext && !(h && h.k === 'head')) { rsProp(c, { extended: 'false' }); break; } // a cabeça foi apagada
          if (want !== ext) rsLater(2, 'piston', c);
          break;
        }
        case 'head': {
          var bp = rsN(c.x, c.y, c.z, OPP[p.facing]), base = rsAt(bp[0], bp[1], bp[2]);
          if (!(base && base.k === 'piston' && rsP(base).facing === p.facing && rsP(base).extended === 'true')) rsSet(c.x, c.y, c.z, 0); // sem a base
          break;
        }
        case 'rail': rails.push(c); break;
        case 'bulb': case 'note': case 'bell': {
          pw = rsInput(c.x, c.y, c.z) > 0;
          if (pw && p.powered !== 'true') {
            var o2 = { powered: 'true' }; if (c.k === 'bulb') o2.lit = p.lit === 'true' ? 'false' : 'true';
            rsProp(c, o2);
            if (c.k === 'note') rsPlayNote(c.x, c.y, c.z, +p.note || 0); else if (c.k === 'bell') rsPlayBell();
          } else if (!pw && p.powered === 'true') rsProp(c, { powered: 'false' });
          break;
        }
        case 'hopper': { var lk = rsInput(c.x, c.y, c.z) > 0; if ((p.enabled === 'false') !== lk) { rsProp(c, { enabled: String(!lk) }); if (!lk) rsLater(8, 'hop', c); } break; }
        case 'disp': case 'crafter': rsTrigEval(c); break;
        case 'cmd': rsCmdEval(c); break;
        case 'sculk': if (p.sculk_sensor_phase && p.sculk_sensor_phase !== 'inactive' && !rs.pend.has('skOff' + i) && !rs.pend.has('skCool' + i)) rsLater(p.sculk_sensor_phase === 'active' ? 30 : 10, p.sculk_sensor_phase === 'active' ? 'skOff' : 'skCool', c); break; // ficou ligado num projeto salvo
        case 'day': { var dp = rsDayPow(p.inverted === 'true'); if ((+p.power || 0) !== dp) rsProp(c, { power: String(dp) }); break; }
      }
    });
    if (rails.length) rsRails(rails);
  } finally { rs.lv = null; }
}
/* Porta, alçapão e portão: abrem ou fecham quando a energia muda (a porta conta as duas metades) */
function rsOpenable(c, i) {
  var p = rsP(c), pw;
  if (c.k === 'door') {
    if (p.half !== 'lower') return;
    pw = rsInput(c.x, c.y, c.z) > 0 || rsInput(c.x, c.y + 1, c.z) > 0;
  } else pw = rsInput(c.x, c.y, c.z) > 0;
  // memória do último sinal; sem memória (página recarregada), vale o estado atual: aberta conta como sinal ligado
  var last = rs.door.get(i); if (last === undefined) last = p.open === 'true'; rs.door.set(i, pw);
  if (last === pw || (p.open === 'true') === pw) return;
  rsProp(c, { open: String(pw) });
  if (c.k === 'door') { var u = rsAt(c.x, c.y + 1, c.z); if (u && u.bi === c.bi) rsProp(u, { open: String(pw) }); }
}
/* Trilhos energizados e ativadores: energia direta, e passam adiante até 8 trilhos do mesmo tipo em linha */
function rsRails(rails) {
  var on = new Map(), st = [];
  var links = function (c) {
    var s = rsP(c).shape || 'north_south', ax = /east|west/.test(s) ? ['east', 'west'] : ['north', 'south'], out = [];
    ax.forEach(function (d) { for (var dy = -1; dy <= 1; dy++) { var n = rsN(c.x, c.y + dy, c.z, d), nc = rsAt(n[0], n[1], n[2]); if (nc && nc.bi === c.bi) out.push(nc); } });
    return out;
  };
  rails.forEach(function (c) { if (rsInput(c.x, c.y, c.z) > 0) { on.set(rsIdx(c), 0); st.push(c); } });
  while (st.length) {
    var c = st.shift(), d = on.get(rsIdx(c)); if (d >= 8) continue;
    links(c).forEach(function (n) { var j = rsIdx(n); if (!on.has(j)) { on.set(j, d + 1); st.push(n); } });
  }
  rails.forEach(function (c) { var want = on.has(rsIdx(c)); if ((rsP(c).powered === 'true') !== want) rsProp(c, { powered: String(want) }); });
}
/* Pistão: estende empurrando até 12 blocos, ou recolhe (o grudento puxa o bloco da frente) */
var RS_FIXED = /^(obsidian|crying_obsidian|bedrock|barrier|reinforced_deepslate|end_portal_frame|end_portal|end_gateway|nether_portal|command_block|chain_command_block|repeating_command_block|structure_block|jigsaw|respawn_anchor|enchanting_table|ender_chest|beacon|spawner|trial_spawner|vault|piston_head|moving_piston|light)$/;
var RS_BREAKS = /torch|redstone_wire|_button$|^lever$|pressure_plate$|_door$|_bed$|ladder|vine|_carpet$|scaffolding|^snow$|cake|flower_pot|_head$|_skull$|lantern|candle|_sign$|banner|^repeater$|^comparator$|tripwire|cobweb|lily_pad|sea_pickle|dragon_egg|coral|pointed_dripstone|amethyst_bud|amethyst_cluster|^water$|^lava$|bubble_column/;
function rsMove(v) {
  if (!v) return 'empty';
  var bi = cellBlock(v), b = BLOCKS[bi];
  if (bi === PRES_BI || RS_FIXED.test(b.java)) return 'fixed';
  if (rsKind(bi) === 'piston' && stateProps(b, cellOri(v)).extended === 'true') return 'fixed';
  if (b.cat === 'plantas' || RS_BREAKS.test(b.java)) return 'breaks';
  return 'moves';
}
function rsBreak(x, y, z) {
  var v = gget(x, y, z), b = BLOCKS[cellBlock(v)], pa = partnerOf(b, cellOri(v), x, y, z);
  rsSet(x, y, z, 0);
  if (pa && inB(pa.x, pa.y, pa.z) && cellBlock(gget(pa.x, pa.y, pa.z)) === cellBlock(v)) rsSet(pa.x, pa.y, pa.z, 0);
}
/* Blocos que se movem juntos a partir de 'start' na direção dir: o bloco, a fila à frente dele e, nos blocos de slime e
   de mel, os encostados nos outros 5 lados (que levam a fila deles). Devolve { move, brk } ou null (bloco fixo na
   frente, mais de 12 blocos ou a borda do espaço). */
function rsStruct(start, dir, piston, pulling) {
  var v = DV[dir], K = function (p) { return p[0] + ',' + p[1] + ',' + p[2]; }, pk = K(piston);
  var move = [], mset = new Set(), brk = [], bset = new Set(), q = [[start, 'push', null]];
  if (pulling) { var sv = inB(start[0], start[1], start[2]) ? gget(start[0], start[1], start[2]) : 0; if (!sv || rsMove(sv) !== 'moves' || /glazed_terracotta$/.test(BLOCKS[cellBlock(sv)].java)) return { move: [], brk: [] }; }
  while (q.length) {
    var e = q.shift(), p = e[0], how = e[1], k = K(p);
    if (mset.has(k) || k === pk) continue;
    if (!inB(p[0], p[1], p[2])) { if (how === 'push') return null; continue; }
    var cv = gget(p[0], p[1], p[2]), m = rsMove(cv), j = cv ? BLOCKS[cellBlock(cv)].java : '';
    if (how === 'attach') { if (m !== 'moves' || !rsSticks(e[2], j)) continue; }
    else {
      if (m === 'empty') continue;
      if (m === 'fixed') return null;
      if (m === 'breaks') { if (!bset.has(k)) { bset.add(k); brk.push(p); } continue; }
    }
    mset.add(k); move.push(p); if (move.length > 12) return null;
    q.push([[p[0] + v[0], p[1] + v[1], p[2] + v[2]], 'push', null]);
    if (rsSticky(j)) for (var d = 0; d < 6; d++) { var dd = RS_D6[d]; if (dd === dir) continue; var w = DV[dd]; q.push([[p[0] + w[0], p[1] + w[1], p[2] + w[2]], 'attach', j]); }
  }
  // quebra o que estiver no caminho de um bloco que se move (e não o que ele deixa para trás)
  brk = brk.filter(function (p) { return !mset.has(K(p)); });
  return { move: move, brk: brk };
}
function rsMoveStruct(S, dir) {
  var v = DV[dir], vals = S.move.map(function (p) { return gget(p[0], p[1], p[2]); }), fills = S.move.map(function (p) { return rsFill.get(idx(p[0], p[1], p[2])) || 0; });
  S.brk.forEach(function (p) { rsBreak(p[0], p[1], p[2]); });
  var top = histTop();
  S.move.forEach(function (p, i) { if (rs.movedFrom) rs.movedFrom.add(p.join()); rsSet(p[0], p[1], p[2], 0); if (fills[i]) { var fi = idx(p[0], p[1], p[2]); rsFill.delete(fi); if (top) top.add(-(RS_FILL_BASE + fi), fills[i], 0); } });
  S.move.forEach(function (p, i) {
    var n = [p[0] + v[0], p[1] + v[1], p[2] + v[2]]; rsSet(n[0], n[1], n[2], vals[i]);
    if (fills[i]) { var ni = idx(n[0], n[1], n[2]), o = rsFill.get(ni) || 0; rsFill.set(ni, fills[i]); if (top) top.add(-(RS_FILL_BASE + ni), o, fills[i]); }
  });
  if (fills.some(Boolean)) rsFillSave = true;
}
function rsPiston(c) {
  var mark = rs.touched.length; rs.movedFrom = new Set();
  rsPiston1(c);
  rsPopAround(rs.touched.slice(mark), rs.movedFrom); rs.movedFrom = null; // o que ficou sem apoio cai (src/redstone4.js)
}
function rsPiston1(c) {
  var p = rsP(c), f = p.facing, ext = p.extended === 'true', want = rsInput(c.x, c.y, c.z, f) > 0, sticky = c.b.java === 'sticky_piston';
  var v = DV[f], front = [c.x + v[0], c.y + v[1], c.z + v[2]], me = [c.x, c.y, c.z];
  if (want && !ext) {
    if (!inB(front[0], front[1], front[2])) return;
    var S = rsStruct(front, f, me, false); if (!S) return;
    rsMoveStruct(S, f);
    var hb = BY_JAVA.piston_head, H = BLOCKS[hb];
    rsSet(front[0], front[1], front[2], mkCell(hb, stateIndex(H, { facing: f, type: sticky ? 'sticky' : 'normal' })));
    rsProp(c, { extended: 'true' });
  } else if (!want && ext) {
    var h = rsAt(front[0], front[1], front[2]);
    if (h && h.k === 'head') {
      rsSet(front[0], front[1], front[2], 0);
      if (sticky) { var S2 = rsStruct([front[0] + v[0], front[1] + v[1], front[2] + v[2]], OPP[f], me, true); if (S2 && S2.move.length) rsMoveStruct(S2, OPP[f]); }
    }
    rsProp(c, { extended: 'false' });
  }
}
/* Avalia a partir das células mudadas até parar de mudar na hora (o que tem atraso fica na agenda) */
function rsSettle() {
  for (var n = 0; n < 24 && rs.touched.length; n++) {
    var seeds = rs.touched; rs.touched = [];
    rsEval(seeds);
  }
  rs.touched = [];
}
/* Depois de cada edição do usuário (chamado por endBatch) */
function rsAfterBatch(b) {
  if (!rsOn || !b || !b.length) return;
  if (b.length > 20000 && !rsAny()) return; // edição enorme sem nenhuma redstone no mundo: nada a fazer
  rs.steps = 0;
  var seeds = [];
  for (var k = 0; k < b.length && seeds.length < 200000; k++) {
    var bi0 = b.i[k];
    if (bi0 <= -RS_FILL_BASE) { var fp0 = unidx(-bi0 - RS_FILL_BASE); seeds.push(fp0); rsInvChanged(fp0); continue; } // nível de conteúdo mudou (funis em volta)
    if (bi0 < 0) continue;
    var p = unidx(bi0); seeds.push(p); rsSeen(p[0], p[1], p[2]);
    if (b.length <= 4096) { var vf = rsVibeFreq(b.o[k], b.v[k], false); if (vf) rsVibe(p[0], p[1], p[2], vf); } // sensor de sculk ouvindo a edição
    if (rsLog.on) rsLogCell(p[0], p[1], p[2], b.o[k], b.v[k]); // gráfico do passo a passo: a mudança do usuário
    var cv0 = gat(bi0); if (rsFill.has(bi0) && (!cv0 || !RS_CONT.test(BLOCKS[cellBlock(cv0)].java))) { rsFill.delete(bi0); rsFillSave = true; } // o contêiner saiu dali
  }
  rs.touched = seeds.concat(rs.touched);
  rsSettle();
  if (rs.steps) { requestRender(); updateStatus(); }
}
function rsAny() {
  var found = false;
  W.forEach(function (ch) { if (found) return; var pal = ch.d ? ch.pal : [ch.u]; for (var i = 0; i < pal.length; i++) { var k = pal[i] && rsKind(cellBlock(pal[i])); if (k && k !== 'solid') { found = true; return; } } });
  return found;
}
function setRedstone(on) {
  rsOn = on; try { localStorage.setItem('bloco-a-bloco-redstone', on ? '1' : '0'); } catch (e) {}
  if (!on) rsStop();
  $('rsBtn').textContent = 'Redstone funcionando: ' + (on ? 'sim' : 'não');
}

/* ---------- Baú com armadilha, atril, para-raios, trilho detector, armadilha de linha ---------- */
/* Mudança que não é de bloco (baú aberto): reavalia a rede em volta */
function rsPoke(x, y, z) {
  if (!rsOn) return;
  rs.steps = 0; rs.touched.push([x, y, z]); rsSettle();
  if (rs.steps) { requestRender(); updateStatus(); }
}
function rsToggleChest(c) {
  var i = idx(c[0], c[1], c[2]), op = !rs.open.has(i);
  if (op) rs.open.add(i); else rs.open.delete(i);
  rsPoke(c[0], c[1], c[2]);
  return op;
}
/* Linha de armadilha a partir de um gancho: só linha até outro gancho virado para ele (até 40 blocos no meio) */
function rsTripLine(h) {
  var f = rsP(h).facing, wires = [];
  for (var n = 1; n <= 41; n++) {
    var v = DV[f], c = rsAt(h.x + v[0] * n, h.y, h.z + v[2] * n);
    if (c && c.k === 'trip') { wires.push(c); continue; }
    if (c && c.k === 'hook' && rsP(c).facing === OPP[f] && wires.length) return { hooks: [h, c], wires: wires, all: [h, c].concat(wires) };
    return null;
  }
  return null;
}
/* Usar numa linha ou num gancho: acha a linha inteira */
function rsTripFind(x, y, z) {
  var c = rsAt(x, y, z); if (!c) return null;
  if (c.k === 'hook') return rsTripLine(c);
  if (c.k !== 'trip') return null;
  for (var h = 0; h < 4; h++) {
    var d = RS_H[h], v = DV[d], n = 1, e;
    while ((e = rsAt(x + v[0] * n, y, z + v[2] * n)) && e.k === 'trip' && n < 42) n++;
    if (e && e.k === 'hook' && rsP(e).facing === OPP[d]) { var ln = rsTripLine(e); if (ln && ln.wires.some(function (w) { return w.x === x && w.z === z; })) return ln; }
  }
  return null;
}
/* Pulso pelo Usar (atril, para-raios, armadilha): liga no passo de desfazer e marca o desligar */
function rsPulse(cells, label, dt, ev) {
  beginBatch(label);
  cells.forEach(function (c) { var v = gget(c.x, c.y, c.z), b = BLOCKS[cellBlock(v)], p = stateProps(b, cellOri(v)); p.powered = 'true'; editSet(c.x, c.y, c.z, mkCell(cellBlock(v), stateIndex(b, p))); });
  endBatch();
  var c0 = rsAt(cells[0].x, cells[0].y, cells[0].z); if (c0 && rsOn) rsLater(dt, ev, c0);
}

/* ---------- Hora do dia: sensor de luz ---------- */
/* A conta do jogo (Java), com o céu aberto e sem chuva: ângulo do sol pela hora, escurecimento do céu e o cosseno */
var rsTime = 6000, rsTimeSp = 0, rsTimeTimer = 0;
try { var rt0 = JSON.parse(localStorage.getItem('bloco-a-bloco-hora') || 'null'); if (rt0) { rsTime = +rt0.t || 0; rsTimeSp = +rt0.sp || 0; } } catch (e) {}
function rsCelestial(t) { var d = (t / 24000 - 0.25) % 1; if (d < 0) d += 1; var d1 = 0.5 - Math.cos(d * Math.PI) / 2; return (d * 2 + d1) / 3; }
function rsDayPow(inv) {
  var ang = rsCelestial(rsTime), f = 1 - (Math.cos(ang * 2 * Math.PI) * 2 + 0.5); f = Math.max(0, Math.min(1, f));
  var i = 15 - Math.floor(f * 11), sun = ang * 2 * Math.PI;
  if (inv) i = 15 - i;
  else if (i > 0) { var f1 = sun < Math.PI ? 0 : Math.PI * 2; sun += (f1 - sun) * 0.2; i = Math.round(i * Math.cos(sun)); }
  return Math.max(0, Math.min(15, i));
}
function rsTimeTxt(t) { var h = (Math.floor(t / 1000) + 6) % 24, m = Math.floor((t % 1000) * 60 / 1000); return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m; }
/* Hora mudou: os sensores de luz que mudam de força são reavaliados (só os pedaços que têm sensor) */
var rsDayLast = null;
function rsDayUpdate(force) {
  var key = rsDayPow(false) + ',' + rsDayPow(true); if (!force && key === rsDayLast) return; rsDayLast = key;
  if (!rsOn) return;
  var seeds = [];
  W.forEach(function (ch) {
    var pal = ch.d ? ch.pal : [ch.u];
    if (!pal.some(function (v) { return v && rsKind(cellBlock(v)) === 'day'; })) return;
    var x0 = ch.cx << 4, y0 = ch.cy << 4, z0 = ch.cz << 4;
    for (var o = 0; o < 4096; o++) { var v = ch.d ? ch.pal[ch.d[o]] : ch.u; if (v && rsKind(cellBlock(v)) === 'day') seeds.push([x0 + (o & 15), y0 + (o >> 8), z0 + ((o >> 4) & 15)]); }
  });
  if (!seeds.length) return;
  rs.steps = 0; rs.touched = seeds.concat(rs.touched); rsSettle();
  if (rs.steps) { requestRender(); updateStatus(); if (!rs.save) rs.save = setTimeout(function () { rs.save = 0; autosave(); }, 1500); }
}
function setRsTime(t, sp) {
  rsTime = ((Math.round(t) % 24000) + 24000) % 24000; if (sp != null) rsTimeSp = sp;
  try { localStorage.setItem('bloco-a-bloco-hora', JSON.stringify({ t: rsTime, sp: rsTimeSp })); } catch (e) {}
  clearInterval(rsTimeTimer); rsTimeTimer = 0;
  if (rsTimeSp) rsTimeTimer = setInterval(function () { // o tempo passa: 20 tiques por segundo vezes a velocidade
    rsTime = (rsTime + 20 * rsTimeSp) % 24000; rsDayUpdate(false);
    var bt = $('rsTimeBtn'); if (bt) bt.textContent = 'Hora do dia: ' + rsTimeTxt(rsTime) + '…';
  }, 1000);
  var b2 = $('rsTimeBtn'); if (b2) b2.textContent = 'Hora do dia: ' + rsTimeTxt(rsTime) + '…';
  rsDayUpdate(false);
}

/* ---------- Alvo, sons do bloco musical e do sino ---------- */
/* Usar no alvo: força pela distância do ponto clicado ao centro da face (a conta do jogo), por 20 tiques */
function rsHitTarget(c, t, dur, label) {
  var v = gget(c[0], c[1], c[2]), b = BLOCKS[cellBlock(v)], lv = 15;
  if (t && t.pt && t.normal) {
    var f = function (q) { return Math.abs(q - Math.floor(q) - 0.5); }, dx = f(t.pt[0]), dy = f(t.pt[1]), dz = f(t.pt[2]);
    var d3 = t.normal[1] ? Math.max(dx, dz) : t.normal[2] ? Math.max(dx, dy) : Math.max(dy, dz);
    lv = Math.max(1, Math.ceil(15 * Math.min(1, Math.max(0, (0.5 - d3) / 0.5))));
  }
  beginBatch(label || 'Usar: alvo'); editSet(c[0], c[1], c[2], mkCell(cellBlock(v), stateIndex(b, { power: String(lv) }))); endBatch();
  var cc = rsAt(c[0], c[1], c[2]); if (cc && rsOn) { rs.pend.delete('targetOff' + rsIdx(cc)); rs.q = rs.q.filter(function (e) { return e.key !== 'targetOff' + rsIdx(cc); }); rsLater(dur || 20, 'targetOff', cc); } // um acerto novo recomeça a contagem
  return lv;
}
var rsSnd = { on: true, ctx: null, n: 0, t0: 0 };
try { rsSnd.on = localStorage.getItem('bloco-a-bloco-rssom') !== '0'; } catch (e) {}
function rsAudio() {
  if (!rsSnd.on) return null;
  var now = performance.now(); if (now - rsSnd.t0 > 100) { rsSnd.t0 = now; rsSnd.n = 0; } if (++rsSnd.n > 16) return null; // no máximo 16 sons a cada 0,1 s
  try { if (!rsSnd.ctx) rsSnd.ctx = new (window.AudioContext || window.webkitAudioContext)(); if (rsSnd.ctx.state === 'suspended') rsSnd.ctx.resume(); return rsSnd.ctx; } catch (e) { return null; }
}
/* Instrumento pelo bloco embaixo (as regras do jogo, resumidas) */
function rsInstrument(x, y, z) {
  var v = y > 0 ? gget(x, y - 1, z) : 0, j = v ? BLOCKS[cellBlock(v)].java : '';
  if (/^gold_block$/.test(j)) return 'bell'; if (/^clay$/.test(j)) return 'flute'; if (/^packed_ice$/.test(j)) return 'chime';
  if (/_wool$/.test(j)) return 'guitar'; if (/^bone_block$/.test(j)) return 'xylophone'; if (/^iron_block$/.test(j)) return 'iron_xylophone';
  if (/^soul_sand$/.test(j)) return 'cow_bell'; if (/^(carved_)?pumpkin$|^jack_o_lantern$/.test(j)) return 'didgeridoo'; if (/^emerald_block$/.test(j)) return 'bit';
  if (/^hay_block$/.test(j)) return 'banjo'; if (/^glowstone$/.test(j)) return 'pling';
  if (/(_planks|_log|_wood|_stem|_hyphae|bookshelf|chest|crafting_table|note_block|jukebox|barrel|loom|composter|lectern|_sign|_fence|_door|_trapdoor|_slab|_stairs|beehive|bee_nest|campfire|daylight_detector|banner)$/.test(j) && !/stone|brick|quartz|purpur|copper|deepslate|blackstone|tuff|prismarine|sandstone|nether/.test(j)) return 'bass';
  if (/^(sand|red_sand|gravel|suspicious_sand|suspicious_gravel)$|_concrete_powder$/.test(j)) return 'snare';
  if (/glass|^sea_lantern$|^beacon$|^conduit$/.test(j)) return 'hat';
  if (v && BLOCKS[cellBlock(v)].solid && /stone|brick|ore|netherrack|obsidian|quartz|purpur|deepslate|blackstone|basalt|tuff|calcite|prismarine|end_stone|terracotta|concrete|andesite|diorite|granite|bedrock|coral_block|nylium|magma|cobble|copper|amethyst|dripstone|sandstone/.test(j)) return 'basedrum';
  return 'harp';
}
var RS_INS = { harp: ['triangle', 0, 1.2], bass: ['triangle', -24, 0.8], bell: ['sine', 24, 2.2], flute: ['sine', 12, 0.7], chime: ['sine', 24, 1.6], guitar: ['sawtooth', -12, 0.7],
  xylophone: ['sine', 24, 0.3], iron_xylophone: ['square', 0, 0.5], cow_bell: ['square', 12, 0.35], didgeridoo: ['sawtooth', -24, 1.2], bit: ['square', 0, 0.6], banjo: ['sawtooth', 0, 0.5], pling: ['sine', 0, 1.4] };
function rsNoise(ctx, dur, type, freq) {
  var n = Math.floor(ctx.sampleRate * dur), buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
  for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  var src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(); src.buffer = buf; f.type = type; f.frequency.value = freq; g.gain.value = 0.35;
  src.connect(f); f.connect(g); g.connect(ctx.destination); src.start();
}
function rsPlayNote(x, y, z, note) {
  var ctx = rsAudio(); if (!ctx) return;
  var ins = rsInstrument(x, y, z);
  if (ins === 'basedrum') return rsNoise(ctx, 0.18, 'lowpass', 160);
  if (ins === 'snare') return rsNoise(ctx, 0.15, 'bandpass', 1800);
  if (ins === 'hat') return rsNoise(ctx, 0.06, 'highpass', 7000);
  var I = RS_INS[ins] || RS_INS.harp, f = 185 * Math.pow(2, (note + I[1]) / 12), t = ctx.currentTime;
  var o = ctx.createOscillator(), g = ctx.createGain(); o.type = I[0]; o.frequency.value = f;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + I[2]);
  o.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t + I[2] + 0.05);
}
function rsPlayBell() {
  var ctx = rsAudio(); if (!ctx) return;
  var t = ctx.currentTime;
  [[1046, 0.22], [2093, 0.1], [2637, 0.06]].forEach(function (h) {
    var o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.value = h[0];
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(h[1], t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.5);
    o.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t + 2.6);
  });
}
function setRsSound(on) {
  rsSnd.on = on; try { localStorage.setItem('bloco-a-bloco-rssom', on ? '1' : '0'); } catch (e) {}
  $('rsSndBtn').textContent = 'Sons da redstone: ' + (on ? 'sim' : 'não');
}
