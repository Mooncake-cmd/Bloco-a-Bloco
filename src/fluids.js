/* ---------- Água e lava escorrendo, como no jogo ---------- */
/* Segue a regra do Java (FlowingFluid): a fonte (level 0) espalha para os lados perdendo 1 nível por bloco na água
   (até 7 blocos) e 2 na lava (3 blocos); onde há buraco, cai (level 8) e volta a espalhar no chão; entre as direções,
   prefere as que levam a um buraco mais perto (até 4 blocos na água, 2 na lava). Duas fontes de água vizinhas sobre
   chão firme criam outra fonte. Lava encostada em água vira obsidiana (fonte) ou pedregulho (corrente); lava que cai na
   água vira pedra. A simulação anda em ondas (água a cada 0,1 s, lava a cada 0,45 s) e cada mudança entra no mesmo
   passo de desfazer da edição que a provocou. Só blocos vazios recebem fluido. */
var flowOn = true;
try { flowOn = localStorage.getItem('bloco-a-bloco-flow') !== '0'; } catch (e) {}
var FLUID = { water: { drop: 1, slope: 4, wait: 100 }, lava: { drop: 2, slope: 2, wait: 450 } };
var fluidQ = { water: new Map(), lava: new Map() }, fluidTimer = { water: 0, lava: 0 }, fluidChanges = 0, FLUID_MAX = 400000;
var H4 = [[0, 0, -1], [1, 0, 0], [0, 0, 1], [-1, 0, 0]];

function fluidType(v) { if (!v) return null; var j = BLOCKS[cellBlock(v)].java; return j === 'water' || j === 'lava' ? j : null; }
function fluidLv(v) { return +stateProps(BLOCKS[cellBlock(v)], cellOri(v)).level; }
function fluidAmt(lv) { return lv === 0 || lv >= 8 ? 8 : 8 - lv; }
function fluidGet(x, y, z) { if (!inB(x, y, z)) return null; var v = gget(x, y, z), t = fluidType(v); return t ? { t: t, lv: fluidLv(v) } : null; }
/* Chão firme: qualquer bloco que não seja fluido (fora do espaço não conta) */
function fluidFirm(x, y, z) { if (!inB(x, y, z)) return false; var v = gget(x, y, z); return !!v && !fluidType(v); }
/* O fluido pode ocupar a célula: vazia, ou o mesmo fluido sem ser fonte */
function fluidRoom(x, y, z, t) {
  if (!inB(x, y, z)) return false;
  var v = gget(x, y, z); if (!v) return true;
  return fluidType(v) === t && fluidLv(v) !== 0;
}
/* Buraco: embaixo cabe fluido (vazio ou o mesmo fluido) */
function fluidHole(x, y, z, t) {
  if (!inB(x, y - 1, z)) return false;
  var v = gget(x, y - 1, z);
  return !v || fluidType(v) === t;
}
function fluidSet(x, y, z, v) {
  var i = idx(x, y, z), old = gget(x, y, z); if (old === v) return;
  setRaw(x, y, z, v);
  var top = histTop(); if (top) top.add(i, old, v); // a água que escorre entra na mesma ação do histórico
  fluidChanges++;
  fluidTouch(x, y, z);
}
function fluidCell(t, lv) { return cellOf(t, { level: String(lv) }); }
/* Agenda a célula e as vizinhas que tenham fluido */
function fluidTouch(x, y, z) {
  if (!flowOn) return;
  var add = function (a, b, c) { if (!inB(a, b, c)) return; var t = fluidType(gget(a, b, c)); if (t) fluidQ[t].set(idx(a, b, c), [a, b, c]); };
  add(x, y, z); add(x, y + 1, z); add(x, y - 1, z);
  for (var k = 0; k < 4; k++) add(x + H4[k][0], y, z + H4[k][2]);
  fluidKick();
}
function fluidKick() {
  ['water', 'lava'].forEach(function (t) {
    if (fluidQ[t].size && !fluidTimer[t]) fluidTimer[t] = setTimeout(function () { fluidTimer[t] = 0; fluidWave(t); }, FLUID[t].wait);
  });
}
function fluidStop() {
  fluidQ.water.clear(); fluidQ.lava.clear();
  clearTimeout(fluidTimer.water); clearTimeout(fluidTimer.lava); fluidTimer.water = fluidTimer.lava = 0;
}
/* Estado que a célula deve ter pelos vizinhos (getNewLiquid do Java) */
function fluidWant(x, y, z, t) {
  var maxA = 0, src = 0;
  for (var k = 0; k < 4; k++) {
    var n = fluidGet(x + H4[k][0], y, z + H4[k][2]);
    if (n && n.t === t) { if (n.lv === 0) src++; maxA = Math.max(maxA, fluidAmt(n.lv)); }
  }
  if (t === 'water' && src >= 2) {
    var below = fluidGet(x, y - 1, z);
    if (fluidFirm(x, y - 1, z) || (below && below.t === t && below.lv === 0)) return 0;
  }
  var up = fluidGet(x, y + 1, z);
  if (up && up.t === t) return 8;
  var a = maxA - FLUID[t].drop;
  return a <= 0 ? -1 : 8 - a;
}
function fluidSlope(x, y, z, t, depth, from) {
  var best = 1000;
  for (var k = 0; k < 4; k++) {
    if (k === from) continue;
    var nx = x + H4[k][0], nz = z + H4[k][2];
    if (!fluidRoom(nx, y, nz, t)) continue;
    if (fluidHole(nx, y, nz, t)) return depth;
    if (depth < FLUID[t].slope) best = Math.min(best, fluidSlope(nx, y, nz, t, depth + 1, (k + 2) % 4));
  }
  return best;
}
function fluidSides(x, y, z, t, lv) {
  var amt = lv >= 8 ? 7 : fluidAmt(lv) - FLUID[t].drop;
  if (amt <= 0) return;
  var dist = [], min = 1000;
  for (var k = 0; k < 4; k++) {
    var nx = x + H4[k][0], nz = z + H4[k][2];
    if (!fluidRoom(nx, y, nz, t)) { dist.push(-1); continue; }
    var d = fluidHole(nx, y, nz, t) ? 0 : fluidSlope(nx, y, nz, t, 1, (k + 2) % 4);
    dist.push(d); if (d < min) min = d;
  }
  for (k = 0; k < 4; k++) {
    if (dist[k] !== min) continue;
    var tx = x + H4[k][0], tz = z + H4[k][2], cur = fluidGet(tx, y, tz);
    if (cur && fluidAmt(cur.lv) >= amt) continue;
    fluidSet(tx, y, tz, fluidCell(t, 8 - amt));
  }
}
/* Lava encostada em água (dos lados ou por cima) endurece */
function lavaMeetsWater(x, y, z, lv) {
  var near = [[0, 1, 0]].concat(H4);
  for (var k = 0; k < near.length; k++) {
    var n = fluidGet(x + near[k][0], y + near[k][1], z + near[k][2]);
    if (n && n.t === 'water') { fluidSet(x, y, z, cellOf(lv === 0 ? 'obsidian' : 'cobblestone')); return true; }
  }
  return false;
}
function fluidStep(x, y, z, t) {
  var v = gget(x, y, z); if (fluidType(v) !== t) return;
  var lv = fluidLv(v);
  if (t === 'lava' && lavaMeetsWater(x, y, z, lv)) return;
  if (lv !== 0) {
    var w = fluidWant(x, y, z, t);
    if (w < 0) { fluidSet(x, y, z, 0); return; }
    if (w !== lv) { fluidSet(x, y, z, fluidCell(t, w)); lv = w; }
  }
  // cair
  if (inB(x, y - 1, z)) {
    var bv = gget(x, y - 1, z), bt = fluidType(bv);
    if (t === 'lava' && bt === 'water') { fluidSet(x, y - 1, z, cellOf('stone')); return; }
    if (!bv || (bt === t && fluidLv(bv) !== 0 && fluidLv(bv) < 8)) {
      fluidSet(x, y - 1, z, fluidCell(t, 8));
      var src = 0; for (var k = 0; k < 4; k++) { var n = fluidGet(x + H4[k][0], y, z + H4[k][2]); if (n && n.t === t && n.lv === 0) src++; }
      if (src >= 3) fluidSides(x, y, z, t, lv);
      return;
    }
    if (bt === t && fluidLv(bv) >= 8) { if (lv === 0) fluidSides(x, y, z, t, lv); return; }
  }
  if (lv === 0 || !fluidHole(x, y, z, t)) fluidSides(x, y, z, t, lv);
}
function fluidWave(t) {
  if (!flowOn) { fluidStop(); return; }
  var q = fluidQ[t]; fluidQ[t] = new Map();
  var t0 = performance.now(), n = 0;
  q.forEach(function (p, key) {
    if (fluidChanges > FLUID_MAX) return;
    // onda grande demais para um quadro: o resto fica para a próxima
    if (++n > 400 && performance.now() - t0 > 30) { fluidQ[t].set(key, p); return; }
    fluidStep(p[0], p[1], p[2], t);
  });
  if (fluidChanges > FLUID_MAX) { fluidStop(); toast('A água e a lava pararam de escorrer: mudanças demais de uma vez. Separe a área com blocos.', 7000); }
  requestRender(); changed();
  fluidKick();
}
/* Depois de cada edição do usuário: agenda o que mudou */
function fluidAfterBatch(b) {
  if (!flowOn || !b) return;
  fluidChanges = 0;
  for (var k = 0; k < b.length; k++) {
    var p = unidx(b.i[k]);
    fluidTouch(p[0], p[1], p[2]);
  }
}
function setFlow(on) {
  flowOn = on; try { localStorage.setItem('bloco-a-bloco-flow', on ? '1' : '0'); } catch (e) {}
  if (!on) fluidStop();
  $('flowBtn').textContent = 'Água e lava escorrem: ' + (on ? 'sim' : 'não');
}
