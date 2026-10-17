/* Ícones dos blocos em 3D, como no inventário do jogo: cada bloco é desenhado de cima, de lado (face sul à esquerda,
   leste à direita), com o mesmo motor e as mesmas texturas da cena, numa folha só (ICON_PX por ícone). A lista de
   blocos, a hotbar e as outras listas usam a folha como fundo (swatch). Assim escada, laje, muro e bloco do mesmo
   material deixam de ter o mesmo ícone. Plantas em X, trilhos, pó, escada de mão, cipó, portas e camas continuam com
   a textura plana (no jogo também são desenhados chapados). */
var ICON_PX = 64, ICON_COLS = 32, iconSheet = null, iconJob = 0;
var ICON_FLAT = /(rail$|^redstone_wire$|^ladder$|vines?$|^tripwire$|lichen$|^sculk_vein$|^resin_clump$|^fire$|^soul_fire$|^cobweb$)/;
var ICON_FAR = -1e6; // longe de qualquer coluna com bioma: cores padrão do pacote
/* Propriedades do ícone: muro, cerca e painel ligados nos dois lados; escada virada para o leste (o degrau aparece
   na face clara) */
function iconProps(b) {
  var o = {}, k, fam = b.shape.fam;
  for (k in b.defs) o[k] = b.defs[k];
  if (fam === 'wall') { o.north = o.south = 'low'; o.east = o.west = 'none'; o.up = 'true'; }
  else if (fam === 'fence') { o.north = o.south = 'true'; o.east = o.west = 'false'; }
  else if (fam === 'pane') { o.east = o.west = 'true'; o.north = o.south = 'false'; }
  if (/_stairs$/.test(b.java)) o.facing = 'east';
  return o;
}
/* Malha de um bloco na origem: { bufs: [opaco, recorte, vidro], n: quantos vértices } ou null (fica plano) */
function iconMesh(b) {
  if (b.isAir || b.hide) return null;
  var O = newBuf(), C = newBuf(), G = newBuf(), x = ICON_FAR, z = ICON_FAR;
  if (b.shape) {
    if (b.shape.multi || ICON_FLAT.test(b.java)) return null;
    var g;
    if (b.java === 'water' || b.java === 'lava') { emitShape(b, defaultState(b), x, 0, z, O, C, G); }
    else {
      g = shapeGeom(b, iconProps(b));
      // planta em X (faces fora dos eixos): plana
      for (var i = 0; i < g.length; i++) {
        var P = g[i].p, flat = false;
        for (var a = 0; a < 3 && !flat; a++) if (Math.abs(P[0][a] - P[1][a]) < 1e-5 && Math.abs(P[0][a] - P[2][a]) < 1e-5 && Math.abs(P[0][a] - P[3][a]) < 1e-5) flat = true;
        if (!flat) return null;
      }
      // emitShape com as propriedades do ícone (sem vizinhos): troca fullProps só durante a chamada
      var fp = fullProps; fullProps = function () { return iconProps(b); };
      try { emitShape(b, defaultState(b), x, 0, z, O, C, G); } finally { fullProps = fp; }
    }
  } else {
    if (!b.tile) return null;
    var buf = b.glass ? G : b.solid ? O : C;
    for (var f = 0; f < 6; f++) {
      var fm = b.ori ? b.ori.o[0] && b.ori.o[0][2] : 0;
      var src = fm ? fm[FACES[f].t * 2] : FACES[f].t, rk = fm ? fm[FACES[f].t * 2 + 1] : 0;
      emitFace(buf, b, f, src, rk, [3, 3, 3, 3], x, 0, z, 1, 1);
    }
  }
  var n = O.n + C.n + G.n; if (!n) return null;
  // sombra de ícone: lados mais escuros que na cena, para o volume ficar claro em tamanho pequeno
  [O, C, G].forEach(function (T) {
    for (var q = 0; q < T.n; q += 4) {
      var p = T.p, i0 = q * 3, ax = -1;
      for (var a = 0; a < 3; a++) if (Math.abs(p[i0 + a] - p[i0 + 3 + a]) < 1e-5 && Math.abs(p[i0 + a] - p[i0 + 6 + a]) < 1e-5) ax = a;
      var k = ax === 0 ? 0.78 : ax === 2 ? 0.9 : 1;
      if (k !== 1) for (var j = q * 3; j < (q + 4) * 3; j++) T.c[j] *= k;
      for (var j2 = q * 3; j2 < (q + 4) * 3; j2 += 3) { p[j2] -= x; p[j2 + 2] -= z; }
    }
  });
  return { bufs: [O, C, G], n: n };
}
function iconGeo(T) {
  var geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(T.p, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(T.c, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(T.u, 2));
  geo.setAttribute('tileRect', new THREE.Float32BufferAttribute(T.t, 4));
  geo.setIndex(new THREE.BufferAttribute(new Uint32Array(T.i), 1));
  return geo;
}
/* Desenha os ícones aos poucos (alguns por quadro) e troca a folha no fim */
function renderIcons() {
  if (!renderer || !BLOCKS.length) return;
  var job = ++iconJob, N = BLOCKS.length, rows = Math.ceil(N / ICON_COLS);
  var W = ICON_COLS * ICON_PX, H = rows * ICON_PX;
  if (H > (renderer.capabilities.maxTextureSize || 4096)) return;
  var rt = new THREE.WebGLRenderTarget(W, H, { depthBuffer: true });
  var sc = new THREE.Scene(), cam3 = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  // vista do inventário: de cima a 30°, girada 45°
  var dir = new THREE.Vector3(1, 0.82, 1).normalize();
  cam3.position.set(0.5 + dir.x * 4, 0.5 + dir.y * 4, 0.5 + dir.z * 4); cam3.up.set(0, 1, 0); cam3.lookAt(0.5, 0.5, 0.5);
  cam3.updateMatrixWorld();
  var view = cam3.matrixWorldInverse, v3 = new THREE.Vector3();
  var oldClear = renderer.getClearColor(new THREE.Color()), oldAlpha = renderer.getClearAlpha(), oldRT = renderer.getRenderTarget();
  renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 0); renderer.clear(true, true, true);
  renderer.setRenderTarget(oldRT); renderer.setClearColor(oldClear, oldAlpha);
  var has = new Uint8Array(N), i = 0;
  // meia-largura da vista do cubo inteiro: o que for menor que o cubo cresce até 2 vezes para caber
  var full = 0.5 * Math.SQRT2 * 1.06;
  function step() {
    if (job !== iconJob) { rt.dispose(); return; }
    var t0 = performance.now();
    renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 0);
    rt.scissorTest = true;
    while (i < N && performance.now() - t0 < 12) {
      var b = BLOCKS[i], m = null; b._bi = i;
      try { m = iconMesh(b); } catch (e) { m = null; }
      if (m) {
        // enquadra: caixa da malha na vista da câmera
        var mn = [1e9, 1e9], mx = [-1e9, -1e9];
        m.bufs.forEach(function (T) {
          for (var k = 0; k < T.p.length; k += 3) {
            v3.set(T.p[k], T.p[k + 1], T.p[k + 2]).applyMatrix4(view);
            mn[0] = Math.min(mn[0], v3.x); mn[1] = Math.min(mn[1], v3.y); mx[0] = Math.max(mx[0], v3.x); mx[1] = Math.max(mx[1], v3.y);
          }
        });
        var cx = (mn[0] + mx[0]) / 2, cy = (mn[1] + mx[1]) / 2;
        var half = Math.max(full / 2, (mx[0] - mn[0]) / 2 * 1.06, (mx[1] - mn[1]) / 2 * 1.06);
        cam3.left = cx - half; cam3.right = cx + half; cam3.top = cy + half; cam3.bottom = cy - half; cam3.updateProjectionMatrix();
        var meshes = [];
        [[0, matOpaque, 0], [1, matCutout, 0], [2, matGlass, 1]].forEach(function (e) {
          var T = m.bufs[e[0]]; if (!T.n) return;
          var ms = new THREE.Mesh(iconGeo(T), e[1]); ms.renderOrder = e[2]; ms.frustumCulled = false; sc.add(ms); meshes.push(ms);
        });
        var px = (i % ICON_COLS) * ICON_PX, py = H - (Math.floor(i / ICON_COLS) + 1) * ICON_PX;
        rt.viewport.set(px, py, ICON_PX, ICON_PX); rt.scissor.set(px, py, ICON_PX, ICON_PX);
        renderer.setRenderTarget(rt);
        renderer.render(sc, cam3);
        meshes.forEach(function (ms) { sc.remove(ms); ms.geometry.dispose(); });
        has[i] = 1;
      }
      i++;
    }
    rt.scissorTest = false;
    renderer.setRenderTarget(oldRT); renderer.setClearColor(oldClear, oldAlpha);
    if (i < N) { requestAnimationFrame(step); return; }
    // lê a folha (de baixo para cima no WebGL) e vira uma imagem
    var data = new Uint8Array(W * H * 4);
    renderer.readRenderTargetPixels(rt, 0, 0, W, H, data);
    rt.dispose();
    var c = document.createElement('canvas'); c.width = W; c.height = H;
    var g = c.getContext('2d'), img = g.createImageData(W, H);
    for (var r = 0; r < H; r++) img.data.set(data.subarray((H - 1 - r) * W * 4, (H - r) * W * 4), r * W * 4);
    g.putImageData(img, 0, 0);
    c.toBlob(function (blob) {
      if (job !== iconJob || !blob) return;
      if (iconSheet) URL.revokeObjectURL(iconSheet.url);
      iconSheet = { url: URL.createObjectURL(blob), rows: rows, has: has };
      renderList(); renderHotbar();
    });
  }
  requestAnimationFrame(step);
}
/* Fundo CSS do ícone 3D do bloco bi, ou '' se ele não tem */
function iconCss(bi) {
  var s = iconSheet; if (!s || !s.has[bi]) return '';
  var c = bi % ICON_COLS, r = Math.floor(bi / ICON_COLS);
  return 'background:url(' + s.url + ') ' + (c * 100 / (ICON_COLS - 1)) + '% ' + (s.rows > 1 ? r * 100 / (s.rows - 1) : 0) + '%/' + (ICON_COLS * 100) + '% ' + (s.rows * 100) + '% no-repeat';
}
