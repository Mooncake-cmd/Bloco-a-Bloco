// Capturas do mapa do mundo (e da área livre na janela de área) para o guia: node scripts/guia/mapa.js <url do editor> <pacote Bedrock .zip> <mundo .mcworld gerado pelo jogo> <pasta de saída>
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');
const [URL, PACK, WORLD, OUT] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(URL); await p.waitForTimeout(2500);
  const ev = s => p.evaluate(x => window.__bab.ev(x), s);
  await p.setInputFiles('#packIn', PACK);
  await p.waitForFunction(() => /blocos com textura/.test(document.getElementById('toast').textContent), null, { timeout: 300000 });
  await p.click('#menu summary'); await p.click('#worldBtn').catch(() => {});
  await p.setInputFiles('#worldIn', WORLD);
  await p.waitForFunction(() => /chunks já gerados/.test((document.getElementById('wmInfo') || {}).textContent || ''), null, { timeout: 120000 });
  await p.click('#wmBig');
  await p.waitForFunction(() => window.__bab.ev('wm && wm.ovT'), null, { timeout: 120000 });
  const hide = () => p.evaluate(() => document.getElementById('toast').classList.remove('show'));
  const wait = () => p.waitForFunction(() => window.__bab.ev('!wm.busy && (function(){ var V=wmVisible(); for (var tz=V.tz0;tz<=V.tz1;tz++) for (var tx=V.tx0;tx<=V.tx1;tx++) if (!wm.tiles.has(wm.dim+":"+tx+","+tz)) return false; return true; })()'), null, { timeout: 120000 });
  // 1. terreno com a grade, 2 px por bloco, e um ponto clicado
  await ev(`wm.s = 2; wm.cx = 40; wm.cz = 90; wm.grid = true; $('wmvG').checked = true; wmDraw();`); await wait(); await p.waitForTimeout(300);
  await p.mouse.click(600, 420); await p.mouse.move(602, 422); await p.waitForTimeout(300); await hide(); await p.waitForTimeout(400);
  await p.screenshot({ path: path.join(OUT, 'mapa-terreno.jpg'), type: 'jpeg', quality: 85 });
  console.log('1', await ev(`$('wmvInfo').textContent`));
  // 2. bem perto: texturas
  await ev(`wm.s = 18; wm.cx = 72; wm.cz = 122; wmDraw();`); await p.waitForTimeout(2500); await ev('wmDraw()'); await p.waitForTimeout(500);
  await p.mouse.move(1270, 790); await p.waitForTimeout(200);
  await p.screenshot({ path: path.join(OUT, 'mapa-perto.jpg'), type: 'jpeg', quality: 85 });
  // 3. biomas com a janela flutuante
  await ev(`wm.s = 1.6; wm.cx = 30; wm.cz = 80; wm.sel = null; wmInfo(); wmDraw();`); await p.click('#wmvB'); await wait(); await p.waitForTimeout(300);
  await p.mouse.move(820, 430); await p.mouse.move(822, 432); await hide(); await p.waitForTimeout(400);
  await p.screenshot({ path: path.join(OUT, 'mapa-biomas.jpg'), type: 'jpeg', quality: 85 });
  console.log('3', await ev(`$('wmvTip').textContent`), errs);
  // 4. a janela de área com a área livre desenhada
  await p.keyboard.press('Escape'); await ev('wioArea()'); await p.waitForTimeout(1500);
  await p.selectOption('#wmS', 'free'); await p.waitForTimeout(200);
  const r = await p.evaluate(() => { const c = document.getElementById('wmCv').getBoundingClientRect(); return [c.left, c.top, c.width, c.height]; });
  await p.mouse.move(r[0] + r[2] * 0.42, r[1] + r[3] * 0.3); await p.mouse.down(); await p.mouse.move(r[0] + r[2] * 0.7, r[1] + r[3] * 0.62, { steps: 8 }); await p.mouse.up();
  await hide(); await p.waitForTimeout(300);
  await (await p.$('.dialog')).screenshot({ path: path.join(OUT, 'mundo-livre.jpg'), type: 'jpeg', quality: 85 });
  console.log('4', await p.textContent('#wmInfo'));
  await b.close();
})();
