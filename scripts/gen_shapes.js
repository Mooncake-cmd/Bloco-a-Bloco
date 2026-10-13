// Gera data/shapes.json: blocos que não são cubos inteiros (escadas, lajes, portas, redstone, plantas, baús...).
// Usa os modelos e blockstates do Java (minecraft-assets 26.1), os estados do minecraft-data (Java 1.21.11)
// e a tabela Java -> Bedrock do minecraft-data (blocksJ2B). Rodar depois de gen_blocks.js.
const fs = require('fs'), path = require('path');
const { PNG } = require('pngjs');
const jd = require('minecraft-data')('1.21.11');
const bd = require('minecraft-data')('bedrock_1.26.51');
const assets = require('minecraft-assets')('26.1');
const MD = path.join(path.dirname(require.resolve('minecraft-data/package.json')), 'minecraft-data', 'data');
const dataPaths = JSON.parse(fs.readFileSync(path.join(MD, 'dataPaths.json'), 'utf8'));
const J2B = JSON.parse(fs.readFileSync(path.join(MD, dataPaths.bedrock['1.26.51'].blocksJ2B, 'blocksJ2B.json'), 'utf8'));
const BEDROCK_SAMPLES = 'https://raw.githubusercontent.com/Mojang/bedrock-samples/46ba6ea985fb5a92d79a9419198f10dda14c199d/resource_pack/';
const ROOT = path.resolve(__dirname, '..');
const cube = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/blocks.json'), 'utf8'));
const cubeNames = new Set(cube.map(r => r[0]));
const BE_TEX = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/bedrock_textures.json'), 'utf8'));
const M = assets.blocksModels, S = assets.blocksStates;
const clean = s => s.replace('minecraft:', '').replace(/^block\//, '');
// Texturas no formato novo ({sprite, force_translucent}) viram texto; as translúcidas ficam anotadas
const TRANSLUCENT = new Set();
for (const n in M) { const t = M[n].textures || {}; for (const k in t) if (t[k] && typeof t[k] === 'object') { if (t[k].force_translucent) TRANSLUCENT.add(clean(t[k].sprite)); t[k] = t[k].sprite; } }

// ---------- Quais blocos ----------
const SKIP = /^(air|cave_air|void_air|water|lava|bubble_column|moving_piston|piston_head|structure_void|structure_block|jigsaw|barrier|light|command_block|chain_command_block|repeating_command_block|test_block|test_instance_block|frosted_ice|bedrock|infested_.*|budding_amethyst|reinforced_deepslate|spawner|trial_spawner|vault|petrified_oak_slab|sculk_sensor_x)$/;

// ---------- Propriedades ----------
function jprops(b) {
  return (b.states || []).map(s => ({ name: s.name, values: s.values || (s.type === 'bool' ? ['true', 'false'] : [...Array(s.num_values).keys()].map(String)) }));
}
function jdefaults(b) {
  let i = b.defaultState - b.minStateId; const out = {}; const st = jprops(b);
  for (let k = st.length - 1; k >= 0; k--) { const n = st[k].values.length, idx = i % n; i = Math.floor(i / n); out[st[k].name] = st[k].values[idx]; }
  return out;
}
const FIXED = new Set(['waterlogged', 'distance', 'persistent', 'snowy', 'unstable', 'triggered', 'enabled', 'locked', 'conditional',
  'has_book', 'has_record', 'signal_fire', 'sculk_sensor_phase', 'shrieking', 'can_summon', 'bottom', 'natural', 'note', 'instrument',
  'short', 'extended', 'occupied', 'disarmed', 'drag', 'dusted', 'honey_level', 'has_bottle_0', 'has_bottle_1', 'has_bottle_2',
  'cracked', 'side_chain', 'slot_0_occupied', 'slot_1_occupied', 'slot_2_occupied', 'slot_3_occupied', 'slot_4_occupied', 'slot_5_occupied',
  'tip', 'creaking_heart_state', 'ominous', 'vault_state', 'trial_spawner_state', 'crafting', 'moisture', 'inverted']);
// Propriedades calculadas pelos vizinhos, por família
function family(n, props) {
  const has = p => props.some(x => x.name === p);
  if (n === 'redstone_wire') return ['wire', ['north', 'east', 'south', 'west', 'power']];
  if (n === 'tripwire') return ['tripwire', ['north', 'east', 'south', 'west', 'attached', 'powered']];
  if (n === 'tripwire_hook') return ['hook', ['attached', 'powered']];
  if (n === 'chorus_plant') return ['chorus', ['north', 'east', 'south', 'west', 'up', 'down']];
  if (/_fence_gate$/.test(n)) return ['gate', ['in_wall', 'powered']];
  if (/_fence$/.test(n)) return ['fence', ['north', 'east', 'south', 'west']];
  if (/_wall$/.test(n) && has('up') && has('north')) return ['wall', ['north', 'east', 'south', 'west', 'up']];
  if (/(glass_pane|_bars)$/.test(n)) return ['pane', ['north', 'east', 'south', 'west']];
  if (/_stairs$/.test(n)) return ['stairs', ['shape']];
  if (/chest$/.test(n) && has('type')) return ['chest', ['type']];
  return [null, []];
}
// Ordem de preferência da ferramenta Usar (abrir/fechar, ligar/desligar, idade das plantas...)
const TOGGLE = ['open', 'eye', 'lit', 'powered', 'mode', 'delay', 'age', 'bites', 'candles', 'layers', 'pickles', 'eggs', 'hatch',
  'level', 'charges', 'flower_amount', 'segment_amount', 'hydration', 'berries', 'leaves', 'stage', 'tilt', 'thickness',
  'copper_golem_pose', 'power', 'rotation'];
// Propriedades de direção (ferramenta Girar)
const ORIENT = ['facing', 'half', 'hinge', 'type', 'face', 'axis', 'rotation', 'hanging', 'attachment', 'shape', 'vertical_direction', 'orientation'];
// powered só é escolha do usuário em alavanca, botões e placas de pressão; nos outros acompanha o estado padrão
const POWER_STORED = /(lever|_button|_pressure_plate|repeater|comparator|daylight_detector|lightning_rod)$/;

// ---------- Modelos ----------
const usedModels = new Set();
function addModel(n) { n = clean(n); if (usedModels.has(n) || !M[n]) return; usedModels.add(n); if (M[n].parent) addModel(M[n].parent); }
function modelChain(n) { const out = []; let m = M[clean(n)]; for (let d = 0; m && d < 20; d++) { out.push(m); m = m.parent ? M[clean(m.parent)] : null; } return out; }
function modelTextures(n) {
  const ch = modelChain(n), tex = {}; let elements = null;
  for (const m of ch) { for (const k in (m.textures || {})) if (!(k in tex)) tex[k] = m.textures[k]; if (!elements && m.elements) elements = m.elements; }
  const res = v => { for (let i = 0; i < 10 && v && v.startsWith('#'); i++) v = tex[v.slice(1)]; return v && !v.startsWith('#') ? clean(v) : null; };
  const names = new Set(), tinted = new Set();
  (elements || []).forEach(e => Object.values(e.faces || {}).forEach(f => { const r = res(f.texture); if (r) { names.add(r); if (f.tintindex != null && f.tintindex >= 0) tinted.add(r); } }));
  return { names, tinted, particle: res('#particle'), hasElements: !!(elements && elements.length) };
}
function stateModels(st) {
  const ms = [];
  if (st.variants) for (const k in st.variants) { const v = st.variants[k]; (Array.isArray(v) ? v : [v]).forEach(x => ms.push(x.model)); }
  if (st.multipart) st.multipart.forEach(p => (Array.isArray(p.apply) ? p.apply : [p.apply]).forEach(x => ms.push(x.model)));
  return ms;
}

// ---------- Geometria própria para blocos que o jogo desenha como entidade ----------
// Elementos no formato de modelo do Minecraft. Para texturas de entidade 64x64, uv = pixel / 4.
function box(from, to, tex, uvs) {
  const faces = {};
  for (const d of ['down', 'up', 'north', 'south', 'west', 'east']) faces[d] = uvs && uvs[d] ? { texture: '#' + tex, uv: uvs[d] } : { texture: '#' + tex };
  return { from, to, faces };
}
// Caixa de entidade (desdobramento padrão do Minecraft): offset (u,v) em pixels, tamanho w x h x d, textura 64x64
function entityBox(from, to, u, v, w, h, d, tex) {
  const s = 1 / 4, r = (a, b, c, e) => [a * s, b * s, c * s, e * s];
  return box(from, to, tex, {
    up: r(u + d, v, u + d + w, v + d), down: r(u + d + w, v, u + d + 2 * w, v + d),
    north: r(u + d, v + d, u + d + w, v + d + h), south: r(u + 2 * d + w, v + d, u + 2 * d + 2 * w, v + d + h),
    west: r(u, v + d, u + d, v + d + h), east: r(u + d + w, v + d, u + 2 * d + w, v + d + h)
  });
}
const ENT = {};
function horizontalStates(model, extra) {
  const v = {};
  for (const [f, y] of [['north', 0], ['east', 90], ['south', 180], ['west', 270]]) v['facing=' + f + (extra || '')] = { model, y };
  return { variants: v };
}
function chestModel(name, tex) {
  // baú do Java: base 14x10x14 (uv 0,19), tampa 14x5x14 (uv 0,0), fecho 2x4x1 (uv 0,0); a frente fica para o norte
  return { textures: { c: tex, particle: 'block/oak_planks' }, elements: [
    entityBox([1, 0, 1], [15, 10, 15], 0, 19, 14, 10, 14, 'c'),
    entityBox([1, 9, 1], [15, 14, 15], 0, 0, 14, 5, 14, 'c'),
    entityBox([7, 7, 0], [9, 11, 1], 0, 0, 2, 4, 1, 'c')
  ] };
}
function rotStates(model, rotProp) {
  const v = {};
  for (let r = 0; r < 16; r++) v[rotProp + '=' + r] = { model, yf: r * 22.5 };
  return { variants: v };
}
const WOOD_OF = n => n.replace(/_(wall_)?(hanging_)?sign$/, '');
function planks(w) { return ['crimson', 'warped'].includes(w) ? w + '_planks' : w === 'bamboo' ? 'bamboo_planks' : w + '_planks'; }
const BED_WOOL = c => (c === 'light_gray' ? 'light_gray' : c) + '_wool';
const HEAD_TEX = { skeleton: 'bone_block_side', wither_skeleton: 'blackstone', zombie: 'green_terracotta', creeper: 'lime_concrete_powder', player: 'brown_terracotta', dragon: 'black_concrete', piglin: 'pink_terracotta' };
function entityGeometry(n) {
  let m;
  if ((m = /^(chest|trapped_chest|ender_chest|(?:waxed_)?(?:(exposed|weathered|oxidized)_)?copper_chest)$/.exec(n))) {
    const tex = n === 'ender_chest' ? 'entity/chest/ender' : n === 'trapped_chest' ? 'entity/chest/trapped' : /copper/.test(n) ? 'entity/chest/copper' + (m[2] ? '_' + m[2] : '') : 'entity/chest/normal';
    return { model: chestModel(n, tex), states: horizontalStates('bab:' + n) };
  }
  if ((m = /^(\w+?)_bed$/.exec(n))) {
    const w = BED_WOOL(m[1]);
    // pé e cabeceira: colchão de lã sobre pés de madeira; travesseiro branco na cabeceira (a cabeceira fica do lado da direção)
    const foot = { textures: { w: 'block/' + w, l: 'block/oak_planks', particle: 'block/' + w }, elements: [box([0, 3, 0], [16, 9, 16], 'w'), box([0, 0, 13], [3, 3, 16], 'l'), box([13, 0, 13], [16, 3, 16], 'l')] };
    const head = { textures: { w: 'block/' + w, p: 'block/white_wool', l: 'block/oak_planks', particle: 'block/' + w }, elements: [box([0, 3, 0], [16, 9, 16], 'w'), box([1, 9, 1], [15, 10, 7], 'p'), box([0, 0, 0], [3, 3, 3], 'l'), box([13, 0, 0], [16, 3, 3], 'l')] };
    const v = {};
    for (const [f, y] of [['north', 0], ['east', 90], ['south', 180], ['west', 270]]) { v['facing=' + f + ',part=foot'] = { model: 'bab:' + n + '_foot', y }; v['facing=' + f + ',part=head'] = { model: 'bab:' + n + '_head', y }; }
    return { models: { [n + '_foot']: foot, [n + '_head']: head }, states: { variants: v } };
  }
  if (/_wall_hanging_sign$/.test(n)) {
    const p = planks(WOOD_OF(n));
    return { model: { textures: { p: 'block/' + p, particle: 'block/' + p }, elements: [box([1, 0, 7], [15, 10, 9], 'p'), box([0, 14, 6], [16, 16, 10], 'p')] }, states: horizontalStates('bab:' + n) };
  }
  if (/_hanging_sign$/.test(n)) {
    const p = planks(WOOD_OF(n));
    const mm = { textures: { p: 'block/' + p, particle: 'block/' + p }, elements: [box([1, 0, 7], [15, 10, 9], 'p'), box([4, 10, 8], [5, 16, 8.1], 'p'), box([11, 10, 8], [12, 16, 8.1], 'p')] };
    const v = {}; for (let r = 0; r < 16; r++) for (const a of ['true', 'false']) v['attached=' + a + ',rotation=' + r] = { model: 'bab:' + n, yf: r * 22.5 };
    return { model: mm, states: { variants: v } };
  }
  if (/_wall_sign$/.test(n)) {
    const p = planks(WOOD_OF(n));
    return { model: { textures: { p: 'block/' + p, particle: 'block/' + p }, elements: [box([0, 4.5, 14], [16, 12.5, 16], 'p')] }, states: horizontalStates('bab:' + n) };
  }
  if (/_sign$/.test(n)) {
    const p = planks(WOOD_OF(n));
    return { model: { textures: { p: 'block/' + p, particle: 'block/' + p }, elements: [box([0, 7, 7], [16, 15, 9], 'p'), box([7, 0, 7.25], [9, 7, 8.75], 'p')] }, states: rotStates('bab:' + n, 'rotation') };
  }
  if ((m = /^(\w+?)_wall_banner$/.exec(n))) {
    return { model: { textures: { w: 'block/' + m[1] + '_wool', s: 'block/oak_planks', particle: 'block/' + m[1] + '_wool' }, elements: [box([1, -14, 15], [15, 14, 16], 'w'), box([0, 13, 14], [16, 15, 16], 's')] }, states: horizontalStates('bab:' + n) };
  }
  if ((m = /^(\w+?)_banner$/.exec(n))) {
    return { model: { textures: { w: 'block/' + m[1] + '_wool', s: 'block/oak_planks', particle: 'block/' + m[1] + '_wool' }, elements: [box([7, 0, 7], [9, 28, 9], 's'), box([1, 2, 6], [15, 28, 7], 'w'), box([0, 28, 6], [16, 30, 8], 's')] }, states: rotStates('bab:' + n, 'rotation') };
  }
  if ((m = /^(\w+?)_wall_(skull|head)$/.exec(n))) {
    const t = HEAD_TEX[m[1]] || 'brown_terracotta';
    return { model: { textures: { h: 'block/' + t, particle: 'block/' + t }, elements: [box([4, 4, 8], [12, 12, 16], 'h')] }, states: horizontalStates('bab:' + n) };
  }
  if ((m = /^(\w+?)_(skull|head)$/.exec(n))) {
    const t = HEAD_TEX[m[1]] || 'brown_terracotta';
    return { model: { textures: { h: 'block/' + t, particle: 'block/' + t }, elements: [box([4, 0, 4], [12, 8, 12], 'h')] }, states: rotStates('bab:' + n, 'rotation') };
  }
  if ((m = /^(?:(\w+)_)?shulker_box$/.exec(n))) {
    const t = (m[1] ? m[1] + '_' : '') + 'shulker_box';
    return { model: { textures: { s: 'block/' + t, particle: 'block/' + t }, elements: [box([0, 0, 0], [16, 16, 16], 's')] }, states: { variants: { '': { model: 'bab:' + n } } } };
  }
  if (n === 'end_portal') return { model: { textures: { e: 'entity/end_portal', particle: 'entity/end_portal' }, elements: [box([0, 6, 0], [16, 12, 16], 'e')] }, states: { variants: { '': { model: 'bab:' + n } } } };
  if (n === 'end_gateway') return { model: { textures: { e: 'entity/end_portal', particle: 'entity/end_portal' }, elements: [box([0, 0, 0], [16, 16, 16], 'e')] }, states: { variants: { '': { model: 'bab:' + n } } } };
  if (n === 'conduit') return { model: { textures: { c: 'block/conduit', particle: 'block/conduit' }, elements: [box([5, 5, 5], [11, 11, 11], 'c')] }, states: { variants: { '': { model: 'bab:' + n } } } };
  if (n === 'decorated_pot') return { model: { textures: { t: 'block/terracotta', particle: 'block/terracotta' }, elements: [box([1, 0, 1], [15, 13, 15], 't'), box([4, 13, 4], [12, 16, 12], 't')] }, states: horizontalStates('bab:' + n) };
  return null;
}

// ---------- Texturas: cor média (sem pacote) e caminho Bedrock ----------
function readPng(name) {
  // entity/end_portal mudou para entity/end_portal/end_portal no 26.1; o nome usado é o do Java 1.21
  for (const n of [name, name + '/' + name.split('/').pop()]) {
    const f = path.join(assets.directory, n.startsWith('entity/') ? '' : 'blocks', n + '.png');
    if (fs.existsSync(f)) return PNG.sync.read(fs.readFileSync(f));
  }
  return null;
}
function avgOf(name) {
  const png = readPng(name); if (!png) return null;
  let r = 0, g = 0, b = 0, a = 0, n = 0; const h = Math.min(png.height, png.width);
  for (let y = 0; y < h; y++) for (let x = 0; x < png.width; x++) {
    const i = (y * png.width + x) * 4, al = png.data[i + 3]; if (al < 10) continue;
    r += png.data[i]; g += png.data[i + 1]; b += png.data[i + 2]; a += al; n++;
  }
  return n ? [Math.round(r / n), Math.round(g / n), Math.round(b / n)] : null;
}
async function fetchJson(u) {
  const r = await fetch(u); if (!r.ok) throw new Error(u + ': ' + r.status);
  return JSON.parse((await r.text()).replace(/^﻿/, '').replace(/^\s*\/\/.*$/mg, ''));
}
const norm = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
// Equivalências de nome Java -> Bedrock que nem o nome nem a lista de cubos resolvem
const BE_SYN = {
  oak_door_top: 'door_wood_upper', oak_door_bottom: 'door_wood_lower', iron_door_top: 'door_iron_upper', iron_door_bottom: 'door_iron_lower',
  spruce_door_top: 'door_spruce_upper', spruce_door_bottom: 'door_spruce_lower', birch_door_top: 'door_birch_upper', birch_door_bottom: 'door_birch_lower',
  jungle_door_top: 'door_jungle_upper', jungle_door_bottom: 'door_jungle_lower', acacia_door_top: 'door_acacia_upper', acacia_door_bottom: 'door_acacia_lower',
  dark_oak_door_top: 'door_dark_oak_upper', dark_oak_door_bottom: 'door_dark_oak_lower', oak_trapdoor: 'trapdoor', iron_trapdoor: 'iron_trapdoor',
  torch: 'torch_on', redstone_torch: 'redstone_torch_on', redstone_torch_off: 'redstone_torch_off', soul_torch: 'soul_torch',
  rail: 'rail_normal', rail_corner: 'rail_normal_turned', powered_rail: 'rail_golden', powered_rail_on: 'rail_golden_powered',
  detector_rail: 'rail_detector', detector_rail_on: 'rail_detector_powered', activator_rail: 'rail_activator', activator_rail_on: 'rail_activator_powered',
  redstone_dust_dot: 'redstone_dust_cross', redstone_dust_line0: 'redstone_dust_line', redstone_dust_line1: 'redstone_dust_line',
  repeater: 'repeater_off', repeater_on: 'repeater_on', comparator: 'comparator_off', comparator_on: 'comparator_on',
  tripwire: 'trip_wire', tripwire_hook: 'trip_wire_source', lever: 'lever', glass_pane_top: 'glass_pane_top', iron_bars: 'iron_bars',
  ladder: 'ladder', vine: 'vine', lily_pad: 'carried_waterlily', short_grass: 'tallgrass', fern: 'fern', dandelion: 'flower_dandelion',
  poppy: 'flower_rose', blue_orchid: 'flower_blue_orchid', allium: 'flower_allium', azure_bluet: 'flower_houstonia', red_tulip: 'flower_tulip_red',
  orange_tulip: 'flower_tulip_orange', white_tulip: 'flower_tulip_white', pink_tulip: 'flower_tulip_pink', oxeye_daisy: 'flower_oxeye_daisy',
  oak_sapling: 'sapling_oak', spruce_sapling: 'sapling_spruce', birch_sapling: 'sapling_birch', jungle_sapling: 'sapling_jungle',
  acacia_sapling: 'sapling_acacia', dark_oak_sapling: 'sapling_roofed_oak', dead_bush: 'deadbush', sugar_cane: 'reeds', cobweb: 'web',
  brown_mushroom: 'mushroom_brown', red_mushroom: 'mushroom_red', end_portal_frame_top: 'endframe_top', end_portal_frame_side: 'endframe_side',
  end_portal_frame_eye: 'endframe_eye', cake_top: 'cake_top', cake_side: 'cake_side', cake_bottom: 'cake_bottom', cake_inner: 'cake_inner',
  hopper_outside: 'hopper_outside', hopper_inside: 'hopper_inside', hopper_top: 'hopper_top', anvil: 'anvil_base', anvil_top: 'anvil_top_damaged_0',
  chipped_anvil_top: 'anvil_top_damaged_1', damaged_anvil_top: 'anvil_top_damaged_2', flower_pot: 'flower_pot', cauldron_side: 'cauldron_side',
  cauldron_top: 'cauldron_top', cauldron_bottom: 'cauldron_bottom', cauldron_inner: 'cauldron_inner', brewing_stand: 'brewing_stand',
  brewing_stand_base: 'brewing_stand_base', enchanting_table_top: 'enchanting_table_top', enchanting_table_side: 'enchanting_table_side',
  enchanting_table_bottom: 'enchanting_table_bottom', daylight_detector_top: 'daylight_detector_top', daylight_detector_side: 'daylight_detector_side',
  daylight_detector_inverted_top: 'daylight_detector_inverted_top', snow: 'snow', farmland: 'farmland_dry', farmland_moist: 'farmland_wet',
  dirt_path_top: 'grass_path_top', dirt_path_side: 'grass_path_side', cactus_top: 'cactus_top', cactus_side: 'cactus_side', cactus_bottom: 'cactus_bottom',
  sea_pickle: 'sea_pickle', kelp: 'kelp_a', kelp_plant: 'kelp_top', seagrass: 'seagrass', tall_seagrass_top: 'seagrass_doubletall_top_a',
  tall_seagrass_bottom: 'seagrass_doubletall_bottom_a', wheat_stage0: 'wheat_stage_0', piston_top: 'piston_top_normal', piston_top_sticky: 'piston_top_sticky',
  piston_side: 'piston_side', piston_bottom: 'piston_bottom', piston_inner: 'piston_inner', lantern: 'lantern', soul_lantern: 'soul_lantern',
  chain: 'chain1', scaffolding_top: 'scaffolding_top', scaffolding_side: 'scaffolding_side', scaffolding_bottom: 'scaffolding_bottom',
  grindstone_side: 'grindstone_side', grindstone_round: 'grindstone_round', grindstone_pivot: 'grindstone_pivot', stonecutter_top: 'stonecutter2_top',
  stonecutter_side: 'stonecutter2_side', stonecutter_bottom: 'stonecutter2_bottom', stonecutter_saw: 'stonecutter2_saw', bell_top: 'bell_top',
  campfire_log: 'campfire_log', campfire_log_lit: 'campfire_log_lit', campfire_fire: 'campfire', soul_campfire_fire: 'soul_campfire',
  composter_side: 'composter_side', composter_top: 'composter_top', composter_bottom: 'composter_bottom', lectern_top: 'lectern_top',
  lectern_sides: 'lectern_sides', lectern_front: 'lectern_front', lectern_base: 'lectern_base', end_rod: 'end_rod', lightning_rod: 'lightning_rod',
  fire_0: 'fire_0', fire_1: 'fire_1', soul_fire_0: 'soul_fire_0', bamboo_stalk: 'bamboo_stem', large_fern_top: 'double_plant_fern_top',
  large_fern_bottom: 'double_plant_fern_bottom', tall_grass_top: 'double_plant_grass_top', tall_grass_bottom: 'double_plant_grass_bottom',
  sunflower_top: 'double_plant_sunflower_top', sunflower_bottom: 'double_plant_sunflower_bottom', sunflower_front: 'double_plant_sunflower_front',
  sunflower_back: 'double_plant_sunflower_back', lilac_top: 'double_plant_syringa_top', lilac_bottom: 'double_plant_syringa_bottom',
  rose_bush_top: 'double_plant_rose_top', rose_bush_bottom: 'double_plant_rose_bottom', peony_top: 'double_plant_paeonia_top',
  peony_bottom: 'double_plant_paeonia_bottom', nether_portal: 'portal', attached_melon_stem: 'melon_stem_connected', attached_pumpkin_stem: 'pumpkin_stem_connected',
  melon_stem: 'melon_stem_disconnected', pumpkin_stem: 'pumpkin_stem_disconnected', water_flow: 'water_flow', turtle_egg: 'turtle_egg_not_cracked',
  dragon_egg: 'dragon_egg', beacon: 'beacon', conduit: 'conduit_base', bamboo_large_leaves: 'bamboo_leaf', bamboo_small_leaves: 'bamboo_small_leaf'
};

(async () => {
  const terr = (await fetchJson(BEDROCK_SAMPLES + 'textures/terrain_texture.json')).texture_data;
  const bePaths = new Set();
  const addP = t => { if (typeof t === 'string') bePaths.add(t); else if (Array.isArray(t)) t.forEach(addP); else if (t && typeof t === 'object') { if (t.path) bePaths.add(t.path); if (t.variations) t.variations.forEach(addP); } };
  for (const k in terr) addP(terr[k].textures);
  const byNorm = {}; for (const p of bePaths) { const b = norm(p.split('/').pop()); if (!byNorm[b]) byNorm[b] = p; }
  // pares aprendidos dos cubos (nome Java -> caminho Bedrock)
  const learned = {};
  for (const r of cube) {
    const jt = Array.isArray(r[7]) ? r[7] : [r[7]], bt = Array.isArray(r[8]) ? r[8] : r[8] ? [r[8]] : [];
    jt.forEach((j, i) => { const k = bt[Math.min(i, bt.length - 1)]; const p = k && BE_TEX[k]; if (p && !learned[j]) learned[j] = Array.isArray(p) ? p[0] : p; });
  }
  const COLOR_BE = c => c === 'light_gray' ? 'silver' : c;
  const CORAL_BE = { tube: 'blue', brain: 'pink', bubble: 'purple', fire: 'red', horn: 'yellow' };
  function bePattern(j) {
    let m;
    if ((m = /^(\w+)_stained_glass_pane_top$/.exec(j))) return 'glass_pane_top_' + COLOR_BE(m[1]);
    if (j === 'shulker_box') return 'shulker_top_undyed';
    if ((m = /^(\w+)_shulker_box$/.exec(j))) return 'shulker_top_' + COLOR_BE(m[1]);
    if ((m = /^(dead_)?(tube|brain|bubble|fire|horn)_coral(_fan)?$/.exec(j))) return (m[3] ? 'coral_fan_' : 'coral_plant_') + CORAL_BE[m[2]] + (m[1] ? '_dead' : '');
    if ((m = /^(crimson|warped)_door_(top|bottom)$/.exec(j))) return 'huge_fungus/' + m[1] + '_door_' + (m[2] === 'top' ? 'top' : 'lower');
    if ((m = /^pointed_dripstone_(up|down)_tip_merge$/.exec(j))) return 'pointed_dripstone_' + m[1] + '_merge';
    return null;
  }
  Object.assign(BE_SYN, { cornflower: 'flower_cornflower', wither_rose: 'flower_wither_rose', lily_of_the_valley: 'flower_lily_of_the_valley',
    mushroom_stem: 'mushroom_block_skin_stem', iron_chain: 'chain1', smooth_stone_slab_side: 'stone_slab_side', cave_vines: 'cave_vines_head',
    cave_vines_lit: 'cave_vines_head_berries', cave_vines_plant: 'cave_vines_body', cave_vines_plant_lit: 'cave_vines_body_berries',
    weeping_vines: 'weeping_vines_base', weeping_vines_plant: 'weeping_vines_bottom', twisting_vines: 'twisting_vines_base',
    twisting_vines_plant: 'twisting_vines_bottom', big_dripleaf_side: 'big_dripleaf_side1', big_dripleaf_tip: 'big_dripleaf_side2',
    lightning_rod_on: 'lightning_rod_powered', pale_hanging_moss: 'pale_hanging_moss_middle', open_eyeblossom: 'eyeblossom_blooming',
    closed_eyeblossom: 'eyeblossom_dormant', bamboo_stage0: 'bamboo_sapling', flowering_azalea_leaves: 'azalea_leaves_flowers',
    pale_moss_carpet_side_tall: 'pale_moss_carpet_side_base', pale_moss_carpet_side_small: 'pale_moss_carpet_side_tip' });
  function bePathFor(j) {
    const pat = bePattern(j); if (pat && bePaths.has('textures/blocks/' + pat)) return 'textures/blocks/' + pat;
    if (j.startsWith('entity/')) return 'textures/' + j.replace(/^entity\/chest\/copper$/, 'entity/chest/copper_default');
    if (learned[j]) return learned[j];
    if (bePaths.has('textures/blocks/' + j)) return 'textures/blocks/' + j;
    if (BE_SYN[j]) { const p = 'textures/blocks/' + BE_SYN[j]; return bePaths.has(p) ? p : byNorm[norm(BE_SYN[j])] || null; }
    if (byNorm[norm(j)]) return byNorm[norm(j)];
    // "wheat_stage0" -> "wheat_stage_0"; "x_top" -> "x"
    const alt = [j.replace(/(\d+)$/, '_$1'), j.replace(/_(top|side|bottom|front)$/, '')];
    for (const a of alt) if (byNorm[norm(a)]) return byNorm[norm(a)];
    return null;
  }

  // Bedrock: estados padrão completos e versão por nome
  const beDef = {}; for (const s of bd.blockStates) if (!beDef[s.name]) beDef[s.name] = s;
  // J2B indexado por bloco Java
  const j2b = {};
  for (const k in J2B) {
    const m = /^minecraft:([^\[]+)\[(.*)\]$/.exec(k); if (!m) continue;
    const props = {}; if (m[2]) m[2].split(',').forEach(pv => { const [a, b] = pv.split('='); props[a] = b; });
    const v = /^minecraft:([^\[]+)\[(.*)\]$/.exec(J2B[k]); if (!v) continue;
    const bs = {}; if (v[2]) v[2].split(',').forEach(pv => { const i = pv.indexOf('='); bs[pv.slice(0, i)] = pv.slice(i + 1); });
    (j2b[m[1]] = j2b[m[1]] || []).push({ props, name: v[1], bs });
  }
  // Para cada estado Bedrock (e o nome), o menor conjunto de propriedades Java que o determina
  function beTable(entries, jpNames) {
    const keys = new Set(['#name']); entries.forEach(e => Object.keys(e.bs).forEach(k => keys.add(k)));
    // waterlogged por último: só entra quando nada mais explica o estado (ex.: dead_bit do pepino-do-mar)
    const names = jpNames.filter(p => p !== 'waterlogged').concat(jpNames.includes('waterlogged') ? ['waterlogged'] : []);
    const out = {};
    const val = (e, k) => k === '#name' ? e.name : e.bs[k];
    const combos = [[]]; names.forEach(a => combos.push([a])); names.forEach((a, i) => names.slice(i + 1).forEach(b => combos.push([a, b])));
    names.forEach((a, i) => names.slice(i + 1).forEach((b, j) => names.slice(i + j + 2).forEach(c => combos.push([a, b, c]))));
    for (const k of keys) {
      let found = null;
      for (const deps of combos) {
        const t = {}; let ok = true;
        for (const e of entries) { const key = deps.map(d => e.props[d]).join('|'), v = val(e, k); if (v === undefined) continue; if (key in t && t[key] !== v) { ok = false; break; } t[key] = v; }
        if (ok) { found = [deps, t]; break; }
      }
      if (!found) { // campos de bits (vine_direction_bits...): tabela com todas as propriedades
        const deps = names.filter(p => p !== 'waterlogged'), t = {};
        for (const e of entries) { const v = val(e, k); if (v !== undefined) t[deps.map(d => e.props[d]).join('|')] = v; }
        found = [deps, t];
      }
      out[k] = found;
    }
    return out;
  }

  const blocks = [], models = {}, states = {}, texAvg = {}, beTex = {}, beStates = {}, skipped = [];
  const allJava = new Set(jd.blocksArray.map(b => b.name));
  for (const b of jd.blocksArray) {
    const n = b.name;
    if (cubeNames.has(n) || SKIP.test(n)) continue;
    let st = S[n], ent = null;
    const props = jprops(b), defs = jdefaults(b);
    if (!st) { skipped.push(n + ' (sem blockstate)'); continue; }
    let ms = stateModels(st), info = ms.map(modelTextures);
    if (!info.some(i => i.hasElements)) {
      ent = entityGeometry(n);
      if (!ent) { skipped.push(n + ' (desenhado como entidade)'); continue; }
      if (ent.model) models['bab:' + n] = ent.model;
      if (ent.models) for (const k in ent.models) models['bab:' + k] = ent.models[k];
      st = ent.states;
    }
    if (!j2b[n]) { skipped.push(n + ' (sem equivalente Bedrock)'); continue; }
    // texturas usadas
    const tex = new Set(), tinted = new Set(); let particle = null;
    const modelNames = stateModels(st);
    for (const mn of modelNames) {
      if (mn.startsWith('bab:')) {
        const mm = models[mn]; const res = v => { for (let i = 0; i < 5 && v && v.startsWith('#'); i++) v = mm.textures[v.slice(1)]; return v && clean(v); };
        mm.elements.forEach(e => Object.values(e.faces).forEach(f => tex.add(res(f.texture))));
        particle = particle || res('#particle');
      } else { addModel(mn); const t = modelTextures(mn); t.names.forEach(x => tex.add(x)); t.tinted.forEach(x => tinted.add(x)); particle = particle || t.particle; }
    }
    if (particle) tex.add(particle);
    states[n] = st;
    const fam = family(n, props);
    const hasProp = p => props.some(x => x.name === p);
    const multi = hasProp('half') && props.find(x => x.name === 'half').values.includes('lower') ? { p: 'half', a: 'lower', b: 'upper', d: 'up' }
      : hasProp('part') && props.find(x => x.name === 'part').values.includes('foot') ? { p: 'part', a: 'foot', b: 'head', d: 'facing' } : null;
    const P = props.map(p => {
      let role = 's';
      if (fam[1].includes(p.name)) role = 'd';
      else if (FIXED.has(p.name)) role = 'f';
      else if (p.name === 'powered' && !POWER_STORED.test(n)) role = 'f';
      else if (p.name === 'power' && !/daylight_detector|target|sculk|weighted/.test(n)) role = 'f';
      else if (p.name === 'attached' && /tripwire/.test(n)) role = 'd';
      return [p.name, p.values, role, p.values.indexOf(defs[p.name])];
    });
    let radix = 1; P.forEach(p => { if (p[2] === 's') radix *= p[1].length; });
    if (radix > 1 << 19) { console.error('estados demais', n, radix); }
    const stored = P.filter(p => p[2] === 's').map(p => p[0]);
    const tog = TOGGLE.filter(t => stored.includes(t) && !(multi && t === multi.p) && !ORIENT.includes(t)).slice(0, 2);
    const ori = ORIENT.filter(o => stored.includes(o) && !(multi && o === multi.p));
    // tinta (tintindex): grama, folhagem, redstone...
    let tint = 0;
    if (n === 'redstone_wire') tint = 0x4C0000;
    else if (n === 'lily_pad') tint = 0x208030;
    else if (/^attached_(melon|pumpkin)_stem$/.test(n)) tint = 0xE0C71C;
    else if (/^(melon|pumpkin)_stem$/.test(n)) tint = 0x8DB127;
    else if (/^(vine|oak_leaves)$/.test(n)) tint = 0x77AB2F;
    else tint = 0x91BD59;
    // família de conexão e Bedrock
    const be = beTable(j2b[n], props.map(p => p.name));
    for (const e of j2b[n]) if (!beStates[e.name] && beDef[e.name]) {
      const d = beDef[e.name], s0 = {}; for (const k in d.states) s0[k] = [d.states[k].type, d.states[k].value];
      beStates[e.name] = [d.version, s0];
    }
    const texList = [...tex].filter(Boolean);
    for (const t of texList) {
      if (!(t in texAvg)) texAvg[t] = avgOf(t) || [128, 128, 128];
      if (!(t in beTex)) beTex[t] = bePathFor(t);
    }
    const kind = texList.some(t => TRANSLUCENT.has(t)) || /^(ice|slime_block|honey_block)$/.test(n) ? 1 : 2;
    // ícone com a cor de bioma/redstone quando a textura do ícone é pintada no jogo (pó de redstone, grama...)
    const ti = particle && tinted.has(particle) ? 1 : 0;
    blocks.push({ n, d: b.displayName, k: kind, ti, p: P, fam: fam[0], tog, ori, multi, tint, t: texList, pt: particle, be, ent: ent ? 1 : 0 });
  }
  // variantes de parede (tocha de parede, placa de parede...): escondidas da paleta, usadas ao clicar na lateral
  const byName = {}; blocks.forEach(b => byName[b.n] = b);
  for (const b of blocks) {
    let floor = null;
    if (/_wall_/.test(b.n)) floor = b.n.replace('_wall_', '_');
    else if (/^wall_/.test(b.n)) floor = b.n.replace(/^wall_/, '');
    if (floor && byName[floor]) { byName[floor].wall = b.n; b.hide = 1; }
  }
  for (const n of usedModels) { const m = M[n]; const c = {}; if (m.parent) c.parent = clean(m.parent); if (m.textures) c.textures = m.textures; if (m.elements) c.elements = m.elements; if (m.ambientocclusion === false) c.ao = 0; models[n] = c; }
  const unresolved = Object.keys(beTex).filter(t => !beTex[t]);
  const out = { blocks, models, states, texAvg, beTex, beStates };
  fs.writeFileSync(path.join(ROOT, 'data/shapes.json'), JSON.stringify(out));
  console.error('formas', blocks.length, 'escondidas', blocks.filter(b => b.hide).length, 'modelos', Object.keys(models).length,
    'texturas', Object.keys(texAvg).length, 'sem Bedrock', unresolved.length, 'tamanho KB', (JSON.stringify(out).length / 1024) | 0);
  console.error('fora:', skipped.join(', '));
  console.error('texturas sem equivalente Bedrock:', unresolved.join(' '));
})().catch(e => { console.error(e); process.exit(1); });
