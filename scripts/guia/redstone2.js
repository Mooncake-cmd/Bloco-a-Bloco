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
  await ev(`openFill([3,1,9], BLOCKS[BY_JAVA.chest])`); await p.fill('#fillR', '9'); await p.dispatchEvent('#fillR', 'input'); await p.waitForTimeout(300);
  await (await p.$('.dialog')).screenshot({ path: path.join(OUT, 'redstone-conteudo.jpg'), type: 'jpeg', quality: 85 });
  console.log('ok redstone2', errs);
  await b.close();
})();
