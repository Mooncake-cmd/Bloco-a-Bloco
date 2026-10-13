var SX=24,SY=16,SZ=24; var g=new Array(SX*SY*SZ).fill(0); var pal=[];
var id=n=>{ let i=pal.indexOf(n); if(i<0){pal.push(n); i=pal.length-1;} return i+1; };
var put=(x,y,z,n)=>{ if(x>=0&&y>=0&&z>=0&&x<SX&&y<SY&&z<SZ) g[(y*SZ+z)*SX+x]=id(n); };
for(let x=0;x<SX;x++)for(let z=0;z<SZ;z++) put(x,0,z,'grass_block');
// casa 9x7 em x 6..14, z 7..13
const X0=6,X1=14,Z0=7,Z1=13;
for(let x=X0;x<=X1;x++)for(let z=Z0;z<=Z1;z++) put(x,0,z,'cobblestone');
for(let y=1;y<=4;y++) for(let x=X0;x<=X1;x++) for(let z=Z0;z<=Z1;z++){
  const ex=x===X0||x===X1, ez=z===Z0||z===Z1; if(!ex&&!ez) continue;
  if(ex&&ez) put(x,y,z,'oak_log[axis=y]'); else put(x,y,z,'oak_planks');
}
// porta e janelas (lado sul = z alto)
put(10,1,Z1,'oak_door[facing=north,half=lower,hinge=left,open=false]'); put(10,2,Z1,'oak_door[facing=north,half=upper,hinge=left,open=false]');
for(const x of [8,12]) for(const y of [2,3]) put(x,y,Z1,'glass_pane');
for(const z of [9,11]) for(const y of [2,3]) { put(X0,y,z,'glass_pane'); put(X1,y,z,'glass_pane'); }
// telhado de escadas
for(let k=0;k<4;k++){ const zl=Z0-1+k, zh=Z1+1-k; for(let x=X0-1;x<=X1+1;x++){ put(x,5+k,zl,'spruce_stairs[facing=south,half=bottom]'); put(x,5+k,zh,'spruce_stairs[facing=north,half=bottom]'); } }
for(let x=X0-1;x<=X1+1;x++) put(x,9,10,'spruce_slab[type=bottom]');
for(let k=0;k<4;k++) for(let z=Z0+k;z<=Z1-k;z++){ put(X0,5+k,z,'spruce_planks'); put(X1,5+k,z,'spruce_planks'); }
// detalhes
put(9,3,Z1+1,'wall_torch[facing=south]'); put(11,3,Z1+1,'wall_torch[facing=south]');
for(let z=Z1+1;z<SZ;z++) put(10,0,z,'dirt_path');
for(let x=2;x<=18;x++){ put(x,1,18,'oak_fence'); } put(10,1,18,'oak_fence_gate[facing=south,open=false]');
for(let z=15;z<18;z++){ put(2,1,z,'oak_fence'); put(18,1,z,'oak_fence'); }
put(4,1,16,'poppy'); put(5,1,16,'dandelion'); put(16,1,16,'blue_orchid'); put(15,1,16,'oxeye_daisy'); put(3,1,15,'rose_bush[half=lower]'); put(3,2,15,'rose_bush[half=upper]');
put(17,1,20,'oak_log[axis=y]'); for(let y=2;y<=4;y++) put(17,y,20,'oak_log[axis=y]'); for(let x=15;x<=19;x++) for(let z=18;z<=22;z++) for(let y=4;y<=6;y++){ if((x===15||x===19)&&(z===18||z===22)) continue; if(x===17&&z===20&&y<5) continue; if(y===6&&(x===15||x===19||z===18||z===22)) continue; put(x,y,z,'oak_leaves'); }
put(4,1,10,'chest[facing=east]'); put(4,1,11,'chest[facing=east]'); put(3,1,12,'lantern[hanging=false]');
put(20,1,8,'redstone_wire'); put(20,1,9,'redstone_wire'); put(20,1,10,'redstone_wire'); put(20,1,11,'repeater[facing=north,delay=1]'); put(20,1,12,'redstone_wire'); put(20,1,7,'lever[face=floor,facing=north,powered=false]'); put(20,1,13,'redstone_lamp[lit=false]');
put(22,1,2,'allow');
var rle=[]; let last=-1,run=0; for(const v of g){ if(v===last) run++; else { if(run) rle.push(last,run); last=v; run=1; } } rle.push(last,run);
var proj={v:1,size:[SX,SY,SZ],pal,rle,hotbar:['oak_planks','oak_log','spruce_stairs','oak_door','glass_pane','oak_fence','torch','redstone_wire','furnace'],slot:0};
