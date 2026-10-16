// Captura dos blocos acrescentados com a lista do Bedrock 1.26 (geradores, cofre, choupo, enxofre, cinábrio, lajes e escadas
// de lã e de concreto, estátuas do golem de cobre, molduras...), em fileiras, com o pacote do Bedrock:
// node scripts/guia/novos.js <url do editor> <pacote Bedrock .zip> <pasta de saída>
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
  await ev(`(function(){ var first = BLOCKS.findIndex(function (b) { return b.java === 'spawner'; }), list = BLOCKS.slice(first).filter(function (b) { return !b.hide; });
    newWorld(48, 12, 24); beginBatch(); for (var x = 0; x < 48; x++) for (var z = 0; z < 24; z++) editSet(x, 0, z, cellFromName('smooth_stone'));
    list.forEach(function (b, i) { var bi = BLOCKS.indexOf(b), x = 1 + (i % 23) * 2, z = 1 + Math.floor(i / 23) * 3, s = b.shape ? defaultState(b) : 0;
      editSet(x, 1, z, mkCell(bi, s)); var pr = b.shape && b.shape.multi ? partnerOf(b, s, x, 1, z) : null; if (pr) editSet(pr.x, pr.y, pr.z, mkCell(bi, pr.s)); });
    endBatch(); Object.assign(cam, { yaw: 0.0, pitch: 1.0, dist: 40, tx: 23.5, ty: 1, tz: 9.5 }); updateCamera(); requestRender(); })()`);
  await p.mouse.move(1100, 700); await p.waitForTimeout(3000);
  await p.evaluate(() => document.getElementById('toast').classList.remove('show')); await p.waitForTimeout(600);
  await p.screenshot({ path: path.join(OUT, 'blocos-novos.jpg'), type: 'jpeg', quality: 82, clip: { x: 0, y: 0, width: 972, height: 772 } });
  console.log('ok novos', errs);
  await b.close();
})();
