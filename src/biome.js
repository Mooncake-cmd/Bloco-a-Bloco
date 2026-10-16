/* ---------- Biomas: pincel, cores e o que vai para o mundo ---------- */
/* O Bedrock guarda o bioma de cada bloco (chave 0x2B de cada chunk: mapa de alturas e uma paleta de biomas por
   sub-chunk). Aqui o bioma é por coluna (x, z): o pincel troca a coluna inteira, de baixo até o céu, como o jogo faz
   com o bioma da superfície. Conferido no servidor oficial 1.26: um chunk pintado de planície nevada faz nascer
   esqueletos errantes (que só nascem em bioma gelado), e a neve, a cor da grama e as criaturas seguem o bioma.
   Dois mapas por pedaço de 16 x 16 colunas: bioPaint (o que o usuário pintou: vai para o mundo ao exportar) e
   bioOrig (o que veio do mundo do jogo, só para mostrar). 255 = sem bioma. As pinceladas entram no histórico como
   mudanças de índice negativo (-(x + z * SX) - 1), com o bioma + 1 como valor. */
var BIOMES = /*%%BIOMES%%*/[];
var BIO_BY_ID = {}; BIOMES.forEach(function (b) { BIO_BY_ID[b.id] = b; });
var bioPaint = new Map(), bioOrig = new Map(), bioVer = 0, bioSaveFlag = false;
var bio = { id: 12, r: 4, sq: false, erase: false, show: false };
try { var bio0 = JSON.parse(localStorage.getItem('bloco-a-bloco-bioma') || 'null'); if (bio0) bio = Object.assign(bio, bio0); } catch (e) {}
function bioPrefs() { try { localStorage.setItem('bloco-a-bloco-bioma', JSON.stringify(bio)); } catch (e) {} }
function bioKey(cx, cz) { return cx + ',' + cz; }
function bioCol(map, x, z) { var a = map.get(bioKey(x >> 4, z >> 4)); return a ? a[((z & 15) << 4) | (x & 15)] : 255; }
function bioPainted(x, z) { var v = bioCol(bioPaint, x, z); return v === 255 ? -1 : v; }
function bioAt(x, z) { var v = bioCol(bioPaint, x, z); if (v === 255) v = bioCol(bioOrig, x, z); return v === 255 ? -1 : v; }
function bioReset() { bioPaint.clear(); bioOrig.clear(); bioVer++; bioSaveFlag = true; }
/* Grava sem histórico (o histórico chama isto ao desfazer e refazer) */
function bioSetRaw(x, z, id) {
  var k = bioKey(x >> 4, z >> 4), a = bioPaint.get(k), o = ((z & 15) << 4) | (x & 15);
  if (!a) { if (id < 0) return; a = new Uint8Array(256).fill(255); bioPaint.set(k, a); }
  a[o] = id < 0 ? 255 : id; bioVer++; bioSaveFlag = true;
  if (wio && wio.area) wio.bioEdited.add(k);
  if (id < 0 && a.every(function (v) { return v === 255; })) bioPaint.delete(k);
}
function bioSet(x, z, id) {
  var old = bioPainted(x, z); if (old === id) return false;
  bioSetRaw(x, z, id);
  if (batch) batch.add(-(x + z * SX) - 1, old + 1, id + 1);
  return true;
}
/* Desfazer/refazer: índice negativo = coluna de bioma */
function bioApplyLog(i, val) { var c = -i - 1, z = Math.floor(c / SX), x = c - z * SX; bioSetRaw(x, z, val - 1); }

/* ---------- Pincel ---------- */
function bioColumns(c, fn) {
  var r = bio.r, R2 = (r + 0.5) * (r + 0.5);
  for (var dz = -r; dz <= r; dz++) for (var dx = -r; dx <= r; dx++) {
    if (!bio.sq && dx * dx + dz * dz > R2) continue;
    var x = c[0] + dx, z = c[2] + dz; if (x < 0 || z < 0 || x >= SX || z >= SZ) continue;
    fn(x, z);
  }
}
function bioTarget(t) { return t && (t.hit || t.place); }
function bioApply(t) {
  var c = bioTarget(t); if (!c) return 0;
  var n = 0, id = bio.erase ? -1 : bio.id;
  bioColumns(c, function (x, z) { if (bioSet(x, z, id)) n++; });
  if (stroke) stroke.n = (stroke.n || 0) + n;
  if (n) bioChanged();
  return n;
}
function bioStart(t, shift) {
  var c = bioTarget(t); if (!c) return;
  if (shift) { // conta-gotas: o bioma da coluna
    var b = bioAt(c[0], c[2]); if (b < 0) { toast('Esta coluna não tem bioma definido.'); return; }
    bio.id = b; bio.erase = false; bioPrefs(); updateBioChip(); toast('Bioma: ' + BIO_BY_ID[b].pt); return;
  }
  stroke = { mode: 'biome', cells: new Set(), n: 0 }; beginBatch('Pincel de bioma'); bioApply(t); stroke.last = c.join(); stroke.on = true;
}
function bioDrag(t) { var c = bioTarget(t); if (!c || c.join() === stroke.last) return; bioApply(t); stroke.last = c.join(); }
function bioEnd(sm) { if (sm.n) toast(sm.n.toLocaleString('pt-BR') + ' colunas ' + (bio.erase ? 'voltaram ao bioma original' : 'com o bioma ' + BIO_BY_ID[bio.id].pt) + '.'); }
/* Aplicar na seleção (as colunas da área marcada) */
function bioFillSel() {
  if (!sel) { toast('Marque uma área com Selecionar (V) primeiro.'); return; }
  var id = bio.erase ? -1 : bio.id, n = 0;
  beginBatch('Bioma na seleção');
  for (var z = sel.a[2]; z <= sel.b[2]; z++) for (var x = sel.a[0]; x <= sel.b[0]; x++) if (bioSet(x, z, id)) n++;
  endBatch(); bioChanged();
  toast(n ? n.toLocaleString('pt-BR') + ' colunas ' + (id < 0 ? 'voltaram ao original.' : 'com o bioma ' + BIO_BY_ID[id].pt + '.') : 'A seleção já estava com esse bioma.');
}
function bioChanged() { bioVer++; requestRender(); updateStatus(); }

/* ---------- Aviso do canto ---------- */
function bioClimate(b) { return (b.rain === 2 ? 'neva' : b.rain === 1 ? 'chove' : 'sem chuva') + ', temperatura ' + String(b.t).replace('.', ','); }
var BIO_GROUPS = [['Superfície', function (b) { return b.dim === 0 && !/ocean|river|beach|shore/.test(b.n) && b.tags.indexOf('caves') < 0 && !/lush_caves|dripstone|deep_dark|sulfur_caves/.test(b.n); }],
  ['Água e praia', function (b) { return b.dim === 0 && /ocean|river|beach|shore/.test(b.n); }],
  ['Cavernas', function (b) { return /lush_caves|dripstone|deep_dark|sulfur_caves/.test(b.n); }], ['Nether', function (b) { return b.dim === 1; }], ['End', function (b) { return b.dim === 2; }]];
function bioOptions(sel) {
  return BIO_GROUPS.map(function (g) {
    return '<optgroup label="' + g[0] + '">' + BIOMES.filter(g[1]).map(function (b) { return '<option value="' + b.id + '"' + (b.id === sel ? ' selected' : '') + '>' + esc(b.pt) + '</option>'; }).join('') + '</optgroup>';
  }).join('');
}
function bioSw(b) { return '<span class="bsw" style="background:#' + ('00000' + b.map.toString(16)).slice(-6) + '"></span>'; }
function updateBioChip() {
  var c = $('bioChip'), on = tool === 'biome';
  c.hidden = !on; $('bioShow').textContent = 'Mostrar biomas: ' + (bio.show ? 'sim' : 'não');
  if (!on) return;
  if ($('bioSel').dataset.v !== String(bio.id)) { $('bioSel').innerHTML = bioOptions(bio.id); $('bioSel').dataset.v = String(bio.id); }
  var b = BIO_BY_ID[bio.id];
  $('bioInfo').innerHTML = bio.erase ? 'apaga o que foi pintado (volta ao bioma original)' : bioSw(b) + esc(bioClimate(b));
  $('bioR').textContent = bio.r;
  c.querySelectorAll('[data-bs]').forEach(function (x) { x.setAttribute('aria-pressed', String((x.getAttribute('data-bs') === 'sq') === bio.sq)); });
  $('bioErase').setAttribute('aria-pressed', String(bio.erase));
  $('bioFill').disabled = !sel;
}
function setBioR(r) { bio.r = Math.max(0, Math.min(32, r)); bioPrefs(); updateBioChip(); updatePreview(); }
$('bioChip').addEventListener('click', function (e) {
  var b = e.target.closest('button'); if (!b) return;
  if (b.hasAttribute('data-bs')) bio.sq = b.getAttribute('data-bs') === 'sq';
  else if (b.id === 'bioMinus') return setBioR(bio.r - 1);
  else if (b.id === 'bioPlus') return setBioR(bio.r + 1);
  else if (b.id === 'bioErase') bio.erase = !bio.erase;
  else if (b.id === 'bioFill') return bioFillSel();
  bioPrefs(); updateBioChip(); updatePreview();
});
$('bioSel').addEventListener('change', function (e) { bio.id = +e.target.value; bio.erase = false; e.target.dataset.v = String(bio.id); bioPrefs(); updateBioChip(); });
$('bioShow').addEventListener('click', function () { bio.show = !bio.show; bioPrefs(); updateBioChip(); requestRender(); $('menu').open = false; toast(bio.show ? 'Biomas à vista: cada coluna com bioma ganha uma placa colorida em cima (Y, o pincel de bioma, também mostra).' : 'Biomas escondidos (aparecem com o pincel de bioma).', 5000); });
/* Prévia: o contorno do pincel na altura do alvo */
function bioPreview(t, accent) {
  var c = bioTarget(t); if (!c) return;
  var d = 2 * bio.r + 1;
  ghostEdges.material.color.copy(accent); ghostEdges.scale.set(d, 1.02, d); setBoxAt(ghostEdges, c); ghostEdges.visible = true;
}

/* ---------- Biomas à vista: uma placa colorida em cima de cada coluna com bioma ---------- */
var bioInst = null, bioKeyDrawn = '', BIO_MAX = 600000;
/* Altura do topo de cada coluna de um pedaço 16 x 16 (-1 = coluna vazia) */
function bioTops(cx, cz) {
  var tops = new Int32Array(256).fill(-1), left = 256, top = (SY - 1) >> 4;
  for (var cy = top; cy >= 0 && left; cy--) {
    var ch = W.get(ckey(cx, cy, cz)); if (!ch) continue;
    for (var o = 0; o < 256; o++) {
      if (tops[o] >= 0) continue;
      for (var ly = 15; ly >= 0; ly--) { var v = ch.d ? ch.pal[ch.d[(ly << 8) | o]] : ch.u; if (v) { tops[o] = (cy << 4) + ly; left--; break; } }
    }
  }
  return tops;
}
function updateBioView() {
  if (!scene) return;
  var on = bio.show || tool === 'biome', key = on ? bioVer + '|' + verCounter + '|' + (layerOn ? layerY : -1) : '';
  if (key === bioKeyDrawn) return;
  // as placas acompanham o topo das colunas: refaz no máximo a cada 250 ms enquanto se constrói
  var now = performance.now(); if (key && bioKeyDrawn && now - (updateBioView.t || 0) < 250) { requestRender(); return; }
  updateBioView.t = now; bioKeyDrawn = key;
  if (!bioInst) {
    var g = new THREE.PlaneGeometry(1, 1); g.rotateX(-Math.PI / 2);
    bioInst = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide }), BIO_MAX);
    bioInst.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(BIO_MAX * 3), 3);
    bioInst.frustumCulled = false; bioInst.renderOrder = 4; scene.add(bioInst);
  }
  var n = 0;
  if (on) {
    var m = new THREE.Matrix4(), col = new THREE.Color(), keys = new Set(), lim = layerOn ? layerY : SY - 1;
    bioPaint.forEach(function (a, k) { keys.add(k); }); bioOrig.forEach(function (a, k) { keys.add(k); });
    keys.forEach(function (k) {
      if (n >= BIO_MAX) return;
      var p = k.split(','), cx = +p[0], cz = +p[1], tops = bioTops(cx, cz), A = bioPaint.get(k), B = bioOrig.get(k);
      for (var o = 0; o < 256 && n < BIO_MAX; o++) {
        var id = A ? A[o] : 255; if (id === 255) id = B ? B[o] : 255; if (id === 255) continue;
        var x = (cx << 4) + (o & 15), z = (cz << 4) + (o >> 4); if (x >= SX || z >= SZ) continue;
        var y = Math.min(tops[o], lim) + 1.03;
        m.setPosition(x + 0.5, y, z + 0.5); bioInst.setMatrixAt(n, m);
        var c = BIO_BY_ID[id] ? BIO_BY_ID[id].map : 0x888888; col.setHex(c); bioInst.setColorAt(n, col); n++;
      }
    });
  }
  bioInst.count = n; bioInst.instanceMatrix.needsUpdate = true; bioInst.instanceColor.needsUpdate = true;
  requestRender();
}
/* Biomas presentes (para a legenda): id -> colunas */
function bioCount() {
  var c = {};
  var add = function (a, b) { for (var o = 0; o < 256; o++) { var id = a ? a[o] : 255; if (id === 255 && b) id = b[o]; if (id !== 255) c[id] = (c[id] || 0) + 1; } };
  var keys = new Set(); bioPaint.forEach(function (a, k) { keys.add(k); }); bioOrig.forEach(function (a, k) { keys.add(k); });
  keys.forEach(function (k) { add(bioPaint.get(k), bioOrig.get(k)); });
  return c;
}

/* ---------- Guardar: projeto (.json) e salvamento automático ---------- */
function bioRecord() { var o = {}; bioPaint.forEach(function (a, k) { o[k] = b64(a); }); return o; }
function bioFromRecord(o) { bioPaint.clear(); if (o) Object.keys(o).forEach(function (k) { bioPaint.set(k, unb64(o[k])); }); bioVer++; }

/* ---------- Mundo do jogo: ler e gravar a chave 0x2B (Data3D) ---------- */
/* Lê os 24 (ou 8 no Nether, 16 no End) armazenamentos de bioma; devolve { hm: Int16Array(256), subs: [Uint8Array(4096) de ids] } */
function bioDecode3D(u8) {
  var dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), hm = new Int16Array(256), p = 512, subs = [], prev = null;
  for (var i = 0; i < 256; i++) hm[i] = dv.getInt16(i * 2, true);
  while (p < u8.length) {
    var h = u8[p++];
    if (h === 0xFF) { subs.push(prev); continue; }
    var bits = h >> 1, ids = new Uint8Array(4096);
    if (!bits) { ids.fill(Math.min(254, dv.getInt32(p, true))); p += 4; }
    else {
      var per = Math.floor(32 / bits), nw = Math.ceil(4096 / per), idx = new Uint16Array(4096), mask = (1 << bits) - 1, k = 0;
      for (var w = 0; w < nw; w++) { var word = dv.getUint32(p + w * 4, true); for (var j = 0; j < per && k < 4096; j++, k++) idx[k] = (word >>> (j * bits)) & mask; }
      p += nw * 4; var n = dv.getInt32(p, true); p += 4; var pal = [];
      for (var q = 0; q < n; q++) { pal.push(Math.min(254, dv.getInt32(p, true))); p += 4; }
      for (k = 0; k < 4096; k++) ids[k] = pal[idx[k]] || 0;
    }
    subs.push(ids); prev = ids;
  }
  return { hm: hm, subs: subs };
}
function bioEncode3D(hm, subs) {
  var parts = [], h = new Uint8Array(512), dv = new DataView(h.buffer);
  for (var i = 0; i < 256; i++) dv.setInt16(i * 2, hm[i], true);
  parts.push(h);
  var prevKey = null;
  subs.forEach(function (ids) {
    var key = ids.join(','); if (key === prevKey) { parts.push(new Uint8Array([0xFF])); return; } prevKey = key;
    var pal = [], map = new Map();
    for (var k = 0; k < 4096; k++) if (!map.has(ids[k])) { map.set(ids[k], pal.length); pal.push(ids[k]); }
    if (pal.length === 1) { var s = new Uint8Array(5); s[0] = 1; new DataView(s.buffer).setInt32(1, pal[0], true); parts.push(s); return; }
    var need = Math.max(1, Math.ceil(Math.log2(pal.length))), bits = [1, 2, 3, 4, 5, 6, 8, 16].filter(function (b) { return b >= need; })[0];
    var per = Math.floor(32 / bits), nw = Math.ceil(4096 / per), wd = new Uint32Array(nw);
    for (k = 0; k < 4096; k++) wd[Math.floor(k / per)] |= map.get(ids[k]) << ((k % per) * bits);
    var b = new Uint8Array(1 + nw * 4 + 4 + pal.length * 4), bv = new DataView(b.buffer);
    b[0] = (bits << 1) | 1; for (k = 0; k < nw; k++) bv.setUint32(1 + k * 4, wd[k], true);
    bv.setInt32(1 + nw * 4, pal.length, true); pal.forEach(function (id, q) { bv.setInt32(5 + nw * 4 + q * 4, id, true); });
    parts.push(b);
  });
  return wioCat(parts);
}
/* Na área carregada: o bioma de cada coluna na altura do topo (o que aparece no mapa de alturas) */
function bioFromWorld(d3, ecx, ecz) {
  var r = bioDecode3D(d3), a = new Uint8Array(256).fill(255);
  for (var x = 0; x < 16; x++) for (var z = 0; z < 16; z++) {
    var hy = Math.max(0, r.hm[z * 16 + x] - 1), s = r.subs[hy >> 4] || r.subs[r.subs.length - 1];
    if (s) a[(z << 4) | x] = s[(x << 8) | (z << 4) | (hy & 15)];
  }
  bioOrig.set(bioKey(ecx, ecz), a);
}
/* Grava as colunas pintadas na chave 0x2B dos chunks da área (todas as alturas da coluna) */
async function bioCommit() {
  if (!wio || !wio.area || !wio.bioEdited.size) return 0;
  var A = wio.area, dim = A.dim, D = WIO_DIMS[dim], nsub = D.h >> 4, n = 0;
  for (var k of wio.bioEdited) {
    var p = k.split(','), ecx = +p[0], ecz = +p[1], cx = (A.x0 >> 4) + ecx, cz = (A.z0 >> 4) + ecz, col = wio.dims[dim].get(cx + ',' + cz);
    if (!col || !col.ok) continue; // chunk não gerado: o jogo refaria o bioma ao gerar
    var hk = wioKey(cx, cz, dim, 0x2b), d3 = await wioGet(hk), r;
    if (d3 && d3.length >= 512) r = bioDecode3D(d3);
    else r = { hm: new Int16Array(256), subs: [] };
    while (r.subs.length < nsub) r.subs.push(new Uint8Array(4096).fill(r.subs.length ? r.subs[r.subs.length - 1][0] : 1));
    r.subs = r.subs.map(function (s) { return s.slice(); });
    var a = bioPaint.get(k), orig = bioOrig.get(k); if (!a) continue;
    for (var o = 0; o < 256; o++) {
      if (a[o] === 255) continue;
      var x = o & 15, z = o >> 4;
      for (var s = 0; s < r.subs.length; s++) for (var y = 0; y < 16; y++) r.subs[s][(x << 8) | (z << 4) | y] = a[o];
      if (orig) orig[o] = a[o];
      n++;
    }
    wio.patches.set(hk, bioEncode3D(r.hm, r.subs));
  }
  wio.bioEdited.clear(); if (wio.maps) wio.maps[dim] = null; if (wio.bmaps) wio.bmaps[dim] = null;
  return n;
}
