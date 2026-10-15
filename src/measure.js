/* ---------- Medidas na tela ---------- */
/* Cotas como num desenho técnico: linha com setas e o número de blocos em X (largura), Z (profundidade) e Y (altura)
   em volta da construção. Com a Camada ligada, mostra o contorno da camada visível com a medida de cada lado (planta baixa).
   Liga e desliga em Projeto > Mostrar medidas ou com a tecla D. */
var measureOn = true, measureKey = null, measureObj = null, measureTex = {};
try { measureOn = localStorage.getItem('bloco-a-bloco-measure') !== '0'; } catch (e) {}
function setMeasure(on) {
  measureOn = on; try { localStorage.setItem('bloco-a-bloco-measure', on ? '1' : '0'); } catch (e) {}
  $('measureBtn').textContent = 'Mostrar medidas: ' + (on ? 'sim' : 'não');
  $('measTbtn').setAttribute('aria-pressed', String(on));
  measureKey = undefined; requestRender(); // undefined força refazer (null é o valor de "desligado" e pularia a remoção)
}
/* Caixa dos blocos na altura y (só os chunks dessa faixa) */
function sliceBounds(y) {
  var cy = y >> 4, ly = y & 15, b = null;
  W.forEach(function (ch) {
    if (ch.cy !== cy) return;
    var x0 = ch.cx << 4, z0 = ch.cz << 4;
    for (var o = ly << 8, e = o + 256; o < e; o++) {
      if (!(ch.d ? ch.pal[ch.d[o]] : ch.u)) continue;
      var x = x0 + (o & 15), z = z0 + ((o >> 4) & 15);
      if (!b) b = { minX: x, maxX: x, minZ: z, maxZ: z };
      else { if (x < b.minX) b.minX = x; if (x > b.maxX) b.maxX = x; if (z < b.minZ) b.minZ = z; if (z > b.maxZ) b.maxZ = z; }
    }
  });
  return b;
}
/* Número com contorno escuro, como nas imagens de referência */
function measureLabel(n, size) {
  var t = String(n), key = t;
  if (!measureTex[key]) {
    var c = document.createElement('canvas'), g = c.getContext('2d'), fs = 96;
    g.font = '800 ' + fs + 'px "Bricolage Grotesque", system-ui, sans-serif';
    var w = Math.ceil(g.measureText(t).width) + 40; c.width = w; c.height = 140;
    g.font = '800 ' + fs + 'px "Bricolage Grotesque", system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineJoin = 'round'; g.lineWidth = 18; g.strokeStyle = 'rgba(16,20,18,.92)'; g.strokeText(t, w / 2, 74);
    g.fillStyle = '#ffffff'; g.fillText(t, w / 2, 74);
    var tex = new THREE.CanvasTexture(c); tex.minFilter = THREE.LinearFilter;
    measureTex[key] = { tex: tex, ar: w / 140 };
  }
  var m = measureTex[key];
  // tamanho fixo na tela (não encolhe ao afastar a câmera)
  var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: m.tex, transparent: true, depthTest: false, sizeAttenuation: false }));
  sp.scale.set(0.05 * m.ar, 0.05, 1); sp.renderOrder = 10;
  return sp;
}
/* Traço grosso (caixa fina) de p a q: branco por cima de um contorno escuro, como nas imagens de referência */
var MEAS_W = null, MEAS_D = null;
function measSeg(group, p, q, w) {
  var d = new THREE.Vector3(q[0] - p[0], q[1] - p[1], q[2] - p[2]), L = d.length(); if (L < 1e-6) return;
  [[MEAS_D, w * 2.2, 9], [MEAS_W, w, 10]].forEach(function (e) {
    var m = new THREE.Mesh(new THREE.BoxGeometry(e[1], e[1], L + e[1] * 0.6), e[0]);
    m.position.set((p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2);
    m.lookAt(q[0], q[1], q[2]); m.renderOrder = e[2]; group.add(m);
  });
}
function measArrow(group, tip, dir, ah) {
  [[MEAS_D, 1.35, 9], [MEAS_W, 1, 10]].forEach(function (e) {
    var m = new THREE.Mesh(new THREE.ConeGeometry(ah * 0.42 * e[1], ah * e[1], 10), e[0]);
    // o cone nasce apontando para +Y; gira para apontar para "dir"
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dir[0], dir[1], dir[2]).normalize());
    m.position.set(tip[0] - dir[0] * ah * e[1] / 2, tip[1] - dir[1] * ah * e[1] / 2, tip[2] - dir[2] * ah * e[1] / 2);
    m.renderOrder = e[2]; group.add(m);
  });
}
/* Uma cota de a até b (pontos 3D), com setas nas pontas, linhas de chamada até o objeto e o número no meio */
function addDim(group, a, b, n, size, ext) {
  var d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L = Math.hypot(d[0], d[1], d[2]) || 1, u = [d[0] / L, d[1] / L, d[2] / L];
  var w = size * 0.07, ah = Math.min(size * 0.6, L / 3);
  measSeg(group, [a[0] + u[0] * ah * 0.9, a[1] + u[1] * ah * 0.9, a[2] + u[2] * ah * 0.9], [b[0] - u[0] * ah * 0.9, b[1] - u[1] * ah * 0.9, b[2] - u[2] * ah * 0.9], w);
  measArrow(group, a, [-u[0], -u[1], -u[2]], ah); measArrow(group, b, u, ah);
  // linhas de chamada: das pontas da cota de volta até a construção
  if (ext) [a, b].forEach(function (p) { measSeg(group, [p[0] + ext[0] * 0.25, p[1] + ext[1] * 0.25, p[2] + ext[2] * 0.25], [p[0] - ext[0], p[1] - ext[1], p[2] - ext[2]], w * 0.6); });
  var lb = measureLabel(n, size);
  lb.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  group.add(lb);
}
function updateMeasure(force) {
  if (!scene) return;
  var zb = Math.round(Math.log2(Math.max(4, cam.dist)) * 3); // a grossura acompanha o zoom (refaz a cada ~25% de zoom)
  var key = measureOn && blockCount ? [verCounter, layerOn, layerY, zb].join('|') : null;
  if (!force && key === measureKey) return;
  measureKey = key;
  if (measureObj) { scene.remove(measureObj); measureObj.traverse(function (o) { if (o.geometry) o.geometry.dispose(); if (o.material && o.material !== MEAS_W && o.material !== MEAS_D) o.material.dispose(); }); measureObj = null; }
  if (!key) return;
  var g = new THREE.Group(), bb;
  if (!MEAS_W) {
    MEAS_W = new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true });
    MEAS_D = new THREE.MeshBasicMaterial({ color: 0x101412, depthTest: false, transparent: true, opacity: 0.9 });
  }
  if (layerOn) {
    var sb = sliceBounds(layerY); if (!sb) return;
    if (sliceOutline(g, sb, layerY, zb)) { measureObj = g; scene.add(g); return; }
    bb = { minX: sb.minX, maxX: sb.maxX, minZ: sb.minZ, maxZ: sb.maxZ, minY: layerY, maxY: layerY }; // camada enorme: só as medidas totais
  } else { bb = bbox(); if (!bb) return; }
  var X0 = bb.minX, X1 = bb.maxX + 1, Z0 = bb.minZ, Z1 = bb.maxZ + 1, Y0 = bb.minY, Y1 = bb.maxY + 1;
  var big = Math.max(X1 - X0, Z1 - Z0, layerOn ? 0 : Y1 - Y0), size = Math.max(Math.min(14, big * 0.09), Math.pow(2, zb / 3) * 0.03, 0.6), off = Math.max(1.5, Math.min(big * 0.12, size * 1.4));
  var yb = layerOn ? Y1 + 0.02 : Y0 + 0.02; // na camada: em cima da fatia visível; senão, no chão da construção
  // X ao longo da frente (sul) e Z ao longo do lado oeste, como na planta
  addDim(g, [X0, yb, Z1 + off], [X1, yb, Z1 + off], X1 - X0, size, [0, 0, off]);
  addDim(g, [X0 - off, yb, Z0], [X0 - off, yb, Z1], Z1 - Z0, size, [-off, 0, 0]);
  if (!layerOn) addDim(g, [X1 + off, Y0, Z1 + off], [X1 + off, Y1, Z1 + off], Y1 - Y0, size, [off, 0, off]);
  measureObj = g; scene.add(g);
}

/* Camada: contorno da planta (os blocos da camada, com os buracos de dentro preenchidos) e a medida de cada lado,
   como numa planta baixa. O lado de fora é achado enchendo a grade a partir da borda; cada trecho reto da divisa
   entre dentro e fora vira uma linha com o número de blocos, escrito do lado de dentro. */
function sliceOutline(g, sb, y, zb) {
  var W2 = sb.maxX - sb.minX + 3, H2 = sb.maxZ - sb.minZ + 3, ox = sb.minX - 1, oz = sb.minZ - 1;
  if (W2 * H2 > 9e6) return false;
  var occ = new Uint8Array(W2 * H2), cy = y >> 4, ly = y & 15;
  W.forEach(function (ch) {
    if (ch.cy !== cy) return;
    var x0 = (ch.cx << 4) - ox, z0 = (ch.cz << 4) - oz;
    for (var o = ly << 8, e = o + 256; o < e; o++) if (ch.d ? ch.pal[ch.d[o]] : ch.u) occ[(z0 + ((o >> 4) & 15)) * W2 + x0 + (o & 15)] = 1;
  });
  // fora = 2: enche a partir do canto (a grade tem uma borda vazia em volta)
  var st = new Int32Array(W2 * H2), sp = 0; st[sp++] = 0; occ[0] = 2;
  while (sp) {
    var i = st[--sp], x = i % W2, z = (i - x) / W2;
    if (x > 0 && !occ[i - 1]) { occ[i - 1] = 2; st[sp++] = i - 1; }
    if (x < W2 - 1 && !occ[i + 1]) { occ[i + 1] = 2; st[sp++] = i + 1; }
    if (z > 0 && !occ[i - W2]) { occ[i - W2] = 2; st[sp++] = i - W2; }
    if (z < H2 - 1 && !occ[i + W2]) { occ[i + W2] = 2; st[sp++] = i + W2; }
  }
  var inside = function (x, z) { return occ[z * W2 + x] !== 2; }, segs = [];
  // linhas da divisa no sentido X (entre as fileiras z - 1 e z) e no sentido Z (entre as colunas x - 1 e x)
  for (var z = 1; z < H2; z++) for (var x = 0, run = null; x <= W2; x++) {
    var s = x < W2 ? (inside(x, z - 1) !== inside(x, z) ? (inside(x, z) ? 1 : -1) : 0) : 0;
    if (run && s !== run.s) { segs.push({ a: [run.x, z], b: [x, z], n: x - run.x, d: [0, run.s] }); run = null; }
    if (s && !run) run = { x: x, s: s };
  }
  for (var x2 = 1; x2 < W2; x2++) for (var z2 = 0, run2 = null; z2 <= H2; z2++) {
    var s2 = z2 < H2 ? (inside(x2 - 1, z2) !== inside(x2, z2) ? (inside(x2, z2) ? 1 : -1) : 0) : 0;
    if (run2 && s2 !== run2.s) { segs.push({ a: [x2, run2.z], b: [x2, z2], n: z2 - run2.z, d: [run2.s, 0] }); run2 = null; }
    if (s2 && !run2) run2 = { z: z2, s: s2 };
  }
  if (segs.length > 400) segs = segs.sort(function (p, q) { return q.n - p.n; }).slice(0, 400); // planta muito recortada: os lados maiores
  var size = Math.max(Math.pow(2, zb / 3) * 0.03, 0.5), w = size * 0.035, yy = y + 1.02, inset = size * 0.75;
  segs.forEach(function (sg) {
    var ax = sg.a[0] + ox, az = sg.a[1] + oz, bx = sg.b[0] + ox, bz = sg.b[1] + oz;
    measSeg(g, [ax, yy, az], [bx, yy, bz], w);
    var lb = measureLabel(sg.n, size), k = Math.min(inset, sg.n < 3 ? 0.45 : inset);
    if (sg.n < 3) lb.scale.multiplyScalar(0.72); // lados curtos: número menor, como na planta de referência
    lb.position.set((ax + bx) / 2 + sg.d[0] * k, yy, (az + bz) / 2 + sg.d[1] * k);
    g.add(lb);
  });
  return true;
}

/* ---------- Formas: medidas temporárias ---------- */
/* Enquanto a linha, a caixa ou a esfera está sendo desenhada, cotas mostram o tamanho da prévia (somem ao colocar
   ou cancelar). Aparecem mesmo com as medidas da construção desligadas. */
var shapeDimObj = null, shapeDimKey = '';
function shapeDimsClear() {
  if (shapeDimObj) { scene.remove(shapeDimObj); shapeDimObj.traverse(function (o) { if (o.geometry) o.geometry.dispose(); if (o.material && o.material !== MEAS_W && o.material !== MEAS_D) o.material.dispose(); }); shapeDimObj = null; }
  shapeDimKey = '';
}
function shapeDims(kind, a, b) {
  var zb = Math.round(Math.log2(Math.max(4, cam.dist)) * 3), key = [kind, a, b, zb].join('|');
  if (key === shapeDimKey) return;
  shapeDimsClear(); shapeDimKey = key;
  if (!MEAS_W) {
    MEAS_W = new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true });
    MEAS_D = new THREE.MeshBasicMaterial({ color: 0x101412, depthTest: false, transparent: true, opacity: 0.9 });
  }
  var g = new THREE.Group(), lo, hi;
  if (kind === 'sphere' || kind === 'hsphere') {
    var r = Math.round(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]));
    lo = [a[0] - r, a[1] - r, a[2] - r]; hi = [a[0] + r, a[1] + r, a[2] + r];
  } else { lo = [0, 1, 2].map(function (i) { return Math.min(a[i], b[i]); }); hi = [0, 1, 2].map(function (i) { return Math.max(a[i], b[i]); }); }
  var X0 = lo[0], X1 = hi[0] + 1, Y0 = lo[1], Y1 = hi[1] + 1, Z0 = lo[2], Z1 = hi[2] + 1;
  var big = Math.max(X1 - X0, Y1 - Y0, Z1 - Z0), size = Math.max(Math.min(8, big * 0.09), Math.pow(2, zb / 3) * 0.03, 0.5), off = Math.max(1, Math.min(big * 0.12, size * 1.2));
  if (kind === 'line') {
    var sg = rulerSeg(a, b), n = sg.aligned ? sg.n : Math.max(Math.abs(sg.d[0]), Math.abs(sg.d[1]), Math.abs(sg.d[2])) + 1; // blocos da linha
    var A = [a[0] + 0.5, a[1] + 0.5, a[2] + 0.5], B = [b[0] + 0.5, b[1] + 0.5, b[2] + 0.5];
    if (sg.aligned && n > 1) { var s = sg.d[sg.ax] >= 0 ? 1 : -1; A[sg.ax] -= 0.5 * s; B[sg.ax] += 0.5 * s; }
    if (n > 1) addDim(g, A, B, n, size, null);
  } else {
    if (X1 - X0 > 1 || kind !== 'box' && kind !== 'hbox') addDim(g, [X0, Y0 + 0.02, Z1 + off], [X1, Y0 + 0.02, Z1 + off], X1 - X0, size, [0, 0, off]);
    if (kind === 'box' || kind === 'hbox') {
      if (Z1 - Z0 > 1) addDim(g, [X0 - off, Y0 + 0.02, Z0], [X0 - off, Y0 + 0.02, Z1], Z1 - Z0, size, [-off, 0, 0]);
      if (Y1 - Y0 > 1) addDim(g, [X1 + off, Y0, Z1 + off], [X1 + off, Y1, Z1 + off], Y1 - Y0, size, [off, 0, off]);
    }
  }
  shapeDimObj = g; scene.add(g);
}

/* ---------- Régua: medir de um bloco a outro ---------- */
/* Ferramenta Régua (N): cada clique marca um ponto (bloco ou chão); entre um ponto e o seguinte aparece uma cota.
   Alinhados num eixo, conta os blocos de ponta a ponta, contando os dois (como as medidas da construção); em
   diagonal, mostra a distância em linha reta entre os centros. Os pontos ficam até Limpar (ou Esc). */
var rulerPts = [], rulerObj = null, rulerHoverKey = null;
function rulerSeg(a, b) {
  var d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], nz = d.filter(function (v) { return v; }).length;
  if (nz <= 1) { var ax = d[0] ? 0 : d[1] ? 1 : 2; return { n: Math.abs(d[ax]) + 1, ax: ax, aligned: true, d: d }; }
  return { n: Math.hypot(d[0], d[1], d[2]), aligned: false, d: d };
}
function rulerFmt(sg) { return sg.aligned ? String(sg.n) : sg.n.toFixed(1).replace('.', ','); }
function rulerDraw(hover) {
  if (rulerObj) { scene.remove(rulerObj); rulerObj.traverse(function (o) { if (o.geometry) o.geometry.dispose(); if (o.material && o.material !== MEAS_W && o.material !== MEAS_D) o.material.dispose(); }); rulerObj = null; }
  var pts = rulerPts.slice(); if (hover && pts.length) pts.push(hover);
  if (!pts.length) { requestRender(); return; }
  if (!MEAS_W) { MEAS_W = new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true }); MEAS_D = new THREE.MeshBasicMaterial({ color: 0x101412, depthTest: false, transparent: true, opacity: 0.9 }); }
  var g = new THREE.Group(), zb = Math.round(Math.log2(Math.max(4, cam.dist)) * 3), size = Math.max(Math.pow(2, zb / 3) * 0.03, 0.5);
  var mark = new THREE.MeshBasicMaterial({ color: new THREE.Color(cssColor('--accent') || '#c55a11'), depthTest: false, transparent: true });
  pts.forEach(function (p, i) {
    var m = new THREE.Mesh(new THREE.BoxGeometry(1.06, 1.06, 1.06), mark); m.material.opacity = i === pts.length - 1 && hover ? 0.25 : 0.4;
    m.position.set(p[0] + 0.5, p[1] + 0.5, p[2] + 0.5); m.renderOrder = 8; g.add(m);
    if (!i) return;
    var a = pts[i - 1], sg = rulerSeg(a, p), A = [a[0] + 0.5, a[1] + 0.5, a[2] + 0.5], B = [p[0] + 0.5, p[1] + 0.5, p[2] + 0.5];
    if (sg.aligned) { var s = sg.d[sg.ax] >= 0 ? 1 : -1; A[sg.ax] -= 0.5 * s; B[sg.ax] += 0.5 * s; } // de face a face: conta os dois blocos
    if (A[0] === B[0] && A[1] === B[1] && A[2] === B[2]) return;
    addDim(g, A, B, rulerFmt(sg), size, null);
  });
  rulerObj = g; scene.add(g); requestRender();
}
function rulerAdd(t) {
  var c = t && (t.hit || t.place); if (!c) return;
  var last = rulerPts[rulerPts.length - 1];
  if (last && last[0] === c[0] && last[1] === c[1] && last[2] === c[2]) return;
  rulerPts.push(c.slice()); rulerDraw(); updateRulerChip();
}
function rulerUndo() { rulerPts.pop(); rulerDraw(); updateRulerChip(); }
function rulerClear() { rulerPts = []; rulerDraw(); updateRulerChip(); }
function rulerHover(t) {
  if (tool !== 'ruler' || !rulerPts.length) return;
  var c = t && (t.hit || t.place), k = c ? c.join(',') : '';
  if (k === rulerHoverKey) return; rulerHoverKey = k;
  rulerDraw(c);
}
function updateRulerChip() {
  var c = $('rulerChip'), on = tool === 'ruler' || rulerPts.length > 0;
  c.hidden = !on; if (!on) return;
  var segs = [], tot = 0, L = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  for (var i = 1; i < rulerPts.length; i++) {
    var sg = rulerSeg(rulerPts[i - 1], rulerPts[i]), nm = (L[i - 1] || i) + '→' + (L[i] || i + 1);
    segs.push('<b>' + nm + '</b> ' + rulerFmt(sg) + (sg.aligned ? ' (' + 'XYZ'[sg.ax] + ')' : ' · ΔX ' + Math.abs(sg.d[0]) + ' ΔY ' + Math.abs(sg.d[1]) + ' ΔZ ' + Math.abs(sg.d[2])));
    tot += sg.aligned ? sg.n - 1 : sg.n;
  }
  $('rulerTxt').innerHTML = '<b>Régua</b> ' + (rulerPts.length ? (segs.length ? segs.join(' · ') + (segs.length > 1 ? ' · <b>caminho</b> ' + (Math.round(tot * 10) / 10).toString().replace('.', ',') + ' entre centros' : '') : 'clique no próximo bloco') : 'clique no primeiro bloco');
  $('rulerBtns').hidden = !rulerPts.length;
}
$('rulerChip').addEventListener('click', function (e) {
  var b = e.target.closest('button'); if (!b) return;
  if (b.id === 'rulerUndo') rulerUndo(); else if (b.id === 'rulerClear') rulerClear();
});
