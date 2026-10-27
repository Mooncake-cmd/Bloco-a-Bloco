/* ---------- Mapa do mundo: o mundo do jogo visto de cima, em tela cheia ---------- */
/* Projeto → Mapa do mundo (com um mundo do Bedrock ou do Java aberto). A qualidade acompanha o zoom:
   - de longe: a visão geral do mundo inteiro (wioMap/jwMap, a mesma imagem da janela de área);
   - mais perto: ladrilhos de 16 × 16 chunks a 1 pixel por bloco, feitos só para o que aparece na tela (do centro para
     fora), com o relevo (mais claro onde sobe, mais escuro onde desce) e a cor da grama, das folhas e da água pelo bioma;
   - bem perto (8 pixels por bloco ou mais): a textura de cima de cada bloco, do pacote carregado.
   Terreno ou Biomas; grade dos chunks (e das regiões de 32 × 32 chunks, de longe); a janela flutuante mostra o bioma,
   as coordenadas, a altura e o bloco de cima; o clique marca o ponto e mostra X e Z do jogo, o chunk, a região e as
   coordenadas correspondentes no Nether (÷ 8; no Nether, as do mundo normal × 8).
   Dados de cada chunk (o bloco de cima, a altura e o bioma de cada coluna) ficam numa memória de até 20.000 chunks. Na
   área carregada no editor, vale o que está no editor (as edições aparecem antes de exportar). */
var WM_TILE = 256, WM_CACHE = 20000, WM_TILES = 120; // memória: até 20.000 chunks (uns 36 MB) e 120 ladrilhos (uns 60 MB)
var wm = null, wmAtlas = null, wmAtlasVer = -1, wmTint = new Map();
/* ---------- Dados de um chunk: { v, h, b } com índice z * 16 + x ---------- */
var wmChunks = new Map();
function wmKey(dim, x, z) { return dim + ':' + x + ',' + z; }
async function wmChunkTop(dim, cx, cz) {
  var k = wmKey(dim, cx, cz), e = wmChunks.get(k); if (e) return e;
  var col = wio.dims[dim].get(cx + ',' + cz); if (!col || !col.ok) return null;
  var A = wio.area, r;
  if (A && A.dim === dim && cx * 16 >= A.x0 && cz * 16 >= A.z0 && cx * 16 + 16 <= A.x0 + A.w && cz * 16 + 16 <= A.z0 + A.d) r = wmChunkEditor(dim, cx, cz);
  else r = wio.java ? await wmChunkJava(dim, cx, cz) : await wmChunkBedrock(dim, cx, cz, col);
  if (!r) return null;
  wmChunks.set(k, r);
  if (wmChunks.size > WM_CACHE) wmChunks.delete(wmChunks.keys().next().value);
  return r;
}
/* Sub-chunks criados por edições já gravadas (ainda não estão no índice do mundo), como em wioMap */
var wmExtraC = { n: -1, dim: -1, m: null };
function wmExtra(dim) {
  if (wmExtraC.n === wio.patches.size && wmExtraC.dim === dim) return wmExtraC.m;
  var extra = new Map();
  wio.patches.forEach(function (v, k) { if (!v || k.length !== (dim ? 14 : 10) || k.charCodeAt(dim ? 12 : 8) !== 0x2f) return; var u = new DataView(wioBytes(k.slice(0, 8)).buffer), y = k.charCodeAt(k.length - 1), ck = u.getInt32(0, true) + ',' + u.getInt32(4, true); if (!extra.has(ck)) extra.set(ck, []); extra.get(ck).push(y > 127 ? y - 256 : y); });
  wmExtraC = { n: wio.patches.size, dim: dim, m: extra }; return extra;
}
function wmEmpty() { return { v: new Uint32Array(256), o: new Uint32Array(256), h: new Int16Array(256).fill(-32768), b: new Uint8Array(256).fill(255) }; }
/* Planta ou enfeite em cima do chão (flor, grama baixa, tocha, trilho...): fica por cima, e o chão embaixo é o que vale */
var WM_DECOR = /torch|rail$|redstone_wire|flower_pot|lantern$|_button$|^lever$|_sign$|banner$|pressure_plate$|candle|vine|lichen|petals$|leaf_litter|^ladder$/;
function wmDecor(v) { var b = BLOCKS[cellBlock(v)]; return !!b.shape && !b.shape.fc && (b.cat === 'plantas' || WM_DECOR.test(b.java)) && !/^(water|lava|bubble_column|snow)$/.test(b.java); }
/* Na área do editor: o que está no editor agora */
function wmChunkEditor(dim, cx, cz) {
  var A = wio.area, D = wioDim(dim), r = wmEmpty(), ex0 = cx * 16 - A.x0, ez0 = cz * 16 - A.z0;
  for (var q = 0; q < 256; q++) {
    var x = q & 15, z = q >> 4, seenAir = false;
    for (var y = SY - 1; y >= 0; y--) {
      var v = gget(ex0 + x, y, ez0 + z);
      if (dim === 1) { if (y + D.min > 118) continue; if (!v) { seenAir = true; continue; } if (!seenAir) continue; }
      if (!v) continue;
      if (!r.o[q] && wmDecor(v)) { r.o[q] = v; continue; }
      r.v[q] = v; r.h[q] = y + D.min; break;
    }
    var bi = bioAt(ex0 + x, ez0 + z); r.b[q] = bi >= 0 ? bi : 255;
  }
  return r;
}
async function wmChunkBedrock(dim, cx, cz, col) {
  var r = wmEmpty(), D = wioDim(dim), left = 256, seenAir = new Uint8Array(256);
  if (col.leg) { var lr = await wioGet(wioKey(cx, cz, dim, 0x30)); if (lr) { var lt = legTops(lr); r.v.set(lt.v); r.h.set(lt.h); r.b.set(lt.b); return r; } } // chunk no formato antigo (src/legacy.js)
  var subs = col.subs.concat(wmExtra(dim).get(cx + ',' + cz) || []).filter(function (y, i, a) { return a.indexOf(y) === i; }).sort(function (a, b) { return b - a; });
  for (var si = 0; si < subs.length && left; si++) {
    var sy = subs[si]; if (dim === 1 && sy > 7) continue;
    var dec = null; try { var raw = await wioGet(wioKey(cx, cz, dim, 0x2f, sy)); dec = raw && subDecode(raw); } catch (e) {}
    if (!dec) continue;
    var c0 = dec.layers[0].pal.map(wioCellOf), c1 = dec.layers[1] ? dec.layers[1].pal.map(wioCellOf) : null;
    for (var q = 0; q < 256; q++) {
      if (r.h[q] !== -32768) continue;
      var x = q & 15, z = q >> 4;
      for (var y = 15; y >= 0; y--) {
        var i = (x << 8) | (z << 4) | y, v = c0[dec.layers[0].idx[i]] || (c1 ? c1[dec.layers[1].idx[i]] : 0), wy = sy * 16 + y;
        if (dim === 1) { if (wy > 118) continue; if (!v) { seenAir[q] = 1; continue; } if (!seenAir[q]) continue; }
        if (!v) continue;
        if (!r.o[q] && wmDecor(v)) { r.o[q] = v; continue; }
        r.v[q] = v; r.h[q] = wy; left--; break;
      }
    }
  }
  try {
    var d3 = await wioGet(wioKey(cx, cz, dim, 0x2b));
    if (d3 && d3.length > 512) {
      var b3 = bioDecode3D(d3);
      for (var q2 = 0; q2 < 256; q2++) {
        if (r.h[q2] === -32768) continue;
        var ry = r.h[q2] - D.min, sb = b3.subs[ry >> 4] || b3.subs[b3.subs.length - 1];
        r.b[q2] = sb ? sb[((q2 & 15) << 8) | ((q2 >> 4) << 4) | (ry & 15)] : 255;
      }
    }
  } catch (e) {}
  return r;
}
async function wmChunkJava(dim, cx, cz) {
  var t = null; try { t = await jwChunk(dim, cx, cz); } catch (e) { t = null; }
  if (!t) return null;
  var r = wmEmpty(), left = 256, seenAir = new Uint8Array(256), bsec = {};
  var secs = jwSections(t).slice().sort(function (a, b) { return nbtVal(b, 'Y') - nbtVal(a, 'Y'); });
  for (var si = 0; si < secs.length && left; si++) {
    var sy = nbtVal(secs[si], 'Y'); if (sy > 127) sy -= 256;
    bsec[sy] = secs[si];
    if (dim === 1 && sy > 7) continue;
    var dec = jwSecDecode(secs[si]); if (!dec) continue;
    var cells = dec.pal.map(jwCellOfKey); if (cells.every(function (v) { return !v; }) && dim !== 1) continue;
    for (var q = 0; q < 256; q++) {
      if (r.h[q] !== -32768) continue;
      var x = q & 15, z = q >> 4;
      for (var y = 15; y >= 0; y--) {
        var v = cells[dec.idx[(y << 8) | (z << 4) | x]], wy = sy * 16 + y;
        if (dim === 1) { if (wy > 126) continue; if (!v) { seenAir[q] = 1; continue; } if (!seenAir[q]) continue; }
        if (!v) continue;
        if (!r.o[q] && wmDecor(v)) { r.o[q] = v; continue; }
        r.v[q] = v; r.h[q] = wy; left--; break;
      }
    }
  }
  for (var q2 = 0; q2 < 256; q2++) {
    if (r.h[q2] === -32768) continue;
    var bs = bsec[r.h[q2] >> 4], bd = bs && jwBioDecode(bs);
    if (bd) r.b[q2] = jwBioId(bd.pal[bd.idx[(((r.h[q2] & 15) >> 2) << 4) | (((q2 >> 4) >> 2) << 2) | ((q2 & 15) >> 2)]]);
  }
  return r;
}
/* Tinta padrão do bloco (grama, folhas, água): nos blocos com forma, a da forma */
function wmDefTint(b, src) { return b.shape ? (b.shape.ti ? b.shape.tint : 0) : b.tint && b.tint[src || 0]; }
/* Cor do bloco de cima, com a grama, as folhas e a água na cor do bioma */
function wmColor(v, bio) {
  var c = wioColor(v); if (!c) return null;
  var b = BLOCKS[cellBlock(v)], def = wmDefTint(b, 0), k = def && BIO_TINT_KIND[def], e = k && bio !== 255 && BIO_BY_ID[bio];
  if (e && e[k]) { var t = e[k], d = def; c = [c[0] * (t >> 16 & 255) / (d >> 16 & 255 || 1), c[1] * (t >> 8 & 255) / (d >> 8 & 255 || 1), c[2] * (t & 255) / (d & 255 || 1)]; }
  else if (/^(water|bubble_column)$/.test(b.java) && bio !== 255 && BIO_BY_ID[bio] && BIO_BY_ID[bio].water) { var w = BIO_BY_ID[bio].water; c = [w >> 16 & 255, w >> 8 & 255, w & 255]; }
  return c;
}

/* ---------- Ladrilhos (16 × 16 chunks, 1 pixel por bloco) ---------- */
function wmTileKey(t) { return wm.dim + ':' + wm.mode + ':' + t[0] + ',' + t[1]; }
async function wmBuildTile(tx, tz) {
  var key = wm.dim + ':' + tx + ',' + tz, dim = wm.dim;
  var cT = document.createElement('canvas'), cB = document.createElement('canvas'); cT.width = cT.height = cB.width = cB.height = WM_TILE;
  var iT = new ImageData(WM_TILE, WM_TILE), iB = new ImageData(WM_TILE, WM_TILE), H = new Int16Array(WM_TILE * WM_TILE).fill(-32768), any = false;
  for (var a = 0; a < 16; a++) for (var b = 0; b < 16; b++) {
    var cx = tx * 16 + a, cz = tz * 16 + b, r = await wmChunkTop(dim, cx, cz);
    if (!wm || wm.dim !== dim) return null;
    if (!r) continue; any = true;
    for (var q = 0; q < 256; q++) {
      if (r.h[q] === -32768) continue;
      var px = a * 16 + (q & 15), pz = b * 16 + (q >> 4), o = pz * WM_TILE + px, col = wmColor(r.v[q], r.b[q]);
      if (col) { iT.data[o * 4] = col[0]; iT.data[o * 4 + 1] = col[1]; iT.data[o * 4 + 2] = col[2]; iT.data[o * 4 + 3] = 255; }
      H[o] = r.h[q];
      if (r.b[q] !== 255) { var bc = BIO_BY_ID[r.b[q]] ? BIO_BY_ID[r.b[q]].map : 0x888888; iB.data[o * 4] = bc >> 16 & 255; iB.data[o * 4 + 1] = bc >> 8 & 255; iB.data[o * 4 + 2] = bc & 255; iB.data[o * 4 + 3] = 255; }
    }
  }
  // relevo: compara com o vizinho do norte (no ladrilho de cima, usa o próprio)
  for (var pz2 = WM_TILE - 1; pz2 > 0; pz2--) for (var px2 = 0; px2 < WM_TILE; px2++) {
    var o2 = pz2 * WM_TILE + px2, h1 = H[o2], h0 = H[o2 - WM_TILE]; if (h1 === -32768 || h0 === -32768) continue;
    var f = h1 > h0 ? 1.12 : h1 < h0 ? 0.86 : 1; if (f === 1) continue;
    for (var ch = 0; ch < 3; ch++) iT.data[o2 * 4 + ch] = Math.min(255, iT.data[o2 * 4 + ch] * f);
  }
  cT.getContext('2d').putImageData(iT, 0, 0); cB.getContext('2d').putImageData(iB, 0, 0);
  return { t: cT, b: cB, any: any };
}
/* Fila: o que está na tela, do centro para fora; um ladrilho por vez */
function wmQueue() {
  if (!wm || wm.busy) return;
  var V = wmVisible(), need = [];
  for (var tz = V.tz0; tz <= V.tz1; tz++) for (var tx = V.tx0; tx <= V.tx1; tx++) {
    var k = wm.dim + ':' + tx + ',' + tz; if (wm.tiles.has(k)) continue;
    if (!wmTileHasChunks(tx, tz)) { wm.tiles.set(k, null); continue; }
    var cx = (tx + 0.5) * WM_TILE, cz = (tz + 0.5) * WM_TILE; need.push([tx, tz, (cx - wm.cx) * (cx - wm.cx) + (cz - wm.cz) * (cz - wm.cz)]);
  }
  if (!need.length) { wmStatus(''); return; }
  need.sort(function (a, b) { return a[2] - b[2]; });
  var t = need[0]; wm.busy = true; wmStatus('Desenhando em detalhe… (' + need.length + (need.length > 1 ? ' partes' : ' parte') + ' na fila)');
  wmBuildTile(t[0], t[1]).then(function (r) {
    if (!wm) return;
    wm.busy = false; wm.tiles.set(wm.dim + ':' + t[0] + ',' + t[1], r && r.any ? r : null);
    if (wm.tiles.size > WM_TILES) wm.tiles.delete(wm.tiles.keys().next().value);
    wmDraw(); wmQueue();
  }, function () { if (wm) { wm.busy = false; wm.tiles.set(wm.dim + ':' + t[0] + ',' + t[1], null); wmQueue(); } });
}
function wmTileHasChunks(tx, tz) {
  var m = wio.dims[wm.dim];
  for (var a = 0; a < 16; a++) for (var b = 0; b < 16; b++) { var c = m.get((tx * 16 + a) + ',' + (tz * 16 + b)); if (c && c.ok) return true; }
  return false;
}

/* ---------- Texturas (bem perto) ---------- */
/* O atlas das texturas (buildAtlas) num canvas, na posição certa (o atlas vem de cabeça para baixo) */
function wmAtlasCanvas() {
  if (!atlasPx) return null;
  if (wmAtlas && wmAtlasVer === atlasPx.ver) return wmAtlas;
  var W = atlasPx.W, H = atlasPx.H, c = document.createElement('canvas'); c.width = W; c.height = H;
  var img = new ImageData(W, H), d = atlasPx.data;
  for (var r = 0; r < H; r++) img.data.set(d.subarray((H - 1 - r) * W * 4, (H - r) * W * 4), r * W * 4);
  c.getContext('2d').putImageData(img, 0, 0);
  wmAtlas = c; wmAtlasVer = atlasPx.ver; wmTint.clear(); return c;
}
/* Ladrilho de cima do bloco (índice no atlas) e a cor de tinta (grama, folhas, água pelo bioma) */
function wmTopTile(v, bio) {
  var b = BLOCKS[cellBlock(v)]; if (!b.tile || !b.tile.length) return null;
  var src = 0, t;
  if (b.shape) t = b.tile[b.ptIdx];
  else { var fm = b.ori ? b.ori.o[cellOri(v)] && b.ori.o[cellOri(v)][2] : null; src = fm ? fm[0] : 0; t = b.tile[src]; }
  if (!(t >= 0) || !tileUV[t]) return null;
  var def = wmDefTint(b, src), tint = 0;
  if (def) { var k = BIO_TINT_KIND[def], e = k && bio !== 255 && BIO_BY_ID[bio]; tint = e && e[k] ? e[k] : def; }
  return { t: t, tint: tint };
}
function wmTileImg(t, tint) {
  var A = wmAtlasCanvas(); if (!A) return null;
  var uv = tileUV[t], W = atlasPx.W, H = atlasPx.H, x = Math.round(uv[0] * W - 0.5), y1 = Math.round(uv[3] * H + 0.5), s = Math.round((uv[2] - uv[0]) * W + 1), y = H - y1;
  if (!tint) return { img: A, x: x, y: y, s: s };
  var key = t + '|' + tint, c = wmTint.get(key);
  if (!c) {
    c = document.createElement('canvas'); c.width = c.height = s; var g = c.getContext('2d');
    g.drawImage(A, x, y, s, s, 0, 0, s, s);
    g.globalCompositeOperation = 'multiply'; g.fillStyle = '#' + (0x1000000 + tint).toString(16).slice(1); g.fillRect(0, 0, s, s);
    g.globalCompositeOperation = 'destination-in'; g.drawImage(A, x, y, s, s, 0, 0, s, s);
    wmTint.set(key, c);
  }
  return { img: c, x: 0, y: 0, s: s };
}
/* Bem perto: cada bloco com a textura (só os chunks já lidos; os outros esperam a fila) */
function wmDrawTextures(g, V) {
  var cx0 = Math.floor(V.x0 / 16), cx1 = Math.floor(V.x1 / 16), cz0 = Math.floor(V.z0 / 16), cz1 = Math.floor(V.z1 / 16), S = wm.s, pend = 0;
  g.imageSmoothingEnabled = false;
  for (var cz = cz0; cz <= cz1; cz++) for (var cx = cx0; cx <= cx1; cx++) {
    var r = wmChunks.get(wmKey(wm.dim, cx, cz));
    if (!r) { var col = wio.dims[wm.dim].get(cx + ',' + cz); if (col && col.ok) { pend++; wmFetch(cx, cz); } continue; }
    for (var q = 0; q < 256; q++) {
      if (r.h[q] === -32768) continue;
      var bx = cx * 16 + (q & 15), bz = cz * 16 + (q >> 4); if (bx < V.x0 - 1 || bx > V.x1 || bz < V.z0 - 1 || bz > V.z1) continue;
      var p = wmToPx(bx, bz), tt = wmTopTile(r.v[q], r.b[q]), ti = tt && wmTileImg(tt.t, tt.tint);
      if (ti) g.drawImage(ti.img, ti.x, ti.y, ti.s, ti.s, p[0], p[1], S + 0.5, S + 0.5);
      else { var c = wmColor(r.v[q], r.b[q]); if (c) { g.fillStyle = 'rgb(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ')'; g.fillRect(p[0], p[1], S + 0.5, S + 0.5); } }
      if (r.o[q]) { var to = wmTopTile(r.o[q], r.b[q]), tio = to && wmTileImg(to.t, to.tint); if (tio) g.drawImage(tio.img, tio.x, tio.y, tio.s, tio.s, p[0], p[1], S + 0.5, S + 0.5); } // a planta por cima
      // relevo: o vizinho do norte mais baixo clareia, mais alto escurece
      var hn = (q >> 4) ? r.h[q - 16] : -32768;
      if (hn !== -32768 && hn !== r.h[q]) { g.fillStyle = r.h[q] > hn ? 'rgba(255,255,255,.14)' : 'rgba(0,0,0,.16)'; g.fillRect(p[0], p[1], S + 0.5, S + 0.5); }
    }
  }
  return pend;
}
/* Busca de chunks para as texturas (alguns de cada vez) */
function wmFetch(cx, cz) {
  var k = wmKey(wm.dim, cx, cz); if (wm.fetching.has(k) || wm.fetching.size > 12) return;
  wm.fetching.add(k);
  wmChunkTop(wm.dim, cx, cz).then(function () { if (!wm) return; wm.fetching.delete(k); wmDrawSoon(); }, function () { if (wm) wm.fetching.delete(k); });
}

/* ---------- Vista ---------- */
function wmToPx(x, z) { return [wm.W / 2 + (x - wm.cx) * wm.s, wm.H / 2 + (z - wm.cz) * wm.s]; }
function wmToWorld(px, pz) { return [wm.cx + (px - wm.W / 2) / wm.s, wm.cz + (pz - wm.H / 2) / wm.s]; }
function wmVisible() {
  var a = wmToWorld(0, 0), b = wmToWorld(wm.W, wm.H);
  return { x0: a[0], z0: a[1], x1: b[0], z1: b[1], tx0: Math.floor(a[0] / WM_TILE), tz0: Math.floor(a[1] / WM_TILE), tx1: Math.floor(b[0] / WM_TILE), tz1: Math.floor(b[1] / WM_TILE) };
}
function wmDrawSoon() { if (wm && !wm.raf) wm.raf = requestAnimationFrame(function () { if (wm) { wm.raf = 0; wmDraw(); } }); }
function wmDraw() {
  if (!wm) return;
  var cv = wm.cv, g = wm.g, mp = wm.ov, dpr = wm.dpr;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = '#1b1d1c'; g.fillRect(0, 0, wm.W, wm.H);
  var V = wmVisible(), bio = wm.mode === 'bio';
  // 1. visão geral (sempre por baixo: cobre enquanto os detalhes chegam)
  if (mp && wm.ovT) {
    var p0 = wmToPx(mp.x0, mp.z0);
    g.imageSmoothingEnabled = wm.s * mp.sc < 2;
    g.drawImage(bio ? wm.ovB : wm.ovT, p0[0], p0[1], mp.w * mp.sc * wm.s, mp.h * mp.sc * wm.s);
  }
  // 2. ladrilhos em detalhe, quando a visão geral já não dá conta (mais de 1 pixel da tela por pixel dela)
  var detail = !mp || wm.s * mp.sc > 1.2, tex = !bio && wm.s >= 8 && atlasPx;
  if (detail && !tex) {
    g.imageSmoothingEnabled = wm.s < 1;
    for (var tz = V.tz0; tz <= V.tz1; tz++) for (var tx = V.tx0; tx <= V.tx1; tx++) {
      var t = wm.tiles.get(wm.dim + ':' + tx + ',' + tz); if (!t) continue;
      var p = wmToPx(tx * WM_TILE, tz * WM_TILE); g.drawImage(bio ? t.b : t.t, p[0], p[1], WM_TILE * wm.s + 0.5, WM_TILE * wm.s + 0.5);
    }
    wmQueue();
  } else if (tex) {
    var pend = wmDrawTextures(g, V);
    wmStatus(pend ? 'Lendo ' + pend + ' chunks…' : '');
  } else wmStatus('');
  // 3. grade: chunks de perto, regiões (32 × 32 chunks) de longe
  if (wm.grid) {
    var cw = 16 * wm.s, step = cw >= 6 ? 16 : 512;
    if (step === 512 || cw >= 6) {
      g.lineWidth = 1; g.strokeStyle = step === 16 ? 'rgba(255,255,255,.28)' : 'rgba(255,255,255,.4)'; g.beginPath();
      for (var gx = Math.floor(V.x0 / step) * step; gx <= V.x1; gx += step) { var lx = Math.round(wmToPx(gx, 0)[0]) + 0.5; g.moveTo(lx, 0); g.lineTo(lx, wm.H); }
      for (var gz = Math.floor(V.z0 / step) * step; gz <= V.z1; gz += step) { var lz = Math.round(wmToPx(0, gz)[1]) + 0.5; g.moveTo(0, lz); g.lineTo(wm.W, lz); }
      g.stroke();
      if (step === 16) { // as divisas das regiões, mais fortes
        g.strokeStyle = 'rgba(255,220,120,.55)'; g.beginPath();
        for (gx = Math.floor(V.x0 / 512) * 512; gx <= V.x1; gx += 512) { lx = Math.round(wmToPx(gx, 0)[0]) + 0.5; g.moveTo(lx, 0); g.lineTo(lx, wm.H); }
        for (gz = Math.floor(V.z0 / 512) * 512; gz <= V.z1; gz += 512) { lz = Math.round(wmToPx(0, gz)[1]) + 0.5; g.moveTo(0, lz); g.lineTo(wm.W, lz); }
        g.stroke();
      }
      if (cw >= 56) { // o número de cada chunk
        g.font = (11 * dpr) + 'px ' + (getComputedStyle(document.body).getPropertyValue('--font-mono') || 'monospace'); g.fillStyle = 'rgba(255,255,255,.8)'; g.shadowColor = 'rgba(0,0,0,.8)'; g.shadowBlur = 3;
        for (var ccx = Math.floor(V.x0 / 16); ccx <= V.x1 / 16; ccx++) for (var ccz = Math.floor(V.z0 / 16); ccz <= V.z1 / 16; ccz++) { var lp = wmToPx(ccx * 16, ccz * 16); g.fillText(ccx + ', ' + ccz, lp[0] + 4 * dpr, lp[1] + 13 * dpr); }
        g.shadowBlur = 0;
      }
    }
  }
  // 4. a área carregada no editor, o jogador e o ponto clicado
  var A = wio.area;
  if (A && A.dim === wm.dim) { var qa = wmToPx(A.x0, A.z0); g.setLineDash([6 * dpr, 4 * dpr]); g.lineWidth = 2 * dpr; g.strokeStyle = cssColor('--accent') || '#c55a11'; g.strokeRect(qa[0], qa[1], A.w * wm.s, A.d * wm.s); g.setLineDash([]); }
  if (wio.player && wio.player.dim === wm.dim) { var pp = wmToPx(wio.player.x + 0.5, wio.player.z + 0.5); g.beginPath(); g.arc(pp[0], pp[1], 6 * dpr, 0, 7); g.fillStyle = cssColor('--accent') || '#c55a11'; g.fill(); g.lineWidth = 2 * dpr; g.strokeStyle = '#fff'; g.stroke(); }
  if (wm.sel) {
    var sp = wmToPx(wm.sel[0] + 0.5, wm.sel[1] + 0.5), R = Math.max(8 * dpr, wm.s / 2);
    g.lineWidth = 2 * dpr; g.strokeStyle = '#fff'; g.beginPath(); g.moveTo(sp[0] - R - 6 * dpr, sp[1]); g.lineTo(sp[0] + R + 6 * dpr, sp[1]); g.moveTo(sp[0], sp[1] - R - 6 * dpr); g.lineTo(sp[0], sp[1] + R + 6 * dpr); g.stroke();
    if (wm.s >= 4) { var bp = wmToPx(wm.sel[0], wm.sel[1]); g.strokeStyle = cssColor('--accent') || '#c55a11'; g.strokeRect(bp[0], bp[1], wm.s, wm.s); }
  }
  wmFootDraw(g); // a estrutura posicionada
  var zs = wm.s / dpr; $('wmvZoom').textContent = zs >= 1 ? Math.round(zs) + ' px por bloco' : '1 px = ' + Math.round(1 / zs) + ' blocos';
}
function wmStatus(t) { var e = $('wmvStat'); if (e && e.textContent !== t) e.textContent = t; }

/* ---------- Abrir ---------- */
function openWorldMap() {
  if (!wio) { toast('Abra um mundo do jogo primeiro (Projeto → Abrir mundo do jogo); o mapa mostra o mundo visto de cima.', 6000); return; }
  if (wm) return;
  var div = document.createElement('div'); div.id = 'wmView';
  var tabs = WIO_DIMS.map(function (D) { return '<button data-wvd="' + D.id + '"' + (wio.dims[D.id].size ? '' : ' disabled') + '>' + D.name + '</button>'; }).join('');
  div.innerHTML = '<div class="wmvbar"><b>' + esc(wio.name) + '</b><span class="mbtns">' + tabs + '</span>' +
    '<span class="mbtns"><button id="wmvT" aria-pressed="true">Terreno</button><button id="wmvB" aria-pressed="false">Biomas</button></span>' +
    '<label class="check"><input type="checkbox" id="wmvG"> Grade dos chunks</label>' +
    '<span class="mbtns"><button id="wmvOut" title="Afastar (−)">−</button><span id="wmvZoom"></span><button id="wmvIn" title="Aproximar (+)">+</button><button id="wmvMe" title="Onde o jogador está">Jogador</button></span>' +
    '<button id="wmvFp" class="tbtn txt" title="Um retângulo do tamanho de uma estrutura, para ver o espaço que ela ocupa">Estrutura no mapa…</button>' +
    '<span id="wmvStat" class="mixl"></span><button id="wmvX" class="tbtn txt" title="Esc">Fechar</button></div>' +
    '<canvas id="wmvCv"></canvas><div id="wmvTip" hidden></div>' +
    '<div class="wmvinfo" id="wmvFoot" hidden></div><div class="wmvinfo" id="wmvInfo">Clique num ponto para ver as coordenadas do jogo e as do Nether. Arraste para mover; a roda do mouse (ou dois dedos) aproxima.</div>';
  document.body.appendChild(div);
  var cv = $('wmvCv');
  wm = { div: div, cv: cv, g: cv.getContext('2d'), dim: wio.area ? wio.area.dim : wio.player ? wio.player.dim : 0, mode: 'terrain', grid: false, s: 1, cx: 0, cz: 0, tiles: new Map(), fetching: new Set(), busy: false, sel: null, dpr: 1, W: 1, H: 1 };
  try { wm.grid = localStorage.getItem('bloco-a-bloco-wmgrid') === '1'; } catch (e) {}
  $('wmvG').checked = wm.grid;
  if (!wio.dims[wm.dim].size) wm.dim = wio.dims.findIndex(function (m) { return m.size; });
  // o que está na área do editor muda: os chunks dela são lidos de novo
  if (wio.area) Array.from(wmChunks.keys()).forEach(function (k) { if (+k.split(':')[0] === wio.area.dim) { var p = k.split(':')[1].split(',').map(Number), A = wio.area; if (p[0] * 16 >= A.x0 && p[1] * 16 >= A.z0 && p[0] * 16 < A.x0 + A.w && p[1] * 16 < A.z0 + A.d) wmChunks.delete(k); } });
  wmResize(); wmBind(); wmLoadDim(true); wmFootInfo();
}
function closeWorldMap() {
  if (!wm) return;
  if (wm.raf) cancelAnimationFrame(wm.raf);
  wm.div.remove(); window.removeEventListener('resize', wmResize); document.removeEventListener('keydown', wmKeys, true);
  wm = null;
}
function wmResize() {
  if (!wm) return;
  var r = wm.cv.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1), old = wm.dpr;
  wm.dpr = dpr; wm.W = Math.max(1, Math.round(r.width * dpr)); wm.H = Math.max(1, Math.round(r.height * dpr)); wm.cv.width = wm.W; wm.cv.height = wm.H;
  if (old !== dpr) wm.s *= dpr / old;
  wmDraw();
}
async function wmLoadDim(first) {
  wm.div.querySelectorAll('[data-wvd]').forEach(function (b) { b.setAttribute('aria-pressed', String(+b.getAttribute('data-wvd') === wm.dim)); });
  wm.ov = null; wm.ovT = wm.ovB = null; wm.tiles = new Map(); wm.sel = null; wmInfo();
  var dim = wm.dim;
  var A = wio.area, c0 = A && A.dim === dim ? [A.x0 + A.w / 2, A.z0 + A.d / 2] : wio.player && wio.player.dim === dim ? [wio.player.x, wio.player.z] : dim === 0 && wio.spawn ? wio.spawn : null;
  wmStatus('Desenhando a visão geral…');
  var m = await wioMap(dim, function (i, n) { wmStatus('Desenhando a visão geral: ' + i + ' de ' + n + ' chunks'); });
  if (!wm || wm.dim !== dim) return;
  wm.ov = m;
  if (m) { wm.ovT = await createImageBitmap(m.img); wm.ovB = await createImageBitmap(m.bimg); }
  if (!wm || wm.dim !== dim) return;
  if (m) { // começa vendo o mundo inteiro, centrado no jogador (ou na área) se houver
    var fit = Math.min(wm.W / (m.w * m.sc), wm.H / (m.h * m.sc)) * 0.95;
    wm.s = c0 ? Math.max(fit, 1 * wm.dpr) : fit;
    if (c0) { wm.cx = c0[0]; wm.cz = c0[1]; } else { wm.cx = m.x0 + m.w * m.sc / 2; wm.cz = m.z0 + m.h * m.sc / 2; }
  }
  wmStatus(''); wmDraw();
}
function wmZoom(f, px, pz) {
  var a = px == null ? null : wmToWorld(px, pz), ns = Math.max(1 / 64, Math.min(48 * wm.dpr, wm.s * f));
  wm.s = ns;
  if (a) { var b = wmToWorld(px, pz); wm.cx += a[0] - b[0]; wm.cz += a[1] - b[1]; }
  wmDrawSoon();
}
/* Ponto do mapa: bioma, altura e bloco de cima (dos chunks já lidos; senão, da visão geral) */
function wmAt(x, z) {
  x = Math.floor(x); z = Math.floor(z);
  var r = wmChunks.get(wmKey(wm.dim, x >> 4, z >> 4)), q = ((z & 15) << 4) | (x & 15), out = { x: x, z: z, bio: 255, h: null, v: 0 };
  if (r) { out.bio = r.b[q]; out.o = r.o[q]; if (r.h[q] !== -32768) { out.h = r.h[q]; out.v = r.v[q]; } return out; }
  var m = wm.ov;
  if (m) { var px = Math.floor((x - m.x0) / m.sc), pz = Math.floor((z - m.z0) / m.sc); if (px >= 0 && pz >= 0 && px < m.w && pz < m.h) out.bio = m.bid[pz * m.w + px]; }
  return out;
}
function wmBlockName(a) {
  var nm = function (v) { return cellBlock(v) === PRES_BI ? presName(v) : BLOCKS[cellBlock(v)].name; };
  return a.v ? nm(a.v) + (a.o ? ' + ' + nm(a.o) : '') : a.o ? nm(a.o) : '';
}
function wmBioName(id) { var e = id !== 255 && BIO_BY_ID[id]; return e ? e.pt + ' (' + e.n + ')' : null; }
function wmInfo() {
  var el = $('wmvInfo'); if (!el) return;
  el.classList.toggle('on', !!wm.sel); // no celular, a dica some até marcar um ponto
  if (!wm.sel) { el.textContent = 'Clique num ponto para ver as coordenadas do jogo e as do Nether. Arraste para mover; a roda do mouse (ou dois dedos) aproxima.'; return; }
  var x = wm.sel[0], z = wm.sel[1], a = wmAt(x + 0.5, z + 0.5), D = WIO_DIMS[wm.dim], conv = '';
  if (wm.dim === 0) conv = ' · <b>no Nether</b>: X <b>' + Math.floor(x / 8) + '</b>, Z <b>' + Math.floor(z / 8) + '</b>';
  else if (wm.dim === 1) conv = ' · <b>no mundo normal</b>: X <b>' + x * 8 + '</b>, Z <b>' + z * 8 + '</b>';
  var bn = wmBioName(a.bio), bl = wmBlockName(a);
  el.innerHTML = '<span>' + D.name + ': X <b>' + x + '</b>, Z <b>' + z + '</b>' + (a.h != null ? ', Y ' + a.h : '') + conv + '</span>' +
    '<span class="mixl">chunk ' + (x >> 4) + ', ' + (z >> 4) + ' · região r.' + (x >> 9) + '.' + (z >> 9) + (bn ? ' · ' + esc(bn) : '') + (bl ? ' · ' + esc(bl) : '') + '</span>' +
    ' <span class="mbtns"><button id="wmvCopy">Copiar</button><button id="wmvLoad" title="Abrir a janela de área com o centro aqui">Carregar área aqui</button></span>';
  $('wmvCopy').onclick = function () {
    var t = x + ' ' + (a.h != null ? a.h : '~') + ' ' + z;
    (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { toast('Copiado: ' + t); }, function () { toast(t); });
  };
  $('wmvLoad').onclick = function () { var d = wm.dim; closeWorldMap(); wioArea.at = { dim: d, x: x, z: z }; wioArea(); };
}
function wmKeys(e) {
  if (!wm) return;
  var tg = e.target; if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'SELECT') && tg.type !== 'checkbox') return;
  if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); if (overlayRoot.firstChild) return; closeWorldMap(); return; }
  if (wmFoot && wmFoot.dim === wm.dim && (e.key === 'r' || e.key === 'R')) { e.preventDefault(); e.stopImmediatePropagation(); wmFootRot(); return; }
  if (wmFoot && wmFoot.dim === wm.dim && /^Arrow/.test(e.key)) { e.preventDefault(); e.stopImmediatePropagation(); var st = e.shiftKey ? 16 : 1; if (e.key === 'ArrowLeft') wmFoot.x -= st; else if (e.key === 'ArrowRight') wmFoot.x += st; else if (e.key === 'ArrowUp') wmFoot.z -= st; else wmFoot.z += st; wmFootInfo(); wmDraw(); return; }
  if (e.key === '+' || e.key === '=') { e.stopImmediatePropagation(); wmZoom(1.5, wm.W / 2, wm.H / 2); }
  else if (e.key === '-') { e.stopImmediatePropagation(); wmZoom(1 / 1.5, wm.W / 2, wm.H / 2); }
  else e.stopImmediatePropagation(); // as teclas do editor não valem com o mapa aberto
}
function wmBind() {
  var cv = wm.cv, ptrs = new Map(), drag = null, pinch = null;
  window.addEventListener('resize', wmResize); document.addEventListener('keydown', wmKeys, true);
  $('wmvX').onclick = closeWorldMap;
  $('wmvFp').onclick = wmFootPick;
  wm.div.querySelectorAll('[data-wvd]').forEach(function (b) { b.onclick = function () { var d = +b.getAttribute('data-wvd'); if (d !== wm.dim) { wm.dim = d; wmLoadDim(); } }; });
  $('wmvT').onclick = function () { wm.mode = 'terrain'; $('wmvT').setAttribute('aria-pressed', 'true'); $('wmvB').setAttribute('aria-pressed', 'false'); wmDraw(); };
  $('wmvB').onclick = function () { wm.mode = 'bio'; $('wmvB').setAttribute('aria-pressed', 'true'); $('wmvT').setAttribute('aria-pressed', 'false'); wmDraw(); };
  $('wmvG').onchange = function () { wm.grid = this.checked; try { localStorage.setItem('bloco-a-bloco-wmgrid', wm.grid ? '1' : '0'); } catch (e) {} wmDraw(); };
  $('wmvIn').onclick = function () { wmZoom(1.5, wm.W / 2, wm.H / 2); };
  $('wmvOut').onclick = function () { wmZoom(1 / 1.5, wm.W / 2, wm.H / 2); };
  $('wmvMe').onclick = function () { if (!wio.player) { toast('O mundo não guarda a posição do jogador.'); return; } if (wio.player.dim !== wm.dim) { wm.dim = wio.player.dim; wmLoadDim(); return; } wm.cx = wio.player.x; wm.cz = wio.player.z; wm.s = Math.max(wm.s, 2 * wm.dpr); wmDraw(); };
  var pos = function (e) { var r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * wm.dpr, (e.clientY - r.top) * wm.dpr]; };
  cv.addEventListener('wheel', function (e) { e.preventDefault(); var p = pos(e); wmZoom(Math.exp(-e.deltaY * 0.0015), p[0], p[1]); }, { passive: false });
  cv.addEventListener('pointerdown', function (e) {
    cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, pos(e));
    if (ptrs.size === 1) { var w0 = wmToWorld(pos(e)[0], pos(e)[1]); drag = { p: pos(e), cx: wm.cx, cz: wm.cz, moved: false, foot: wmFootHit(w0[0], w0[1]) ? [wmFoot.x, wmFoot.z] : null }; }
    else { drag = null; var a = Array.from(ptrs.values()); pinch = { d: Math.hypot(a[0][0] - a[1][0], a[0][1] - a[1][1]), s: wm.s }; }
  });
  cv.addEventListener('pointermove', function (e) {
    var p = pos(e);
    if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, p);
    if (pinch && ptrs.size >= 2) { var a = Array.from(ptrs.values()), d = Math.hypot(a[0][0] - a[1][0], a[0][1] - a[1][1]); wmZoom(pinch.s * d / pinch.d / wm.s, (a[0][0] + a[1][0]) / 2, (a[0][1] + a[1][1]) / 2); return; }
    if (drag) {
      var dx = p[0] - drag.p[0], dz = p[1] - drag.p[1];
      if (Math.abs(dx) + Math.abs(dz) > 6 * wm.dpr) drag.moved = true;
      if (drag.moved && drag.foot) { wmFoot.x = drag.foot[0] + Math.round(dx / wm.s); wmFoot.z = drag.foot[1] + Math.round(dz / wm.s); $('wmvTip').hidden = true; wmFootInfo(); wmDrawSoon(); return; } // arrastando a estrutura
      if (drag.moved) { wm.cx = drag.cx - dx / wm.s; wm.cz = drag.cz - dz / wm.s; $('wmvTip').hidden = true; wmDrawSoon(); return; }
    }
    // janela flutuante: o bioma debaixo do ponteiro
    var w = wmToWorld(p[0], p[1]), a2 = wmAt(w[0], w[1]), bn = wmBioName(a2.bio), tip = $('wmvTip');
    tip.hidden = false;
    tip.innerHTML = (bn ? '<b>' + esc(bn) + '</b><br>' : '<b>Sem bioma lido</b><br>') + 'X ' + a2.x + ', Z ' + a2.z + (a2.h != null ? ' · Y ' + a2.h : '') +
      (a2.v || a2.o ? '<br>' + esc(wmBlockName(a2)) : '');
    var r = cv.getBoundingClientRect(), tx = e.clientX - r.left + 16, tz = e.clientY - r.top + 16;
    if (tx + tip.offsetWidth > r.width - 8) tx = e.clientX - r.left - tip.offsetWidth - 12;
    if (tz + tip.offsetHeight > r.height - 8) tz = e.clientY - r.top - tip.offsetHeight - 12;
    tip.style.left = tx + 'px'; tip.style.top = (tz + cv.offsetTop) + 'px';
  });
  var up = function (e) {
    ptrs.delete(e.pointerId);
    if (ptrs.size < 2) pinch = null;
    if (drag && !drag.moved && e.type === 'pointerup') { var w = wmToWorld(drag.p[0], drag.p[1]); wm.sel = [Math.floor(w[0]), Math.floor(w[1])]; wmInfo(); wmDraw(); }
    if (!ptrs.size) drag = null;
  };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('pointerleave', function () { $('wmvTip').hidden = true; });
}

/* ---------- Estrutura no mapa: um retângulo tracejado do tamanho de uma estrutura, para ver o espaço que ela ocupa ---------- */
/* Vem da cópia (Ctrl+C), de um item da biblioteca, de um arquivo (.mcstructure, .schem, .litematic: o tamanho; para colar, inteiro)
   ou do tamanho escrito à mão. Arrastar o retângulo move (de bloco em bloco); R gira 90°; as setas empurram 1 bloco
   (Shift: 16). Com o Y da base, o site diz se a altura cabe entre o fundo e o teto do mundo. Fica até a página fechar. */
var wmFoot = null;
function wmFootSize() { var f = wmFoot; return f.rot & 1 ? [f.l, f.w] : [f.w, f.l]; } // 90° e 270° trocam os lados; 180° não
function wmFootDim(d) { return wio.java ? JW_DIMS[d] : wioDim(d); }
function wmFootHit(x, z) { if (!wmFoot || wmFoot.dim !== wm.dim) return false; var s = wmFootSize(); return x >= wmFoot.x && z >= wmFoot.z && x < wmFoot.x + s[0] && z < wmFoot.z + s[1]; }
function wmFootDraw(g) {
  var f = wmFoot; if (!f || f.dim !== wm.dim) return;
  var s = wmFootSize(), p = wmToPx(f.x, f.z), w = s[0] * wm.s, h = s[1] * wm.s, dpr = wm.dpr, ac = cssColor('--accent') || '#c55a11';
  g.fillStyle = 'rgba(255,255,255,.10)'; g.fillRect(p[0], p[1], w, h);
  g.lineWidth = 4 * dpr; g.strokeStyle = 'rgba(0,0,0,.65)'; g.setLineDash([]); g.strokeRect(p[0], p[1], w, h);
  g.lineWidth = 2 * dpr; g.strokeStyle = '#fff'; g.setLineDash([8 * dpr, 6 * dpr]); g.strokeRect(p[0], p[1], w, h); g.setLineDash([]);
  // a frente (o lado norte da estrutura como foi salva) marcada, para saber para onde ela olha depois de girar
  var fx = [[p[0], p[1], p[0] + w, p[1]], [p[0] + w, p[1], p[0] + w, p[1] + h], [p[0] + w, p[1] + h, p[0], p[1] + h], [p[0], p[1] + h, p[0], p[1]]][f.rot | 0];
  g.lineWidth = 3 * dpr; g.strokeStyle = ac; g.beginPath(); g.moveTo(fx[0], fx[1]); g.lineTo(fx[2], fx[3]); g.stroke();
  if (!wmFootArea(f)) { // maior que uma área: as divisas das partes, numeradas
    g.lineWidth = 1.5 * dpr; g.strokeStyle = 'rgba(255,255,255,.8)'; g.setLineDash([3 * dpr, 4 * dpr]); g.fillStyle = '#fff'; g.font = '600 ' + (12 * dpr) + 'px sans-serif';
    wmFootParts(f).forEach(function (r, i) {
      var a = wmToPx(r[0], r[1]), b = wmToPx(r[2], r[3]); g.strokeRect(a[0], a[1], b[0] - a[0], b[1] - a[1]);
      g.fillText(String(i + 1), a[0] + 5 * dpr, a[1] + 16 * dpr);
    });
    g.setLineDash([]);
  }
  g.font = '600 ' + (12 * dpr) + 'px ' + (getComputedStyle(document.body).getPropertyValue('--font-mono') || 'monospace');
  var lab = f.name + ' · ' + s[0] + ' × ' + s[1], tw = g.measureText(lab).width;
  g.fillStyle = 'rgba(0,0,0,.7)'; g.fillRect(p[0], p[1] - 18 * dpr, tw + 10 * dpr, 17 * dpr);
  g.fillStyle = '#fff'; g.fillText(lab, p[0] + 5 * dpr, p[1] - 5 * dpr);
}
function wmFootInfo() {
  var el = $('wmvFoot'); if (!el) return;
  var f = wmFoot; el.hidden = !f;
  if (!f) return;
  var s = wmFootSize(), D = wmFootDim(f.dim), top = D.min + D.h - 1, y1 = f.y + f.h - 1;
  var ok = f.y >= D.min && y1 <= top;
  el.innerHTML = '<b>' + esc(f.name) + '</b><span>' + s[0] + ' × ' + f.h + ' × ' + s[1] + ' · X <b>' + f.x + '</b> a ' + (f.x + s[0] - 1) + ', Z <b>' + f.z + '</b> a ' + (f.z + s[1] - 1) + (f.dim !== wm.dim ? ' (em ' + WIO_DIMS[f.dim].name + ')' : '') + '</span>' +
    '<label class="wmfy">Y da base <input type="number" id="wmfY" value="' + f.y + '" step="1"></label>' +
    (wmFootArea(f) ? '' : '<span class="mixl">Maior que uma área (' + WIO_MAX + ' de lado): Colar aqui cola em ' + wmFootParts(f).length + ' partes.</span>') +
    '<span class="' + (ok ? 'mixl' : 'err') + '">' + (ok ? 'cabe na altura (até Y ' + y1 + '; o teto é Y ' + top + ')' : y1 > top ? (y1 - top) + ' camadas passam do teto (Y ' + top + '): baixe para Y ' + (top - f.h + 1) + ' ou menos' : (D.min - f.y) + ' camadas abaixo do fundo (Y ' + D.min + ')') + '</span>' +
    '<span class="mbtns"><button id="wmfRot" title="R">Girar 90°</button><button id="wmfHere" title="Põe a estrutura no meio da tela">Trazer para o meio</button><button id="wmfLoad" title="Carrega no editor a área da estrutura, com 16 blocos de folga em volta">Carregar área aqui</button>' + (f.src && f.src.k !== 'hand' ? '<button id="wmfPaste" title="Carrega a área e põe a estrutura no lugar do retângulo, para ajustar a altura, girar e colar">Colar aqui</button>' : '') + '<button id="wmfCopy" title="O canto de baixo (menor X, Y e Z): onde colar no jogo">Copiar o canto</button><button id="wmfOff">Tirar</button></span>';
  $('wmfY').onchange = function () { f.y = Math.round(+this.value || 0); wmFootInfo(); };
  $('wmfRot').onclick = wmFootRot;
  $('wmfHere').onclick = function () { var s2 = wmFootSize(); f.dim = wm.dim; f.x = Math.round(wm.cx - s2[0] / 2); f.z = Math.round(wm.cz - s2[1] / 2); wmFootInfo(); wmDraw(); };
  $('wmfLoad').onclick = function () { wmFootLoad(false); };
  if ($('wmfPaste')) $('wmfPaste').onclick = function () { wmFootLoad(true); };
  $('wmfCopy').onclick = function () { var t = f.x + ' ' + f.y + ' ' + f.z; (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { toast('Copiado: ' + t); }, function () { toast(t); }); };
  $('wmfOff').onclick = function () { wmFoot = null; wmFootInfo(); wmDraw(); };
}
/* Área do editor para a estrutura: o retângulo com 16 blocos de folga (menos, se passar do máximo), alinhada aos chunks */
function wmFootArea(f) { var s = wmFootSize(); return wmRectArea(f.x, f.z, s[0], s[1]); }
function wmRectArea(x, z, w, d) {
  for (var m = 16; m >= 0; m -= 8) {
    var x0 = Math.floor((x - m) / 16) * 16, z0 = Math.floor((z - m) / 16) * 16, x1 = Math.ceil((x + w + m) / 16) * 16, z1 = Math.ceil((z + d + m) / 16) * 16;
    if (x1 - x0 <= WIO_MAX && z1 - z0 <= WIO_MAX) return [x0, z0, x1 - x0, z1 - z0];
  }
  return null;
}
/* Carregar área aqui / Colar aqui: carrega a área da estrutura; colando, a cópia entra no modo colar presa no lugar do
   retângulo (X, Z, Y da base e o giro), para ajustar com as setas e o R antes de confirmar */
async function wmFootLoad(paste) {
  var f = wmFoot; if (!f) return;
  var a = wmFootArea(f);
  if (!a && !paste) { toast('A estrutura passa de ' + WIO_MAX + ' blocos de lado: não cabe numa área só do editor. Colar aqui cola em ' + wmFootParts(f).length + ' partes, uma área por vez.', 8000); return; }
  var c = null;
  if (paste) {
    try {
      if (f.src.k === 'clip') c = clip;
      else if (f.src.k === 'lib') { var r = libToClip(f.src.it); c = r.clip; }
      else if (f.src.k === 'file') { busy('Lendo ' + f.src.file.name + '…', null); try { c = await clipFromFile(f.src.file); } finally { busyEnd(); } }
    } catch (e) { toast(e.message || String(e), 7000); return; }
    if (!c || !c.n) { toast('Não há blocos para colar.', 5000); return; }
  }
  if (!a) { wmPartsStart(f, c); return; } // maior que uma área: em partes
  var d = f.dim; closeWorldMap();
  var ok = await wioGoArea(d, a[0], a[1], a[2], a[3], !!paste);
  if (!ok || !paste) return;
  clip = c;
  for (var q = 0; q < (f.rot & 3); q++) rotateClip(); // o mesmo giro do retângulo
  var D = wioDim(d), A = wio.area;
  startPaste(); pasteFixed = [f.x - A.x0, f.y - D.min, f.z - A.z0];
  Object.assign(cam, { tx: pasteFixed[0] + clip.w / 2, ty: pasteFixed[1] + clip.h / 3, tz: pasteFixed[2] + clip.l / 2, dist: Math.max(40, Math.max(clip.w, clip.h, clip.l) * 2.5), pitch: 0.55 }); updateCamera();
  selRefresh();
  toast('A estrutura está no lugar marcado no mapa (canto X ' + f.x + ', Y ' + f.y + ', Z ' + f.z + '). As setas sobem, descem e empurram; R gira; Enter (ou um clique) cola. Esc cancela.', 9000);
}
/* ---------- Colar em partes: estrutura maior que uma área (512 de lado) ---------- */
/* O retângulo é dividido em partes de até 448 × 448 (com a folga de 16 e o encaixe nos chunks, a área de cada uma
   fica com até 512). Cada parte carrega a sua área e cola só a faixa dela, com a cópia inteira presa no mesmo canto:
   as partes encaixam. A altura pode mudar até a primeira parte ser colada; depois, o lugar fica fixo. As áreas já
   coladas ficam guardadas como as outras (Trocar área) e vão todas juntas em Exportar mundo. */
var WM_PART = 448, wmParts = null;
function wmPartRects(x, z, w, d) {
  var nx = Math.ceil(w / WM_PART), nz = Math.ceil(d / WM_PART), sx = Math.ceil(w / nx), sz = Math.ceil(d / nz), r = [];
  for (var j = 0; j < nz; j++) for (var i = 0; i < nx; i++) r.push([x + i * sx, z + j * sz, Math.min(x + w, x + (i + 1) * sx), Math.min(z + d, z + (j + 1) * sz)]);
  return r;
}
function wmFootParts(f) { var s = wmFootSize(); return wmPartRects(f.x, f.z, s[0], s[1]); }
function wmPartsStart(f, c) {
  clip = c;
  for (var q = 0; q < (f.rot & 3); q++) rotateClip(); // o mesmo giro do retângulo
  wmParts = { clip: clip, name: f.name, dim: f.dim, org: [f.x, f.y, f.z], rects: wmPartRects(f.x, f.z, clip.w, clip.l), done: [], cur: 0, locked: false };
  wmPartGo(0);
}
async function wmPartGo(i) {
  var P = wmParts; if (!P) return;
  var r = P.rects[i], a = wmRectArea(r[0], r[1], r[2] - r[0], r[3] - r[1]);
  if (typeof wm !== 'undefined' && wm) closeWorldMap();
  var ok = await wioGoArea(P.dim, a[0], a[1], a[2], a[3], true);
  if (!ok || wmParts !== P) return;
  P.cur = i; clip = P.clip;
  var D = wioDim(P.dim), A = wio.area;
  startPaste(); pasteFixed = [P.org[0] - A.x0, P.org[1] - D.min, P.org[2] - A.z0]; pasteLimit = [r[0] - A.x0, r[1] - A.z0, r[2] - A.x0, r[3] - A.z0];
  Object.assign(cam, { tx: (pasteLimit[0] + pasteLimit[2]) / 2, ty: pasteFixed[1] + clip.h / 3, tz: (pasteLimit[1] + pasteLimit[3]) / 2, dist: Math.max(60, Math.max(r[2] - r[0], r[3] - r[1], clip.h) * 1.4), pitch: 0.6 }); updateCamera(); updateView(true);
  selRefresh(); wmPartsUI();
  toast('Parte ' + (i + 1) + ' de ' + P.rects.length + ' de “' + P.name + '” (X ' + r[0] + ' a ' + (r[2] - 1) + ', Z ' + r[1] + ' a ' + (r[3] - 1) + '). ' + (P.locked ? 'Ela fica no mesmo lugar das partes já coladas.' : 'As setas ↑ ↓ ajustam a altura (vale para todas as partes).') + ' Enter (ou um clique) cola.', 9000);
}
/* Chamado ao colar uma parte: guarda o lugar (a primeira fixa as outras) e diz o que falta */
function wmPartDone(o) {
  var P = wmParts, A = wio.area, D = wioDim(P.dim);
  if (!P.locked) { P.org = [o[0] + A.x0, o[1] + D.min, o[2] + A.z0]; P.locked = true; }
  P.done[P.cur] = true;
  var n = P.rects.length, left = 0; for (var i = 0; i < n; i++) if (!P.done[i]) left++;
  wmPartsUI();
  return left ? 'Parte ' + (P.cur + 1) + ' de ' + n + ' colada (canto X ' + P.org[0] + ', Y ' + P.org[1] + ', Z ' + P.org[2] + '). ' + (left === 1 ? 'Falta 1' : 'Faltam ' + left) + ': Próxima parte, no aviso do canto.' :
    'As ' + n + ' partes estão coladas. Exportar mundo leva todas para o jogo.';
}
function wmPartsUI() {
  var c = $('partsChip'); if (!c) return;
  var P = wmParts; c.hidden = !P; if (!P) return;
  var n = P.rects.length, ok = 0, nx = -1;
  for (var i = 0; i < n; i++) { if (P.done[i]) ok++; else if (nx < 0) nx = i; }
  $('partsTxt').innerHTML = '<b>Colar em partes</b> ' + esc(P.name) + ': ' + ok + ' de ' + n + ' coladas';
  $('partsBtns').innerHTML = (nx >= 0 ? '<button data-part="' + nx + '" class="on">Próxima parte (' + (nx + 1) + ')</button>' : '') +
    P.rects.map(function (r, i) { return '<button data-part="' + i + '" title="X ' + r[0] + ' a ' + (r[2] - 1) + ', Z ' + r[1] + ' a ' + (r[3] - 1) + (P.done[i] ? ' (colada; colar de novo)' : '') + '">' + (P.done[i] ? '✓ ' : '') + (i + 1) + '</button>'; }).join('') +
    '<button data-part="x" title="Fecha este aviso (as partes coladas ficam)">' + (nx < 0 ? 'Fechar' : 'Parar') + '</button>';
}
function wmPartsBind() {
  var c = $('partsBtns'); if (!c) return;
  c.addEventListener('click', function (e) {
    var b = e.target.closest('[data-part]'); if (!b) return;
    var v = b.getAttribute('data-part');
    if (v === 'x') { wmParts = null; if (pasting && pasteLimit) { pasting = false; pasteLimit = null; pasteFixed = null; selRefresh(); } wmPartsUI(); return; }
    wmPartGo(+v);
  });
}
function wmFootRot() { var f = wmFoot; if (!f) return; var s = wmFootSize(), cx = f.x + s[0] / 2, cz = f.z + s[1] / 2; f.rot = (f.rot + 1) & 3; var s2 = wmFootSize(); f.x = Math.round(cx - s2[0] / 2); f.z = Math.round(cz - s2[1] / 2); wmFootInfo(); wmDraw(); }
/* Só o tamanho de um arquivo de estrutura */
async function wmFileSize(file) {
  var u8 = new Uint8Array(await file.arrayBuffer()), n = file.name;
  if (/\.mcstructure$/i.test(n)) { var r = nbtRead(u8, true); if (r.size) return [r.size[0], r.size[1], r.size[2]]; }
  else if (/\.litematic$/i.test(n)) { var t = nbtTreeLE(await gunzipMaybe(u8), true), m = nbtVal(t.v, 'Metadata'), e = m && nbtVal(m, 'EnclosingSize'); if (e) return [Math.abs(nbtVal(e, 'x')), Math.abs(nbtVal(e, 'y')), Math.abs(nbtVal(e, 'z'))]; }
  else { var o = nbtRead(await gunzipMaybe(u8), false), s = o.Schematic || o; if (s.Width) return [s.Width, s.Height, s.Length]; }
  throw new Error('Não achei o tamanho da estrutura neste arquivo.');
}
async function wmFootPick() {
  var lib = await libAll().catch(function () { return []; });
  var opts = (clip ? '<label class="check"><input type="radio" name="wmfS" value="clip" checked><span>A cópia (Ctrl+C): ' + clip.w + ' × ' + clip.h + ' × ' + clip.l + '</span></label>' : '') +
    lib.map(function (it, i) { return '<label class="check"><input type="radio" name="wmfS" value="lib' + i + '"' + (!clip && !i ? ' checked' : '') + '><span>Biblioteca: ' + esc(it.name) + ' (' + it.w + ' × ' + it.h + ' × ' + it.l + ')</span></label>'; }).join('') +
    '<label class="check"><input type="radio" name="wmfS" value="file"' + (!clip && !lib.length ? ' checked' : '') + '><span>Um arquivo (.mcstructure, .schem, .litematic): para colar, ele é lido inteiro na hora</span></label>' +
    '<input type="file" id="wmfF" accept=".mcstructure,.schem,.litematic">' +
    '<label class="check"><input type="radio" name="wmfS" value="hand"><span>Tamanho escrito</span></label>' +
    '<div class="row"><label>Largura (X)<input type="number" id="wmfW" min="1" value="32"></label><label>Altura (Y)<input type="number" id="wmfH" min="1" value="32"></label><label>Comprimento (Z)<input type="number" id="wmfL" min="1" value="32"></label></div>';
  openDialog('<h3>Estrutura no mapa</h3><p>Um retângulo tracejado do tamanho da estrutura, para ver no mapa o espaço que ela vai ocupar. Arraste para mover, R gira.</p>' + opts +
    '<p class="err" id="wmfErr" hidden></p><div class="row"><button class="btn primary" id="wmfOk">Pôr no mapa</button><button class="btn" id="wmfNo">Cancelar</button></div>', function () {
    $('wmfNo').onclick = closeDialog;
    $('wmfF').onchange = function () { var r = overlayRoot.querySelector('[name=wmfS][value=file]'); if (r) r.checked = true; };
    ['wmfW', 'wmfH', 'wmfL'].forEach(function (id) { $(id).oninput = function () { overlayRoot.querySelector('[name=wmfS][value=hand]').checked = true; }; });
    $('wmfOk').onclick = async function () {
      var v = (overlayRoot.querySelector('[name=wmfS]:checked') || {}).value, sz, nm, src;
      try {
        if (v === 'clip') { sz = [clip.w, clip.h, clip.l]; nm = 'A cópia'; src = { k: 'clip' }; }
        else if (v && v.indexOf('lib') === 0) { var it = lib[+v.slice(3)]; sz = [it.w, it.h, it.l]; nm = it.name; src = { k: 'lib', it: it }; }
        else if (v === 'file') { var fl = $('wmfF').files[0]; if (!fl) throw new Error('Escolha o arquivo.'); sz = await wmFileSize(fl); nm = fl.name.replace(/\.[^.]+$/, ''); src = { k: 'file', file: fl }; }
        else { sz = [+$('wmfW').value | 0, +$('wmfH').value | 0, +$('wmfL').value | 0]; nm = 'Estrutura'; src = { k: 'hand' }; if (!(sz[0] > 0 && sz[1] > 0 && sz[2] > 0)) throw new Error('Escreva o tamanho.'); }
      } catch (e) { $('wmfErr').hidden = false; $('wmfErr').textContent = e.message || String(e); return; }
      closeDialog();
      var a = wmAt(wm.cx, wm.cz), y = a.h != null ? a.h + 1 : 64;
      wmFoot = { name: nm, src: src, w: sz[0], h: sz[1], l: sz[2], rot: 0, dim: wm.dim, x: Math.round(wm.cx - sz[0] / 2), z: Math.round(wm.cz - sz[2] / 2), y: y };
      wm.s = Math.max(wm.s, Math.min(8 * wm.dpr, Math.min(wm.W, wm.H) * 0.5 / Math.max(sz[0], sz[2])));
      wmFootInfo(); wmDraw();
      toast('Estrutura no mapa: arraste o retângulo para mover, R gira 90°, as setas empurram (Shift: 16 blocos).', 6000);
    };
  });
}
