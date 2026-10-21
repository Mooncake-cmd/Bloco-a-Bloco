// Captura das abas para o guia: node scripts/guia/abas.js <url do editor> <pacote Bedrock .zip> <mundo .mcworld> <pasta de saída>
// Três abas: a casa de exemplo, um mundo do jogo e uma construção nova; a captura é a do mundo aberto, com a barra das abas.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs'), path = require('path');
const [URL, PACK, WORLD, OUT] = process.argv.slice(2);
eval(fs.readFileSync(__dirname + '/demo.inc', 'utf8'));
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(s => { if (!sessionStorage.getItem('x')) { sessionStorage.setItem('x', '1'); localStorage.setItem('bloco-a-bloco-v1', s); localStorage.setItem('bloco-a-bloco-measure', '0'); } }, JSON.stringify(proj));
  await p.goto(URL); await p.waitForTimeout(2500);
  await p.setInputFiles('#packIn', PACK);
  await p.waitForFunction(() => /blocos com textura/.test(document.getElementById('toast').textContent), null, { timeout: 300000 });
  if (await p.evaluate(() => document.getElementById('measTbtn').getAttribute('aria-pressed') === 'true')) await p.click('#measTbtn');
  const ev = s => p.evaluate(x => window.__bab.ev(x), s), idle = () => p.waitForFunction(() => !window.__bab.ev('tabs.busy'), null, { timeout: 120000 });
  await ev(`(function(){ var t = tabCur(); t.name = 'Casa de exemplo'; t.auto = false; tabSaveMeta(); tabRender(); })()`);
  // segunda aba: o mundo do jogo
  await p.click('#tabNew'); await idle();
  await p.setInputFiles('#worldIn', WORLD); await p.waitForSelector('#wmGo', { timeout: 120000 });
  await p.waitForFunction(() => !/Desenhando/.test((document.getElementById('wmInfo') || {}).textContent || ''), null, { timeout: 120000 });
  await p.click('#wmGo');
  await p.waitForFunction(() => window.__bab.ev('!!(wio && wio.area)') && document.getElementById('busy').hidden, null, { timeout: 180000 }); await p.waitForTimeout(1500);
  // terceira aba: uma construção nova; volta ao mundo para a captura
  await p.click('#tabNew'); await idle();
  await p.click('[data-tab="1"]'); await idle();
  await ev(`(function(){ var x = SX >> 1, z = SZ >> 1, y = SY - 1; while (y > 0 && !gget(x, y, z)) y--; Object.assign(cam, { yaw: 0.75, pitch: 0.45, dist: 110, tx: x, ty: y, tz: z }); updateCamera(); requestRender(); })()`);
  await p.evaluate(() => document.getElementById('toast').classList.remove('show'));
  await p.mouse.move(380, 18); await p.waitForFunction(() => window.__bab.meshInfo().naFila === 0, null, { timeout: 600000, polling: 1000 }); await p.waitForTimeout(1500);
  await p.screenshot({ path: path.join(OUT, 'abas.jpg'), type: 'jpeg', quality: 82 });
  console.log('ok abas', await ev('JSON.stringify(tabs.list.map(function (t) { return t.name; }))'), errs);
  await b.close();
})();
