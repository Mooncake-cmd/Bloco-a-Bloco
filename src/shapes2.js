/* ---------- Mais formas: cilindro, cone, pirâmide, cúpula e arco ---------- */
/* Ferramenta "Mais formas" (C). O tipo e a opção Oco ficam no aviso do canto. Usa os mesmos cliques das outras formas:
     Cilindro e Cone: centro da base, um ponto da borda (o raio) e a altura (suba o ponteiro), como a caixa.
     Arco: um pé, o outro pé (na mesma linha) e a altura do topo.
     Pirâmide: dois cantos da base; a altura sai sozinha (cada camada recua um bloco de cada lado).
     Cúpula: centro e um ponto da borda; meia esfera para cima.
   Oco: cilindro vira tubo (sem tampas, como uma torre); cone, pirâmide e cúpula viram casca sem chão. */
var shape2 = { type: 'cyl', hollow: false };
try { var s20 = JSON.parse(localStorage.getItem('bloco-a-bloco-shape2') || 'null'); if (s20) shape2 = Object.assign(shape2, s20); } catch (e) {}
var SHAPE2_NAMES = { cyl: 'Cilindro', cone: 'Cone', pyr: 'Pirâmide', dome: 'Cúpula', arch: 'Arco' };
function shape2Height(t) { return t === 'cyl' || t === 'cone' || t === 'arch'; }
function shape2Save() { try { localStorage.setItem('bloco-a-bloco-shape2', JSON.stringify(shape2)); } catch (e) {} }
/* Células da forma: a = primeiro clique; b = segundo clique (com a altura escolhida, nas formas de três cliques) */
function shape2Cells(a, b) {
  var t = shape2.type, out = [], solid = new Set(), key = function (x, y, z) { return x + ',' + y + ',' + z; };
  var add = function (x, y, z) { var k = key(x, y, z); if (!solid.has(k)) { solid.add(k); out.push([x, y, z]); } };
  var y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1]), up = b[1] >= a[1];
  if (t === 'cyl' || t === 'cone' || t === 'dome') {
    var r = Math.round(Math.hypot(b[0] - a[0], b[2] - a[2])), h = y1 - y0;
    if (t === 'dome') { y0 = a[1]; y1 = a[1] + r; up = true; h = r; }
    for (var y = y0; y <= y1; y++) {
      var i = up ? y - y0 : y1 - y, rr = r; // i: camadas a partir da base
      if (t === 'cone') rr = r * (1 - i / (h + 1));
      for (var dz = -r; dz <= r; dz++) for (var dx = -r; dx <= r; dx++) {
        var d2 = dx * dx + dz * dz;
        if (t === 'dome') { if (d2 + i * i > (r + 0.5) * (r + 0.5)) continue; }
        else if (d2 > (rr + 0.5) * (rr + 0.5)) continue;
        add(a[0] + dx, y, a[2] + dz);
      }
    }
  } else if (t === 'pyr') {
    var x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]), z0 = Math.min(a[2], b[2]), z1 = Math.max(a[2], b[2]);
    for (var k = 0; x0 + k <= x1 - k && z0 + k <= z1 - k; k++) for (var z2 = z0 + k; z2 <= z1 - k; z2++) for (var x2 = x0 + k; x2 <= x1 - k; x2++) add(x2, a[1] + k, z2);
  } else if (t === 'arch') {
    // os dois pés na linha do eixo mais comprido; o arco é um anel de 1 bloco (meia elipse) do chão até o topo
    var ax = Math.abs(b[0] - a[0]) >= Math.abs(b[2] - a[2]) ? 0 : 2, lo = Math.min(a[ax], b[ax]), L = Math.abs(b[ax] - a[ax]) + 1, H = Math.max(1, y1 - a[1]);
    var A = L / 2, B = H + 1;
    var inEl = function (u, v) { if (u < 0 || u >= L || v < 0) return v < 0 && u >= 0 && u < L; var px = u + 0.5 - A, py = v + 0.5; return (px * px) / (A * A) + (py * py) / (B * B) <= 1; };
    // contorno: blocos da meia elipse com algum vizinho (inclusive na diagonal) do lado de fora; assim o anel fica
    // ligado face com face, sem buracos nas partes inclinadas
    for (var u = 0; u < L; u++) for (var v = 0; v <= H; v++) {
      if (!inEl(u, v)) continue;
      var edge = false;
      for (var du = -1; du <= 1 && !edge; du++) for (var dv = -1; dv <= 1; dv++) if ((du || dv) && !inEl(u + du, v + dv)) { edge = true; break; }
      if (!edge) continue;
      var p = [a[0], a[1] + v, a[2]]; p[ax] = lo + u; add(p[0], p[1], p[2]);
    }
    return out;
  }
  if (!shape2.hollow) return out;
  // oco: só os blocos com um vizinho de fora nos lados (e em cima, menos no cilindro, que vira tubo aberto)
  var top = t !== 'cyl';
  return out.filter(function (c) {
    var x = c[0], y = c[1], z = c[2];
    return !solid.has(key(x + 1, y, z)) || !solid.has(key(x - 1, y, z)) || !solid.has(key(x, y, z + 1)) || !solid.has(key(x, y, z - 1)) || (top && !solid.has(key(x, y + 1, z)));
  });
}
function updateShape2Chip() {
  var c = $('shape2Chip'), on = tool === 'shape2'; c.hidden = !on; if (!on) return;
  c.querySelectorAll('[data-s2]').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-s2') === shape2.type); });
  $('shape2Hollow').setAttribute('aria-pressed', String(shape2.hollow));
  $('shape2Hollow').disabled = shape2.type === 'arch';
}
$('shape2Chip').addEventListener('click', function (e) {
  var b = e.target.closest('button'); if (!b) return;
  if (b.hasAttribute('data-s2')) { shape2.type = b.getAttribute('data-s2'); anchor = null; updateAnchorChip(); }
  else if (b.id === 'shape2Hollow') shape2.hollow = !shape2.hollow;
  shape2Save(); updateShape2Chip(); updatePreview();
});

/* ---------- Balde: preencher uma área fechada ---------- */
/* Clique num bloco: enche o espaço vazio ligado ao ponto clicado, no plano da face clicada (no chão: a camada de cima;
   numa parede: o plano da parede), até bater nos blocos. Só enche áreas fechadas: se o vazio escapa da caixa da
   construção, nada é feito. Shift + clique: troca a região ligada do mesmo bloco clicado pelo bloco da hotbar. */
var FILL_MAX = 4e6;
function fillAt(t, shift) {
  if (!t || !t.hit) { toast('Clique num bloco: o balde enche o espaço fechado ao lado da face clicada.'); return; }
  var n = t.normal || [0, 1, 0], ax = n[0] ? 0 : n[1] ? 1 : 2, u = ax === 0 ? 1 : 0, w = ax === 2 ? 1 : 2; // eixos do plano
  var start = shift ? t.hit : t.place, from = shift ? gget(t.hit[0], t.hit[1], t.hit[2]) : 0;
  if (!start || !inB(start[0], start[1], start[2])) return;
  if (!shift && gget(start[0], start[1], start[2])) { toast('Esse espaço já tem bloco.'); return; }
  var bb = bbox(); if (!bb) return;
  var lo = [bb.minX, bb.minY, bb.minZ], hi = [bb.maxX, bb.maxY, bb.maxZ];
  var to = curBlock() === AIR_BI ? 0 : mkCell(curBlock(), orientFor(curBlock(), t));
  if (BLOCKS[curBlock()].shape) { var ps = placeShape(curBlock(), t); to = mkCell(ps.bi, ps.s); }
  if (!shift && !to) { toast('Escolha um bloco na hotbar para encher.'); return; }
  var seen = new Set(), list = [], st = [start.slice()], leak = false, cut = false;
  var same = function (p) { var v = gget(p[0], p[1], p[2]); return shift ? v === from : !v; };
  seen.add(start.join());
  while (st.length) {
    var p = st.pop(); list.push(p);
    if (list.length > FILL_MAX) { cut = true; break; }
    for (var s = 0; s < 4; s++) {
      var q = p.slice(); if (s === 0) q[u]++; else if (s === 1) q[u]--; else if (s === 2) q[w]++; else q[w]--;
      if (shift ? !inB(q[0], q[1], q[2]) : (q[u] < lo[u] || q[u] > hi[u] || q[w] < lo[w] || q[w] > hi[w])) { if (!shift) { leak = true; break; } continue; }
      var k = q.join(); if (seen.has(k) || !same(q)) continue;
      seen.add(k); st.push(q);
    }
    if (leak) break;
  }
  if (leak) { toast('Essa área não é fechada: o espaço vazio escapa pelos lados. Feche com blocos e tente de novo.', 6000); return; }
  if (cut) { toast('Área grande demais para o balde (mais de 4 milhões de blocos).', 6000); return; }
  beginBatch();
  list.forEach(function (c) { if (c[1] <= layerMax()) editSet(c[0], c[1], c[2], shift ? (to || 0) : to); });
  endBatch();
  toast((shift ? 'Trocados ' : 'Preenchidos ') + list.length + ' blocos.');
}
/* Prévia do balde: a região que vai ser preenchida (até 40 mil blocos) */
function fillPreview(t, color) {
  if (!t || !t.hit) return;
  var n = t.normal || [0, 1, 0], c = lastShift ? t.hit : t.place;
  ghostEdges.material.color.copy(color); setBoxAt(ghostEdges, c); ghostEdges.visible = true;
}
