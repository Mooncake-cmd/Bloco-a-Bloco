/* ---------- Tubos: cilindros ao longo de linhas desenhadas no espaço ---------- */
/* Duas etapas. 1) Desenhar: cada clique (raio da câmera, castRay) põe um ponto no bloco ao lado da face apontada;
   pontos seguidos de um mesmo caminho formam trechos de reta. Page Up/Page Down e as setas mexem no ponto ativo (linhas
   flutuantes), o botão do meio, Shift + clique ou "Nova linha" começam outro caminho, Backspace tira o ponto ativo.
   Clicar num ponto pega ele (arrastar muda o lugar; com Shift, a altura); clicar num trecho põe um ponto novo ali.
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
var tube = { paths: [], d: 5, hollow: false, newPath: false, cache: null, sel: null, grab: null };
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
/* Ponto ativo: o escolhido (clicado, arrastado ou o último posto). Page Up/Page Down, as setas e Backspace mexem nele;
   um clique fora das linhas continua o caminho a partir dele quando ele é uma ponta. */
function tubeActive() { var s = tube.sel; return s && tube.paths[s[0]] ? tube.paths[s[0]][s[1]] : null; }
function tubeLast() { return tubeActive(); }
/* O que está debaixo do ponteiro: um ponto (até 12 px na tela) ou um trecho (até 8 px), com o lugar do trecho mais
   perto do raio do ponteiro (para pôr um ponto novo ali) */
function tubeScreen(q) {
  var r = renderer.domElement.getBoundingClientRect(), v = new THREE.Vector3(q[0] + 0.5, q[1] + 0.5, q[2] + 0.5).project(camera);
  return v.z > 1 ? null : [r.left + (v.x + 1) / 2 * r.width, r.top + (1 - v.y) / 2 * r.height];
}
function tubeHit(cx, cy) {
  var best = null, bd = 12;
  tube.paths.forEach(function (p, pi) { p.forEach(function (q, vi) { var s = tubeScreen(q); if (!s) return; var d = Math.hypot(s[0] - cx, s[1] - cy); if (d < bd) { bd = d; best = { pi: pi, vi: vi }; } }); });
  if (best) return best;
  bd = 8;
  tube.paths.forEach(function (p, pi) {
    for (var i = 1; i < p.length; i++) {
      var a = tubeScreen(p[i - 1]), b = tubeScreen(p[i]); if (!a || !b) continue;
      var ex = b[0] - a[0], ey = b[1] - a[1], L = ex * ex + ey * ey; if (L < 1) continue;
      var u = ((cx - a[0]) * ex + (cy - a[1]) * ey) / L; if (u <= 0.05 || u >= 0.95) continue;
      var d = Math.hypot(a[0] + u * ex - cx, a[1] + u * ey - cy);
      if (d < bd) { bd = d; best = { pi: pi, seg: i }; }
    }
  });
  if (best) { // ponto do trecho mais perto do raio (reta do raio x reta do trecho), arredondado ao bloco
    var p = tube.paths[best.pi], A = p[best.seg - 1], B = p[best.seg], ray = rayFrom(cx, cy);
    var P0 = [A[0] + 0.5, A[1] + 0.5, A[2] + 0.5], u3 = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], v3 = ray.d, w = [P0[0] - ray.o[0], P0[1] - ray.o[1], P0[2] - ray.o[2]];
    var dot = function (x, y) { return x[0] * y[0] + x[1] * y[1] + x[2] * y[2]; };
    var aa = dot(u3, u3), bb = dot(u3, v3), cc = dot(v3, v3), dd = dot(u3, w), ee = dot(v3, w), den = aa * cc - bb * bb;
    var sc = den > 1e-9 ? (bb * ee - cc * dd) / den : 0.5; sc = Math.max(0, Math.min(1, sc));
    best.at = [Math.round(A[0] + sc * u3[0]), Math.round(A[1] + sc * u3[1]), Math.round(A[2] + sc * u3[2])];
  }
  return best;
}
/* Clique da ferramenta: pega um ponto (e arrasta), põe um ponto novo num trecho (e arrasta), ou põe um ponto */
function tubePress(cx, cy, t, shift) {
  var h = tube.paths.length ? tubeHit(cx, cy) : null;
  if (h && h.seg) {
    var p = tube.paths[h.pi], A = p[h.seg - 1], B = p[h.seg];
    if (!(h.at[0] === A[0] && h.at[1] === A[1] && h.at[2] === A[2]) && !(h.at[0] === B[0] && h.at[1] === B[1] && h.at[2] === B[2])) {
      p.splice(h.seg, 0, h.at); tube.sel = [h.pi, h.seg]; tube.newPath = false; tubeGrab(shift); tubeChanged();
      toast('Ponto novo na linha: arraste para mudar o lugar (Shift + arrastar: altura).', 2500); return;
    }
    h = { pi: h.pi, vi: Math.abs(h.at[0] - A[0]) + Math.abs(h.at[1] - A[1]) + Math.abs(h.at[2] - A[2]) <= Math.abs(h.at[0] - B[0]) + Math.abs(h.at[1] - B[1]) + Math.abs(h.at[2] - B[2]) ? h.seg - 1 : h.seg };
  }
  if (h) { tube.sel = [h.pi, h.vi]; tube.newPath = false; tubeGrab(shift); tubeChanged(); return; }
  tubeAdd(t, shift);
}
function tubeGrab(vertical) { tube.grab = { v: !!vertical }; stroke = { mode: 'tube', cells: new Set(), on: true }; }
/* Arrastar o ponto pego: no plano horizontal da altura dele (para os lados) ou, com Shift, num plano em pé virado
   para a câmera (para cima e para baixo) */
function tubeDrag(cx, cy) {
  var q = tubeActive(); if (!q || !tube.grab) return;
  var ray = rayFrom(cx, cy), o = ray.o, d = ray.d, P = [q[0] + 0.5, q[1] + 0.5, q[2] + 0.5], n;
  if (tube.grab.v) { n = [d[0], 0, d[2]]; var l = Math.hypot(n[0], n[2]); if (l < 1e-6) return; n = [n[0] / l, 0, n[2] / l]; }
  else n = [0, 1, 0];
  var den = n[0] * d[0] + n[1] * d[1] + n[2] * d[2]; if (Math.abs(den) < 1e-6) return;
  var k = ((P[0] - o[0]) * n[0] + (P[1] - o[1]) * n[1] + (P[2] - o[2]) * n[2]) / den; if (k <= 0) return;
  var X = [o[0] + d[0] * k, o[1] + d[1] * k, o[2] + d[2] * k], c = q.slice();
  if (tube.grab.v) c[1] = Math.floor(X[1]); else { c[0] = Math.floor(X[0]); c[2] = Math.floor(X[2]); }
  c = [Math.max(0, Math.min(SX - 1, c[0])), Math.max(0, Math.min(SY - 1, c[1])), Math.max(0, Math.min(SZ - 1, c[2]))];
  if (c[0] === q[0] && c[1] === q[1] && c[2] === q[2]) return;
  q[0] = c[0]; q[1] = c[1]; q[2] = c[2]; tubeChanged();
}
function tubeAdd(t, shift) {
  var c = t && t.place; if (!c) return;
  var s = tube.sel, p = s && tube.paths[s[0]];
  if (!shift && !tube.newPath && p && s[1] === p.length - 1) { p.push(c.slice()); tube.sel = [s[0], p.length - 1]; } // continua da ponta final
  else if (!shift && !tube.newPath && p && s[1] === 0 && p.length > 1) { p.unshift(c.slice()); tube.sel = [s[0], 0]; } // continua da ponta inicial
  else { tube.paths.push([c.slice()]); tube.sel = [tube.paths.length - 1, 0]; }
  tube.newPath = false; tubeChanged();
}
/* Larga a linha (botão do meio): o próximo clique começa outra */
function tubeDrop() { tube.sel = null; tube.newPath = true; tubeChanged(); toast('Linha largada: o próximo clique começa outra. Clique num ponto para mexer nele.', 2500); }
function tubeUndoPoint() {
  var s = tube.sel; if (!s) { var lp = tube.paths.length - 1; if (lp < 0) return; s = [lp, tube.paths[lp].length - 1]; }
  var p = tube.paths[s[0]]; p.splice(s[1], 1);
  if (!p.length) { tube.paths.splice(s[0], 1); tube.sel = null; }
  else tube.sel = [s[0], Math.max(0, s[1] - 1)];
  tube.newPath = false; tubeChanged();
}
function tubeClear() { tube.paths = []; tube.sel = null; tube.newPath = false; tubeChanged(); }
/* Move o ponto ativo: dy para cima e para baixo; dx/dz para os lados */
function tubeMove(dx, dy, dz) {
  var l = tubeActive(); if (!l) { toast('Clique para pôr um ponto (ou clique num ponto de uma linha); depois Page Up, Page Down e as setas mexem nele.'); return; }
  l[0] = Math.max(0, Math.min(SX - 1, l[0] + dx)); l[1] = Math.max(0, Math.min(SY - 1, l[1] + dy)); l[2] = Math.max(0, Math.min(SZ - 1, l[2] + dz)); tubeChanged();
  toast('Ponto em ' + l.join(', ') + '.', 1500);
}
function tubeLift(dy) { tubeMove(0, dy, 0); }
function tubeRun(erase) {
  var n = tubeSegments(tube.paths).segs.length;
  if (!n) { toast('Desenhe pelo menos uma linha: clique em dois pontos.'); return; }
  var bi = erase ? -1 : curBlock(), k = tubeGenerate(tube.paths, tube.d, tube.hollow, bi);
  if (k < 0) return;
  toast((erase ? 'Escavados ' : 'Colocados ') + k.toLocaleString('pt-BR') + ' blocos em ' + n + (n > 1 ? ' tubos' : ' tubo') + (erase ? '.' : ' de ' + BLOCKS[bi].name + '.') + ' Ctrl+Z desfaz.', 5000);
  tube.paths = []; tube.sel = null; tube.newPath = false; tubeChanged();
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
  var hv = hoverXY && tube.paths.length && !(stroke && stroke.mode === 'tube') ? tubeHit(hoverXY[0], hoverXY[1]) : null, sm = new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true, opacity: 0.95 });
  tube.paths.forEach(function (p, pi) {
    if (p.length > 1) line(p, lm);
    p.forEach(function (q, vi) {
      var on = tube.sel && tube.sel[0] === pi && tube.sel[1] === vi, hov = hv && hv.pi === pi && hv.vi === vi, z = on ? 0.62 : hov ? 0.55 : 0.4;
      var b = new THREE.Mesh(new THREE.BoxGeometry(z, z, z), on ? sm : pm); b.position.set(q[0] + 0.5, q[1] + 0.5, q[2] + 0.5); b.renderOrder = 10; g.add(b);
    });
  });
  if (hv && hv.seg) { var nb = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true, opacity: 0.5 })); nb.position.set(hv.at[0] + 0.5, hv.at[1] + 0.5, hv.at[2] + 0.5); nb.renderOrder = 10; g.add(nb); }
  var l = tube.newPath ? null : tubeActive(), c = !hv && t && t.place;
  if (l && tube.sel) { var sp = tube.paths[tube.sel[0]]; if (tube.sel[1] !== sp.length - 1 && !(tube.sel[1] === 0 && sp.length > 1)) l = null; } // ponto do meio: o clique começa outra linha
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
  else if (b.id === 'tubeNew') { tube.newPath = !tube.newPath; if (tube.newPath) tube.sel = null; tubeChanged(); }
  else if (b.id === 'tubeUp') tubeMove(0, 1, 0);
  else if (b.id === 'tubeDown') tubeMove(0, -1, 0);
  else if (b.id === 'tubeUndo') tubeUndoPoint();
  else if (b.id === 'tubeClear') tubeClear();
  else if (b.id === 'tubeCarve') tubeRun(true);
  else if (b.id === 'tubeGo') tubeRun(false);
});
/* Teclas da ferramenta (antes das outras): - e + diâmetro, Enter gera (Shift: escava), Backspace tira o ponto,
   Page Up/Page Down sobem e descem o ponto ativo e as setas o levam para os lados (Shift: 5), Esc limpa as linhas */
function tubeKey(e, k) {
  if (tool !== 'tube' || walk || e.ctrlKey || e.metaKey || e.altKey) return false;
  if (k === '-' || k === '=' || k === '+') { setTubeD(tube.d + (k === '-' ? -1 : 1)); toast('Diâmetro ' + tube.d + '.', 1200); return true; }
  if (k === 'enter') { e.preventDefault(); tubeRun(e.shiftKey); return true; }
  if ((k === 'backspace' || k === 'delete') && tube.paths.length) { e.preventDefault(); tubeUndoPoint(); return true; }
  if (k === 'pageup' || k === 'pagedown') { e.preventDefault(); tubeLift((k === 'pageup' ? 1 : -1) * (e.shiftKey ? 5 : 1)); return true; }
  // setas: o ponto ativo anda para os lados, na direção da tela (o eixo mais perto)
  if (tubeActive() && /^arrow/.test(k)) {
    e.preventDefault();
    var st = e.shiftKey ? 5 : 1, fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw), v = k === 'arrowup' ? [fx, fz] : k === 'arrowdown' ? [-fx, -fz] : k === 'arrowright' ? [-fz, fx] : [fz, -fx];
    if (Math.abs(v[0]) >= Math.abs(v[1])) tubeMove(Math.sign(v[0]) * st, 0, 0); else tubeMove(0, 0, Math.sign(v[1]) * st);
    return true;
  }
  return false;
}
