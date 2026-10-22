// encosta (sobe 1 a cada 2 em X) com grama e capim, e uma casa de 9 × 7 com piso em Y 21 e porta voltada para -Z
var SX=64,SY=40,SZ=64,g=new Array(SX*SY*SZ).fill(0),pal=[];
var id=n=>{let i=pal.indexOf(n);if(i<0){pal.push(n);i=pal.length-1;}return i+1;};
var put=(x,y,z,n)=>{if(x>=0&&y>=0&&z>=0&&x<SX&&y<SY&&z<SZ)g[(y*SZ+z)*SX+x]=id(n);};
var rnd=(()=>{let s=7;return()=>(s=(s*16807)%2147483647)/2147483647;})();
for(let x=0;x<SX;x++)for(let z=0;z<SZ;z++){const h=6+Math.floor(x/2);for(let y=0;y<=h;y++)put(x,y,z,y===h?'grass_block':y>h-4?'dirt':'stone');if(rnd()<0.25)put(x,h+1,z,'short_grass');}
const X0=26,X1=34,Z0=28,Z1=34,F=21;
for(let x=X0;x<=X1;x++)for(let z=Z0;z<=Z1;z++){
  for(let y=F;y<=F+5;y++)put(x,y,z,0);
  put(x,F,z,'oak_planks');
  const ex=x===X0||x===X1,ez=z===Z0||z===Z1;
  if(ex||ez)for(let y=F+1;y<=F+4;y++)put(x,y,z,ex&&ez?'oak_log':'cobblestone');
  put(x,F+5,z,'spruce_planks');
}
for(let x=X0-1;x<=X1+1;x++){put(x,F+5,Z0-1,'spruce_slab');put(x,F+5,Z1+1,'spruce_slab');}
put(30,F+1,Z0,0);put(30,F+2,Z0,0);
var DOOR=[30,F+1,Z0];
var proj={v:1,size:[SX,SY,SZ],pal:pal,rle:(()=>{const r=[];let c=g[0],n=0;for(const v of g){if(v===c)n++;else{r.push(c,n);c=v;n=1;}}r.push(c,n);return r;})()};
