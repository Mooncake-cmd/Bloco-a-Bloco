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
var bio = { id: 12, r: 4, sq: false, erase: false, show: false, terra: true };
try { var bio0 = JSON.parse(localStorage.getItem('bloco-a-bloco-bioma') || 'null'); if (bio0) bio = Object.assign(bio, bio0); } catch (e) {}
function bioPrefs() { try { localStorage.setItem('bloco-a-bloco-bioma', JSON.stringify(bio)); } catch (e) {} }
function bioKey(cx, cz) { return cx + ',' + cz; }
function bioCol(map, x, z) { var a = map.get(bioKey(x >> 4, z >> 4)); return a ? a[((z & 15) << 4) | (x & 15)] : 255; }
function bioPainted(x, z) { var v = bioCol(bioPaint, x, z); return v === 255 ? -1 : v; }
function bioAt(x, z) { if (!bioPaint.size && !bioOrig.size) return -1; var v = bioCol(bioPaint, x, z); if (v === 255) v = bioCol(bioOrig, x, z); return v === 255 ? -1 : v; }
function bioReset() { bioPaint.clear(); bioOrig.clear(); bioVer++; bioSaveFlag = true; }
/* Cor da grama, das folhas e da água pelo bioma da coluna: as texturas tingidas (com a cor padrão do pacote) são
   multiplicadas pela razão cor do bioma / cor padrão; as formas (capim, cipó, água) recebem a cor do bioma direto.
   0 = coluna sem bioma ou cor que não depende do bioma (folhas de abeto e de bétula, por exemplo). */
var BIO_TINT_KIND = { 9551193: 'grass', 7842607: 'foliage', 4159204: 'water' };
function bioTint(def, x, z) { var k = BIO_TINT_KIND[def]; if (!k) return 0; var id = bioAt(x, z); if (id < 0) return 0; var e = BIO_BY_ID[id]; return e ? e[k] : 0; }
function bioTintRatio(def, x, z) { var c = bioTint(def, x, z); if (!c || c === def) return null; return [(c >> 16 & 255) / (def >> 16 & 255), (c >> 8 & 255) / (def >> 8 & 255), (c & 255) / (def & 255)]; }
/* Coluna mudou de bioma: refaz a malha dos pedaços dela (a cor muda) */
function bioRemesh(x, z) { var cx = x >> 4, cz = z >> 4; for (var cy = 0; cy * 16 < SY; cy++) if (W.has(ckey(cx, cy, cz))) dirty.add(cx + ',' + cy + ',' + cz); }
/* Grava sem histórico (o histórico chama isto ao desfazer e refazer) */
function bioSetRaw(x, z, id) {
  var k = bioKey(x >> 4, z >> 4), a = bioPaint.get(k), o = ((z & 15) << 4) | (x & 15);
  if (!a) { if (id < 0) return; a = new Uint8Array(256).fill(255); bioPaint.set(k, a); }
  a[o] = id < 0 ? 255 : id; bioVer++; bioSaveFlag = true; bioRemesh(x, z);
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
  var n = 0, id = bio.erase ? -1 : bio.id, cols = [];
  bioColumns(c, function (x, z) { if (bioSet(x, z, id)) { n++; cols.push(x, z); } });
  if (stroke) stroke.n = (stroke.n || 0) + n;
  if (id >= 0 && bio.terra && cols.length) bioTerra(cols, id, stroke);
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
function bioEnd(sm) { if (sm.n) toast(sm.n.toLocaleString('pt-BR') + ' colunas ' + (bio.erase ? 'voltaram ao bioma original' : 'com o bioma ' + BIO_BY_ID[bio.id].pt) + bioTerraTxt(sm.terra) + '.', 5000); }
/* Aplicar na seleção (as colunas da área marcada) */
function bioFillSel() {
  if (!sel) { toast('Marque uma área com Selecionar (V) primeiro.'); return; }
  var id = bio.erase ? -1 : bio.id, n = 0, cols = [], st = {};
  beginBatch('Bioma na seleção');
  for (var z = sel.a[2]; z <= sel.b[2]; z++) for (var x = sel.a[0]; x <= sel.b[0]; x++) if (bioSet(x, z, id)) { n++; cols.push(x, z); }
  if (id >= 0 && bio.terra && cols.length) bioTerra(cols, id, st);
  endBatch(); bioChanged();
  toast(n ? n.toLocaleString('pt-BR') + ' colunas ' + (id < 0 ? 'voltaram ao original' : 'com o bioma ' + BIO_BY_ID[id].pt) + bioTerraTxt(st.terra) + '.' : 'A seleção já estava com esse bioma.', 5000);
}
function bioChanged() { bioVer++; requestRender(); updateStatus(); }

/* ---------- Transformar o terreno pelo bioma ---------- */
/* Com "Transformar o terreno" ligado, cada coluna que muda de bioma ganha o chão, a cobertura e a vegetação do bioma,
   como o jogo gera: deserto vira areia sobre arenito, com cactos e arbustos secos; a planície nevada ganha neve e a
   água vira gelo; a selva, árvores da selva e samambaias... Só mexe no "chão natural" (grama, terra, areia, neve,
   terracota, netherrack...) e nas plantas soltas; construções (tábuas, pedra, tijolos...) e troncos ficam como estão.
   Tudo entra no mesmo passo do histórico que a pincelada. */
var BIO_GROUND = /^(grass_block|dirt|coarse_dirt|podzol|mycelium|sand|red_sand|sandstone|red_sandstone|mud|snow_block|powder_snow|rooted_dirt|moss_block|pale_moss_block|gravel|clay|calcite|packed_ice|netherrack|crimson_nylium|warped_nylium|soul_sand|soul_soil|end_stone|terracotta|(white|orange|yellow|brown|red|light_gray)_terracotta)$/;
var BIO_PLANT = /^(short_grass|tall_grass|fern|large_fern|dead_bush|short_dry_grass|tall_dry_grass|bush|firefly_bush|leaf_litter|snow|sweet_berry_bush|cactus|cactus_flower|bamboo|bamboo_sapling|lily_pad|moss_carpet|pale_moss_carpet|pale_hanging_moss|pink_petals|wildflowers|sunflower|lilac|rose_bush|peony|poppy|dandelion|blue_orchid|allium|azure_bluet|(red|orange|white|pink)_tulip|oxeye_daisy|cornflower|lily_of_the_valley|torchflower|open_eyeblossom|closed_eyeblossom|brown_mushroom|red_mushroom|crimson_roots|warped_roots|nether_sprouts|crimson_fungus|warped_fungus|twisting_vines|weeping_vines|sugar_cane|melon|pumpkin)$/;
var BIO_FLOWERS = ['poppy', 'dandelion', 'allium', 'azure_bluet', 'red_tulip', 'orange_tulip', 'white_tulip', 'pink_tulip', 'oxeye_daisy', 'cornflower', 'lily_of_the_valley'];
var MESA_BANDS = ['terracotta', 'orange_terracotta', 'terracotta', 'yellow_terracotta', 'brown_terracotta', 'terracotta', 'red_terracotta', 'white_terracotta', 'orange_terracotta', 'light_gray_terracotta', 'terracotta', 'red_terracotta', 'orange_terracotta', 'terracotta', 'yellow_terracotta', 'white_terracotta'];
/* Receita de cada bioma: camadas do chão (de cima para baixo; função = escolha por coluna), neve, gelo na água,
   árvores [muda, chance por coluna, 2 × 2], plantas [bloco, chance] e enfeites especiais */
function bioRecipe(b) {
  var n = b.n, G = ['grass_block', 'dirt', 'dirt'], snow = b.rain === 2, R;
  var grass = function (p) { return [['short_grass', p]]; };
  if (/lush_caves|dripstone|deep_dark|sulfur_caves/.test(n)) return null; // biomas de caverna: só o bioma
  if (n === 'desert' || n === 'desert_hills' || n === 'desert_mutated') R = { layers: ['sand', 'sand', 'sand', 'sandstone', 'sandstone'], plants: [['dead_bush', 0.012]], cactus: 0.01 };
  else if (/^mesa/.test(n)) R = n === 'mesa_plateau_stone' || n === 'mesa_plateau_stone_mutated'
    ? { layers: [function () { return Math.random() < 0.5 ? 'coarse_dirt' : 'grass_block'; }, 'dirt', 'mesa'], trees: [['oak_sapling', 0.01]], plants: grass(0.1) }
    : { layers: ['red_sand', 'mesa', 'mesa', 'mesa', 'mesa', 'mesa', 'mesa', 'mesa'], plants: [['dead_bush', 0.01]], cactus: 0.004 };
  else if (n === 'beach' || /ocean$/.test(n) && /warm|lukewarm/.test(n)) R = { layers: ['sand', 'sand', 'sand', 'sandstone'] };
  else if (n === 'cold_beach') R = { layers: ['sand', 'sand', 'sand', 'sandstone'] };
  else if (n === 'stone_beach') R = { layers: ['stone', 'stone', 'stone'] };
  else if (n === 'river' || n === 'frozen_river') R = { layers: ['sand', 'sand', 'clay'] };
  else if (/ocean/.test(n)) R = { layers: ['gravel', 'gravel', 'gravel'] };
  else if (n === 'mushroom_island' || n === 'mushroom_island_shore') R = { layers: ['mycelium', 'dirt', 'dirt'], plants: [['red_mushroom', 0.012], ['brown_mushroom', 0.012]], trees: [['red_mushroom', 0.003], ['brown_mushroom', 0.003]] };
  else if (n === 'ice_plains_spikes') R = { layers: ['snow_block', 'snow_block', 'dirt'], spikes: 0.004 };
  else if (n === 'jagged_peaks' || n === 'frozen_peaks') R = { layers: [function () { return Math.random() < 0.25 ? 'packed_ice' : 'snow_block'; }, 'snow_block', 'stone'] };
  else if (n === 'snowy_slopes') R = { layers: [function () { return Math.random() < 0.15 ? 'powder_snow' : 'snow_block'; }, 'snow_block', 'stone'] };
  else if (n === 'stony_peaks') R = { layers: [function () { return Math.random() < 0.25 ? 'calcite' : 'stone'; }, 'stone', 'stone'] };
  else if (n === 'extreme_hills_mutated') R = { layers: [function () { return Math.random() < 0.6 ? 'gravel' : 'grass_block'; }, 'dirt', 'stone'], trees: [['spruce_sapling', 0.004]] };
  else if (/^extreme_hills/.test(n)) R = { layers: G, trees: [['spruce_sapling', /trees/.test(n) ? 0.02 : 0.003], ['oak_sapling', /trees/.test(n) ? 0.01 : 0.002]], plants: grass(0.15) };
  else if (n === 'swampland' || n === 'swampland_mutated') R = { layers: G, trees: [['oak_sapling', 0.012]], plants: [['blue_orchid', 0.02], ['short_grass', 0.25]], lily: 0.12 };
  else if (n === 'mangrove_swamp') R = { layers: ['mud', 'mud', 'mud', 'dirt'], trees: [['mangrove_propagule', 0.03]], lily: 0.08 };
  else if (n === 'flower_forest') R = { layers: G, trees: [['oak_sapling', 0.02], ['birch_sapling', 0.008]], plants: [['flowers', 0.3], ['short_grass', 0.1]] };
  else if (/^birch_forest/.test(n)) R = { layers: G, trees: [['birch_sapling', 0.05]], plants: [['short_grass', 0.2], ['flowers', 0.02]] };
  else if (/^roofed_forest/.test(n)) R = { layers: G, trees: [['dark_oak_sapling', 0.04, 1], ['oak_sapling', 0.01]], plants: [['short_grass', 0.1], ['red_mushroom', 0.01], ['brown_mushroom', 0.01]] };
  else if (n === 'pale_garden') R = { layers: G, trees: [['pale_oak_sapling', 0.035, 1]], plants: [['pale_moss_carpet', 0.15], ['short_grass', 0.05]] };
  else if (/^forest|^dappled_forest/.test(n)) R = { layers: G, trees: [['oak_sapling', 0.04], ['birch_sapling', 0.01]], plants: [['short_grass', 0.2], ['flowers', 0.02], ['leaf_litter', n === 'dappled_forest' ? 0.08 : 0]] };
  else if (/^mega_taiga|^redwood_taiga/.test(n)) R = { layers: [function () { var r = Math.random(); return r < 0.5 ? 'podzol' : r < 0.75 ? 'coarse_dirt' : 'grass_block'; }, 'dirt', 'dirt'], trees: [['spruce_sapling', 0.02, 1], ['spruce_sapling', 0.02]], plants: [['fern', 0.15], ['sweet_berry_bush', 0.01], ['brown_mushroom', 0.005]] };
  else if (/taiga/.test(n)) R = { layers: G, trees: [['spruce_sapling', 0.05]], plants: [['fern', 0.15], ['short_grass', 0.1], ['sweet_berry_bush', 0.008]] };
  else if (n === 'grove') R = { layers: G, trees: [['spruce_sapling', 0.035]] };
  else if (n === 'bamboo_jungle' || n === 'bamboo_jungle_hills') R = { layers: [function () { return Math.random() < 0.4 ? 'podzol' : 'grass_block'; }, 'dirt', 'dirt'], trees: [['jungle_sapling', 0.015]], bamboo: 0.15, plants: [['fern', 0.15]] };
  else if (/^jungle_edge/.test(n)) R = { layers: G, trees: [['jungle_sapling', 0.015], ['oak_sapling', 0.008]], plants: [['fern', 0.15], ['short_grass', 0.2]] };
  else if (/^jungle/.test(n)) R = { layers: G, trees: [['jungle_sapling', 0.01, 1], ['jungle_sapling', 0.05], ['oak_sapling', 0.01]], plants: [['fern', 0.2], ['short_grass', 0.2], ['melon', 0.003]] };
  else if (/^savanna/.test(n)) R = { layers: G, trees: [['acacia_sapling', 0.008], ['oak_sapling', 0.002]], plants: [['short_grass', 0.4]] };
  else if (n === 'cherry_grove') R = { layers: G, trees: [['cherry_sapling', 0.02]], plants: [['pink_petals', 0.15], ['short_grass', 0.15]] };
  else if (n === 'meadow') R = { layers: G, trees: [['oak_sapling', 0.001]], plants: [['short_grass', 0.4], ['flowers', 0.15]] };
  else if (n === 'sunflower_plains' || n === 'plains') R = { layers: G, trees: [['oak_sapling', 0.002]], plants: [['short_grass', 0.3], ['flowers', n === 'plains' ? 0.02 : 0.06], ['pumpkin', 0.0005]] };
  else if (n === 'ice_plains' || n === 'ice_mountains') R = { layers: G, trees: [['spruce_sapling', 0.004]] };
  else if (n === 'hell') R = { layers: ['netherrack', 'netherrack', 'netherrack'] };
  else if (n === 'crimson_forest') R = { layers: ['crimson_nylium', 'netherrack', 'netherrack'], trees: [['crimson_fungus', 0.02]], plants: [['crimson_roots', 0.15], ['crimson_fungus', 0.02]] };
  else if (n === 'warped_forest') R = { layers: ['warped_nylium', 'netherrack', 'netherrack'], trees: [['warped_fungus', 0.02]], plants: [['warped_roots', 0.15], ['warped_fungus', 0.02], ['nether_sprouts', 0.05]] };
  else if (n === 'soulsand_valley') R = { layers: [function () { return Math.random() < 0.5 ? 'soul_sand' : 'soul_soil'; }, 'soul_soil', 'netherrack'] };
  else if (n === 'basalt_deltas') R = { layers: [function () { var r = Math.random(); return r < 0.5 ? 'basalt' : r < 0.95 ? 'blackstone' : 'magma_block'; }, 'basalt', 'netherrack'] };
  else if (n === 'the_end') R = { layers: ['end_stone', 'end_stone', 'end_stone'] };
  else R = { layers: G, plants: grass(0.2) };
  R.snow = snow && !/peaks|slopes|spikes/.test(n); R.ice = snow;
  return R;
}
var bioRecipeCache = {};
function bioCell(nm, y) { return cellFromName(nm === 'mesa' ? MESA_BANDS[((y % 16) + 16) % 16] : nm === 'flowers' ? BIO_FLOWERS[Math.floor(Math.random() * BIO_FLOWERS.length)] : nm); }
function bioJ(v) { return v ? BLOCKS[cellBlock(v)].java : ''; }
function bioFreeAt(x, y, z) { if (x < 0 || z < 0 || x >= SX || z >= SZ || y >= SY) return false; var v = gget(x, y, z); return !v || BIO_PLANT.test(bioJ(v)); }
/* cols = [x0, z0, x1, z1, ...]; st recebe as contagens (st.terra) */
function bioTerra(cols, id, st) {
  var b = BIO_BY_ID[id]; if (!b) return;
  var R = bioRecipeCache[id] || (bioRecipeCache[id] = bioRecipe(b) || 0); if (!R) return;
  var T = st.terra || (st.terra = { chao: 0, arvores: 0, plantas: 0, neve: 0, gelo: 0, cactos: 0 });
  var top0 = Math.min(SY - 1, layerMax()), saved = symBusy, grow = [];
  symBusy = true; // a simetria não espelha o terreno (o bioma não é espelhado)
  try {
    for (var i = 0; i < cols.length; i += 2) {
      var x = cols[i], z = cols[i + 1], y, v, j, leaves = false, plants = [];
      for (y = top0; y >= 0; y--) {
        v = gget(x, y, z); if (!v) continue; j = bioJ(v);
        if (BIO_PLANT.test(j)) { plants.push(y); continue; }
        if (/leaves$/.test(j)) { leaves = true; continue; }
        break;
      }
      if (y < 0) continue;
      var water = j === 'water';
      if (!water && !BIO_GROUND.test(j)) continue; // construção, tronco, pedra: não mexe
      plants.forEach(function (py) { editSet(x, py, z, 0); });
      if (water) {
        if (R.ice) { editSet(x, y, z, cellFromName('ice')); T.gelo++; }
        else if (R.lily && Math.random() < R.lily && bioFreeAt(x, y + 1, z)) { editSet(x, y + 1, z, cellFromName('lily_pad')); T.plantas++; }
        continue;
      }
      for (var k = 0; k < R.layers.length && y - k >= 0; k++) {
        var cv = gget(x, y - k, z); if (!BIO_GROUND.test(bioJ(cv))) break;
        var L = R.layers[k], nv = bioCell(typeof L === 'function' ? L() : L, y - k);
        if (nv && nv !== cv) { editSet(x, y - k, z, nv); T.chao++; }
      }
      if (leaves || y + 1 > top0 || !bioFreeAt(x, y + 1, z)) continue;
      var r = Math.random(), acc = 0, done = false;
      (R.trees || []).forEach(function (t) { if (done) return; acc += t[1]; if (r < acc) { grow.push([x, y + 1, z, t[0], t[2]]); done = true; } });
      if (done) continue;
      if (R.cactus) { acc += R.cactus; if (r < acc) { if (bioFreeAt(x + 1, y + 1, z) && bioFreeAt(x - 1, y + 1, z) && bioFreeAt(x, y + 1, z + 1) && bioFreeAt(x, y + 1, z - 1)) { var hc = 1 + Math.floor(Math.random() * 3); for (k = 1; k <= hc && y + k <= top0; k++) editSet(x, y + k, z, cellFromName('cactus')); T.cactos++; } continue; } }
      if (R.bamboo) { acc += R.bamboo; if (r < acc) { var hb = 4 + Math.floor(Math.random() * 8); for (k = 1; k <= hb && y + k <= top0 && bioFreeAt(x, y + k, z); k++) editSet(x, y + k, z, cellFromName('bamboo')); T.plantas++; continue; } }
      if (R.spikes) { acc += R.spikes; if (r < acc) { var hs = 4 + Math.floor(Math.random() * 10); for (k = 1; k <= hs && y + k <= top0; k++) editSet(x, y + k, z, cellFromName('packed_ice')); T.gelo++; continue; } }
      (R.plants || []).forEach(function (p) { if (done || !p[1]) return; acc += p[1]; if (r < acc) { var pv = bioCell(p[0], y + 1); if (pv) { editSet(x, y + 1, z, pv); T.plantas++; } done = true; } });
      if (!done && R.snow) { editSet(x, y + 1, z, cellFromName('snow')); T.neve++; }
    }
    // árvores depois do chão, para o tronco nascer na terra já trocada; 2 × 2 = quatro mudas em quadrado
    grow.forEach(function (g) {
      var x = g[0], y = g[1], z = g[2], sv = cellFromName(g[3]), pts = g[4] ? [[0, 0], [1, 0], [0, 1], [1, 1]] : [[0, 0]];
      if (!sv) return;
      for (var q = 0; q < pts.length; q++) { var px = x + pts[q][0], pz = z + pts[q][1]; if (!bioFreeAt(px, y, pz) || !BIO_GROUND.test(bioJ(gget(px, y - 1, pz)))) return; }
      pts.forEach(function (q) { editSet(x + q[0], y, z + q[1], sv); });
      var res = treeGrow([x, y, z], false);
      if (!res || res.err) pts.forEach(function (q) { if (gget(x + q[0], y, z + q[1]) === sv) editSet(x + q[0], y, z + q[1], 0); });
      else T.arvores++;
    });
  } finally { symBusy = saved; }
}
function bioTerraTxt(T) {
  if (!T) return '';
  var p = [];
  if (T.chao) p.push(T.chao.toLocaleString('pt-BR') + ' blocos de chão trocados');
  if (T.arvores) p.push(T.arvores + (T.arvores > 1 ? ' árvores' : ' árvore'));
  if (T.cactos) p.push(T.cactos + (T.cactos > 1 ? ' cactos' : ' cacto'));
  if (T.plantas) p.push(T.plantas + ' plantas');
  if (T.neve) p.push(T.neve + ' camadas de neve');
  if (T.gelo) p.push(T.gelo + ' de gelo');
  return p.length ? ' (' + p.join(', ') + ')' : '';
}

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
  $('bioTerra').setAttribute('aria-pressed', String(bio.terra));
  $('bioPlates').setAttribute('aria-pressed', String(bio.show));
  $('bioFill').disabled = !sel;
}
function setBioR(r) { bio.r = Math.max(0, Math.min(32, r)); bioPrefs(); updateBioChip(); updatePreview(); }
$('bioChip').addEventListener('click', function (e) {
  var b = e.target.closest('button'); if (!b) return;
  if (b.hasAttribute('data-bs')) bio.sq = b.getAttribute('data-bs') === 'sq';
  else if (b.id === 'bioMinus') return setBioR(bio.r - 1);
  else if (b.id === 'bioPlus') return setBioR(bio.r + 1);
  else if (b.id === 'bioErase') bio.erase = !bio.erase;
  else if (b.id === 'bioTerra') { bio.terra = !bio.terra; toast(bio.terra ? 'Transformar o terreno: ligado. Ao pintar, o chão, as plantas, a neve e as árvores mudam conforme o bioma.' : 'Transformar o terreno: desligado. O pincel troca só o bioma (e a cor da grama).', 5000); }
  else if (b.id === 'bioFill') return bioFillSel();
  else if (b.id === 'bioPlates') return bioToggleShow();
  bioPrefs(); updateBioChip(); updatePreview();
});
$('bioSel').addEventListener('change', function (e) { bio.id = +e.target.value; bio.erase = false; e.target.dataset.v = String(bio.id); bioPrefs(); updateBioChip(); });
function bioToggleShow() { bio.show = !bio.show; bioPrefs(); updateBioChip(); requestRender(); toast(bio.show ? 'Placas dos biomas à vista: cada coluna com bioma ganha uma placa colorida em cima.' : 'Placas dos biomas escondidas: a grama, as folhas e a água mostram a cor de cada bioma.', 5000); }
$('bioShow').addEventListener('click', function () { $('menu').open = false; bioToggleShow(); });
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
  var on = bio.show, key = on ? bioVer + '|' + verCounter + '|' + (layerOn ? layerY : -1) : '';
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
function bioFromRecord(o) { bioPaint.clear(); if (o) Object.keys(o).forEach(function (k) { bioPaint.set(k, unb64(o[k])); }); bioVer++; dirtyAll(); }

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
  for (var cy = 0; cy * 16 < SY; cy++) if (W.has(ckey(ecx, cy, ecz))) dirty.add(ecx + ',' + cy + ',' + ecz);
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
