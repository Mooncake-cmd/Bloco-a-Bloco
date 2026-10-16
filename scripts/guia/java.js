// Capturas do mundo do Java e do .litematic para o guia (com tests/fixtures/mundo-java.zip e tests/fixtures/casa.litematic,
// gerados por scripts/gen_javaworld.py): node scripts/guia/java.js <url do editor> <pacote Bedrock .zip> <pasta de saída>
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');
const [URL, PACK, OUT] = process.argv.slice(2);
const WORLD = path.join(__dirname, '../../tests/fixtures/mundo-java.zip'), LIT = path.join(__dirname, '../../tests/fixtures/casa.litematic');
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => { if (!sessionStorage.getItem('x')) { sessionStorage.setItem('x', '1'); localStorage.setItem('bloco-a-bloco-measure', '0'); } });
  await p.goto(URL); await p.waitForTimeout(2500);
  await p.setInputFiles('#packIn', PACK);
  await p.waitForFunction(() => /blocos com textura/.test(document.getElementById('toast').textContent), null, { timeout: 300000 });
  const hide = async () => { await p.evaluate(() => document.getElementById('toast').classList.remove('show')); await p.waitForTimeout(600); };
  // mundo do Java: a área com a casa, o baú, a escada e o bloco desconhecido (roxo)
  await p.click('#menu summary'); await p.click('#worldBtn').catch(() => {});
  await p.setInputFiles('#worldIn', WORLD);
  await p.waitForFunction(() => /chunks já gerados/.test((document.getElementById('wmInfo') || {}).textContent || ''), null, { timeout: 120000 });
  await p.selectOption('#wmS', '64'); await p.fill('#wmX', '32'); await p.fill('#wmZ', '32'); await p.dispatchEvent('#wmX', 'input');
  await p.click('#wmGo');
  await p.waitForFunction(() => /Área carregada/.test(document.getElementById('toast').textContent), null, { timeout: 120000 }); await p.waitForTimeout(1500);
  await p.evaluate(() => { window.__bab.layer(true, 129); Object.assign(window.__bab.cam, { yaw: 0.75, pitch: 0.8, dist: 30, tx: 22, ty: 129, tz: 22 }); window.__bab.update(); });
  await p.mouse.move(1270, 790); await p.waitForTimeout(4000); await hide();
  await p.screenshot({ path: path.join(OUT, 'mundo-java.jpg'), type: 'jpeg', quality: 82, clip: { x: 0, y: 0, width: 972, height: 772 } });
  // .litematic
  await p.evaluate(() => { window.__bab.layer(false); window.__bab.ev('wioEnd()'); });
  await p.setInputFiles('#fileIn', LIT);
  await p.waitForFunction(() => /importado/.test(document.getElementById('toast').textContent), null, { timeout: 120000 });
  await p.evaluate(() => { window.__bab.layer(true, 3); Object.assign(window.__bab.cam, { yaw: 0.75, pitch: 0.7, dist: 22, tx: 6, ty: 3, tz: 6 }); window.__bab.update(); });
  await p.mouse.move(1270, 790); await p.waitForTimeout(3500); await hide();
  await p.screenshot({ path: path.join(OUT, 'litematic.jpg'), type: 'jpeg', quality: 82, clip: { x: 0, y: 0, width: 972, height: 772 } });
  console.log('ok java', errs);
  await b.close();
})();
