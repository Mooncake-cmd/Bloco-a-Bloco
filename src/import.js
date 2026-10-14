/* ---------- Importar .mcstructure (Bedrock) e .schem (Java) ---------- */
/* Leitor de NBT: little-endian sem compressão no .mcstructure, big-endian com gzip no .schem.
   Devolve objetos simples; listas viram arrays, long vira Number (só usamos valores pequenos). */
function nbtRead(u8, little) {
  var dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), p = 0, dec = new TextDecoder();
  function str() { var n = dv.getUint16(p, little); p += 2; var s = dec.decode(u8.subarray(p, p + n)); p += n; return s; }
  function pay(t) {
    var n, a, i;
    switch (t) {
      case 1: return dv.getInt8(p++);
      case 2: p += 2; return dv.getInt16(p - 2, little);
      case 3: p += 4; return dv.getInt32(p - 4, little);
      case 4: p += 8; return Number(dv.getBigInt64(p - 8, little));
      case 5: p += 4; return dv.getFloat32(p - 4, little);
      case 6: p += 8; return dv.getFloat64(p - 8, little);
      case 7: n = dv.getInt32(p, little); p += 4; a = u8.slice(p, p + n); p += n; return a;
      case 8: return str();
      case 9: { var et = dv.getUint8(p++); n = dv.getInt32(p, little); p += 4; a = new Array(Math.max(0, n)); for (i = 0; i < n; i++) a[i] = pay(et); return a; }
      case 10: { var o = {}; for (;;) { var tt = dv.getUint8(p++); if (!tt) return o; var k = str(); o[k] = pay(tt); } }
      case 11: n = dv.getInt32(p, little); p += 4; a = new Int32Array(n); for (i = 0; i < n; i++) { a[i] = dv.getInt32(p, little); p += 4; } return a;
      case 12: n = dv.getInt32(p, little); p += 4; a = new Array(n); for (i = 0; i < n; i++) { a[i] = Number(dv.getBigInt64(p, little)); p += 8; } return a;
      default: throw new Error('NBT inválido (tipo ' + t + ').');
    }
  }
  var t = dv.getUint8(p++); if (t !== 10) throw new Error('Arquivo NBT inválido.');
  str(); return pay(10);
}
async function gunzipMaybe(u8) {
  if (u8[0] !== 0x1f || u8[1] !== 0x8b) return u8;
  return new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
}

/* Bedrock -> célula do editor. Compara com o que a própria exportação gera: para cada bloco candidato com o mesmo
   nome Bedrock, procura o estado guardado cujos estados Bedrock batem com mais estados do arquivo. */
var beByName = null;
function bedrockIndex() {
  if (beByName) return beByName;
  beByName = {};
  var add = function (n, bi) { (beByName[n] = beByName[n] || []).push(bi); };
  BLOCKS.forEach(function (b, bi) {
    if (b.shape) { var t = b.shape.be['#name']; if (t) Object.keys(t[1]).forEach(function (k) { if (beByName[t[1][k]] && beByName[t[1][k]].indexOf(bi) >= 0) return; add(t[1][k], bi); }); else add(b.java, bi); }
    else add(b.bedrock, bi);
  });
  return beByName;
}
function sameVal(a, b) { return String(a) === String(b) || (a === 1 && b === 'true') || (a === 0 && b === 'false'); }
function cellFromBedrock(name, states) {
  var cands = bedrockIndex()[name] || [];
  var best = 0, bestScore = -1;
  cands.forEach(function (bi) {
    var b = BLOCKS[bi];
    if (b.shape) {
      var total = b.sp.reduce(function (m, p) { return m * p[1].length; }, 1), d0 = defaultState(b);
      for (var k = 0; k < Math.min(total, 20000); k++) {
        var s = (d0 + k) % total, o = {}, q;
        for (q in b.defs) o[q] = b.defs[q];
        var st = stateProps(b, s); for (q in st) o[q] = st[q];
        var r = bedrockFromProps(b, o); if (r.bn !== name) continue;
        // mais estados iguais ganha; no empate (o Bedrock não guarda tudo, ex.: botão no chão), o mais perto do padrão
        var sc = 1000;
        for (q in states) if (r.bs[q] && sameVal(r.bs[q].v, states[q])) sc += 100;
        for (q in st) if (st[q] === b.defs[q]) sc++;
        if (sc > bestScore) { bestScore = sc; best = mkCell(bi, s); }
      }
    } else {
      var o2 = -1;
      if (b.ori && b.ori.bk in states) for (var i = 0; i < b.ori.o.length; i++) if (sameVal(b.ori.o[i][1], states[b.ori.bk])) o2 = i;
      var sc2 = 1000 + (o2 >= 0 ? 100 : 0);
      if (sc2 > bestScore) { bestScore = sc2; best = mkCell(bi, o2); }
    }
  });
  return best;
}
/* Java: "minecraft:oak_stairs[facing=east,half=top,...]" -> célula */
function cellFromJava(key) {
  var m = /^(?:minecraft:)?([^\[]+)(?:\[(.*)\])?$/.exec(key); if (!m || !(m[1] in BY_JAVA)) return 0;
  var bi = BY_JAVA[m[1]], b = BLOCKS[bi], pr = {};
  if (m[2]) m[2].split(',').forEach(function (pv) { var a = pv.split('='); pr[a[0]] = a[1]; });
  if (b.shape) return mkCell(bi, stateIndex(b, pr));
  var o = -1;
  if (b.ori && pr[b.ori.k] != null) for (var i = 0; i < b.ori.o.length; i++) if (b.ori.o[i][0] === pr[b.ori.k]) o = i;
  return mkCell(bi, o);
}

/* Monta o mundo: dims e get(x, y, z) -> célula (0 = vazio); desconhecidos contados por nome */
function fillWorld(w, h, l, get) {
  // o espaço passa a ter o tamanho da estrutura (no mínimo 8 por lado), sem cortar
  var sx = Math.max(8, w), sy = Math.max(8, h), sz = Math.max(8, l);
  var se = sizeError(sx, sy, sz); if (se) throw new Error('Estrutura grande demais para abrir: ' + se);
  newWorld(sx, sy, sz);
  for (var y = 0; y < h; y++) for (var z = 0; z < l; z++) for (var x = 0; x < w; x++) {
    var v = get(x, y, z); if (v) { gset(x, y, z, v); blockCount++; }
  }
  verCounter++; dirtyAll(); changed(); renderList();
  return false;
}
function importReport(kind, cut, unknown) {
  var names = Object.keys(unknown), n = names.reduce(function (a, k) { return a + unknown[k]; }, 0);
  var msg = kind + ' importado: ' + blockCount + ' blocos.';
  msg += ' Espaço: ' + SX + ' × ' + SY + ' × ' + SZ + '.';
  if (n) msg += ' ' + n + ' blocos desconhecidos ficaram de fora: ' + names.slice(0, 6).map(function (k) { return k.replace('minecraft:', ''); }).join(', ') + (names.length > 6 ? '…' : '') + '.';
  toast(msg, n || cut ? 10000 : 4000);
}
function importMcstructure(u8) {
  var root = nbtRead(u8, true), size = root.size, st = root.structure;
  if (!size || !st || !st.block_indices) throw new Error('Este arquivo não parece ser um .mcstructure.');
  var pal = ((st.palette || {}).default || {}).block_palette || [], ids = st.block_indices[0];
  var unknown = {};
  var map = pal.map(function (e) {
    var n = String(e.name || '').replace(/^minecraft:/, '');
    if (/^(air|structure_void)$/.test(n)) return 0; // vazio de estrutura = "manter o terreno": no editor, vazio
    var v = cellFromBedrock(n, e.states || {});
    if (!v) unknown[n] = 0;
    return v;
  });
  var W = size[0], H = size[1], L = size[2];
  // cor da cama fica nos dados de entidade do bloco (block_position_data), não no estado
  var pos = ((st.palette || {}).default || {}).block_position_data || {};
  var cut = fillWorld(W, H, L, function (x, y, z) {
    var i = (x * H + y) * L + z, k = ids[i]; if (k == null || k < 0) return 0;
    var v = map[k];
    if (v && pal[k] && /bed$/.test(pal[k].name) && pos[i] && pos[i].block_entity_data && pos[i].block_entity_data.color != null) {
      var cb = BY_JAVA[(BED_COLORS[pos[i].block_entity_data.color] || 'red') + '_bed'];
      if (cb != null) v = mkCell(cb, cellOri(v));
    } if (!v && pal[k]) { var n = String(pal[k].name).replace(/^minecraft:/, ''); if (n in unknown) unknown[n]++; }
    return v;
  });
  importReport('.mcstructure', cut, unknown);
}
function varints(u8, n) {
  var out = new Int32Array(n), p = 0;
  for (var i = 0; i < n && p < u8.length; i++) {
    var v = 0, s = 0, c;
    do { c = u8[p++]; v |= (c & 127) << s; s += 7; } while (c & 128);
    out[i] = v;
  }
  return out;
}
function importSchem(u8) {
  var root = nbtRead(u8, false), s = root.Schematic || root;
  var W = s.Width, H = s.Height, L = s.Length;
  // v3: Blocks.{Palette, Data}; v2: Palette e BlockData na raiz
  var pal = s.Blocks ? s.Blocks.Palette : s.Palette, data = s.Blocks ? s.Blocks.Data : s.BlockData;
  if (!W || !pal || !data) throw new Error('Este arquivo não parece ser um .schem (Sponge). Arquivos .schematic antigos do MCEdit não são suportados.');
  var byId = [], unknown = {};
  Object.keys(pal).forEach(function (k) {
    var n = k.replace(/^minecraft:/, '').replace(/\[.*$/, '');
    if (/^(air|cave_air|void_air)$/.test(n)) { byId[pal[k]] = 0; return; }
    var v = cellFromJava(k); byId[pal[k]] = v;
    if (!v) unknown[n] = 0;
  });
  var ids = varints(data, W * H * L);
  var cut = fillWorld(W, H, L, function (x, y, z) {
    var k = ids[(y * L + z) * W + x], v = byId[k];
    if (!v && k) { var name = Object.keys(pal).find(function (q) { return pal[q] === k; }); if (name) { var n = name.replace(/^minecraft:/, '').replace(/\[.*$/, ''); if (n in unknown) unknown[n]++; } }
    return v || 0;
  });
  importReport('.schem', cut, unknown);
}
