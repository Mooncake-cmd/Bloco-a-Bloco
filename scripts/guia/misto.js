// Captura da janela do mundo antigo quando ele já foi aberto numa versão nova do jogo (parte dos chunks no formato novo):
// Converter já vem marcado e a janela diz por quê. Também confere a escolha (legKeep falso ao continuar).
// node scripts/guia/misto.js <url do editor> <mundo .zip/.mcworld aberto numa versão nova> <pasta de saída>
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');
const [URL, WORLD, OUT] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => { if (!sessionStorage.getItem('x')) { sessionStorage.setItem('x', '1'); localStorage.clear(); } });
  await p.goto(URL); await p.addStyleTag({ content: '#tabbar{display:none!important}' }); await p.waitForTimeout(2000);
  const ev = s => p.evaluate(x => window.__bab.ev(x), s);
  await p.setInputFiles('#worldIn', WORLD); await p.waitForSelector('#legOk', { timeout: 900000 }); await p.waitForTimeout(500);
  console.log('converter marcado', await p.isChecked('[name=legM][value=conv]'), 'versão escondida', await p.isHidden('#legVerRow'));
  await (await p.$('.dialog')).screenshot({ path: path.join(OUT, 'antigo-misto.jpg'), type: 'jpeg', quality: 85 });
  await p.click('[name=legM][value=keep]'); console.log('manter mostra a versão', await p.isVisible('#legVerRow'));
  await p.click('[name=legM][value=conv]');
  await p.click('#legOk'); await p.waitForSelector('#wmGo', { timeout: 900000 });
  console.log('legKeep', await ev('wio.legKeep'), 'chunks novos', await ev('wio.legNew'), 'versão', await ev('wio.lastVer'));
  console.log(errs); await b.close();
})();
