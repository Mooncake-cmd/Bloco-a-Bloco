const fs=require('fs');
const root=require('path').resolve(__dirname,'..');
let t=fs.readFileSync(root+'/src/app.template.html','utf8');
const blocks=fs.readFileSync(root+'/data/blocks.json','utf8');
const exp=fs.readFileSync(root+'/src/exporters.js','utf8');
const betex=fs.readFileSync(root+'/data/bedrock_textures.json','utf8');
// formas: código e dados (dados compactados em gzip + base64; o editor abre com DecompressionStream)
const shapesJs=fs.readFileSync(root+'/src/shapes.js','utf8');
const shapesGz=require('zlib').gzipSync(fs.readFileSync(root+'/data/shapes.json'),{level:9}).toString('base64');
const three=fs.readFileSync(root+'/node_modules/three/build/three.min.js','utf8');
t=t.replace('/*%%EXPORTERS%%*/',()=>exp).replace('/*%%BLOCKS%%*/[]',()=>blocks).replace('/*%%BETEX%%*/{}',()=>betex).replace('/*%%SHAPES_JS%%*/',()=>shapesJs.replace('%%SHAPES%%',()=>shapesGz)).replace('/*%%IMPORT_JS%%*/',()=>fs.readFileSync(root+'/src/import.js','utf8')).replace('/*%%SELECTION_JS%%*/',()=>fs.readFileSync(root+'/src/selection.js','utf8')).replace('/*%%TREES_JS%%*/',()=>fs.readFileSync(root+'/src/trees.js','utf8')).replace('/*%%FLUIDS_JS%%*/',()=>fs.readFileSync(root+'/src/fluids.js','utf8')).replace('/*%%WORLD_JS%%*/',()=>fs.readFileSync(root+'/src/world.js','utf8')).replace('/*%%MASK_JS%%*/',()=>fs.readFileSync(root+'/src/maskbrush.js','utf8')).replace('/*%%SYM_JS%%*/',()=>fs.readFileSync(root+'/src/symmetry.js','utf8')).replace('/*%%MEASURE_JS%%*/',()=>fs.readFileSync(root+'/src/measure.js','utf8')).replace('/*%%WORLDIO_JS%%*/',()=>fs.readFileSync(root+'/src/worldio.js','utf8')).replace('/*%%SCULPT_JS%%*/',()=>fs.readFileSync(root+'/src/sculpt.js','utf8')).replace('/*%%SHAPES2_JS%%*/',()=>fs.readFileSync(root+'/src/shapes2.js','utf8')).replace('/*%%LIBRARY_JS%%*/',()=>fs.readFileSync(root+'/src/library.js','utf8')).replace('/*%%WALK_JS%%*/',()=>fs.readFileSync(root+'/src/walk.js','utf8')).replace('/*%%GHOST_JS%%*/',()=>fs.readFileSync(root+'/src/ghost.js','utf8'));
// artifact: CDN
const art=t.replace('%%THREE%%','<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>');
fs.writeFileSync(root+'/dist/artifact.html',art);
// local: three inline, full document
const titleM=art.match(/<title>.*?<\/title>/)[0];
let body=t.replace(titleM,'').replace('%%THREE%%','<script>'+three.replace(/<\/script>/g,'<\\/script>')+'</script>');
const local='<!doctype html>\n<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'+titleM+'</head><body>\n'+body+'\n</body></html>\n';
fs.writeFileSync(root+'/dist/bloco-a-bloco.html',local);
console.log('artifact',art.length,'local',local.length);
// guia de uso: guia/guia.html é o conteúdo (o mesmo publicado como artefato); o site serve guia/index.html
const guia=fs.readFileSync(root+'/guia/guia.html','utf8');
fs.writeFileSync(root+'/guia/index.html','<!doctype html>\n<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>\n'+guia+'\n</body></html>\n');
