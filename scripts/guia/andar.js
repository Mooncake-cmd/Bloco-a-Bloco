// Capturas da primeira pessoa (dentro da casa de exemplo) e da camada fantasma para o guia:
// node scripts/guia/andar.js <url do editor> <pacote Bedrock .zip> <pasta de saída>
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
  // primeira pessoa: do lado de fora, olhando a porta da casa
  await p.keyboard.press('j');
  await ev(`walkStart([10, 0, 19]); walk.yaw = 0.05; walk.pitch = 0.02; updateCamera(); requestRender();`);
  await p.mouse.move(1100, 700); await p.waitForTimeout(2500); await hide();
  await p.screenshot({ path: path.join(OUT, 'primeira-pessoa.jpg'), type: 'jpeg', quality: 82, clip: { x: 0, y: 0, width: 972, height: 772 } });
  await ev(`walkStop()`);
  // fantasma: térreo com paredes, piso por cima e o andar de cima começando
  await ev(`(function(){ newWorld(32, 16, 32); var g=cellFromName('grass_block'), w=cellFromName('stone_bricks'), f=cellFromName('oak_planks'); beginBatch();
    for (var x=0;x<32;x++) for (var z=0;z<32;z++) editSet(x,0,z,g);
    for (var y=1;y<=3;y++) { for (var x2=8;x2<=22;x2++) { editSet(x2,y,8,w); editSet(x2,y,20,w); } for (var z2=8;z2<=20;z2++) { editSet(8,y,z2,w); editSet(22,y,z2,w); editSet(15,y,z2,w); } }
    for (var x3=8;x3<=22;x3++) for (var z3=8;z3<=20;z3++) editSet(x3,4,z3,f);
    var w2 = cellFromName('bricks'); for (var x4=8;x4<=15;x4++) editSet(x4,5,8,w2); for (var z4=8;z4<=13;z4++) editSet(8,5,z4,w2);
    endBatch(); ghost.on = true; ghost.off = 2; setLayer(true, 5); setTool('place');
    Object.assign(cam,{yaw:0.6,pitch:0.85,dist:32,tx:15,ty:4,tz:14}); updateCamera(); requestRender(); })()`);
  await p.mouse.move(1100, 700); await p.waitForTimeout(2500); await hide();
  await p.screenshot({ path: path.join(OUT, 'fantasma.jpg'), type: 'jpeg', quality: 82, clip: { x: 0, y: 0, width: 972, height: 640 } });
  console.log('ok andar', errs);
  await b.close();
})();
