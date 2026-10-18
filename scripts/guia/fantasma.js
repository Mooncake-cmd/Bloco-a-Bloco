// Capturas do fantasma para o survival (.mcpack) para o guia: o quadro na janela Exportar e a janela com o passo a passo.
// node scripts/guia/fantasma.js <url do editor> <pacote Bedrock .zip> <pasta de saída>
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs'), path = require('path');
const [URL, PACK, OUT] = process.argv.slice(2);
eval(fs.readFileSync(__dirname + '/demo.inc', 'utf8'));
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 800 }, acceptDownloads: true }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(s => { if (!sessionStorage.getItem('x')) { sessionStorage.setItem('x', '1'); localStorage.setItem('bloco-a-bloco-v1', s); localStorage.removeItem('bloco-a-bloco-fantasma'); } }, JSON.stringify(proj));
  await p.goto(URL); await p.waitForTimeout(2500);
  await p.setInputFiles('#packIn', PACK);
  await p.waitForFunction(() => /blocos com textura/.test(document.getElementById('toast').textContent), null, { timeout: 300000 });
  await p.evaluate(() => document.getElementById('toast').classList.remove('show'));
  await p.click('#exportBtn'); await p.waitForTimeout(500);
  const box = await p.evaluate(() => { const e = document.getElementById('exHolo').closest('.get'); e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; });
  await p.waitForTimeout(300);
  const r2 = await p.evaluate(() => { const r = document.getElementById('exHolo').closest('.get').getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; });
  await p.screenshot({ path: path.join(OUT, 'fantasma-exportar.jpg'), type: 'jpeg', quality: 85, clip: { x: r2[0] - 8, y: r2[1] - 8, width: r2[2] + 16, height: r2[3] + 16 } });
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 120000 }), p.click('#exHolo')]);
  await dl.saveAs(path.join(OUT, dl.suggestedFilename()));
  await p.waitForTimeout(700); await p.evaluate(() => document.getElementById('toast').classList.remove('show')); await p.waitForTimeout(500);
  const d = await p.evaluate(() => { const r = document.querySelector('.dialog').getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; });
  await p.screenshot({ path: path.join(OUT, 'fantasma-pronto.jpg'), type: 'jpeg', quality: 85, clip: { x: d[0] - 8, y: d[1] - 8, width: d[2] + 16, height: d[3] + 16 } });
  console.log('ok fantasma', box.map(Math.round), d.map(Math.round), errs);
  await b.close();
})();
