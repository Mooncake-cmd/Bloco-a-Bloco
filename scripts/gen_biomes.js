// Gera data/biomes.json: os biomas do Bedrock com o número que o jogo grava no mundo, nome em português, clima e cores
// (grama, folhas e água como o jogo pinta; cor do mapa para mostrar os biomas). Precisa do bedrock-samples extraído:
// BEDROCK_SAMPLES_DIR=<pasta com behavior_pack, resource_pack e metadata> node scripts/gen_biomes.js
const fs = require('fs'), path = require('path');
const { PNG } = require('pngjs');
const S = process.env.BEDROCK_SAMPLES_DIR; if (!S) { console.error('Defina BEDROCK_SAMPLES_DIR.'); process.exit(1); }
const ROOT = path.resolve(__dirname, '..');
const ids = JSON.parse(fs.readFileSync(path.join(S, 'metadata/vanilladata_modules/mojang-biomes.json'), 'utf8')).data_items;
const rd = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '').replace(/^\s*\/\/.*$/mg, '')); } catch (e) { return null; } };
const maps = {};
const cmap = n => maps[n] || (maps[n] = PNG.sync.read(fs.readFileSync(path.join(S, 'resource_pack/textures/colormap', n + '.png'))));
// colormap do jogo: x pela temperatura, y pela chuva vezes temperatura
function sample(n, t, d) {
  const png = cmap(n); t = Math.max(0, Math.min(1, t)); d = Math.max(0, Math.min(1, d)) * t;
  const x = Math.round((1 - t) * (png.width - 1)), y = Math.round((1 - d) * (png.height - 1)), i = (y * png.width + x) * 4;
  return (png.data[i] << 16) | (png.data[i + 1] << 8) | png.data[i + 2];
}
const hex = s => parseInt(String(s).replace('#', ''), 16);
// cor no mapa dos biomas (bem distintas entre si, no estilo dos mapas de biomas); variantes (colinas, mutated) um pouco mais claras
const MAPC = [[/^deep_frozen_ocean|^frozen_ocean|^legacy_frozen/, 0x9090c0], [/^deep_cold_ocean/, 0x202070], [/^cold_ocean/, 0x2080c0], [/^deep_lukewarm/, 0x004a80],
  [/^lukewarm_ocean/, 0x0070c0], [/^deep_warm/, 0x005070], [/^warm_ocean/, 0x00a0b0], [/^deep_ocean/, 0x000030], [/ocean/, 0x000070], [/^frozen_river/, 0xa0a0ff], [/river/, 0x3060ff],
  [/^stone_beach/, 0xa2a284], [/^cold_beach/, 0xfaf0c0], [/beach|shore/, 0xfade55], [/^desert/, 0xfa9418], [/^mesa/, 0xd94515], [/^savanna/, 0xbdb25f],
  [/^ice_plains_spikes/, 0xb4dcdc], [/^ice|^snowy_slopes|^grove|^frozen_peaks|^jagged/, 0xf0f0f0], [/^cold_taiga/, 0x31554a], [/^mangrove/, 0x2ccc8e], [/^swamp/, 0x07a072],
  [/^bamboo/, 0x768e14], [/^jungle_edge/, 0x628b17], [/^jungle/, 0x537b09], [/^mega_taiga|^redwood/, 0x596651], [/^taiga/, 0x0b6659], [/^roofed/, 0x40511a],
  [/^birch/, 0x307444], [/^flower_forest/, 0x2d8e49], [/^forest/, 0x056621], [/^cherry/, 0xf2a6c6], [/^pale_garden/, 0x969c8c], [/^dappled/, 0xe68e30], [/^meadow/, 0x83bb6d],
  [/^sunflower/, 0xb5db88], [/^plains/, 0x8db360], [/^extreme_hills_plus/, 0x507050], [/^extreme_hills/, 0x606060], [/^stony_peaks/, 0x9e9e9e],
  [/^mushroom/, 0xff00ff], [/^hell/, 0xbf3b3b], [/^crimson/, 0xdd0808], [/^warped/, 0x49907b], [/^soulsand/, 0x5e3830], [/^basalt/, 0x403636], [/^the_end/, 0x8080ff],
  [/^lush/, 0x6a9e2a], [/^dripstone/, 0x7c6650], [/^deep_dark/, 0x0c1a20], [/^sulfur/, 0xc4b030]];
function mapColor(n, def) {
  let c = def; for (const [r, v] of MAPC) if (r.test(n)) { c = v; break; }
  if (/_hills|_mutated|_edge|_plateau/.test(n)) { const f = v => Math.min(255, Math.round(v * 1.12 + 10)); c = (f(c >> 16 & 255) << 16) | (f(c >> 8 & 255) << 8) | f(c & 255); }
  return c;
}
const PT = {
  bamboo_jungle: 'Selva de bambu', bamboo_jungle_hills: 'Colinas da selva de bambu', basalt_deltas: 'Deltas de basalto', beach: 'Praia',
  birch_forest: 'Floresta de bétulas', birch_forest_hills: 'Colinas da floresta de bétulas', birch_forest_hills_mutated: 'Colinas de bétulas altas',
  birch_forest_mutated: 'Floresta de bétulas altas', cherry_grove: 'Bosque de cerejeiras', cold_beach: 'Praia nevada', cold_ocean: 'Oceano frio',
  cold_taiga: 'Taiga nevada', cold_taiga_hills: 'Colinas da taiga nevada', cold_taiga_mutated: 'Taiga nevada (variante)', crimson_forest: 'Floresta carmesim',
  dappled_forest: 'Floresta salpicada', deep_cold_ocean: 'Oceano frio profundo', deep_dark: 'Escuridão profunda', deep_frozen_ocean: 'Oceano congelado profundo',
  deep_lukewarm_ocean: 'Oceano morno profundo', deep_ocean: 'Oceano profundo', deep_warm_ocean: 'Oceano quente profundo', desert: 'Deserto',
  desert_hills: 'Colinas do deserto', desert_mutated: 'Deserto (variante)', dripstone_caves: 'Cavernas de espeleotemas', extreme_hills: 'Colinas varridas pelo vento',
  extreme_hills_edge: 'Borda das colinas', extreme_hills_mutated: 'Colinas de cascalho', extreme_hills_plus_trees: 'Floresta varrida pelo vento',
  extreme_hills_plus_trees_mutated: 'Floresta varrida pelo vento (variante)', flower_forest: 'Floresta de flores', forest: 'Floresta', forest_hills: 'Colinas da floresta',
  frozen_ocean: 'Oceano congelado', frozen_peaks: 'Picos congelados', frozen_river: 'Rio congelado', grove: 'Bosque nevado', hell: 'Desertos do Nether',
  ice_mountains: 'Montanhas de gelo', ice_plains: 'Planície nevada', ice_plains_spikes: 'Pináculos de gelo', jagged_peaks: 'Picos irregulares', jungle: 'Selva',
  jungle_edge: 'Selva esparsa', jungle_edge_mutated: 'Selva esparsa (variante)', jungle_hills: 'Colinas da selva', jungle_mutated: 'Selva (variante)',
  legacy_frozen_ocean: 'Oceano congelado (antigo)', lukewarm_ocean: 'Oceano morno', lush_caves: 'Cavernas exuberantes', mangrove_swamp: 'Pântano de mangue',
  meadow: 'Prado', mega_taiga: 'Taiga de pinheiros antigos', mega_taiga_hills: 'Colinas da taiga antiga', mesa: 'Terras áridas (mesa)', mesa_bryce: 'Terras áridas erodidas',
  mesa_plateau: 'Planalto das terras áridas', mesa_plateau_mutated: 'Planalto das terras áridas (variante)', mesa_plateau_stone: 'Terras áridas com árvores',
  mesa_plateau_stone_mutated: 'Terras áridas com árvores (variante)', mushroom_island: 'Campos de cogumelos', mushroom_island_shore: 'Praia dos cogumelos',
  ocean: 'Oceano', pale_garden: 'Jardim pálido', plains: 'Planície', redwood_taiga_hills_mutated: 'Colinas de abetos antigos', redwood_taiga_mutated: 'Taiga de abetos antigos',
  river: 'Rio', roofed_forest: 'Floresta escura', roofed_forest_mutated: 'Floresta escura (variante)', savanna: 'Savana', savanna_mutated: 'Savana varrida pelo vento',
  savanna_plateau: 'Planalto da savana', savanna_plateau_mutated: 'Planalto da savana (variante)', snowy_slopes: 'Encostas nevadas', soulsand_valley: 'Vale das almas',
  stone_beach: 'Costa de pedra', stony_peaks: 'Picos rochosos', sulfur_caves: 'Cavernas de enxofre', sunflower_plains: 'Planície de girassóis', swampland: 'Pântano',
  swampland_mutated: 'Pântano (variante)', taiga: 'Taiga', taiga_hills: 'Colinas da taiga', taiga_mutated: 'Taiga (variante)', the_end: 'O End', warm_ocean: 'Oceano quente',
  warped_forest: 'Floresta distorcida'
};
const out = [];
for (const it of ids) {
  const n = it.name.replace('minecraft:', '');
  const bh = rd(path.join(S, 'behavior_pack/biomes', n + '.biome.json')), cl = rd(path.join(S, 'resource_pack/biomes', n + '.client_biome.json'));
  const comp = bh ? bh['minecraft:biome'].components : {}, cc = cl ? cl['minecraft:client_biome'].components : {};
  const clim = comp['minecraft:climate'] || {}, t = clim.temperature != null ? clim.temperature : 0.5, d = clim.downfall != null ? clim.downfall : 0.5;
  const tags = (comp['minecraft:tags'] || {}).tags || [];
  const pick = (a, def) => { const c = a && a.color; if (!c) return sample(def, t, d); if (typeof c === 'string') return hex(c); if (c.color_map) return sample(c.color_map === 'grass' || c.color_map === 'foliage' ? c.color_map : c.color_map, t, d); return sample(def, t, d); };
  let grass, foliage;
  try { grass = pick(cc['minecraft:grass_appearance'], 'grass'); } catch (e) { grass = sample('grass', t, d); }
  try { foliage = pick(cc['minecraft:foliage_appearance'], 'foliage'); } catch (e) { foliage = sample('foliage', t, d); }
  const wa = cc['minecraft:water_appearance'], water = wa && wa.surface_color ? hex(wa.surface_color) : 0x44AFF5;
  const dim = tags.includes('nether') ? 1 : tags.includes('the_end') ? 2 : 0;
  // neva onde a temperatura é baixa (o jogo ainda esfria com a altura); sem chuva nenhuma nos secos (deserto, savana, terras áridas, Nether, End)
  const dry = d <= 0 || tags.includes('nether') || tags.includes('the_end');
  out.push({ id: it.id, n, pt: PT[n] || n, t: +t.toFixed(2), d: +d.toFixed(2), rain: dry ? 0 : t < 0.15 ? 2 : 1, grass, foliage, water, map: mapColor(n, foliage), dim,
    tags: tags.filter(x => /^(frozen|cold|ocean|deep|river|beach|swamp|mesa|desert|jungle|taiga|forest|plains|mountains|hills|nether|the_end|caves|mushroom_island|monster|animal|savanna|lush_caves|deep_dark)$/.test(x)) });
}
out.sort((a, b) => a.pt.localeCompare(b.pt, 'pt'));
fs.writeFileSync(path.join(ROOT, 'data/biomes.json'), JSON.stringify(out));
console.error('biomas', out.length, 'sem nome:', out.filter(b => b.pt === b.n).map(b => b.n).join(' '));
