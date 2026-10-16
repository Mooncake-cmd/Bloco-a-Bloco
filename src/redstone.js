/* ---------- Redstone funcionando ---------- */
/* Simulação no tempo do jogo: 20 tiques por segundo (um tique de redstone = 2 tiques). Segue as regras do Java/Bedrock
   para o que não depende de criaturas nem de itens:
   - Fontes: alavanca, botão (solta sozinho: 1 s o de pedra, 1,5 s o de madeira), placa de pressão (Usar aperta por 1 s;
     as de peso guardam a força escolhida), tocha, bloco de redstone, sensor de luz (a força escolhida), observador.
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
   - Observador: um pulso de 1 tique de redstone pela parte de trás quando o bloco da frente muda.
   Cada mudança feita pela simulação entra no mesmo passo de desfazer da ação que a causou (como a água). A avaliação
   é local: parte das células mudadas e percorre só a rede de redstone ligada a elas. */
var rsOn = true;
try { rsOn = localStorage.getItem('bloco-a-bloco-redstone') !== '0'; } catch (e) {}
var rs = { gt: 0, q: [], pend: new Map(), timer: 0, lv: null, cmp: new Map(), obs: new Map(), door: new Map(), burn: new Map(), touched: [], steps: 0 };
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
    : !b.shape && b.solid && !b.isAir && !NOT_STURDY.test(j) ? 'solid' : null;
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
function rsCond(x, y, z) { var c = rsAt(x, y, z); return !!c && c.k === 'solid'; }
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
    case 'wplate': case 'day': return +rsP(c).power || 0;
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

/* ---------- Mudanças e agenda ---------- */
function rsSet(x, y, z, v) {
  var old = gget(x, y, z); if (old === v) return;
  setRaw(x, y, z, v);
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
  if (!rs.timer) rs.timer = setInterval(rsTick, 50);
}
function rsStop() { rs.q = []; rs.pend.clear(); clearInterval(rs.timer); rs.timer = 0; rs.touched = []; }
function rsReset() { rsStop(); rs.cmp.clear(); rs.obs.clear(); rs.door.clear(); rs.burn.clear(); }
function rsTick() {
  rs.gt++;
  var due = rs.q.filter(function (e) { return e.t <= rs.gt; });
  if (due.length) rs.q = rs.q.filter(function (e) { return e.t > rs.gt; });
  rs.steps = 0;
  due.forEach(function (e) { rs.pend.delete(e.key); rsRun(e); });
  if (rs.touched.length) rsSettle();
  if (rs.steps) { requestRender(); updateStatus(); if (!rs.save) rs.save = setTimeout(function () { rs.save = 0; autosave(); }, 1500); }
  if (!rs.q.length) { clearInterval(rs.timer); rs.timer = 0; }
}
function rsRun(e) {
  var c = rsAt(e.p[0], e.p[1], e.p[2]), i = idx(e.p[0], e.p[1], e.p[2]);
  // o pulso do observador também é uma mudança de estado: outro observador olhando para ele vê (relógio de observadores)
  if (e.type === 'obsOn') { if (c && c.k === 'observer') { rs.obs.set(i, true); rs.touched.push(e.p); rsLater(2, 'obsOff', c); rsSeen(e.p[0], e.p[1], e.p[2]); } return; }
  if (e.type === 'obsOff') { if (rs.obs.delete(i)) { rs.touched.push(e.p); rsSeen(e.p[0], e.p[1], e.p[2]); } return; }
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
      }
      break;
    case 'release': if ((c.k === 'button' || c.k === 'plate') && p.powered === 'true') rsProp(c, { powered: 'false' }); break;
    case 'piston': if (c.k === 'piston') rsPiston(c); break;
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
function rsPiston(c) {
  var p = rsP(c), f = p.facing, ext = p.extended === 'true', want = rsInput(c.x, c.y, c.z, f) > 0, sticky = c.b.java === 'sticky_piston';
  var v = DV[f], front = [c.x + v[0], c.y + v[1], c.z + v[2]];
  if (want && !ext) {
    var list = [], q = front.slice(), brk = null;
    for (;;) {
      if (!inB(q[0], q[1], q[2])) return; // a fila bate na borda do espaço
      var m = rsMove(gget(q[0], q[1], q[2]));
      if (m === 'empty') break;
      if (m === 'fixed') return;
      if (m === 'breaks') { brk = q.slice(); break; }
      list.push(q.slice()); if (list.length > 12) return;
      q[0] += v[0]; q[1] += v[1]; q[2] += v[2];
    }
    if (brk) rsBreak(brk[0], brk[1], brk[2]);
    for (var k = list.length - 1; k >= 0; k--) { var a = list[k]; rsSet(a[0] + v[0], a[1] + v[1], a[2] + v[2], gget(a[0], a[1], a[2])); }
    var hb = BY_JAVA.piston_head, H = BLOCKS[hb];
    rsSet(front[0], front[1], front[2], mkCell(hb, stateIndex(H, { facing: f, type: sticky ? 'sticky' : 'normal' })));
    rsProp(c, { extended: 'true' });
  } else if (!want && ext) {
    var h = rsAt(front[0], front[1], front[2]);
    if (h && h.k === 'head') {
      var pull = [front[0] + v[0], front[1] + v[1], front[2] + v[2]], pv = inB(pull[0], pull[1], pull[2]) ? gget(pull[0], pull[1], pull[2]) : 0;
      if (sticky && pv && rsMove(pv) === 'moves') { rsSet(front[0], front[1], front[2], pv); rsSet(pull[0], pull[1], pull[2], 0); }
      else rsSet(front[0], front[1], front[2], 0);
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
  for (var k = 0; k < b.length && seeds.length < 200000; k++) { var p = unidx(b.i[k]); seeds.push(p); rsSeen(p[0], p[1], p[2]); }
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
