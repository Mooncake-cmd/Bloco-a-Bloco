// Gera data/shapes.json: blocos que não são cubos inteiros (escadas, lajes, portas, redstone, plantas, baús...).
// Usa os modelos e blockstates do Java (minecraft-assets 26.1), os estados do minecraft-data (Java 1.21.11)
// e a tabela Java -> Bedrock do minecraft-data (blocksJ2B). Rodar depois de gen_blocks.js.
const fs = require('fs'), path = require('path');
const { PNG } = require('pngjs');
const jd = require('minecraft-data')('1.21.11');
const bd = require('minecraft-data')('bedrock_1.26.51');
const jd26 = require('minecraft-data')('26.1'); // blocos do Java 26.1 que o 1.21.11 não tem (dente-de-leão dourado, estátua do golem de cobre)
// Pacote oficial do Bedrock (github.com/Mojang/bedrock-samples) 1.26.50 ou mais novo, extraído: resource_pack/textures/blocks,
// resource_pack/textures/terrain_texture.json e metadata/vanilladata_modules/mojang-blocks.json. Dele saem as texturas e os
// estados dos blocos que só o Bedrock tem e que o minecraft-data ainda não traz (choupo, enxofre, cinábrio, lajes de lã...).
const SAMPLES = process.env.BEDROCK_SAMPLES_DIR;
if (!SAMPLES) { console.error('Defina BEDROCK_SAMPLES_DIR com a pasta do bedrock-samples extraído.'); process.exit(1); }
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
// Faces que citam a variável sem o '#' (ex.: núcleo pesado, "texture": "all") valem como "#all"
for (const n in M) (M[n].elements || []).forEach(e => Object.values(e.faces || {}).forEach(f => { if (f.texture && !f.texture.startsWith('#') && !f.texture.includes('/')) f.texture = '#' + f.texture; }));

// ---------- Quais blocos ----------
const SKIP = /^(air|cave_air|void_air|bubble_column|moving_piston|barrier|test_block|test_instance_block|frosted_ice|bedrock|infested_.*|budding_amethyst|reinforced_deepslate|spawner|trial_spawner|vault|petrified_oak_slab|sculk_sensor_x|(waxed_)?((exposed|weathered|oxidized)_)?copper_golem_statue)$/;

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
  'cracked', 'side_chain',
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
// uv padrão do Minecraft para a face; se a caixa passa do bloco (bandeira, placa pendurada), o uv sairia da textura
// e pegaria a vizinha no atlas: desliza para dentro de 0..16 ou, se for maior que 16, estica
function fitUV(d, f, t) {
  const uv = { down: [f[0], 16 - t[2], t[0], 16 - f[2]], up: [f[0], f[2], t[0], t[2]], north: [16 - t[0], 16 - t[1], 16 - f[0], 16 - f[1]],
    south: [f[0], 16 - t[1], t[0], 16 - f[1]], west: [f[2], 16 - t[1], t[2], 16 - f[1]], east: [16 - t[2], 16 - t[1], 16 - f[2], 16 - f[1]] }[d];
  const fix = (a, b) => { if (a >= 0 && b <= 16) return [a, b]; if (b - a > 16) return [0, 16]; const sh = a < 0 ? -a : 16 - b; return [a + sh, b + sh]; };
  const u = fix(uv[0], uv[2]), v = fix(uv[1], uv[3]);
  return [u[0], v[0], u[1], v[1]];
}
function box(from, to, tex, uvs) {
  const faces = {}, out = from.concat(to).some(c => c < 0 || c > 16);
  for (const d of ['down', 'up', 'north', 'south', 'west', 'east']) faces[d] = uvs && uvs[d] ? { texture: '#' + tex, uv: uvs[d] } : out ? { texture: '#' + tex, uv: fitUV(d, from, to) } : { texture: '#' + tex };
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
    return { model: { textures: { w: 'block/' + m[1] + '_wool', s: 'block/oak_planks', particle: 'block/' + m[1] + '_wool' }, elements: [box([7, 0, 7], [9, 28, 9], 's'), box([1, 2, 9], [15, 28, 10], 'w'), box([0, 28, 8], [16, 30, 10], 's')] }, states: rotStates('bab:' + n, 'rotation') };
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
  // marcadores e líquidos: no jogo não têm modelo de bloco
  const marker = (t, a, b2) => ({ model: { textures: { m: 'block/' + t, particle: 'block/' + t }, elements: [box(a, b2, 'm')] }, states: { variants: { '': { model: 'bab:' + n } } } });
  if (n === 'light') return marker('yellow_stained_glass', [5, 5, 5], [11, 11, 11]);
  if (n === 'barrier') return marker('be:barrier', [0, 0, 0], [16, 16, 16]);
  if (n === 'bubble_column') { const m = marker('water_still', [0, 0, 0], [16, 16, 16]); for (const f of Object.values(m.model.elements[0].faces)) f.tintindex = 0; return m; }
  if ((m = /^(?:waxed_)?(?:(exposed|weathered|oxidized)_)?copper_golem_statue$/.exec(n))) {
    // estátua do golem de cobre: o jogo desenha como entidade; aqui, pernas, corpo, cabeça e o para-raios em cima,
    // com a textura do bloco de cobre na etapa de oxidação certa (a pose não muda o desenho)
    const t = m[1] ? m[1] + '_copper' : 'copper_block';
    return { model: { textures: { c: 'block/' + t, particle: 'block/' + t }, elements: [box([4, 0, 6], [7, 4, 10], 'c'), box([9, 0, 6], [12, 4, 10], 'c'),
      box([4, 4, 5], [12, 9, 11], 'c'), box([3, 9, 3], [13, 14, 13], 'c'), box([7, 9, 2], [9, 12, 3], 'c'), box([7, 14, 7], [9, 18, 9], 'c')] }, states: horizontalStates('bab:' + n) };
  }
  if (n === 'structure_void') return marker('light_blue_stained_glass', [6, 6, 6], [10, 10, 10]);
  if (n === 'water' || n === 'lava') {
    const m = marker(n + '_still', [0, 0, 0], [16, 14, 16]);
    if (n === 'water') for (const f of Object.values(m.model.elements[0].faces)) f.tintindex = 0;
    return m;
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
function avgOf(name) { const png = readPng(name); return png ? avgPng(png) : null; }
function avgPng(png) {
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
  spawner: 'mob_spawner', furnace_front: 'furnace_front_off', smoker_front: 'smoker_front_off', blast_furnace_front: 'blast_furnace_front_off',
  redstone_lamp: 'redstone_lamp_off', water_still: 'water_still_grey', lava_still: 'lava_still',
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
    if (j === 'water_still' || j === 'water_flow') return j + '_grey'; // a tinta azul é aplicada no editor
    if (j === 'shulker_box') return 'shulker_top_undyed';
    if ((m = /^(\w+)_shulker_box$/.exec(j))) return 'shulker_top_' + COLOR_BE(m[1]);
    if ((m = /^(dead_)?(tube|brain|bubble|fire|horn)_coral(_fan)?$/.exec(j))) return (m[3] ? 'coral_fan_' : 'coral_plant_') + CORAL_BE[m[2]] + (m[1] ? '_dead' : '');
    if ((m = /^(crimson|warped)_door_(top|bottom)$/.exec(j))) return 'huge_fungus/' + m[1] + '_door_' + (m[2] === 'top' ? 'top' : 'lower');
    if ((m = /^pointed_dripstone_(up|down)_tip_merge$/.exec(j))) return 'pointed_dripstone_' + m[1] + '_merge';
    if (/^((exposed|weathered|oxidized)_)?copper_chain$/.test(j)) return j + '1'; // não o ícone do item
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
  // Entrada de um bloco Java (b: bloco do minecraft-data; J: tabela Java -> Bedrock, se não for a do minecraft-data)
  function javaEntry(b, J) {
    const n = b.name;
    J = J || j2b[n];
    let st = S[n], ent = null;
    const props = jprops(b), defs = jdefaults(b);
    if (!st) { skipped.push(n + ' (sem blockstate)'); return null; }
    let ms = stateModels(st), info = ms.map(modelTextures);
    if (!info.some(i => i.hasElements)) {
      ent = entityGeometry(n);
      if (!ent) { skipped.push(n + ' (desenhado como entidade)'); return null; }
      if (ent.model) models['bab:' + n] = ent.model;
      if (ent.models) for (const k in ent.models) models['bab:' + k] = ent.models[k];
      st = ent.states;
    }
    if (!J) { skipped.push(n + ' (sem equivalente Bedrock)'); return null; }
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
    let tog = TOGGLE.filter(t => stored.includes(t) && !(multi && t === multi.p) && !ORIENT.includes(t));
    // repetidor e comparador: Usar muda o atraso e o modo, como o clique no jogo; ligado/desligado fica no Shift
    if (/^(repeater|comparator)$/.test(n)) tog = tog.filter(t => t !== 'powered').concat(['powered']);
    tog = tog.slice(0, 2);
    const ori = ORIENT.filter(o => stored.includes(o) && !(multi && o === multi.p));
    // tinta (tintindex): grama, folhagem, redstone...
    let tint = 0;
    if (n === 'redstone_wire') tint = 0x4C0000;
    else if (/^(water|water_cauldron|bubble_column)$/.test(n)) tint = 0x3F76E4;
    // o modelo Java marca a face como pintável, mas o jogo não pinta estes (a serra do cortador, o bambu, a lava e a neve do caldeirão)
    else if (/^(stonecutter|bamboo|bamboo_sapling|lava_cauldron|powder_snow_cauldron)$/.test(n)) tint = 0xFFFFFF;
    else if (n === 'lily_pad') tint = 0x208030;
    else if (/^attached_(melon|pumpkin)_stem$/.test(n)) tint = 0xE0C71C;
    else if (/^(melon|pumpkin)_stem$/.test(n)) tint = 0x8DB127;
    else if (/^(vine|oak_leaves)$/.test(n)) tint = 0x77AB2F;
    else tint = 0x91BD59;
    // família de conexão e Bedrock
    const be = beTable(J, props.map(p => p.name));
    for (const e of J) if (!beStates[e.name] && beDef[e.name]) {
      const d = beDef[e.name], s0 = {}; for (const k in d.states) s0[k] = [d.states[k].type, d.states[k].value];
      beStates[e.name] = [d.version, s0];
    }
    const texList = [...tex].filter(Boolean);
    for (const t of texList) {
      if (!(t in texAvg)) texAvg[t] = avgOf(t) || [128, 128, 128];
      if (!(t in beTex)) beTex[t] = bePathFor(t);
    }
    const kind = texList.some(t => TRANSLUCENT.has(t)) || /^(ice|frosted_ice|slime_block|honey_block|water|bubble_column|light|structure_void)$/.test(n) ? 1 : 2;
    // ícone com a cor de bioma/redstone quando a textura do ícone é pintada no jogo (pó de redstone, grama...)
    const ti = particle && tinted.has(particle) ? 1 : 0;
    return { n, d: b.displayName, k: kind, ti, p: P, fam: fam[0], tog, ori, multi, tint, t: texList, pt: particle, be, ent: ent ? 1 : 0 };
  }
  for (const b of jd.blocksArray) {
    if (cubeNames.has(b.name) || SKIP.test(b.name)) continue;
    const e = javaEntry(b); if (e) blocks.push(e);
  }
  // ---- Blocos que só existem no Bedrock (bo: ficam de fora do .schem) ----
  const BE_RAW = BEDROCK_SAMPLES + 'textures/blocks/';
  async function beAvg(file) {
    try { const r = await fetch(BE_RAW + file + '.png'); if (!r.ok) return null; return avgPng(PNG.sync.read(Buffer.from(await r.arrayBuffer()))); } catch (e) { return null; }
  }
  const byN = {}; blocks.forEach(b => byN[b.n] = b);
  async function beTexture(key, file, fallback) {
    beTex[key] = file ? 'textures/blocks/' + file : null;
    texAvg[key] = (file && await beAvg(file)) || fallback;
  }
  function cubeOnly(n, d, faces, bn, k) { // faces: {up,down,north,south,east,west} -> nome de textura
    const tx = {}, el = { from: [0, 0, 0], to: [16, 16, 16], faces: {} };
    for (const f in faces) { tx[f] = 'block/' + faces[f]; el.faces[f] = { texture: '#' + f }; }
    tx.particle = 'block/' + faces.north;
    models['bab:' + n] = { textures: tx, elements: [el] };
    states[n] = { variants: { '': { model: 'bab:' + n } } };
    const t = [...new Set(Object.values(faces))];
    blocks.push({ n, d: d + ' (só Bedrock)', k: k || 0, ti: 0, p: [], fam: null, tog: [], ori: [], multi: null, tint: 0, t, pt: faces.north, be: { '#name': [[], { '': bn }] }, ent: 1, bo: 1 });
  }
  function cloneOnly(n, d, from, bn, tm) { // mesma forma de um bloco Java parecido, com outras texturas e outro nome Bedrock
    const c = JSON.parse(JSON.stringify(byN[from]));
    c.n = n; c.d = d + (/_wall_/.test(n) ? '' : ' (só Bedrock)'); c.bo = 1; delete c.wall; delete c.hide;
    if (tm) { c.tm = tm; c.t = c.t.map(t => tm[t] || t); c.pt = tm[c.pt] || c.pt; }
    c.be['#name'] = [[], { '': bn }];
    states[n] = states[from];
    blocks.push(c);
  }
  const all6 = t => ({ up: t, down: t, north: t, south: t, east: t, west: t });
  await beTexture('be:build_allow', 'build_allow', [90, 160, 70]); cubeOnly('allow', 'Allow', all6('be:build_allow'), 'allow');
  await beTexture('be:build_deny', 'build_deny', [170, 60, 60]); cubeOnly('deny', 'Deny', all6('be:build_deny'), 'deny');
  for (const f of ['top', 'side', 'back', 'front']) await beTexture('be:camera_' + f, 'camera_' + f, [90, 90, 90]);
  cubeOnly('camera', 'Camera', { up: 'be:camera_top', down: 'be:camera_top', north: 'be:camera_back', south: 'be:camera_front', east: 'be:camera_side', west: 'be:camera_side' }, 'camera');
  await beTexture('be:glowing_obsidian', 'glowing_obsidian', [70, 20, 40]); cubeOnly('glowingobsidian', 'Glowing Obsidian', all6('be:glowing_obsidian'), 'glowingobsidian');
  await beTexture('be:reactor_core', 'reactor_core_stage_0', [120, 120, 140]); cubeOnly('netherreactor', 'Nether Reactor Core', all6('be:reactor_core'), 'netherreactor');
  // da Education Edition: sem textura no pacote vanilla (cor média aproximada)
  await beTexture('be:chemical_heat', null, [190, 80, 40]); cubeOnly('chemical_heat', 'Heat Block', all6('be:chemical_heat'), 'chemical_heat');
  cubeOnly('hard_glass', 'Hardened Glass', all6('glass'), 'hard_glass', 2);
  await beTexture('be:invisible_bedrock', null, [170, 180, 200]);
  models['bab:invisible_bedrock'] = { textures: { m: 'block/be:invisible_bedrock', particle: 'block/be:invisible_bedrock' }, elements: [box([6, 6, 6], [10, 10, 10], 'm')] };
  states.invisible_bedrock = { variants: { '': { model: 'bab:invisible_bedrock' } } };
  blocks.push({ n: 'invisible_bedrock', d: 'Invisible Bedrock (só Bedrock)', k: 1, ti: 0, p: [], fam: null, tog: [], ori: [], multi: null, tint: 0, t: ['be:invisible_bedrock'], pt: 'be:invisible_bedrock', be: { '#name': [[], { '': 'invisible_bedrock' }] }, ent: 1, bo: 1 });
  await beTexture('be:border', 'border', [200, 60, 60]); cloneOnly('border_block', 'Border', 'cobblestone_wall', 'border_block', { cobblestone: 'be:border' });
  cloneOnly('hard_glass_pane', 'Hardened Glass Pane', 'glass_pane', 'hard_glass_pane');
  cloneOnly('underwater_torch', 'Underwater Torch', 'torch', 'underwater_torch');
  cloneOnly('underwater_wall_torch', 'Underwater Wall Torch', 'wall_torch', 'underwater_torch');
  for (const n of ['allow', 'deny', 'border_block', 'camera', 'chemical_heat', 'hard_glass', 'hard_glass_pane', 'underwater_torch', 'netherreactor', 'glowingobsidian', 'invisible_bedrock'])
    if (!beStates[n] && beDef[n]) { const d = beDef[n], s0 = {}; for (const k in d.states) s0[k] = [d.states[k].type, d.states[k].value]; beStates[n] = [d.version, s0]; }

  // ---- Blocos acrescentados depois (entram no fim para não mudar o índice dos que já existiam) ----
  // 1. do Java que antes ficavam de fora; 2. do Java 26.1; 3. novos do Bedrock 1.26 (choupo, enxofre, cinábrio, lajes e escadas
  // de lã e de concreto), montados a partir de um bloco parecido do Java, com as texturas e os nomes do pacote oficial
  const SR = path.join(SAMPLES, 'resource_pack');
  const terrLocal = JSON.parse(fs.readFileSync(path.join(SR, 'textures/terrain_texture.json'), 'utf8').replace(/^﻿/, '').replace(/^\s*\/\/.*$/mg, '')).texture_data;
  const localPaths = new Set(); const addL = t => { if (typeof t === 'string') localPaths.add(t); else if (Array.isArray(t)) t.forEach(addL); else if (t && typeof t === 'object') { if (t.path) localPaths.add(t.path); if (t.variations) t.variations.forEach(addL); } };
  for (const k in terrLocal) addL(terrLocal[k].textures);
  const MB = JSON.parse(fs.readFileSync(path.join(SAMPLES, 'metadata/vanilladata_modules/mojang-blocks.json'), 'utf8'));
  const mbItem = {}; MB.data_items.forEach(x => mbItem[x.name.replace('minecraft:', '')] = x);
  const mbProp = {}; MB.block_properties.forEach(x => mbProp[x.name] = x);
  const VER = beStates.spruce_planks ? beStates.spruce_planks[0] : 18168865;
  // estados padrão de um nome Bedrock: do minecraft-data; se não tiver, do pacote (o primeiro valor de cada estado)
  function beDefault(bn) {
    if (beStates[bn]) return;
    if (beDef[bn]) { const d = beDef[bn], s0 = {}; for (const k in d.states) s0[k] = [d.states[k].type, d.states[k].value]; beStates[bn] = [d.version, s0]; return; }
    const it = mbItem[bn]; if (!it) throw new Error('bloco Bedrock desconhecido: ' + bn);
    const s0 = {};
    for (const q of it.properties) { const pd = mbProp[q.name], v = pd.values[0].value; s0[q.name] = pd.type === 'bool' ? ['byte', v ? 1 : 0] : pd.type === 'int' ? ['int', v] : ['string', v]; }
    beStates[bn] = [VER, s0];
  }
  // textura do pacote: chave 'be:<arquivo>', cor média e caminho
  function beLocal(file) {
    const key = 'be:' + file, rel = 'textures/blocks/' + file;
    if (!localPaths.has(rel) && !fs.existsSync(path.join(SR, rel + '.png'))) throw new Error('textura não encontrada: ' + rel);
    beTex[key] = rel; texAvg[key] = avgPng(PNG.sync.read(fs.readFileSync(path.join(SR, rel + '.png')))) || [128, 128, 128];
    return key;
  }
  // texturas Java usadas por uma cópia (lã, concreto...) precisam de cor média e caminho Bedrock também
  function javaTex(t) { if (!(t in texAvg)) texAvg[t] = avgOf(t) || [128, 128, 128]; if (!(t in beTex)) beTex[t] = bePathFor(t); return t; }
  const title = n => n.split('_').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
  // forma de um bloco Java, mesmo que ele seja um cubo da outra lista (tábuas, troncos)
  function source(from) {
    if (byN[from]) return JSON.parse(JSON.stringify(byN[from]));
    const e = javaEntry(jd.blocksByName[from]); if (!e) throw new Error('sem forma: ' + from);
    return e;
  }
  const isCube = c => c.k !== 1 && !c.fam && /(_planks|_log|_wood|_bricks|^tuff|^polished_tuff|^chiseled_tuff|^cinnabar|^sulfur|^polished_|^chiseled_)$/.test(c.n) || /^(sulfur|cinnabar|polished_sulfur|polished_cinnabar|sulfur_bricks|cinnabar_bricks|chiseled_sulfur|chiseled_cinnabar|poplar_planks|poplar_log|poplar_wood|stripped_poplar_log|stripped_poplar_wood)$/.test(c.n);
  const added = [];
  // cópia de um bloco Java com outro nome: ren troca os nomes Bedrock; tm troca as texturas (Java -> chave nova)
  function copyOf(n, from, ren, tm, opt) {
    opt = opt || {};
    const c = source(from);
    c.n = n; c.d = (opt.d || title(n)) + (/_wall_/.test(n) || opt.java ? '' : ' (só Bedrock)'); delete c.wall; delete c.hide;
    if (!opt.java) { c.bo = 1; c.nb = 1; }
    const nm = c.be['#name'];
    if (nm) { for (const k in nm[1]) nm[1][k] = ren(nm[1][k]); for (const k in nm[1]) beDefault(nm[1][k]); }
    else { c.be['#name'] = [[], { '': ren(from) }]; beDefault(ren(from)); }
    if (tm) { c.tm = Object.assign(c.tm || {}, tm); c.t = c.t.map(t => tm[t] || t); c.pt = tm[c.pt] || c.pt; }
    if (opt.tint != null) { c.tint = opt.tint; c.ti = 0; }
    if (opt.be) Object.assign(c.be, opt.be);
    if (isCube(c)) { c.fc = 1; c.k = 0; }
    states[n] = states[from];
    blocks.push(c); byN[n] = c; added.push(n);
    return c;
  }
  // 1. blocos do Java que ficavam de fora
  beLocal('barrier');
  for (const n of ['spawner', 'trial_spawner', 'vault', 'infested_stone', 'infested_cobblestone', 'infested_stone_bricks', 'infested_mossy_stone_bricks',
    'infested_cracked_stone_bricks', 'infested_chiseled_stone_bricks', 'infested_deepslate', 'barrier', 'bubble_column', 'frosted_ice', 'petrified_oak_slab']) {
    const e = javaEntry(jd.blocksByName[n]); if (!e) throw new Error('não montou ' + n);
    if (/^infested_/.test(n)) { e.fc = 1; e.k = 0; }
    blocks.push(e); byN[n] = e; added.push(n);
  }
  // 2. do Java 26.1, com a tabela Bedrock feita aqui
  {
    const gd = javaEntry(jd26.blocksByName.golden_dandelion, [{ props: {}, name: 'golden_dandelion', bs: {} }]);
    beDefault('golden_dandelion'); if (!beTex.golden_dandelion) beTex.golden_dandelion = 'textures/blocks/golden_dandelion';
    blocks.push(gd); byN.golden_dandelion = gd; added.push('golden_dandelion');
    for (const ox of ['', 'exposed_', 'weathered_', 'oxidized_']) for (const wx of ['', 'waxed_']) {
      const n = wx + ox + 'copper_golem_statue', b26 = jd26.blocksByName[n], J = [];
      const pose = jprops(b26).find(q => q.name === 'copper_golem_pose').values;
      for (const f of ['north', 'south', 'west', 'east']) for (const ps of pose) for (const w of ['true', 'false']) J.push({ props: { facing: f, copper_golem_pose: ps, waterlogged: w }, name: n, bs: { 'minecraft:cardinal_direction': f } });
      const e = javaEntry(b26, J); if (!e) throw new Error('não montou ' + n);
      beDefault(n); blocks.push(e); byN[n] = e; added.push(n);
    }
  }
  // 3a. choupo: a partir do abeto (os nomes Bedrock do abeto seguem o mesmo padrão: spruce_slab, spruce_door...)
  {
    const P = f => beLocal(f), rp = v => v.replace('spruce', 'poplar');
    const tm = { spruce_planks: P('poplar_planks'), spruce_log: P('poplar_log_side'), spruce_log_top: P('poplar_log_top'), stripped_spruce_log: P('stripped_poplar_log_side'),
      stripped_spruce_log_top: P('stripped_poplar_log_top'), spruce_door_top: P('poplar_door_top'), spruce_door_bottom: P('poplar_door_bottom'), spruce_trapdoor: P('poplar_trapdoor'),
      spruce_sapling: P('poplar_sapling'), spruce_shelf: P('poplar_shelf') };
    for (const k of ['planks', 'log', 'wood', 'slab', 'stairs', 'fence', 'fence_gate', 'door', 'trapdoor', 'button', 'pressure_plate', 'sign', 'wall_sign', 'hanging_sign', 'wall_hanging_sign', 'sapling', 'shelf'])
      copyOf('poplar_' + k, 'spruce_' + k, v => rp(v), tm);
    copyOf('stripped_poplar_log', 'stripped_spruce_log', rp, tm); copyOf('stripped_poplar_wood', 'stripped_spruce_wood', rp, tm);
    for (const c of ['orange', 'red', 'yellow']) copyOf(c + '_poplar_leaves', 'spruce_leaves', () => c + '_poplar_leaves', { spruce_leaves: P(c + '_poplar_leaves') }, { tint: 0xFFFFFF });
    copyOf('red_shrub', 'dead_bush', () => 'red_shrub', { dead_bush: P('red_shrub') });
    copyOf('straw_bed', 'white_bed', () => 'straw_bed', { white_wool: P('straw_bed') }, { be: { 'minecraft:cardinal_direction': [['facing'], { north: 'north', south: 'south', west: 'west', east: 'east' }] } });
    delete byN.straw_bed.be.direction;
    // cogumelo de prateleira: uma placa presa na parede de trás, virada para facing
    beLocal('shelf_mushroom_large');
    models['bab:shelf_mushroom'] = { textures: { m: 'block/be:shelf_mushroom_large', particle: 'block/be:shelf_mushroom_large' }, elements: [box([2, 6, 8], [14, 8, 16], 'm'), box([4, 3, 11], [12, 5, 16], 'm')] };
    states.shelf_mushroom = horizontalStates('bab:shelf_mushroom');
    beDefault('shelf_mushroom');
    const sm = { n: 'shelf_mushroom', d: 'Shelf Mushroom (só Bedrock)', k: 2, ti: 0, p: [['facing', ['north', 'south', 'west', 'east'], 's', 0]], fam: null, tog: [], ori: ['facing'], multi: null, tint: 0,
      t: ['be:shelf_mushroom_large'], pt: 'be:shelf_mushroom_large', be: { '#name': [[], { '': 'shelf_mushroom' }], 'minecraft:cardinal_direction': [['facing'], { north: 'north', south: 'south', west: 'west', east: 'east' }] }, ent: 0, bo: 1, nb: 1 };
    blocks.push(sm); byN.shelf_mushroom = sm; added.push('shelf_mushroom');
  }
  // 3b. enxofre e cinábrio: a partir do tufo (tuff_slab, tuff_double_slab, tuff_stairs, tuff_wall, tuff_brick_*...)
  for (const m of ['sulfur', 'cinnabar']) {
    const P = f => beLocal(f), rm = v => v.replace('tuff', m);
    const tm = { tuff: P(m), polished_tuff: P('polished_' + m), tuff_bricks: P(m + '_bricks'), chiseled_tuff: P('chiseled_' + m), chiseled_tuff_top: 'be:chiseled_' + m,
      chiseled_tuff_bricks: 'be:chiseled_' + m, chiseled_tuff_bricks_top: 'be:chiseled_' + m };
    for (const k of ['', '_slab', '_stairs', '_wall']) copyOf(m + k, 'tuff' + k, rm, tm);
    for (const k of ['', '_slab', '_stairs', '_wall']) copyOf('polished_' + m + k, 'polished_tuff' + k, rm, tm);
    copyOf(m + '_bricks', 'tuff_bricks', rm, tm);
    for (const k of ['_slab', '_stairs', '_wall']) copyOf(m + '_brick' + k, 'tuff_brick' + k, rm, tm);
    copyOf('chiseled_' + m, 'chiseled_tuff', rm, tm);
  }
  {
    const tm = {}; for (const d of ['up', 'down']) for (const k of ['tip', 'tip_merge', 'frustum', 'middle', 'base']) tm['pointed_dripstone_' + d + '_' + k] = beLocal('sulfur_spike_' + d + '_' + k);
    copyOf('sulfur_spike', 'pointed_dripstone', () => 'sulfur_spike', tm);
    copyOf('potent_sulfur', 'tuff', () => 'potent_sulfur', { tuff: beLocal('potent_sulfur') });
  }
  // 3c. lajes e escadas de lã e de concreto, nas 16 cores: a forma da laje e da escada de tufo com a textura do bloco
  for (const c of ['white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray', 'light_gray', 'cyan', 'purple', 'blue', 'brown', 'green', 'red', 'black'])
    for (const mat of ['wool', 'concrete']) {
      const base = c + '_' + mat, tm = { tuff: javaTex(base) };
      copyOf(base + '_slab', 'tuff_slab', v => v.replace('tuff', base), tm); copyOf(base + '_stairs', 'tuff_stairs', v => v.replace('tuff', base), tm);
    }
  // 3d. molduras: no Bedrock são blocos (no Java, entidades)
  for (const [n, tex] of [['frame', 'itemframe_background'], ['glow_frame', 'glow_item_frame']]) {
    const key = beLocal(tex);
    models['bab:' + n] = { textures: { f: 'block/' + key, particle: 'block/' + key }, elements: [box([2, 2, 15], [14, 14, 16], 'f')] };
    const v = {}; for (const [f, y] of [['north', 0], ['east', 90], ['south', 180], ['west', 270]]) v['facing=' + f] = { model: 'bab:' + n, y };
    v['facing=up'] = { model: 'bab:' + n, x: 270 }; v['facing=down'] = { model: 'bab:' + n, x: 90 };
    states[n] = { variants: v }; beDefault(n);
    const e = { n, d: title(n).replace('Frame', 'Item Frame') + ' (só Bedrock)', k: 2, ti: 0, p: [['facing', ['north', 'south', 'west', 'east', 'up', 'down'], 's', 0]], fam: null, tog: [], ori: ['facing'], multi: null, tint: 0,
      t: [key], pt: key, be: { '#name': [[], { '': n }], facing_direction: [['facing'], { down: '0', up: '1', north: '2', south: '3', west: '4', east: '5' }] }, ent: 0, bo: 1, nb: 1 };
    blocks.push(e); byN[n] = e; added.push(n);
  }
  // 3e. cortador de pedra antigo (o do Pocket Edition): um cubo, nome Bedrock 'stonecutter' (o novo é 'stonecutter_block')
  {
    const f = { up: beLocal('stonecutter_top'), down: beLocal('stonecutter_bottom'), north: beLocal('stonecutter_side'), south: beLocal('stonecutter_side'),
      east: beLocal('stonecutter_other_side'), west: beLocal('stonecutter_other_side') };
    const tx = {}, el = { from: [0, 0, 0], to: [16, 16, 16], faces: {} };
    for (const k in f) { tx[k] = 'block/' + f[k]; el.faces[k] = { texture: '#' + k }; }
    tx.particle = 'block/' + f.north;
    models['bab:old_stonecutter'] = { textures: tx, elements: [el] };
    states.old_stonecutter = { variants: { '': { model: 'bab:old_stonecutter' } } };
    beDefault('stonecutter');
    const e = { n: 'old_stonecutter', d: 'Old Stonecutter (só Bedrock)', k: 0, ti: 0, p: [], fam: null, tog: [], ori: [], multi: null, tint: 0,
      t: [...new Set(Object.values(f))], pt: f.north, be: { '#name': [[], { '': 'stonecutter' }] }, ent: 0, bo: 1, nb: 1, fc: 1 };
    blocks.push(e); byN.old_stonecutter = e; added.push('old_stonecutter');
  }
  // os blocos-fonte que eram cubos (tábuas, troncos, tufo) não precisam de forma própria
  for (const n of ['spruce_planks', 'spruce_log', 'spruce_wood', 'stripped_spruce_log', 'stripped_spruce_wood', 'spruce_leaves', 'tuff', 'polished_tuff', 'tuff_bricks', 'chiseled_tuff'])
    if (!blocks.some(b => b.n === n)) delete states[n];
  console.error('acrescentados', added.length);

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
