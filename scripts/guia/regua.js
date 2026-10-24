// Capturas da régua para o guia (uma medida; e duas, a primeira solta com o botão do meio): node scripts/guia/regua.js <url do editor> <pacote Bedrock .zip> <pasta de saída>
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');
const [URL, PACK, OUT] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  const S = [40, 16, 40], A = S[0] * S[2], proj = { v: 1, size: S, pal: ['grass_block'], rle: [1, A, 0, A * (S[1] - 1)] };
  await p.addInitScript(s => { if (!sessionStorage.getItem('x')) { sessionStorage.setItem('x', '1'); localStorage.setItem('bloco-a-bloco-v1', s); localStorage.setItem('bloco-a-bloco-measure', '0'); } }, JSON.stringify(proj));
  await p.goto(URL); await p.waitForTimeout(2500);
  await p.setInputFiles('#packIn', PACK);
  await p.waitForFunction(() => /blocos com textura/.test(document.getElementById('toast').textContent), null, { timeout: 300000 });
  if (await p.evaluate(() => document.getElementById('measTbtn').getAttribute('aria-pressed') === 'true')) await p.click('#measTbtn');
  await p.evaluate(() => {
    const B = window.__bab, l = [];
    for (let x = 8; x <= 30; x++) l.push([x, 1, 10, 'stone_bricks']);
    for (let z = 10; z <= 28; z++) l.push([30, 1, z, 'stone_bricks']);
    for (let y = 1; y <= 9; y++) l.push([8, y, 10, 'oak_log']);
    for (let y = 1; y <= 6; y++) l.push([20, y, 22, 'polished_andesite']);
    B.batchSet(l);
    Object.assign(B.cam, { yaw: 0.5, pitch: 0.75, dist: 46, tx: 20, ty: 2, tz: 18 }); B.update();
  });
  await p.keyboard.press('n'); await p.waitForTimeout(300);
  const o = await p.evaluate(() => { const r = document.querySelector('#viewport canvas').getBoundingClientRect(); return [r.left, r.top]; });
  const find = w => p.evaluate(([w, o]) => { for (let y = 0; y < 700; y += 3) for (let x = 0; x < 960; x += 3) { const t = window.__bab.target(o[0] + x, o[1] + y); if (t && t.hit && t.hit[0] === w[0] && t.hit[1] === w[1] && t.hit[2] === w[2]) return [o[0] + x, o[1] + y]; } return null; }, [w, o]);
  for (const w of [[8, 1, 10], [30, 1, 10], [30, 1, 28], [8, 9, 10]]) { const c = await find(w); if (!c) throw new Error('bloco fora da tela ' + w); await p.mouse.click(c[0], c[1]); }
  console.log(await p.evaluate(() => document.getElementById('rulerTxt').textContent));
  await p.mouse.move(o[0] + 900, o[1] + 650); await p.waitForTimeout(400);
  await p.evaluate(() => document.getElementById('toast').classList.remove('show')); await p.waitForTimeout(600);
  await p.screenshot({ path: path.join(OUT, 'regua.jpg'), type: 'jpeg', quality: 82, clip: { x: 0, y: 0, width: 972, height: 772 } });
  // solta a medida (botão do meio, sem arrastar) e mede o pilar: as duas ficam na tela
  await p.mouse.click(o[0] + 900, o[1] + 650, { button: 'middle' }); await p.waitForTimeout(200);
  for (const w of [[20, 1, 22], [20, 6, 22]]) { const c = await find(w); if (!c) throw new Error('bloco fora da tela ' + w); await p.mouse.click(c[0], c[1]); }
  await p.mouse.move(o[0] + 900, o[1] + 650); await p.waitForTimeout(400);
  await p.evaluate(() => document.getElementById('toast').classList.remove('show')); await p.waitForTimeout(600);
  await p.screenshot({ path: path.join(OUT, 'regua-soltas.jpg'), type: 'jpeg', quality: 82, clip: { x: 0, y: 0, width: 972, height: 772 } });
  console.log(await p.evaluate(() => document.getElementById('rulerTxt').textContent));
  console.log('ok regua', errs);
  await b.close();
})();
