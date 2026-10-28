// Captura da caixa de comandos: node scripts/guia/comandos.js <url do editor> <pacote Bedrock .zip> <pasta de saída>
// Abre com / duas vezes, apaga as folhas da árvore da casa de exemplo com delblock e confere seleção, Tab, histórico,
// erro de bloco e Ctrl+Z (imprime cada resultado). A captura (comandos.jpg) é a caixa aberta, com o comando seguinte
// digitado e o resultado do anterior.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs'), path = require('path');
const [URL, PACK, OUT] = process.argv.slice(2);
eval(fs.readFileSync(__dirname + '/demo.inc', 'utf8'));
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(s => { if (!sessionStorage.getItem('x')) { sessionStorage.setItem('x', '1'); localStorage.setItem('bloco-a-bloco-v1', s); localStorage.setItem('bloco-a-bloco-measure', '0'); localStorage.removeItem('bloco-a-bloco-comandos'); } }, JSON.stringify(proj));
  await p.goto(URL); await p.addStyleTag({ content: '#tabbar{display:none!important}' }); await p.waitForTimeout(2500);
  await p.setInputFiles('#packIn', PACK);
  await p.waitForFunction(() => /blocos com textura/.test(document.getElementById('toast').textContent), null, { timeout: 300000 });
  if (await p.evaluate(() => document.getElementById('measTbtn').getAttribute('aria-pressed') === 'true')) await p.click('#measTbtn');
  const ev = s => p.evaluate(x => window.__bab.ev(x), s);
  const count = n => ev(`(function(){ var c = 0, bi = BY_JAVA['${n}']; forEachBlock(function (x, y, z, v) { if (cellBlock(v) === bi) c++; }); return c; })()`);
  const out = () => ev("document.getElementById('cmdOut').textContent");
  await ev(`(function(){ Object.assign(cam, { yaw: 0.55, pitch: 0.45, dist: 32, tx: 11, ty: 4, tz: 12 }); updateCamera(); requestRender(); })()`);
  await p.mouse.move(600, 400);
  await p.keyboard.press('/'); await p.waitForTimeout(700); console.log('uma barra só (fechada?):', await ev("document.getElementById('cmdBox').hidden"));
  await p.keyboard.press('/'); await p.keyboard.press('/'); await p.waitForTimeout(200);
  console.log('duas barras (aberta?):', !(await ev("document.getElementById('cmdBox').hidden")), '| foco:', await ev('document.activeElement.id'), '|', await out());
  const leaves = await ev(`(function(){ var n = {}; forEachBlock(function (x, y, z, v) { var j = BLOCKS[cellBlock(v)].java; if (/_leaves$/.test(j)) n[j] = (n[j] || 0) + 1; }); return Object.keys(n)[0]; })()`);
  // Tab completa o comando e o bloco
  await p.keyboard.type('delb'); await p.keyboard.press('Tab'); await p.keyboard.type(leaves.slice(0, 5)); await p.keyboard.press('Tab');
  console.log('Tab:', JSON.stringify(await ev("document.getElementById('cmdIn').value")), '|', await out());
  await ev(`document.getElementById('cmdIn').value = 'delblock ${leaves}'`);
  const n0 = await count(leaves); await p.keyboard.press('Enter'); await p.waitForTimeout(300);
  console.log('delblock', leaves + ':', n0, '→', await count(leaves), '|', await out());
  await p.keyboard.type('delblock pedra_inventada'); await p.keyboard.press('Enter'); console.log('erro:', await out());
  await ev("document.getElementById('cmdIn').value = ''"); await p.keyboard.press('ArrowUp'); console.log('↑ histórico:', JSON.stringify(await ev("document.getElementById('cmdIn').value")));
  // captura: a caixa aberta com o próximo comando digitado e o resultado do anterior
  await ev(`document.getElementById('cmdIn').value = ''`); await ev(`cmdShow({ msg: 'Apagados ${n0} blocos de ' + BLOCKS[BY_JAVA['${leaves}']].name + ' na construção inteira. Ctrl+Z desfaz.', long: true })`);
  await p.keyboard.type('delblock oak_fence'); await p.evaluate(() => document.getElementById('toast').classList.remove('show')); await p.waitForTimeout(1200);
  await p.screenshot({ path: path.join(OUT, 'comandos.jpg'), type: 'jpeg', quality: 84, clip: { x: 0, y: 54, width: 972, height: 718 } });
  await p.keyboard.press('Escape'); console.log('Esc fecha a lista:', await ev("document.getElementById('cmdSug').hidden"), '| caixa aberta:', !(await ev("document.getElementById('cmdBox').hidden")));
  await p.keyboard.press('Escape'); console.log('Esc de novo fecha a caixa:', await ev("document.getElementById('cmdBox').hidden"));
  await p.keyboard.press('Control+z'); console.log('Ctrl+Z:', await count(leaves), 'folhas de volta');
  // com seleção: só dentro dela
  const r = await ev(`(function(){ var bi = BY_JAVA['${leaves}'], lo = null; forEachBlock(function (x, y, z, v) { if (cellBlock(v) === bi && (!lo || y > lo[1])) lo = [x, y, z]; }); sel = selFrom([lo[0] - 1, lo[1], lo[2] - 1], [lo[0] + 1, lo[1], lo[2] + 1]); var inBox = 0; blocksInBox(sel.a[0], sel.a[1], sel.a[2], sel.b[0], sel.b[1], sel.b[2], function (x, y, z, v) { if (cellBlock(v) === bi) inBox++; }); var r = cmdRun('/delblock ${leaves} oak_log'); return inBox + ' na seleção; ' + r.msg; })()`);
  console.log('seleção:', r, '| sobraram', await count(leaves));
  // sugestões enquanto digita: "delblock dio" lista os dioritos; Tab põe o marcado
  await ev('sel = null'); await p.keyboard.press('/'); await p.keyboard.press('/'); await p.waitForTimeout(300); await p.keyboard.type('delblock dio'); await p.waitForTimeout(400);
  console.log('sugestões:', await p.$$eval('#cmdSug .cmds', a => a.map(x => x.textContent).join(' ')));
  const bb = await (await p.$('#cmdBox')).boundingBox();
  await p.screenshot({ path: path.join(OUT, 'comandos-sugestoes.jpg'), type: 'jpeg', quality: 88, clip: { x: bb.x - 8, y: bb.y - 8, width: bb.width + 16, height: bb.height + 16 } });
  await p.keyboard.press('Tab'); console.log('Tab:', JSON.stringify(await ev("document.getElementById('cmdIn').value")));
  console.log('ok comandos', errs); await b.close();
})();
