/* ---------- Mundo em chunks esparsos ---------- */
/* O espaço é dividido em chunks de 16 x 16 x 16. Só existem na memória os chunks com algum bloco; o vazio não ocupa
   nada. Cada chunk guarda uma paleta (os valores de célula que aparecem nele) e, por célula, o índice na paleta:
   1 byte por célula (até 256 valores diferentes no chunk), 2 bytes acima disso. Um chunk inteiro de um bloco só
   (ex.: chão grosso de pedra) vira "uniforme" ao ser salvo e ocupa um valor só.
   Célula = índice do bloco + 1 (bits 0 a 11) + estado * 4096, como antes. Coordenadas inteiras >= 0. */
var W = new Map();          // chave numérica do chunk -> { cx, cy, cz, pal, map, d, u, n }
var NCX = 1, NCZ = 1;       // chunks por lado (X e Z), para a chave
function ckey(cx, cy, cz) { return (cy * NCZ + cz) * NCX + cx; }
function ckeyStr(ch) { return ch.cx + ',' + ch.cy + ',' + ch.cz; }
function worldReset() { W.clear(); NCX = Math.ceil(SX / 16) + 1; NCZ = Math.ceil(SZ / 16) + 1; }
function newChunk(cx, cy, cz) { return { cx: cx, cy: cy, cz: cz, pal: [0], map: new Map([[0, 0]]), d: new Uint8Array(4096), u: 0, n: 0 }; }
/* Índice global da célula (para desfazer, filas e conjuntos); vai além de 2^32 em espaços grandes, então nada de "| 0" */
function unidx(i) { var a = SX * SZ, y = Math.floor(i / a), r = i - y * a, z = Math.floor(r / SX); return [r - z * SX, y, z]; }
function gget(x, y, z) {
  var ch = W.get(ckey(x >> 4, y >> 4, z >> 4)); if (!ch) return 0;
  return ch.d ? ch.pal[ch.d[((y & 15) << 8) | ((z & 15) << 4) | (x & 15)]] : ch.u;
}
function gat(i) { var p = unidx(i); return gget(p[0], p[1], p[2]); }
function chunkUnpack(ch) { // uniforme -> com índices
  ch.pal = [0, ch.u]; ch.map = new Map([[0, 0], [ch.u, 1]]); ch.d = new Uint8Array(4096).fill(1);
}
/* Paleta sem os valores que não aparecem mais; devolve true se o chunk ficou vazio */
function chunkRepack(ch) {
  if (!ch.d) return false;
  var used = new Uint32Array(ch.pal.length), d = ch.d, i;
  for (i = 0; i < 4096; i++) used[d[i]]++;
  var pal = [0], remap = new Uint32Array(ch.pal.length), map = new Map([[0, 0]]);
  for (i = 1; i < ch.pal.length; i++) if (used[i]) { remap[i] = pal.length; map.set(ch.pal[i], pal.length); pal.push(ch.pal[i]); }
  if (pal.length === 2 && used[0] === 0) { ch.u = pal[1]; ch.d = null; ch.pal = pal; ch.map = map; return false; }
  var nd = pal.length > 256 ? new Uint16Array(4096) : new Uint8Array(4096);
  for (i = 0; i < 4096; i++) nd[i] = remap[d[i]];
  ch.pal = pal; ch.map = map; ch.d = nd;
  return ch.n === 0;
}
/* Grava e devolve o valor antigo; mantém a contagem de blocos de cada chunk e apaga o chunk que esvazia */
function gset(x, y, z, v) {
  var cx = x >> 4, cy = y >> 4, cz = z >> 4, k = ckey(cx, cy, cz), ch = W.get(k);
  if (!ch) { if (!v) return 0; ch = newChunk(cx, cy, cz); W.set(k, ch); }
  var o = ((y & 15) << 8) | ((z & 15) << 4) | (x & 15);
  var old = ch.d ? ch.pal[ch.d[o]] : ch.u;
  if (old === v) return old;
  if (!ch.d) chunkUnpack(ch);
  var pi = ch.map.get(v);
  if (pi === undefined) {
    if (ch.pal.length >= 4096) { chunkRepack(ch); if (!ch.d) chunkUnpack(ch); }
    pi = ch.pal.length;
    if (pi === 256 && ch.d instanceof Uint8Array) ch.d = Uint16Array.from(ch.d);
    ch.pal.push(v); ch.map.set(v, pi);
  }
  ch.d[o] = pi; ch.bb = null;
  if (!old) ch.n++; else if (!v) ch.n--;
  if (!ch.n) { W.delete(k); worldDirty.add(cx + ',' + cy + ',' + cz); }
  else if (!ch.sv) { ch.sv = true; worldDirty.add(cx + ',' + cy + ',' + cz); } // marcado para o salvamento automático
  return old;
}
/* Percorre só os chunks com blocos: fn(chunk); e cada bloco: fn(x, y, z, v) */
function forEachChunk(fn) { W.forEach(fn); }
function forEachBlock(fn) {
  W.forEach(function (ch) {
    var x0 = ch.cx << 4, y0 = ch.cy << 4, z0 = ch.cz << 4;
    for (var o = 0; o < 4096; o++) {
      var v = ch.d ? ch.pal[ch.d[o]] : ch.u; if (!v) continue;
      fn(x0 + (o & 15), y0 + (o >> 8), z0 + ((o >> 4) & 15), v);
    }
  });
}
/* Blocos em ordem y, z, x dentro de uma caixa (para exportar em pedaços) */
function blocksInBox(x0, y0, z0, x1, y1, z1, fn) {
  for (var cy = y0 >> 4; cy <= y1 >> 4; cy++) for (var cz = z0 >> 4; cz <= z1 >> 4; cz++) for (var cx = x0 >> 4; cx <= x1 >> 4; cx++) {
    var ch = W.get(ckey(cx, cy, cz)); if (!ch) continue;
    for (var o = 0; o < 4096; o++) {
      var v = ch.d ? ch.pal[ch.d[o]] : ch.u; if (!v) continue;
      var x = (cx << 4) + (o & 15), y = (cy << 4) + (o >> 8), z = (cz << 4) + ((o >> 4) & 15);
      if (x < x0 || x > x1 || y < y0 || y > y1 || z < z0 || z > z1) continue;
      fn(x, y, z, v);
    }
  }
}
/* Caixa dos blocos do chunk (guardada até o chunk mudar), para o tamanho da construção sem percorrer tudo */
function chunkBounds(ch) {
  if (ch.bb) return ch.bb;
  var b = [16, 16, 16, -1, -1, -1];
  for (var o = 0; o < 4096; o++) {
    if (!(ch.d ? ch.pal[ch.d[o]] : ch.u)) continue;
    var x = o & 15, y = o >> 8, z = (o >> 4) & 15;
    if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y; if (z < b[2]) b[2] = z;
    if (x > b[3]) b[3] = x; if (y > b[4]) b[4] = y; if (z > b[5]) b[5] = z;
  }
  return (ch.bb = b);
}
function worldBytes() { var b = 0; W.forEach(function (ch) { b += ch.d ? ch.d.byteLength + ch.pal.length * 8 : 16; }); return b; }

/* ---------- Desfazer compacto ---------- */
/* Cada passo guarda (índice, valor antigo, valor novo) em arrays tipados que crescem: 16 bytes por mudança,
   em vez de um array JavaScript por mudança. */
function EditLog() { this.i = new Float64Array(16); this.o = new Uint32Array(16); this.v = new Uint32Array(16); this.length = 0; }
EditLog.prototype.add = function (i, o, v) {
  if (this.length === this.i.length) {
    var n = this.length * 2, a = new Float64Array(n), b = new Uint32Array(n), c = new Uint32Array(n);
    a.set(this.i); b.set(this.o); c.set(this.v); this.i = a; this.o = b; this.v = c;
  }
  this.i[this.length] = i; this.o[this.length] = o; this.v[this.length] = v; this.length++;
};
var UNDO_MAX = 20e6; // mudanças guardadas no total (cerca de 320 MB); os passos mais antigos saem antes
function undoTrim() {
  var tot = 0; for (var k = 0; k < undoStack.length; k++) tot += undoStack[k].length;
  while (undoStack.length > 1 && (tot > UNDO_MAX || undoStack.length > 300)) tot -= undoStack.shift().length;
}

/* ---------- Salvar: projeto (.json) e salvamento automático no navegador ---------- */
/* Chunk em formato de arquivo: coordenadas, paleta por nome (sobrevive a mudanças na lista de blocos) e índices */
function chunkRecord(ch) {
  chunkRepack(ch);
  var r = { c: [ch.cx, ch.cy, ch.cz], p: ch.pal.map(function (v) { return v ? cellName(v) : ''; }) };
  if (ch.d) r.d = ch.d; else r.u = 1;
  return r;
}
function chunkFromRecord(r) {
  var vals = r.p.map(function (nm) { return nm ? cellFromName(nm) : 0; }), miss = 0;
  var x0 = r.c[0] << 4, y0 = r.c[1] << 4, z0 = r.c[2] << 4;
  if (r.u) {
    var v = vals[1] || 0; if (!v) return 4096;
    for (var o = 0; o < 4096; o++) { var x = x0 + (o & 15), y = y0 + (o >> 8), z = z0 + ((o >> 4) & 15); if (inB(x, y, z)) { gset(x, y, z, v); blockCount++; } }
    return 0;
  }
  var d = r.d;
  for (var o2 = 0; o2 < 4096; o2++) {
    var pi = d[o2]; if (!pi) continue;
    var w = vals[pi]; if (!w) { miss++; continue; }
    var x2 = x0 + (o2 & 15), y2 = y0 + (o2 >> 8), z2 = z0 + ((o2 >> 4) & 15);
    if (inB(x2, y2, z2)) { gset(x2, y2, z2, w); blockCount++; }
  }
  return miss;
}
function b64(u8) { var s = '', n = 0x8000; for (var i = 0; i < u8.length; i += n) s += String.fromCharCode.apply(null, u8.subarray(i, i + n)); return btoa(s); }
function unb64(s, two) { var bin = atob(s), u = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return two ? new Uint16Array(u.buffer) : u; }
function projectMeta() { return { size: [SX, SY, SZ], hotbar: hotbar.map(function (i) { return BLOCKS[i].java; }), slot: slot }; }
/* Projeto inteiro (Projeto > Salvar projeto): versão 2, por chunks */
function serialize() {
  var o = projectMeta(); o.v = 2; o.chunks = [];
  W.forEach(function (ch) {
    var r = chunkRecord(ch);
    if (r.d) { r.w = r.d instanceof Uint16Array ? 2 : 1; r.d = b64(new Uint8Array(r.d.buffer)); }
    o.chunks.push(r);
  });
  return o;
}

/* Salvamento automático no IndexedDB, só dos chunks que mudaram (o localStorage aceita poucos MB) */
var worldDirty = new Set(), worldClear = true, autosaveBusy = false, autosaveAgain = false;
function autosave() {
  if (autosaveBusy) { autosaveAgain = true; return; }
  autosaveBusy = true;
  var keys = Array.from(worldDirty); worldDirty.clear();
  var clear = worldClear; worldClear = false;
  var recs = keys.map(function (s) {
    var p = s.split(','), ch = W.get(ckey(+p[0], +p[1], +p[2]));
    if (ch) ch.sv = false;
    return [s, ch ? chunkRecord(ch) : null];
  });
  var meta = projectMeta(); meta.v = 2;
  idbDo('readwrite', function (st) {
    if (clear) st.delete(IDBKeyRange.bound('w:c:', 'w:c:\uffff'));
    recs.forEach(function (r) { if (r[1]) st.put(r[1], 'w:c:' + r[0]); else st.delete('w:c:' + r[0]); });
    st.put(meta, 'w:meta');
  }).then(function () {
    autosaveBusy = false;
    try { localStorage.removeItem(KEY); } catch (e) {}
    if (autosaveAgain) { autosaveAgain = false; autosave(); }
  }, function () {
    autosaveBusy = false;
    keys.forEach(function (k) { worldDirty.add(k); }); if (clear) worldClear = true;
    if (!autosaveWarned) { autosaveWarned = true; toast('Não foi possível salvar automaticamente neste navegador. Use Projeto > Salvar projeto para não perder o trabalho.', 9000); }
  });
}
/* Lê o salvamento automático; devolve false se não houver */
function loadAutosave() {
  return idbDo('readonly', function (st) { return st.get('w:meta'); }).then(function (meta) {
    if (!meta || !meta.size) return false;
    return idbDo('readonly', function (st) { return st.getAll(IDBKeyRange.bound('w:c:', 'w:c:\uffff')); }).then(function (recs) {
      newWorld(meta.size[0], meta.size[1], meta.size[2]);
      (recs || []).forEach(chunkFromRecord);
      if (meta.hotbar) hotbar = meta.hotbar.map(function (j, i) { return j in BY_JAVA ? BY_JAVA[j] : hotbar[i] || 0; });
      slot = meta.slot | 0;
      worldDirty.clear(); worldClear = false; W.forEach(function (ch) { ch.sv = false; }); // já está salvo assim
      verCounter++; dirtyAll(); renderHotbar(); renderList();
      return true;
    });
  }, function () { return false; });
}
worldReset();
