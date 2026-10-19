// Captura da redstone passo a passo para o guia: node scripts/guia/passo.js <url do editor> <pacote Bedrock .zip> <pasta de saída>
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');
const [URL, PACK, OUT] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  const S = [24, 12, 24], A = S[0] * S[2], proj = { v: 1, size: S, pal: ['smooth_stone'], rle: [1, A, 0, A * (S[1] - 1)] };
  await p.addInitScript(s => { if (!sessionStorage.getItem('x')) { sessionStorage.setItem('x', '1'); localStorage.setItem('bloco-a-bloco-v1', s); localStorage.setItem('bloco-a-bloco-measure', '0'); localStorage.setItem('bloco-a-bloco-redstone', '1'); } }, JSON.stringify(proj));
  await p.goto(URL); await p.waitForTimeout(2500);
  await p.setInputFiles('#packIn', PACK);
  await p.waitForFunction(() => /blocos com textura/.test(document.getElementById('toast').textContent), null, { timeout: 300000 });
  if (await p.evaluate(() => document.getElementById('measTbtn').getAttribute('aria-pressed') === 'true')) await p.click('#measTbtn');
  const ev = s => p.evaluate(x => window.__bab.ev(x), s);
  // alavanca -> pó -> repetidor (2) -> pó -> repetidor (4) -> lâmpada, e um ramo com pistão
  await ev(`(function(){ beginBatch();
    var put = function (x, z, n) { editSet(x, 1, z, cellFromName(n)); };
    put(3, 12, 'lever[face=floor,facing=east,powered=false]'); put(4, 12, 'redstone_wire'); put(5, 12, 'redstone_wire');
    put(6, 12, 'repeater[facing=west,delay=2]'); put(7, 12, 'redstone_wire'); put(8, 12, 'redstone_wire');
    put(9, 12, 'repeater[facing=west,delay=4]'); put(10, 12, 'redstone_lamp');
    put(5, 13, 'redstone_wire'); put(5, 14, 'repeater[facing=north,delay=3]'); put(5, 15, 'sticky_piston[facing=south]'); put(5, 16, 'oak_planks');
    endBatch(); setTool('pick');
    Object.assign(cam, { yaw: 0.35, pitch: 0.72, dist: 15, tx: 7, ty: 1, tz: 17.5 }); updateCamera(); requestRender(); })()`);
  await ev(`openRsStep()`); await p.click('#rsPause');
  await ev(`useAt([3, 1, 12], false, null)`);
  for (let i = 0; i < 5; i++) await p.keyboard.press('.');
  await ev(`useAt([3, 1, 12], false, null)`);
  for (let i = 0; i < 4; i++) await p.keyboard.press('.');
  const r = await p.evaluate(() => { const c = document.getElementById('rsChart').getBoundingClientRect(); return [c.left, c.top]; });
  await p.mouse.move(r[0] + 400, r[1] + 18 + 8 + 16 * 7); await p.waitForTimeout(400);
  await p.evaluate(() => document.getElementById('toast').classList.remove('show')); await p.waitForTimeout(500);
  await p.screenshot({ path: path.join(OUT, 'passo.jpg'), type: 'jpeg', quality: 85, clip: { x: 0, y: 54, width: 972, height: 718 } });
  console.log('ok passo', await ev(`$('rsClock').textContent`), await ev('rsLog.order.length'), errs);
  await b.close();
})();
