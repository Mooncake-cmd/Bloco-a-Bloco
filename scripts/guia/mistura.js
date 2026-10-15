// Capturas do pincel de mistura para o guia: um morro pintado com a mistura "Montanha" e um caminho de terra
// misturado na grama, e a janela de editar a mistura:
// node scripts/guia/mistura.js <url do editor> <pacote Bedrock .zip> <pasta de saída>
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');
const [URL, PACK, OUT] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => { if (!sessionStorage.getItem('x')) { sessionStorage.setItem('x', '1'); localStorage.setItem('bloco-a-bloco-measure', '0'); } });
  await p.goto(URL); await p.waitForTimeout(2500);
  await p.setInputFiles('#packIn', PACK);
  await p.waitForFunction(() => /blocos com textura/.test(document.getElementById('toast').textContent), null, { timeout: 300000 });
  const ev = s => p.evaluate(x => window.__bab.ev(x), s);
  const hide = async () => { await p.evaluate(() => document.getElementById('toast').classList.remove('show')); await p.waitForTimeout(600); };
  // terreno: grama com um morro de pedra; a metade oeste do morro pintada com "Montanha" (Superfície), a da frente
  // fica lisa para comparar; um caminho de terra misturado atravessa a grama
  await ev(`(function(){ newWorld(48, 24, 48); var g=cellFromName('grass_block'), d=cellFromName('dirt'), s=cellFromName('stone'); beginBatch();
    for (var x=0;x<48;x++) for (var z=0;z<48;z++) { var h = Math.round(11 * Math.exp(-((x-30)*(x-30)+(z-18)*(z-18))/90)); for (var y=0;y<=2+h;y++) editSet(x,y,z, h>2 ? s : y===2+h ? g : d); }
    endBatch();
    mix.mats=[['stone',50],['andesite',25],['cobblestone',15],['gravel',10]]; mix.mode='surface'; mix.shape='sphere';
    beginBatch('Pincel de mistura'); var done=new Set(); for (var x2=16;x2<=30;x2+=2) for (var z2=4;z2<=32;z2+=2) { var hh = Math.round(11 * Math.exp(-((x2-30)*(x2-30)+(z2-18)*(z2-18))/90)); if (hh > 2) mixBrush([x2, 2 + hh, z2], 2, 'sphere', mix.mats, 'surface', done); } endBatch();
    beginBatch('Pincel de mistura'); done=new Set(); for (var t=0;t<48;t++) { var zc = Math.round(36 + 4*Math.sin(t/7)); mixBrush([t, 2, zc], 1, 'sphere', [['dirt_path',50],['coarse_dirt',30],['gravel',20]], 'surface', done); } endBatch();
    mix.mats=[['dirt_path',50],['coarse_dirt',30],['gravel',20]]; mix.r=2; setTool('mix');
    Object.assign(cam,{yaw:0.35,pitch:0.62,dist:52,tx:24,ty:4,tz:24}); updateCamera(); requestRender(); })()`);
  await p.mouse.move(150, 560); await p.waitForTimeout(2500); await hide();
  await p.screenshot({ path: path.join(OUT, 'mistura.jpg'), type: 'jpeg', quality: 82, clip: { x: 0, y: 0, width: 972, height: 772 } });
  await p.click('#mixEdit'); await p.waitForTimeout(300);
  await p.selectOption('#mxPre', { index: 8 }); await p.waitForTimeout(200);
  await (await p.$('.dialog')).screenshot({ path: path.join(OUT, 'mistura-editar.jpg'), type: 'jpeg', quality: 85 });
  console.log('ok mistura', errs);
  await b.close();
})();
