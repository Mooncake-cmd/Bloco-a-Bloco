// Capturas do celular para o guia: node scripts/guia/mob.js <url do editor> <pasta de saída>
// celular.jpg (em pé), celular-blocos.jpg (gaveta dos blocos aberta) e celular-deitado.jpg (deitado).
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs'), path = require('path'); eval(fs.readFileSync(__dirname + '/demo.inc', 'utf8'));
const [URL, OUT] = process.argv.slice(2);
async function abre(b, w, h) {
  const c = await b.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const p = await c.newPage(); await p.addInitScript(s => { localStorage.setItem('bloco-a-bloco-v1', s); localStorage.setItem('bloco-a-bloco-abas', ''); }, JSON.stringify(proj));
  await p.goto(URL); await p.waitForTimeout(2500);
  await p.evaluate(() => { Object.assign(window.__bab.cam, { yaw: 0.55, pitch: 0.5, dist: 34, tx: 11, ty: 3, tz: 12 }); window.__bab.update(); document.getElementById('toast').classList.remove('show'); }); await p.waitForTimeout(800);
  return p;
}
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  let p = await abre(b, 390, 844);
  await p.screenshot({ path: path.join(OUT, 'celular.jpg'), type: 'jpeg', quality: 82 });
  await p.click('#blocksBtn'); await p.waitForTimeout(600);
  await p.screenshot({ path: path.join(OUT, 'celular-blocos.jpg'), type: 'jpeg', quality: 82 });
  p = await abre(b, 844, 390);
  await p.screenshot({ path: path.join(OUT, 'celular-deitado.jpg'), type: 'jpeg', quality: 82 });
  await b.close(); console.log('ok celular');
})();
