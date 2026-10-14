/* ---------- Pincel de troca: pincel 3D com máscara ---------- */
/* O raio do ponteiro (castRay, a partir da câmera) dá o bloco atingido; em volta dele, uma esfera ou um cubo de raio r.
   Cada voxel do volume é testado: se o bloco for exatamente o da máscara, vira o bloco de destino (mantendo direção e
   estado quando os dois blocos têm as mesmas propriedades); ar e qualquer outro bloco ficam como estão.
   Máscara: Shift + clique num bloco. Destino: o bloco ativo da hotbar. Raio: 1 a 12 (teclas - e +). */
var maskR = 2, maskShape = 'sphere', maskBi = -1;
try { var ms0 = JSON.parse(localStorage.getItem('bloco-a-bloco-mask') || 'null'); if (ms0) { maskR = ms0.r || 2; maskShape = ms0.s || 'sphere'; } } catch (e) {}
function maskSave() { try { localStorage.setItem('bloco-a-bloco-mask', JSON.stringify({ r: maskR, s: maskShape })); } catch (e) {} }

/* Varredura do volume: chama fn(x, y, z) para cada voxel dentro do espaço */
function brushVolume(c, r, shape, fn) {
  var R2 = (r + 0.5) * (r + 0.5);
  for (var dy = -r; dy <= r; dy++) for (var dz = -r; dz <= r; dz++) for (var dx = -r; dx <= r; dx++) {
    if (shape === 'sphere' && dx * dx + dy * dy + dz * dz > R2) continue;
    var x = c[0] + dx, y = c[1] + dy, z = c[2] + dz;
    if (!inB(x, y, z) || y > layerMax()) continue;
    fn(x, y, z);
  }
}
/* O algoritmo pedido: posição do raycast, raio, máscara e destino. Devolve quantos voxels mudaram.
   As mudanças entram no lote de desfazer aberto (um traço do pincel é um passo) e marcam os pedaços da malha a refazer. */
function maskBrush(center, r, shape, mask, target) {
  if (!center || mask < 0 || target < 0 || mask === target) return 0;
  var n = 0;
  brushVolume(center, r, shape, function (x, y, z) {
    var v = grid[idx(x, y, z)];
    if (!v || cellBlock(v) !== mask) return; // diferente da máscara (ar ou outro bloco): fica igual
    editSet(x, y, z, convertCell(v, target)); n++;
  });
  return n;
}
/* Voxels que o pincel trocaria agora (para a prévia) */
function maskMatches(center) {
  var out = [];
  if (!center || maskBi < 0) return out;
  brushVolume(center, maskR, maskShape, function (x, y, z) { var v = grid[idx(x, y, z)]; if (v && cellBlock(v) === maskBi) out.push([x, y, z]); });
  return out;
}
function maskApply(t) {
  if (!t || !t.hit) return;
  if (maskBi < 0) { toast('Escolha a máscara primeiro: Shift + clique num bloco do tipo que deve ser trocado.'); return; }
  var n = maskBrush(t.hit, maskR, maskShape, maskBi, curBlock());
  if (stroke) stroke.n = (stroke.n || 0) + n;
}
function maskPick(t) {
  if (!t || !t.hit) return;
  maskBi = cellBlock(grid[idx(t.hit[0], t.hit[1], t.hit[2])]);
  toast('Máscara: ' + BLOCKS[maskBi].name + '. Agora pinte: só esse bloco vira ' + BLOCKS[curBlock()].name + '.');
  updateMaskChip();
}
function updateMaskChip() {
  var c = $('maskChip'), on = tool === 'mask';
  c.hidden = !on; if (!on) return;
  $('maskTxt').innerHTML = '<b>Troca</b> ' + (maskBi >= 0 ? esc(BLOCKS[maskBi].name) : '<i>Shift + clique num bloco</i>') + ' → ' + esc(BLOCKS[curBlock()].name);
  $('maskR').textContent = maskR;
  c.querySelectorAll('[data-ms]').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-ms') === maskShape); });
}
function setMaskR(r) { maskR = Math.max(1, Math.min(12, r)); maskSave(); updateMaskChip(); updatePreview(); }
$('maskChip').addEventListener('click', function (e) {
  var b = e.target.closest('button'); if (!b) return;
  if (b.hasAttribute('data-ms')) { maskShape = b.getAttribute('data-ms'); maskSave(); updateMaskChip(); updatePreview(); }
  else if (b.id === 'maskMinus') setMaskR(maskR - 1);
  else if (b.id === 'maskPlus') setMaskR(maskR + 1);
});
/* Prévia: os voxels que vão mudar, na cor de destaque, e o contorno do volume */
function maskPreview(t, accent) {
  if (!t || !t.hit) return;
  var c = t.hit, m = new THREE.Matrix4(), cells = maskMatches(c), n = Math.min(cells.length, 40000);
  for (var i = 0; i < n; i++) { m.setPosition(cells[i][0] + 0.5, cells[i][1] + 0.5, cells[i][2] + 0.5); previewInst.setMatrixAt(i, m); }
  previewInst.count = n; previewInst.instanceMatrix.needsUpdate = true; previewInst.material.color.copy(accent);
  var d = 2 * maskR + 1;
  ghostEdges.material.color.copy(accent); ghostEdges.scale.set(d, d, d); setBoxAt(ghostEdges, c); ghostEdges.visible = true;
}
