// Capturas do pincel de bioma para o guia: um terreno com três biomas pintados e a camada colorida ligada, o mapa de um mundo no modo Biomas:
// node scripts/guia/bioma.js <url do editor> <pacote Bedrock .zip> <pasta de saída> [mundo .mcworld gerado pelo jogo]
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');
const [URL, PACK, OUT] = process.argv.slice(2);
const WORLD = process.argv[5] || path.join(__dirname, '../../tests/fixtures/mundo-teste.mcworld'); // o mundo de teste não guarda biomas: para a captura do guia, passe um mundo gerado pelo jogo
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => { if (!sessionStorage.getItem('x')) { sessionStorage.setItem('x', '1'); localStorage.setItem('bloco-a-bloco-measure', '0'); } });
  await p.goto(URL); await p.waitForTimeout(2500);
  await p.setInputFiles('#packIn', PACK);
  await p.waitForFunction(() => /blocos com textura/.test(document.getElementById('toast').textContent), null, { timeout: 300000 });
  const ev = s => p.evaluate(x => window.__bab.ev(x), s);
  const hide = async () => { await p.evaluate(() => document.getElementById('toast').classList.remove('show')); await p.waitForTimeout(600); };
  // terreno de grama com um morro e uma casinha; três biomas pintados: planície nevada, pântano e deserto
  await ev(`(function(){ newWorld(48, 24, 48); var g=cellFromName('grass_block'), d=cellFromName('dirt'), s=cellFromName('stone'), pl=cellFromName('oak_planks'), lg=cellFromName('oak_log'); beginBatch();
    for (var x=0;x<48;x++) for (var z=0;z<48;z++) { var h = Math.round(7 * Math.exp(-((x-34)*(x-34)+(z-12)*(z-12))/70)); for (var y=0;y<=2+h;y++) editSet(x,y,z, h>3 && y>2+h-2 ? s : y===2+h ? g : d); }
    for (var x=8;x<15;x++) for (var z=30;z<37;z++) for (var y=3;y<7;y++) if (x===8||x===14||z===30||z===36) editSet(x,y,z, (x===8||x===14)&&(z===30||z===36) ? lg : pl);
    endBatch();
    beginBatch('Pincel de bioma');
    for (var x=0;x<48;x++) for (var z=0;z<48;z++) { var id = x + z < 40 ? 12 : x > z + 6 ? 2 : 6; bioSet(x, z, id); }
    endBatch();
    bio.show = true; bio.id = 6; bio.r = 5; setTool('biome'); updateBioChip();
    Object.assign(cam,{yaw:0.55,pitch:0.68,dist:58,tx:24,ty:3,tz:24}); updateCamera(); requestRender(); })()`);
  await p.mouse.move(330, 600); await p.waitForTimeout(2500); await hide();
  await p.screenshot({ path: path.join(OUT, 'bioma.jpg'), type: 'jpeg', quality: 82, clip: { x: 0, y: 0, width: 972, height: 800 } });
  // o mapa do mundo de teste no modo Biomas
  await p.click('#menu summary'); await p.click('#worldBtn').catch(() => {});
  await p.setInputFiles('#worldIn', WORLD);
  await p.waitForFunction(() => /chunks já gerados/.test((document.getElementById('wmInfo') || {}).textContent || ''), null, { timeout: 120000 });
  await p.selectOption('#wmS', '256'); await p.fill('#wmX', '0'); await p.fill('#wmZ', '0'); await p.dispatchEvent('#wmX', 'input');
  await p.click('#wmModeB'); await p.waitForTimeout(300);
  const bx = await (await p.$('#wmCv')).boundingBox(); await p.mouse.move(bx.x + bx.width * 0.5, bx.y + bx.height * 0.55); await p.waitForTimeout(300); await hide();
  await (await p.$('.dialog')).screenshot({ path: path.join(OUT, 'mundo-biomas.jpg'), type: 'jpeg', quality: 82 });
  console.log('legenda:', await p.$eval('#wmBio', e => e.textContent));
  console.log('ok bioma', errs);
  await b.close();
})();
