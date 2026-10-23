/* ---------- Pincel de campo: discos, anéis, arcos, espirais, cascas e funis com gradiente ---------- */
/* O Arco é o disco com o recorte de ângulo já em 0° a 180° (o recorte vale para todas as formas: o gomo aberto da casca). */
/* Formas em volta de um centro, num plano (o chão, a face clicada ou o plano da câmera, mais uma inclinação), e o bloco
   de cada voxel escolhido por um gradiente: uma lista ordenada de blocos ao longo de um eixo (o raio, o ângulo, a altura
   ou a espessura). Serve para discos de acreção, galáxias, anéis de planeta, atmosferas, portais, crateras, degradês...
   Uso: 1º clique = centro; o ponteiro dá o raio (o ponto do plano da forma sob o ponteiro); 2º clique fixa o tamanho e
   deixa a forma pendente (a prévia colorida é o resultado final: os sorteios vêm de um hash da posição e de uma semente);
   Enter, o botão Gravar ou mais um clique gravam; Esc cancela. Tudo num lote de desfazer.
   Para cada voxel da caixa que contém a forma: p = centro do voxel - centro; (a, b, w) = p no referencial do plano
   (u, v no plano; n a normal); r = √(a² + b²), θ = atan2(b, a). A forma diz se o voxel entra e devolve s (0 a 1, de dentro
   para fora). O eixo do gradiente dá t; t recebe as estrias (ruído 3D numa volta do círculo, esticado ao longo dela e
   torcido pelo log do raio, para o padrão girar em espiral), o deslocamento pelo ângulo (um lado mais perto do começo da
   lista) e vira um bloco: pontilhado (sorteia entre as duas paradas vizinhas pela distância) ou em faixas. */
var FIELD_PRESETS = [
  ['Disco quente', ['sea_lantern', 'pearlescent_froglight', 'glowstone', 'ochre_froglight', 'orange_concrete', 'magma_block', 'red_concrete', 'red_nether_bricks', 'blackstone']],
  ['Galáxia', ['sea_lantern', 'pearlescent_froglight', 'white_concrete', 'light_blue_concrete', 'blue_concrete', 'purple_concrete', 'black_concrete']],
  ['Arco-íris', ['red_concrete', 'orange_concrete', 'yellow_concrete', 'lime_concrete', 'cyan_concrete', 'light_blue_concrete', 'blue_concrete', 'purple_concrete', 'magenta_concrete']],
  ['Céu', ['white_concrete', 'light_blue_concrete', 'cyan_concrete', 'blue_concrete']],
  ['Pôr do sol', ['yellow_concrete', 'orange_concrete', 'red_concrete', 'magenta_concrete', 'purple_concrete', 'blue_concrete']],
  ['Fogo', ['shroomlight', 'glowstone', 'orange_concrete', 'magma_block', 'red_concrete', 'black_concrete']],
  ['Gelo', ['white_concrete', 'snow_block', 'packed_ice', 'blue_ice', 'light_blue_concrete']],
  ['Pedra', ['white_concrete', 'calcite', 'diorite', 'andesite', 'stone', 'cobblestone', 'deepslate', 'blackstone']],
  ['Neon', ['cyan_concrete', 'light_blue_concrete', 'blue_concrete', 'purple_concrete', 'magenta_concrete']]
];
var FIELD_SHAPES = [['disk', 'Disco'], ['torus', 'Toro'], ['arc', 'Arco'], ['spiral', 'Espiral'], ['shell', 'Casca'], ['funnel', 'Funil']];
var FIELD_MAX = 96;
var fld = { shape: 'disk', plane: 'floor', tilt: 0, ri: 30, T: 3, taper: true, hollow: false, arms: 3, twist: 1.9, depth: 20,
  a0: 0, a1: 360, pat: 'full', gap: 4, spokes: 16, grad: FIELD_PRESETS[0][1].slice(), axis: 'r', dither: true, inv: false, shift: 0, streak: 30, stw: 0.35, dens: 100, empty: false, seed: 1 };
try { var fl0 = JSON.parse(localStorage.getItem('bloco-a-bloco-campo') || 'null'); if (fl0) fld = Object.assign(fld, fl0); } catch (e) {}
function fieldSave() { try { localStorage.setItem('bloco-a-bloco-campo', JSON.stringify(fld)); } catch (e) {} }
/* A forma em andamento: { c: centro [x, y, z] (meio do bloco), F: referencial, R, fixed: o tamanho já foi escolhido } */
var fcur = null, fsCache = null;

/* ---------- Matemática ---------- */
function fHash(x, y, z, k) { var h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 1274126177) ^ Math.imul(k | 0, 2246822519); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function fNoise3(x, y, z) {
  var xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), fx = x - xi, fy = y - yi, fz = z - zi, s = function (t) { return t * t * (3 - 2 * t); };
  var u = s(fx), v = s(fy), w = s(fz), h = function (a, b, c) { return fHash(xi + a, yi + b, zi + c, 77); };
  var x00 = h(0, 0, 0) + (h(1, 0, 0) - h(0, 0, 0)) * u, x10 = h(0, 1, 0) + (h(1, 1, 0) - h(0, 1, 0)) * u;
  var x01 = h(0, 0, 1) + (h(1, 0, 1) - h(0, 0, 1)) * u, x11 = h(0, 1, 1) + (h(1, 1, 1) - h(0, 1, 1)) * u;
  var y0 = x00 + (x10 - x00) * v, y1 = x01 + (x11 - x01) * v;
  return y0 + (y1 - y0) * w;
}
function fNorm(a) { var l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
function fCross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function fDot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
/* Referencial do plano de normal n0, inclinado tilt graus em volta de u. No chão, u = leste e v = norte; num plano em pé,
   v aponta para cima (0° é a direita, 90° é o alto). */
function fieldFrame(n0, tilt) {
  var n = fNorm(n0), up = Math.abs(n[1]) > 0.9 ? [0, 0, -1] : [0, 1, 0], u = fNorm(fCross(up, n));
  var a = tilt * Math.PI / 180, nu = fCross(u, n);
  n = fNorm([n[0] * Math.cos(a) + nu[0] * Math.sin(a), n[1] * Math.cos(a) + nu[1] * Math.sin(a), n[2] * Math.cos(a) + nu[2] * Math.sin(a)]);
  return { u: u, v: fCross(n, u), n: n };
}
function fieldBis() {
  return fld.grad.map(function (j) { return j === 'air' ? AIR_BI : j in BY_JAVA ? BY_JAVA[j] : -1; });
}
/* Os voxels da forma: { list (x, y, z, bloco, ...), n } ou { err } */
function fieldCells(P, limit) {
  var o = fld, R = P.R, F = P.F, c = P.c, bis = fieldBis();
  if (bis.length < 1 || bis.some(function (b) { return b < 0; })) return { err: 'O gradiente tem um bloco que não existe. Ajuste em Ajustes…' };
  var T = Math.max(1, o.T), Ri = Math.max(0, Math.min(R - 1, R * o.ri / 100)), rho = Math.max(1, Math.min(T / 2, R / 2)), k = 1.5;
  var fInv = function (q) { return 1 / (q + k) - 1 / (R + k); }, fDen = fInv(Ri) || 1;
  var wc = function (q) { return -o.depth * fInv(q) / fDen; }; // altura do funil (0 na borda, -profundidade no raio interno)
  var Hn = o.shape === 'shell' ? R : o.shape === 'torus' ? rho : o.shape === 'funnel' ? Math.abs(o.depth) + T : o.shape === 'spiral' ? Math.max(T, R * o.ri / 100) : T / 2 + 0.5;
  var e = [0, 1, 2].map(function (i) { var ni = Math.abs(F.n[i]); return Math.ceil((o.shape === 'shell' ? R : R * Math.sqrt(Math.max(0, 1 - ni * ni)) + Hn * ni) + 1); });
  var lo = [Math.max(0, Math.floor(c[0] - e[0])), Math.max(0, Math.floor(c[1] - e[1])), Math.max(0, Math.floor(c[2] - e[2]))];
  var hi = [Math.min(SX - 1, Math.ceil(c[0] + e[0])), Math.min(SY - 1, Math.ceil(c[1] + e[1])), Math.min(SZ - 1, Math.ceil(c[2] + e[2]))];
  var ylo = c[1] - e[1], yspan = Math.max(1, 2 * e[1]);
  var a0 = ((o.a0 % 360) + 360) % 360, a1 = ((o.a1 % 360) + 360) % 360, full = Math.abs(o.a1 - o.a0) >= 360;
  var out = [], n = 0, seed = o.seed, nb = bis.length, TAU = Math.PI * 2, st = o.streak / 100, sh = o.shift / 100;
  for (var x = lo[0]; x <= hi[0]; x++) for (var y = lo[1]; y <= hi[1]; y++) for (var z = lo[2]; z <= hi[2]; z++) {
    var px = x + 0.5 - c[0], py = y + 0.5 - c[1], pz = z + 0.5 - c[2];
    var a = px * F.u[0] + py * F.u[1] + pz * F.u[2], b = px * F.v[0] + py * F.v[1] + pz * F.v[2], w = px * F.n[0] + py * F.n[1] + pz * F.n[2];
    var r = Math.sqrt(a * a + b * b), th = Math.atan2(b, a), s = -1, wn = 0.5, ht;
    switch (o.shape) {
      case 'disk': case 'arc':
        if (r < Ri || r > R) break;
        s = R > Ri ? (r - Ri) / (R - Ri) : 0; ht = Math.max(0.5, o.taper ? (T - (T - 1) * s) / 2 : T / 2);
        if (Math.abs(w) > ht + 0.01) s = -1; else wn = (w / ht + 1) / 2;
        break;
      case 'torus':
        var Rc = R - rho, d = Math.hypot(r - Rc, w);
        if (d > rho || (o.hollow && d < rho - 1.5)) break;
        s = (r - (Rc - rho)) / (2 * rho); wn = (w / rho + 1) / 2; break;
      case 'spiral':
        var Rk = Math.max(2, R * o.ri / 100);
        if (Math.hypot(r, w * 1.6) <= Rk) { s = r / R; wn = (w / Rk + 1) / 2; break; }
        if (r > R) break;
        s = r / R; ht = Math.max(0.5, o.taper ? (T - (T - 1) * s) / 2 : T / 2);
        if (Math.abs(w) > ht + 0.01 || Math.cos(o.arms * (th - o.twist * Math.log(r + 0.5))) < 0.35 + 0.3 * s) s = -1; else wn = (w / ht + 1) / 2;
        break;
      case 'shell':
        var dd = Math.sqrt(r * r + w * w);
        if (dd > R || dd < R - T) break;
        s = T > 0 ? (dd - (R - T)) / T : 0; wn = (w / R + 1) / 2; break;
      case 'funnel':
        if (r < Ri || r > R) break;
        var w1 = wc(Math.max(Ri, r - 0.75)), w2 = wc(Math.min(R, r + 0.75)), ex = (T - 1) / 2 + 0.5;
        if (w < Math.min(w1, w2) - ex || w > Math.max(w1, w2) + ex) break;
        s = R > Ri ? (r - Ri) / (R - Ri) : 0; wn = Math.min(1, -wc(r) / (o.depth || 1)); break;
    }
    if (s < 0) continue;
    if (!full) { var dg = (th * 180 / Math.PI + 360) % 360; if (a0 <= a1 ? dg < a0 || dg > a1 : dg < a0 && dg > a1) continue; } // só de a0 a a1 graus
    // padrão: só anéis, só raios ou a grade
    if (o.pat !== 'full') {
      var ring = Math.abs(r - Math.round(r / o.gap) * o.gap) < 0.6, spoke = Math.abs(Math.sin(o.spokes / 2 * th)) * r < 0.75;
      if (o.pat === 'rings' ? !ring : o.pat === 'spokes' ? !spoke : !(ring || spoke)) continue;
    }
    if (o.dens < 100 && fHash(x, y, z, seed * 7 + 1) > 1 - (1 - o.dens / 100) * s * s) continue; // mais ralo para a borda
    var t = o.axis === 'r' ? s : o.axis === 'ang' ? ((th / TAU) + 1) % 1 : o.axis === 'y' ? (y + 0.5 - ylo) / yspan : wn;
    if (o.inv) t = 1 - t;
    if (st) { var ph = th + o.stw * Math.log(r + 1); t += st * 0.6 * (fNoise3(r * 0.8, Math.cos(ph) * 2.2 + 9, Math.sin(ph) * 2.2) - 0.5); }
    if (sh) t -= sh * 0.3 * Math.cos(th);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    var q = t * (nb - 1), i = Math.floor(q), f = q - i, bi;
    if (i >= nb - 1) bi = bis[nb - 1];
    else bi = o.dither ? (fHash(x, y, z, seed * 7 + 2) < f ? bis[i + 1] : bis[i]) : bis[f < 0.5 ? i : i + 1];
    if (bi === AIR_BI) continue;
    if (o.empty && gget(x, y, z)) continue;
    out.push(x, y, z, bi); n++;
    if (limit && n >= limit) return { list: out, n: n, cut: true };
  }
  return { list: out, n: n };
}

/* ---------- Cliques e teclas ---------- */
/* Centro e plano a partir do alvo do clique */
function fieldStart(t) {
  var cell = t && (t.place || t.hit); if (!cell) return false;
  var c = [cell[0] + 0.5, cell[1] + 0.5, cell[2] + 0.5], n0 = [0, 1, 0];
  if (fld.plane === 'face' && t.normal) n0 = t.normal.slice();
  else if (fld.plane === 'cam') n0 = [camera.position.x - c[0], camera.position.y - c[1], camera.position.z - c[2]];
  fcur = { c: c, n0: n0, F: fieldFrame(n0, fld.tilt), R: 4, fixed: false };
  return true;
}
/* Raio pelo ponteiro: o ponto do plano da forma sob o ponteiro (ou o ponto do raio mais perto do centro, com o plano de lado) */
function fieldRadiusAt(cx, cy) {
  var r = rayFrom(cx, cy), c = fcur.c, n = fcur.F.n, dn = fDot(r.d, n), q;
  var oc = [c[0] - r.o[0], c[1] - r.o[1], c[2] - r.o[2]];
  if (Math.abs(dn) > 0.15 && fcur.F) { var s = fDot(oc, n) / dn; if (s > 0) q = [r.o[0] + r.d[0] * s, r.o[1] + r.d[1] * s, r.o[2] + r.d[2] * s]; }
  if (!q) { var s2 = fDot(oc, r.d); q = [r.o[0] + r.d[0] * s2, r.o[1] + r.d[1] * s2, r.o[2] + r.d[2] * s2]; }
  return Math.max(2, Math.min(FIELD_MAX, Math.round(Math.hypot(q[0] - c[0], q[1] - c[1], q[2] - c[2]))));
}
function fieldPress(cx, cy, t) {
  if (fcur && fcur.fixed) { fieldRun(); return; }
  if (!fcur) { if (!fieldStart(t)) return; fieldChanged(); toast('Centro marcado. Mova o ponteiro para o tamanho e clique de novo (Esc cancela).', 3000); return; }
  fcur.R = fieldRadiusAt(cx, cy); fcur.fixed = true; fieldChanged();
}
function fieldHover(cx, cy) {
  if (!fcur || fcur.fixed) return;
  var R = fieldRadiusAt(cx, cy); if (R !== fcur.R) { fcur.R = R; fieldChanged(); }
}
function fieldChanged() { fsCache = null; updatePreview(); }
function fieldCancel() { fcur = null; fieldChanged(); }
function fieldRun() {
  if (!fcur) return;
  var r = fieldCells(fcur);
  if (r.err) { toast(r.err, 5000); return; }
  if (r.n > 4e6) { toast('São ' + Math.round(r.n / 1e6) + ' milhões de blocos de uma vez: diminua o raio ou a espessura.', 6000); return; }
  beginBatch('Pincel de campo');
  var L = r.list, cnt = {};
  for (var i = 0; i < L.length; i += 4) { editSet(L[i], L[i + 1], L[i + 2], mkCell(L[i + 3])); cnt[L[i + 3]] = (cnt[L[i + 3]] || 0) + 1; }
  endBatch();
  fld.seed = (fld.seed % 99991) + 1; fieldSave(); // o próximo sai com outro sorteio
  fcur = null; fieldChanged();
  toast(r.n.toLocaleString('pt-BR') + ' blocos: ' + Object.keys(cnt).sort(function (a, b) { return cnt[b] - cnt[a]; }).slice(0, 5).map(function (k) { return BLOCKS[k].name + ' ' + Math.round(100 * cnt[k] / r.n) + '%'; }).join(' · ') + '. Ctrl+Z desfaz.', 6000);
}
function setFieldR(R) { if (!fcur) return; fcur.R = Math.max(2, Math.min(FIELD_MAX, R)); fcur.fixed = true; fieldChanged(); }
function fieldKey(e, k) {
  if (tool !== 'field' || walk || e.ctrlKey || e.metaKey || e.altKey) return false;
  if ((k === '-' || k === '=' || k === '+') && fcur) { setFieldR(fcur.R + (k === '-' ? -1 : 1) * (e.shiftKey && k !== '+' ? 5 : 1)); return true; }
  if (k === 'enter' && fcur) { e.preventDefault(); fieldRun(); return true; }
  return false;
}

/* ---------- Aviso do canto e prévia ---------- */
function fieldGradBar() { return mixBarHtml(fld.grad.map(function (j) { return [j, 1]; })); }
function updateFieldChip() {
  var c = $('fieldChip'), on = tool === 'field' && !walk;
  c.hidden = !on;
  if (!on) { if (fcur) { fcur = null; fsCache = null; } return; }
  $('fldTxt').innerHTML = '<b>Campo</b>' + fieldGradBar() + '<span class="mixl">' + (fcur ? (fcur.fixed ? 'raio ' + fcur.R + ' · Enter grava' : 'raio ' + fcur.R + ' · clique fixa') : 'clique no centro') + '</span>';
  c.querySelectorAll('[data-fs]').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-fs') === fld.shape); });
  c.querySelectorAll('[data-fp]').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-fp') === fld.plane); });
  $('fldR').textContent = fcur ? fcur.R : '–';
  $('fldGo').disabled = $('fldNo').disabled = !fcur;
}
function fieldPreview(t, accent) {
  var m = new THREE.Matrix4(), col = new THREE.Color();
  if (!fcur) { var cell = t && (t.place || t.hit); if (cell) { ghostEdges.material.color.copy(accent); setBoxAt(ghostEdges, cell); ghostEdges.visible = true; } return; }
  if (!fsCache) fsCache = fieldCells(fcur, previewInst.instanceMatrix.count);
  var r = fsCache; if (r.err) return;
  if (!previewInst.instanceColor) { previewInst.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(previewInst.instanceMatrix.count * 3).fill(1), 3); previewInst.material.needsUpdate = true; }
  for (var i = 0, j = 0; i < r.list.length; i += 4, j++) {
    m.setPosition(r.list[i] + 0.5, r.list[i + 1] + 0.5, r.list[i + 2] + 0.5); previewInst.setMatrixAt(j, m);
    var q = BLOCKS[r.list[i + 3]].top || [150, 150, 150]; col.setRGB(q[0] / 255, q[1] / 255, q[2] / 255); previewInst.setColorAt(j, col);
  }
  previewInst.count = r.n; previewInst.instanceMatrix.needsUpdate = true; previewInst.instanceColor.needsUpdate = true;
  previewInst.material.color.setRGB(1, 1, 1); mixPrevCol = true;
  ghostEdges.material.color.copy(accent); setBoxAt(ghostEdges, [Math.floor(fcur.c[0]), Math.floor(fcur.c[1]), Math.floor(fcur.c[2])]); ghostEdges.visible = true;
}
$('fieldChip').addEventListener('click', function (e) {
  var b = e.target.closest('button'); if (!b) return;
  if (b.hasAttribute('data-fs')) { fld.shape = b.getAttribute('data-fs'); if (fld.shape === 'arc') { fld.a0 = 0; fld.a1 = 180; } else { fld.a0 = 0; fld.a1 = 360; } fieldSave(); fieldChanged(); } // o arco começa na metade de cima
  else if (b.hasAttribute('data-fp')) { fld.plane = b.getAttribute('data-fp'); fieldSave(); if (fcur) { var c = fcur.c, n0 = fld.plane === 'cam' ? [camera.position.x - c[0], camera.position.y - c[1], camera.position.z - c[2]] : fld.plane === 'face' ? fcur.n0 : [0, 1, 0]; fcur.F = fieldFrame(n0, fld.tilt); } fieldChanged(); }
  else if (b.id === 'fldMinus') setFieldR(fcur ? fcur.R - 1 : 0);
  else if (b.id === 'fldPlus') setFieldR(fcur ? fcur.R + 1 : 0);
  else if (b.id === 'fldEdit') openFieldEditor();
  else if (b.id === 'fldGo') fieldRun();
  else if (b.id === 'fldNo') fieldCancel();
});

/* ---------- Janela: ajustes da forma e o gradiente ---------- */
function openFieldEditor() {
  var o = JSON.parse(JSON.stringify(fld)), rows = o.grad.slice();
  var list = '<option value="ar">Ar (deixa vazio)</option>' + BLOCKS.map(function (b, i) { return b.hide || b.isAir || !mixOk(i) ? '' : '<option value="' + esc(b.java) + '">' + esc(b.name) + '</option>'; }).join('');
  var num = function (id, lab, min, max, step, v, only) { return '<label data-only="' + (only || '') + '">' + lab + '<input type="number" id="' + id + '" min="' + min + '" max="' + max + '" step="' + step + '" value="' + v + '"></label>'; };
  var rng = function (id, lab, min, max, v, only, unit) { return '<label data-only="' + (only || '') + '"><span>' + lab + ': <b id="' + id + 'v">' + v + '</b>' + (unit || '') + '</span><input type="range" id="' + id + '" min="' + min + '" max="' + max + '" value="' + v + '"></label>'; };
  var chk = function (id, lab, v, only) { return '<label class="check" data-only="' + (only || '') + '"><input type="checkbox" id="' + id + '"' + (v ? ' checked' : '') + '><span>' + lab + '</span></label>'; };
  openDialog('<h3>Pincel de campo</h3>' +
    '<div class="row"><label style="flex:1">Forma<select id="fdShape">' + FIELD_SHAPES.map(function (s) { return '<option value="' + s[0] + '"' + (s[0] === o.shape ? ' selected' : '') + '>' + s[1] + '</option>'; }).join('') + '</select></label>' +
    '<label style="flex:1">Plano<select id="fdPlane"><option value="floor">O chão (deitada)</option><option value="face">A face clicada</option><option value="cam">O plano da câmera (de frente)</option></select></label></div>' +
    rng('fdTilt', 'Inclinação', -90, 90, o.tilt, '', '°') +
    '<div class="row">' + num('fdRi', 'Raio interno (% do raio)', 0, 95, 1, o.ri, 'disk arc spiral funnel') + num('fdT', 'Espessura (blocos)', 1, 48, 1, o.T) + '</div>' +
    chk('fdTaper', 'Afinar para a borda (grossa no centro, 1 bloco na borda)', o.taper, 'disk arc spiral') + chk('fdHollow', 'Oco (só a casca do toro)', o.hollow, 'torus') +
    '<div class="row">' + num('fdA0', 'Só de (°)', -360, 360, 5, o.a0) + num('fdA1', 'até (°; 0 a 360 = a volta inteira)', -360, 720, 5, o.a1) + '</div>' +
    '<div class="row">' + num('fdArms', 'Braços', 1, 8, 1, o.arms, 'spiral') + num('fdTw', 'Torção', -6, 6, 0.1, o.twist, 'spiral') + num('fdDepth', 'Profundidade (negativa: sobe)', -96, 96, 1, o.depth, 'funnel') + '</div>' +
    '<div class="row"><label style="flex:1">Padrão<select id="fdPat"><option value="full">Cheio</option><option value="rings">Só anéis</option><option value="spokes">Só raios</option><option value="grid">Grade (anéis e raios)</option></select></label>' + num('fdGap', 'Anéis a cada', 2, 32, 1, o.gap) + num('fdSp', 'Raios', 3, 64, 1, o.spokes) + '</div>' +
    '<h4>Gradiente</h4><p class="pen">Do primeiro ao último bloco, ao longo do eixo. Na transição pontilhada, cada voxel sorteia entre os dois blocos vizinhos pela distância, e a passagem fica suave.</p>' +
    '<div class="row"><label style="flex:1">Começar de um pronto<select id="fdPre"><option value="">—</option>' + FIELD_PRESETS.map(function (p, i) { return '<option value="' + i + '">' + esc(p[0]) + '</option>'; }).join('') + '</select></label></div>' +
    '<div id="fdRows" class="mxrows"></div><datalist id="fdList">' + list + '</datalist><div id="fdBar"></div>' +
    '<div class="row"><button class="btn" id="fdAdd">+ Bloco</button><button class="btn" id="fdHot">+ Bloco da hotbar</button><button class="btn" id="fdRev">Inverter a ordem</button></div>' +
    '<div class="row"><label style="flex:1">Eixo<select id="fdAxis"><option value="r">Raio (de dentro para fora)</option><option value="ang">Ângulo (a volta)</option><option value="y">Altura (Y)</option><option value="w">Espessura (no funil: a profundidade)</option></select></label>' +
    '<label style="flex:1">Transição<select id="fdDith"><option value="1">Pontilhada</option><option value="0">Em faixas</option></select></label></div>' +
    rng('fdStreak', 'Estrias', 0, 100, o.streak, '', '%') + num('fdStw', 'Torção das estrias', -3, 3, 0.05, o.stw) +
    rng('fdShift', 'Deslocar pelo ângulo (um lado mais perto do primeiro bloco)', -100, 100, o.shift, '', '%') +
    rng('fdDens', 'Densidade na borda', 0, 100, o.dens, '', '%') +
    chk('fdEmpty', 'Só nos espaços vazios (não troca o que já está construído)', o.empty) +
    '<p class="err" id="fdErr" hidden></p>' +
    '<div class="row"><button class="btn primary" id="fdOk">Usar</button><button class="btn" id="fdNo">Cancelar</button></div>', function () {
    overlayRoot.querySelector('.dialog').classList.add('wide');
    $('fdPlane').value = o.plane; $('fdPat').value = o.pat; $('fdAxis').value = o.axis; $('fdDith').value = o.dither ? '1' : '0';
    var only = function () { var s = $('fdShape').value; overlayRoot.querySelectorAll('[data-only]').forEach(function (el) { var a = el.getAttribute('data-only'); el.hidden = !!a && a.split(' ').indexOf(s) < 0; }); };
    $('fdShape').onchange = only; only();
    overlayRoot.querySelectorAll('input[type=range]').forEach(function (el) { el.oninput = function () { $(el.id + 'v').textContent = el.value; }; });
    var read = function () { overlayRoot.querySelectorAll('#fdRows .mxrow').forEach(function (el, i) { var t = el.querySelector('[data-mn]').value, bi = blockByText(t); rows[i] = bi === -2 ? 'air' : bi >= 0 ? BLOCKS[bi].java : t.trim(); }); };
    var draw = function () {
      $('fdRows').innerHTML = rows.map(function (j, i) {
        var bi = j === 'air' ? AIR_BI : j in BY_JAVA ? BY_JAVA[j] : -1;
        return '<div class="mxrow"><span class="sw" style="' + (bi >= 0 && bi !== AIR_BI ? swatch(BLOCKS[bi]) : 'background:transparent;border:1px dashed var(--line)') + '"></span><input type="text" data-mn list="fdList" value="' + esc(j === 'air' ? 'ar' : bi >= 0 ? BLOCKS[bi].name : j) + '" autocomplete="off" aria-label="Bloco ' + (i + 1) + '">' +
          '<button class="btn" data-gu="' + i + '" title="Subir"' + (i ? '' : ' disabled') + '>▲</button><button class="btn" data-gd="' + i + '" title="Descer"' + (i < rows.length - 1 ? '' : ' disabled') + '>▼</button><button class="btn" data-gx="' + i + '" title="Tirar"' + (rows.length <= 1 ? ' disabled' : '') + '>×</button></div>';
      }).join('');
      $('fdBar').innerHTML = mixBarHtml(rows.map(function (j) { return [j, 1]; }), true);
      $('fdAdd').disabled = $('fdHot').disabled = rows.length >= 16;
    };
    draw();
    $('fdRows').addEventListener('change', function () { read(); draw(); });
    $('fdRows').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return; read();
      var i;
      if (b.hasAttribute('data-gu')) { i = +b.getAttribute('data-gu'); rows.splice(i - 1, 2, rows[i], rows[i - 1]); }
      else if (b.hasAttribute('data-gd')) { i = +b.getAttribute('data-gd'); rows.splice(i, 2, rows[i + 1], rows[i]); }
      else if (b.hasAttribute('data-gx')) rows.splice(+b.getAttribute('data-gx'), 1);
      draw();
    });
    $('fdPre').onchange = function (e) { var p = FIELD_PRESETS[+e.target.value]; if (!p || e.target.value === '') return; rows = p[1].slice(); draw(); };
    $('fdAdd').onclick = function () { read(); rows.push(''); draw(); overlayRoot.querySelector('#fdRows .mxrow:last-child [data-mn]').focus(); };
    $('fdHot').onclick = function () { read(); var b = BLOCKS[curBlock()]; rows.push(b.isAir ? 'air' : b.java); draw(); };
    $('fdRev').onclick = function () { read(); rows.reverse(); draw(); };
    $('fdNo').onclick = closeDialog;
    $('fdOk').onclick = function () {
      read();
      var bad = rows.filter(function (j) { return j !== 'air' && (!(j in BY_JAVA) || !mixOk(BY_JAVA[j])); })[0];
      if (bad != null) { $('fdErr').hidden = false; $('fdErr').textContent = 'Bloco que não serve no gradiente: ' + (bad || '(vazio)') + '. Escolha um nome da lista.'; return; }
      var v = function (id) { return +$(id).value; };
      Object.assign(fld, { shape: $('fdShape').value, plane: $('fdPlane').value, tilt: v('fdTilt'), ri: Math.max(0, Math.min(95, v('fdRi'))), T: Math.max(1, Math.min(48, v('fdT') | 0)),
        taper: $('fdTaper').checked, hollow: $('fdHollow').checked, a0: v('fdA0'), a1: v('fdA1'), arms: Math.max(1, Math.min(8, v('fdArms') | 0)), twist: v('fdTw'),
        depth: Math.max(-96, Math.min(96, v('fdDepth') | 0)) || 1, pat: $('fdPat').value, gap: Math.max(2, v('fdGap') | 0), spokes: Math.max(3, v('fdSp') | 0),
        grad: rows, axis: $('fdAxis').value, dither: $('fdDith').value === '1', streak: v('fdStreak'), stw: v('fdStw'), shift: v('fdShift'), dens: v('fdDens'), empty: $('fdEmpty').checked });
      fieldSave(); closeDialog();
      if (fcur) { var c = fcur.c, n0 = fld.plane === 'cam' ? [camera.position.x - c[0], camera.position.y - c[1], camera.position.z - c[2]] : fld.plane === 'face' ? fcur.n0 : [0, 1, 0]; fcur.F = fieldFrame(n0, fld.tilt); }
      if (tool !== 'field') setTool('field');
      fieldChanged();
    };
  });
}
