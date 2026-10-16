// Capturas do mundo do jogo para o guia (mapa, o Fim com os chunks não gerados destacados, área carregada) (com o mundo de teste tests/fixtures/mundo-teste.mcworld):
// node scripts/guia/mundo.js <url do editor> <pacote Bedrock .zip> <pasta de saída>
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');
const [URL, PACK, OUT] = process.argv.slice(2);
const WORLD = path.join(__dirname, '../../tests/fixtures/mundo-teste.mcworld');
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => { if (!sessionStorage.getItem('x')) { sessionStorage.setItem('x', '1'); localStorage.setItem('bloco-a-bloco-measure', '0'); } });
  await p.goto(URL); await p.waitForTimeout(2500);
  await p.setInputFiles('#packIn', PACK);
  await p.waitForFunction(() => /blocos com textura/.test(document.getElementById('toast').textContent), null, { timeout: 300000 });
  const hide = async () => { await p.evaluate(() => document.getElementById('toast').classList.remove('show')); await p.waitForTimeout(600); };
  await p.click('#menu summary'); await p.click('#worldBtn').catch(() => {});
  await p.setInputFiles('#worldIn', WORLD);
  await p.waitForFunction(() => /chunks já gerados/.test((document.getElementById('wmInfo') || {}).textContent || ''), null, { timeout: 120000 });
  await p.selectOption('#wmS', '128'); await p.fill('#wmX', '0'); await p.fill('#wmZ', '0'); await p.dispatchEvent('#wmX', 'input');
  await p.click('#wmOut'); await p.waitForTimeout(300); await hide();
  const dlg = await p.$('.dialog'); await dlg.screenshot({ path: path.join(OUT, 'mundo-mapa.jpg'), type: 'jpeg', quality: 82 });
  // o Fim com o destaque dos chunks não gerados (vermelho) e dos gerados só de vazio (cinza)
  const ready = () => p.waitForFunction(() => /chunks já gerados/.test((document.getElementById('wmInfo') || {}).textContent || ''), null, { timeout: 120000 });
  await p.click('[data-wd="2"]'); await ready();
  await p.selectOption('#wmS', '64'); await p.fill('#wmX', '40'); await p.fill('#wmZ', '8'); await p.dispatchEvent('#wmX', 'input'); await p.waitForTimeout(300);
  const bx = await (await p.$('#wmCv')).boundingBox(); await p.mouse.move(bx.x + bx.width * 0.57, bx.y + bx.height * 0.5); await p.waitForTimeout(300); await hide();
  await (await p.$('.dialog')).screenshot({ path: path.join(OUT, 'mundo-fim.jpg'), type: 'jpeg', quality: 82 });
  await p.click('[data-wd="0"]'); await ready();
  await p.selectOption('#wmS', '128'); await p.fill('#wmX', '0'); await p.fill('#wmZ', '0'); await p.dispatchEvent('#wmX', 'input'); await p.waitForTimeout(300);
  await p.click('#wmGo');
  await p.waitForFunction(() => /Área carregada/.test(document.getElementById('toast').textContent), null, { timeout: 120000 });
  await p.evaluate(() => { Object.assign(window.__bab.cam, { yaw: 0.75, pitch: 0.42, dist: 44, tx: 64, ty: 135, tz: 66 }); window.__bab.update(); });
  await p.mouse.move(1100, 700); await p.waitForTimeout(6000); await hide();
  await p.screenshot({ path: path.join(OUT, 'mundo-area.jpg'), type: 'jpeg', quality: 82, clip: { x: 0, y: 0, width: 972, height: 772 } });
  console.log('ok mundo', errs);
  await b.close();
})();
