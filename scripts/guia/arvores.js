// Captura das árvores crescidas com Usar para o guia: node scripts/guia/arvores.js <url do editor> <pacote Bedrock .zip> <pasta de saída>
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');
const [URL, PACK, OUT] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  const S = [70, 40, 46], proj = { v: 1, size: S, pal: ['grass_block'], rle: [1, S[0] * S[2], 0, S[0] * S[2] * (S[1] - 1)] };
  await p.addInitScript(s => { if (!sessionStorage.getItem('x')) { sessionStorage.setItem('x', '1'); localStorage.setItem('bloco-a-bloco-v1', s); } }, JSON.stringify(proj));
  await p.goto(URL); await p.addStyleTag({ content: '#tabbar{display:none}' }); await p.waitForTimeout(2500); // as capturas recortam a partir da barra de ferramentas (a barra das abas tem a dela: abas.js)
  await p.setInputFiles('#packIn', PACK);
  await p.waitForFunction(() => /blocos com textura/.test(document.getElementById('toast').textContent), null, { timeout: 300000 });
  await p.evaluate(() => {
    const B = window.__bab;
    const sq = (n, x, z) => { for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) B.setCell([x + dx, 1, z + dz], n); B.grow([x, 1, z]); };
    sq('spruce_sapling', 6, 6); sq('jungle_sapling', 22, 6); sq('dark_oak_sapling', 38, 6); sq('pale_oak_sapling', 52, 6);
    const back = ['oak_sapling', 'birch_sapling', 'spruce_sapling', 'jungle_sapling', 'acacia_sapling', 'cherry_sapling', 'mangrove_propagule'];
    back.forEach((n, i) => { B.setCell([6 + i * 9.5 | 0, 1, 22], n); B.grow([6 + i * 9.5 | 0, 1, 22]); });
    const front = ['oak_sapling', 'azalea', 'red_mushroom', 'brown_mushroom', 'crimson_fungus', 'warped_fungus'];
    front.forEach((n, i) => { const x = 7 + i * 11; B.setCell([x, 1, 36], n); B.grow([x, 1, 36], n === 'oak_sapling'); });
    Object.assign(B.cam, { yaw: 0, pitch: 0.42, dist: 66, tx: 35, ty: 7, tz: 22 }); B.update();
  });
  await p.waitForTimeout(3000);
  await p.evaluate(() => document.getElementById('toast').classList.remove('show')); await p.waitForTimeout(600);
  await p.screenshot({ path: path.join(OUT, 'arvores.jpg'), type: 'jpeg', quality: 82, clip: { x: 0, y: 54, width: 972, height: 718 } });
  console.log('ok arvores', 'errors', JSON.stringify(errs)); await b.close();
})();
