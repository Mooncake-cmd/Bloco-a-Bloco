// Capturas da água e lava escorrendo e da estante entalhada para o guia: node scripts/guia/agua.js <url do editor> <pacote Bedrock .zip> <pasta de saída>
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');
const [URL, PACK, OUT] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  const S = [32, 16, 32], proj = { v: 1, size: S, pal: ['grass_block'], rle: [1, S[0] * S[2], 0, S[0] * S[2] * (S[1] - 1)] };
  await p.addInitScript(s => { if (!sessionStorage.getItem('x')) { sessionStorage.setItem('x', '1'); localStorage.setItem('bloco-a-bloco-v1', s); localStorage.removeItem('bloco-a-bloco-flow'); } }, JSON.stringify(proj));
  await p.goto(URL); await p.waitForTimeout(2500);
  await p.setInputFiles('#packIn', PACK);
  await p.waitForFunction(() => /blocos com textura/.test(document.getElementById('toast').textContent), null, { timeout: 300000 });
  const hide = async () => { await p.evaluate(() => document.getElementById('toast').classList.remove('show')); await p.waitForTimeout(600); };
  // plataforma com uma fonte de água em cima; ao lado, lava encontrando água
  await p.evaluate(() => {
    const B = window.__bab, l = [];
    for (let x = 4; x < 12; x++) for (let z = 4; z < 12; z++) l.push([x, 4, z, 'stone']);
    for (let y = 1; y < 4; y++) l.push([4, y, 4, 'stone'], [11, y, 4, 'stone'], [4, y, 11, 'stone'], [11, y, 11, 'stone']);
    B.batchSet(l); B.batchSet([[8, 5, 8, 'water']]);
    B.batchSet([[22, 1, 12, 'lava']]); B.batchSet([[22, 1, 7, 'water']]); B.batchSet([[25, 1, 23, 'lava']]);
    Object.assign(B.cam, { yaw: 0.45, pitch: 0.42, dist: 34, tx: 16, ty: 2, tz: 14 }); B.update();
  });
  await p.waitForTimeout(9000); await hide();
  await p.screenshot({ path: path.join(OUT, 'agua.jpg'), type: 'jpeg', quality: 82, clip: { x: 0, y: 54, width: 972, height: 718 } });
  // estante entalhada: vazia, com alguns livros e cheia
  await p.evaluate(() => {
    const B = window.__bab;
    B.batchSet([[14, 1, 26, 'chiseled_bookshelf[facing=south]'], [15, 1, 26, 'chiseled_bookshelf[facing=south,slot_0_occupied=true,slot_2_occupied=true,slot_4_occupied=true]'], [16, 1, 26, 'chiseled_bookshelf[facing=south,slot_0_occupied=true,slot_1_occupied=true,slot_2_occupied=true,slot_3_occupied=true,slot_4_occupied=true,slot_5_occupied=true]']]);
    Object.assign(B.cam, { yaw: 0, pitch: 0.15, dist: 5, tx: 15.5, ty: 1.5, tz: 27 }); B.update();
  });
  await p.waitForTimeout(1500); await hide();
  await p.screenshot({ path: path.join(OUT, 'estante.jpg'), type: 'jpeg', quality: 82, clip: { x: 186, y: 204, width: 600, height: 380 } });
  console.log('ok agua estante', 'errors', JSON.stringify(errs)); await b.close();
})();
