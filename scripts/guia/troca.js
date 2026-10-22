// Capturas do pincel de troca para o guia: node scripts/guia/troca.js <url do editor> <pacote Bedrock .zip> <pasta de saída>
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');
const [URL, PACK, OUT] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  const S = [32, 16, 32], proj = { v: 1, size: S, pal: [], rle: [0, S[0] * S[1] * S[2]] };
  await p.addInitScript(s => { if (!sessionStorage.getItem('x')) { sessionStorage.setItem('x', '1'); localStorage.setItem('bloco-a-bloco-v1', s); localStorage.removeItem('bloco-a-bloco-mask'); } }, JSON.stringify(proj));
  await p.goto(URL); await p.addStyleTag({ content: '#tabbar{display:none!important}' }); await p.waitForTimeout(2500); // as capturas recortam a partir da barra de ferramentas (a barra das abas tem a dela: abas.js)
  await p.setInputFiles('#packIn', PACK);
  await p.waitForFunction(() => /blocos com textura/.test(document.getElementById('toast').textContent), null, { timeout: 300000 });
  const hide = async () => { await p.evaluate(() => document.getElementById('toast').classList.remove('show')); await p.waitForTimeout(600); };
  // parede de pedra e tijolos misturados, com buracos (ar)
  await p.evaluate(() => {
    const B = window.__bab, l = [];
    for (let x = 8; x < 24; x++) for (let y = 0; y < 8; y++) if ((x + y) % 3) l.push([x, y, 16, (x + y) % 3 === 1 ? 'stone' : 'bricks']);
    B.batchSet(l);
    Object.assign(B.cam, { yaw: 0, pitch: 0.15, dist: 22, tx: 16, ty: 4, tz: 16 }); B.update();
  });
  await p.keyboard.press('m');
  const c = await p.evaluate(() => { const r = document.querySelector('#viewport canvas').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
  await p.keyboard.down('Shift'); await p.mouse.click(c[0], c[1]); await p.keyboard.up('Shift');
  await p.keyboard.press('='); await p.keyboard.press('=');
  await p.mouse.move(c[0] + 5, c[1] + 5); await p.waitForTimeout(300); await hide();
  await p.screenshot({ path: path.join(OUT, 'troca-antes.jpg'), type: 'jpeg', quality: 82, clip: { x: 0, y: 54, width: 972, height: 718 } });
  await p.mouse.click(c[0] + 5, c[1] + 5); await p.mouse.move(c[0] + 400, c[1] + 330); await p.waitForTimeout(300); await hide();
  await p.screenshot({ path: path.join(OUT, 'troca-depois.jpg'), type: 'jpeg', quality: 82, clip: { x: 0, y: 54, width: 972, height: 718 } });
  console.log('ok troca', 'errors', JSON.stringify(errs)); await b.close();
})();
