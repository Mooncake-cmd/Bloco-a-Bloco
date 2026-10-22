// Capturas do pincel de escultura e da simetria para o guia: node scripts/guia/esculpir.js <url do editor> <pacote Bedrock .zip> <pasta de saída>
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');
const [URL, PACK, OUT] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  const S = [48, 24, 48], A = S[0] * S[2], proj = { v: 1, size: S, pal: ['dirt', 'grass_block'], rle: [1, 3 * A, 2, A, 0, A * (S[1] - 4)] };
  await p.addInitScript(s => { if (!sessionStorage.getItem('x')) { sessionStorage.setItem('x', '1'); localStorage.setItem('bloco-a-bloco-v1', s); ['bloco-a-bloco-sculpt', 'bloco-a-bloco-sym', 'bloco-a-bloco-flow'].forEach(k => localStorage.removeItem(k)); } }, JSON.stringify(proj));
  await p.goto(URL); await p.addStyleTag({ content: '#tabbar{display:none!important}' }); await p.waitForTimeout(2500); // as capturas recortam a partir da barra de ferramentas (a barra das abas tem a dela: abas.js)
  await p.setInputFiles('#packIn', PACK);
  await p.waitForFunction(() => /blocos com textura/.test(document.getElementById('toast').textContent), null, { timeout: 300000 });
  const hide = async () => { await p.evaluate(() => document.getElementById('toast').classList.remove('show')); await p.waitForTimeout(600); };
  const pick = async id => { await p.fill('#search', id); await p.waitForTimeout(200); await p.evaluate(id => { const it = [...document.querySelectorAll('#list .item')].find(e => e.textContent.replace(/\s+/g, '').endsWith(id + '☆') || e.textContent.replace(/\s+/g, '').endsWith(id + '★')); it.click(); }, id); await p.fill('#search', ''); await p.evaluate(() => document.activeElement.blur()); };
  await pick('grass_block');
  await p.evaluate(() => { Object.assign(window.__bab.cam, { yaw: 0.6, pitch: 0.55, dist: 58, tx: 24, ty: 3, tz: 24 }); window.__bab.update(); });
  await p.keyboard.press('k'); await p.waitForTimeout(300);
  const cv = await p.evaluate(() => { const r = document.querySelector('#viewport canvas').getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; });
  const at = (fx, fy) => [cv[0] + cv[2] * fx, cv[1] + cv[3] * fy];
  const hold = async (pt, ms) => { await p.mouse.move(...pt); await p.mouse.down(); await p.waitForTimeout(ms); await p.mouse.up(); await p.waitForTimeout(100); };
  for (let i = 0; i < 3; i++) await p.click('#sculptRp'); // raio 8
  await hold(at(0.45, 0.45), 1600);           // morro grande
  await hold(at(0.62, 0.5), 900);             // morro menor ao lado
  await p.click('[data-sm="smooth"]'); await hold(at(0.53, 0.47), 1200); // suaviza entre os dois
  await p.click('[data-sm="lower"]'); await hold(at(0.3, 0.7), 900);     // vale
  await p.click('[data-sm="raise"]');
  await p.mouse.move(...at(0.7, 0.75)); await p.waitForTimeout(400); await hide();
  await p.screenshot({ path: path.join(OUT, 'esculpir.jpg'), type: 'jpeg', quality: 82, clip: { x: 0, y: 54, width: 972, height: 718 } });
  // simetria: um canto de muro com escada e lanterna, repetido nos quatro cantos
  await p.keyboard.press('x'); await p.click('#symChip [data-sa="2"]');
  await p.evaluate(() => {
    const B = window.__bab, l = [];
    // limpa um canto (a simetria limpa os outros três) e ergue um canto de muro com torre
    for (let x = 36; x <= 46; x++) for (let z = 36; z <= 46; z++) for (let y = 4; y < 20; y++) l.push([x, y, z, null]);
    for (let x = 37; x <= 45; x++) l.push([x, 4, 37, 'stone_bricks'], [x, 5, 37, 'stone_bricks']);
    for (let z = 38; z <= 45; z++) l.push([45, 4, z, 'stone_bricks'], [45, 5, z, 'stone_bricks']);
    for (let y = 4; y <= 8; y++) l.push([45, y, 37, 'stone_bricks']);
    l.push([45, 9, 37, 'stone_brick_wall'], [45, 10, 37, 'lantern'], [41, 4, 38, 'stone_brick_stairs[facing=south,half=bottom]']);
    B.batchSet(l);
    Object.assign(B.cam, { yaw: 0.5, pitch: 0.7, dist: 62, tx: 24, ty: 3, tz: 24 }); B.update();
  });
  await p.mouse.move(...at(0.05, 0.05)); await p.waitForTimeout(600); await hide();
  await p.screenshot({ path: path.join(OUT, 'simetria.jpg'), type: 'jpeg', quality: 82, clip: { x: 0, y: 54, width: 972, height: 718 } });
  console.log('ok esculpir simetria', 'errors', JSON.stringify(errs)); await b.close();
})();
