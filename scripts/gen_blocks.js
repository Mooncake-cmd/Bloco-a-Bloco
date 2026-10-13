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
// Faces em ordem [cima, baixo, norte, sul, leste, oeste]
const FACES6=['up','down','north','south','east','west'];
const MODELS=assets.blocksModels, STATES=assets.blocksStates;
const clean=s=>s.replace('minecraft:','').replace(/^block\//,'');
// Textura de cada face do modelo, seguindo a cadeia de "parent" (variáveis #nome e elementos herdados).
// Só vale para modelos com um elemento de cubo inteiro.
function modelFaces(name){
  let m=MODELS[clean(name)]; if(!m) return null;
  const tex={}; let elements=null;
  for(let d=0;m&&d<20;d++){
    for(const k in (m.textures||{})) if(!(k in tex)) tex[k]=m.textures[k];
    if(!elements&&m.elements) elements=m.elements;
    m=m.parent?MODELS[clean(m.parent)]:null;
  }
  const full=elements&&elements.find(e=>e.from.every(v=>v===0)&&e.to.every(v=>v===16));
  if(!full) return null;
  const res=v=>{ for(let i=0;i<10&&v&&v.startsWith('#');i++) v=tex[v.slice(1)]; return v&&!v.startsWith('#')?clean(v):null; };
  const f={}; for(const k of FACES6) f[k]=full.faces[k]?res(full.faces[k].texture):null;
  // rotação da textura na própria face (ex.: terracota esmaltada), fica fora das 6 chaves
  Object.defineProperty(f,'rot',{value:Object.fromEntries(FACES6.map(k=>[k,full.faces[k]&&full.faces[k].rotation||0]))});
  return f.up||f.north?f:null;
}
// Rotação do blockstate (x e depois y, em passos de 90 graus, como no jogo)
function rotate(f,x,y){
  const step=(r,m)=>{ const o={}; for(const k in m) o[m[k]]=r[k]; return o; };
  const X90={up:'north',north:'down',down:'south',south:'up',east:'east',west:'west'};
  const Y90={north:'east',east:'south',south:'west',west:'north',up:'up',down:'down'};
  for(let i=0;i<((x||0)/90)%4;i++) f=step(f,X90);
  for(let i=0;i<((y||0)/90)%4;i++) f=step(f,Y90);
  return f;
}
// Valores padrão das propriedades do bloco Java (estado padrão do minecraft-data)
function javaDefaults(b){
  let i=b.defaultState-b.minStateId; const props={}; const st=b.states||[];
  for(let k=st.length-1;k>=0;k--){
    const s=st[k], n=s.num_values, idx=i%n; i=Math.floor(i/n);
    props[s.name]=s.type==='bool'?(idx===0?'true':'false'):s.values?s.values[idx]:String(idx);
  }
  return props;
}
// Faces Java do bloco no estado que vai ser exportado (padrão + o que DIR muda)
function javaFaces(n,props,front){
  const st=STATES[n]; let v=null;
  if(st&&st.variants){
    const ok=k=>!k||k.split(',').every(pv=>{ const [p,val]=pv.split('='); return props[p]===val; });
    const k=Object.keys(st.variants).find(ok); v=k!==undefined?st.variants[k]:null; if(Array.isArray(v)) v=v[0];
  } else if(st&&st.multipart){
    const part=st.multipart.find(p=>p.when&&Object.keys(p.when).length===1&&p.when.facing===props.facing)||st.multipart[0];
    v=part.apply; if(Array.isArray(v)) v=v[0];
  }
  const f=(v&&modelFaces(v.model))||modelFaces(n); if(!f) return null;
  if(front&&!f.north) f.north=front;
  for(const k of FACES6) f[k]=f[k]||f.east||f.up||f.north;
  return v?rotate(f,v.x,v.y):f;
}
// Blocos com frente. def: direção inicial (a frente para o sul, lado que a câmera inicial mostra; barril de pé).
// be: texturas Bedrock com a frente para o NORTE, que é o espaço do modelo Java sem rotação.
const DIR={
  furnace:{def:'south',be:{front:'furnace_front_off',side:'furnace_side',up:'furnace_top',down:'furnace_top'}},
  smoker:{def:'south',be:{front:'smoker_front_off',side:'smoker_side',up:'smoker_top',down:'smoker_bottom'}},
  blast_furnace:{def:'south',be:{front:'blast_furnace_front_off',side:'blast_furnace_side',up:'blast_furnace_top',down:'blast_furnace_top'}},
  carved_pumpkin:{def:'south',be:{front:'pumpkin_face',side:'pumpkin_side',up:'pumpkin_top',down:'pumpkin_top'}},
  jack_o_lantern:{def:'south',be:{front:'pumpkin_face#1',side:'pumpkin_side',up:'pumpkin_top',down:'pumpkin_top'}},
  loom:{def:'south',be:{front:'loom_front',side:'loom_side',up:'loom_top',down:'loom_bottom'}},
  beehive:{def:'south',be:{front:'beehive_front',side:'beehive_side',up:'beehive_top',down:'beehive_top'}},
  bee_nest:{def:'south',be:{front:'bee_nest_front',side:'bee_nest_side',up:'bee_nest_top',down:'bee_nest_bottom'}},
  chiseled_bookshelf:{def:'south',jfront:'chiseled_bookshelf_empty',be:{front:'chiseled_bookshelf_front',side:'chiseled_bookshelf_side',up:'chiseled_bookshelf_top',down:'chiseled_bookshelf_top'}},
  dispenser:{def:'south',be:{front:'dispenser_front_horizontal',side:'dispenser_side',up:'dispenser_top',down:'dispenser_top'}},
  dropper:{def:'south',be:{front:'dropper_front_horizontal',side:'dropper_side',up:'dropper_top',down:'dropper_top'}},
  observer:{def:'south',be:{front:'observer_north',back:'observer_south',side:'observer_east',up:'observer_top',down:'observer_bottom'}},
  crafter:{def:'south_up',be:{front:'crafter_north',back:'crafter_south',east:'crafter_east',west:'crafter_west',up:'crafter_top',down:'crafter_bottom'}},
  barrel:{def:'up',be:{up:'barrel_top',down:'barrel_bottom',side:'barrel_side'}}
};
function beDirFaces(d){
  const e=d.be;
  return {up:e.up,down:e.down,north:e.front||e.side,south:e.back||e.side,east:e.east||e.side,west:e.west||e.side};
}
// Modelos de dois cubos em que o de fora não representa o bloco (mel: casca com a textura de baixo em tudo)
const JOVR={honey_block:{up:'honey_block_top',down:'honey_block_bottom',north:'honey_block_side',south:'honey_block_side',east:'honey_block_side',west:'honey_block_side'}};
// O blocks.json do Bedrock põe o rosto (pumpkin_face) na abóbora inteira, mas ela aparece sem rosto no jogo
const BEOVR={pumpkin:['pumpkin_top','pumpkin_top','pumpkin_side','pumpkin_side','pumpkin_side','pumpkin_side']};
// Texturas que só aparecem em algumas direções (modelo diferente), com o nome Bedrock equivalente
const JB_EXTRA={dispenser_front_vertical:'dispenser_front_vertical',dropper_front_vertical:'dropper_front_vertical'};

// ---- Direções (rotação) ----
// Estado Bedrock que guarda a direção e como converter o valor Java
const BKEYS=[
  ['minecraft:cardinal_direction',v=>['north','south','east','west'].includes(v)?v:undefined],
  ['direction',v=>({south:0,west:1,north:2,east:3})[v]],
  ['facing_direction',v=>({down:0,up:1,north:2,south:3,west:4,east:5})[v]],
  ['minecraft:facing_direction',v=>v],
  ['pillar_axis',v=>v],
  ['orientation',v=>v]
];
const V={up:[0,1,0],down:[0,-1,0],north:[0,0,-1],south:[0,0,1],east:[1,0,0],west:[-1,0,0]};
const neg=v=>v.map(x=>-x||0), eq=(a,b)=>a.every((x,i)=>x===b[i]);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]].map(x=>x||0);
const dirOf=v=>FACES6.find(k=>eq(V[k],v));
// Convenção de textura do Minecraft: nas laterais o "alto" da imagem é +Y; no topo é o norte; embaixo, o sul.
const canonUp=f=>f==='up'?V.north:f==='down'?V.south:V.up;
const canonRight=f=>cross(neg(V[f]),canonUp(f));
function rotVec(v,x,y){
  for(let i=0;i<((x||0)/90)%4;i++) v=[v[0],v[2],-v[1]].map(q=>q||0);
  for(let i=0;i<((y||0)/90)%4;i++) v=[-v[2],v[1],v[0]].map(q=>q||0);
  return v;
}
// Para cada face do mundo: [face do modelo de origem, giros de 90 graus no sentido horário da textura]
function faceMap(mf,x,y,uvlock){
  const out={};
  for(const k of FACES6){
    let u=canonUp(k); const r=(mf.rot&&mf.rot[k]||0)/90;
    for(let i=0;i<r;i++) u=cross(neg(V[k]),u);
    const w=dirOf(rotVec(V[k],x,y));
    let uw;
    if(uvlock){ uw=canonUp(w); for(let i=0;i<r;i++) uw=cross(neg(V[w]),uw); }
    else uw=rotVec(u,x,y);
    const n=V[w], cu=canonUp(w), cr=canonRight(w);
    const t=eq(uw,cu)?0:eq(uw,cr)?1:eq(uw,neg(cu))?2:3;
    out[w]=[k,t];
  }
  return out;
}
function variantFor(n,props){
  const st=STATES[n]; let v=null;
  if(st&&st.variants){
    const ok=k=>!k||k.split(',').every(pv=>{ const [p,val]=pv.split('='); return props[p]===val; });
    const k=Object.keys(st.variants).find(ok); v=k!==undefined?st.variants[k]:null; if(Array.isArray(v)) v=v[0];
  } else if(st&&st.multipart){
    const part=st.multipart.find(p=>p.when&&Object.keys(p.when).length===1&&p.when.facing===props.facing)||st.multipart[0];
    v=part.apply; if(Array.isArray(v)) v=v[0];
  }
  return v;
}
// java -> bedrock name overrides
const alias={jack_o_lantern:'lit_pumpkin',bricks:'brick_block',magma_block:'magma',melon:'melon_block',stone_bricks:'stone_bricks',nether_bricks:'nether_brick',red_nether_bricks:'red_nether_brick',nether_wart_block:'nether_wart_block',mycelium:'mycelium',grass_block:'grass_block',dirt_path:'grass_path',smooth_quartz:'quartz_block',quartz_block:'quartz_block',snow_block:'snow',terracotta:'hardened_clay',bone_block:'bone_block',cut_copper:'cut_copper',moss_block:'moss_block',purpur_block:'purpur_block',end_stone_bricks:'end_bricks',lily_pad:'waterlily',cobweb:'web',note_block:'noteblock',nether_quartz_ore:'quartz_ore',slime_block:'slime',rooted_dirt:'dirt_with_roots',light_gray_glazed_terracotta:'silver_glazed_terracotta',waxed_copper_block:'waxed_copper'};
// Java blocks we want: full cubes (boundingBox block), skip technical ones
const skip=/^(piston|sticky_piston|air|cave_air|void_air|barrier|light|structure_void|structure_block|jigsaw|command_block|chain_command_block|repeating_command_block|bedrock|spawner|trial_spawner|vault|test_block|test_instance_block|piston_head|moving_piston|farmland|dirt_path|water|lava|fire|soul_fire|end_portal|end_portal_frame|nether_portal|end_gateway|frosted_ice|budding_amethyst|reinforced_deepslate|infested_.*|.*_head|.*_skull|.*_banner|.*_bed|.*_shulker_box|.*_sign|.*_hanging_sign|.*_chest|.*_door|.*trapdoor|.*_stairs|.*_slab|.*_wall|.*_fence|.*_fence_gate|.*_button|.*_pressure_plate|.*_pane|.*_carpet|.*_candle|.*_sapling|.*_leaves_.*|.*_cauldron|bamboo|.*_coral$|.*_coral_fan|.*_coral_wall_fan|conduit|beacon|enchanting_table|brewing_stand|lectern|grindstone|stonecutter|bell|campfire|soul_campfire|lantern|soul_lantern|chain|.*rod|hopper|cake|composter|cauldron|anvil|chipped_anvil|damaged_anvil|dragon_egg|decorated_pot|sniffer_egg|turtle_egg|frogspawn|.*_torch|torch|ladder|vine|glow_lichen|sculk_vein|scaffold.*|snow|powder_snow|tripwire.*|redstone_wire|repeater|comparator|lever|daylight_detector|.*_crop|wheat|carrots|potatoes|beetroots|sweet_berry_bush|cactus|sugar_cane|kelp|kelp_plant|seagrass|tall_seagrass|nether_wart|.*_roots|.*_fungus|.*_stem|.*_stem$|attached_.*|.*_plant|flower_pot|potted_.*|.*mushroom$|.*_tulip|.*)$/;
const keep=[];
for(const b of jd.blocksArray){
  if(b.boundingBox!=='block') continue;
  const n=b.name;
  if(n!=='jack_o_lantern'&&/(^|_)(door|trapdoor|stairs|slab|wall|fence|fence_gate|button|pressure_plate|pane|carpet|candle|sapling|head|skull|banner|bed|shulker_box|sign|chest|coral_fan|coral_wall_fan|torch|lantern|rod|vine|lichen|vein|crop|roots|fungus|leaves_litter)$/.test(n)) continue;
  if(/^(piston|sticky_piston|air|cave_air|void_air|barrier|light|structure_void|structure_block|jigsaw|command_block|chain_command_block|repeating_command_block|spawner|trial_spawner|vault|test_block|test_instance_block|piston_head|moving_piston|water|lava|fire|soul_fire|end_portal|end_portal_frame|nether_portal|end_gateway|bedrock|farmland|dirt_path|frosted_ice|snow|powder_snow|cactus|conduit|beacon|enchanting_table|brewing_stand|lectern|grindstone|stonecutter|bell|campfire|soul_campfire|hopper|cake|composter|cauldron|water_cauldron|lava_cauldron|powder_snow_cauldron|anvil|chipped_anvil|damaged_anvil|dragon_egg|decorated_pot|sniffer_egg|turtle_egg|frogspawn|ladder|scaffolding|tripwire|redstone_wire|repeater|comparator|lever|daylight_detector|wheat|carrots|potatoes|beetroots|sweet_berry_bush|sugar_cane|kelp|kelp_plant|seagrass|tall_seagrass|nether_wart|flower_pot|bamboo|chorus_plant|chorus_flower|sea_pickle|cocoa|pointed_dripstone|amethyst_cluster|large_amethyst_bud|medium_amethyst_bud|small_amethyst_bud|glow_item_frame|item_frame|end_rod|lightning_rod|iron_bars|chain|lily_pad|cobweb|big_dripleaf|small_dripleaf|big_dripleaf_stem|hanging_roots|spore_blossom|moss_carpet|pale_moss_carpet|tnt|bubble_column|slime_block_x)$/.test(n)) continue;
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
  const tn=n.startsWith('waxed_')?n.replace('waxed_',''):n;
  const dir=DIR[n], defs=javaDefaults(b);
  // Direções possíveis: propriedade Java facing/axis/orientation que tenha equivalente Bedrock
  const bdef=bd.blockStates.find(x=>x.name===bn);
  const jprop=(b.states||[]).find(s=>['facing','axis','orientation'].includes(s.name)&&s.values);
  const bkey=jprop&&bdef&&BKEYS.find(k=>k[0] in bdef.states);
  let ori=null, jf=null;
  if(jprop&&bkey&&!JOVR[n]){
    let vals=jprop.values.filter(v=>bkey[1](v)!==undefined);
    if(jprop.name==='orientation') vals=vals.filter(v=>/^(north|south|east|west)_up$/.test(v));
    const vs=vals.map(v=>({v,va:variantFor(n,{...defs,[jprop.name]:v})})).filter(o=>o.va);
    // espaço do modelo: a direção cujo blockstate não gira o modelo
    const base=vs.find(o=>!o.va.x&&!o.va.y)||vs[0];
    jf=base&&modelFaces(base.va.model);
    if(jf){
      if(dir&&dir.jfront&&!jf.north) jf.north=dir.jfront;
      for(const k of FACES6) jf[k]=jf[k]||jf.east||jf.up||jf.north;
      const ext=FACES6.map(k=>jf[k]);
      const list=[];
      for(const o of vs){
        let mf=o.va.model===base.va.model?jf:modelFaces(o.va.model);
        if(!mf) continue;
        const fm=faceMap(mf,o.va.x,o.va.y,o.va.uvlock);
        const flat=[];
        for(const w of FACES6){
          const [k,t]=fm[w]; let src=FACES6.indexOf(k);
          if(mf!==jf){ const tx=mf[k]||jf[k]; src=ext.indexOf(tx); if(src<0){ src=ext.length; ext.push(tx); } }
          flat.push(src,t);
        }
        list.push([o.v,bkey[1](o.v),flat]);
      }
      const want=dir?dir.def:defs[jprop.name];
      const di=Math.max(0,list.findIndex(l=>l[0]===want));
      ori={k:jprop.name,bk:bkey[0],d:di,o:list,ext};
    }
  }
  if(!jf) jf=JOVR[n]||javaFaces(n,defs,dir&&dir.jfront)||(tn!==n&&javaFaces(tn,defs))||null;
  let top=null,side=null,bottom=null;
  if(jf){top=avg(jf.up);side=avg(jf.east);bottom=avg(jf.down);}
  if(!jf||(!top&&!side&&!bottom)){
    const a=avg(tn); top=side=bottom=a;
  }
  top=top||side||bottom; side=side||top; bottom=bottom||side;
  if(!top){ missing.push(n+' (sem textura)'); continue; }
  const glassy=/glass/.test(n)||n==='ice';
  // 0 = opaco, 1 = translúcido (vidro, gelo, slime, mel), 2 = recortado (folhas: buracos, mas sem transparência parcial)
  const kind=glassy||top.a<0.9?1:/leaves$/.test(n)?2:0;
  const ti=tintOf(n)||[0,0,0];
  // Texturas Java: nomes em assets/minecraft/textures/block/
  const jt=ori?ori.ext:jf?FACES6.map(k=>jf[k]):[tn,tn,tn,tn,tn,tn];
  // Texturas Bedrock: nomes curtos do terrain_texture.json
  const be=beBlocks[beTexAlias[n]||bn]||beBlocks[bn];
  let bt=null;
  if(dir){ const f=beDirFaces(dir); bt=FACES6.map(k=>f[k]); }
  else if(BEOVR[n]) bt=BEOVR[n];
  else if(be&&be.textures){
    const any=beFace(be.textures,'side')||beFace(be.textures,'up');
    bt=FACES6.map(k=>beFace(be.textures,k)||(k==='up'||k==='down'?null:beFace(be.textures,'side'))||any);
  }
  // texturas extras de algumas direções (dispensador virado para cima/baixo)
  if(bt&&jt.length>6) for(let i=6;i<jt.length;i++){ if(!JB_EXTRA[jt[i]]) console.error('sem equivalente Bedrock:',n,jt[i]); bt.push(JB_EXTRA[jt[i]]||bt[3]); }
  if(bt) bt.forEach(k=>{ if(!beTerrain[k.split('#')[0]]) beMissing.push(n+':'+k); else beUsed[k]=1; });
  else beMissing.push(n);
  const compact=a=>a.length===6&&a.every(x=>x===a[0])?a[0]:a;
  // Direções: {k: propriedade Java, bk: estado Bedrock, d: índice inicial, o: [[valor Java, valor Bedrock, faces]]}.
  // faces: para cada face do mundo [cima, baixo, norte, sul, leste, oeste], o par (textura de origem, giros horários);
  // 0 quando é a identidade. bst: [versão do esquema, estados Bedrock padrão completos].
  let oriOut=0, bst=0;
  if(ori&&ori.o.length>1){
    const id=[0,0,1,0,2,0,3,0,4,0,5,0].join();
    oriOut={k:ori.k,bk:ori.bk,d:ori.d,o:ori.o.map(([j,bv,f])=>[j,bv,f.join()===id?0:f])};
    const st={}; for(const k in bdef.states) st[k]=[bdef.states[k].type,bdef.states[k].value];
    bst=[bdef.version,st];
  }
  out.push([n,b.displayName,bn,mul(top.c,ti[0]),mul(side.c,ti[1]),mul(bottom.c,ti[2]),kind,compact(jt),bt?compact(bt):0,ti[0]||ti[1]||ti[2]?compact(ti):0,oriOut,bst]);
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
  let t=e&&e.textures; const vi=+(k.split('#')[1]||0);
  if(Array.isArray(t)&&vi) t=t[vi]||t[0];
  else if(Array.isArray(t)){
    const want=Object.keys(beVariant).find(p=>k.startsWith(p));
    t=(want&&t.find(x=>(typeof x==='string'?x:x.path||'').includes(beVariant[want])))||t[0];
  }
  if(t&&typeof t==='object'){ if(t.variations) t=t.variations[0]; return t.path?[t.path,t.overlay_color||t.tint_color?1:0]:null; }
  return typeof t==='string'?[t,0]:null;
}
const tex={};
Object.keys(beUsed).sort().forEach(k=>{ const p=bePath(beTerrain[k.split('#')[0]],k); if(p) tex[k]=p[1]?p:p[0]; });
fs.writeFileSync('data/bedrock_textures.json',JSON.stringify(tex));
console.error('bedrock: texturas',Object.keys(tex).length,'sem mapeamento',beMissing.length,beMissing.join(', '));
})().catch(e=>{ console.error(e); process.exit(1); });
