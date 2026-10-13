const fs=require('fs'),path=require('path');
const {PNG}=require('pngjs');
const jd=require('minecraft-data')('1.21.11');
const bd=require('minecraft-data')('bedrock_1.26.51');
const assets=require('minecraft-assets')('1.21.9');
const dir=assets.directory;
// Mapeamento oficial do Bedrock (bloco -> textura), do pacote de recursos vanilla da Mojang.
// Fixado num commit para o resultado ser reproduzível.
const BEDROCK_SAMPLES='https://raw.githubusercontent.com/Mojang/bedrock-samples/46ba6ea985fb5a92d79a9419198f10dda14c199d/resource_pack/';
async function fetchJson(u){
  const r=await fetch(u); if(!r.ok) throw new Error(u+': '+r.status);
  return JSON.parse((await r.text()).replace(/^\uFEFF/,'').replace(/^\s*\/\/.*$/mg,''));
}
// Cores de bioma (planícies) para texturas que o jogo pinta: topo da grama e folhas.
const GRASS=0x91BD59, FOLIAGE=0x77AB2F;
const TINT={grass_block:[GRASS,0,0],oak_leaves:FOLIAGE,jungle_leaves:FOLIAGE,acacia_leaves:FOLIAGE,dark_oak_leaves:FOLIAGE,
  spruce_leaves:0x619961,birch_leaves:0x80A755,mangrove_leaves:0x8DB127};
function tintOf(n){ const t=TINT[n]; return t===undefined?null:Array.isArray(t)?t:[t,t,t]; }
function mul(c,t){ return t?[c[0]*(t>>16&255)/255,c[1]*(t>>8&255)/255,c[2]*(t&255)/255].map(Math.round):c; }
// Nomes Java que mudam no blocks.json do Bedrock (além dos apelidos de exportação)
const beTexAlias={grass_block:'grass'};
function beFace(t,k){
  if(typeof t==='string') return t;
  if(k==='side') return t.side||t.north||t.east||t.west||t.south||null;
  return t[k]||null;
}
function avg(tex){
  const f=path.join(dir,'blocks',tex.replace(/^minecraft:/,'').replace(/^block\//,'')+'.png');
  if(!fs.existsSync(f)) return null;
  const png=PNG.sync.read(fs.readFileSync(f));
  let r=0,g=0,b=0,a=0,n=0;
  const h=Math.min(png.height,png.width); // first frame for animated
  for(let y=0;y<h;y++)for(let x=0;x<png.width;x++){
    const i=(y*png.width+x)*4,al=png.data[i+3];
    if(al<10)continue; r+=png.data[i];g+=png.data[i+1];b+=png.data[i+2];a+=al;n++;
  }
  if(!n)return null;
  return {c:[Math.round(r/n),Math.round(g/n),Math.round(b/n)],a:a/n/255};
}
function resolveTextures(name){
  const m=assets.blocksModels[name];
  if(!m||!m.textures) return null;
  let t=m.textures, p=m.parent||'';
  let T={};
  for(const k in t) T[k]=t[k].replace('minecraft:','').replace('block/','');
  const par=p.replace('minecraft:','').replace('block/','');
  const g=k=>T[k]&&!T[k].startsWith('#')?T[k]:null;
  if(par==='cube_all') return {top:g('all'),side:g('all'),bottom:g('all')};
  if(par==='cube_column') return {top:g('end'),side:g('side'),bottom:g('end')};
  if(par==='cube_bottom_top') return {top:g('top'),side:g('side'),bottom:g('bottom')};
  if(par==='cube') return {top:g('up'),side:g('north'),bottom:g('down')};
  if(par==='cube_mirrored_all') return {top:g('all'),side:g('all'),bottom:g('all')};
  if(par==='cube_top') return {top:g('top'),side:g('side'),bottom:g('top')};
  if(par==='cube_directional') return {top:g('up'),side:g('north'),bottom:g('down')};
  if(m.elements){ // custom full cube like grass_block
    return {top:g('top')||g('up')||g('all'),side:g('side')||g('north')||g('all'),bottom:g('bottom')||g('down')||g('all')};
  }
  return null;
}
// java -> bedrock name overrides
const alias={bricks:'brick_block',magma_block:'magma',melon:'melon_block',stone_bricks:'stone_bricks',nether_bricks:'nether_brick',red_nether_bricks:'red_nether_brick',nether_wart_block:'nether_wart_block',mycelium:'mycelium',grass_block:'grass_block',dirt_path:'grass_path',smooth_quartz:'quartz_block',quartz_block:'quartz_block',snow_block:'snow',terracotta:'hardened_clay',bone_block:'bone_block',cut_copper:'cut_copper',moss_block:'moss_block',purpur_block:'purpur_block',end_stone_bricks:'end_bricks',lily_pad:'waterlily',cobweb:'web',note_block:'noteblock',nether_quartz_ore:'quartz_ore',slime_block:'slime',rooted_dirt:'dirt_with_roots',light_gray_glazed_terracotta:'silver_glazed_terracotta',waxed_copper_block:'waxed_copper'};
// Java blocks we want: full cubes (boundingBox block), skip technical ones
const skip=/^(air|cave_air|void_air|barrier|light|structure_void|structure_block|jigsaw|command_block|chain_command_block|repeating_command_block|bedrock|spawner|trial_spawner|vault|test_block|test_instance_block|piston_head|moving_piston|farmland|dirt_path|water|lava|fire|soul_fire|end_portal|end_portal_frame|nether_portal|end_gateway|frosted_ice|budding_amethyst|reinforced_deepslate|infested_.*|.*_head|.*_skull|.*_banner|.*_bed|.*_shulker_box|.*_sign|.*_hanging_sign|.*_chest|.*_door|.*trapdoor|.*_stairs|.*_slab|.*_wall|.*_fence|.*_fence_gate|.*_button|.*_pressure_plate|.*_pane|.*_carpet|.*_candle|.*_sapling|.*_leaves_.*|.*_cauldron|bamboo|.*_coral$|.*_coral_fan|.*_coral_wall_fan|conduit|beacon|enchanting_table|brewing_stand|lectern|grindstone|stonecutter|bell|campfire|soul_campfire|lantern|soul_lantern|chain|.*rod|hopper|cake|composter|cauldron|anvil|chipped_anvil|damaged_anvil|dragon_egg|decorated_pot|sniffer_egg|turtle_egg|frogspawn|.*_torch|torch|ladder|vine|glow_lichen|sculk_vein|scaffold.*|snow|powder_snow|tripwire.*|redstone_wire|repeater|comparator|lever|daylight_detector|.*_crop|wheat|carrots|potatoes|beetroots|sweet_berry_bush|cactus|sugar_cane|kelp|kelp_plant|seagrass|tall_seagrass|nether_wart|.*_roots|.*_fungus|.*_stem|.*_stem$|attached_.*|.*_plant|flower_pot|potted_.*|.*mushroom$|.*_tulip|.*)$/;
const keep=[];
for(const b of jd.blocksArray){
  if(b.boundingBox!=='block') continue;
  const n=b.name;
  if(/(^|_)(door|trapdoor|stairs|slab|wall|fence|fence_gate|button|pressure_plate|pane|carpet|candle|sapling|head|skull|banner|bed|shulker_box|sign|chest|coral_fan|coral_wall_fan|torch|lantern|rod|vine|lichen|vein|crop|roots|fungus|leaves_litter)$/.test(n)) continue;
  if(/^(air|cave_air|void_air|barrier|light|structure_void|structure_block|jigsaw|command_block|chain_command_block|repeating_command_block|spawner|trial_spawner|vault|test_block|test_instance_block|piston_head|moving_piston|water|lava|fire|soul_fire|end_portal|end_portal_frame|nether_portal|end_gateway|bedrock|farmland|dirt_path|frosted_ice|snow|powder_snow|cactus|conduit|beacon|enchanting_table|brewing_stand|lectern|grindstone|stonecutter|bell|campfire|soul_campfire|hopper|cake|composter|cauldron|water_cauldron|lava_cauldron|powder_snow_cauldron|anvil|chipped_anvil|damaged_anvil|dragon_egg|decorated_pot|sniffer_egg|turtle_egg|frogspawn|ladder|scaffolding|tripwire|redstone_wire|repeater|comparator|lever|daylight_detector|wheat|carrots|potatoes|beetroots|sweet_berry_bush|sugar_cane|kelp|kelp_plant|seagrass|tall_seagrass|nether_wart|flower_pot|bamboo|chorus_plant|chorus_flower|sea_pickle|cocoa|pointed_dripstone|amethyst_cluster|large_amethyst_bud|medium_amethyst_bud|small_amethyst_bud|glow_item_frame|item_frame|end_rod|lightning_rod|iron_bars|chain|lily_pad|cobweb|big_dripleaf|small_dripleaf|big_dripleaf_stem|hanging_roots|spore_blossom|moss_carpet|pale_moss_carpet|tnt|bubble_column|slime_block_x)$/.test(n)) continue;
  if(/^(infested_|potted_|attached_|.*_wall_(banner|sign|head|skull|torch|hanging_sign|fan)|.*_candle_cake|.*_stem$|.*_sapling|.*_button|.*coral$)/.test(n)) continue;
  if(/(mushroom|tulip|flower|fern|grass|bush|azalea|dandelion|poppy|orchid|allium|bluet|daisy|lily|rose|peony|lilac|sunflower|sprout|tall|plant|vines|dripleaf|berries|torchflower|pitcher|cornflower)/.test(n) && !/(block|grass_block)/.test(n)) continue;
  keep.push(b);
}
(async()=>{
const beBlocks=await fetchJson(BEDROCK_SAMPLES+'blocks.json');
const beTerrain=(await fetchJson(BEDROCK_SAMPLES+'textures/terrain_texture.json')).texture_data;
const beUsed={}, beMissing=[];
const out=[]; const missing=[];
for(const b of keep){
  const n=b.name;
  const bn=alias[n]||n;
  if(!bd.blocksByName[bn]){ missing.push(n+'→'+bn); continue; }
  const tn=n.startsWith('waxed_')?n.replace('waxed_',''):n; const tx=resolveTextures(tn);
  let top=null,side=null,bottom=null;
  if(tx){top=tx.top&&avg(tx.top);side=tx.side&&avg(tx.side);bottom=tx.bottom&&avg(tx.bottom);}
  if(!tx||(!top&&!side&&!bottom)){
    const a=avg(tn); top=side=bottom=a;
  }
  top=top||side||bottom; side=side||top; bottom=bottom||side;
  if(!top){ missing.push(n+' (sem textura)'); continue; }
  const glassy=/glass/.test(n)||n==='ice';
  // 0 = opaco, 1 = translúcido (vidro, gelo, slime, mel), 2 = recortado (folhas: buracos, mas sem transparência parcial)
  const kind=glassy||top.a<0.9?1:/leaves$/.test(n)?2:0;
  const ti=tintOf(n)||[0,0,0];
  // Texturas Java: nomes em assets/minecraft/textures/block/
  const jt=tx&&(tx.top||tx.side||tx.bottom)?[tx.top||tx.side||tx.bottom,tx.side||tx.top||tx.bottom,tx.bottom||tx.side||tx.top]:[tn,tn,tn];
  // Texturas Bedrock: nomes curtos do terrain_texture.json
  const be=beBlocks[beTexAlias[n]||bn]||beBlocks[bn];
  let bt=null;
  if(be&&be.textures){
    const u=beFace(be.textures,'up'),sd=beFace(be.textures,'side'),d=beFace(be.textures,'down');
    bt=[u||sd||d,sd||u||d,d||sd||u];
    bt.forEach(k=>{ if(!beTerrain[k]) beMissing.push(n+':'+k); else beUsed[k]=1; });
  } else beMissing.push(n);
  const compact=a=>a[0]===a[1]&&a[1]===a[2]?a[0]:a;
  out.push([n,b.displayName,bn,mul(top.c,ti[0]),mul(side.c,ti[1]),mul(bottom.c,ti[2]),kind,compact(jt),bt?compact(bt):0,ti[0]||ti[1]||ti[2]?compact(ti):0]);
}
console.error('keep',keep.length,'out',out.length,'missing',missing.length);
console.error(missing.join(', '));
fs.writeFileSync('data/blocks.json',JSON.stringify(out));
console.error(out.slice(0,5).map(r=>JSON.stringify(r)).join('\n'));
// Caminho vanilla de cada nome curto Bedrock usado (primeira variante). 1 no fim = textura com
// overlay_color (ex.: lateral da grama: só a parte com alfa recebe a cor do bioma).
// Quando o nome curto tem várias variantes, a primeira costuma ser o estado padrão. Exceção: blocos
// de cogumelo, em que a primeira é o miolo e o estado padrão (todas as faces de casca) é outra.
const beVariant={mushroom_brown:'skin_brown',mushroom_red:'skin_red'};
function bePath(e,k){
  let t=e&&e.textures;
  if(Array.isArray(t)){
    const want=Object.keys(beVariant).find(p=>k.startsWith(p));
    t=(want&&t.find(x=>(typeof x==='string'?x:x.path||'').includes(beVariant[want])))||t[0];
  }
  if(t&&typeof t==='object'){ if(t.variations) t=t.variations[0]; return t.path?[t.path,t.overlay_color||t.tint_color?1:0]:null; }
  return typeof t==='string'?[t,0]:null;
}
const tex={};
Object.keys(beUsed).sort().forEach(k=>{ const p=bePath(beTerrain[k],k); if(p) tex[k]=p[1]?p:p[0]; });
fs.writeFileSync('data/bedrock_textures.json',JSON.stringify(tex));
console.error('bedrock: texturas',Object.keys(tex).length,'sem mapeamento',beMissing.length,beMissing.join(', '));
})().catch(e=>{ console.error(e); process.exit(1); });
