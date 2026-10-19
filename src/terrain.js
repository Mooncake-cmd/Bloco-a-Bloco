/* ---------- Gerar terreno ---------- */
/* Projeto → Gerar terreno: relevo por ruído (ou por uma imagem em tons de cinza) em volta da construção, numa seleção
   ou no espaço inteiro. Oito tipos: planície ondulada, colinas, montanhas, ilha, arquipélago, vale com rio, planalto
   (mesa) e imagem de relevo. O chão é pedra, terra e grama; abaixo do nível da água, água parada. Depois cada coluna
   recebe um bioma (o escolhido, ou automático, ou misto pelo clima) e a receita dele (src/biome.js, bioTerra) troca as
   camadas de cima e põe árvores, plantas, cactos e neve. Praia na beira da água, fundo de oceano ou de rio debaixo
   d'água, neve e pedra no alto das montanhas.
   Perto da construção o terreno vai suavemente até a base dela (o chão fica logo abaixo do bloco mais baixo), sem
   cobrir nada: só os espaços vazios são preenchidos, e nada de árvore em volta. Se faltar espaço (terreno embaixo da
   construção, margem em volta, altura das montanhas), o espaço cresce e a construção é movida; isso recomeça o
   histórico. A geração inteira é um passo de desfazer; a água posta não escorre (fica como foi gerada). */
var TR_TYPES = {
  planicie: { n: 'Planície ondulada', A: 8, S: 60, sea: -3, bio: 'plains' },
  colinas: { n: 'Colinas', A: 24, S: 45, sea: -6, bio: 'forest' },
  montanhas: { n: 'Montanhas', A: 56, S: 70, sea: null, bio: 'extreme_hills' },
  ilha: { n: 'Ilha', A: 20, S: 40, sea: -1, bio: 'plains' },
  arquipelago: { n: 'Arquipélago', A: 14, S: 36, sea: -1, bio: 'plains' },
  vale: { n: 'Vale com rio', A: 22, S: 60, sea: -1, bio: 'forest' },
  planalto: { n: 'Planalto / mesa', A: 30, S: 50, sea: null, bio: 'mesa' },
  imagem: { n: 'Imagem de relevo', A: 32, S: 50, sea: -2, bio: 'plains' }
};
var TR_BIOMES = ['plains', 'forest', 'birch_forest', 'flower_forest', 'meadow', 'taiga', 'mega_taiga', 'cherry_grove', 'savanna', 'desert', 'jungle', 'swampland', 'mesa', 'ice_plains', 'grove', 'extreme_hills'];
var tr = { type: 'colinas', A: 24, S: 45, sea: -6, seaOn: true, rough: 50, seed: 1234, bio: 'auto', deco: true, margin: 32, where: 'build' };
try { Object.assign(tr, JSON.parse(localStorage.getItem('bloco-a-bloco-terreno') || '{}')); } catch (e) {}
var trImg = null; // { g: Float32Array, w, h } tons de cinza da imagem de relevo (não fica salva)
function trSave() { try { localStorage.setItem('bloco-a-bloco-terreno', JSON.stringify(tr)); } catch (e) {} }
function trSelBox() { return [sel.a[0], sel.a[1], sel.a[2], sel.b[0], sel.b[1], sel.b[2]]; }
function trBio(n) { for (var i = 0; i < BIOMES.length; i++) if (BIOMES[i].n === n) return BIOMES[i].id; return 1; }

/* Ruído de valor com semente (0..1), suave, e a soma de oitavas */
function trHash(x, z, s) { var h = Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ Math.imul(s, 1274126177); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function trNoise(x, z, s) {
  var xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi, u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  var a = trHash(xi, zi, s), b = trHash(xi + 1, zi, s), c = trHash(xi, zi + 1, s), d = trHash(xi + 1, zi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function trFbm(x, z, s, rough, ridged) {
  var sum = 0, amp = 1, f = 1, norm = 0;
  for (var o = 0; o < 5; o++) {
    var n = trNoise(x * f, z * f, s + o * 101);
    if (ridged) { n = 1 - Math.abs(2 * n - 1); n *= n; }
    sum += amp * n; norm += amp; amp *= rough; f *= 2.03;
  }
  return sum / norm;
}
function trSmooth(t) { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); }

/* Plano: a região (colunas), a pegada da construção, as alturas (relativas ao chão) e o que precisa mudar no espaço.
   P: { where, type, A, S, sea, seaOn, rough, seed, margin }; step > 1 só para a prévia. */
function trPlan(P, step) {
  step = step || 1;
  var bb = bbox(), x0, z0, x1, z1;
  if (P.where === 'sel' && sel) { var s0 = trSelBox(); x0 = s0[0]; z0 = s0[2]; x1 = s0[3]; z1 = s0[5]; }
  else if (P.where === 'build' && bb) { x0 = bb.minX - P.margin; z0 = bb.minZ - P.margin; x1 = bb.maxX + P.margin; z1 = bb.maxZ + P.margin; }
  else { x0 = 0; z0 = 0; x1 = SX - 1; z1 = SZ - 1; }
  var w = Math.ceil((x1 - x0 + 1) / step), l = Math.ceil((z1 - z0 + 1) / step), n = w * l;
  // pegada: colunas com algum bloco (a construção), na resolução do plano
  var foot = new Uint8Array(n), fx0 = 1e9, fz0 = 1e9, fx1 = -1e9, fz1 = -1e9, any = false;
  if (bb) forEachBlock(function (x, y, z) {
    var i = Math.floor((x - x0) / step), k = Math.floor((z - z0) / step);
    if (i < 0 || k < 0 || i >= w || k >= l) return;
    if (!foot[k * w + i]) { foot[k * w + i] = 1; any = true; if (i < fx0) fx0 = i; if (i > fx1) fx1 = i; if (k < fz0) fz0 = k; if (k > fz1) fz1 = k; }
  });
  // distância até a construção (em blocos), para o terreno ir até a base dela
  var dist = new Float32Array(n).fill(1e9);
  if (any) {
    for (var q = 0; q < n; q++) if (foot[q]) dist[q] = 0;
    var dd = Math.SQRT2 * step;
    for (var k = 0; k < l; k++) for (var i = 0; i < w; i++) {
      var j = k * w + i, d = dist[j];
      if (i > 0) d = Math.min(d, dist[j - 1] + step); if (k > 0) d = Math.min(d, dist[j - w] + step);
      if (i > 0 && k > 0) d = Math.min(d, dist[j - w - 1] + dd); if (i < w - 1 && k > 0) d = Math.min(d, dist[j - w + 1] + dd);
      dist[j] = d;
    }
    for (k = l - 1; k >= 0; k--) for (i = w - 1; i >= 0; i--) {
      j = k * w + i; d = dist[j];
      if (i < w - 1) d = Math.min(d, dist[j + 1] + step); if (k < l - 1) d = Math.min(d, dist[j + w] + step);
      if (i < w - 1 && k < l - 1) d = Math.min(d, dist[j + w + 1] + dd); if (i > 0 && k < l - 1) d = Math.min(d, dist[j + w - 1] + dd);
      dist[j] = d;
    }
  }
  var T = TR_TYPES[P.type] || TR_TYPES.colinas, A = P.A, S = Math.max(4, P.S), rough = 0.3 + P.rough / 250, seed = P.seed | 0;
  var cx = any ? (fx0 + fx1) / 2 : (w - 1) / 2, cz = any ? (fz0 + fz1) / 2 : (l - 1) / 2; // centro (da construção, se houver)
  var R = Math.min(w, l) * 0.45;
  // vale: o rio corre no sentido mais comprido, longe da construção
  var alongZ = l >= w, across = alongZ ? w : l, rc = across / 2;
  if (any) {
    var lo = alongZ ? fx0 : fz0, hi = alongZ ? fx1 : fz1, gapA = lo, gapB = across - 1 - hi;
    rc = gapA > gapB ? lo / 2 : (hi + across) / 2;
  }
  var hm = new Float32Array(n), minH = 0, maxH = 0, riv = new Uint8Array(n);
  for (k = 0; k < l; k++) for (i = 0; i < w; i++) {
    var bx = i * step, bz = k * step, X = bx / S, Z = bz / S, h, nn;
    switch (P.type) {
      case 'planicie': h = (trFbm(X, Z, seed, rough) - 0.38) * A * 1.5; break;
      case 'colinas': nn = trFbm(X, Z, seed, rough); h = Math.pow(nn, 1.6) * A * 1.9 - A * 0.2; break;
      case 'montanhas': nn = trFbm(X, Z, seed, rough, true); h = Math.pow(nn, 1.8) * A * 1.6 - 3; break;
      case 'ilha': {
        var dr = Math.hypot(i - cx, k - cz) * step / Math.max(8, R * step), base = 1 - dr * dr * 1.15;
        h = (base * 0.8 + (trFbm(X, Z, seed, rough) - 0.5) * 0.7) * A; if (h < -14) h = -14; break;
      }
      case 'arquipelago': {
        nn = trFbm(X / 1.6, Z / 1.6, seed, rough);
        h = (nn - 0.53) * A * 4 + (trFbm(X * 2, Z * 2, seed + 7, rough) - 0.5) * A * 0.5; if (h < -14) h = -14; break;
      }
      case 'vale': {
        var along = alongZ ? k : i, pos = alongZ ? i : k, wav = Math.sin(along * step / (S * 1.6) * Math.PI * 2 + seed) * S * 0.35 + (trFbm(along * step / S, 3.7, seed + 3, rough) - 0.5) * S * 0.6;
        var dRiv = Math.abs((pos - rc) * step - wav), half = 3 + A * 0.08, valley = Math.max(16, across * step * 0.35);
        if (dRiv < half) { h = -2 - 3 * (1 - dRiv / half); riv[k * w + i] = 1; }
        else h = trSmooth((dRiv - half) / valley) * A + (trFbm(X, Z, seed, rough) - 0.5) * A * 0.35;
        break;
      }
      case 'planalto': {
        var t = trFbm(X, Z, seed, rough) * A * 1.6, st = Math.max(3, Math.round(A / 4)), fr = t / st - Math.floor(t / st);
        h = Math.floor(t / st) * st + trSmooth((fr - 0.8) / 0.2) * st - A * 0.4; break;
      }
      case 'imagem': {
        if (!trImg) { h = 0; break; }
        var u = bx / Math.max(1, (w - 1) * step) * (trImg.w - 1), v = bz / Math.max(1, (l - 1) * step) * (trImg.h - 1);
        var ui = Math.min(trImg.w - 2, Math.floor(u)), vi = Math.min(trImg.h - 2, Math.floor(v)), fu = u - ui, fv = v - vi, g = trImg.g, W2 = trImg.w;
        if (trImg.w < 2 || trImg.h < 2) { h = g[0] * A; break; }
        var gv = g[vi * W2 + ui] * (1 - fu) * (1 - fv) + g[vi * W2 + ui + 1] * fu * (1 - fv) + g[(vi + 1) * W2 + ui] * (1 - fu) * fv + g[(vi + 1) * W2 + ui + 1] * fu * fv;
        h = gv * A - A * 0.25; break;
      }
      default: h = 0;
    }
    // perto da construção: vai até a base dela (anel plano de 2 blocos e transição de 14)
    var wgt = trSmooth((dist[k * w + i] - 2) / 14);
    h = Math.round(h * wgt);
    if (foot[k * w + i]) h = 0;
    hm[k * w + i] = h; if (h < minH) minH = h; if (h > maxH) maxH = h;
  }
  var sea = P.seaOn && T.sea !== null ? P.sea : null;
  if (sea !== null && sea - 1 < minH) minH = Math.min(minH, sea - 1);
  // altura: o chão da construção fica logo abaixo do bloco mais baixo dela; sem construção, o fundo mais baixo fica em y 4
  var G = any && bb ? bb.minY - 1 : 4 - minH, needBelow = 4 - minH; // pelo menos 4 blocos abaixo do ponto mais fundo
  var dy = Math.max(0, needBelow - G), dx = Math.max(0, -x0), dz = Math.max(0, -z0);
  var top = G + dy + Math.max(maxH, sea === null ? 0 : sea) + 14; // árvores em cima
  var nsx = Math.max(SX + dx, x1 + dx + 1), nsy = Math.min(MAX_Y, Math.max(SY + dy, top + 1)), nsz = Math.max(SZ + dz, z1 + dz + 1);
  return { x0: x0, z0: z0, x1: x1, z1: z1, w: w, l: l, step: step, foot: foot, dist: dist, hm: hm, riv: riv, any: any, G: G, sea: sea,
    minH: minH, maxH: maxH, dx: dx, dy: dy, dz: dz, sx: nsx, sy: nsy, sz: nsz, grow: nsx !== SX || nsy !== SY || nsz !== SZ || dx || dy || dz };
}

/* Bioma de cada coluna: debaixo d'água, beira d'água, alto da montanha, ou o escolhido (automático/misto) */
function trBiomeOf(P, pl, i, k, hgt, slope, shore) {
  var T = TR_TYPES[P.type], j = k * pl.w + i, base = P.bio === 'auto' ? T.bio : P.bio;
  if (base === 'misto') { // clima pelo ruído: frio, temperado ou quente; seco ou úmido
    var bx = (pl.x0 + i * pl.step) / 160, bz = (pl.z0 + k * pl.step) / 160, te = trFbm(bx, bz, P.seed + 55, 0.5), hu = trFbm(bx, bz, P.seed + 77, 0.5);
    base = te < 0.4 ? (hu < 0.5 ? 'ice_plains' : 'taiga') : te < 0.6 ? (hu < 0.4 ? 'plains' : hu < 0.6 ? 'forest' : 'birch_forest') : (hu < 0.4 ? 'desert' : hu < 0.55 ? 'savanna' : 'jungle');
  }
  var cold = /ice_plains|grove|taiga/.test(base) && base !== 'taiga' && base !== 'mega_taiga';
  if (pl.sea !== null && hgt < pl.sea) return pl.riv[j] ? (cold ? 'frozen_river' : 'river') : cold ? 'frozen_ocean' : 'ocean';
  if (shore) return cold ? 'cold_beach' : base === 'swampland' ? base : 'beach';
  if (P.type === 'montanhas' || P.A >= 40) {
    if (hgt > P.A * 0.62) return slope >= 3 ? 'jagged_peaks' : 'snowy_slopes';
    if (slope >= 3 && hgt > P.A * 0.25) return 'stony_peaks';
  }
  return base;
}

/* Move a construção e muda o tamanho do espaço (blocos, biomas pintados e nível de conteúdo; o histórico recomeça) */
function worldShift(dx, dy, dz, sx, sy, sz) {
  var keep = [], bios = [], fills = [];
  W.forEach(function (ch) { keep.push(ch); });
  bioPaint.forEach(function (a, k) { var p = k.split(','), cx = +p[0], cz = +p[1]; for (var o = 0; o < 256; o++) if (a[o] !== 255) bios.push([cx * 16 + (o & 15), cz * 16 + (o >> 4), a[o]]); });
  rsFill.forEach(function (lv, i) { fills.push([unidx(i), lv]); });
  var hb = hotbar.slice(), sl = slot, sel0 = sel;
  newWorld(sx, sy, sz);
  if (sel0) { sel = { a: [sel0.a[0] + dx, sel0.a[1] + dy, sel0.a[2] + dz], b: [sel0.b[0] + dx, sel0.b[1] + dy, sel0.b[2] + dz] }; if (scene) { updateSelChip(); drawSelBox(); } } // a seleção vai junto
  keep.forEach(function (ch) {
    var x0 = ch.cx << 4, y0 = ch.cy << 4, z0 = ch.cz << 4;
    for (var o = 0; o < 4096; o++) {
      var v = ch.d ? ch.pal[ch.d[o]] : ch.u; if (!v) continue;
      var x = x0 + (o & 15) + dx, y = y0 + (o >> 8) + dy, z = z0 + ((o >> 4) & 15) + dz;
      if (inB(x, y, z)) { gset(x, y, z, v); blockCount++; }
    }
  });
  bios.forEach(function (b) { if (b[0] + dx < SX && b[1] + dz < SZ) bioSetRaw(b[0] + dx, b[1] + dz, b[2]); });
  fills.forEach(function (f) { var p = f[0]; if (inB(p[0] + dx, p[1] + dy, p[2] + dz)) rsFill.set(idx(p[0] + dx, p[1] + dy, p[2] + dz), f[1]); });
  rsFillSave = true; hotbar = hb; slot = sl;
  verCounter++; dirtyAll(); changed();
}

/* Gera de verdade (um passo de desfazer) */
async function trGenerate(P) {
  if (wio && wio.area) { var pl0 = trPlan(P, 1); if (pl0.grow) { toast('Com um mundo do jogo aberto, o terreno precisa caber na área como está: escolha Seleção ou Espaço inteiro, ou diminua a altura e a margem.', 7000); return; } }
  var pl = trPlan(P, 1);
  var grew = pl.grow;
  if (grew) { worldShift(pl.dx, pl.dy, pl.dz, pl.sx, pl.sy, pl.sz); pl = trPlan(Object.assign({}, P), 1); }
  var G = pl.G, sea = pl.sea, w = pl.w, l = pl.l, T = TR_TYPES[P.type];
  var cStone = cellFromName('stone'), cDirt = cellFromName('dirt'), cGrass = cellFromName('grass_block'), cWater = cellFromName('water'), cSand = cellFromName('sand'), cGravel = cellFromName('gravel');
  var mesaCol = P.type === 'planalto';
  var hAt = function (i, k) { return i < 0 || k < 0 || i >= w || k >= l ? null : pl.hm[k * w + i]; };
  var nearWater = function (i, k) { for (var a = -3; a <= 3; a++) for (var b = -3; b <= 3; b++) { var h2 = hAt(i + a, k + b); if (h2 !== null && h2 < sea) return true; } return false; };
  var st = { bare: !P.deco, noTree: function (x, z) { var i = x - pl.x0, k = z - pl.z0; return pl.dist[k * w + i] < 4; } };
  var savedSym = symBusy, groups = {}, cols = 0, ROWS = Math.max(1, Math.floor(20000 / w));
  busy('Gerando o terreno…', 0);
  beginBatch('Gerar terreno: ' + T.n); batch.noFlow = true; symBusy = true;
  try {
    for (var k = 0; k < l; k++) {
      for (var i = 0; i < w; i++) {
        var x = pl.x0 + i, z = pl.z0 + k; if (!inB(x, 0, z)) continue;
        var j = k * w + i, hgt = pl.hm[j], top = Math.min(SY - 1, G + hgt), y;
        var slope = 0; [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) { var h2 = hAt(i + d[0], k + d[1]); if (h2 !== null) slope = Math.max(slope, Math.abs(h2 - hgt)); });
        var under = sea !== null && hgt < sea, shore = sea !== null && !under && hgt <= sea + 1 && nearWater(i, k);
        for (y = 0; y <= top; y++) {
          if (gget(x, y, z)) continue;
          var c = y === top ? cGrass : y >= top - 3 ? cDirt : cStone;
          if (mesaCol && y > G - 8 && y < top - 1) c = cellFromName(MESA_BANDS[((y % 16) + 16) % 16]);
          if (under && y > top - 3) c = sea - hgt <= 3 || pl.riv[j] ? cSand : cGravel;
          editSet(x, y, z, c);
        }
        if (under) for (y = top + 1; y <= Math.min(SY - 1, G + sea); y++) if (!gget(x, y, z)) editSet(x, y, z, cWater);
        var bn = trBiomeOf(P, pl, i, k, hgt, slope, shore), id = trBio(bn);
        bioSet(x, z, id);
        if (!pl.foot[j]) (groups[id] || (groups[id] = [])).push(x, z);
        cols++;
      }
      if (k % ROWS === ROWS - 1) {
        Object.keys(groups).forEach(function (id) { bioTerra(groups[id], +id, st); }); groups = {};
        busy('Gerando o terreno… ' + Math.round(k / l * 100) + '%', k / l);
        await new Promise(function (r) { setTimeout(r, 0); });
      }
    }
    Object.keys(groups).forEach(function (id) { bioTerra(groups[id], +id, st); });
  } finally { symBusy = savedSym; endBatch(); busyEnd(); }
  dirtyAll(); requestRender(); updateStatus();
  var tt = st.terra || {};
  toast(T.n + ': ' + cols.toLocaleString('pt-BR') + ' colunas' + (tt.arvores ? ', ' + tt.arvores + ' árvores' : '') + (grew ? '. O espaço cresceu para ' + SX + ' × ' + SY + ' × ' + SZ : '') + '. Ctrl+Z desfaz.', 7000);
}

/* Prévia de cima: cor pela altura, água, areia, neve e pedra; a construção em vermelho */
function trPreview(P, cv) {
  var big = 0, bb = bbox();
  if (P.where === 'sel' && sel) { var s0 = trSelBox(); big = Math.max(s0[3] - s0[0], s0[5] - s0[2]) + 1; }
  else if (P.where === 'build' && bb) big = Math.max(bb.w, bb.l) + 2 * P.margin;
  else big = Math.max(SX, SZ);
  var pl = trPlan(P, Math.max(1, Math.ceil(big / 180))), w = pl.w, l = pl.l;
  var g = cv.getContext('2d'), id = g.createImageData(w, l), d = id.data, A = Math.max(4, P.A);
  for (var k = 0; k < l; k++) for (var i = 0; i < w; i++) {
    var j = k * w + i, h = pl.hm[j], o = j * 4, c;
    var nb = i + 1 < w ? pl.hm[j + 1] : h, sh = 1 + Math.max(-0.25, Math.min(0.25, (h - nb) * 0.06));
    if (pl.foot[j]) c = [210, 60, 50];
    else if (pl.sea !== null && h < pl.sea) { var dp = Math.min(1, (pl.sea - h) / 12); c = [40 - dp * 20, 110 - dp * 40, 200 - dp * 50]; }
    else if (pl.sea !== null && h <= pl.sea + 1) c = [220, 205, 140];
    else if ((P.type === 'montanhas' || A >= 40) && h > A * 0.62) c = [240, 244, 248];
    else if (P.type === 'planalto') c = [190 - h, 110, 70];
    else { var t = Math.max(0, Math.min(1, h / A)); c = [70 + t * 60, 150 - t * 30, 60 + t * 20]; }
    d[o] = c[0] * sh; d[o + 1] = c[1] * sh; d[o + 2] = c[2] * sh; d[o + 3] = 255;
  }
  var tmp = document.createElement('canvas'); tmp.width = w; tmp.height = l; tmp.getContext('2d').putImageData(id, 0, 0);
  var sc = Math.min(cv.width / w, cv.height / l);
  g.fillStyle = '#000'; g.clearRect(0, 0, cv.width, cv.height); g.imageSmoothingEnabled = false;
  g.drawImage(tmp, (cv.width - w * sc) / 2, (cv.height - l * sc) / 2, w * sc, l * sc);
  return pl;
}

/* Janela */
function openTerrain() {
  var bb = bbox(), hasSel = !!sel;
  if (!bb && tr.where === 'build') tr.where = 'all';
  if (!hasSel && tr.where === 'sel') tr.where = bb ? 'build' : 'all';
  var types = Object.keys(TR_TYPES).map(function (k) { return '<option value="' + k + '">' + TR_TYPES[k].n + '</option>'; }).join('');
  var bios = '<option value="auto">Automático (pelo tipo)</option><option value="misto">Misto (pelo clima)</option>' + TR_BIOMES.map(function (n) { var b = BIO_BY_ID[trBio(n)]; return '<option value="' + n + '">' + esc(b ? b.pt : n) + '</option>'; }).join('');
  openDialog('<h3>Gerar terreno</h3>' +
    '<div class="trg"><canvas id="trCv" width="240" height="240"></canvas><div>' +
    '<label>Onde<select id="trWhere"><option value="build"' + (bb ? '' : ' disabled') + '>Em volta da construção</option><option value="sel"' + (hasSel ? '' : ' disabled') + '>Dentro da seleção</option><option value="all">Espaço inteiro</option></select></label>' +
    '<label id="trMarL">Margem em volta: <b id="trMarV"></b><input type="range" id="trMar" min="8" max="256" step="4"></label>' +
    '<label>Tipo<select id="trType">' + types + '</select></label>' +
    '<label id="trImgL" hidden>Imagem de relevo (branco alto, preto baixo)<input type="file" id="trImgF" accept="image/*"></label>' +
    '<label>Bioma<select id="trBio">' + bios + '</select></label>' +
    '</div></div>' +
    '<div class="row"><label>Altura: <b id="trAV"></b><input type="range" id="trA" min="2" max="160"></label><label>Tamanho das formas: <b id="trSV"></b><input type="range" id="trS" min="8" max="240"></label></div>' +
    '<div class="row"><label>Rugosidade: <b id="trRV"></b><input type="range" id="trR" min="0" max="100"></label><label><span><input type="checkbox" id="trSeaOn"> Água, nível: <b id="trSeaV"></b></span><input type="range" id="trSea" min="-30" max="10"></label></div>' +
    '<div class="row"><label>Semente<input type="number" id="trSeed"></label><button class="btn" id="trDice" title="Outra semente">🎲 Outra</button><label class="check"><input type="checkbox" id="trDeco"><span>Árvores e plantas</span></label></div>' +
    '<p id="trInfo" class="pen"></p>' +
    '<div class="row"><button class="btn primary" id="trGo">Gerar</button><button class="btn" id="trNo">Cancelar</button></div>',
    function () {
      var q = function (id) { return $(id); }, tmr = 0;
      var fill = function () {
        q('trWhere').value = tr.where; q('trMar').value = tr.margin; q('trType').value = tr.type; q('trBio').value = tr.bio;
        q('trA').value = tr.A; q('trS').value = tr.S; q('trR').value = tr.rough; q('trSea').value = tr.sea; q('trSeaOn').checked = tr.seaOn; q('trSeed').value = tr.seed; q('trDeco').checked = tr.deco;
      };
      var read = function () {
        tr.where = q('trWhere').value; tr.margin = +q('trMar').value; tr.type = q('trType').value; tr.bio = q('trBio').value;
        tr.A = +q('trA').value; tr.S = +q('trS').value; tr.rough = +q('trR').value; tr.sea = +q('trSea').value; tr.seaOn = q('trSeaOn').checked;
        tr.seed = parseInt(q('trSeed').value, 10) || 0; tr.deco = q('trDeco').checked; trSave();
      };
      var draw = function () {
        q('trMarV').textContent = tr.margin + ' blocos'; q('trAV').textContent = tr.A; q('trSV').textContent = tr.S; q('trRV').textContent = tr.rough; q('trSeaV').textContent = (tr.sea > 0 ? '+' : '') + tr.sea;
        q('trMarL').hidden = tr.where !== 'build'; q('trImgL').hidden = tr.type !== 'imagem';
        var noSea = TR_TYPES[tr.type].sea === null; q('trSeaOn').disabled = noSea; q('trSea').disabled = noSea || !tr.seaOn;
        var pl = trPreview(tr, q('trCv')), msg = (pl.x1 - pl.x0 + 1) + ' × ' + (pl.z1 - pl.z0 + 1) + ' colunas, relevo de ' + pl.minH + ' a +' + pl.maxH + ' em volta do chão' + (pl.any ? ' (o chão fica logo abaixo da construção)' : '') + '.';
        if (pl.grow) msg += ' Para caber, o espaço vai para ' + pl.sx + ' × ' + pl.sy + ' × ' + pl.sz + (pl.dx || pl.dy || pl.dz ? ' e a construção vai ' + [pl.dx ? pl.dx + ' para leste' : '', pl.dy ? pl.dy + ' para cima' : '', pl.dz ? pl.dz + ' para o sul' : ''].filter(Boolean).join(', ') : '') + ': o histórico de desfazer recomeça.';
        if (tr.type === 'imagem' && !trImg) msg += ' Escolha uma imagem.';
        q('trInfo').textContent = msg;
      };
      var later = function () { read(); clearTimeout(tmr); tmr = setTimeout(draw, 60); };
      fill(); draw();
      ['trWhere', 'trMar', 'trBio', 'trA', 'trS', 'trR', 'trSea', 'trSeaOn', 'trSeed', 'trDeco'].forEach(function (id) { q(id).oninput = later; q(id).onchange = later; });
      q('trType').onchange = function () { var T = TR_TYPES[q('trType').value]; tr.type = q('trType').value; tr.A = T.A; tr.S = T.S; if (T.sea !== null) tr.sea = T.sea; fill(); later(); };
      q('trDice').onclick = function () { tr.seed = Math.floor(Math.random() * 1e6); fill(); later(); };
      q('trImgF').onchange = function () {
        var f = this.files && this.files[0]; if (!f) return;
        var im = new Image(); im.onload = function () {
          var mw = Math.min(512, im.width), mh = Math.min(512, im.height), c = document.createElement('canvas'); c.width = mw; c.height = mh;
          var g = c.getContext('2d'); g.drawImage(im, 0, 0, mw, mh); var dt = g.getImageData(0, 0, mw, mh).data, gr = new Float32Array(mw * mh);
          for (var p = 0; p < mw * mh; p++) gr[p] = (dt[p * 4] * 0.299 + dt[p * 4 + 1] * 0.587 + dt[p * 4 + 2] * 0.114) / 255;
          trImg = { g: gr, w: mw, h: mh }; URL.revokeObjectURL(im.src); later();
        };
        im.src = URL.createObjectURL(f);
      };
      q('trNo').onclick = closeDialog;
      q('trGo').onclick = function () {
        read(); if (tr.type === 'imagem' && !trImg) { toast('Escolha a imagem de relevo.'); return; }
        closeDialog(); trGenerate(Object.assign({}, tr)).catch(function (e) { busyEnd(); reportErr(e); });
      };
    });
}
