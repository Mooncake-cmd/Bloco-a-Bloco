/* ---------- Pincel de escultura (terreno orgânico) ---------- */
/* O terreno é lido como um mapa de alturas: em cada coluna (x, z), a altura é o bloco mais alto. O pincel guarda
   alturas fracionárias durante o traço e, a cada "pincelada" (ao clicar e a cada 70 ms enquanto o botão está
   apertado), muda essas alturas com uma curva de atenuação suave f(t) = (1 - t²)², t = distância / raio:
     Elevar: h += força · f       Afundar: h -= força · f
     Suavizar: h vai para a média dos vizinhos    Aplainar: h vai para a altura do ponto onde o traço começou
   Depois, cada coluna é convertida de volta para voxels: sobe com o bloco da hotbar (a grama coberta vira terra) ou
   desce apagando o topo (o bloco de superfície, ex.: grama, desce junto). Um traço é um passo de desfazer. */
var sculpt = { mode: 'raise', r: 5, s: 2 };
try { var sc0 = JSON.parse(localStorage.getItem('bloco-a-bloco-sculpt') || 'null'); if (sc0) sculpt = Object.assign(sculpt, sc0); } catch (e) {}
var sculptStroke = null, sculptTimer = 0;
var SURFACE = /^(grass_block|podzol|mycelium|snow_block|sand|red_sand|moss_block|pale_moss_block|crimson_nylium|warped_nylium)$/;

function colTop(x, z) {
  for (var y = layerMax(); y >= 0; y--) if (gget(x, y, z)) return y;
  return -1;
}
function sculptFalloff(t) { return t >= 1 ? 0 : (1 - t * t) * (1 - t * t); }
function sculptCenter(t) { var c = t && (t.hit || t.place); return c ? [c[0], c[2]] : null; }
/* Colunas dentro do raio, com o peso da curva */
function sculptCols(cx, cz) {
  var out = [], r = sculpt.r;
  for (var dz = -r; dz <= r; dz++) for (var dx = -r; dx <= r; dx++) {
    var x = cx + dx, z = cz + dz; if (x < 0 || z < 0 || x >= SX || z >= SZ) continue;
    var f = sculptFalloff(Math.sqrt(dx * dx + dz * dz) / (r + 0.5)); if (f <= 0.01) continue;
    out.push([x, z, f]);
  }
  return out;
}
function sculptH(x, z) { var k = x + z * SX, H = sculptStroke.h; if (!H.has(k)) H.set(k, colTop(x, z)); return H.get(k); }
/* Uma pincelada: muda as alturas e converte as colunas para voxels */
function sculptDab(t) {
  var c = sculptCenter(t); if (!c || !sculptStroke) return;
  var cols = sculptCols(c[0], c[1]), st = sculpt.s * 0.25, mode = sculpt.mode, nh = [];
  cols.forEach(function (q) {
    var x = q[0], z = q[1], f = q[2], h = sculptH(x, z), n = h;
    if (mode === 'raise') n = h + st * f;
    else if (mode === 'lower') n = h - st * f;
    else if (mode === 'smooth') {
      var s = 0, k = 0;
      for (var dz = -1; dz <= 1; dz++) for (var dx = -1; dx <= 1; dx++) { var X = x + dx, Z = z + dz; if (X < 0 || Z < 0 || X >= SX || Z >= SZ) continue; s += sculptH(X, Z); k++; }
      n = h + (s / k - h) * f * 0.5;
    } else if (mode === 'flat') n = h + (sculptStroke.base - h) * f * 0.4;
    nh.push([x, z, Math.max(-1, Math.min(layerMax(), n))]);
  });
  var surf = curBlock(), v = mkCell(surf);
  nh.forEach(function (q) {
    var x = q[0], z = q[1]; sculptStroke.h.set(x + z * SX, q[2]);
    var want = Math.round(q[2]), old = colTop(x, z);
    if (want > old) {
      if (old >= 0) { var ov = gget(x, old, z); if (SURFACE.test(BLOCKS[cellBlock(ov)].java) && BY_JAVA.dirt != null) editSet(x, old, z, mkCell(BY_JAVA.dirt)); }
      for (var y = old + 1; y <= want; y++) editSet(x, y, z, v);
    } else if (want < old) {
      var top = gget(x, old, z);
      for (var y2 = old; y2 > want; y2--) editSet(x, y2, z, 0);
      if (want >= 0 && SURFACE.test(BLOCKS[cellBlock(top)].java)) editSet(x, want, z, top); // a grama desce junto
    }
  });
}
function sculptStart(t, shift) {
  if (!sculptCenter(t)) return;
  var c = sculptCenter(t);
  sculptStroke = { h: new Map(), base: colTop(c[0], c[1]), shift: shift };
  stroke = { mode: 'sculpt', cells: new Set() }; beginBatch();
  var m0 = sculpt.mode; if (shift && (m0 === 'raise' || m0 === 'lower')) sculpt.mode = m0 === 'raise' ? 'lower' : 'raise';
  sculptDab(t);
  clearInterval(sculptTimer);
  sculptTimer = setInterval(function () { if (!stroke || stroke.mode !== 'sculpt') { clearInterval(sculptTimer); return; } sculptDab(hoverT); requestRender(); }, 70);
  sculptStroke.m0 = m0; stroke.on = true;
}
function sculptEnd() {
  clearInterval(sculptTimer); sculptTimer = 0;
  if (sculptStroke) { sculpt.mode = sculptStroke.m0; sculptStroke = null; }
}
function sculptSave() { try { localStorage.setItem('bloco-a-bloco-sculpt', JSON.stringify(sculpt)); } catch (e) {} }
function updateSculptChip() {
  var c = $('sculptChip'), on = tool === 'sculpt'; c.hidden = !on; if (!on) return;
  c.querySelectorAll('[data-sm]').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-sm') === sculpt.mode); });
  $('sculptR').textContent = sculpt.r; $('sculptS').textContent = sculpt.s;
}
function setSculptR(r) { sculpt.r = Math.max(1, Math.min(16, r)); sculptSave(); updateSculptChip(); updatePreview(); }
$('sculptChip').addEventListener('click', function (e) {
  var b = e.target.closest('button'); if (!b) return;
  if (b.hasAttribute('data-sm')) sculpt.mode = b.getAttribute('data-sm');
  else if (b.id === 'sculptRm') sculpt.r = Math.max(1, sculpt.r - 1);
  else if (b.id === 'sculptRp') sculpt.r = Math.min(16, sculpt.r + 1);
  else if (b.id === 'sculptSm') sculpt.s = Math.max(1, sculpt.s - 1);
  else if (b.id === 'sculptSp') sculpt.s = Math.min(5, sculpt.s + 1);
  sculptSave(); updateSculptChip(); updatePreview();
});
/* Prévia: um disco sobre o terreno, só as colunas com peso alto o bastante */
function sculptPreview(t, accent) {
  var c = sculptCenter(t); if (!c) return;
  var m = new THREE.Matrix4(), k = 0;
  sculptCols(c[0], c[1]).forEach(function (q) {
    if (q[2] < 0.12) return;
    var y = colTop(q[0], q[1]) + 1; m.makeScale(1, 0.12, 1); m.setPosition(q[0] + 0.5, y + 0.06, q[1] + 0.5); previewInst.setMatrixAt(k++, m);
  });
  previewInst.count = k; previewInst.instanceMatrix.needsUpdate = true; previewInst.material.color.copy(accent);
}
