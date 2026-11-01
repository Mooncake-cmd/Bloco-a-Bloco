// Gera data/item-tex.json: para cada item do Bedrock, o caminho do desenho dele dentro de um pacote de recursos
// (textures/items/...), para o inventário do Editor NBT mostrar o item com o desenho do pacote que o usuário escolheu.
// Só nomes de arquivo vão para o repositório; as imagens continuam vindo do pacote do usuário.
// node scripts/gen_itemtex.js <pasta bedrock-samples (com metadata/ e resource_pack/)>
const fs = require('fs'), path = require('path');
const dir = process.argv[2], rp = path.join(dir, 'resource_pack');
const items = JSON.parse(fs.readFileSync(path.join(dir, 'metadata/vanilladata_modules/mojang-items.json'), 'utf8')).data_items.map(x => x.name.replace('minecraft:', ''));
const files = new Set();
(function walk(d, rel) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p, rel + f + '/'); else if (/\.(png|tga)$/.test(f) && !/_mers\.tga$/.test(f)) files.add(rel + f.replace(/\.(png|tga)$/, '')); } })(path.join(rp, 'textures/items'), 'items/');
const td = JSON.parse(fs.readFileSync(path.join(rp, 'textures/item_texture.json'), 'utf8').replace(/\/\/.*$/gm, '')).texture_data;
const COL = 'white orange magenta light_blue yellow lime pink gray light_gray cyan purple blue brown green red black'.split(' ');
const OVR = {
  oak_sign: 'sign', dark_oak_sign: 'sign_darkoak', dark_oak_boat: 'boat_darkoak', wooden_door: 'door_wood', iron_door: 'door_iron', dark_oak_door: 'door_dark_oak',
  cod: 'fish_raw', cooked_cod: 'fish_cooked', salmon: 'fish_salmon_raw', cooked_salmon: 'fish_salmon_cooked', pufferfish: 'fish_pufferfish_raw', tropical_fish: 'fish_clownfish_raw',
  bucket: 'bucket_empty', tropical_fish_bucket: 'bucket_tropical', potion: 'potion_bottle_drinkable', splash_potion: 'potion_bottle_splash', lingering_potion: 'potion_bottle_lingering',
  glass_bottle: 'potion_bottle_empty', golden_apple: 'apple_golden', enchanted_golden_apple: 'apple_golden', golden_carrot: 'carrot_golden', baked_potato: 'potato_baked', poisonous_potato: 'potato_poisonous',
  glistering_melon_slice: 'melon_speckled', melon_slice: 'melon', fermented_spider_eye: 'spider_eye_fermented', popped_chorus_fruit: 'chorus_fruit_popped', slime_ball: 'slimeball',
  ink_sac: 'dye_powder_black', glow_ink_sac: 'dye_powder_glow', cocoa_beans: 'dye_powder_brown', bone_meal: 'dye_powder_white', lapis_lazuli: 'dye_powder_blue', redstone: 'redstone_dust',
  book: 'book_normal', writable_book: 'book_writable', written_book: 'book_written', enchanted_book: 'book_enchanted', empty_map: 'map_empty', filled_map: 'map_filled',
  clock: 'clock_item', compass: 'compass_item', lodestone_compass: 'lodestonecompass_item', recovery_compass: 'recovery_compass_item', bow: 'bow_standby', crossbow: 'crossbow_standby',
  fishing_rod: 'fishing_rod_uncast', minecart: 'minecart_normal', chest_minecart: 'minecart_chest', hopper_minecart: 'minecart_hopper', tnt_minecart: 'minecart_tnt', command_block_minecart: 'minecart_command_block',
  furnace_minecart: 'minecart_furnace', fire_charge: 'fireball', firework_rocket: 'fireworks', firework_star: 'fireworks_charge', totem_of_undying: 'totem', turtle_scute: 'turtle_shell_piece',
  sugar_cane: 'reeds', wheat_seeds: 'seeds_wheat', melon_seeds: 'seeds_melon', pumpkin_seeds: 'seeds_pumpkin', beetroot_seeds: 'seeds_beetroot', banner: 'banner_pattern',
  heart_of_the_sea: 'heartofthesea_closed', nether_brick: 'netherbrick', glowstone_dust: 'glowstone_dust', experience_bottle: 'experience_bottle', bed: 'bed_red', bell: 'villagebell',
  zombie_pigman_spawn_egg: 'spawn_eggs/spawn_egg_zombified_piglin', tropical_fish_spawn_egg: 'spawn_eggs/spawn_egg_tropicalfish', leather_horse_armor: 'leather_horse_armor', wolf_armor: 'wolf_armor',
  dragon_breath: 'dragons_breath', armadillo_scute: 'armadillo_scute', trial_key: 'trial_key', frame: 'item_frame', glow_frame: 'glow_item_frame', brewing_stand: 'brewing_stand', spyglass: 'spyglass'
};
const has = p => files.has('items/' + p) ? 'textures/items/' + p : null;
function find(id) {
  if (OVR[id]) return has(OVR[id]);
  let m, r;
  if (/^waxed_/.test(id)) return find(id.slice(6));
  const g = id.replace(/^wooden_/, 'wood_').replace(/^golden_/, 'gold_'), tries = [id, g, 'candles/' + id, 'nautilus_armor/' + g];
  if ((m = /^(.*)_spawn_egg$/.exec(id))) tries.push('spawn_eggs/spawn_egg_' + m[1]);
  if ((m = /^(.*)_harness$/.exec(id))) tries.push('harness/harness_' + m[1]);
  if ((m = /^(.*)_spear$/.exec(id))) tries.push('spear/' + m[1].replace(/^wooden$/, 'wood').replace(/^golden$/, 'gold') + '_spear');
  if ((m = /^(.*)_bundle$/.exec(id))) tries.push('bundle_' + m[1]);
  if ((m = /^(.*)_dye$/.exec(id))) { const c = m[1] === 'light_gray' ? 'silver' : m[1]; tries.push('dye_powder_' + c + '_new', 'dye_powder_' + c); }
  if ((m = /^music_disc_(.*)$/.exec(id))) tries.push('record_' + m[1]);
  if ((m = /^(.*)_boat$/.exec(id))) tries.push('boat_' + m[1]);
  if ((m = /^(.*)_sign$/.exec(id))) tries.push('sign_' + m[1].replace('dark_oak', 'darkoak'));
  if ((m = /^(.*)_door$/.exec(id))) tries.push('door_' + m[1]);
  if ((m = /^cooked_(.*)$/.exec(id))) tries.push(m[1] + '_cooked');
  if ((m = /^(.*)_bucket$/.exec(id))) tries.push('bucket_' + m[1]);
  if (/^(beef|chicken|porkchop|mutton|rabbit|hoglin_meat)$/.test(id)) tries.push(id + '_raw');
  for (const t of tries) if ((r = has(t))) return r;
  // item_texture.json: a chave é o nome do item (vários blocos-item: caldeirão, funil, lanterna...)
  const e = td[id]; let t = e && e.textures; if (Array.isArray(t)) t = t[0]; if (t && typeof t === 'object') t = t.path;
  if (typeof t === 'string' && files.has(t.replace(/^textures\//, ''))) return t;
  return null;
}
const out = {}, miss = [];
for (const id of items) { const p = find(id); if (p) out[id] = p.replace(/^textures\/items\//, ''); else miss.push(id); }
fs.writeFileSync(path.join(__dirname, '../data/item-tex.json'), JSON.stringify(out));
console.error('com desenho:', Object.keys(out).length, '; sem (ficam com a cor do bloco ou a cor média):', miss.length);
console.error(miss.filter(x => !/^(element_|.*_(planks|log|wood|slab|stairs|wall|fence|glass|wool|carpet|concrete|terracotta|ore|block|bricks|leaves|sapling|button|pressure_plate|trapdoor|fence_gate|powder|shulker_box|candle_cake|coral.*|stone.*))$/.test(x)).join(' '));
