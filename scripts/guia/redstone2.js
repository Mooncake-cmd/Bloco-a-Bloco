// Capturas da etapa 2 da redstone para o guia: pistão grudento com bloco de slime levando os blocos grudados (o mel ao
// lado fica), comparadores lendo um baú (nível escolhido com Usar), um barril atrás de um bloco, um bolo e uma
// composteira, mais a janela do nível de conteúdo:
// node scripts/guia/redstone2.js <url do editor> <pacote Bedrock .zip> <pasta de saída>
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');
const [URL, PACK, OUT] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => { if (!sessionStorage.getItem('x')) { sessionStorage.setItem('x', '1'); localStorage.setItem('bloco-a-bloco-measure', '0'); localStorage.setItem('bloco-a-bloco-redstone', '1'); } });
  await p.goto(URL); await p.waitForTimeout(2500);
  await p.setInputFiles('#packIn', PACK);
  await p.waitForFunction(() => /blocos com textura/.test(document.getElementById('toast').textContent), null, { timeout: 300000 });
  const ev = s => p.evaluate(x => window.__bab.ev(x), s);
  const hide = async () => { await p.evaluate(() => document.getElementById('toast').classList.remove('show')); await p.waitForTimeout(600); };
  await ev(`(function(){ newWorld(20, 10, 16);
    window.S = function(l){ beginBatch(); l.forEach(function(e){ editSet(e[0],e[1],e[2], e[3]?cellFromName(e[3]):0); }); endBatch(); };
    var l = []; for (var x = 0; x < 20; x++) for (var z = 0; z < 16; z++) l.push([x, 0, z, 'smooth_stone']); S(l);
    // slime: pistão grudento virado para o leste, slime com pedra em cima, vidro e lã ao lado; mel encostado fica
    S([[2,1,4,'lever[face=floor,facing=west]'],[3,1,4,'sticky_piston[facing=east]'],[4,1,4,'slime_block'],[4,2,4,'slime_block'],[4,3,4,'stone_bricks'],[4,1,5,'glass'],[4,2,5,'white_wool'],[4,1,3,'honey_block']]);
    // comparadores: baú (nível 9), barril atrás de um bloco (nível 15), bolo com 3 mordidas, composteira cheia
    S([[3,1,9,'chest[facing=south]'],[4,1,9,'comparator[facing=west]'],[5,1,9,'redstone_wire'],[6,1,9,'redstone_wire'],[7,1,9,'redstone_wire'],[8,1,9,'redstone_lamp'],
       [2,1,11,'barrel[facing=up]'],[3,1,11,'stone_bricks'],[4,1,11,'comparator[facing=west]'],[5,1,11,'redstone_wire'],[6,1,11,'redstone_wire'],[7,1,11,'redstone_wire'],
       [3,1,13,'cake[bites=3]'],[4,1,13,'comparator[facing=west]'],[5,1,13,'redstone_wire'],[6,1,13,'redstone_wire'],[7,1,13,'redstone_wire'],
       [3,1,15,'composter[level=8]'],[4,1,15,'comparator[facing=west]'],[5,1,15,'redstone_wire'],[6,1,15,'redstone_wire']]);
    beginBatch('c'); rsFillSet(idx(3,1,9),9,true); rsFillSet(idx(2,1,11),15,true); endBatch();
    var v = gget(2,1,4), bb = BLOCKS[cellBlock(v)], pr = stateProps(bb, cellOri(v)); pr.powered = 'true'; beginBatch('alavanca'); editSet(2,1,4,mkCell(cellBlock(v), stateIndex(bb, pr))); endBatch();
    setTool('use'); Object.assign(cam,{yaw:0.25,pitch:0.32,dist:9,tx:4.5,ty:2,tz:4.5}); updateCamera(); requestRender(); })()`);
  await p.mouse.move(1270, 790); await p.waitForTimeout(3500); await hide();
  await p.screenshot({ path: path.join(OUT, 'redstone-slime.jpg'), type: 'jpeg', quality: 82, clip: { x: 0, y: 0, width: 972, height: 772 } });
  await ev(`(function(){ Object.assign(cam,{yaw:1.05,pitch:0.6,dist:13,tx:5,ty:1,tz:12}); updateCamera(); requestRender(); })()`);
  await p.waitForTimeout(2500); await hide();
  await p.screenshot({ path: path.join(OUT, 'redstone-comparador.jpg'), type: 'jpeg', quality: 82, clip: { x: 0, y: 0, width: 972, height: 772 } });
  // a janela de conteúdo (redstone-conteudo.jpg) agora sai de scripts/guia/redstone4.js
  // etapa 2: lâmpadas de cobre (uma acesa ficou acesa depois do sinal), alvo acertado no centro ligando o pó e uma
  // lâmpada, bloco musical em cima de tábuas, sino e funil travado pela alavanca
  await ev(`(function(){ newWorld(20, 10, 14); rsPlayNote = function(){}; rsPlayBell = function(){};
    var l = []; for (var x = 0; x < 20; x++) for (var z = 0; z < 14; z++) l.push([x, 0, z, 'smooth_stone']); S(l);
    S([[2,1,3,'lever[face=floor,facing=east]'],[3,1,3,'copper_bulb'],[5,1,3,'lever[face=floor,facing=east]'],[6,1,3,'exposed_copper_bulb'],[8,1,3,'weathered_copper_bulb'],[10,1,3,'oxidized_copper_bulb'],
       [3,1,7,'target'],[4,1,7,'redstone_wire'],[5,1,7,'redstone_wire'],[6,1,7,'redstone_wire'],[7,1,7,'redstone_lamp'],
       [9,0,7,'oak_planks'],[9,1,7,'note_block'],[10,1,7,'bell[attachment=floor,facing=north]'],[12,1,7,'lever[face=floor,facing=east]'],[13,1,7,'hopper[facing=down]']]);
    var lev = function (x, y, z, on) { var v = gget(x, y, z), b = BLOCKS[cellBlock(v)], pr = stateProps(b, cellOri(v)); pr.powered = String(on); beginBatch('alavanca'); editSet(x, y, z, mkCell(cellBlock(v), stateIndex(b, pr))); endBatch(); };
    lev(2,1,3,true); lev(5,1,3,true); lev(12,1,7,true); })()`);
  await p.waitForTimeout(500);
  await ev(`(function(){ var v = gget(5,1,3), b = BLOCKS[cellBlock(v)], pr = stateProps(b, cellOri(v)); pr.powered = 'false'; beginBatch('alavanca'); editSet(5,1,3,mkCell(cellBlock(v), stateIndex(b, pr))); endBatch(); rsHitTarget([3,1,7], { pt: [3.5, 1.5, 7], normal: [0, 0, -1] });
    setTool('use'); Object.assign(cam,{yaw:0.55,pitch:0.6,dist:15,tx:7.5,ty:1,tz:5.5}); updateCamera(); requestRender(); })()`);
  await p.mouse.move(1270, 790); await p.waitForTimeout(400); await hide();
  await p.screenshot({ path: path.join(OUT, 'redstone-cobre.jpg'), type: 'jpeg', quality: 82, clip: { x: 0, y: 0, width: 972, height: 772 } });
  console.log('ok redstone2', errs);
  await b.close();
})();
