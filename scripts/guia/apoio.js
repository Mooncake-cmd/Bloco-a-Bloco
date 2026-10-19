// Captura do bloco de apoio para o guia: node scripts/guia/apoio.js <url do editor> <pacote Bedrock .zip> <pasta de saída>
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');
const [URL, PACK, OUT] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  const S = [40, 32, 40], A = S[0] * S[2], proj = { v: 1, size: S, pal: ['grass_block'], rle: [1, A, 0, A * (S[1] - 1)] };
  await p.addInitScript(s => { if (!sessionStorage.getItem('x')) { sessionStorage.setItem('x', '1'); localStorage.setItem('bloco-a-bloco-v1', s); localStorage.setItem('bloco-a-bloco-measure', '0'); } }, JSON.stringify(proj));
  await p.goto(URL); await p.waitForTimeout(2500);
  await p.setInputFiles('#packIn', PACK);
  await p.waitForFunction(() => /blocos com textura/.test(document.getElementById('toast').textContent), null, { timeout: 300000 });
  if (await p.evaluate(() => document.getElementById('measTbtn').getAttribute('aria-pressed') === 'true')) await p.click('#measTbtn');
  // a câmera perto, no alto; Z põe o vidro na frente dela, no meio da tela
  await p.evaluate(() => { Object.assign(window.__bab.cam, { yaw: 0.65, pitch: 0.42, dist: 8, tx: 20.5, ty: 16.5, tz: 20.5 }); window.__bab.update(); });
  await p.mouse.move(1000, 700);
  await p.keyboard.press('z'); await p.waitForTimeout(200);
  const txt = await p.evaluate(() => document.getElementById('toast').textContent);
  // a ponte começada a partir do apoio (como se fosse clicando nas faces dele)
  const g = await p.evaluate(() => window.__bab.ev('unidx(Array.from(apoio)[0])'));
  await p.evaluate(g => {
    const l = [];
    for (let x = g[0] - 8; x < g[0]; x++) l.push([x, g[1], g[2], 'stone_bricks']);
    window.__bab.batchSet(l);
    Object.assign(window.__bab.cam, { yaw: 0.65, pitch: 0.42, dist: 14, tx: g[0] - 2, ty: g[1] + 0.5, tz: g[2] + 0.5 }); window.__bab.update();
  }, g);
  await p.evaluate(t => { const e = document.getElementById('toast'); e.textContent = t; e.classList.add('show'); }, txt);
  await p.waitForTimeout(600);
  await p.screenshot({ path: path.join(OUT, 'apoio.jpg'), type: 'jpeg', quality: 82, clip: { x: 0, y: 0, width: 972, height: 772 } });
  console.log('ok apoio', txt, await p.evaluate(() => window.__bab.ev('apoio.size')), errs);
  await b.close();
})();
