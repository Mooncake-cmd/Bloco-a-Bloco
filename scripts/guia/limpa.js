// Captura da tela limpa (Tab) para o guia, com o pincel de mistura escolhido e a casa de exemplo:
// node scripts/guia/limpa.js <url do editor> <pacote Bedrock .zip> <pasta de saída>
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
  await p.mouse.move(640, 420);
  await p.keyboard.press('Tab'); await p.keyboard.press('q'); await p.keyboard.press('3');
  await p.evaluate(() => document.getElementById('toast').classList.remove('show'));
  await p.mouse.move(700, 470); await p.waitForTimeout(2000);
  await p.screenshot({ path: path.join(OUT, 'tela-limpa.jpg'), type: 'jpeg', quality: 82 });
  console.log('ok limpa', errs);
  await b.close();
})();
