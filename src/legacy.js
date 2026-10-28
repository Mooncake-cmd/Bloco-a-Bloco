/* ---------- Mundos no formato antigo do Bedrock (Pocket Edition até a 1.0: chunks "LegacyTerrain") ---------- */
/* Nesses mundos, cada chunk é uma chave 0x30 no banco do mundo com 83.200 bytes: os números dos blocos (32.768, um
   por bloco, na ordem x, z, y: i = x·2048 + z·128 + y), os valores de dados (meio byte cada, o de índice par na metade
   de baixo), a luz do céu e a luz dos blocos (meio byte cada), o mapa de alturas (256 bytes, z·16 + x) e o bioma de
   cada coluna (4 bytes: o número do bioma e a cor da grama). A altura vai de 0 a 127.
   A tradução número:dados -> bloco vem de data/legacy-pe.json (scripts/gen_legacy.js): 1.802 dos 1.926 códigos têm
   bloco equivalente; os outros (blocos da Education Edition, o reator do Nether, a obsidiana brilhante...) entram como
   "bloco do jogo" roxo, que volta igual ao exportar.
   Dois modos, escolhidos ao abrir o mundo (wio.legKeep):
   - manter o formato antigo (para jogar na versão antiga): o editor tem a altura 0 a 127 e os chunks editados voltam
     como 0x30, com a luz do céu e dos blocos calculada de novo (legLight) e o mapa de alturas; um bloco que não existia
     na época vira ar (o aviso conta quantos);
   - converter para o formato atual: o editor tem a altura 0 a 255 e os chunks editados saem como chunks da 1.17
     (legFinishConvert), que o jogo atual atualiza sozinho como faz com os antigos não editados, criando a parte de
     baixo do mundo (-64 a 0) pela semente (conferido no servidor oficial 1.26.52). */
var LEG = /*%%LEGACY%%*/{ b: {}, l: {}, i: {}, u: {} };
var LEG_RENAME = { grass: 'short_grass' }; // nomes do Java que mudaram depois da 1.17 (a tabela usa os da 1.17)
var LEG_LEN = 83200, LEG_OFF = { id: 0, meta: 32768, sky: 49152, blk: 65536, hm: 81920, bio: 82176 };
var legCells = null, legBack = null, legBackBi = null, legLightOf = null;
function legInit() {
  if (legCells) return;
  legCells = new Int32Array(4096).fill(-1); legBack = new Map(); legBackBi = new Map();
  Object.keys(LEG.b).map(function (k) { var p = k.split(':'); return [(+p[0] << 4) | +p[1], LEG.b[k]]; }).sort(function (a, b) { return a[0] - b[0]; }).forEach(function (q) {
    var m = /^([^\[]+)(.*)$/.exec(q[1]), nm = LEG_RENAME[m[1]] || m[1], c = q[0] >> 4 === 0 ? 0 : cellFromJava(nm + m[2]);
    if (!c && q[0] >> 4) return;
    legCells[q[0]] = c;
    if (c && !legBack.has(c)) legBack.set(c, q[0]);
    if (c && !legBackBi.has(cellBlock(c))) legBackBi.set(cellBlock(c), q[0]);
  });
  legLightOf = new Int16Array(BLOCKS.length * 2).fill(-1);
}
/* célula do editor para um código (número << 4 | dados) */
function legCell(code) {
  legInit();
  var c = legCells[code]; if (c >= 0) return c;
  if (!(code >> 4)) return 0;
  var c0 = legCells[code & ~15]; if (c0 > 0 && LEG.b[(code >> 4) + ':' + (code & 15)] === undefined && !LEG.u[(code >> 4) + ':' + (code & 15)]) return c0; // dados fora do comum: o bloco do dado 0
  // sem equivalente: bloco do jogo preservado (roxo), com o código para voltar igual
  var key = 'leg:' + code, i = wio.presMap.get(key);
  if (i === undefined) {
    var old = LEG.u[(code >> 4) + ':' + (code & 15)] || ('legacy_' + (code >> 4) + '_' + (code & 15));
    i = wio.pres.length; wio.pres.push({ raw: nbtRootLE({ name: { t: 'string', v: old.replace(/\[.*$/, '') }, states: { t: 'compound', v: {} }, version: { t: 'int', v: 17694723 } }), name: old.replace(/\[.*$/, ''), leg: code });
    wio.presMap.set(key, i); wio.presDirty = true; wio.unknown[old] = (wio.unknown[old] || 0) + 1;
  }
  return (PRES_BI + 1) + i * 4096;
}
/* código para uma célula do editor (-1: não existia na época) */
function legCode(v) {
  if (!v) return 0;
  legInit();
  var bi = cellBlock(v);
  if (bi === PRES_BI) { var e = wio.pres[cellOri(v)]; return e && e.leg != null ? e.leg : -1; }
  var c = legBack.get(v); if (c != null) return c;
  var cb = legBackBi.get(bi); return cb != null ? cb : -1; // o mesmo bloco, em outro estado (o mais comum dele)
}
/* luz de um bloco: [emite, barra] (o Java 1.20, pelo nome; sem dado: blocos cheios barram tudo, formas não barram) */
function legLight(v) {
  if (!v) return 0;
  var bi = cellBlock(v), k = bi * 2;
  if (legLightOf[k] < 0) {
    var b = BLOCKS[bi], L = LEG.l[b.java] || LEG.l[(Object.keys(LEG_RENAME).filter(function (q) { return LEG_RENAME[q] === b.java; })[0]) || ''];
    legLightOf[k] = L ? L[0] : 0; legLightOf[k + 1] = L ? L[1] : b.shape || b.glass ? 0 : 15;
  }
  return (legLightOf[k] << 4) | legLightOf[k + 1];
}

/* ---------- Abrir: um chunk antigo vira pedaços do editor ---------- */
function legLoadColumn(raw, a, b, ymin) {
  if (!raw || raw.length < LEG_OFF.hm) { wio.legacy++; return; }
  var oy = 0 - ymin; // altura do editor do y 0 do mundo (0 no modo antigo; 64 no convertido)
  for (var ey = 0; ey < 8; ey++) {
    var eyy = (oy >> 4) + ey, ch = newChunk(a, eyy, b);
    for (var x = 0; x < 16; x++) for (var z = 0; z < 16; z++) for (var y = 0; y < 16; y++) {
      var wy = ey * 16 + y, i = (x << 11) | (z << 7) | wy, id = raw[i]; if (!id) continue;
      var mb = raw[LEG_OFF.meta + (i >> 1)], meta = i & 1 ? mb >> 4 : mb & 15, v = legCell((id << 4) | meta); if (!v) continue;
      var pi = ch.map.get(v);
      if (pi === undefined) { pi = ch.pal.length; if (pi === 256) ch.d = Uint16Array.from(ch.d); ch.pal.push(v); ch.map.set(v, pi); }
      ch.d[(y << 8) | (z << 4) | x] = pi; ch.n++;
    }
    if (ch.n) { W.set(ckey(a, eyy, b), ch); blockCount += ch.n; }
  }
  // bioma de cada coluna (para a cor da grama e o mapa)
  var bio = new Uint8Array(256); for (var q = 0; q < 256; q++) bio[q] = raw[LEG_OFF.bio + q * 4];
  bioOrig.set(bioKey(a, b), bio);
}
/* Blocos com dados no formato antigo: itens com o número (id, Damage) em vez do nome; placas com Text1 a Text4 */
function legFixEntity(o) {
  if (o.Items) o.Items.forEach(function (it) {
    if (it.Name || it.id == null) return;
    var n = +it.id, d = +(it.Damage || 0), j = n < 256 ? LEG.b[n + ':' + d] || LEG.b[n + ':0'] : null;
    it.Name = 'minecraft:' + (j ? (LEG_RENAME[j.replace(/\[.*$/, '')] || j.replace(/\[.*$/, '')) : LEG.i[n] || 'air');
  });
  if (o.Text1 != null && o.Text == null) o.Text = [o.Text1, o.Text2, o.Text3, o.Text4].map(function (s) { return s || ''; }).join('\n');
  return o;
}

/* ---------- Gravar no formato antigo ---------- */
/* Luz da região [x0, x1) × [z0, z1) do editor (altura 0 a 127): céu de cima para baixo e depois espalhado (-1 por
   bloco, mais o que o bloco barra), e a dos blocos que brilham espalhada do mesmo jeito. Devolve { sky, blk } com
   Uint8Array de w · l · 128 (i = ((x - x0) · l + (z - z0)) · 128 + y). */
function legLightRegion(x0, z0, x1, z1) {
  var w = x1 - x0, l = z1 - z0, H = 128, n = w * l * H, sky = new Uint8Array(n), blk = new Uint8Array(n), filt = new Uint8Array(n);
  var I = function (x, z, y) { return ((x * l) + z) * H + y; };
  for (var x = 0; x < w; x++) for (var z = 0; z < l; z++) for (var y = 0; y < H; y++) {
    var v = gget(x + x0, y, z + z0), L = legLight(v), i = I(x, z, y); filt[i] = L & 15; if (L >> 4) blk[i] = L >> 4;
  }
  // céu: coluna por coluna, até o primeiro bloco que barra tudo
  for (x = 0; x < w; x++) for (z = 0; z < l; z++) { var s = 15; for (y = H - 1; y >= 0; y--) { var j = I(x, z, y); s = Math.max(0, s - filt[j]); sky[j] = s; if (!s) break; } }
  var spread = function (A) { // fila simples: cada lugar entra de novo só quando a luz dele sobe (no máximo 15 vezes)
    var q = [];
    for (var k = 0; k < n; k++) if (A[k] > 1) q.push(k);
    for (var qh = 0; qh < q.length; qh++) {
      var c = q[qh], cy = c % H, r = (c - cy) / H, cz = r % l, cx = (r - cz) / l, lv = A[c];
      var nb = [[cx + 1, cz, cy], [cx - 1, cz, cy], [cx, cz + 1, cy], [cx, cz - 1, cy], [cx, cz, cy + 1], [cx, cz, cy - 1]];
      for (var t = 0; t < 6; t++) {
        var p = nb[t]; if (p[0] < 0 || p[1] < 0 || p[2] < 0 || p[0] >= w || p[1] >= l || p[2] >= H) continue;
        var d = I(p[0], p[1], p[2]), nv = lv - 1 - filt[d]; if (filt[d] >= 15 || nv <= A[d]) continue;
        A[d] = nv; if (nv > 1) q.push(d);
      }
    }
  };
  spread(sky); spread(blk);
  return { sky: sky, blk: blk, w: w, l: l, I: I, x0: x0, z0: z0 };
}
/* Um chunk antigo com o que está no editor; devolve os bytes novos e quantos blocos não existiam na época */
function legChunkBytes(orig, ecx, ecz, LR) {
  var out = orig && orig.length >= LEG_LEN ? orig.slice() : new Uint8Array(LEG_LEN), lost = 0;
  out.fill(0, 0, LEG_OFF.hm);
  for (var x = 0; x < 16; x++) for (var z = 0; z < 16; z++) {
    var ex = (ecx << 4) + x, ez = (ecz << 4) + z, top = 0;
    for (var y = 0; y < 128; y++) {
      var v = gget(ex, y, ez), i = (x << 11) | (z << 7) | y, code, oc = orig && orig.length >= LEG_LEN ? (orig[i] << 4) | (i & 1 ? orig[LEG_OFF.meta + (i >> 1)] >> 4 : orig[LEG_OFF.meta + (i >> 1)] & 15) : 0;
      code = oc && legCell(oc) === v ? oc : legCode(v); // o que não mudou volta com o código de antes (água parada 9 e corrente 8 viram a mesma água no editor)
      if (code < 0) { lost++; code = 0; }
      if (code) { out[i] = code >> 4; var m = code & 15, bi = LEG_OFF.meta + (i >> 1); out[bi] |= i & 1 ? m << 4 : m; if (legLight(v) & 15) top = y + 1; }
      var li = LR.I(ex - LR.x0, ez - LR.z0, y), s = LR.sky[li], b = LR.blk[li], h = i >> 1;
      out[LEG_OFF.sky + h] |= i & 1 ? s << 4 : s; out[LEG_OFF.blk + h] |= i & 1 ? b << 4 : b;
    }
    out[LEG_OFF.hm + ((z << 4) | x)] = top;
  }
  return { bytes: out, lost: lost };
}
/* Bloco com dados no formato antigo (baús e afins com itens por número; placas com Text1 a Text4) */
function legEntity(ent, wx, wy, wz) {
  if (!ent) return null;
  var o = {}, k; for (k in ent) o[k] = ent[k];
  if (o.Items && o.Items.t === 'list') {
    o.Items = { t: 'list', of: 'compound', v: o.Items.v.map(function (it) {
      var nm = String((it.Name || {}).v || '').replace(/^minecraft:/, ''), code = BY_JAVA[nm] != null ? legCode(mkCell(BY_JAVA[nm])) : -1, n = -1;
      if (code > 0) n = code >> 4; else for (var id in LEG.i) if (LEG.i[id] === nm) { n = +id; break; }
      if (n < 0) return null;
      return { Count: it.Count, Damage: { t: 'short', v: code > 0 ? code & 15 : 0 }, Slot: it.Slot, id: { t: 'short', v: n } };
    }).filter(Boolean) };
  }
  if (o.FrontText) { var tx = String((o.FrontText.v.Text || {}).v || '').split('\n'); for (var q = 0; q < 4; q++) o['Text' + (q + 1)] = { t: 'string', v: tx[q] || '' }; delete o.FrontText; delete o.BackText; delete o.IsWaxed; }
  return wioEntTags(o, wx, wy, wz);
}
/* Escolha do modo, ao abrir um mundo antigo */
function legChooseMode(old) {
  return new Promise(function (res) {
    openDialog('<h3>Mundo no formato antigo</h3><p>Este mundo foi gravado por uma versão antiga do Minecraft Bedrock (Pocket Edition ' + (old ? '0.2 a 0.8, com o mundo de 256 × 256 blocos' : 'até a 1.0') + '): os blocos vão até a altura 127 e são guardados por número. O site lê o mundo do jeito que ele é. Ao exportar:</p>' +
      '<label class="check"><input type="radio" name="legM" value="keep" checked><span><b>Manter o formato antigo</b> (para jogar na versão antiga): o editor tem a altura 0 a 127 e os blocos da época; um bloco que não existia vira ar ao exportar (o aviso conta quantos). A luz dos chunks editados é calculada de novo.</span></label>' +
      '<label class="check"><input type="radio" name="legM" value="conv"><span><b>Converter para o formato atual</b> (para jogar na versão de hoje): o editor tem a altura 0 a 255 e todos os blocos; os chunks editados saem num formato que o jogo atual atualiza sozinho, como faz com os outros, e ao abrir ele cria a parte de baixo do mundo (-64 a 0). O mundo deixa de abrir nas versões antigas.</span></label>' +
      '<div class="row"><button class="btn primary" id="legOk">Continuar</button></div>', function () {
      $('legOk').onclick = function () { var v = (document.querySelector('[name=legM]:checked') || {}).value; closeDialog(); res(v !== 'conv'); };
    });
  });
}

/* ---------- Gravar: modo antigo ---------- */
/* As colunas antigas editadas, em blocos de 8 × 8 chunks (a luz de cada bloco é calculada com 15 blocos de folga em
   volta, para a luz que vem dos vizinhos). Tira essas colunas de cols (o resto segue o caminho do formato atual). */
async function legCommitKeep(cols, A, dim, res) {
  var tiles = new Map();
  cols.forEach(function (ys, key) {
    var p = key.split(','), ecx = +p[0], ecz = +p[1], cx = (A.x0 >> 4) + ecx, cz = (A.z0 >> 4) + ecz, col = wio.dims[dim].get(cx + ',' + cz);
    if (!col || !col.leg) return;
    var tk = (ecx >> 3) + ',' + (ecz >> 3); if (!tiles.has(tk)) tiles.set(tk, []); tiles.get(tk).push([key, ecx, ecz, cx, cz]);
  });
  res.notOld = res.notOld || 0;
  for (var T of tiles.values()) {
    var x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9;
    T.forEach(function (q) { x0 = Math.min(x0, q[1] * 16); z0 = Math.min(z0, q[2] * 16); x1 = Math.max(x1, q[1] * 16 + 16); z1 = Math.max(z1, q[2] * 16 + 16); });
    var LR = legLightRegion(Math.max(0, x0 - 15), Math.max(0, z0 - 15), Math.min(SX, x1 + 15), Math.min(SZ, z1 + 15));
    for (var t = 0; t < T.length; t++) {
      var q = T[t], ecx = q[1], ecz = q[2], cx = q[3], cz = q[4], k30 = wioKey(cx, cz, dim, 0x30), orig = await wioGet(k30);
      var r = legChunkBytes(orig, ecx, ecz, LR), nb = r.bytes; res.notOld += r.lost;
      var codeAt = function (u8, x, y, z) { if (!u8 || u8.length < LEG_OFF.sky) return 0; var i = (x << 11) | (z << 7) | y, m = u8[LEG_OFF.meta + (i >> 1)]; return (u8[i] << 4) | (i & 1 ? m >> 4 : m & 15); };
      var changed = 0; for (var i = 0; i < 32768; i++) if (!orig || orig[i] !== nb[i]) changed++;
      res.blocks += changed;
      wio.patches.set(k30, nb);
      // blocos com dados: os originais ficam onde o bloco não mudou; os do site (baús, placas) entram onde mudou
      var bk = wioKey(cx, cz, dim, 0x31), braw = await wioGet(bk), blist = []; if (braw) try { blist = nbtList(braw); } catch (e) { blist = []; }
      var keep = [], seen = new Set();
      blist.forEach(function (e) {
        var lx = e.o.x - cx * 16, lz = e.o.z - cz * 16, y = e.o.y; if (lx < 0 || lz < 0 || lx > 15 || lz > 15 || y < 0 || y > 127) { keep.push(e.raw); return; }
        var ei = idx((ecx << 4) + lx, y, (ecz << 4) + lz);
        if (codeAt(orig, lx, y, lz) === codeAt(nb, lx, y, lz) && !bentDirty.has(ei)) { keep.push(e.raw); seen.add(ei); }
      });
      bent.forEach(function (rec, ei) {
        if (seen.has(ei)) return; var p = unidx(ei); if (p[0] >> 4 !== ecx || p[2] >> 4 !== ecz || p[1] > 127) return;
        var j = beJ(ei), ent = j && beBedrockEnt(ei, j), le = legEntity(ent, cx * 16 + (p[0] & 15), p[1], cz * 16 + (p[2] & 15)); if (le) keep.push(nbtRootLE(le));
      });
      if (keep.length || braw) wio.patches.set(bk, keep.length ? wioCat(keep) : null);
      cols.delete(q[0]);
    }
  }
}
/* ---------- Gravar: modo convertido ---------- */
/* A coluna sai como um chunk da 1.17 (sub-chunks com paleta, versão 22, alturas e biomas 2D): é o formato que o jogo
   atual ainda atualiza sozinho, e na atualização ele cria a parte de baixo do mundo (-64 a 0: ardósia, cavernas e
   o resto, pela semente), igual faz com os chunks antigos que não foram editados. Se o site gravasse um chunk no
   formato de hoje, abaixo do 0 ficaria um buraco até o fundo do mundo. Conferido no servidor oficial 1.26.52. */
var LEG_CONV_VERSION = 22;
/* Todas as alturas da coluna que têm blocos (o registro antigo some e a coluna inteira sai no formato novo) */
function legAllYs(ecx, ecz, ys) { var s = new Set(ys); for (var cy = 0; cy * 16 < SY; cy++) if (W.has(ckey(ecx, cy, ecz))) s.add(cy); return Array.from(s).sort(function (a, b) { return a - b; }); }
/* Depois dos sub-chunks: troca o registro antigo pelas chaves de um chunk da 1.17 */
async function legFinishConvert(cx, cz, dim, ecx, ecz, D) {
  var raw = await wioGet(wioKey(cx, cz, dim, 0x30)), d2 = new Uint8Array(768), dv = new DataView(d2.buffer);
  for (var x = 0; x < 16; x++) for (var z = 0; z < 16; z++) {
    var top = -1; for (var y = SY - 1; y >= 0; y--) if (gget((ecx << 4) + x, y, (ecz << 4) + z)) { top = y; break; }
    var q = z * 16 + x; dv.setInt16(q * 2, top + 1, true); d2[512 + q] = raw && raw.length >= LEG_LEN ? raw[LEG_OFF.bio + q * 4] : 1;
  }
  for (var sy = 0; sy * 16 < D.h; sy++) { // sub-chunks no formato da época (versão 8: sem o byte da altura)
    var sk = wioKey(cx, cz, dim, 0x2f, sy), sb = wio.patches.get(sk);
    if (sb && sb[0] === 9) { var o = new Uint8Array(sb.length - 1); o[0] = 8; o[1] = sb[1]; o.set(sb.subarray(3), 2); wio.patches.set(sk, o); }
  }
  wio.patches.set(wioKey(cx, cz, dim, 0x30), null); wio.patches.set(wioKey(cx, cz, dim, 0x76), null);
  wio.patches.set(wioKey(cx, cz, dim, 0x2d), d2);
  wio.patches.set(wioKey(cx, cz, dim, 0x2c), new Uint8Array([LEG_CONV_VERSION]));
  wio.patches.set(wioKey(cx, cz, dim, 0x36), new Uint8Array([2, 0, 0, 0]));
}
/* O bioma pintado de um chunk do mundo antigo: nos 4 bytes de cada coluna do registro antigo (o número; a cor da grama
   fica) ou, se a coluna já saiu convertida, nos biomas 2D */
async function legBioKeep(k, cx, cz, dim) {
  var a = bioPaint.get(k), orig = bioOrig.get(k), key = wioKey(cx, cz, dim, 0x30), raw = await wioGet(key), n = 0, at = LEG_OFF.bio, st = 4;
  if (!a) return 0;
  if (!raw) { key = wioKey(cx, cz, dim, 0x2d); raw = await wioGet(key); at = 512; st = 1; if (!raw || raw.length < 768) return 0; } // já convertido: biomas 2D
  else if (raw.length < LEG_LEN) return 0;
  raw = raw.slice();
  for (var o = 0; o < 256; o++) { if (a[o] === 255) continue; raw[at + o * st] = a[o]; if (orig) orig[o] = a[o]; n++; }
  wio.patches.set(key, raw);
  return n;
}
function legBioToEdited() { wio.bioEdited.forEach(function (k) { var p = k.split(','); wio.edited.add(p[0] + ',0,' + p[1]); }); }
/* Para o mapa visto de cima: o bloco mais alto de cada coluna de um chunk antigo (q = z·16 + x); h -32768 = vazio */
function legTops(raw) {
  var v = new Int32Array(256), h = new Int16Array(256).fill(-32768), b = new Uint8Array(256).fill(255);
  if (!raw || raw.length < LEG_LEN) return { v: v, h: h, b: b };
  for (var q = 0; q < 256; q++) {
    var x = q & 15, z = q >> 4; b[q] = raw[LEG_OFF.bio + q * 4];
    for (var y = 127; y >= 0; y--) { var i = (x << 11) | (z << 7) | y; if (!raw[i]) continue; var mb = raw[LEG_OFF.meta + (i >> 1)], c = legCell((raw[i] << 4) | (i & 1 ? mb >> 4 : mb & 15)); if (!c) continue; v[q] = c; h[q] = y; break; }
  }
  return { v: v, h: h, b: b };
}

/* ---------- Mundos ainda mais antigos (Pocket Edition 0.2 a 0.8): chunks.dat e entities.dat ---------- */
/* Antes da 0.9, o mundo era limitado a 256 × 256 blocos (16 × 16 chunks) e guardado em três arquivos:
   - chunks.dat: uma tabela de 32 × 32 entradas de 4 bytes (o número de setores de 4 KB e, nos 3 bytes de cima, o
     setor onde o chunk começa; índice x + z·32) e cada chunk em 21 setores: 4 bytes de tamanho e os mesmos 82.176
     bytes do chunk 0x30 da 0.9 a 1.0 (blocos, dados, luz do céu, luz dos blocos e 256 bytes de colunas a refazer);
   - entities.dat: "ENT\0", a versão, o tamanho e um NBT com Entities (criaturas) e TileEntities (baús, placas...);
   - level.dat: como o da 0.9 em diante, com o jogador dentro (Player).
   O site monta um banco de mentira (só na memória) com uma chave 0x30 e uma 0x31 por chunk, e o resto do caminho do
   mundo antigo vale igual. Exportar mantendo o formato regrava o chunks.dat (os chunks editados) e o entities.dat
   (os blocos com dados); convertendo, sai um mundo da 0.9 (banco LevelDB com chunks 0x30), que o jogo atual atualiza
   sozinho como o de qualquer mundo antigo, no tipo de mundo Antigo (limitado), com a semente e o ponto de nascimento. */
var LEG_OLD_SECT = 4096, LEG_OLD_BODY = 82176, LEG_OLD_BIO = [1, 145, 189, 89]; // planície, com a cor da grama dela
function legOldEnt(u8) { return u8 && u8.length > 12 && u8[0] === 69 && u8[1] === 78 && u8[2] === 84 ? nbtTreeLE(u8.subarray(12)) : null; }
function legOldList(root, k) { var e = root && root.v.filter(function (q) { return q.k === k; })[0]; return e && e.t === 9 && e.v.et === 10 ? e.v.a : []; }
function legOldNum(c, k) { var e = c.filter(function (q) { return q.k === k; })[0]; return e ? e.v : null; }
async function legOldOpen(f) {
  var zip = f.zip, pre = f.prefix, cd = await zip.read(pre + 'chunks.dat'), idx = new Map(), dv = new DataView(cd.buffer, cd.byteOffset, cd.byteLength);
  var w = { file: f.blob, zip: zip, prefix: pre, db: { idx: idx, tables: [], cache: new Map(), maxFile: 0, maxSeq: 0 }, name: 'Mundo', player: null, dims: [new Map(), new Map(), new Map()], maps: [],
    patches: new Map(), cells: new Map(), entries: new Map(), pres: [], presMap: new Map(), unknown: {}, area: null, edited: new Set(), bioEdited: new Set(), bmaps: [], legacy: 0, leg: 0, old: { cd: cd, at: new Map() } };
  for (var z = 0; z < 32; z++) for (var x = 0; x < 32; x++) {
    var e = dv.getUint32((z * 32 + x) * 4, true), off = (e >>> 8) * LEG_OLD_SECT; if (!e || off + 4 + LEG_OLD_BODY > cd.length) continue;
    var v = new Uint8Array(LEG_LEN); v.set(cd.subarray(off + 4, off + 4 + LEG_OLD_BODY));
    for (var q = 0; q < 256; q++) v.set(LEG_OLD_BIO, LEG_OFF.bio + q * 4);
    idx.set(wioKey(x, z, 0, 0x30), { t: 1, f: -1, val: v }); w.old.at.set(x + ',' + z, off);
    w.dims[0].set(x + ',' + z, { x: x, z: z, ok: true, subs: [], leg: true }); w.leg++;
  }
  try { var ld = await zip.read(pre + 'level.dat'), lo = nbtRead(ld.subarray(8), true); w.old.level = ld; if (lo.LevelName) w.name = lo.LevelName; w.spawn = [lo.SpawnX | 0, lo.SpawnZ | 0];
    if (lo.Player && lo.Player.Pos) w.player = { dim: 0, x: Math.floor(lo.Player.Pos[0]), z: Math.floor(lo.Player.Pos[2]) }; } catch (e) {}
  // baús e placas (TileEntities) vão para a chave 0x31 do chunk; as criaturas (Entities) para a 0x32, que só o modo convertido grava
  try {
    var root = legOldEnt(await zip.read(pre + 'entities.dat')), by = function (tag, list, pos) {
      var m = new Map(); list.forEach(function (c) { var p = pos(c); if (!p) return; var k = wioKey(p[0] >> 4, p[1] >> 4, 0, tag); if (!m.has(k)) m.set(k, []); m.get(k).push(nbtTreeWrite({ k: '', t: 10, v: c })); });
      m.forEach(function (a, k) { idx.set(k, { t: 1, f: -1, val: wioCat(a) }); });
    };
    w.old.ent = root;
    by(0x31, legOldList(root, 'TileEntities'), function (c) { var x = legOldNum(c, 'x'), z = legOldNum(c, 'z'); return x == null ? null : [x, z]; });
    by(0x32, legOldList(root, 'Entities'), function (c) { var p = legOldNum(c, 'Pos'); if (!p || p.et !== 5) return null; var f = function (b) { return Math.floor(new DataView(b.buffer, b.byteOffset, 4).getFloat32(0, true)); }; return [f(p.a[0]), f(p.a[2])]; });
  } catch (e) {}
  return w;
}
/* O valor de uma chave do mundo (o que foi gravado ou o original) */
async function legOldVal(k) { return wio.patches.has(k) ? wio.patches.get(k) : (wio.db.idx.get(k) || {}).val || null; }
/* Exportar: no formato da época (pasta com chunks.dat) ou convertido (mundo da 0.9, que o jogo atual atualiza) */
async function legOldBuild(prog) {
  var zip = wio.zip, pre = wio.prefix, files = [];
  if (wio.legKeep) {
    var cd = wio.old.cd.slice(), dv = new DataView(cd.buffer), entCh = false;
    wio.old.at.forEach(function (off, ck) {
      var p = ck.split(','), v = wio.patches.get(wioKey(+p[0], +p[1], 0, 0x30));
      if (v) cd.set(v.subarray(0, LEG_OFF.hm), off + 4); // as 256 colunas a refazer ficam como estavam
    });
    wio.patches.forEach(function (v, k) { if (k.length === 9 && k.charCodeAt(8) === 0x31) entCh = true; });
    zip.paths.forEach(function (p) { if (p.indexOf(pre) !== 0 || /\/$/.test(p)) return; var nm = p.slice(pre.length); if (nm === 'chunks.dat' || (entCh && nm === 'entities.dat')) return; files.push(wio.files && wio.files.has(nm) ? { name: nm, data: wio.files.get(nm) } : { name: nm, src: p }); });
    files.push({ name: 'chunks.dat', data: cd });
    if (entCh) { // TileEntities de novo, com os blocos com dados de todas as chaves 0x31
      var tes = [];
      for (var k of new Set(Array.from(wio.db.idx.keys()).concat(Array.from(wio.patches.keys())))) {
        if (k.length !== 9 || k.charCodeAt(8) !== 0x31) continue; var raw = await legOldVal(k); if (!raw) continue;
        nbtList(raw).forEach(function (e) { tes.push(nbtTreeLE(e.raw).v); });
      }
      var root = wio.old.ent || { k: '', t: 10, v: [] }, rv = root.v.filter(function (q) { return q.k !== 'TileEntities'; });
      if (!rv.some(function (q) { return q.k === 'Entities'; })) rv.unshift({ k: 'Entities', t: 9, v: { et: 10, a: [] } });
      rv.push({ k: 'TileEntities', t: 9, v: { et: 10, a: tes } });
      var body = nbtTreeWrite({ k: '', t: 10, v: rv }), hd = new Uint8Array(12), hv = new DataView(hd.buffer);
      hd.set([69, 78, 84, 0]); hv.setInt32(4, 1, true); hv.setInt32(8, body.length, true);
      files.push({ name: 'entities.dat', data: wioCat([hd, body]) });
    }
    return { blob: await wioZipOut(files.map(function (f) { f.name = wioOldFolder() + '/' + f.name; return f; }), prog), keys: wio.patches.size };
  }
  // convertido: todas as chaves (chunks antigos com a versão 2 da época, os editados já no formato da 1.17)
  var keys = new Map();
  wio.db.idx.forEach(function (r, k) { keys.set(k, r.val); if (k.charCodeAt(8) === 0x30) keys.set(k.slice(0, 8) + String.fromCharCode(0x76), new Uint8Array([2])); });
  wio.patches.forEach(function (v, k) { if (v) keys.set(k, v); else keys.delete(k); });
  var ents = []; keys.forEach(function (v, k) { ents.push([k, v]); });
  ents.sort(function (a, b) { return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0; });
  files.push({ name: 'level.dat', data: legOldLevelDat() }, { name: 'levelname.txt', data: new TextEncoder().encode(wio.name) },
    { name: 'db/CURRENT', data: new TextEncoder().encode('MANIFEST-000002\n') }, { name: 'db/MANIFEST-000002', data: nwManifest(0) },
    { name: 'db/000003.log', data: ldbLogWrite(ents, 1) });
  return { blob: await wioZipOut(files, prog), keys: ents.length };
}
function wioOldFolder() { return (wio.prefix.replace(/\/$/, '').split('/').pop() || cleanName(wio.name)); }
/* level.dat do mundo convertido: o modelo do mundo novo (src/worldio.js) com o nome, a semente, o nascimento, a hora
   e o modo de jogo do mundo antigo, e o tipo de mundo Antigo (limitado a 256 × 256, como era) */
function legOldLevelDat() {
  var raw = wioBytes(atob(NW_LEVEL)), tree = nbtTreeLE(raw.subarray(8)), old = [];
  try { old = nbtTreeLE((wio.files && wio.files.get('level.dat') || wio.old.level).subarray(8)).v; } catch (e) { old = []; } // com o que o Editor NBT mudou
  var get = function (k) { var e = old.filter(function (q) { return q.k === k; })[0]; return e ? e.v : null; };
  var set = function (k, v) { if (v == null) return; tree.v.forEach(function (e) { if (e.k === k) e.v = v; }); };
  set('LevelName', wio.name); set('RandomSeed', get('RandomSeed')); set('SpawnX', get('SpawnX')); set('SpawnY', get('SpawnY')); set('SpawnZ', get('SpawnZ'));
  set('Time', get('Time')); set('GameType', get('GameType')); set('LastPlayed', nwLong(Math.floor(Date.now() / 1000))); set('currentTick', nwLong(0));
  set('Generator', 0);
  // o modelo é de um mundo criativo com comandos; o mundo antigo não tinha nada disso: fica como ele era (no criativo, marcado como o jogo marca)
  var gt = get('GameType'); set('commandsEnabled', 0); set('hasBeenLoadedInCreative', gt === 1 || wio.oldCheat ? 1 : 0); // mudado pelo Editor NBT: como o jogo marca
  var body = nbtTreeWrite(tree), hd = new Uint8Array(8), dv = new DataView(hd.buffer);
  dv.setInt32(0, new DataView(raw.buffer, raw.byteOffset).getInt32(0, true), true); dv.setInt32(4, body.length, true);
  return wioCat([hd, body]);
}
