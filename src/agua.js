/* ---------- Pincel de água: rios, lagos e oceanos com leito, margens e plantas do bioma ---------- */
/* Cada pincelada (ao clicar e a cada 160 ms com o botão apertado, ligando o ponto anterior ao atual, para um rio sair
   contínuo) olha as colunas em volta do ponto apontado e faz, nesta ordem (as etapas 1, 2 e 4 podem ser desligadas):
     1. Escultura do leito: cada coluna a uma distância d do centro tem t = d / (r · (1 + 0,22 · ruído(x, z))) (o ruído
        deixa a borda orgânica, sem círculo perfeito). Dentro da água (t < 1), o fundo fica a profundidade
        P(t) = D · perfil(t) · (1 + 0,18 · ruído) abaixo do nível N da água, com D e o perfil do tipo:
          rio      D = máx(2; 0,45 r)  perfil 1 − t²                         (U arredondado)
          lago     D = máx(2; 0,6 r)   perfil (1 − t^2,5)^0,7                (bacia de fundo largo)
          oceano   D = máx(4; 1,1 r)   plataforma até t = 0,55, depois talude (1 − (t − 0,55)/0,45)^1,6
        e tudo o que é terreno ou vegetação acima do fundo sai (até 2r + 8 acima do nível). Na faixa da margem
        (1 ≤ t < 1,4), o terreno pode subir até 1 + 0,9 r · (t − 1)/0,4 acima da água: um barranco inclinado, em vez de
        um paredão. Construções (o que não é terreno nem planta) não são cavadas: a água as contorna.
     2. Inundação: as células vazias do fundo até o nível viram água parada (fonte). Onde a água encostaria num vazio
        de fora (um buraco, uma caverna, o fim de um barranco), o pincel fecha com um bloco da margem: a água não vaza.
     3. Bioma: cada coluna lê o bioma do mundo do jogo (ou o pintado pelo Pincel de bioma) no centro e em 8 pontos a 6
        blocos; o peso de cada classe (pântano, deserto, oceano quente...) é a fração das amostras (o centro vale 3).
        Na divisa entre dois biomas, cada bloco sorteia a classe pelo peso: a decoração muda aos poucos. Sem bioma
        lido (uma construção do zero), vale o bioma escolhido no aviso (Automático = planície).
     4. Decoração: pela tabela de regras da classe (Regras… no aviso): margem e fundo trocam o terreno exposto
        (argila, areia, lama, cascalho), e plantas nascem no fundo (algas, algas-marinhas, corais, pepinos-do-mar), na
        superfície (vitórias-régias), na borda (cana-de-açúcar, capim, samambaias) ou viram gelo. Cada número é a
        chance em % para cada bloco; o resto fica como está.
   Um traço é um passo de desfazer; a malha é refeita pela fila de pedaços (rebuildDirty). O nível da água vale para o
   traço inteiro (água parada é plana): automático, ele sai do primeiro clique (a água já existente ali, ou um bloco
   abaixo do chão). */
var hyd = { r: 6, kind: 'lake', bio: -1, lvl: null, carve: true, fill: true, deco: true };
try { var hyd0 = JSON.parse(localStorage.getItem('bloco-a-bloco-agua') || 'null'); if (hyd0) hyd = Object.assign(hyd, hyd0); } catch (e) {}
var HYD_KIND_PT = { river: 'Rio', lake: 'Lago', ocean: 'Oceano' };
function hydDepthMax(kind, r) { return kind === 'river' ? Math.max(2, Math.round(r * 0.45)) : kind === 'lake' ? Math.max(2, Math.round(r * 0.6)) : Math.max(4, Math.round(r * 1.1)); }
function hydProfile(kind, t) {
  if (kind === 'river') return 1 - t * t;
  if (kind === 'lake') return Math.pow(1 - Math.pow(t, 2.5), 0.7);
  return t < 0.55 ? 1 : Math.pow(1 - (t - 0.55) / 0.45, 1.6);
}
/* Ruído de valor 2D (duas oitavas, -1 a 1): grade com sorteio por posição e interpolação suave */
function hydHash(x, z, s) { var h = Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263) ^ Math.imul(s | 0, 1442695041); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function hydVal(x, z, s, sc) {
  var gx = x / sc, gz = z / sc, x0 = Math.floor(gx), z0 = Math.floor(gz), fx = gx - x0, fz = gz - z0, u = fx * fx * (3 - 2 * fx), w = fz * fz * (3 - 2 * fz);
  var a = hydHash(x0, z0, s), b = hydHash(x0 + 1, z0, s), c = hydHash(x0, z0 + 1, s), d = hydHash(x0 + 1, z0 + 1, s);
  return (a + (b - a) * u) + ((c + (d - c) * u) - (a + (b - a) * u)) * w;
}
function hydNoise(x, z, s) { return (hydVal(x, z, s, 9) * 0.65 + hydVal(x, z, s + 7, 4) * 0.35) * 2 - 1; }

/* ---------- O que o pincel pode cavar e decorar ---------- */
var HYD_NATURAL = /^(grass_block|dirt|coarse_dirt|rooted_dirt|podzol|mycelium|mud|clay|sand|red_sand|gravel|suspicious_sand|suspicious_gravel|stone|andesite|diorite|granite|tuff|calcite|deepslate|cobbled_deepslate|smooth_basalt|dripstone_block|sandstone|red_sandstone|terracotta|\w+_terracotta|snow_block|powder_snow|moss_block|packed_ice|ice|blue_ice|dirt_path|farmland|soul_sand|soul_soil|netherrack|end_stone|cobblestone|mossy_cobblestone|magma_block|prismarine|\w+_coral_block|\w*_?ore|raw_\w+_block|amethyst_block|budding_amethyst|obsidian)$/;
var HYD_VEG = /(_leaves|_log|_wood|_stem|_hyphae|mushroom_block|mushroom_stem|^vine$|_vines(_plant)?$|^snow$|^water$|^bubble_column$|^kelp(_plant)?$|seagrass|^lily_pad$|_coral(_wall)?_fan$|_coral$|^sea_pickle$|^sugar_cane$|^bamboo|^cactus$|_propagule$|^moss_carpet$|^pale_moss_carpet$|^pale_hanging_moss$|^glow_lichen$|^hanging_roots$|mangrove_roots$|^cocoa$|^bee_nest$|^pumpkin$|^melon$|^pointed_dripstone$)/;
var hydKindTab = null; // por bloco: 0 = vazio, 1 = terreno natural, 2 = vegetação (sai junto ao cavar), 3 = construção (fica)
function hydKindOf(bi) {
  if (!hydKindTab || hydKindTab.length !== BLOCKS.length) {
    hydKindTab = new Uint8Array(BLOCKS.length);
    BLOCKS.forEach(function (b, i) {
      if (b.isAir) hydKindTab[i] = 0;
      else if (HYD_NATURAL.test(b.java)) hydKindTab[i] = 1;
      else if (HYD_VEG.test(b.java) || (b.shape && !b.shape.fc && /(grass|fern|flower|bush|tulip|orchid|allium|bluet|daisy|poppy|dandelion|lily|rose|peony|lilac|sunflower|petals|wildflowers|leaf_litter|dripleaf|sapling|mushroom|roots|sprouts|azalea|spore|berry|pitcher|torchflower|eyeblossom|cornflower)/.test(b.java))) hydKindTab[i] = 2;
      else hydKindTab[i] = 3;
    });
  }
  return hydKindTab[bi];
}
function hydAt(x, y, z) { if (!inB(x, y, z) || y > layerMax()) return 3; var v = gget(x, y, z); return v ? hydKindOf(cellBlock(v)) : 0; }
function hydIsWater(x, y, z) { if (!inB(x, y, z)) return false; var v = gget(x, y, z); return !!v && BLOCKS[cellBlock(v)].java === 'water'; }
var hydCells = {};
function hydCell(nm) { if (!(nm in hydCells)) hydCells[nm] = cellFromName(nm); return hydCells[nm]; }

/* ---------- Bioma: classes e transição ---------- */
var HYD_CLASS_PT = { temperado: 'temperado', frio: 'frio', gelado: 'gelado', pantano: 'pântano', mangue: 'mangue', selva: 'selva', deserto: 'deserto', mesa: 'mesa (badlands)', savana: 'savana', cogumelo: 'cogumelos', quente: 'quente', morno: 'morno' };
/* Classe de um bioma: na água salgada (oceano), pela temperatura do mar; na doce (rio, lago), pela paisagem */
function hydClassOf(id, sea) {
  var e = BIO_BY_ID[id]; if (!e) return 'temperado';
  var tg = {}; (e.tags || []).forEach(function (q) { tg[q] = 1; }); var n = e.n, t = e.t;
  if (sea) {
    if (/^(deep_)?warm_ocean$/.test(n)) return 'quente';
    if (/lukewarm/.test(n)) return 'morno';
    if (tg.frozen || /frozen/.test(n)) return 'gelado';
    if (tg.cold || /cold/.test(n)) return 'frio';
    if (tg.ocean) return 'temperado';
    if (t <= 0.05) return 'gelado'; if (t < 0.3) return 'frio'; if (t >= 0.95) return 'quente'; if (t >= 0.8) return 'morno'; return 'temperado'; // oceano num bioma de terra
  }
  if (n === 'mangrove_swamp') return 'mangue';
  if (tg.swamp) return 'pantano';
  if (tg.frozen || t <= 0.05) return 'gelado';
  if (tg.desert) return 'deserto'; if (tg.mesa) return 'mesa'; if (tg.savanna) return 'savana';
  if (tg.jungle || tg.lush_caves) return 'selva';
  if (/mushroom/.test(n)) return 'cogumelo';
  if (tg.cold || t < 0.3) return 'frio';
  return 'temperado';
}
var HYD_RING = [[6, 0], [4, 4], [0, 6], [-4, 4], [-6, 0], [-4, -4], [0, -6], [4, -4]];
/* Pesos das classes na coluna: centro (peso 3) e 8 pontos a 6 blocos (peso 1 cada) */
function hydMix(x, z, st) {
  var k = x + ',' + z, m = st.mix.get(k); if (m) return m;
  var sea = hyd.kind === 'ocean', w = {}, add = function (id, p) { var c = hydClassOf(id, sea); w[c] = (w[c] || 0) + p; };
  if (hyd.bio >= 0) add(hyd.bio, 1);
  else {
    var b0 = bioAt(x, z); add(b0 < 0 ? 1 : b0, 3);
    for (var i = 0; i < 8; i++) { var b = bioAt(x + HYD_RING[i][0], z + HYD_RING[i][1]); add(b < 0 ? (b0 < 0 ? 1 : b0) : b, 1); }
  }
  var tot = 0, k2; for (k2 in w) tot += w[k2];
  m = []; for (k2 in w) m.push([k2, w[k2] / tot]);
  st.mix.set(k, m); return m;
}
function hydPickClass(m) { var r = Math.random(), a = 0; for (var i = 0; i < m.length; i++) { a += m[i][1]; if (r < a) return m[i][0]; } return m[m.length - 1][0]; }

/* ---------- Regras de decoração (editáveis) ---------- */
/* Uma regra por linha: "água classe lugar = bloco %, bloco %". água: doce (rio, lago) ou mar (oceano). Lugares:
   margem (terreno exposto na beira, do nível da água para cima), fundo (terreno debaixo da água), plantas (no fundo:
   algas, algas-marinhas, corais, pepinos-do-mar), recife (montinhos de 1 a 3 blocos de coral no fundo), superficie
   (vitória-régia), borda (plantas no chão da margem; a cana só nasce encostada na água) e gelo (a água da superfície
   congela). */
var HYD_RULES_DEF = [
  '# água classe lugar = bloco %, bloco %   (o resto da chance deixa o bloco como está)',
  'doce temperado margem = sand 35, gravel 20, clay 15, dirt 20',
  'doce temperado fundo = sand 40, gravel 35, clay 20',
  'doce temperado plantas = seagrass 22, tall_seagrass 6, kelp 3',
  'doce temperado superficie = lily_pad 3',
  'doce temperado borda = sugar_cane 14, short_grass 18, tall_grass 5',
  'doce frio margem = gravel 45, sand 25, coarse_dirt 15',
  'doce frio fundo = gravel 60, sand 20, clay 20',
  'doce frio plantas = seagrass 14',
  'doce frio borda = fern 16, sugar_cane 4, large_fern 3',
  'doce gelado margem = gravel 40, sand 25, snow_block 20',
  'doce gelado fundo = gravel 70, clay 30',
  'doce gelado gelo = ice 85',
  'doce gelado borda = snow 55',
  'doce pantano margem = clay 45, mud 35, dirt 20',
  'doce pantano fundo = mud 50, clay 40, dirt 10',
  'doce pantano plantas = seagrass 30, tall_seagrass 8',
  'doce pantano superficie = lily_pad 22',
  'doce pantano borda = sugar_cane 20, short_grass 12, blue_orchid 3',
  'doce mangue margem = mud 70, muddy_mangrove_roots 12, clay 15',
  'doce mangue fundo = mud 85, clay 15',
  'doce mangue plantas = seagrass 25',
  'doce mangue superficie = lily_pad 6',
  'doce mangue borda = short_grass 12, sugar_cane 6',
  'doce selva margem = clay 25, sand 30, dirt 20, moss_block 15',
  'doce selva fundo = sand 40, clay 40, gravel 20',
  'doce selva plantas = seagrass 30, tall_seagrass 8, kelp 5',
  'doce selva superficie = lily_pad 10',
  'doce selva borda = sugar_cane 18, fern 14, large_fern 4',
  'doce deserto margem = sand 70, sandstone 12, clay 15',
  'doce deserto fundo = sand 60, clay 25, gravel 15',
  'doce deserto borda = sugar_cane 16, dead_bush 6',
  'doce mesa margem = red_sand 60, clay 20, orange_terracotta 15',
  'doce mesa fundo = red_sand 50, clay 30, gravel 20',
  'doce mesa borda = sugar_cane 10, dead_bush 8',
  'doce savana margem = sand 40, coarse_dirt 20, clay 15, dirt 20',
  'doce savana fundo = sand 40, gravel 30, clay 30',
  'doce savana borda = sugar_cane 10, short_grass 20, tall_grass 6',
  'doce cogumelo margem = mycelium 45, clay 25, dirt 25',
  'doce cogumelo fundo = clay 50, gravel 50',
  'doce cogumelo borda = red_mushroom 6, brown_mushroom 6',
  'mar temperado margem = sand 80, gravel 15',
  'mar temperado fundo = gravel 45, sand 35, clay 15',
  'mar temperado plantas = seagrass 26, tall_seagrass 8, kelp 16',
  'mar morno margem = sand 90, gravel 8',
  'mar morno fundo = sand 80, gravel 15',
  'mar morno plantas = seagrass 38, tall_seagrass 10, sea_pickle 2',
  'mar quente margem = sand 90, sandstone 8',
  'mar quente fundo = sand 85',
  'mar quente recife = brain_coral_block 3, tube_coral_block 3, bubble_coral_block 3, fire_coral_block 3, horn_coral_block 3',
  'mar quente plantas = seagrass 20, brain_coral 3, tube_coral 3, bubble_coral 3, fire_coral 3, horn_coral 3, brain_coral_fan 2, tube_coral_fan 2, bubble_coral_fan 2, fire_coral_fan 2, horn_coral_fan 2, sea_pickle 4',
  'mar frio margem = gravel 50, sand 45',
  'mar frio fundo = gravel 70, sand 20, clay 10',
  'mar frio plantas = seagrass 18, kelp 22',
  'mar gelado margem = gravel 50, sand 30, snow_block 15',
  'mar gelado fundo = gravel 80, clay 20',
  'mar gelado plantas = seagrass 8',
  'mar gelado gelo = ice 70, packed_ice 15'
].join('\n');
var HYD_SLOTS = { margem: 1, fundo: 1, plantas: 1, recife: 1, superficie: 1, borda: 1, gelo: 1 };
var hydRulesTxt = HYD_RULES_DEF;
try { var hr0 = localStorage.getItem('bloco-a-bloco-agua-regras'); if (hr0) hydRulesTxt = hr0; } catch (e) {}
/* Texto → { doce: { classe: { lugar: [[índice do bloco, chance 0..1], ...] } }, mar: {...} } e as linhas com erro */
function hydParse(txt) {
  var R = { doce: {}, mar: {} }, bad = [];
  String(txt || '').split('\n').forEach(function (ln) {
    ln = ln.replace(/#.*/, '').trim(); if (!ln) return;
    var m = /^(doce|mar)\s+(\S+)\s+(\S+)\s*=\s*(.+)$/i.exec(ln);
    if (!m || !HYD_SLOTS[m[3].toLowerCase()] || !HYD_CLASS_PT[m[2].toLowerCase()]) { bad.push(ln); return; }
    var list = [], ok = true;
    m[4].split(',').forEach(function (it) {
      var q = /^\s*(\S+)\s+(\d+(?:[.,]\d+)?)\s*%?\s*$/.exec(it); var bi = q ? blockByText(q[1]) : -1;
      if (!q || bi < 0) { ok = false; return; }
      list.push([bi, +q[2].replace(',', '.') / 100]);
    });
    if (!ok) { bad.push(ln); return; }
    var W = R[m[1].toLowerCase()], c = m[2].toLowerCase(); (W[c] = W[c] || {})[m[3].toLowerCase()] = list;
  });
  return { rules: R, bad: bad };
}
var hydRules = null;
function hydRulesGet() { if (!hydRules) hydRules = hydParse(hydRulesTxt).rules; return hydRules; }
/* Sorteia um bloco do lugar (ou -1: fica como está) */
function hydPick(cls, slot) {
  var R = hydRulesGet()[hyd.kind === 'ocean' ? 'mar' : 'doce'], L = R[cls] && R[cls][slot]; if (!L) return -1;
  var r = Math.random(), a = 0; for (var i = 0; i < L.length; i++) { a += L[i][1]; if (r < a) return L[i][0]; } return -1;
}

/* ---------- Plantas: cada uma do jeito que o jogo a põe ---------- */
function hydSetIf(x, y, z, cell, st, need) { // need: o que deve estar ali (0 vazio, 'w' água)
  if (!inB(x, y, z) || y > layerMax()) return false;
  if (need === 'w' ? !hydIsWater(x, y, z) : gget(x, y, z)) return false;
  editSet(x, y, z, cell); st.deco++; return true;
}
function hydWaterPlant(bi, x, y, z, room, st) { // y: a primeira água acima do fundo; room: quantas células de água acima
  var j = BLOCKS[bi].java;
  if (j === 'kelp') { // coluna de alga: corpo (kelp_plant) e a ponta (kelp), de 1 até a superfície
    var h = 1 + Math.floor(Math.random() * Math.max(1, room - 1)); if (room < 2) h = 1;
    for (var k = 0; k < h - 1; k++) hydSetIf(x, y + k, z, hydCell('kelp_plant'), st, 'w');
    hydSetIf(x, y + h - 1, z, hydCell('kelp[age=' + Math.floor(Math.random() * 25) + ']'), st, 'w'); return;
  }
  if (j === 'tall_seagrass') { if (room >= 2 && hydSetIf(x, y, z, hydCell('tall_seagrass[half=lower]'), st, 'w')) hydSetIf(x, y + 1, z, hydCell('tall_seagrass[half=upper]'), st, 'w'); else hydSetIf(x, y, z, hydCell('seagrass'), st, 'w'); return; }
  if (j === 'sea_pickle') { hydSetIf(x, y, z, hydCell('sea_pickle[pickles=' + (1 + Math.floor(Math.random() * 4)) + ',waterlogged=true]'), st, 'w'); return; }
  hydSetIf(x, y, z, mkCell(bi), st, 'w');
}
function hydLandPlant(bi, x, y, z, st, wet) { // y: o ar acima do chão da margem
  var b = BLOCKS[bi], j = b.java;
  if (j === 'sugar_cane') { if (!wet) return; var h = 1 + Math.floor(Math.random() * 3); for (var k = 0; k < h; k++) if (!hydSetIf(x, y + k, z, mkCell(bi), st)) break; return; }
  if (j === 'snow') { hydSetIf(x, y, z, hydCell('snow[layers=1]'), st); return; }
  if (b.sp && b.sp.some(function (s) { return s[0] === 'half'; })) { // dois blocos de altura
    if (!gget(x, y + 1, z) && hydSetIf(x, y, z, hydCell(j + '[half=lower]'), st)) hydSetIf(x, y + 1, z, hydCell(j + '[half=upper]'), st); return;
  }
  hydSetIf(x, y, z, mkCell(bi), st);
}

/* ---------- Uma pincelada ---------- */
var HYD_N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
function hydSmall(v) { var b = v && BLOCKS[cellBlock(v)]; return !!b && !!b.shape && !b.shape.fc && !/(_leaves|_log|_wood|_stem|_hyphae)$/.test(b.java); } // planta pequena (não folha nem tronco)
/* Água de fora (que já existia, não deste traço): acima do nível do traço, nem ela nem o bloco encostado nela (dos
   lados ou embaixo) são cavados, e fica uma parede natural; sem isso, um lago mais alto do lado escorreria para o vale */
function hydForeign(x, y, z, st) { return hydIsWater(x, y, z) && !st.mine.has(idx(x, y, z)); }
function hydGuarded(x, y, z, st) {
  if (hydForeign(x, y, z, st) || hydForeign(x, y + 1, z, st)) return true;
  for (var i = 0; i < 4; i++) if (hydForeign(x + HYD_N4[i][0], y, z + HYD_N4[i][1], st)) return true;
  return false;
}
function hydRemove(x, y, z, st) { editSet(x, y, z, 0); st.carved++; var k = x + ',' + z, o = st.cut.get(k); if (o == null || y < o) st.cut.set(k, y); } // st.cut: o y mais baixo cavado em cada coluna
function hydDab(c, st) {
  if (!c) return;
  var r = hyd.r, kind = hyd.kind, L = st.L, D = hydDepthMax(kind, r), cap = 2 * r + 8, R = Math.ceil(r * 1.4 * 1.25), cols = [];
  for (var dz = -R; dz <= R; dz++) for (var dx = -R; dx <= R; dx++) {
    var x = c[0] + dx, z = c[2] + dz; if (!inB(x, 0, z)) continue;
    var t = Math.hypot(dx, dz) / (r * (1 + 0.22 * hydNoise(x, z, st.seed))); if (t >= 1.4) continue;
    var q = { x: x, z: z, t: t };
    if (t < 1) q.floor = Math.max(0, L - Math.max(1, Math.round(D * hydProfile(kind, t) * (1 + 0.18 * hydNoise(x * 1.7 + 31, z * 1.7 - 17, st.seed))))); // no máximo até o fundo do espaço (o y 0 fica de leito)
    cols.push(q);
  }
  // o fundo de uma coluna já cavada neste traço não sobe (passar de novo não aterra o rio)
  cols.forEach(function (q) { if (q.floor == null) return; var k = q.x + ',' + q.z, o = st.floor.get(k); if (o != null && o < q.floor) q.floor = o; st.floor.set(k, q.floor); });
  var top = Math.min(SY - 1, L + cap);
  // 1. escultura do leito e do barranco
  if (hyd.carve) cols.forEach(function (q) {
    var lo = q.floor != null ? q.floor + 1 : L + 1 + Math.round(0.9 * r * (q.t - 1) / 0.4) + 1;
    for (var y = Math.max(0, lo); y <= top; y++) { // de baixo para cima: a planta de cima vê que o chão dela saiu
      var k = hydAt(q.x, y, q.z); if (!k || k === 3) continue;
      if (y > L && hydGuarded(q.x, y, q.z, st)) continue;
      if (k === 1 || (k === 2 && q.floor != null)) hydRemove(q.x, y, q.z, st);
      else if (k === 2 && hydSmall(gget(q.x, y, q.z)) && !gget(q.x, y - 1, q.z)) hydRemove(q.x, y, q.z, st); // planta que ficou sem chão
    }
    // barranco cortado num terreno oco por dentro (como o do Gerar terreno, só uma casca): o chão novo ganha uma pele
    if (q.floor == null && lo - 1 > L && hydAt(q.x, lo - 1, q.z) === 0 && st.cut.get(q.x + ',' + q.z) === lo) { editSet(q.x, lo - 1, q.z, mkCell(BY_JAVA.dirt)); st.sealed++; }
  });
  // 2. inundação: do fundo ao nível, e o fundo e os lados fechados onde haveria vazamento
  var wet = [];
  if (hyd.fill) {
    cols.forEach(function (q) {
      if (q.floor == null) return;
      for (var y = Math.max(0, q.floor + 1); y <= L && y <= layerMax(); y++) {
        var k = hydAt(q.x, y, q.z); if (k === 3 || k === 1) continue; // construção ou terreno que ficou (com Escavar desligado): a água contorna
        if (!hydIsWater(q.x, y, q.z) || fluidLv(gget(q.x, y, q.z)) !== 0) { editSet(q.x, y, q.z, hydCell('water')); st.water++; } // água corrente que já havia vira parada
        st.mine.add(idx(q.x, y, q.z));
        wet.push([q.x, y, q.z]);
      }
    });
    var seal = function (x, y, z) { // vazio encostado na água: fecha com a margem (ou terra)
      if (!inB(x, y, z) || y > layerMax() || st.floor.has(x + ',' + z) && y > st.floor.get(x + ',' + z)) return;
      var k = hydAt(x, y, z); if (k !== 0 && k !== 2) return; if (hydIsWater(x, y, z)) return;
      var bi = hydPick(hydPickClass(hydMix(x, z, st)), y >= L - 1 ? 'margem' : 'fundo'); if (bi < 0 || BLOCKS[bi].shape) bi = BY_JAVA.dirt;
      editSet(x, y, z, mkCell(bi)); st.sealed++;
    };
    wet.forEach(function (p) {
      for (var i = 0; i < 4; i++) seal(p[0] + HYD_N4[i][0], p[1], p[2] + HYD_N4[i][1]);
      if (p[1] > 0 && !hydIsWater(p[0], p[1] - 1, p[2])) seal(p[0], p[1] - 1, p[2]);
    });
  }
  // 3 e 4. bioma e decoração (cada coluna uma vez por traço)
  if (!hyd.deco) return;
  cols.forEach(function (q) {
    var key = q.x + ',' + q.z, inW = st.floor.has(key); // coluna que já foi água neste traço nunca vira margem
    if (inW ? st.decoW.has(key) : st.decoB.has(key)) return;
    (inW ? st.decoW : st.decoB).add(key);
    var mix = hydMix(q.x, q.z, st);
    mix.forEach(function (m) { st.cls[m[0]] = (st.cls[m[0]] || 0) + m[1]; });
    if (inW) {
      var fy = L; while (fy > 0 && hydIsWater(q.x, fy - 1, q.z)) fy--; // primeira água acima do fundo
      var room = L - fy + 1, cls = hydPickClass(mix);
      // fundo: o terreno debaixo da água e o das paredes laterais submersas
      if (hydAt(q.x, fy - 1, q.z) === 1) { var b1 = hydPick(cls, 'fundo'); if (b1 >= 0) { editSet(q.x, fy - 1, q.z, mkCell(b1)); st.deco++; } }
      for (var y = fy; y <= L; y++) for (var i = 0; i < 4; i++) {
        var nx = q.x + HYD_N4[i][0], nz = q.z + HYD_N4[i][1]; if (hydAt(nx, y, nz) !== 1) continue;
        var b2 = hydPick(hydPickClass(mix), y >= L - 1 ? 'margem' : 'fundo'); if (b2 >= 0 && !BLOCKS[b2].shape) { editSet(nx, y, nz, mkCell(b2)); st.deco++; }
      }
      // recife: um montinho de coral no fundo
      var rb = hydPick(cls, 'recife'), plantY = fy;
      if (rb >= 0 && room >= 3) { var h = 1 + Math.floor(Math.random() * Math.min(3, room - 2)); for (var k2 = 0; k2 < h; k2++) if (hydSetIf(q.x, fy + k2, q.z, mkCell(rb), st, 'w')) plantY = fy + k2 + 1; }
      var pb = hydPick(cls, 'plantas'); if (pb >= 0 && plantY <= L) hydWaterPlant(pb, q.x, plantY, q.z, L - plantY + 1, st);
      var ice = hydPick(cls, 'gelo');
      if (ice >= 0 && hydIsWater(q.x, L, q.z)) { editSet(q.x, L, q.z, mkCell(ice)); st.deco++; }
      else { var sb = hydPick(cls, 'superficie'); if (sb >= 0 && room >= 1 && hydIsWater(q.x, L, q.z)) hydSetIf(q.x, L + 1, q.z, mkCell(sb), st); }
    } else if (q.t < 1.3) {
      // margem: o chão da beira (até 2 blocos acima da água) e as plantas dele
      var y0 = Math.min(layerMax(), L + 3), gy = -1; for (var y3 = y0; y3 >= L - 1; y3--) if (hydAt(q.x, y3, q.z) === 1) { gy = y3; break; }
      if (gy < 0 || gget(q.x, gy + 1, q.z)) return;
      var cl2 = hydPickClass(mix), b3 = hydPick(cl2, 'margem'); if (b3 >= 0 && !BLOCKS[b3].shape) { editSet(q.x, gy, q.z, mkCell(b3)); st.deco++; }
      var wetN = false; for (var i2 = 0; i2 < 4; i2++) if (hydIsWater(q.x + HYD_N4[i2][0], gy, q.z + HYD_N4[i2][1])) wetN = true;
      var pl = hydPick(hydPickClass(mix), 'borda'); if (pl >= 0) hydLandPlant(pl, q.x, gy + 1, q.z, st, wetN && gy === L);
    }
  });
}

/* ---------- Traço ---------- */
var hydStroke = null, hydTimer = 0, hydSeed = (Math.random() * 1e9) | 0; // o sorteio da borda do próximo traço (a prévia usa o mesmo)
function hydCenter(t) { return t && (t.hit || (t.place && [t.place[0], t.place[1] - 1, t.place[2]])); }
/* Nível automático: a água que já existe no ponto (continua o mesmo lago) ou um bloco abaixo do chão (plantas, folhas
   e troncos não contam como chão) */
function hydAutoLevel(c) {
  var x = c[0], y = c[1], z = c[2];
  while (y > 0 && hydAt(x, y, z) === 2 && !hydIsWater(x, y, z)) y--; // uma vitória-régia, uma folha: desce até a água ou o chão
  if (hydIsWater(x, y, z)) { while (hydIsWater(x, y + 1, z)) y++; return y; }
  return Math.max(1, y - 1);
}
/* O nível no aviso e nos avisos é a altura do jogo (num mundo aberto, o y do editor + o fundo da dimensão) */
function hydYOff() { return wio && wio.area ? wioDim(wio.area.dim).min : 0; }
function hydLevelFor(c) { return hyd.lvl != null ? Math.max(1, Math.min(SY - 2, hyd.lvl - hydYOff())) : hydAutoLevel(c); }
function hydStart(t) {
  var c = hydCenter(t); if (!c) return;
  if (!hyd.carve && !hyd.fill && !hyd.deco) { toast('Ligue pelo menos uma etapa no aviso: Escavar, Encher ou Decorar.'); return; }
  hydStroke = { L: hydLevelFor(c), seed: hydSeed, last: c, floor: new Map(), mine: new Set(), cut: new Map(), mix: new Map(), decoW: new Set(), decoB: new Set(), cls: {}, carved: 0, water: 0, sealed: 0, deco: 0 };
  stroke = { mode: 'water', cells: new Set(), on: true }; beginBatch('Pincel de água'); fluidStop();
  hydDab(c, hydStroke); requestRender();
  clearInterval(hydTimer);
  hydTimer = setInterval(function () {
    if (!stroke || stroke.mode !== 'water') { clearInterval(hydTimer); return; }
    var c2 = hydCenter(hoverT), st = hydStroke; if (!c2 || !st) return;
    // do ponto anterior ao atual, em passos de um terço do raio: o rio sai contínuo mesmo com o mouse rápido
    var dx = c2[0] - st.last[0], dz = c2[2] - st.last[2], d = Math.hypot(dx, dz); if (d < Math.max(1, hyd.r / 4)) return;
    var n = Math.ceil(d / Math.max(1, hyd.r / 3));
    for (var i = 1; i <= n; i++) hydDab([Math.round(st.last[0] + dx * i / n), c2[1], Math.round(st.last[2] + dz * i / n)], st);
    st.last = c2; updatePreview(); requestRender();
  }, 160);
}
function hydEnd() {
  clearInterval(hydTimer); hydTimer = 0;
  var s = hydStroke; hydStroke = null; hydSeed = (Math.random() * 1e9) | 0; if (!s) return;
  var tot = 0, k; for (k in s.cls) tot += s.cls[k];
  var bs = Object.keys(s.cls).sort(function (a, b) { return s.cls[b] - s.cls[a]; }).map(function (k3) { return HYD_CLASS_PT[k3] + ' ' + Math.round(100 * s.cls[k3] / tot) + '%'; });
  var p = []; if (s.carved) p.push(s.carved + ' blocos escavados'); if (s.water) p.push(s.water + ' de água'); if (s.sealed) p.push(s.sealed + ' na beira para a água não vazar'); if (s.deco) p.push(s.deco + ' de margem, fundo e plantas');
  var gy = s.L + hydYOff();
  toast(p.length ? HYD_KIND_PT[hyd.kind] + ' no nível Y ' + gy + ': ' + p.join(', ') + (bs.length ? '. Bioma: ' + bs.join(', ') : '') + '. Ctrl+Z desfaz o traço.' : 'Nada mudou: confira o nível da água (Y ' + gy + ') e as etapas ligadas no aviso.', 8000);
}

/* ---------- Aviso, prévia e regras ---------- */
function hydSave() { try { localStorage.setItem('bloco-a-bloco-agua', JSON.stringify(hyd)); } catch (e) {} }
function hydBioOptions() {
  var o = '<option value="-1">Automático (o do mundo; sem bioma, planície)</option>';
  BIOMES.filter(function (b) { return b.dim === 0; }).sort(function (a, b) { return a.pt.localeCompare(b.pt); }).forEach(function (b) { o += '<option value="' + b.id + '">' + esc(b.pt) + '</option>'; });
  return o;
}
function updateWaterChip() {
  var c = $('waterChip'), on = tool === 'water'; c.hidden = !on; if (!on) return;
  if (!$('hydBio').options.length) $('hydBio').innerHTML = hydBioOptions();
  $('hydR').textContent = hyd.r; $('hydBio').value = String(hyd.bio);
  if (document.activeElement !== $('hydLvl')) $('hydLvl').value = hyd.lvl == null ? '' : hyd.lvl;
  c.querySelectorAll('[data-hk]').forEach(function (b) { b.setAttribute('aria-pressed', String(hyd.kind === b.getAttribute('data-hk'))); });
  c.querySelectorAll('[data-hs]').forEach(function (b) { b.setAttribute('aria-pressed', String(!!hyd[b.getAttribute('data-hs')])); });
}
function setHydR(r) { hyd.r = Math.max(2, Math.min(32, r)); hydSave(); updateWaterChip(); updatePreview(); }
$('waterChip').addEventListener('click', function (e) {
  var b = e.target.closest('button'); if (!b) return;
  if (b.hasAttribute('data-hk')) hyd.kind = b.getAttribute('data-hk');
  else if (b.hasAttribute('data-hs')) { var k = b.getAttribute('data-hs'); hyd[k] = !hyd[k]; }
  else if (b.id === 'hydRm') hyd.r = Math.max(2, hyd.r - 1);
  else if (b.id === 'hydRp') hyd.r = Math.min(32, hyd.r + 1);
  else if (b.id === 'hydRules') { openHydRules(); return; }
  hydSave(); updateWaterChip(); updatePreview();
});
$('hydBio').addEventListener('change', function () { hyd.bio = +$('hydBio').value; hydSave(); });
$('hydLvl').addEventListener('input', function () { var v = $('hydLvl').value.trim(); hyd.lvl = v === '' || isNaN(+v) ? null : Math.round(+v); hydSave(); updatePreview(); });
/* Prévia: a superfície da água (no nível) das colunas que o pincel enche */
function waterPreview(t, accent) {
  var c = hydCenter(t); if (!c) return;
  var r = hyd.r, L = hydStroke ? hydStroke.L : hydLevelFor(c), m = new THREE.Matrix4(), k = 0, cap = Math.min(previewInst.instanceMatrix.count, 40000), R = Math.ceil(r * 1.25);
  for (var dz = -R; dz <= R && k < cap; dz++) for (var dx = -R; dx <= R && k < cap; dx++) {
    var x = c[0] + dx, z = c[2] + dz; if (!inB(x, L, z)) continue;
    if (Math.hypot(dx, dz) / (r * (1 + 0.22 * hydNoise(x, z, hydStroke ? hydStroke.seed : hydSeed))) >= 1) continue;
    var y = Math.min(SY - 1, L + 2 * r + 8); while (y > L && (!gget(x, y, z) || (hydAt(x, y, z) === 2 && !hydIsWater(x, y, z)))) y--; // por cima do chão de cada coluna (árvores e plantas não contam)
    m.makeScale(1, 0.15, 1); m.setPosition(x + 0.5, y + 1.08, z + 0.5); previewInst.setMatrixAt(k++, m);
  }
  previewInst.count = k; previewInst.instanceMatrix.needsUpdate = true; previewInst.material.color.copy(accent);
}
function openHydRules() {
  openDialog('<h3>Regras do Pincel de água</h3><p>Uma regra por linha: <code>água classe lugar = bloco %, bloco %</code>. <b>água</b>: <code>doce</code> (rio e lago) ou <code>mar</code> (oceano). <b>classe</b>: ' + Object.keys(HYD_CLASS_PT).map(function (k) { return '<code>' + k + '</code>'; }).join(', ') + ' (no mar, só temperado, morno, quente, frio e gelado). <b>lugar</b>: <code>margem</code>, <code>fundo</code>, <code>plantas</code>, <code>recife</code>, <code>superficie</code>, <code>borda</code> e <code>gelo</code>. Cada número é a chance em % para cada bloco; o resto fica como está. Nomes do Java, como na barra de status.</p>' +
    '<textarea id="hydTa" rows="16" spellcheck="false" style="width:100%;font-family:var(--font-mono,monospace);font-size:12px">' + esc(hydRulesTxt) + '</textarea>' +
    '<p id="hydBad" class="err"></p><div class="row"><button class="btn primary" id="hydOk">Usar</button><button class="btn" id="hydDef">Voltar ao padrão</button><button class="btn" id="hydNo">Cancelar</button></div>', function () {
    var check = function () { var a = hydParse($('hydTa').value).bad; $('hydBad').textContent = a.length ? 'Linhas com erro (ficam de fora): ' + a.join(' · ') : ''; };
    $('hydTa').oninput = check; check();
    $('hydOk').onclick = function () { hydRulesTxt = $('hydTa').value; hydRules = null; try { localStorage.setItem('bloco-a-bloco-agua-regras', hydRulesTxt); } catch (e) {} closeDialog(); var R = hydRulesGet(), n = 0; ['doce', 'mar'].forEach(function (w) { for (var c in R[w]) n += Object.keys(R[w][c]).length; }); toast('Regras do Pincel de água: ' + n + ' em uso.'); };
    $('hydDef').onclick = function () { $('hydTa').value = HYD_RULES_DEF; check(); };
    $('hydNo').onclick = closeDialog;
  });
}
