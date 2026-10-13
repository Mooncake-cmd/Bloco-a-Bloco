const nbt=require('prismarine-nbt');
const E=require('../src/exporters.js');
const BL=JSON.parse(require('fs').readFileSync(__dirname+'/../data/blocks.json','utf8')).map(r=>({java:r[0],bedrock:r[2]}));
const idx=n=>BL.findIndex(b=>b.java===n);
const vox=[[5,64,10,idx('stone')],[6,64,10,idx('oak_log')],[5,66,12,idx('oak_leaves')],[7,65,11,idx('bricks')],[5,64,12,idx('grass_block')]];
(async()=>{
  const schem=await E.exportSchem(vox,BL,{name:'t'});
  const {parsed}=await nbt.parse(Buffer.from(schem));
  const s=nbt.simplify(parsed).Schematic;
  console.log('schem',s.Version,s.DataVersion,s.Width,s.Height,s.Length,JSON.stringify(s.Blocks.Palette));
  // decode varints
  const d=s.Blocks.Data;console.log('data len',d.length,'expected',s.Width*s.Height*s.Length);
  const inv={};for(const k in s.Blocks.Palette)inv[s.Blocks.Palette[k]]=k;
  const W=s.Width,L=s.Length;
  let found=[];
  d.forEach((v,i)=>{ if(v){const x=i%W,z=Math.floor(i/W)%L,y=Math.floor(i/(W*L));found.push([x+5,y+64,z+10,inv[v]]);}});
  console.log(JSON.stringify(found));
  const mc=await E.exportMcstructure(vox,BL,{preserveTerrain:true});
  const r=await nbt.parse(Buffer.from(mc),'little');
  const m=nbt.simplify(r.parsed);
  console.log('mcs',m.format_version,m.size,JSON.stringify(m.structure.palette.default.block_palette.map(p=>p.name+JSON.stringify(p.states))));
  const [sx,sy,sz]=m.size;const bi=m.structure.block_indices;
  console.log('layers',bi.length,bi[0].length,sx*sy*sz);
  const P=m.structure.palette.default.block_palette;let f2=[];
  bi[0].forEach((v,i)=>{const z=i%sz,y=Math.floor(i/sz)%sy,x=Math.floor(i/(sz*sy));if(P[v].name!=='minecraft:structure_void')f2.push([x+5,y+64,z+10,P[v].name]);});
  console.log(JSON.stringify(f2));
  console.log('layer1 all -1',bi[1].every(v=>v===-1));
})().catch(e=>{console.error('ERRO',e);process.exit(1)});
