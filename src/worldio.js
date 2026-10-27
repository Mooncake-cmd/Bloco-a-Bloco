/* ---------- Mundo do jogo (Bedrock): abrir um .mcworld, editar uma área e exportar o mundo com a construção ---------- */
/* O .mcworld é um .zip com level.dat e a pasta db/, um banco LevelDB (versão da Mojang: blocos comprimidos com
   deflate). Cada chunk de 16 x 16 guarda pedaços de 16 x 16 x 16 ("sub-chunks", chave x, z, [dimensão], 0x2f, y), cada
   um com uma paleta de blocos em NBT (nome, estados, versão) e um índice por bloco, empacotado em palavras de 32 bits.
   Fluxo: o site indexa o banco (só as chaves), desenha um mapa visto de cima, carrega no editor a área escolhida
   (até 512 x 512, altura toda) e, ao trocar de área ou exportar, compara cada pedaço editado com o original e troca só
   os blocos que mudaram. O que o editor não conhece (baús com itens, geradores, blocos fora da lista) fica igual.
   A exportação copia o .mcworld original e acrescenta um arquivo de registro (log) do LevelDB com as chaves novas,
   que o jogo aplica ao abrir o mundo; as tabelas originais não são reescritas. */
var WIO_DIMS = [
  { id: 0, name: 'Mundo normal', min: -64, h: 384 },
  { id: 1, name: 'Nether', min: 0, h: 128 },
  { id: 2, name: 'End', min: 0, h: 256 }
];
var WIO_MAX = 512, WIO_BLOCK_VERSION = 18090528;
var wio = null, wioLoading = false;

/* ---------- bytes ---------- */
function wioStr(u8) { var s = ''; for (var i = 0; i < u8.length; i += 8192) s += String.fromCharCode.apply(null, u8.subarray(i, i + 8192)); return s; }
function wioBytes(s) { var u = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }
function wioHex(s) { var h = ''; for (var i = 0; i < s.length; i++) h += (s.charCodeAt(i) + 256).toString(16).slice(1); return h; }
function wioUnhex(h) { var s = ''; for (var i = 0; i < h.length; i += 2) s += String.fromCharCode(parseInt(h.substr(i, 2), 16)); return s; }
/* varint até 2^53 (números de sequência passam de 32 bits) */
function wioVar(u8, p) { var r = 0, m = 1, c; do { c = u8[p++]; r += (c & 127) * m; m *= 128; } while (c & 128); return [r, p]; }
function wioPutVar(out, v) { while (v >= 128) { out.push((v % 128) | 128); v = Math.floor(v / 128); } out.push(v); }
function wioI32(u8, p) { return (u8[p] | u8[p + 1] << 8 | u8[p + 2] << 16 | u8[p + 3] << 24); }
function wioCat(parts) {
  var n = 0, i; for (i = 0; i < parts.length; i++) n += parts[i].length;
  var out = new Uint8Array(n), o = 0; for (i = 0; i < parts.length; i++) { out.set(parts[i], o); o += parts[i].length; }
  return out;
}

/* ---------- NBT (little-endian) ---------- */
/* Pula uma tag completa (tipo, nome, conteúdo) e devolve a posição seguinte */
function nbtSkip(u8, p) {
  var t = u8[p++]; p += 2 + (u8[p] | u8[p + 1] << 8);
  return nbtSkipPay(u8, p, t);
}
function nbtSkipPay(u8, p, t) {
  switch (t) {
    case 1: return p + 1; case 2: return p + 2; case 3: case 5: return p + 4; case 4: case 6: return p + 8;
    case 7: return p + 4 + wioI32(u8, p);
    case 8: return p + 2 + (u8[p] | u8[p + 1] << 8);
    case 9: { var et = u8[p], n = wioI32(u8, p + 1); p += 5; for (var i = 0; i < n; i++) p = nbtSkipPay(u8, p, et); return p; }
    case 10: for (;;) { var tt = u8[p++]; if (!tt) return p; p += 2 + (u8[p] | u8[p + 1] << 8); p = nbtSkipPay(u8, p, tt); }
    case 11: return p + 4 + 4 * wioI32(u8, p);
    case 12: return p + 4 + 8 * wioI32(u8, p);
    default: throw new Error('NBT inválido no mundo (tipo ' + t + ').');
  }
}
/* Lista de compostos NBT colados (ex.: dados de baús e camas de um chunk): [{raw, o (objeto)}] */
function nbtList(u8) {
  var out = [], p = 0;
  while (p < u8.length) { var e = nbtSkip(u8, p), raw = u8.slice(p, e); out.push({ raw: raw, o: nbtRead(raw, true) }); p = e; }
  return out;
}
/* Entrada de paleta com os tipos dos estados (para exportar um bloco desconhecido num .mcstructure igual ao original) */
function nbtPalTyped(raw) {
  var o = { name: '', states: {}, version: 0 }, u8 = raw, p = 3 + (u8[1] | u8[2] << 8), dec = new TextDecoder();
  function str() { var n = u8[p] | u8[p + 1] << 8; p += 2; var s = dec.decode(u8.subarray(p, p + n)); p += n; return s; }
  for (;;) {
    var t = u8[p++]; if (!t) break;
    var k = str();
    if (k === 'name' && t === 8) o.name = str();
    else if (k === 'version' && t === 3) { o.version = wioI32(u8, p); p += 4; }
    else if (k === 'states' && t === 10) {
      for (;;) {
        var st = u8[p++]; if (!st) break;
        var sk = str();
        if (st === 1) o.states[sk] = { t: 'byte', v: u8[p++] };
        else if (st === 3) { o.states[sk] = { t: 'int', v: wioI32(u8, p) }; p += 4; }
        else if (st === 8) o.states[sk] = { t: 'string', v: str() };
        else p = nbtSkipPay(u8, p, st);
      }
    } else p = nbtSkipPay(u8, p, t);
  }
  return o;
}
/* Bloco de entidade (cama, bloco de comando): número = byte; {t, v} = o tipo dado */
function wioEntTags(ent, x, y, z) {
  var o = { id: { t: 'string', v: ent.id }, isMovable: { t: 'byte', v: 1 } };
  for (var k in ent) if (k !== 'id') o[k] = typeof ent[k] === 'object' ? ent[k] : { t: 'byte', v: ent[k] };
  o.x = { t: 'int', v: x }; o.y = { t: 'int', v: y }; o.z = { t: 'int', v: z };
  return o;
}
function nbtRootLE(compound) {
  var w = new MCExport.NbtWriter(true); w.u8(10); w.str(''); w.payload({ t: 'compound', v: compound }); return w.finish();
}

/* ---------- LevelDB (formato da Mojang) ---------- */
var CRC32C = (function () { var t = new Uint32Array(256); for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0x82F63B78 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32c(u8, c) { c = (c === undefined ? 0 : c) ^ 0xFFFFFFFF; for (var i = 0; i < u8.length; i++) c = CRC32C[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function crcMask(c) { return (((c >>> 15) | (c << 17)) + 0xa282ead8) >>> 0; }
async function ldbInflate(raw, t) {
  if (t === 0) return raw;
  var fmt = t === 4 ? 'deflate-raw' : t === 2 ? 'deflate' : null;
  if (!fmt) throw new Error('Este mundo usa uma compressão que o site não lê (tipo ' + t + ').');
  return new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream(fmt))).arrayBuffer());
}
/* Percorre as entradas de um bloco de tabela: fn(chave interna, posição do valor, tamanho do valor) */
function ldbEntries(blk, fn) {
  var n = blk.length, nr = wioI32(blk, n - 4) >>> 0, end = n - 4 - 4 * nr, p = 0, key = new Uint8Array(0), r;
  while (p < end) {
    r = wioVar(blk, p); var sh = r[0]; r = wioVar(blk, r[1]); var ns = r[0]; r = wioVar(blk, r[1]); var vl = r[0]; p = r[1];
    var nk = new Uint8Array(sh + ns); nk.set(key.subarray(0, sh)); nk.set(blk.subarray(p, p + ns), sh); key = nk; p += ns;
    fn(key, p, vl); p += vl;
  }
}
/* Registros físicos de um arquivo .log (blocos de 32 KB) -> registros lógicos */
function ldbLogRecords(data) {
  var recs = [], buf = null, p = 0;
  while (p + 7 <= data.length) {
    var left = 32768 - (p % 32768);
    if (left < 7) { p += left; continue; }
    var ln = data[p + 4] | data[p + 5] << 8, t = data[p + 6], pay = data.subarray(p + 7, p + 7 + ln); p += 7 + ln;
    if (t === 0 && ln === 0) break;
    if (t === 1) recs.push(pay);
    else if (t === 2) buf = [pay];
    else if (t === 3 && buf) buf.push(pay);
    else if (t === 4 && buf) { buf.push(pay); recs.push(wioCat(buf)); buf = null; }
  }
  return recs;
}
/* Lê o MANIFEST: quais tabelas valem, a partir de qual .log e a última sequência */
function ldbManifest(data) {
  var live = new Map(), m = { log: 0, prev: 0, next: 0, seq: 0, live: live, ok: true };
  ldbLogRecords(data).forEach(function (r) {
    var p = 0, v;
    while (p < r.length) {
      v = wioVar(r, p); var tg = v[0]; p = v[1];
      if (tg === 1) { v = wioVar(r, p); p = v[1] + v[0]; }
      else if (tg === 2) { v = wioVar(r, p); m.log = v[0]; p = v[1]; }
      else if (tg === 3) { v = wioVar(r, p); m.next = v[0]; p = v[1]; }
      else if (tg === 4) { v = wioVar(r, p); m.seq = v[0]; p = v[1]; }
      else if (tg === 9) { v = wioVar(r, p); m.prev = v[0]; p = v[1]; }
      else if (tg === 5) { v = wioVar(r, p); p = v[1]; v = wioVar(r, p); p = v[1] + v[0]; }
      else if (tg === 6) { v = wioVar(r, p); p = v[1]; v = wioVar(r, p); p = v[1]; live.delete(v[0]); }
      else if (tg === 7) {
        v = wioVar(r, p); p = v[1]; v = wioVar(r, p); var num = v[0]; p = v[1]; v = wioVar(r, p); p = v[1];
        v = wioVar(r, p); p = v[1] + v[0]; v = wioVar(r, p); p = v[1] + v[0]; live.set(num, 1);
      } else { m.ok = false; return; }
    }
  });
  return m;
}
/* Indexa o banco: para cada chave, onde está o valor mais novo. read(nome) devolve os bytes do arquivo da pasta db/. */
async function ldbOpen(names, read, prog) {
  var db = { idx: new Map(), tables: [], cache: new Map(), maxSeq: 0, maxFile: 0 };
  var num = function (n) { var m = /^(\d+)\.(log|ldb|sst)$/.exec(n); return m ? +m[1] : -1; };
  names.forEach(function (n) { var k = num(n) > 0 ? num(n) : (/^MANIFEST-(\d+)$/.exec(n) || [0, 0])[1] | 0; if (k > db.maxFile) db.maxFile = k; });
  var man = null;
  try {
    var cur = new TextDecoder().decode(await read('CURRENT')).trim();
    if (names.indexOf(cur) >= 0) man = ldbManifest(await read(cur));
  } catch (e) { man = null; }
  if (man && !man.ok) man = null;
  if (man) { db.maxSeq = man.seq; db.maxFile = Math.max(db.maxFile, man.next); }
  var tbls = names.filter(function (n) { return /\.(ldb|sst)$/.test(n) && (!man || man.live.has(num(n))); });
  var logs = names.filter(function (n) { return /\.log$/.test(n) && (!man || num(n) >= man.log || num(n) === man.prev); }).sort(function (a, b) { return num(a) - num(b); });
  var idx = db.idx, total = tbls.length + logs.length, done = 0;
  function put(k, ref) { var o = idx.get(k); if (!o || o.q <= ref.q) idx.set(k, ref); if (ref.q > db.maxSeq) db.maxSeq = ref.q; }
  for (var ti = 0; ti < tbls.length; ti++) {
    var f = await read(tbls[ti]), fi = db.tables.length; db.tables.push(f);
    var r = wioVar(f, f.length - 48); r = wioVar(f, r[1]); r = wioVar(f, r[1]); var io = r[0]; r = wioVar(f, r[1]); var isz = r[0];
    var index = await ldbInflate(f.subarray(io, io + isz), f[io + isz]);
    var handles = [];
    ldbEntries(index, function (k, p, vl) { var h = wioVar(index, p), h2 = wioVar(index, h[1]); handles.push([h[0], h2[0]]); });
    for (var hi = 0; hi < handles.length; hi++) {
      var bo = handles[hi][0], bs = handles[hi][1], blk = await ldbInflate(f.subarray(bo, bo + bs), f[bo + bs]);
      ldbEntries(blk, function (k, p, vl) {
        var n = k.length, lo = (k[n - 8] | k[n - 7] << 8 | k[n - 6] << 16 | k[n - 5] << 24) >>> 0, hi2 = (k[n - 4] | k[n - 3] << 8 | k[n - 2] << 16 | k[n - 1] << 24) >>> 0;
        put(wioStr(k.subarray(0, n - 8)), { f: fi, o: bo, s: bs, vo: p, vl: vl, q: hi2 * 16777216 + (lo >>> 8), t: lo & 255 });
      });
      if (prog) prog(done + hi / handles.length, total);
    }
    done++;
  }
  for (var li = 0; li < logs.length; li++) {
    ldbLogRecords(await read(logs[li])).forEach(function (rec) {
      var seq = wioI32(rec, 0) >>> 0, seqHi = wioI32(rec, 4) >>> 0, q = seqHi * 4294967296 + seq, cnt = wioI32(rec, 8) >>> 0, p = 12, v;
      for (var i = 0; i < cnt && p < rec.length; i++, q++) {
        var t = rec[p++]; v = wioVar(rec, p); var k = wioStr(rec.subarray(v[1], v[1] + v[0])); p = v[1] + v[0];
        if (t === 1) { v = wioVar(rec, p); put(k, { f: -1, val: rec.slice(v[1], v[1] + v[0]), q: q, t: 1 }); p = v[1] + v[0]; }
        else put(k, { f: -1, val: null, q: q, t: 0 });
      }
    });
    done++; if (prog) prog(done, total);
  }
  return db;
}
async function ldbGet(db, k) {
  var r = db.idx.get(k); if (!r || r.t !== 1) return null;
  if (r.f < 0) return r.val;
  var ck = r.f + ':' + r.o, blk = db.cache.get(ck);
  if (blk) { db.cache.delete(ck); db.cache.set(ck, blk); }
  else {
    var f = db.tables[r.f]; blk = await ldbInflate(f.subarray(r.o, r.o + r.s), f[r.o + r.s]);
    db.cache.set(ck, blk); if (db.cache.size > 48) db.cache.delete(db.cache.keys().next().value);
  }
  return blk.subarray(r.vo, r.vo + r.vl);
}
/* Arquivo .log com as gravações: lotes (sequência, quantidade, registros) cortados em blocos de 32 KB */
function ldbLogWrite(entries, seq) {
  var out = [], pos = 0, BATCH = 1 << 20;
  function phys(type, pay) {
    var hd = new Uint8Array(7), crc = crcMask(crc32c(pay, crc32c(new Uint8Array([type]))));
    hd[0] = crc; hd[1] = crc >>> 8; hd[2] = crc >>> 16; hd[3] = crc >>> 24; hd[4] = pay.length; hd[5] = pay.length >> 8; hd[6] = type;
    out.push(hd, pay); pos += 7 + pay.length;
  }
  function record(data) {
    var p = 0, first = true;
    do {
      var left = 32768 - (pos % 32768);
      if (left < 7) { out.push(new Uint8Array(left)); pos += left; left = 32768; }
      var n = Math.min(data.length - p, left - 7), end = p + n === data.length;
      phys(first && end ? 1 : first ? 2 : end ? 4 : 3, data.subarray(p, p + n)); p += n; first = false;
    } while (p < data.length);
  }
  for (var i = 0; i < entries.length;) {
    var body = [], size = 0, cnt = 0;
    while (i < entries.length && (size < BATCH || !cnt)) {
      var k = wioBytes(entries[i][0]), v = entries[i][1], b = [v ? 1 : 0]; wioPutVar(b, k.length);
      body.push(new Uint8Array(b), k); size += b.length + k.length;
      if (v) { var vl = []; wioPutVar(vl, v.length); body.push(new Uint8Array(vl), v); size += vl.length + v.length; }
      cnt++; i++;
    }
    var hd = new Uint8Array(12), dv = new DataView(hd.buffer);
    dv.setUint32(0, seq % 4294967296, true); dv.setUint32(4, Math.floor(seq / 4294967296), true); dv.setUint32(8, cnt, true);
    record(wioCat([hd].concat(body))); seq += cnt;
  }
  return wioCat(out);
}

/* ---------- Chaves e sub-chunks ---------- */
function wioKey(x, z, dim, tag, y) {
  var n = dim ? 13 : 9, u = new Uint8Array(n + (y == null ? 0 : 1)), dv = new DataView(u.buffer);
  dv.setInt32(0, x, true); dv.setInt32(4, z, true); if (dim) dv.setInt32(8, dim, true);
  u[n - 1] = tag; if (y != null) u[n] = y & 255;
  return wioStr(u);
}
/* Sub-chunk (versões 8 e 9): camadas com índice por bloco (posição x*256 + z*16 + y) e paleta em NBT cru */
function subDecode(u8) {
  var v = u8[0]; if (v !== 8 && v !== 9) return null;
  var n = u8[1], p = v === 9 ? 3 : 2, layers = [];
  for (var L = 0; L < n; L++) {
    var h = u8[p++], bits = h >> 1; if (h & 1) return null;
    var idx = new Uint16Array(4096);
    if (bits) {
      var bpw = Math.floor(32 / bits), words = Math.ceil(4096 / bpw), mask = (1 << bits) - 1, i = 0;
      for (var w = 0; w < words; w++, p += 4) {
        var word = (u8[p] | u8[p + 1] << 8 | u8[p + 2] << 16 | u8[p + 3] << 24) >>> 0;
        for (var j = 0; j < bpw && i < 4096; j++, i++) idx[i] = (word >>> (j * bits)) & mask;
      }
    }
    var ps = 1;
    if (bits || wioI32(u8, p) === 1) { ps = wioI32(u8, p); p += 4; }
    var pal = [];
    for (var q = 0; q < ps; q++) { var e = nbtSkip(u8, p); pal.push(u8.slice(p, e)); p = e; }
    layers.push({ idx: idx, pal: pal });
  }
  return { v: v, layers: layers };
}
function subEncode(y, layers) {
  var parts = [new Uint8Array([9, layers.length, y & 255])];
  layers.forEach(function (L) {
    var used = new Uint32Array(L.pal.length), i;
    for (i = 0; i < 4096; i++) used[L.idx[i]]++;
    var remap = new Uint16Array(L.pal.length), pal = [];
    for (i = 0; i < L.pal.length; i++) if (used[i]) { remap[i] = pal.length; pal.push(L.pal[i]); }
    if (!pal.length) pal.push(L.pal[0]);
    var need = Math.max(1, Math.ceil(Math.log2(pal.length))), bits = [1, 2, 3, 4, 5, 6, 8, 16].filter(function (b) { return b >= need; })[0];
    var bpw = Math.floor(32 / bits), words = Math.ceil(4096 / bpw), wd = new Uint32Array(words);
    for (i = 0; i < 4096; i++) wd[Math.floor(i / bpw)] |= remap[L.idx[i]] << ((i % bpw) * bits);
    var hd = new Uint8Array(1 + words * 4 + 4), dv = new DataView(hd.buffer);
    hd[0] = bits << 1; for (i = 0; i < words; i++) dv.setUint32(1 + i * 4, wd[i], true); dv.setInt32(1 + words * 4, pal.length, true);
    parts.push(hd); pal.forEach(function (e) { parts.push(e); });
  });
  return wioCat(parts);
}
var WIO_AIR = null;
function wioAir() { return WIO_AIR || (WIO_AIR = nbtRootLE({ name: { t: 'string', v: 'minecraft:air' }, states: { t: 'compound', v: {} }, version: { t: 'int', v: WIO_BLOCK_VERSION } })); }

/* ---------- Blocos do mundo <-> células do editor ---------- */
/* Bloco que o editor não conhece: célula do bloco "Bloco do jogo" com o índice na lista guardada (wio.pres) */
function presName(v) { var e = wio && wio.pres[cellOri(v)]; return e ? e.name.replace(/^minecraft:/, '') : 'desconhecido'; }
function wioCellOf(raw) {
  var k = wioStr(raw), c = wio.cells.get(k);
  if (c !== undefined) return c;
  var o = {}; try { o = nbtRead(raw, true); } catch (e) {}
  var name = String(o.name || '').replace(/^minecraft:/, '');
  if (name === 'air' || !name) c = 0;
  else {
    c = cellFromBedrock(name, o.states || {});
    if (!c) {
      var i = wio.presMap.get(k);
      if (i === undefined) { i = wio.pres.length; wio.pres.push({ raw: raw, name: String(o.name) }); wio.presMap.set(k, i); wio.presDirty = true; }
      c = (PRES_BI + 1) + i * 4096;
      wio.unknown[name] = (wio.unknown[name] || 0) + 1;
    }
  }
  wio.cells.set(k, c);
  return c;
}
/* Célula que o editor mostra num ponto do sub-chunk: a camada principal; se ela estiver vazia, a segunda (água) */
function wioBase(dec, cells0, cells1, i, beds, wx, wy, wz) {
  var v = cells0[dec.layers[0].idx[i]];
  if (!v && cells1) v = cells1[dec.layers[1].idx[i]];
  if (v && beds && beds.size) {
    var col = beds.get(wx + ',' + wy + ',' + wz);
    if (col != null && /_bed$/.test(BLOCKS[cellBlock(v)].java)) { var cb = BY_JAVA[(BED_COLORS[col] || 'red') + '_bed']; if (cb != null) v = mkCell(cb, cellOri(v)); }
  }
  return v;
}
/* Entrada de paleta (NBT) para uma célula do editor, na posição dada (as formas dependem dos vizinhos) */
function wioEntry(v, x, y, z, C) {
  if (!v) return wioAir();
  C = C || wio;
  var bi = cellBlock(v), b = BLOCKS[bi];
  if (bi === PRES_BI) { var e = C.pres[cellOri(v)]; return e ? e.raw : wioAir(); }
  var r;
  if (b.shape) { var s = shapeExport(b, cellOri(v), x, y, z); r = { n: s.bn, s: s.bs, v: s.bv, ent: s.ent }; }
  else { var be = MCExport.bedrockEntry(b, b.ori ? cellOri(v) : null); r = { n: be.name, s: be.states, v: be.version }; }
  if (!r.ent && beKind(b.java) && inB(x, y, z)) r.ent = beBedrockEnt(idx(x, y, z), b.java); // itens e texto (src/blockent.js)
  var key = r.n + JSON.stringify(r.s) + r.v, raw = C.entries.get(key);
  if (!raw) {
    raw = nbtRootLE({ name: { t: 'string', v: 'minecraft:' + r.n }, states: { t: 'compound', v: r.s }, version: { t: 'int', v: r.v || WIO_BLOCK_VERSION } });
    C.entries.set(key, raw);
  }
  return r.ent ? { raw: raw, ent: r.ent } : raw;
}
async function wioGet(k) { return wio.patches.has(k) ? wio.patches.get(k) : ldbGet(wio.db, k); }
async function wioBeds(dim, cx, cz) {
  var m = new Map(), d = await wioGet(wioKey(cx, cz, dim, 0x31));
  if (d) try { m.list = nbtList(d); m.list.forEach(function (e) { if (e.o.id === 'Bed' && e.o.color != null) m.set(e.o.x + ',' + e.o.y + ',' + e.o.z, e.o.color); }); } catch (x) {}
  return m;
}

/* ---------- Abrir o mundo ---------- */
/* Acha o mundo dentro do .zip/.mcworld: a pasta com level.dat e db/CURRENT (pode estar dentro de uma pasta, ou o
   .zip pode trazer um .mcworld dentro) */
async function wioFind(file) {
  var zip = await openZip(file), paths = zip.paths;
  var lv = paths.filter(function (p) { return /(^|\/)level\.dat$/i.test(p); }).map(function (p) { return p.slice(0, p.length - 9); })
    .filter(function (pre) { return paths.indexOf(pre + 'db/CURRENT') >= 0; }).sort(function (a, b) { return a.length - b.length; });
  if (lv.length) return { zip: zip, blob: file, prefix: lv[0] };
  // mundo do Java: level.dat e a pasta region com arquivos r.X.Z.mca (src/javaworld.js)
  var jv = paths.filter(function (p) { return /(^|\/)level\.dat$/i.test(p); }).map(function (p) { return p.slice(0, p.length - 9); })
    .filter(function (pre) { return paths.some(function (q) { return q.indexOf(pre) === 0 && JW_REGION.test(q.slice(pre.length)); }); }).sort(function (a, b) { return a.length - b.length; });
  if (jv.length) return { zip: zip, blob: file, prefix: jv[0], java: true };
  var inner = paths.filter(function (p) { return /\.mcworld$/i.test(p); })[0];
  if (inner) { var b = new Blob([await zip.read(inner)]); return wioFind(b); }
  throw new Error('Não achei um mundo do Minecraft neste arquivo (Bedrock: level.dat e a pasta db; Java: level.dat e a pasta region).');
}
async function wioOpenFile(file, prog) {
  var f = await wioFind(file), zip = f.zip, pre = f.prefix;
  if (f.java) return jwOpen(f, prog);
  var dbNames = zip.paths.filter(function (p) { return p.indexOf(pre + 'db/') === 0 && p.indexOf('/', pre.length + 3) < 0; }).map(function (p) { return p.slice(pre.length + 3); });
  var db = await ldbOpen(dbNames, function (n) { return zip.read(pre + 'db/' + n); }, prog);
  var w = { file: f.blob, zip: zip, prefix: pre, db: db, name: 'Mundo', player: null, dims: [new Map(), new Map(), new Map()], maps: [],
    patches: new Map(), cells: new Map(), entries: new Map(), pres: [], presMap: new Map(), unknown: {}, area: null, edited: new Set(), bioEdited: new Set(), bmaps: [], legacy: 0 };
  try { var nm = new TextDecoder().decode(await zip.read(pre + 'levelname.txt')).trim(); if (nm) w.name = nm; } catch (e) {}
  try { var ld = await zip.read(pre + 'level.dat'), lo = nbtRead(ld.subarray(8), true); if (lo.LevelName) w.name = lo.LevelName; w.spawn = [lo.SpawnX | 0, lo.SpawnZ | 0]; } catch (e) {}
  // chunks de cada dimensão: os que existem (chave de versão) e os sub-chunks guardados
  db.idx.forEach(function (r, k) {
    if (r.t !== 1) return;
    var n = k.length, d, tg, y = null;
    if (n === 9 || n === 10) { d = 0; tg = k.charCodeAt(8); if (n === 10) y = k.charCodeAt(9); }
    else if (n === 13 || n === 14) { d = (k.charCodeAt(8) | k.charCodeAt(9) << 8 | k.charCodeAt(10) << 16 | k.charCodeAt(11) << 24); tg = k.charCodeAt(12); if (n === 14) y = k.charCodeAt(13); }
    else return;
    if (d !== 0 && d !== 1 && d !== 2) return;
    if ((y === null && tg !== 0x2c && tg !== 0x76 && tg !== 0x30) || (y !== null && tg !== 0x2f)) return; // 0x30: chunk no formato antigo (src/legacy.js)
    var u = wioBytes(k.slice(0, 8)), dv = new DataView(u.buffer), x = dv.getInt32(0, true), z = dv.getInt32(4, true), ck = x + ',' + z;
    if (Math.abs(x) > 1875000 || Math.abs(z) > 1875000) return; // fora da borda do mundo (30 milhões de blocos): chave estranha, não é chunk
    var c = w.dims[d].get(ck); if (!c) { c = { x: x, z: z, ok: false, subs: [] }; w.dims[d].set(ck, c); }
    if (y === null) { c.ok = true; if (tg === 0x30) { c.leg = true; w.leg = (w.leg || 0) + 1; } } else c.subs.push(y > 127 ? y - 256 : y);
  });
  try {
    var pl = await ldbGet(db, '~local_player');
    if (pl) { var po = nbtRead(pl, true); if (po.Pos) w.player = { dim: po.DimensionId | 0, x: Math.floor(po.Pos[0]), z: Math.floor(po.Pos[2]) }; }
  } catch (e) {}
  return w;
}

/* ---------- Mapa visto de cima ---------- */
function wioColor(v) {
  if (!v) return null;
  var bi = cellBlock(v), b = BLOCKS[bi];
  if (bi === PRES_BI) return [176, 84, 176];
  if (/^(water|bubble_column)$/.test(b.java)) return [52, 92, 200];
  if (b.java === 'lava') return [220, 100, 20];
  var c = b.top || [128, 128, 128], t = b.tint && b.tint[0];
  if (t) c = [c[0] * (t >> 16 & 255) / 255, c[1] * (t >> 8 & 255) / 255, c[2] * (t & 255) / 255];
  return c;
}
async function wioMap(dim, prog) {
  if (wio.java) return jwMap(dim, prog);
  if (wio.maps[dim]) return wio.maps[dim];
  var cols = Array.from(wio.dims[dim].values()).filter(function (c) { return c.ok; });
  if (!cols.length) return null;
  var x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9;
  cols.forEach(function (c) { x0 = Math.min(x0, c.x); z0 = Math.min(z0, c.z); x1 = Math.max(x1, c.x); z1 = Math.max(z1, c.z); });
  var bw = (x1 - x0 + 1) * 16, bh = (z1 - z0 + 1) * 16, sc = Math.max(1, Math.ceil(Math.max(bw, bh) / 4096));
  var W2 = Math.ceil(bw / sc), H2 = Math.ceil(bh / sc), img = new ImageData(W2, H2), hgt = new Int16Array(W2 * H2).fill(-32768);
  var bimg = new ImageData(W2, H2), bid = new Uint8Array(W2 * H2).fill(255), bcnt = {}; // mapa dos biomas (o bioma no topo de cada coluna)
  var D = wioDim(dim);
  var extra = new Map(); // sub-chunks criados pelas edições (ainda não estão no índice do mundo)
  wio.patches.forEach(function (v, k) { if (!v || k.length !== (dim ? 14 : 10) || k.charCodeAt(dim ? 12 : 8) !== 0x2f) return; var u = new DataView(wioBytes(k.slice(0, 8)).buffer), y = k.charCodeAt(k.length - 1), ck = u.getInt32(0, true) + ',' + u.getInt32(4, true); if (!extra.has(ck)) extra.set(ck, []); extra.get(ck).push(y > 127 ? y - 256 : y); });
  for (var ci = 0; ci < cols.length; ci++) {
    var c = cols[ci], subs = c.subs.concat(extra.get(c.x + ',' + c.z) || []).filter(function (y, i, a) { return a.indexOf(y) === i; }).sort(function (a, b) { return b - a; }), left = 256, top = new Int16Array(256).fill(-32768), col = new Array(256), seenAir = new Uint8Array(256);
    var lr = c.leg ? await wioGet(wioKey(c.x, c.z, dim, 0x30)) : null;
    if (lr) { var lt = legTops(lr); for (var lq = 0; lq < 256; lq++) if (lt.v[lq]) { var tq = ((lq & 15) << 4) | (lq >> 4); top[tq] = lt.h[lq]; col[tq] = wioColor(lt.v[lq]); } subs = []; } // formato antigo (src/legacy.js)
    for (var si = 0; si < subs.length && left; si++) {
      var sy = subs[si]; if (dim === 1 && sy > 7) continue;
      var dec = null; try { var raw = await wioGet(wioKey(c.x, c.z, dim, 0x2f, sy)); dec = raw && subDecode(raw); } catch (e) {}
      if (!dec) continue;
      var c0 = dec.layers[0].pal.map(wioCellOf), c1 = dec.layers[1] ? dec.layers[1].pal.map(wioCellOf) : null;
      for (var q = 0; q < 256; q++) {
        if (top[q] !== -32768) continue;
        var x = q >> 4, z = q & 15;
        for (var y = 15; y >= 0; y--) {
          var i = (x << 8) | (z << 4) | y, v = c0[dec.layers[0].idx[i]] || (c1 ? c1[dec.layers[1].idx[i]] : 0);
          var wy = sy * 16 + y;
          if (dim === 1) { if (wy > 118) continue; if (!v) { seenAir[q] = 1; continue; } if (!seenAir[q]) continue; } // Nether: abaixo do teto
          if (!v) continue;
          top[q] = wy; col[q] = wioColor(v); left--; break;
        }
      }
    }
    var b3 = null; try { var d3r = await wioGet(wioKey(c.x, c.z, dim, 0x2b)); if (d3r && d3r.length > 512) b3 = bioDecode3D(d3r); } catch (e) {}
    for (var q2 = 0; q2 < 256; q2++) {
      if (b3 && top[q2] !== -32768) { // q2 = x*16 + z aqui
        var ry = top[q2] - D.min, sb = b3.subs[ry >> 4] || b3.subs[b3.subs.length - 1], bv = sb ? sb[((q2 >> 4) << 8) | ((q2 & 15) << 4) | (ry & 15)] : 255;
        if (bv !== 255) { var bx = Math.floor(((c.x - x0) * 16 + (q2 >> 4)) / sc), bz = Math.floor(((c.z - z0) * 16 + (q2 & 15)) / sc), bo = bz * W2 + bx, bc2 = BIO_BY_ID[bv] ? BIO_BY_ID[bv].map : 0x888888;
          bid[bo] = bv; bcnt[bv] = (bcnt[bv] || 0) + 1; bimg.data[bo * 4] = bc2 >> 16 & 255; bimg.data[bo * 4 + 1] = bc2 >> 8 & 255; bimg.data[bo * 4 + 2] = bc2 & 255; bimg.data[bo * 4 + 3] = 255; }
      }
      if (!col[q2]) continue;
      var px = Math.floor(((c.x - x0) * 16 + (q2 >> 4)) / sc), pz = Math.floor(((c.z - z0) * 16 + (q2 & 15)) / sc), o = pz * W2 + px;
      hgt[o] = top[q2]; img.data[o * 4] = col[q2][0]; img.data[o * 4 + 1] = col[q2][1]; img.data[o * 4 + 2] = col[q2][2]; img.data[o * 4 + 3] = 255;
    }
    if (prog && ci % 64 === 0) { prog(ci, cols.length); await new Promise(function (r) { setTimeout(r, 0); }); }
  }
  // relevo: mais claro onde sobe em relação ao vizinho do norte, mais escuro onde desce
  for (var pz2 = H2 - 1; pz2 > 0; pz2--) for (var px2 = 0; px2 < W2; px2++) {
    var o2 = pz2 * W2 + px2, a = hgt[o2], b2 = hgt[o2 - W2]; if (a === -32768 || b2 === -32768) continue;
    var f = a > b2 ? 1.12 : a < b2 ? 0.86 : 1;
    for (var ch = 0; ch < 3; ch++) img.data[o2 * 4 + ch] = Math.min(255, img.data[o2 * 4 + ch] * f);
  }
  return (wio.maps[dim] = { img: img, bimg: bimg, bid: bid, bcnt: bcnt, x0: x0 * 16, z0: z0 * 16, sc: sc, w: W2, h: H2, min: D.min });
}

/* ---------- Carregar uma área no editor ---------- */
async function wioLoadArea(dim, x0, z0, w, d, prog) {
  if (wio.java) return jwLoadArea(dim, x0, z0, w, d, prog);
  var D = wioDim(dim);
  wioLoading = true; try { newWorld(w, D.h, d); } finally { wioLoading = false; }
  var cx0 = x0 >> 4, cz0 = z0 >> 4, ncx = w >> 4, ncz = d >> 4, ms = D.min >> 4, ns = D.h >> 4, tot = ncx * ncz, n = 0, miss = 0;
  wio.legacy = 0;
  for (var a = 0; a < ncx; a++) for (var b = 0; b < ncz; b++) {
    var cx = cx0 + a, cz = cz0 + b, col = wio.dims[dim].get(cx + ',' + cz);
    if (prog && ++n % 16 === 0) prog(n, tot);
    if (!col || !col.ok) { miss++; continue; }
    var beds = await wioBeds(dim, cx, cz);
    var legRaw = col.leg ? await wioGet(wioKey(cx, cz, dim, 0x30)) : null;
    if (legRaw) { // formato antigo: um registro com a coluna inteira (src/legacy.js); já convertido, segue o caminho de baixo
      legLoadColumn(legRaw, a, b, D.min);
      (beds.list || []).forEach(function (e) { legFixEntity(e.o); });
      bentLoadBedrock(beds.list, x0, D.min, z0);
      continue;
    }
    rsCmdLoadWorld(beds.list, x0, D.min, z0); // comandos dos blocos de comando da área (src/redstone4.js)
    try { var d3 = await wioGet(wioKey(cx, cz, dim, 0x2b)); if (d3 && d3.length > 512) bioFromWorld(d3, a, b); } catch (e) {} // bioma de cada coluna, para mostrar
    if (col.leg) { var d2 = await wioGet(wioKey(cx, cz, dim, 0x2d)); if (d2 && d2.length >= 768) bioOrig.set(bioKey(a, b), d2.slice(512, 768)); } // mundo antigo já convertido pelo site: biomas 2D
    for (var ey = 0; ey < ns; ey++) { // todas as alturas: um pedaço criado ao editar (antes só ar) também conta
      var sy = ey + ms, raw = await wioGet(wioKey(cx, cz, dim, 0x2f, sy)); if (!raw) continue;
      var dec = subDecode(raw); if (!dec) { wio.legacy++; continue; }
      var c0 = dec.layers[0].pal.map(wioCellOf), c1 = dec.layers[1] ? dec.layers[1].pal.map(wioCellOf) : null;
      var ch = newChunk(a, ey, b);
      for (var i = 0; i < 4096; i++) {
        var x = i >> 8, z = (i >> 4) & 15, y = i & 15;
        var v = wioBase(dec, c0, c1, i, beds, cx * 16 + x, sy * 16 + y, cz * 16 + z); if (!v) continue;
        var pi = ch.map.get(v);
        if (pi === undefined) { pi = ch.pal.length; if (pi === 256) ch.d = Uint16Array.from(ch.d); ch.pal.push(v); ch.map.set(v, pi); }
        ch.d[(y << 8) | (z << 4) | x] = pi; ch.n++;
      }
      if (ch.n) { W.set(ckey(a, ey, b), ch); blockCount += ch.n; }
    }
    bentLoadBedrock(beds.list, x0, D.min, z0); // itens dos contêineres e texto das placas (src/blockent.js)
  }
  bentDirty.clear(); bentSave = true;
  wio.area = { dim: dim, x0: x0, z0: z0, w: w, d: d, miss: miss };
  wio.edited = new Set();
  lightFull = true; verCounter++; dirtyAll();
  return { miss: miss, tot: tot };
}
/* Coordenada do mundo de uma célula do editor */
function wioWorldPos(c) { var A = wio.area; return [c[0] + A.x0, c[1] + wioDim(A.dim).min, c[2] + A.z0]; }

/* ---------- Gravar as mudanças da área (só o que mudou) ---------- */
async function wioCommit(prog) {
  if (wio && wio.java) return jwCommit(prog);
  var res = { blocks: 0, lost: 0, legacy: 0 };
  if (!wio || !wio.area || !wio.edited.size) return res;
  var A = wio.area, D = wioDim(A.dim), ms = D.min >> 4, dim = A.dim, cols = new Map();
  wio.edited.forEach(function (s) { var p = s.split(','), k = p[0] + ',' + p[2]; if (!cols.has(k)) cols.set(k, []); cols.get(k).push(+p[1]); });
  var air = wioAir(), n = 0;
  if (wio.leg && wio.legKeep) await legCommitKeep(cols, A, dim, res); // mundo antigo mantido antigo: as colunas antigas saem no formato antigo (src/legacy.js)
  for (var entry of cols) {
    var p = entry[0].split(','), ecx = +p[0], ecz = +p[1], cx = (A.x0 >> 4) + ecx, cz = (A.z0 >> 4) + ecz, ys = entry[1];
    if (prog) prog(++n, cols.size);
    var col = wio.dims[dim].get(cx + ',' + cz);
    if (!col || !col.ok) { // chunk que o jogo ainda não gerou: o jogo apagaria o que fosse gravado ali
      ys.forEach(function (ecy) { var ch = W.get(ckey(ecx, ecy, ecz)); if (ch) res.lost += ch.n; });
      continue;
    }
    var legConv = col.leg && !wio.legKeep && !!(await wioGet(wioKey(cx, cz, dim, 0x30))); if (legConv) ys = legAllYs(ecx, ecz, ys); // convertendo: a coluna inteira sai no formato novo
    var beKey = wioKey(cx, cz, dim, 0x31), beRaw = await wioGet(beKey), beList = [];
    if (beRaw) try { beList = nbtList(beRaw); } catch (e) { beList = null; }
    var beds = new Map(); (beList || []).forEach(function (e) { if (e.o.id === 'Bed' && e.o.color != null) beds.set(e.o.x + ',' + e.o.y + ',' + e.o.z, e.o.color); });
    var removed = new Set(), added = [], hcols = new Set();
    for (var yi = 0; yi < ys.length; yi++) {
      var ecy = ys[yi], sy = ecy + ms, sk = wioKey(cx, cz, dim, 0x2f, sy), raw = await wioGet(sk), dec;
      if (raw) { dec = subDecode(raw); if (!dec) { res.legacy++; continue; } }
      else dec = { v: 9, layers: [{ idx: new Uint16Array(4096), pal: [air] }] };
      var L0 = dec.layers[0], L1 = dec.layers[1], c0 = L0.pal.map(wioCellOf), c1 = L1 ? L1.pal.map(wioCellOf) : null, ch = false;
      var pidx0 = new Map(L0.pal.map(function (e, i) { return [wioStr(e), i]; })), air1 = -1;
      for (var i = 0; i < 4096; i++) {
        var x = i >> 8, z = (i >> 4) & 15, y = i & 15, ex = (ecx << 4) + x, ey = (ecy << 4) + y, ez = (ecz << 4) + z;
        var wx = cx * 16 + x, wy = sy * 16 + y, wz = cz * 16 + z;
        var cur = gget(ex, ey, ez), base = wioBase(dec, c0, c1, i, beds, wx, wy, wz);
        if (cur === base && !(rs.cmds.size && rsCmdDirtyAt(ex, ey, ez)) && !(bentDirty.size && bentDirty.has(idx(ex, ey, ez)))) continue; // o comando mudou: grava o bloco de entidade de novo
        var e = wioEntry(cur, ex, ey, ez), er = e.raw || e, es = wioStr(er), pi = pidx0.get(es);
        if (pi === undefined) { pi = L0.pal.length; L0.pal.push(er); pidx0.set(es, pi); }
        L0.idx[i] = pi;
        if (L1) { if (air1 < 0) { air1 = L1.pal.findIndex(function (q) { return wioCellOf(q) === 0; }); if (air1 < 0) { air1 = L1.pal.length; L1.pal.push(air); } } L1.idx[i] = air1; }
        removed.add(wx + ',' + wy + ',' + wz); hcols.add(x + ',' + z);
        if (e.ent) added.push(nbtRootLE(wioEntTags(e.ent, wx, wy, wz)));
        ch = true; res.blocks++;
      }
      if (ch) wio.patches.set(sk, subEncode(sy, dec.layers));
    }
    if (beList && (removed.size || added.length)) {
      var keep = beList.filter(function (e) { return !removed.has(e.o.x + ',' + e.o.y + ',' + e.o.z); }).map(function (e) { return e.raw; }).concat(added);
      if (keep.length !== beList.length || added.length) wio.patches.set(beKey, keep.length ? wioCat(keep) : null);
    }
    if (hcols.size) {
      var hk = wioKey(cx, cz, dim, 0x2b), d3 = await wioGet(hk);
      if (d3 && d3.length >= 512) {
        d3 = d3.slice();
        hcols.forEach(function (s) {
          var q = s.split(','), x = +q[0], z = +q[1], ex = (ecx << 4) + x, ez = (ecz << 4) + z, top = -1;
          for (var y = SY - 1; y >= 0; y--) if (gget(ex, y, ez)) { top = y; break; }
          var h = top + 1, o = (z * 16 + x) * 2; d3[o] = h & 255; d3[o + 1] = (h >> 8) & 255;
        });
        wio.patches.set(hk, d3);
      }
      // mundos antigos guardam somas de verificação dos sub-chunks: sem a chave, o jogo não confere
      var ck = wioKey(cx, cz, dim, 0x3b); if (wio.db.idx.has(ck)) wio.patches.set(ck, null);
    }
    if (legConv) await legFinishConvert(cx, cz, dim, ecx, ecz, D);
  }
  wio.edited.clear(); bentDirty.clear();
  wio.maps[dim] = null;
  return res;
}

/* ---------- Exportar o .mcworld ---------- */
async function wioBuild(prog) {
  if (wio.java) return jwBuild(prog);
  var ents = []; wio.patches.forEach(function (v, k) { ents.push([k, v]); });
  ents.sort(function (a, b) { return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0; });
  var files = [], pre = wio.prefix, zip = wio.zip;
  zip.paths.forEach(function (p) { if (p.indexOf(pre) !== 0 || /(^|\/)LOCK$/.test(p)) return; var nm = p.slice(pre.length); files.push(wio.files && wio.files.has(nm) ? { name: nm, data: wio.files.get(nm) } : { name: nm, src: p }); }); // wio.files: o que o Editor NBT trocou (src/nbtedit.js)
  if (wio.files) wio.files.forEach(function (d, nm) { if (!files.some(function (f) { return f.name === nm; })) files.push({ name: nm, data: d }); });
  if (ents.length) {
    var num = wio.db.maxFile + 1, nm = String(num); while (nm.length < 6) nm = '0' + nm;
    files.push({ name: 'db/' + nm + '.log', data: ldbLogWrite(ents, wio.db.maxSeq + 1) });
  }
  return { blob: await wioZipOut(files, prog), keys: ents.length };
}
/* .zip de saída: entradas novas (data) gravadas sem compressão; as do arquivo original (src) copiadas sem descomprimir */
async function wioZipOut(files, prog) {
  var zip = wio.zip;
  var enc = new TextEncoder(), parts = [], central = [], off = 0;
  for (var i = 0; i < files.length; i++) {
    var f = files[i], name = enc.encode(f.name), info, body;
    if (f.data) { info = { m: 0, crc: MCExport.crc32(f.data), c: f.data.length, u: f.data.length, tm: 0, dt: 0x21 }; body = f.data; }
    else { info = zip.info(f.src); body = await zip.rawSlice(f.src); }
    if (off + 30 + name.length + info.c > 0xFFFFFFF0) throw new Error('O mundo passa de 4 GB: grande demais para gerar aqui.');
    var lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, info.m, true);
    lh.setUint16(10, info.tm, true); lh.setUint16(12, info.dt, true); lh.setUint32(14, info.crc, true); lh.setUint32(18, info.c, true);
    lh.setUint32(22, info.u, true); lh.setUint16(26, name.length, true);
    parts.push(new Uint8Array(lh.buffer), name, body);
    var ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, info.m, true);
    ch.setUint16(12, info.tm, true); ch.setUint16(14, info.dt, true); ch.setUint32(16, info.crc, true); ch.setUint32(20, info.c, true);
    ch.setUint32(24, info.u, true); ch.setUint16(28, name.length, true); ch.setUint32(42, off, true);
    central.push(new Uint8Array(ch.buffer), name);
    off += 30 + name.length + info.c;
    if (prog) prog(i + 1, files.length);
  }
  var cs = 0; central.forEach(function (c) { cs += c.length; });
  var end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, cs, true); end.setUint32(16, off, true);
  return new Blob(parts.concat(central, [new Uint8Array(end.buffer)]), { type: 'application/octet-stream' });
}

/* ---------- Sessão guardada no navegador (o arquivo do mundo, as mudanças gravadas e a área aberta) ---------- */
function wioMeta() {
  var fl = {}; if (wio.files) wio.files.forEach(function (d, nm) { fl[nm] = b64(d); });
  return { name: wio.name, area: wio.area, pres: wio.pres.map(function (e) { return b64(e.raw); }), files: fl, legKeep: wio.legKeep, presLeg: wio.pres.map(function (e) { return e.leg == null ? null : e.leg; }) };
}
function wioSaveSession(withFile) {
  if (!wio) return Promise.resolve();
  var pat = {}; wio.patches.forEach(function (v, k) { pat[wioHex(k)] = v; });
  var meta = wioMeta();
  return idbDo('readwrite', function (st) {
    if (withFile) st.put(wio.file, 'wio:file');
    st.put(pat, 'wio:patches'); st.put(meta, 'wio:meta');
  }).catch(function () { if (!wioSaveSession.warned) { wioSaveSession.warned = true; toast('O navegador não guardou o mundo: se a página recarregar, abra o arquivo de novo.', 8000); } });
}
function wioForget() { return idbDo('readwrite', function (st) { st.delete('wio:file'); st.delete('wio:patches'); st.delete('wio:meta'); }).catch(function () {}); }
/* Ao abrir a página: se havia um mundo aberto, abre de novo o arquivo guardado e a mesma área, e põe por cima os
   pedaços editados que o salvamento automático guardou */
async function wioRestore() {
  var meta = await idbDo('readonly', function (st) { return st.get('wio:meta'); }).catch(function () { return null; });
  if (!meta || !meta.area) return false;
  var file = await idbDo('readonly', function (st) { return st.get('wio:file'); }).catch(function () { return null; });
  var pat = await idbDo('readonly', function (st) { return st.get('wio:patches'); }).catch(function () { return null; });
  if (!file) { wioForget(); return false; }
  var kept = typeof tabWioTake === 'function' ? tabWioTake() : null; // o mundo já lido por esta aba (src/tabs.js)
  try {
    busy('Abrindo de novo o mundo ' + (meta.name || '') + '…', null);
    if (kept) wio = kept;
    else wio = await wioOpenFile(file, function (i, n) { busy('Lendo o mundo: ' + Math.round(i) + ' de ' + n + ' arquivos', i / n); });
    if (!kept) (meta.pres || []).forEach(function (s) {
      var raw = unb64(s);
      if (wio.java) { var key = new TextDecoder().decode(raw); wio.presMap.set(key, wio.pres.length); wio.pres.push({ raw: raw, name: key.replace(/\[.*$/, ''), key: key }); }
      else { wio.presMap.set(wioStr(raw), wio.pres.length); wio.pres.push({ raw: raw, name: String(nbtRead(raw, true).name) }); }
    });
    if (pat && !kept) Object.keys(pat).forEach(function (h) { wio.patches.set(wioUnhex(h), pat[h]); });
    if (!kept && wio.leg) { wio.legKeep = meta.legKeep !== false; (meta.presLeg || []).forEach(function (c, i) { if (c != null && wio.pres[i]) { wio.pres[i].leg = c; wio.presMap.set('leg:' + c, i); } }); }
    if (meta.files && !kept) { wio.files = new Map(); Object.keys(meta.files).forEach(function (nm) { wio.files.set(nm, unb64(meta.files[nm])); }); if (meta.name) wio.name = meta.name; }
    var A = meta.area;
    await wioLoadArea(A.dim, A.x0, A.z0, A.w, A.d, function (i, n) { busy('Carregando a área: ' + i + ' de ' + n + ' chunks', i / n); });
    var recs = await idbDo('readonly', function (st) { return st.getAll(IDBKeyRange.bound('w:c:', 'w:c:\uffff')); }).catch(function () { return []; });
    var wm = await idbDo('readonly', function (st) { return st.get('w:meta'); }).catch(function () { return null; });
    (recs || []).forEach(function (r) {
      var c = r.c; wio.edited.add(c.join(','));
      var x0 = c[0] << 4, y0 = c[1] << 4, z0 = c[2] << 4;
      for (var o = 0; o < 4096; o++) { var x = x0 + (o & 15), y = y0 + (o >> 8), z = z0 + ((o >> 4) & 15); if (inB(x, y, z) && gget(x, y, z)) { gset(x, y, z, 0); blockCount--; } }
      if (!r.empty) chunkFromRecord(r);
    });
    var wb = await idbDo('readonly', function (st) { return st.get('w:bio'); }).catch(function () { return null; });
    if (wb) { bioFromRecord(wb); bioPaint.forEach(function (a, k) { wio.bioEdited.add(k); }); bioSaveFlag = false; } // biomas pintados ainda não gravados no mundo
    var fl = await idbDo('readonly', function (st) { return st.get('w:fill'); }).catch(function () { return null; });
    if (fl) rsFillFrom(fl);
    var cm = await idbDo('readonly', function (st) { return st.get('w:cmd'); }).catch(function () { return null; });
    if (cm) rsCmdFrom(cm);
    var ap = await idbDo('readonly', function (st) { return st.get('w:apoio'); }).catch(function () { return null; });
    if (ap) { apoio = new Set(ap); apoioSave = false; }
    var bq = await idbDo('readonly', function (st) { return st.get('w:bent'); }).catch(function () { return null; });
    if (bq) { bentFrom(bq); bentDirty.forEach(function (i) { var p = unidx(i); wio.edited.add((p[0] >> 4) + ',' + (p[1] >> 4) + ',' + (p[2] >> 4)); }); }
    if (wm && wm.hotbar) { hotbar = wm.hotbar.map(function (j, i) { return j in BY_JAVA ? BY_JAVA[j] : hotbar[i] || 0; }); slot = wm.slot | 0; }
    worldDirty.clear(); worldClear = false; W.forEach(function (ch) { ch.sv = false; });
    verCounter++; dirtyAll(); renderHotbar(); renderList(); wioChip();
    return true;
  } catch (e) {
    wio = null; wioForget(); toast('Não foi possível abrir de novo o mundo guardado: ' + (e.message || e), 9000);
    return false;
  } finally { busyEnd(); }
}
/* Fecha o mundo (Novo, abrir outro projeto): as mudanças não exportadas se perdem */
function wioEnd(msg) {
  if (!wio) return;
  var nm = wio.name; wio = null; wioForget(); wioChip();
  if (msg) setTimeout(function () { toast('O mundo ' + nm + ' foi fechado. ' + msg, 7000); }, 50);
}

/* ---------- Interface ---------- */
function wioChip() {
  var c = $('worldChip'); if (!c) return;
  c.hidden = !(wio && wio.area);
  document.body.classList.toggle('wio-on', !!(wio && wio.area));
  if (typeof tabAutoName === 'function' && !(typeof tabs !== 'undefined' && tabs.busy && !wio)) tabAutoName(wio && wio.area ? wio.name : null, !!(wio && wio.area)); // o nome da aba
  if (c.hidden) return;
  var A = wio.area, D = wioDim(A.dim);
  $('worldTxt').innerHTML = '<b>' + esc(wio.name) + '</b> · ' + D.name + ' · X ' + A.x0 + ' a ' + (A.x0 + A.w - 1) + ', Z ' + A.z0 + ' a ' + (A.z0 + A.d - 1);
}
async function wioOpen(file) {
  try {
    busy('Abrindo ' + file.name + '…', null);
    var w = await wioOpenFile(file, function (i, n) { busy('Lendo o mundo: ' + Math.round(i) + ' de ' + n + ' arquivos', i / n); });
    if (!w.dims.some(function (m) { return m.size; })) throw new Error(w.java ? 'Este mundo do Java não tem chunks (pasta region vazia).' : 'Este mundo não tem chunks no formato atual do Bedrock.');
    // outro mundo que estava aberto é trocado por este (o que não foi exportado dele se perde)
    if (wio && (wio.patches.size || wio.edited.size)) setTimeout(function () { toast('O mundo anterior foi fechado sem exportar.', 6000); }, 4000);
    if (w.leg) { busyEnd(); w.legKeep = await legChooseMode(); } // mundo no formato antigo: manter ou converter (src/legacy.js)
    wio = w;
    await wioSaveSession(true);
    busyEnd();
    wioArea();
  } catch (e) { busyEnd(); toast(e.message || 'Não foi possível abrir o mundo.', 9000); }
}
async function wioCommitAll() {
  if (!wio || !wio.area || (!wio.edited.size && !wio.bioEdited.size)) return null;
  busy('Guardando as mudanças da área…', null);
  if (wio.leg && !wio.legKeep) legBioToEdited(); // convertendo: um chunk antigo só com o bioma pintado também sai no formato novo
  try { var r = await wioCommit(function (i, n) { busy('Guardando as mudanças: ' + i + ' de ' + n + ' chunks', i / n); }); r.biomes = await bioCommit(); await wioSaveSession(false); return r; }
  finally { busyEnd(); }
}
/* Chunks não gerados no mapa da área: no Fim (e em ilhas soltas) o vazio gerado e o nunca gerado ficavam iguais.
   Com o aviso ligado, o que o jogo nunca gerou fica num vermelho translúcido e o gerado (mesmo só ar) num cinza azulado. */
var WIO_UNGEN_RGBA = [214, 58, 48, 107], WIO_GEN_RGBA = [96, 106, 128, 150], WIO_UNGEN = 'rgba(214,58,48,.42)';
function wioShowUngen() { try { return localStorage.getItem('bloco-a-bloco-ungen') !== '0'; } catch (e) { return true; } }
/* Uma imagem com 1 pixel por chunk do retângulo do mapa: vermelho onde não há chunk gerado */
function wioUngenMask(dim, mp) {
  var cx0 = Math.floor(mp.x0 / 16), cz0 = Math.floor(mp.z0 / 16), w = Math.ceil(mp.w * mp.sc / 16), h = Math.ceil(mp.h * mp.sc / 16);
  var c = document.createElement('canvas'); c.width = w; c.height = h;
  var g = c.getContext('2d'), img = g.createImageData(w, h), M = wio.dims[dim];
  for (var z = 0; z < h; z++) for (var x = 0; x < w; x++) {
    var q = M.get((cx0 + x) + ',' + (cz0 + z)), o = (z * w + x) * 4, col = q && q.ok ? WIO_GEN_RGBA : WIO_UNGEN_RGBA;
    img.data[o] = col[0]; img.data[o + 1] = col[1]; img.data[o + 2] = col[2]; img.data[o + 3] = col[3];
  }
  g.putImageData(img, 0, 0);
  return c;
}
/* Diálogo: mapa, dimensão, coordenadas e tamanho da área */
function wioArea() {
  if (!wio) return;
  var A = wio.area, mob = matchMedia('(pointer: coarse)').matches;
  var st = { dim: A ? A.dim : (wio.player ? wio.player.dim : 0), size: A ? Math.max(A.w, A.d) : mob ? 256 : WIO_MAX, cx: 0, cz: 0, view: null };
  var at = wioArea.at; wioArea.at = null; if (at) st.dim = at.dim; // Carregar área aqui (mapa do mundo, src/worldmap.js)
  if (!wio.dims[st.dim].size) st.dim = wio.dims.findIndex(function (m) { return m.size; });
  function home(d) {
    if (A && A.dim === d) return [A.x0 + A.w / 2, A.z0 + A.d / 2];
    if (wio.player && wio.player.dim === d) return [wio.player.x, wio.player.z];
    if (d === 0 && wio.spawn) return wio.spawn;
    var c = Array.from(wio.dims[d].values()).filter(function (q) { return q.ok; })[0]; return c ? [c.x * 16 + 8, c.z * 16 + 8] : [0, 0];
  }
  var h0 = at ? [at.x, at.z] : home(st.dim); st.cx = h0[0]; st.cz = h0[1];
  var tabs = WIO_DIMS.map(function (D) { return '<button data-wd="' + D.id + '"' + (wio.dims[D.id].size ? '' : ' disabled') + '>' + D.name + '</button>'; }).join('');
  var sizes = [64, 128, 192, 256, 320, 384, 448, 512].map(function (s) { return '<option value="' + s + '">' + s + ' × ' + s + '</option>'; }).join('') + '<option value="free">Área livre (arrastar no mapa)</option>';
  // área livre: um retângulo qualquer, desenhado no mapa ou digitado (fica para a próxima vez)
  st.free = wioArea.free && wioArea.free.dim === st.dim && !at ? wioArea.free : null;
  openDialog('<h3>' + esc(wio.name) + '</h3>' +
    '<div class="wtabs mbtns">' + tabs + '</div>' +
    '<div class="wmap"><canvas id="wmCv"></canvas><div class="wzoom"><button id="wmIn" title="Aproximar">+</button><button id="wmOut" title="Afastar">−</button></div></div>' +
    '<div class="row wmleg"><span class="mbtns seg2"><button id="wmModeT" aria-pressed="true">Terreno</button><button id="wmModeB" aria-pressed="false">Biomas</button></span><label class="check"><input type="checkbox" id="wmUn"' + (wioShowUngen() ? ' checked' : '') + '> Destacar chunks não gerados</label><span class="wsw un"></span><span>nunca gerados pelo jogo (vazios no editor)</span><span class="wsw gen"></span><span>gerados (mesmo vazios, como o vazio do Fim)</span><span id="wmHov" class="pen"></span></div>' +
    '<div class="wmbio" id="wmBio" hidden></div>' +
    '<p class="wmhelp">Clique no mapa para escolher o centro da área. Arraste para mover; roda do mouse aproxima.' +
    (!A && blockCount ? ' A construção que está no editor agora será substituída pela área: salve antes em Projeto → Salvar projeto se quiser guardá-la.' : '') + '</p>' +
    '<div class="row"><label>Centro X<input type="number" id="wmX"></label><label>Centro Z<input type="number" id="wmZ"></label><label>Tamanho<select id="wmS">' + sizes + '</select></label><button class="btn" id="wmMe">Onde estou</button><button class="btn" id="wmBig" title="O mundo inteiro em tela cheia, com zoom de verdade, biomas, grade dos chunks e as coordenadas do Nether">Mapa em tela cheia</button></div>' +
    '<div class="row" id="wmFreeRow" hidden><label>De X<input type="number" id="wmFx0"></label><label>Z<input type="number" id="wmFz0"></label><label>Até X<input type="number" id="wmFx1"></label><label>Z<input type="number" id="wmFz1"></label>' +
    '<span class="pen">Arraste no mapa para desenhar a área (o botão direito move o mapa; um clique leva a área até ali). Ela se ajusta aos chunks; até ' + WIO_MAX + ' blocos de cada lado.</span></div>' +
    '<div class="info" id="wmInfo"></div>' +
    '<div class="row"><button class="btn primary" id="wmGo">Carregar área</button><button class="btn" id="wmNo">' + (A ? 'Fechar' : 'Cancelar') + '</button></div>',
    function () {
      overlayRoot.querySelector('.dialog').classList.add('wide');
      var cv = $('wmCv'), g = cv.getContext('2d'), mp = null, bmp = null, bbmp = null, mask = null, bmode = wioArea.bmode || false;
      var setMode = function (b) {
        bmode = wioArea.bmode = b; $('wmModeT').setAttribute('aria-pressed', String(!b)); $('wmModeB').setAttribute('aria-pressed', String(b));
        var L = $('wmBio'); L.hidden = !b || !mp;
        if (b && mp) { // legenda: os biomas desta dimensão, do que mais aparece ao que menos aparece
          var ids = Object.keys(mp.bcnt).map(Number).sort(function (x, y) { return mp.bcnt[y] - mp.bcnt[x]; });
          L.innerHTML = ids.length ? ids.map(function (id) { var bb = BIO_BY_ID[id]; return '<span class="wbl">' + (bb ? bioSw(bb) + esc(bb.pt) : '#' + id) + '</span>'; }).join('') : 'Sem informação de bioma neste mundo.';
        }
        draw();
      };
      $('wmModeT').onclick = function () { setMode(false); }; $('wmModeB').onclick = function () { setMode(true); };
      $('wmUn').onchange = function (e) { try { localStorage.setItem('bloco-a-bloco-ungen', e.target.checked ? '1' : '0'); } catch (x) {} draw(); };
      $('wmS').value = st.free ? 'free' : String(st.size); $('wmFreeRow').hidden = !st.free;
      $('wmNo').onclick = closeDialog;
      $('wmBig').onclick = function () { closeDialog(); openWorldMap(); };
      function area() {
        if (st.free) { // os cantos do retângulo, ajustados aos chunks (cada lado entre 16 e WIO_MAX)
          var F = st.free, ax = Math.floor(Math.min(F.x0, F.x1) / 16) * 16, az = Math.floor(Math.min(F.z0, F.z1) / 16) * 16;
          var w = Math.max(16, Math.min(WIO_MAX, Math.ceil((Math.max(F.x0, F.x1) + 1) / 16) * 16 - ax)), d = Math.max(16, Math.min(WIO_MAX, Math.ceil((Math.max(F.z0, F.z1) + 1) / 16) * 16 - az));
          return [ax, az, w, d];
        }
        var s = st.size, x0 = Math.round((st.cx - s / 2) / 16) * 16, z0 = Math.round((st.cz - s / 2) / 16) * 16;
        return [x0, z0, s, s];
      }
      function freeTo() { // leva a área livre (mesmo tamanho) para o centro st.cx, st.cz
        if (!st.free) return;
        var fa = area(), nx = Math.round((st.cx - fa[2] / 2) / 16) * 16, nz = Math.round((st.cz - fa[3] / 2) / 16) * 16; st.free = { dim: st.dim, x0: nx, z0: nz, x1: nx + fa[2] - 1, z1: nz + fa[3] - 1 };
      }
      function freeSync() { // campos dos cantos e o centro a partir do retângulo
        var a = area(); wioArea.free = st.free; st.cx = a[0] + a[2] / 2; st.cz = a[1] + a[3] / 2;
        [['wmFx0', a[0]], ['wmFz0', a[1]], ['wmFx1', a[0] + a[2] - 1], ['wmFz1', a[1] + a[3] - 1]].forEach(function (q) { if (document.activeElement !== $(q[0])) $(q[0]).value = q[1]; });
      }
      function info() {
        var a = area(), D = wioDim(st.dim), cols = 0, ok = 0;
        for (var x = a[0] >> 4; x < (a[0] + a[2]) >> 4; x++) for (var z = a[1] >> 4; z < (a[1] + a[3]) >> 4; z++) { cols++; var c = wio.dims[st.dim].get(x + ',' + z); if (c && c.ok) ok++; }
        if (st.free) freeSync();
        $('wmInfo').innerHTML = D.name + ': X ' + a[0] + ' a ' + (a[0] + a[2] - 1) + ', Z ' + a[1] + ' a ' + (a[1] + a[3] - 1) + ', altura ' + D.min + ' a ' + (D.min + D.h - 1) + (st.free ? ' (' + a[2] + ' × ' + a[3] + ')' : '') +
          '<br>' + ok + ' de ' + cols + ' chunks já gerados pelo jogo' + (ok < cols ? ' (os outros ficam vazios e o que for construído neles não vai para o mundo)' : '') + '.';
        $('wmGo').disabled = !ok;
        if (document.activeElement !== $('wmX')) $('wmX').value = Math.round(st.cx);
        if (document.activeElement !== $('wmZ')) $('wmZ').value = Math.round(st.cz);
      }
      function fit() {
        var r = cv.parentNode.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
        cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr); cv.style.width = r.width + 'px'; cv.style.height = r.height + 'px';
        if (!st.view && mp) { var z = Math.min(cv.width / (mp.w * mp.sc), cv.height / (mp.h * mp.sc)) * 0.95; st.view = { s: Math.max(z, cv.width / 1400), cx: st.cx, cz: st.cz }; }
      }
      function draw() {
        g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = getComputedStyle(document.body).getPropertyValue('--panel-2') || '#ddd'; g.fillRect(0, 0, cv.width, cv.height);
        if (!mp || !st.view) return;
        var V = st.view, toPx = function (x, z) { return [cv.width / 2 + (x - V.cx) * V.s, cv.height / 2 + (z - V.cz) * V.s]; };
        var p0 = toPx(mp.x0, mp.z0), un = $('wmUn').checked, cw = 16 * V.s;
        // chunks não gerados: fora do retângulo do mapa é tudo não gerado; dentro, a máscara por chunk diz (por baixo do
        // relevo, que só existe nos gerados)
        if (un) {
          if (!mask) mask = wioUngenMask(st.dim, mp);
          g.fillStyle = WIO_UNGEN; g.fillRect(0, 0, cv.width, cv.height);
          g.fillStyle = getComputedStyle(document.body).getPropertyValue('--panel-2') || '#ddd'; g.fillRect(p0[0], p0[1], mask.width * cw, mask.height * cw);
          g.imageSmoothingEnabled = false; g.drawImage(mask, p0[0], p0[1], mask.width * cw, mask.height * cw);
        }
        g.imageSmoothingEnabled = V.s * mp.sc < 2;
        g.drawImage(bmode && bbmp ? bbmp : bmp, p0[0], p0[1], mp.w * mp.sc * V.s, mp.h * mp.sc * V.s);
        if (un) {
          if (cw >= 10) { // perto: as divisas dos chunks
            g.strokeStyle = 'rgba(128,128,128,.35)'; g.lineWidth = 1; g.beginPath();
            var gx0 = Math.floor((V.cx - cv.width / 2 / V.s) / 16), gx1 = Math.ceil((V.cx + cv.width / 2 / V.s) / 16), gz0 = Math.floor((V.cz - cv.height / 2 / V.s) / 16), gz1 = Math.ceil((V.cz + cv.height / 2 / V.s) / 16);
            for (var gx = gx0; gx <= gx1; gx++) { var lx = Math.round(toPx(gx * 16, 0)[0]) + 0.5; g.moveTo(lx, 0); g.lineTo(lx, cv.height); }
            for (var gz = gz0; gz <= gz1; gz++) { var lz = Math.round(toPx(0, gz * 16)[1]) + 0.5; g.moveTo(0, lz); g.lineTo(cv.width, lz); }
            g.stroke();
          }
        }
        var a = area(), q = toPx(a[0], a[1]);
        g.lineWidth = 2 * Math.min(2, devicePixelRatio || 1); g.strokeStyle = '#fff'; g.fillStyle = 'rgba(255,255,255,.12)';
        g.fillRect(q[0], q[1], a[2] * V.s, a[3] * V.s); g.strokeRect(q[0], q[1], a[2] * V.s, a[3] * V.s);
        g.strokeStyle = 'rgba(0,0,0,.6)'; g.strokeRect(q[0] - g.lineWidth, q[1] - g.lineWidth, a[2] * V.s + 2 * g.lineWidth, a[3] * V.s + 2 * g.lineWidth);
        if (A && A.dim === st.dim) { var qa = toPx(A.x0, A.z0); g.setLineDash([6, 4]); g.strokeStyle = cssColor('--accent') || '#c55a11'; g.strokeRect(qa[0], qa[1], A.w * V.s, A.d * V.s); g.setLineDash([]); }
        if (wio.player && wio.player.dim === st.dim) {
          var pp = toPx(wio.player.x, wio.player.z); g.beginPath(); g.arc(pp[0], pp[1], 6 * Math.min(2, devicePixelRatio || 1), 0, 7);
          g.fillStyle = cssColor('--accent') || '#c55a11'; g.fill(); g.strokeStyle = '#fff'; g.stroke();
        }
      }
      async function loadDim() {
        overlayRoot.querySelectorAll('[data-wd]').forEach(function (b) { b.setAttribute('aria-pressed', String(+b.getAttribute('data-wd') === st.dim)); });
        mp = null; mask = null; bbmp = null; st.view = null; draw();
        $('wmInfo').textContent = 'Desenhando o mapa…';
        var m = await wioMap(st.dim, function (i, n) { if ($('wmInfo')) $('wmInfo').textContent = 'Desenhando o mapa: ' + i + ' de ' + n + ' chunks'; });
        if (!overlayRoot.contains(cv)) return;
        mp = m; if (!mp) { info(); return; }
        bmp = await createImageBitmap(mp.img); bbmp = await createImageBitmap(mp.bimg); fit(); setMode(bmode); info();
      }
      overlayRoot.querySelectorAll('[data-wd]').forEach(function (b) {
        b.onclick = function () { var d = +b.getAttribute('data-wd'); if (d === st.dim) return; st.dim = d; var h = home(d); st.cx = h[0]; st.cz = h[1]; freeTo(); loadDim(); };
      });
      var drag = null;
      var worldAt = function (e) { var r = cv.getBoundingClientRect(), dpr = cv.width / r.width; return [st.view.cx + ((e.clientX - r.left) * dpr - cv.width / 2) / st.view.s, st.view.cz + ((e.clientY - r.top) * dpr - cv.height / 2) / st.view.s]; };
      cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });
      cv.addEventListener('pointerdown', function (e) {
        cv.setPointerCapture(e.pointerId); drag = { x: e.clientX, y: e.clientY, moved: false, cx: st.view && st.view.cx, cz: st.view && st.view.cz };
        if (st.free && st.view && e.button === 0) drag.sel = worldAt(e); // área livre: o botão esquerdo desenha, os outros movem o mapa
      });
      cv.addEventListener('pointermove', function (e) {
        if (!drag || !st.view) return; var dpr = cv.width / cv.clientWidth, dx = (e.clientX - drag.x) * dpr, dz = (e.clientY - drag.y) * dpr;
        if (Math.abs(dx) + Math.abs(dz) > 6) drag.moved = true;
        if (!drag.moved) return;
        if (drag.sel) { var w = worldAt(e); st.free = { dim: st.dim, x0: Math.floor(drag.sel[0]), z0: Math.floor(drag.sel[1]), x1: Math.floor(w[0]), z1: Math.floor(w[1]) }; draw(); info(); return; }
        st.view.cx = drag.cx - dx / st.view.s; st.view.cz = drag.cz - dz / st.view.s; draw();
      });
      // o chunk sob o ponteiro: gerado ou não
      cv.addEventListener('pointermove', function (e) {
        if (drag || !st.view) return;
        var r = cv.getBoundingClientRect(), dpr = cv.width / r.width;
        var x = st.view.cx + ((e.clientX - r.left) * dpr - cv.width / 2) / st.view.s, z = st.view.cz + ((e.clientY - r.top) * dpr - cv.height / 2) / st.view.s;
        var cx = Math.floor(x / 16), cz = Math.floor(z / 16), c = wio.dims[st.dim].get(cx + ',' + cz);
        var bi = -1; if (mp) { var px = Math.floor((x - mp.x0) / mp.sc), pz = Math.floor((z - mp.z0) / mp.sc); if (px >= 0 && pz >= 0 && px < mp.w && pz < mp.h) bi = mp.bid[pz * mp.w + px]; }
        $('wmHov').textContent = 'X ' + Math.floor(x) + ', Z ' + Math.floor(z) + ' · chunk ' + cx + ', ' + cz + ': ' + (c && c.ok ? 'gerado' : c ? 'num formato antigo (fica vazio)' : 'não gerado') + (bi >= 0 && bi !== 255 && BIO_BY_ID[bi] ? ' · ' + BIO_BY_ID[bi].pt : '');
      });
      cv.addEventListener('pointerleave', function () { $('wmHov').textContent = ''; });
      cv.addEventListener('pointerup', function (e) {
        if (drag && !drag.moved && st.view) {
          var r = cv.getBoundingClientRect(), dpr = cv.width / r.width;
          st.cx = st.view.cx + ((e.clientX - r.left) * dpr - cv.width / 2) / st.view.s; st.cz = st.view.cz + ((e.clientY - r.top) * dpr - cv.height / 2) / st.view.s;
          if (st.free) { var fa = area(), ox = Math.round((st.cx - fa[0] - fa[2] / 2) / 16) * 16, oz = Math.round((st.cz - fa[1] - fa[3] / 2) / 16) * 16; st.free = { dim: st.dim, x0: fa[0] + ox, z0: fa[1] + oz, x1: fa[0] + ox + fa[2] - 1, z1: fa[1] + oz + fa[3] - 1 }; }
          draw(); info();
        }
        drag = null;
      });
      var zoom = function (f) { if (!st.view) return; st.view.s = Math.max(0.02, Math.min(16, st.view.s * f)); draw(); };
      cv.addEventListener('wheel', function (e) { e.preventDefault(); zoom(e.deltaY < 0 ? 1.25 : 0.8); }, { passive: false });
      $('wmIn').onclick = function () { zoom(1.5); }; $('wmOut').onclick = function () { zoom(1 / 1.5); };
      $('wmX').oninput = $('wmZ').oninput = function () {
        st.cx = +$('wmX').value || 0; st.cz = +$('wmZ').value || 0; freeTo();
        if (st.view) { st.view.cx = st.cx; st.view.cz = st.cz; } draw(); info();
      };
      $('wmS').onchange = function () {
        if ($('wmS').value === 'free') { var a0 = area(); st.free = { dim: st.dim, x0: a0[0], z0: a0[1], x1: a0[0] + a0[2] - 1, z1: a0[1] + a0[3] - 1 }; }
        else { st.free = null; wioArea.free = null; st.size = +$('wmS').value; }
        $('wmFreeRow').hidden = !st.free; draw(); info();
      };
      ['wmFx0', 'wmFz0', 'wmFx1', 'wmFz1'].forEach(function (id) { $(id).oninput = function () { st.free = { dim: st.dim, x0: +$('wmFx0').value || 0, z0: +$('wmFz0').value || 0, x1: +$('wmFx1').value || 0, z1: +$('wmFz1').value || 0 }; draw(); info(); }; });
      $('wmMe').onclick = function () { var h = home(st.dim); if (wio.player && wio.player.dim === st.dim) h = [wio.player.x, wio.player.z]; st.cx = h[0]; st.cz = h[1]; freeTo(); if (st.view) { st.view.cx = st.cx; st.view.cz = st.cz; } draw(); info(); };
      $('wmGo').onclick = async function () { var a = area(); closeDialog(); await wioGoArea(st.dim, a[0], a[1], a[2], a[3]); };
      window.addEventListener('resize', function rz() { if (!overlayRoot.contains(cv)) { window.removeEventListener('resize', rz); return; } fit(); draw(); });
      loadDim();
    });
}
/* Grava o que mudou na área atual e carrega outra (canto x0, z0 e tamanho w × d, alinhados aos chunks); devolve true se deu certo */
async function wioGoArea(dim, x0, z0, w, d, quiet) {
  try {
    var r0 = await wioCommitAll();
    busy('Carregando a área…', 0);
    var r = await wioLoadArea(dim, x0, z0, w, d, function (i, n) { busy('Carregando a área: ' + i + ' de ' + n + ' chunks', i / n); });
    await idbDo('readwrite', function (s) { s.delete(IDBKeyRange.bound('w:c:', 'w:c:\uffff')); }).catch(function () {});
    worldClear = false; worldDirty.clear();
    await wioSaveSession(false);
    resetCamera(); changed(); updateStatus(); renderList(); wioChip();
    var unk = Object.keys(wio.unknown);
    if (!quiet) toast('Área carregada: ' + blockCount.toLocaleString('pt-BR') + ' blocos.' + (r.miss ? ' ' + r.miss + ' chunks ainda não gerados ficaram vazios.' : '') +
      (unk.length ? ' Blocos que o editor não conhece aparecem em roxo e voltam iguais para o mundo (' + unk.slice(0, 4).join(', ') + (unk.length > 4 ? '…' : '') + ').' : '') +
      (wio.legacy ? ' ' + wio.legacy + ' pedaços num formato antigo do jogo ficaram de fora (abra o mundo no jogo uma vez e exporte de novo).' : '') +
      (r0 && r0.lost ? ' ' + r0.lost + ' blocos em chunks não gerados não foram guardados.' : '') + (r0 && r0.notOld ? ' ' + r0.notOld + ' blocos que não existiam na versão antiga viraram ar.' : '') +
      (wio.leg && !blockCount ? ' Esta área não tem chunks do mundo antigo: escolha outra no mapa.' : ''), 10000);
    return true;
  } catch (e) { toast(e.message || 'Não foi possível carregar a área.', 9000); return false; }
  finally { busyEnd(); }
}
async function wioExport() {
  if (!wio) return;
  try {
    var r = await wioCommitAll() || { lost: 0 };
    busy('Montando o mundo…', 0);
    var out = await wioBuild(function (i, n) { busy('Montando o mundo: ' + i + ' de ' + n + ' arquivos', i / n); });
    var nm = cleanName(wio.name) + (wio.java ? '-editado.zip' : '-editado.mcworld');
    if (inArtifact) { var sv = await saveBytes(nm, new Uint8Array(await out.blob.arrayBuffer())); reportSave(sv, nm); }
    else {
      var a = document.createElement('a'); a.href = URL.createObjectURL(out.blob); a.download = nm; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 60000);
    }
    toast('Mundo exportado: ' + nm + '. ' + (wio.java ? 'Extraia o .zip na pasta saves do Minecraft Java (a pasta de dentro é o mundo); guarde o original antes, por segurança.' : 'Abra o arquivo no jogo: ele vira um mundo novo, e o original continua como estava.') + (r.lost ? ' ' + r.lost + ' blocos em chunks não gerados ficaram de fora.' : '') + (r.bedrockOnly ? ' ' + r.bedrockOnly + ' blocos que só existem no Bedrock viraram ar.' : '') + (r.notOld ? ' ' + r.notOld + ' blocos que não existiam na versão antiga do mundo viraram ar.' : '') + (wio.leg && wio.legKeep ? ' O mundo continua no formato antigo.' : wio.leg ? ' Ao abrir, o jogo converte o mundo para o formato atual e cria a parte de baixo (-64 a 0); ele não abre mais nas versões antigas.' : ''), 12000);
  } catch (e) { reportErr(e); }
  finally { busyEnd(); }
}

/* ---------- Mundo novo: a construção feita do zero vira um mundo plano do Bedrock (.mcworld), com os biomas ---------- */
/* O level.dat vem de um mundo plano criativo gerado pelo servidor oficial (data/leveldat-plano.dat); o site troca o
   nome, a semente, o ponto de nascimento e a data. O chão plano do jogo (rocha-mãe, 2 de terra, grama) fica de y -64
   a -61 e a construção começa logo acima: o y 0 do editor é o y -60 do mundo, e o x/z 0 do editor é o x/z 0 do mundo.
   Todos os chunks do espaço do editor são gravados (blocos, chão, alturas e biomas de cada coluna); os de fora o jogo
   gera planos, com o bioma de planície. O banco LevelDB sai só com o arquivo de registro (log) e o MANIFEST. */
var NW_LEVEL = '%%LEVELDAT%%', NW_Y0 = -60, NW_CHUNK_VERSION = 42;
/* NBT genérico (lê e grava qualquer tipo, sem perder o tipo de cada valor): little-endian (Bedrock) ou, com big = true,
   big-endian (Java). long, float e double ficam como os bytes crus. Compound = lista de { k, t, v }; lista = { et, a }. */
function nbtTreeLE(u8, big) {
  var p = 0, dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), dec = new TextDecoder(), le = !big;
  function str() { var n = dv.getUint16(p, le); p += 2; var s = dec.decode(u8.subarray(p, p + n)); p += n; return s; }
  function pay(t) {
    var v, n, i;
    switch (t) {
      case 1: return u8[p++];
      case 2: v = dv.getInt16(p, le); p += 2; return v;
      case 3: v = dv.getInt32(p, le); p += 4; return v;
      case 4: case 6: v = u8.slice(p, p + 8); p += 8; return v;
      case 5: v = u8.slice(p, p + 4); p += 4; return v;
      case 7: n = dv.getInt32(p, le); p += 4; v = u8.slice(p, p + n); p += n; return v;
      case 8: return str();
      case 9: { var et = u8[p++]; n = dv.getInt32(p, le); p += 4; var a = []; for (i = 0; i < n; i++) a.push(pay(et)); return { et: et, a: a }; }
      case 10: { var c = []; for (;;) { var ct = u8[p++]; if (!ct) break; var k = str(); c.push({ k: k, t: ct, v: pay(ct) }); } return c; }
      case 11: n = dv.getInt32(p, le); p += 4; v = []; for (i = 0; i < n; i++, p += 4) v.push(dv.getInt32(p, le)); return v;
      case 12: n = dv.getInt32(p, le); p += 4; v = u8.slice(p, p + n * 8); p += n * 8; return v;
    }
    throw new Error('NBT: tipo ' + t);
  }
  var t = u8[p++], name = str();
  return { k: name, t: t, v: pay(t) };
}
function nbtTreeWrite(root, big) {
  var out = [], enc = new TextEncoder(), le = !big;
  function i32(v) { var b = new Uint8Array(4); new DataView(b.buffer).setInt32(0, v, le); out.push(b); }
  function str(s) { var e = enc.encode(s), b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, e.length, le); out.push(b, e); }
  function pay(t, v) {
    switch (t) {
      case 1: out.push(new Uint8Array([v & 255])); break;
      case 2: { var b = new Uint8Array(2); new DataView(b.buffer).setInt16(0, v, le); out.push(b); break; }
      case 3: i32(v); break;
      case 4: case 5: case 6: out.push(v); break;
      case 7: i32(v.length); out.push(v); break;
      case 8: str(v); break;
      case 9: out.push(new Uint8Array([v.et])); i32(v.a.length); v.a.forEach(function (x) { pay(v.et, x); }); break;
      case 10: v.forEach(function (e) { out.push(new Uint8Array([e.t])); str(e.k); pay(e.t, e.v); }); out.push(new Uint8Array([0])); break;
      case 11: i32(v.length); v.forEach(i32); break;
      case 12: i32(v.length / 8); out.push(v); break;
    }
  }
  out.push(new Uint8Array([root.t])); str(root.k); pay(root.t, root.v);
  return wioCat(out);
}
function nwLong(n) { var b = new Uint8Array(8), dv = new DataView(b.buffer); dv.setUint32(0, n % 4294967296, true); dv.setUint32(4, Math.floor(n / 4294967296), true); return b; }
function nwLevelDat(name, sx, sz) {
  var raw = wioBytes(atob(NW_LEVEL)), tree = nbtTreeLE(raw.subarray(8));
  var set = function (k, v) { tree.v.forEach(function (e) { if (e.k === k) e.v = v; }); };
  set('LevelName', name); set('RandomSeed', nwLong(Math.floor(Math.random() * 2147483647)));
  set('LastPlayed', nwLong(Math.floor(Date.now() / 1000))); set('Time', nwLong(0)); set('currentTick', nwLong(0));
  set('SpawnX', Math.floor(sx / 2)); set('SpawnZ', Math.floor(sz / 2)); set('SpawnY', 32767);
  var body = nbtTreeWrite(tree), hd = new Uint8Array(8), dv = new DataView(hd.buffer);
  dv.setInt32(0, new DataView(raw.buffer, raw.byteOffset).getInt32(0, true), true); dv.setInt32(4, body.length, true);
  return wioCat([hd, body]);
}
/* VersionEdit do LevelDB: comparador, arquivo de log atual (3), próximo número de arquivo (4), última sequência */
function nwManifest(lastSeq) {
  var cmp = new TextEncoder().encode('leveldb.BytewiseComparator'), b = [1, cmp.length];
  for (var i = 0; i < cmp.length; i++) b.push(cmp[i]);
  b.push(2); wioPutVar(b, 3); b.push(9); wioPutVar(b, 0); b.push(3); wioPutVar(b, 4); b.push(4); wioPutVar(b, lastSeq);
  var pay = new Uint8Array(b), hd = new Uint8Array(7), crc = crcMask(crc32c(pay, crc32c(new Uint8Array([1]))));
  hd[0] = crc; hd[1] = crc >>> 8; hd[2] = crc >>> 16; hd[3] = crc >>> 24; hd[4] = pay.length; hd[5] = pay.length >> 8; hd[6] = 1;
  return wioCat([hd, pay]);
}
async function nwBuild(name, prog) {
  var C = { pres: wio ? wio.pres : [], entries: new Map() }, ents = [], lost = 0;
  var ground = ['bedrock', 'dirt', 'dirt', 'grass_block'].map(function (n) { return wioEntry(cellFromName(n), 0, 0, 0, C); });
  var air = wioAir(), NC = Math.ceil(SX / 16), NZ = Math.ceil(SZ / 16), ymax = 319 - NW_Y0; // y mais alto do editor que cabe
  var ver = new Uint8Array([NW_CHUNK_VERSION]), fin = new Uint8Array([2, 0, 0, 0]);
  for (var cz = 0; cz < NZ; cz++) for (var cx = 0; cx < NC; cx++) {
    if (prog) { prog(cz * NC + cx, NC * NZ); if (!((cz * NC + cx) & 7)) await new Promise(function (r) { setTimeout(r, 0); }); }
    var hm = new Int16Array(256), bes = [], tops = new Int16Array(256).fill(-61);
    for (var sy = -4; sy < 20; sy++) {
      var ey0 = sy * 16 - NW_Y0; // y do editor no começo deste sub-chunk
      var has = sy === -4;
      for (var q = Math.max(0, ey0 >> 4); q <= Math.min(SY - 1, ey0 + 15) >> 4 && !has; q++) if (ey0 + 15 >= 0 && W.has(ckey(cx, q, cz))) has = true;
      if (!has) continue;
      var idx = new Uint16Array(4096), pal = [air], pmap = new Map([[wioStr(air), 0]]), any = false;
      for (var x = 0; x < 16; x++) for (var z = 0; z < 16; z++) for (var y = 0; y < 16; y++) {
        var wy = sy * 16 + y, ex = cx * 16 + x, ez = cz * 16 + z, ey = wy - NW_Y0, e = null;
        if (wy < -60) e = ground[wy + 64];
        else if (ex < SX && ez < SZ && ey < SY) {
          var v = gget(ex, ey, ez);
          if (v) { e = wioEntry(v, ex, ey, ez, C); tops[(z << 4) | x] = wy; if (e.ent) { bes.push(nbtRootLE(wioEntTags(e.ent, ex, wy, ez))); e = e.raw; } }
        }
        if (!e) continue;
        var s = wioStr(e), pi = pmap.get(s);
        if (pi === undefined) { pi = pal.length; pal.push(e); pmap.set(s, pi); }
        idx[(x << 8) | (z << 4) | y] = pi; any = true;
      }
      if (any) ents.push([wioKey(cx, cz, 0, 0x2f, sy), subEncode(sy, [{ idx: idx, pal: pal }])]);
    }
    for (var ey = ymax + 1; ey < SY; ey++) for (x = 0; x < 16; x++) for (z = 0; z < 16; z++) if (cx * 16 + x < SX && cz * 16 + z < SZ && gget(cx * 16 + x, ey, cz * 16 + z)) lost++;
    var subs = [];
    for (var b = 0; b < 24; b++) {
      var ids = new Uint8Array(4096);
      for (x = 0; x < 16; x++) for (z = 0; z < 16; z++) { var bid = bioAt(cx * 16 + x, cz * 16 + z); ids.fill(bid >= 0 && bid < 255 ? bid : 1, (x << 8) | (z << 4), ((x << 8) | (z << 4)) + 16); }
      subs.push(ids);
    }
    for (var i = 0; i < 256; i++) hm[i] = tops[i] + 1 + 64;
    ents.push([wioKey(cx, cz, 0, 0x2b), bioEncode3D(hm, subs)], [wioKey(cx, cz, 0, 0x2c), ver], [wioKey(cx, cz, 0, 0x36), fin]);
    if (bes.length) ents.push([wioKey(cx, cz, 0, 0x31), wioCat(bes)]);
  }
  ents.sort(function (a, b) { return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0; });
  var files = [
    { name: 'level.dat', data: nwLevelDat(name, SX, SZ) },
    { name: 'levelname.txt', data: new TextEncoder().encode(name) },
    { name: 'db/CURRENT', data: new TextEncoder().encode('MANIFEST-000002\n') },
    { name: 'db/MANIFEST-000002', data: nwManifest(0) },
    { name: 'db/000003.log', data: ldbLogWrite(ents, 1) }
  ];
  return { bytes: MCExport.makeZip(files), chunks: NC * NZ, lost: lost };
}
async function nwExport(name) {
  try {
    busy('Montando o mundo novo…', 0);
    var out = await nwBuild(name, function (i, n) { busy('Montando o mundo novo: chunk ' + i + ' de ' + n, i / n); });
    var nm = cleanName(name) + '.mcworld';
    if (inArtifact) reportSave(await saveBytes(nm, out.bytes), nm);
    else {
      var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([out.bytes], { type: 'application/octet-stream' })); a.download = nm; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 60000);
    }
    toast('Mundo novo exportado: ' + nm + ' (' + out.chunks + ' chunks). Abra o arquivo no jogo: ele vira um mundo plano criativo com a construção e os biomas pintados, a partir de X 0, Z 0.' + (out.lost ? ' ' + out.lost + ' blocos acima do limite de altura do mundo ficaram de fora.' : ''), 10000);
  } catch (e) { reportErr(e); }
  finally { busyEnd(); }
}
