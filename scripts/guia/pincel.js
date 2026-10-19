// Captura do pincel grosso para o guia: node scripts/guia/pincel.js <url do editor> <pacote Bedrock .zip> <pasta de saída>
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');
const [URL, PACK, OUT] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  const S = [40, 24, 40], A = S[0] * S[2], proj = { v: 1, size: S, pal: ['grass_block'], rle: [1, A, 0, A * (S[1] - 1)] };
  await p.addInitScript(s => { if (!sessionStorage.getItem('x')) { sessionStorage.setItem('x', '1'); localStorage.setItem('bloco-a-bloco-v1', s); localStorage.setItem('bloco-a-bloco-measure', '0'); } }, JSON.stringify(proj));
  await p.goto(URL); await p.waitForTimeout(2500);
  await p.setInputFiles('#packIn', PACK);
  await p.waitForFunction(() => /blocos com textura/.test(document.getElementById('toast').textContent), null, { timeout: 300000 });
  if (await p.evaluate(() => document.getElementById('measTbtn').getAttribute('aria-pressed') === 'true')) await p.click('#measTbtn');
  const ev = s => p.evaluate(x => window.__bab.ev(x), s);
  await ev(`(function(){ setTool('place'); chooseBlock(BY_JAVA['stone_bricks']); Object.assign(cam, { yaw: 0.6, pitch: 0.62, dist: 34, tx: 20, ty: 2, tz: 20 }); updateCamera(); requestRender(); })()`);
  const o = await p.evaluate(() => { const r = document.querySelector('#viewport canvas').getBoundingClientRect(); return [r.left, r.top]; });
  // ponto da tela que aponta para o chão no bloco w (face de cima)
  const find = w => p.evaluate(([w, o]) => { for (let y = 0; y < 760; y += 3) for (let x = 0; x < 960; x += 3) { const t = window.__bab.target(o[0] + x, o[1] + y); if (t && t.hit && t.hit[0] === w[0] && t.hit[1] === w[1] && t.hit[2] === w[2] && t.normal && t.normal[1] > 0) return [o[0] + x, o[1] + y]; } return null; }, [w, o]);
  const click = async w => { const c = await find(w); if (!c) throw new Error('fora da tela ' + w); await p.mouse.click(c[0], c[1]); };
  await ev(`brushShape = 'cube'; setBrushR(2)`); await click([12, 0, 14]);
  await ev(`chooseBlock(BY_JAVA['oak_planks']); brushShape = 'sphere'; setBrushR(3)`); await click([20, 0, 11]);
  await ev(`chooseBlock(BY_JAVA['moss_block']); brushShape = 'cube'; setBrushR(1)`); await click([10, 0, 24]); await click([13, 0, 24]); await click([16, 0, 24]);
  await ev(`chooseBlock(BY_JAVA['stone_bricks']); setBrushR(2)`);
  const c = await find([24, 0, 24]); await p.mouse.move(c[0], c[1]); await p.waitForTimeout(300);
  await p.evaluate(() => document.getElementById('toast').classList.remove('show')); await p.waitForTimeout(600);
  await p.screenshot({ path: path.join(OUT, 'pincel-grosso.jpg'), type: 'jpeg', quality: 82, clip: { x: 0, y: 0, width: 972, height: 772 } });
  console.log('ok pincel', await ev('blockCount'), await ev('previewInst.count'), errs);
  await b.close();
})();
