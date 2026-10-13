const fs=require('fs');
const root=require('path').resolve(__dirname,'..');
let t=fs.readFileSync(root+'/src/app.template.html','utf8');
const blocks=fs.readFileSync(root+'/data/blocks.json','utf8');
const exp=fs.readFileSync(root+'/src/exporters.js','utf8');
const three=fs.readFileSync(root+'/node_modules/three/build/three.min.js','utf8');
t=t.replace('/*%%EXPORTERS%%*/',()=>exp).replace('/*%%BLOCKS%%*/[]',()=>blocks);
// artifact: CDN
const art=t.replace('%%THREE%%','<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>');
fs.writeFileSync(root+'/dist/artifact.html',art);
// local: three inline, full document
const titleM=art.match(/<title>.*?<\/title>/)[0];
let body=t.replace(titleM,'').replace('%%THREE%%','<script>'+three.replace(/<\/script>/g,'<\\/script>')+'</script>');
const local='<!doctype html>\n<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'+titleM+'</head><body>\n'+body+'\n</body></html>\n';
fs.writeFileSync(root+'/dist/bloco-a-bloco.html',local);
console.log('artifact',art.length,'local',local.length);
