// Capturas da área do mundo só com a superfície e com o subsolo à mostra:
// node scripts/guia/subsolo.js <url do editor> <pacote Bedrock .zip> <mundo .mcworld gerado pelo jogo, com bastante área> <pasta de saída>
// Carrega 256 × 256 a partir de X 0, Z 0 e mostra o tempo de montagem e os triângulos de cada modo.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');
const [URL, PACK, WORLD, OUT] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => { if (!sessionStorage.getItem('x')) { sessionStorage.setItem('x', '1'); localStorage.clear(); localStorage.setItem('bloco-a-bloco-measure', '0'); localStorage.setItem('bloco-a-bloco-view', '100000000'); } });
  await p.goto(URL); await p.addStyleTag({ content: '#tabbar{display:none!important}' }); await p.waitForTimeout(2000);
  await p.setInputFiles('#packIn', PACK);
  await p.waitForFunction(() => /blocos com textura/.test(document.getElementById('toast').textContent), null, { timeout: 300000 });
  const ev = s => p.evaluate(x => window.__bab.ev(x), s);
  await p.setInputFiles('#worldIn', WORLD); await p.waitForSelector('#wmGo', { timeout: 300000 });
  await ev('closeWorldMap()'); await p.waitForTimeout(500); await ev('closeDialog()');
  await ev('wioGoArea(0, 0, 0, 256, 256, true)');
  await p.waitForFunction(() => window.__bab.ev('!!(wio && wio.area)') && document.getElementById('busy').hidden, null, { timeout: 600000 });
  await ev(`(function(){ var x = SX >> 1, z = SZ >> 1, y = SY - 1; while (y > 0 && !gget(x, y, z)) y--; Object.assign(cam, { yaw: 0.75, pitch: 0.5, dist: 290, tx: x, ty: y - 20, tz: z }); updateCamera(); updateView(true); requestRender(); })()`);
  const shot = async (nome) => {
    const t1 = Date.now(); await p.waitForFunction(() => window.__bab.meshInfo().naFila === 0, null, { timeout: 900000, polling: 500 });
    const m = await p.evaluate(() => window.__bab.meshInfo()); m.s = Math.round((Date.now() - t1) / 100) / 10;
    await p.evaluate(() => document.getElementById('toast').classList.remove('show')); await p.waitForTimeout(800);
    await p.screenshot({ path: path.join(OUT, nome), type: 'jpeg', quality: 82, clip: { x: 0, y: 54, width: 972, height: 718 } });
    console.log(nome, JSON.stringify(m));
  };
  await shot('subsolo-escondido.jpg');
  await ev('surfSet(true)'); await shot('subsolo-mostra.jpg');
  await ev('surfSet(false)');
  console.log(errs); await b.close();
})();
