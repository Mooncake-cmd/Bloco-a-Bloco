/* ---------- Medidas na tela ---------- */
/* Cotas como num desenho técnico: linha com setas e o número de blocos em X (largura), Z (profundidade) e Y (altura)
   em volta da construção. Com a Camada ligada, mostra só X e Z da camada visível (os blocos na altura da camada).
   Liga e desliga em Projeto > Mostrar medidas ou com a tecla D. */
var measureOn = true, measureKey = null, measureObj = null, measureTex = {};
try { measureOn = localStorage.getItem('bloco-a-bloco-measure') !== '0'; } catch (e) {}
function setMeasure(on) {
  measureOn = on; try { localStorage.setItem('bloco-a-bloco-measure', on ? '1' : '0'); } catch (e) {}
  $('measureBtn').textContent = 'Mostrar medidas: ' + (on ? 'sim' : 'não');
  measureKey = null; requestRender();
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
    bb = { minX: sb.minX, maxX: sb.maxX, minZ: sb.minZ, maxZ: sb.maxZ, minY: layerY, maxY: layerY };
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
