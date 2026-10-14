/* ---------- Simetria (espelho) ---------- */
/* Até três planos, um por eixo (X, Y, Z). Toda edição do usuário passa por editSet; com a simetria ligada, editSet
   calcula as posições espelhadas (x' = P - x, onde P é o dobro da posição do plano, então o plano pode passar pelo
   meio de um bloco ou entre dois) e repete a mesma mudança nelas, com o estado espelhado (leste vira oeste, porta com
   a dobradiça do outro lado, degrau de cabeça para baixo no espelho de altura...). Desfazer e a água escorrendo não
   passam por aqui: um passo de desfazer volta o original e as cópias juntos. */
var sym = { on: [false, false, false], p: [0, 0, 0] }, symBusy = false, symMeshes = [];
function symAny() { return sym.on[0] || sym.on[1] || sym.on[2]; }
function symCenter() { sym.p = [SX - 1, SY - 1, SZ - 1]; }
var SYM_SWAP = [{ east: 'west', west: 'east' }, { up: 'down', down: 'up', top: 'bottom', bottom: 'top', floor: 'ceiling', ceiling: 'floor', upper: 'lower', lower: 'upper' }, { north: 'south', south: 'north' }];
function symValue(k, val, a) {
  if (k === 'rotation') return String(a === 0 ? (16 - val) % 16 : a === 2 ? (24 - val) % 16 : +val);
  if (k === 'hinge' && a !== 1) return val === 'left' ? 'right' : 'left';
  if (a !== 1 && (k === 'half' || k === 'type' || k === 'face' || k === 'attachment')) return val;
  var sw = SYM_SWAP[a];
  return String(val).split('_').map(function (t) { return sw[t] || t; }).join('_');
}
/* Estado espelhado de uma célula no eixo a (0 = X, 1 = Y, 2 = Z) */
function mirrorCell(v, a) {
  if (!v) return 0;
  var bi = cellBlock(v), b = BLOCKS[bi], s = cellOri(v), sw = SYM_SWAP[a];
  if (b.shape) {
    var o = stateProps(b, s), r = {};
    for (var k in o) r[sw[k] || k] = symValue(k, o[k], a); // propriedades com nome de lado (cipó, muro) trocam de lugar
    return mkCell(bi, stateIndex(b, r));
  }
  if (b.ori) {
    var want = symValue(b.ori.k, b.ori.o[s][0], a);
    for (var i = 0; i < b.ori.o.length; i++) if (b.ori.o[i][0] === want) return mkCell(bi, i);
  }
  return v;
}
/* A edição e as cópias espelhadas (até 8 com os três planos), sem repetir posição */
function symPoints(x, y, z, v) {
  var out = [[x, y, z, v]], seen = {};
  for (var a = 0; a < 3; a++) {
    if (!sym.on[a]) continue;
    var n = out.length;
    for (var i = 0; i < n; i++) {
      var q = out[i].slice(); q[a] = sym.p[a] - q[a]; q[3] = mirrorCell(q[3], a); out.push(q);
    }
  }
  return out.filter(function (q) { var k = q[0] + ',' + q[1] + ',' + q[2]; if (seen[k]) return false; seen[k] = 1; return true; });
}
/* Planos visíveis: vidro colorido atravessando o espaço */
var SYM_COLORS = [0xe0533d, 0x3fa34d, 0x3d7ee0];
function drawSym() {
  symMeshes.forEach(function (m) { scene.remove(m); m.geometry.dispose(); m.material.dispose(); }); symMeshes = [];
  if (!scene) return;
  for (var a = 0; a < 3; a++) {
    if (!sym.on[a]) continue;
    var w = a === 0 ? SZ : SX, h = a === 1 ? SZ : SY;
    var m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: SYM_COLORS[a], transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }));
    var pos = (sym.p[a] + 1) / 2;
    if (a === 0) { m.rotation.y = Math.PI / 2; m.position.set(pos, SY / 2, SZ / 2); }
    else if (a === 1) { m.rotation.x = -Math.PI / 2; m.position.set(SX / 2, pos, SZ / 2); }
    else m.position.set(SX / 2, SY / 2, pos);
    m.renderOrder = 6; scene.add(m); symMeshes.push(m);
    var e = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry), new THREE.LineBasicMaterial({ color: SYM_COLORS[a], transparent: true, opacity: 0.8 }));
    e.position.copy(m.position); e.rotation.copy(m.rotation); scene.add(e); symMeshes.push(e);
  }
  requestRender();
}
function symFmt(a) { var v = sym.p[a] / 2; return v % 1 ? v.toFixed(1).replace('.', ',') : String(v); }
function updateSymChip() {
  var c = $('symChip'); if (c.hidden) return;
  c.querySelectorAll('[data-sa]').forEach(function (b) { b.setAttribute('aria-pressed', sym.on[+b.getAttribute('data-sa')]); });
  $('symPos').textContent = ['X', 'Y', 'Z'].map(function (n, a) { return sym.on[a] ? n + ' = ' + symFmt(a) : ''; }).filter(Boolean).join(' · ') || 'escolha um eixo';
}
function symSave() { try { localStorage.setItem('bloco-a-bloco-sym', JSON.stringify(sym)); } catch (e) {} }
function symRefresh() { symSave(); updateSymChip(); drawSym(); }
function toggleSymChip(show) {
  var c = $('symChip'); c.hidden = show == null ? !c.hidden : !show;
  if (!c.hidden && !symAny()) { sym.on[0] = true; }
  if (c.hidden) sym.on = [false, false, false];
  symRefresh();
  toast(c.hidden ? 'Simetria desligada.' : 'Simetria ligada: tudo o que você fizer é repetido do outro lado do plano. P põe o plano no bloco apontado.');
}
/* P: os planos ligados passam pelo bloco apontado; apertar de novo no mesmo bloco põe o plano entre ele e o vizinho */
function symAtTarget(t) {
  var c = t && (t.hit || t.place); if (!c) { toast('Aponte para um bloco e aperte P.'); return; }
  for (var a = 0; a < 3; a++) if (sym.on[a]) sym.p[a] = sym.p[a] === 2 * c[a] ? 2 * c[a] + 1 : 2 * c[a];
  symRefresh();
}
$('symChip').addEventListener('click', function (e) {
  var b = e.target.closest('button'); if (!b) return;
  if (b.hasAttribute('data-sa')) { var a = +b.getAttribute('data-sa'); sym.on[a] = !sym.on[a]; }
  else if (b.id === 'symMid') symCenter();
  else if (b.id === 'symMinus' || b.id === 'symPlus') { for (var k = 0; k < 3; k++) if (sym.on[k]) sym.p[k] += b.id === 'symPlus' ? 1 : -1; }
  else if (b.id === 'symOff') { toggleSymChip(false); return; }
  symRefresh();
});
try { var s0 = JSON.parse(localStorage.getItem('bloco-a-bloco-sym') || 'null'); if (s0 && s0.p) sym.p = s0.p; } catch (e) {}
