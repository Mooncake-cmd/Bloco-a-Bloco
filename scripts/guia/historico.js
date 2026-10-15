// Capturas da linha do tempo do histórico (com ramos e versões marcadas) e das paletas para o guia:
// node scripts/guia/historico.js <url do editor> <pacote Bedrock .zip> <pasta de saída>
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs'), path = require('path');
const [URL, PACK, OUT] = process.argv.slice(2);
eval(fs.readFileSync(__dirname + '/demo.inc', 'utf8'));
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(s => { if (!sessionStorage.getItem('x')) { sessionStorage.setItem('x', '1'); localStorage.setItem('bloco-a-bloco-v1', s); localStorage.setItem('bloco-a-bloco-measure', '0'); } }, JSON.stringify(proj));
  await p.goto(URL); await p.waitForTimeout(2500);
  await p.setInputFiles('#packIn', PACK);
  await p.waitForFunction(() => /blocos com textura/.test(document.getElementById('toast').textContent), null, { timeout: 300000 });
  const ev = s => p.evaluate(x => window.__bab.ev(x), s);
  const hide = async () => { await p.evaluate(() => document.getElementById('toast').classList.remove('show')); await p.waitForTimeout(600); };
  // uma torre feita em passos; volta 3 passos e faz outro telhado (ramo 2); volta de novo e faz um terceiro (ramo 3)
  await ev(`(function(){ newWorld(24, 20, 24);
    function step(label, f) { beginBatch(label); f(); endBatch(); }
    var g = cellFromName('grass_block'), s = cellFromName('stone_bricks'), o = cellFromName('oak_planks');
    step('Preencher o chão', function(){ for (var x=0;x<24;x++) for (var z=0;z<24;z++) editSet(x,0,z,g); });
    for (var y=1;y<=6;y++) (function(y){ step('Caixa oca', function(){ for (var x=8;x<=15;x++) for (var z=8;z<=15;z++) if (x===8||x===15||z===8||z===15) editSet(x,y,z,s); }); })(y);
    histNode(hist.cur).mark = 'Paredes prontas';
    var roof = function (bl, h) { return function(){ for (var k=0;k<h;k++) for (var x=8+k;x<=15-k;x++) for (var z=8+k;z<=15-k;z++) editSet(x,7+k,z,cellFromName(bl)); }; };
    step('Linha', function(){ for (var x=8;x<=15;x++) editSet(x,7,8,o); });
    step('Caixa sólida', roof('oak_planks', 4)); step('Pincel', function(){ editSet(11,11,11,cellFromName('lantern')); });
    histNode(hist.cur).mark = 'Telhado de madeira';
    histGoto(7);
    step('Pirâmide', roof('deepslate_tiles', 4)); step('Pincel', function(){ editSet(9,7,9,cellFromName('lantern')); }); step('Pincel', function(){ editSet(14,7,14,cellFromName('lantern')); });
    histNode(hist.cur).mark = 'Telhado escuro';
    histGoto(7);
    step('Caixa sólida', function(){ for (var x=8;x<=15;x++) for (var z=8;z<=15;z++) editSet(x,7,z,cellFromName('glass')); });
    histGoto(13);
    Object.assign(cam,{yaw:0.7,pitch:0.5,dist:30,tx:12,ty:5,tz:12}); updateCamera(); requestRender(); })()`);
  await p.click('#histBtn'); await p.waitForTimeout(800); await hide();
  const dlg = await p.$('.dialog'); await dlg.screenshot({ path: path.join(OUT, 'historico.jpg'), type: 'jpeg', quality: 85 });
  await p.click('#hClose');
  // paletas: uma paleta do usuário e uma do site renomeada
  await ev(`(function(){ pal = { def: { pedra: { name: 'Pedras e tijolos' } }, hidden: ['tecnico'], mine: [{ id: 'u1', name: 'Casa medieval', blocks: ['cobblestone','stone_bricks','oak_planks','oak_log','spruce_planks','spruce_log','spruce_stairs','spruce_slab','spruce_door','spruce_trapdoor','oak_fence','lantern','glass_pane','hay_block','bricks','torch'] }], order: null }; activeCat = 'u1'; palChanged(); })()`);
  await p.mouse.move(600, 400); await p.waitForTimeout(500); await hide();
  await p.screenshot({ path: path.join(OUT, 'paleta-propria.jpg'), type: 'jpeg', quality: 82, clip: { x: 972, y: 0, width: 308, height: 800 } });
  await p.click('#palBtn'); await p.waitForTimeout(500);
  await (await p.$('.dialog')).screenshot({ path: path.join(OUT, 'paletas.jpg'), type: 'jpeg', quality: 85 });
  await p.click('[data-p="u1"] [data-a="edit"]'); await p.waitForTimeout(300);
  await p.fill('#peQ', 'spruce'); await p.waitForTimeout(300);
  await (await p.$('.dialog')).screenshot({ path: path.join(OUT, 'paleta-editar.jpg'), type: 'jpeg', quality: 85 });
  console.log('ok historico', errs);
  await b.close();
})();
