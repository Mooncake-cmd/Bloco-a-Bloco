// Refaz as capturas do menu Projeto e da janela de ajuda do guia: node scripts/guia/menu.js <url do editor> <pasta de saída>
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const fs = require('fs'), path = require('path');
eval(fs.readFileSync(__dirname + '/demo.inc', 'utf8'));
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  await p.addInitScript(s => localStorage.setItem('bloco-a-bloco-v1', s), JSON.stringify(proj));
  await p.goto(process.argv[2]); await p.waitForTimeout(2500);
  const rect = sel => p.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; }, sel);
  await p.click('#menu summary'); await p.waitForTimeout(300);
  const m = await rect('#menu .pop');
  await p.screenshot({ path: path.join(process.argv[3], 'menu.jpg'), type: 'jpeg', quality: 82, clip: { x: m[0] - 12, y: 0, width: m[2] + 24, height: m[1] + m[3] + 12 } });
  await p.click('#helpBtn'); await p.waitForTimeout(400);
  const d = await rect('.dialog');
  await p.screenshot({ path: path.join(process.argv[3], 'ajuda.jpg'), type: 'jpeg', quality: 82, clip: { x: d[0] - 8, y: d[1] - 8, width: d[2] + 16, height: Math.min(800 - d[1] + 8, d[3] + 16) } });
  await b.close();
})();
