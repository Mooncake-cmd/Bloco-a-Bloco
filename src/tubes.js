/* ---------- Tubos: cilindros ao longo de linhas desenhadas no espaço ---------- */
/* Duas etapas. 1) Desenhar: cada clique (raio da câmera, castRay) põe um ponto no bloco ao lado da face apontada;
   pontos seguidos de um mesmo caminho formam trechos de reta. Page Up/Page Down sobem e descem o último ponto (linhas
   flutuantes), Shift + clique ou "Nova linha" começam outro caminho, Backspace tira o último ponto.
   2) Gerar (Enter): tubeCells rasteriza todos os trechos com o diâmetro e o preenchimento escolhidos e tubeGenerate
   grava os voxels num lote de desfazer (a malha dos pedaços tocados é refeita por editSet/endBatch).

   A matemática (para cada trecho A→B, com os pontos nos centros dos blocos):
   - D = B − A, L² = D·D. Para o centro P de um voxel: t = (P − A)·D / L² (onde P cai ao longo do trecho, 0 em A e 1
     em B) e a distância radial² r² = |P − A|² − t²·L² (distância ao eixo, ao quadrado).
   - Sólido S: 0 ≤ t ≤ 1 e r² ≤ R², com R = d/2 + 0,25 (o 0,25 deixa o círculo do diâmetro d com a cara dos círculos
     do jogo e não deixa furos numa linha diagonal fina). Nas emendas de um caminho entra também uma esfera de raio R
     em volta do ponto, para a curva não abrir uma fresta.
   - Oco: miolo I com raio R − 1, esticado 1 bloco além das pontas do trecho (as bocas do tubo ficam abertas) e com
     esferas R − 1 nas emendas; a parede é S − I. Todo vizinho de face de um voxel do miolo fica a no máximo 1 de
     distância do eixo a mais, então está em S: a parede não tem furo por onde a água passe.
   - A união de todos os trechos é feita num conjunto (um voxel não é contado duas vezes) e só entram voxels dentro
     do espaço e abaixo da Camada. */
var TUBE_MAX = 4000000; // voxels testados no total (caixa de cada trecho): acima disso, pede um diâmetro menor
var tube = { paths: [], d: 5, hollow: false, newPath: false, cache: null };
try { var tb0 = JSON.parse(localStorage.getItem('bloco-a-bloco-tube') || 'null'); if (tb0) { tube.d = tb0.d || 5; tube.hollow = !!tb0.h; } } catch (e) {}
function tubeSave() { try { localStorage.setItem('bloco-a-bloco-tube', JSON.stringify({ d: tube.d, h: tube.hollow })); } catch (e) {} }

/* Trechos e emendas a partir dos caminhos (listas de pontos [x, y, z]) */
function tubeSegments(paths) {
  var segs = [], joints = [];
  paths.forEach(function (p) {
    for (var i = 1; i < p.length; i++) segs.push([p[i - 1], p[i]]);
    for (var j = 1; j < p.length - 1; j++) joints.push(p[j]);
  });
  return { segs: segs, joints: joints };
}
/* Rasterização: lines é uma lista de caminhos (cada um com 2 ou mais pontos; um par de pontos é uma linha só),
   d o diâmetro em blocos, hollow oco ou maciço. Devolve { cells: [[x, y, z, s]] (s = trecho dono do voxel),
   tested, tooBig } */
function tubeCells(lines, d, hollow) {
  var sj = tubeSegments(lines), segs = sj.segs, joints = sj.joints;
  var R = d / 2 + 0.25, Ri = hollow && d >= 3 ? R - 1 : -1, R2 = R * R, Ri2 = Ri > 0 ? Ri * Ri : -1;
  var pad = Math.ceil(R) + 1, tested = 0, k;
  // caixa de cada trecho (com o raio) e o total de voxels a testar
  var boxes = segs.map(function (s) {
    var lo = [], hi = [];
    for (k = 0; k < 3; k++) { lo[k] = Math.min(s[0][k], s[1][k]) - pad; hi[k] = Math.max(s[0][k], s[1][k]) + pad; }
    lo[1] = Math.max(lo[1], 0); hi[1] = Math.min(hi[1], Math.min(SY - 1, layerMax()));
    lo[0] = Math.max(lo[0], 0); hi[0] = Math.min(hi[0], SX - 1); lo[2] = Math.max(lo[2], 0); hi[2] = Math.min(hi[2], SZ - 1);
    tested += Math.max(0, hi[0] - lo[0] + 1) * Math.max(0, hi[1] - lo[1] + 1) * Math.max(0, hi[2] - lo[2] + 1);
    return [lo, hi];
  });
  if (tested > TUBE_MAX) return { cells: [], tested: tested, tooBig: true };
  var solid = new Map(), inner = Ri2 > 0 ? new Set() : null;
  segs.forEach(function (s, si) {
    var A = s[0], D = [s[1][0] - A[0], s[1][1] - A[1], s[1][2] - A[2]], L2 = D[0] * D[0] + D[1] * D[1] + D[2] * D[2];
    var e = L2 ? 1 / Math.sqrt(L2) : 0, lo = boxes[si][0], hi = boxes[si][1];
    for (var y = lo[1]; y <= hi[1]; y++) for (var z = lo[2]; z <= hi[2]; z++) for (var x = lo[0]; x <= hi[0]; x++) {
      var px = x - A[0], py = y - A[1], pz = z - A[2], p2 = px * px + py * py + pz * pz, t, r2;
      if (L2) { t = (px * D[0] + py * D[1] + pz * D[2]) / L2; r2 = p2 - t * t * L2; } else { t = 0; r2 = p2; }
      if (r2 > R2) continue;
      var i = idx(x, y, z);
      if (t >= -1e-9 && t <= 1 + 1e-9 && !solid.has(i)) solid.set(i, si);
      if (inner && r2 <= Ri2 && t >= -e - 1e-9 && t <= 1 + e + 1e-9) inner.add(i);
    }
  });
  // emendas: esferas de raio R (e R − 1 no miolo)
  joints.forEach(function (J) {
    var si = 0; for (k = 0; k < segs.length; k++) if (segs[k][1] === J) { si = k; break; }
    var r = Math.ceil(R);
    for (var dy = -r; dy <= r; dy++) for (var dz = -r; dz <= r; dz++) for (var dx = -r; dx <= r; dx++) {
      var x = J[0] + dx, y = J[1] + dy, z = J[2] + dz, q = dx * dx + dy * dy + dz * dz;
      if (q > R2 || !inB(x, y, z) || y > layerMax()) continue;
      var i = idx(x, y, z);
      if (!solid.has(i)) solid.set(i, si);
      if (inner && q <= Ri2) inner.add(i);
    }
  });
  var cells = [];
  solid.forEach(function (si, i) { if (inner && inner.has(i)) return; var p = unidx(i); p.push(si); cells.push(p); });
  return { cells: cells, tested: tested, tooBig: false };
}
/* Grava os tubos: lines, diâmetro, oco/maciço e o bloco (índice na lista; -1 ou AIR_BI apaga = escavar).
   Troncos, colunas de quartzo e afins seguem o eixo de cada trecho. Um passo de desfazer. Devolve quantos voxels. */
function tubeGenerate(lines, d, hollow, bi) {
  var r = tubeCells(lines, d, hollow);
  if (r.tooBig) { toast('Tubos grandes demais (' + r.tested.toLocaleString('pt-BR') + ' blocos a testar): diminua o diâmetro ou o comprimento das linhas.', 6000); return -1; }
  var erase = bi < 0 || bi === AIR_BI, segs = tubeSegments(lines).segs, vals = [];
  var b = erase ? null : BLOCKS[bi];
  if (b && b.shape) { var p0 = placeShape(bi, null); if (partnerOf(BLOCKS[p0.bi], p0.s, 0, 0, 0)) { toast(b.name + ' ocupa dois blocos e não serve para tubos: escolha outro bloco.'); return -1; } }
  segs.forEach(function (s, si) {
    if (erase) { vals[si] = 0; return; }
    var D = [s[1][0] - s[0][0], s[1][1] - s[0][1], s[1][2] - s[0][2]], ax = Math.abs(D[0]) >= Math.abs(D[1]) && Math.abs(D[0]) >= Math.abs(D[2]) ? 0 : Math.abs(D[1]) >= Math.abs(D[2]) ? 1 : 2;
    var n = [0, 0, 0]; n[ax] = 1; if (!D[0] && !D[1] && !D[2]) n = [0, 1, 0];
    var t = { normal: n, d: [-n[0], -n[1], -n[2]] };
    if (b.shape) { var ps = placeShape(bi, t); vals[si] = mkCell(ps.bi, ps.s); }
    else vals[si] = mkCell(bi, b.ori && b.ori.k === 'axis' ? orientFor(bi, t) : -1);
  });
  beginBatch(erase ? 'Tubos (escavar)' : 'Tubos');
  r.cells.forEach(function (c) { editSet(c[0], c[1], c[2], vals[c[3]]); });
  endBatch();
  return r.cells.length;
}

/* ---------- Interface ---------- */
var tubeObj = null;
function tubeChanged() { tube.cache = null; updatePreview(); requestRender(); }
function tubeLast() { var p = tube.paths[tube.paths.length - 1]; return p && !tube.newPath ? p[p.length - 1] : null; }
function tubeAdd(t, shift) {
  var c = t && t.place; if (!c) return;
  if (shift || tube.newPath || !tube.paths.length) { tube.paths.push([]); tube.newPath = false; }
  var p = tube.paths[tube.paths.length - 1], l = p[p.length - 1];
  if (l && l[0] === c[0] && l[1] === c[1] && l[2] === c[2]) return;
  p.push(c.slice()); tubeChanged();
}
function tubeUndoPoint() {
  var p = tube.paths[tube.paths.length - 1]; if (!p) return;
  p.pop(); if (!p.length) tube.paths.pop(); tube.newPath = false; tubeChanged();
}
function tubeClear() { tube.paths = []; tube.newPath = false; tubeChanged(); }
/* Sobe ou desce o último ponto (para a linha flutuar) */
function tubeLift(dy) {
  var l = tubeLast(); if (!l) { toast('Clique para pôr um ponto; depois Page Up e Page Down sobem e descem ele.'); return; }
  l[1] = Math.max(0, Math.min(SY - 1, l[1] + dy)); tubeChanged();
  toast('Ponto em ' + l.join(', ') + '.', 1500);
}
function tubeRun(erase) {
  var n = tubeSegments(tube.paths).segs.length;
  if (!n) { toast('Desenhe pelo menos uma linha: clique em dois pontos.'); return; }
  var bi = erase ? -1 : curBlock(), k = tubeGenerate(tube.paths, tube.d, tube.hollow, bi);
  if (k < 0) return;
  toast((erase ? 'Escavados ' : 'Colocados ') + k.toLocaleString('pt-BR') + ' blocos em ' + n + (n > 1 ? ' tubos' : ' tubo') + (erase ? '.' : ' de ' + BLOCKS[bi].name + '.') + ' Ctrl+Z desfaz.', 5000);
  tube.paths = []; tube.newPath = false; tubeChanged();
}
function tubeCached() { if (!tube.cache) tube.cache = tubeCells(tube.paths, tube.d, tube.hollow); return tube.cache; }
function updateTubeChip() {
  var c = $('tubeChip'), on = tool === 'tube' && !walk;
  c.hidden = !on;
  if (!on) { if (tubeObj) { scene.remove(tubeObj); tubeObj.traverse(function (o) { if (o.geometry) o.geometry.dispose(); }); tubeObj = null; } return; }
  var n = tubeSegments(tube.paths).segs.length, r = n ? tubeCached() : null;
  $('tubeTxt').innerHTML = '<b>Tubos</b> ' + (n ? n + (n > 1 ? ' trechos' : ' trecho') + ' · ' + (r.tooBig ? '<i>grande demais</i>' : r.cells.length.toLocaleString('pt-BR') + ' blocos') : '<i>clique em dois pontos</i>');
  $('tubeD').textContent = tube.d;
  c.querySelectorAll('[data-th]').forEach(function (b) { b.setAttribute('aria-pressed', (b.getAttribute('data-th') === 'h') === tube.hollow); });
  $('tubeNew').setAttribute('aria-pressed', tube.newPath);
  tubePreview(hoverT, new THREE.Color(cssColor('--accent')));
}
function setTubeD(d) { tube.d = Math.max(1, Math.min(31, d)); tubeSave(); tubeChanged(); }
/* Prévia: os voxels que vão entrar, os pontos e as linhas (e a linha até o ponteiro) */
function tubePreview(t, accent) {
  var r = tube.paths.length ? tubeCached() : null, m = new THREE.Matrix4();
  if (r && !r.tooBig) {
    var n = Math.min(r.cells.length, 40000);
    for (var i = 0; i < n; i++) { m.setPosition(r.cells[i][0] + 0.5, r.cells[i][1] + 0.5, r.cells[i][2] + 0.5); previewInst.setMatrixAt(i, m); }
    previewInst.count = n; previewInst.instanceMatrix.needsUpdate = true; previewInst.material.color.copy(accent);
  }
  if (tubeObj) { scene.remove(tubeObj); tubeObj.traverse(function (o) { if (o.geometry) o.geometry.dispose(); }); }
  var g = new THREE.Group(), lm = new THREE.LineBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true }), pm = new THREE.MeshBasicMaterial({ color: accent, depthTest: false, transparent: true, opacity: 0.85 });
  var line = function (pts, mat) { var geo = new THREE.BufferGeometry().setFromPoints(pts.map(function (p) { return new THREE.Vector3(p[0] + 0.5, p[1] + 0.5, p[2] + 0.5); })); var o = new THREE.Line(geo, mat); o.renderOrder = 9; g.add(o); };
  tube.paths.forEach(function (p) {
    if (p.length > 1) line(p, lm);
    p.forEach(function (q) { var b = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), pm); b.position.set(q[0] + 0.5, q[1] + 0.5, q[2] + 0.5); b.renderOrder = 9; g.add(b); });
  });
  var l = tubeLast(), c = t && t.place;
  if (c) {
    var hm = new THREE.Mesh(new THREE.BoxGeometry(1.02, 1.02, 1.02), new THREE.MeshBasicMaterial({ color: accent, depthTest: false, transparent: true, opacity: 0.25 })); hm.position.set(c[0] + 0.5, c[1] + 0.5, c[2] + 0.5); hm.renderOrder = 9; g.add(hm);
    if (l) line([l, c], new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 0.4, gapSize: 0.3, depthTest: false, transparent: true, opacity: 0.8 })), g.children[g.children.length - 1].computeLineDistances();
  }
  tubeObj = g; scene.add(g);
}
$('tubeChip').addEventListener('click', function (e) {
  var b = e.target.closest('button'); if (!b) return;
  if (b.hasAttribute('data-th')) { tube.hollow = b.getAttribute('data-th') === 'h'; tubeSave(); tubeChanged(); }
  else if (b.id === 'tubeMinus') setTubeD(tube.d - 1);
  else if (b.id === 'tubePlus') setTubeD(tube.d + 1);
  else if (b.id === 'tubeNew') { tube.newPath = !tube.newPath; updateTubeChip(); }
  else if (b.id === 'tubeUndo') tubeUndoPoint();
  else if (b.id === 'tubeClear') tubeClear();
  else if (b.id === 'tubeCarve') tubeRun(true);
  else if (b.id === 'tubeGo') tubeRun(false);
});
/* Teclas da ferramenta (antes das outras): - e + diâmetro, Enter gera (Shift: escava), Backspace tira o ponto,
   Page Up/Page Down sobem e descem o último ponto (Shift: 5), Esc limpa as linhas */
function tubeKey(e, k) {
  if (tool !== 'tube' || walk || e.ctrlKey || e.metaKey || e.altKey) return false;
  if (k === '-' || k === '=' || k === '+') { setTubeD(tube.d + (k === '-' ? -1 : 1)); toast('Diâmetro ' + tube.d + '.', 1200); return true; }
  if (k === 'enter') { e.preventDefault(); tubeRun(e.shiftKey); return true; }
  if (k === 'backspace' && tube.paths.length) { e.preventDefault(); tubeUndoPoint(); return true; }
  if (k === 'pageup' || k === 'pagedown') { e.preventDefault(); tubeLift((k === 'pageup' ? 1 : -1) * (e.shiftKey ? 5 : 1)); return true; }
  return false;
}
