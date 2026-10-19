/* ---------- Mundo do Java (.zip com level.dat e region/r.X.Z.mca) ---------- */
/* Formato Anvil (Java 1.18 em diante): cada arquivo de região guarda 32 x 32 chunks. Cabeçalho de 4 KB com a posição
   (setor de 4 KB, 3 bytes) e o tamanho (1 byte) de cada chunk, 4 KB de datas e os chunks: tamanho (4 bytes), tipo de
   compressão (1 gzip, 2 zlib, 3 nenhuma; +128 = guardado à parte em c.X.Z.mcc) e o NBT big-endian do chunk.
   O chunk tem DataVersion, Status ("minecraft:full" = pronto), yPos e a lista "sections": cada pedaço de 16 x 16 x 16 com
   block_states (paleta de { Name, Properties } e os índices empacotados em longs, posição y*256 + z*16 + x, no mínimo
   4 bits, sem atravessar de um long para outro) e biomes (paleta de nomes, 4 x 4 x 4 por pedaço).
   Os nomes Java são os mesmos do editor, então a conversão é direta. O que o editor não conhece vira o "Bloco do jogo"
   e volta igual. A exportação regrava só os arquivos de região com chunks mudados; o resto do .zip sai como entrou.
   Nos chunks mudados, o mapa de alturas é apagado e a luz marcada para refazer (isLightOn = 0): o jogo recalcula. */
var JW_DIMS = [
  { id: 0, name: 'Mundo normal', min: -64, h: 384 },
  { id: 1, name: 'Nether', min: 0, h: 256 },
  { id: 2, name: 'End', min: 0, h: 256 }
];
function wioDim(d) { return (wio && wio.java ? JW_DIMS : WIO_DIMS)[d]; }
var JW_REGION = /^(?:(DIM-1|DIM1)\/|dimensions\/minecraft\/(overworld|the_nether|the_end)\/)?region\/r\.(-?\d+)\.(-?\d+)\.mca$/;
var JW_AIR = { air: 1, cave_air: 1, void_air: 1 };

/* ---------- Longs empacotados (block_states, biomes; o .litematic usa a versão que atravessa os longs) ---------- */
/* raw = bytes big-endian de um long array; devolve n índices de 'bits' bits cada */
function jwUnpack(raw, bits, n, out, span) {
  var dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength), mask = bits >= 32 ? 0xFFFFFFFF : (1 << bits) - 1;
  out = out || new Uint16Array(n);
  if (!span) {
    var per = Math.floor(64 / bits);
    for (var i = 0; i < n; i++) {
      var li = Math.floor(i / per), o = (i % per) * bits, hi = dv.getUint32(li * 8), lo = dv.getUint32(li * 8 + 4), v;
      if (o >= 32) v = hi >>> (o - 32);
      else if (o + bits <= 32) v = lo >>> o;
      else v = (lo >>> o) | (hi << (32 - o));
      out[i] = v & mask;
    }
    return out;
  }
  for (var j = 0; j < n; j++) { // .litematic: os bits seguem direto de um long para o próximo
    var bit = j * bits, w = 0;
    for (var k = 0; k < bits; k++) {
      var b = bit + k, L = b >> 6, ob = b & 63, word = ob >= 32 ? dv.getUint32(L * 8) : dv.getUint32(L * 8 + 4);
      if ((word >>> (ob & 31)) & 1) w |= 1 << k;
    }
    out[j] = w;
  }
  return out;
}
function jwPack(idx, bits) {
  var per = Math.floor(64 / bits), n = Math.ceil(idx.length / per), u = new Uint8Array(n * 8), dv = new DataView(u.buffer), hi = new Uint32Array(n), lo = new Uint32Array(n);
  for (var i = 0; i < idx.length; i++) {
    var li = Math.floor(i / per), o = (i % per) * bits, v = idx[i];
    if (o >= 32) hi[li] |= v << (o - 32);
    else { lo[li] |= v << o; if (o + bits > 32) hi[li] |= v >>> (32 - o); }
  }
  for (i = 0; i < n; i++) { dv.setUint32(i * 8, hi[i] >>> 0); dv.setUint32(i * 8 + 4, lo[i] >>> 0); }
  return u;
}
function jwBits(n, min) { var b = min; while ((1 << b) < n) b++; return b; }
/* Ajudantes da árvore NBT (compound = lista de { k, t, v }) */
function nbtGet(c, k) { if (!c) return null; for (var i = 0; i < c.length; i++) if (c[i].k === k) return c[i]; return null; }
function nbtVal(c, k) { var e = nbtGet(c, k); return e ? e.v : undefined; }
function nbtSet(c, k, t, v) { var e = nbtGet(c, k); if (e) { e.t = t; e.v = v; } else c.push({ k: k, t: t, v: v }); }
function nbtDel(c, k) { for (var i = c.length - 1; i >= 0; i--) if (c[i].k === k) c.splice(i, 1); }

/* ---------- Blocos: paleta Java <-> células ---------- */
function jwKeyOf(ent) { // ent = compound { Name, Properties }
  var nm = String(nbtVal(ent, 'Name') || 'minecraft:air'), pr = nbtVal(ent, 'Properties');
  if (!pr || !pr.length) return nm;
  return nm + '[' + pr.map(function (e) { return e.k + '=' + e.v; }).join(',') + ']';
}
function jwCellOfKey(key) {
  var c = wio.cells.get(key); if (c !== undefined) return c;
  var nm = key.replace(/^minecraft:/, '').replace(/\[.*$/, '');
  if (JW_AIR[nm]) c = 0;
  else {
    c = cellFromJava(key);
    if (!c) {
      var i = wio.presMap.get(key);
      if (i === undefined) { i = wio.pres.length; wio.pres.push({ raw: new TextEncoder().encode(key), name: key.replace(/\[.*$/, ''), key: key }); wio.presMap.set(key, i); wio.presDirty = true; }
      c = (PRES_BI + 1) + i * 4096;
      wio.unknown[nm] = (wio.unknown[nm] || 0) + 1;
    }
  }
  wio.cells.set(key, c);
  return c;
}
/* Célula do editor -> chave Java "minecraft:nome[prop=valor,...]" ('' = não existe no Java) */
function jwKeyOfCell(v, x, y, z) {
  if (!v) return 'minecraft:air';
  var bi = cellBlock(v), b = BLOCKS[bi];
  if (bi === PRES_BI) { var e = wio.pres[cellOri(v)]; return e && e.key ? e.key : 'minecraft:air'; }
  if (b.bo) return ''; // só existe no Bedrock
  var st = '';
  if (b.shape) st = shapeExport(b, cellOri(v), x, y, z).j || '';
  else if (b.ori) { var o = b.ori.o[cellOri(v) < 0 || !b.ori.o[cellOri(v)] ? b.ori.d : cellOri(v)]; st = '[' + b.ori.k + '=' + o[0] + ']'; }
  else if (/_leaves$/.test(b.java)) st = '[persistent=true]';
  return 'minecraft:' + b.java + st;
}
function jwEntryOfKey(key) {
  var m = /^([^\[]+)(?:\[(.*)\])?$/.exec(key), ent = [{ k: 'Name', t: 8, v: m[1] }];
  if (m[2]) ent.push({ k: 'Properties', t: 10, v: m[2].split(',').map(function (pv) { var a = pv.split('='); return { k: a[0], t: 8, v: a.slice(1).join('=') }; }) });
  return ent;
}
/* Pedaço (section): paleta (chaves) e índices de 4096 posições */
function jwSecDecode(sec) {
  var bs = nbtVal(sec, 'block_states'); if (!bs) return null;
  var pl = nbtVal(bs, 'palette'), pal = pl ? pl.a.map(jwKeyOf) : ['minecraft:air'], data = nbtVal(bs, 'data'), idx = new Uint16Array(4096);
  if (pal.length > 1 && data) jwUnpack(data, jwBits(pal.length, 4), 4096, idx);
  return { pal: pal, idx: idx };
}
function jwSecEncode(sec, pal, idx) {
  var used = new Uint32Array(pal.length), i;
  for (i = 0; i < 4096; i++) used[idx[i]]++;
  var remap = new Uint16Array(pal.length), np = [];
  for (i = 0; i < pal.length; i++) if (used[i]) { remap[i] = np.length; np.push(pal[i]); }
  if (!np.length) np.push('minecraft:air');
  var bs = [{ k: 'palette', t: 9, v: { et: 10, a: np.map(jwEntryOfKey) } }];
  if (np.length > 1) { var ni = new Uint16Array(4096); for (i = 0; i < 4096; i++) ni[i] = remap[idx[i]]; bs.push({ k: 'data', t: 12, v: jwPack(ni, jwBits(np.length, 4)) }); }
  nbtSet(sec, 'block_states', 10, bs);
}
/* Biomas do pedaço: 64 nomes (4 x 4 x 4, posição y*16 + z*4 + x) */
function jwBioDecode(sec) {
  var bb = nbtVal(sec, 'biomes'); if (!bb) return null;
  var pl = nbtVal(bb, 'palette'), pal = pl ? pl.a.slice() : ['minecraft:plains'], data = nbtVal(bb, 'data'), idx = new Uint16Array(64);
  if (pal.length > 1 && data) jwUnpack(data, jwBits(pal.length, 1), 64, idx);
  return { pal: pal, idx: idx };
}
function jwBioEncode(sec, pal, idx) {
  var used = {}, np = [], map = {}, ni = new Uint16Array(64), i;
  for (i = 0; i < 64; i++) { var n = pal[idx[i]]; if (!(n in map)) { map[n] = np.length; np.push(n); } ni[i] = map[n]; }
  var bb = [{ k: 'palette', t: 9, v: { et: 8, a: np } }];
  if (np.length > 1) bb.push({ k: 'data', t: 12, v: jwPack(ni, jwBits(np.length, 1)) });
  nbtSet(sec, 'biomes', 10, bb);
}

/* ---------- Biomas: nomes Java <-> números do Bedrock (o editor guarda o número) ---------- */
var JW_BIO = { badlands: 37, bamboo_jungle: 48, basalt_deltas: 181, beach: 16, birch_forest: 27, cherry_grove: 192, cold_ocean: 44, crimson_forest: 179,
  dark_forest: 29, deep_cold_ocean: 45, deep_dark: 190, deep_frozen_ocean: 47, deep_lukewarm_ocean: 43, deep_ocean: 24, desert: 2, dripstone_caves: 188,
  end_barrens: 9, end_highlands: 9, end_midlands: 9, eroded_badlands: 165, flower_forest: 132, forest: 4, frozen_ocean: 46, frozen_peaks: 183,
  frozen_river: 11, grove: 185, ice_spikes: 140, jagged_peaks: 182, jungle: 21, lukewarm_ocean: 42, lush_caves: 187, mangrove_swamp: 191, meadow: 186,
  mushroom_fields: 14, nether_wastes: 8, ocean: 0, old_growth_birch_forest: 155, old_growth_pine_taiga: 32, old_growth_spruce_taiga: 160,
  pale_garden: 193, plains: 1, river: 7, savanna: 35, savanna_plateau: 36, small_end_islands: 9, snowy_beach: 26, snowy_plains: 12, snowy_slopes: 184,
  snowy_taiga: 30, soul_sand_valley: 178, sparse_jungle: 23, stony_peaks: 189, stony_shore: 25, sunflower_plains: 129, swamp: 6, taiga: 5, the_end: 9,
  warm_ocean: 40, warped_forest: 180, windswept_forest: 34, windswept_gravelly_hills: 131, windswept_hills: 3, windswept_savanna: 163, wooded_badlands: 38 };
/* biomas que só existem no Bedrock: o mais parecido do Java */
var JW_BIO_ALT = { desert_hills: 'desert', forest_hills: 'forest', taiga_hills: 'taiga', extreme_hills_edge: 'windswept_hills', jungle_hills: 'jungle',
  birch_forest_hills: 'birch_forest', cold_taiga_hills: 'snowy_taiga', mega_taiga_hills: 'old_growth_pine_taiga', mesa_plateau: 'badlands',
  bamboo_jungle_hills: 'bamboo_jungle', desert_mutated: 'desert', taiga_mutated: 'taiga', swampland_mutated: 'swamp', jungle_mutated: 'jungle',
  jungle_edge_mutated: 'sparse_jungle', birch_forest_hills_mutated: 'old_growth_birch_forest', roofed_forest_mutated: 'dark_forest',
  cold_taiga_mutated: 'snowy_taiga', redwood_taiga_hills_mutated: 'old_growth_spruce_taiga', extreme_hills_plus_trees_mutated: 'windswept_forest',
  savanna_plateau_mutated: 'windswept_savanna', mesa_plateau_stone_mutated: 'wooded_badlands', mesa_plateau_mutated: 'badlands', ice_mountains: 'snowy_plains',
  mushroom_island_shore: 'mushroom_fields', legacy_frozen_ocean: 'frozen_ocean', sulfur_caves: 'dripstone_caves', dappled_forest: 'forest' };
var JW_BIO_REV = null;
function jwBioId(name) { var n = String(name).replace(/^minecraft:/, ''); if (n in JW_BIO) return JW_BIO[n]; var b = BIOMES.filter(function (x) { return x.n === n; })[0]; return b ? b.id : 255; }
function jwBioName(id) {
  if (!JW_BIO_REV) { JW_BIO_REV = {}; Object.keys(JW_BIO).forEach(function (k) { if (!(JW_BIO[k] in JW_BIO_REV)) JW_BIO_REV[JW_BIO[k]] = k; }); }
  if (id in JW_BIO_REV) return 'minecraft:' + JW_BIO_REV[id];
  var b = BIO_BY_ID[id]; return 'minecraft:' + (b && JW_BIO_ALT[b.n] || 'plains');
}

/* ---------- Abrir ---------- */
async function jwOpen(f, prog) {
  var zip = f.zip, pre = f.prefix;
  var w = { java: true, file: f.blob, zip: zip, prefix: pre, name: 'Mundo do Java', player: null, dims: [new Map(), new Map(), new Map()], maps: [],
    patches: new Map(), cells: new Map(), entries: new Map(), pres: [], presMap: new Map(), unknown: {}, area: null, edited: new Set(), bioEdited: new Set(), bmaps: [], legacy: 0,
    regs: [new Map(), new Map(), new Map()], rcache: new Map() };
  try {
    var lo = nbtRead(await gunzipMaybe(await zip.read(pre + 'level.dat')), false), Dt = lo.Data || lo;
    if (Dt.LevelName) w.name = Dt.LevelName;
    if (Dt.SpawnX != null) w.spawn = [Dt.SpawnX | 0, Dt.SpawnZ | 0];
    else if (Dt.spawn && Dt.spawn.pos) w.spawn = [Dt.spawn.pos[0] | 0, Dt.spawn.pos[2] | 0];
    var P = Dt.Player;
    if (P && P.Pos) { var dn = String(P.Dimension || 'minecraft:overworld'); w.player = { dim: /nether/.test(dn) || dn === '-1' ? 1 : /end/.test(dn) || dn === '1' ? 2 : 0, x: Math.floor(P.Pos[0]), z: Math.floor(P.Pos[2]) }; }
    w.dataVersion = Dt.DataVersion || (Dt.Version && Dt.Version.Id) || 0;
  } catch (e) {}
  var regs = zip.paths.filter(function (p) { return p.indexOf(pre) === 0 && JW_REGION.test(p.slice(pre.length)); }), n = 0;
  for (var i = 0; i < regs.length; i++) {
    var m = JW_REGION.exec(regs[i].slice(pre.length)), d = m[1] === 'DIM-1' || m[2] === 'the_nether' ? 1 : m[1] === 'DIM1' || m[2] === 'the_end' ? 2 : 0;
    var rx = +m[3], rz = +m[4], u8 = await jwRegionBytes(w, regs[i]);
    w.regs[d].set(rx + ',' + rz, regs[i]);
    if (u8.length < 8192) continue;
    for (var s = 0; s < 1024; s++) {
      var o = s * 4, sec = (u8[o] << 16) | (u8[o + 1] << 8) | u8[o + 2], cnt = u8[o + 3];
      if (!sec || !cnt) continue;
      var cx = rx * 32 + (s & 31), cz = rz * 32 + (s >> 5);
      w.dims[d].set(cx + ',' + cz, { x: cx, z: cz, ok: true, subs: [] });
      n++;
    }
    if (prog) prog(i + 1, regs.length);
  }
  return w;
}
/* Bytes do arquivo de região (os últimos 6 abertos ficam na memória) */
async function jwRegionBytes(w, path) {
  var c = w.rcache.get(path);
  if (c) { w.rcache.delete(path); w.rcache.set(path, c); return c; }
  c = await w.zip.read(path); w.rcache.set(path, c);
  if (w.rcache.size > 6) w.rcache.delete(w.rcache.keys().next().value);
  return c;
}
function jwKey(dim, cx, cz) { return 'j' + dim + ':' + cx + ',' + cz; }
async function jwInflate(u8, kind) {
  if (kind === 3) return u8;
  if (kind === 4) throw new Error('Chunk comprimido com LZ4 (opção de servidor): o site ainda não lê esse formato.');
  return new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(new DecompressionStream(kind === 1 ? 'gzip' : 'deflate'))).arrayBuffer());
}
/* NBT cru (sem compressão) do chunk, ou null se não existe */
async function jwChunkRaw(dim, cx, cz) {
  var pk = jwKey(dim, cx, cz); if (wio.patches.has(pk)) return wio.patches.get(pk);
  var rx = Math.floor(cx / 32), rz = Math.floor(cz / 32), path = wio.regs[dim].get(rx + ',' + rz); if (!path) return null;
  var u8 = await jwRegionBytes(wio, path), s = ((cz & 31) << 5) | (cx & 31), o = s * 4, sec = (u8[o] << 16) | (u8[o + 1] << 8) | u8[o + 2];
  if (!sec) return null;
  var p = sec * 4096, len = new DataView(u8.buffer, u8.byteOffset + p, 4).getUint32(0), kind = u8[p + 4], data;
  if (kind & 128) { data = await wio.zip.read(path.replace(/r\.(-?\d+)\.(-?\d+)\.mca$/, 'c.' + cx + '.' + cz + '.mcc')); kind &= 127; }
  else data = u8.subarray(p + 5, p + 4 + len);
  return jwInflate(data, kind);
}
/* Árvore NBT do chunk; marca o chunk como não pronto (Status) ou antigo (antes da 1.18) */
async function jwChunk(dim, cx, cz) {
  var raw = await jwChunkRaw(dim, cx, cz); if (!raw) return null;
  var t = nbtTreeLE(raw, true), c = wio.dims[dim].get(cx + ',' + cz);
  if (nbtGet(t.v, 'Level') || !nbtGet(t.v, 'sections')) { if (c) { c.ok = false; c.old = true; } return null; }
  var st = String(nbtVal(t.v, 'Status') || 'minecraft:full');
  if (!/full$/.test(st)) { if (c) c.ok = false; return null; }
  return t;
}
function jwSections(t) { var s = nbtVal(t.v, 'sections'); return s ? s.a : []; }

/* ---------- Mapa visto de cima ---------- */
async function jwMap(dim, prog) {
  if (wio.maps[dim]) return wio.maps[dim];
  var cols = Array.from(wio.dims[dim].values()).filter(function (c) { return c.ok; });
  if (!cols.length) return null;
  var x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9;
  cols.forEach(function (c) { x0 = Math.min(x0, c.x); z0 = Math.min(z0, c.z); x1 = Math.max(x1, c.x); z1 = Math.max(z1, c.z); });
  var bw = (x1 - x0 + 1) * 16, bh = (z1 - z0 + 1) * 16, sc = Math.max(1, Math.ceil(Math.max(bw, bh) / 4096));
  var W2 = Math.ceil(bw / sc), H2 = Math.ceil(bh / sc), img = new ImageData(W2, H2), hgt = new Int16Array(W2 * H2).fill(-32768);
  var bimg = new ImageData(W2, H2), bid = new Uint8Array(W2 * H2).fill(255), bcnt = {}, D = JW_DIMS[dim];
  for (var ci = 0; ci < cols.length; ci++) {
    var c = cols[ci], t = null;
    try { t = await jwChunk(dim, c.x, c.z); } catch (e) { t = null; }
    if (prog && ci % 64 === 0) { prog(ci, cols.length); await new Promise(function (r) { setTimeout(r, 0); }); }
    if (!t) continue;
    var secs = jwSections(t).slice().sort(function (a, b) { return nbtVal(b, 'Y') - nbtVal(a, 'Y'); });
    var top = new Int16Array(256).fill(-32768), col = new Array(256), seenAir = new Uint8Array(256), left = 256, bsec = {};
    for (var si = 0; si < secs.length && left; si++) {
      var sy = nbtVal(secs[si], 'Y'); if (sy > 127) sy -= 256;
      bsec[sy] = secs[si];
      if (dim === 1 && sy > 7) continue;
      var dec = jwSecDecode(secs[si]); if (!dec) continue;
      var cells = dec.pal.map(jwCellOfKey); if (cells.every(function (v) { return !v; }) && dim !== 1) continue;
      for (var q = 0; q < 256; q++) {
        if (top[q] !== -32768) continue;
        var x = q & 15, z = q >> 4;
        for (var y = 15; y >= 0; y--) {
          var v = cells[dec.idx[(y << 8) | (z << 4) | x]], wy = sy * 16 + y;
          if (dim === 1) { if (wy > 126) continue; if (!v) { seenAir[q] = 1; continue; } if (!seenAir[q]) continue; } // Nether: abaixo do teto
          if (!v) continue;
          top[q] = wy; col[q] = wioColor(v); left--; break;
        }
      }
    }
    for (var q2 = 0; q2 < 256; q2++) { // q2 = z*16 + x aqui
      if (!col[q2]) continue;
      var lx = q2 & 15, lz = q2 >> 4, px = Math.floor(((c.x - x0) * 16 + lx) / sc), pz = Math.floor(((c.z - z0) * 16 + lz) / sc), o = pz * W2 + px;
      hgt[o] = top[q2]; img.data[o * 4] = col[q2][0]; img.data[o * 4 + 1] = col[q2][1]; img.data[o * 4 + 2] = col[q2][2]; img.data[o * 4 + 3] = 255;
      var bs = bsec[top[q2] >> 4], bd = bs && jwBioDecode(bs);
      if (bd) {
        var bv = jwBioId(bd.pal[bd.idx[(((top[q2] & 15) >> 2) << 4) | ((lz >> 2) << 2) | (lx >> 2)]]);
        if (bv !== 255) { var bc2 = BIO_BY_ID[bv] ? BIO_BY_ID[bv].map : 0x888888; bid[o] = bv; bcnt[bv] = (bcnt[bv] || 0) + 1; bimg.data[o * 4] = bc2 >> 16 & 255; bimg.data[o * 4 + 1] = bc2 >> 8 & 255; bimg.data[o * 4 + 2] = bc2 & 255; bimg.data[o * 4 + 3] = 255; }
      }
    }
  }
  for (var pz2 = H2 - 1; pz2 > 0; pz2--) for (var px2 = 0; px2 < W2; px2++) {
    var o2 = pz2 * W2 + px2, a = hgt[o2], b2 = hgt[o2 - W2]; if (a === -32768 || b2 === -32768) continue;
    var f = a > b2 ? 1.12 : a < b2 ? 0.86 : 1;
    for (var ch = 0; ch < 3; ch++) img.data[o2 * 4 + ch] = Math.min(255, img.data[o2 * 4 + ch] * f);
  }
  return (wio.maps[dim] = { img: img, bimg: bimg, bid: bid, bcnt: bcnt, x0: x0 * 16, z0: z0 * 16, sc: sc, w: W2, h: H2, min: D.min });
}

/* ---------- Carregar uma área ---------- */
async function jwLoadArea(dim, x0, z0, w, d, prog) {
  var D = JW_DIMS[dim];
  wioLoading = true; try { newWorld(w, D.h, d); } finally { wioLoading = false; }
  var cx0 = x0 >> 4, cz0 = z0 >> 4, ncx = w >> 4, ncz = d >> 4, ms = D.min >> 4, ns = D.h >> 4, tot = ncx * ncz, n = 0, miss = 0;
  wio.legacy = 0;
  for (var a = 0; a < ncx; a++) for (var b = 0; b < ncz; b++) {
    var cx = cx0 + a, cz = cz0 + b, col = wio.dims[dim].get(cx + ',' + cz);
    if (prog && ++n % 16 === 0) prog(n, tot);
    if (!col || !col.ok) { miss++; continue; }
    var t = await jwChunk(dim, cx, cz); if (!t) { if (col.old) wio.legacy++; miss++; continue; }
    var tops = new Int16Array(256).fill(-1), bsec = {};
    jwSections(t).forEach(function (sec) {
      var sy = nbtVal(sec, 'Y'); if (sy > 127) sy -= 256;
      var ey = sy - ms; if (ey < 0 || ey >= ns) return;
      bsec[ey] = sec;
      var dec = jwSecDecode(sec); if (!dec) return;
      var cells = dec.pal.map(jwCellOfKey); if (cells.every(function (v) { return !v; })) return;
      var ch = newChunk(a, ey, b);
      for (var i = 0; i < 4096; i++) {
        var v = cells[dec.idx[i]]; if (!v) continue;
        var pi = ch.map.get(v);
        if (pi === undefined) { pi = ch.pal.length; if (pi === 256) ch.d = Uint16Array.from(ch.d); ch.pal.push(v); ch.map.set(v, pi); }
        ch.d[i] = pi; ch.n++;
        var q = i & 255, yy = (ey << 4) + (i >> 8); if (yy > tops[q]) tops[q] = yy;
      }
      if (ch.n) { W.set(ckey(a, ey, b), ch); blockCount += ch.n; }
    });
    // bioma de cada coluna na altura do topo (para mostrar e para a barra de status)
    var ba = new Uint8Array(256).fill(255);
    for (var q = 0; q < 256; q++) {
      var ty = Math.max(0, tops[q]), sec = bsec[ty >> 4], bd = sec && jwBioDecode(sec); if (!bd) continue;
      var lx = q & 15, lz = q >> 4, id = jwBioId(bd.pal[bd.idx[(((ty & 15) >> 2) << 4) | ((lz >> 2) << 2) | (lx >> 2)]]);
      ba[(lz << 4) | lx] = id;
    }
    bioOrig.set(bioKey(a, b), ba);
  }
  wio.area = { dim: dim, x0: x0, z0: z0, w: w, d: d, miss: miss };
  wio.edited = new Set();
  lightFull = true; verCounter++; dirtyAll();
  return { miss: miss, tot: tot };
}

/* ---------- Gravar as mudanças (só os pedaços editados, só as posições diferentes) ---------- */
function jwSecFor(t, sy) {
  var secs = jwSections(t), s = secs.filter(function (q) { var y = nbtVal(q, 'Y'); return (y > 127 ? y - 256 : y) === sy; })[0];
  if (s) return s;
  // pedaço que não existia (só ar): cria, com os biomas do pedaço mais perto
  var near = secs.slice().sort(function (p, q) { return Math.abs(nbtVal(p, 'Y') - sy) - Math.abs(nbtVal(q, 'Y') - sy); })[0];
  s = [{ k: 'Y', t: 1, v: sy & 255 }];
  jwSecEncode(s, ['minecraft:air'], new Uint16Array(4096));
  var nb = near && nbtGet(near, 'biomes'); if (nb) s.push({ k: 'biomes', t: 10, v: nb.v }); else jwBioEncode(s, ['minecraft:plains'], new Uint16Array(64));
  var L = nbtVal(t.v, 'sections'); L.a.push(s);
  return s;
}
function jwPut(dim, cx, cz, t, relight) {
  if (relight) { nbtDel(t.v, 'Heightmaps'); nbtSet(t.v, 'isLightOn', 1, 0); }
  wio.patches.set(jwKey(dim, cx, cz), nbtTreeWrite(t, true));
}
async function jwCommit(prog) {
  var res = { blocks: 0, lost: 0, legacy: 0, bedrockOnly: 0 };
  if (!wio || !wio.area || !wio.edited.size) return res;
  var A = wio.area, D = JW_DIMS[A.dim], ms = D.min >> 4, dim = A.dim, cols = new Map(), n = 0;
  wio.edited.forEach(function (s) { var p = s.split(','), k = p[0] + ',' + p[2]; if (!cols.has(k)) cols.set(k, []); cols.get(k).push(+p[1]); });
  for (var entry of cols) {
    var p = entry[0].split(','), ecx = +p[0], ecz = +p[1], cx = (A.x0 >> 4) + ecx, cz = (A.z0 >> 4) + ecz, ys = entry[1];
    if (prog) prog(++n, cols.size);
    var col = wio.dims[dim].get(cx + ',' + cz), t = col && col.ok ? await jwChunk(dim, cx, cz) : null;
    if (!t) { ys.forEach(function (ecy) { var ch = W.get(ckey(ecx, ecy, ecz)); if (ch) res.lost += ch.n; }); continue; }
    var removed = new Set(), any = false;
    for (var yi = 0; yi < ys.length; yi++) {
      var ecy = ys[yi], sy = ecy + ms, sec = jwSecFor(t, sy), dec = jwSecDecode(sec) || { pal: ['minecraft:air'], idx: new Uint16Array(4096) };
      var cells = dec.pal.map(jwCellOfKey), pmap = new Map(dec.pal.map(function (k, i) { return [k, i]; })), ch = false;
      for (var i = 0; i < 4096; i++) {
        var x = i & 15, z = (i >> 4) & 15, y = i >> 8, ex = (ecx << 4) + x, ey = (ecy << 4) + y, ez = (ecz << 4) + z;
        var cur = gget(ex, ey, ez), base = cells[dec.idx[i]];
        if (cur === base) continue;
        var key = jwKeyOfCell(cur, ex, ey, ez); if (!key) { res.bedrockOnly++; key = 'minecraft:air'; }
        var pi = pmap.get(key); if (pi === undefined) { pi = dec.pal.length; dec.pal.push(key); cells.push(jwCellOfKey(key)); pmap.set(key, pi); }
        if (pi === dec.idx[i]) continue;
        dec.idx[i] = pi; removed.add((cx * 16 + x) + ',' + (sy * 16 + y) + ',' + (cz * 16 + z)); ch = true; res.blocks++;
      }
      if (ch) { jwSecEncode(sec, dec.pal, dec.idx); nbtDel(sec, 'BlockLight'); nbtDel(sec, 'SkyLight'); any = true; }
    }
    if (!any) continue;
    var be = nbtVal(t.v, 'block_entities');
    if (be && be.a.length) be.a = be.a.filter(function (e) { return !removed.has(nbtVal(e, 'x') + ',' + nbtVal(e, 'y') + ',' + nbtVal(e, 'z')); });
    jwPut(dim, cx, cz, t, true);
  }
  wio.edited.clear();
  wio.maps[dim] = null;
  return res;
}
/* Biomas pintados: o Java guarda um bioma a cada 4 x 4 x 4 blocos; cada quadrado de 4 x 4 colunas fica com o bioma
   pintado que mais aparece nele, da superfície (16 blocos abaixo do topo mais alto do quadrado) para cima; os biomas
   de caverna não são trocados (como no Bedrock, src/biome.js) */
async function jwBioCommit() {
  if (!wio || !wio.area || !wio.bioEdited.size) return 0;
  var A = wio.area, dim = A.dim, n = 0;
  for (var k of wio.bioEdited) {
    var p = k.split(','), ecx = +p[0], ecz = +p[1], cx = (A.x0 >> 4) + ecx, cz = (A.z0 >> 4) + ecz, col = wio.dims[dim].get(cx + ',' + cz);
    var a = bioPaint.get(k); if (!a || !col || !col.ok) continue;
    var t = await jwChunk(dim, cx, cz); if (!t) continue;
    var cell = new Array(16), low = new Array(16), Dm = JW_DIMS[dim].min;
    for (var bz = 0; bz < 4; bz++) for (var bx = 0; bx < 4; bx++) {
      var cnt = {}, best = -1, bn = 0;
      for (var z = 0; z < 4; z++) for (var x = 0; x < 4; x++) { var v = a[((bz * 4 + z) << 4) | (bx * 4 + x)]; if (v !== 255) { cnt[v] = (cnt[v] || 0) + 1; if (cnt[v] > bn) { bn = cnt[v]; best = v; } } }
      cell[bz * 4 + bx] = best >= 0 ? jwBioName(best) : null;
      var top = -1; for (z = 0; z < 4; z++) for (x = 0; x < 4; x++) top = Math.max(top, bioSurf(ecx * 16 + bx * 4 + x, ecz * 16 + bz * 4 + z));
      low[bz * 4 + bx] = top < 0 ? -1e9 : top - BIO_DEEP;
    }
    jwSections(t).forEach(function (sec) {
      var bd = jwBioDecode(sec) || { pal: ['minecraft:plains'], idx: new Uint16Array(64) }, sy = nbtVal(sec, 'Y'); if (sy > 127) sy -= 256;
      for (var i = 0; i < 64; i++) { var nm = cell[i & 15]; if (!nm) continue;
        if (sy * 16 + (i >> 4) * 4 + 3 - Dm < low[i & 15] || BIO_CAVE_JAVA.test(bd.pal[bd.idx[i]])) continue; // abaixo da superfície ou caverna
        var pi = bd.pal.indexOf(nm); if (pi < 0) { pi = bd.pal.length; bd.pal.push(nm); } bd.idx[i] = pi; }
      jwBioEncode(sec, bd.pal, bd.idx);
    });
    jwPut(dim, cx, cz, t, false); n++;
  }
  wio.bioEdited.clear();
  return n;
}

/* ---------- Exportar: os arquivos de região com chunks mudados são refeitos; o resto sai igual ---------- */
async function jwDeflate(u8) { return new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer()); }
async function jwRegionRebuild(path, mods) { // mods: Map(slot -> NBT cru)
  var old = await wio.zip.read(path), parts = [], hdr = new Uint8Array(8192), sec = 2, now = Math.floor(Date.now() / 1000);
  if (old.length >= 8192) hdr.set(old.subarray(4096, 8192), 4096); // datas
  for (var s = 0; s < 1024; s++) {
    var body = null;
    if (mods.has(s)) {
      var z = await jwDeflate(mods.get(s)), b = new Uint8Array(5 + z.length), dv = new DataView(b.buffer);
      dv.setUint32(0, z.length + 1); b[4] = 2; b.set(z, 5); body = b;
      new DataView(hdr.buffer).setUint32(4096 + s * 4, now);
    } else if (old.length >= 8192) {
      var o = s * 4, os = (old[o] << 16) | (old[o + 1] << 8) | old[o + 2], oc = old[o + 3];
      if (os && oc) { var ln = new DataView(old.buffer, old.byteOffset + os * 4096, 4).getUint32(0); body = old.subarray(os * 4096, os * 4096 + 4 + ln); }
    }
    if (!body) continue;
    var ns = Math.ceil(body.length / 4096);
    if (ns > 255) throw new Error('Um chunk ficou grande demais para o arquivo de região (mais de 1 MB).');
    var padded = new Uint8Array(ns * 4096); padded.set(body);
    hdr[s * 4] = sec >> 16 & 255; hdr[s * 4 + 1] = sec >> 8 & 255; hdr[s * 4 + 2] = sec & 255; hdr[s * 4 + 3] = ns;
    parts.push(padded); sec += ns;
  }
  return wioCat([hdr].concat(parts));
}
async function jwBuild(prog) {
  var byRegion = new Map();
  wio.patches.forEach(function (v, k) {
    var m = /^j(\d):(-?\d+),(-?\d+)$/.exec(k); if (!m || !v) return;
    var dim = +m[1], cx = +m[2], cz = +m[3], path = wio.regs[dim].get(Math.floor(cx / 32) + ',' + Math.floor(cz / 32)); if (!path) return;
    if (!byRegion.has(path)) byRegion.set(path, new Map());
    byRegion.get(path).set(((cz & 31) << 5) | (cx & 31), v);
  });
  var repl = new Map(), i = 0;
  for (var e of byRegion) { if (prog) prog(++i, byRegion.size + 1); repl.set(e[0], await jwRegionRebuild(e[0], e[1])); }
  var files = [], pre = wio.prefix, top = (wio.name || 'mundo').replace(/[\\\/:*?"<>|]/g, '_') + '/';
  wio.zip.paths.forEach(function (p) { if (p.indexOf(pre) === 0 && !/(^|\/)session\.lock$/.test(p)) files.push(repl.has(p) ? { name: top + p.slice(pre.length), data: repl.get(p) } : { name: top + p.slice(pre.length), src: p }); });
  var out = await wioZipOut(files, prog);
  return { blob: out, keys: wio.patches.size };
}

/* ---------- .litematic (Litematica): uma ou mais regiões com paleta Java e longs empacotados que atravessam ---------- */
async function importLitematic(u8) {
  var t = nbtTreeLE(await gunzipMaybe(u8), true), regs = nbtVal(t.v, 'Regions');
  if (!regs || !regs.length) throw new Error('Este .litematic não tem regiões.');
  var boxes = [], mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9], unknown = {};
  regs.forEach(function (r) {
    var R = r.v, P = nbtVal(R, 'Position'), S = nbtVal(R, 'Size'), pos = ['x', 'y', 'z'].map(function (k) { return nbtVal(P, k); }), sz = ['x', 'y', 'z'].map(function (k) { return nbtVal(S, k); });
    var lo = pos.map(function (p, i) { return sz[i] < 0 ? p + sz[i] + 1 : p; }), ab = sz.map(Math.abs);
    var pal = nbtVal(R, 'BlockStatePalette').a.map(jwKeyOf), data = nbtVal(R, 'BlockStates'), vol = ab[0] * ab[1] * ab[2];
    var idx = data ? jwUnpack(data, jwBits(pal.length, 2), vol, vol > 65535 || pal.length > 65535 ? new Uint32Array(vol) : new Uint16Array(vol), true) : new Uint16Array(vol);
    var cells = pal.map(function (k) {
      var nm = k.replace(/^minecraft:/, '').replace(/\[.*$/, ''); if (JW_AIR[nm]) return 0;
      var c = cellFromJava(k); if (!c) unknown[nm] = 0; return c;
    });
    boxes.push({ lo: lo, ab: ab, idx: idx, cells: cells, pal: pal });
    for (var i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], lo[i]); mx[i] = Math.max(mx[i], lo[i] + ab[i] - 1); }
  });
  var w = mx[0] - mn[0] + 1, h = mx[1] - mn[1] + 1, l = mx[2] - mn[2] + 1;
  // blocos desconhecidos: contados por nome (ficam de fora); o ar não conta
  boxes.forEach(function (B, bi) { var pal = B.pal; for (var q = 0; q < B.idx.length; q++) { var c0 = B.cells[B.idx[q]]; if (!c0) { var nm = pal[B.idx[q]].replace(/^minecraft:/, '').replace(/\[.*$/, ''); if (nm in unknown) unknown[nm]++; } } });
  var cut = fillWorld(w, h, l, function (x, y, z) {
    for (var i = 0; i < boxes.length; i++) {
      var B = boxes[i], lx = x + mn[0] - B.lo[0], ly = y + mn[1] - B.lo[1], lz = z + mn[2] - B.lo[2];
      if (lx < 0 || ly < 0 || lz < 0 || lx >= B.ab[0] || ly >= B.ab[1] || lz >= B.ab[2]) continue;
      var v = B.cells[B.idx[(ly * B.ab[2] + lz) * B.ab[0] + lx]]; if (v) return v;
    }
    return 0;
  });
  importReport('.litematic' + (regs.length > 1 ? ' (' + regs.length + ' regiões juntas)' : ''), cut, unknown);
}
