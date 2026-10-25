// Captura do comando hide: node scripts/guia/esconder.js <url do editor> <pacote Bedrock .zip> <pasta de saída>
// Na casa de exemplo, esconde as tábuas e as escadas (o telhado e as paredes) e mostra o que estava dentro (esconder.jpg);
// confere maiúsculas e minúsculas, a seleção, o clique atravessando, unhide de um bloco e unhide all (imprime cada um).
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs'), path = require('path');
const [URL, PACK, OUT] = process.argv.slice(2);
eval(fs.readFileSync(__dirname + '/demo.inc', 'utf8'));
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(s => { if (!sessionStorage.getItem('x')) { sessionStorage.setItem('x', '1'); localStorage.setItem('bloco-a-bloco-v1', s); localStorage.setItem('bloco-a-bloco-measure', '0'); } }, JSON.stringify(proj));
  await p.goto(URL); await p.addStyleTag({ content: '#tabbar{display:none!important}' }); await p.waitForTimeout(2500);
  await p.setInputFiles('#packIn', PACK);
  await p.waitForFunction(() => /blocos com textura/.test(document.getElementById('toast').textContent), null, { timeout: 300000 });
  if (await p.evaluate(() => document.getElementById('measTbtn').getAttribute('aria-pressed') === 'true')) await p.click('#measTbtn');
  const ev = s => p.evaluate(x => window.__bab.ev(x), s);
  const tri = async () => { await p.waitForFunction(() => window.__bab.meshInfo().naFila === 0); return (await p.evaluate(() => window.__bab.meshInfo())).triangulos; };
  await ev(`(function(){ Object.assign(cam, { yaw: 0.55, pitch: 0.55, dist: 30, tx: 11, ty: 3, tz: 12 }); updateCamera(); requestRender(); })()`);
  const t0 = await tri(), n0 = await ev('blockCount');
  const planks = await ev(`(function(){ var n = {}; forEachBlock(function (x, y, z, v) { var j = BLOCKS[cellBlock(v)].java; if (/planks$|stairs$/.test(j)) n[j] = 1; }); return Object.keys(n).join(' '); })()`);
  console.log('hide', planks.toUpperCase(), '→', await ev(`cmdRun('HIDE ${planks.toUpperCase()}').msg`));
  const t1 = await tri(); console.log('triângulos', t0, '→', t1, '| blocos na construção', n0, '→', await ev('blockCount'), '| aviso:', await ev("document.getElementById('hideTxt').textContent"));
  // o clique atravessa: um raio de cima do telhado acerta o que está embaixo, não a tábua escondida
  console.log('clique no meio:', await ev(`(function(){ var r = renderer.domElement.getBoundingClientRect(), t = targetAt(r.left + r.width / 2, r.top + r.height / 2); return t && t.hit ? cellName(gget(t.hit[0], t.hit[1], t.hit[2])) : 'nada'; })()`));
  await ev(`cmdOpen(); document.getElementById('cmdIn').value = ''; cmdShow({ msg: document.getElementById('toast').textContent, long: true })`);
  await p.keyboard.type('unhide all'); await p.mouse.move(5, 795); await p.evaluate(() => document.getElementById('toast').classList.remove('show')); await p.waitForTimeout(1200);
  await p.screenshot({ path: path.join(OUT, 'esconder.jpg'), type: 'jpeg', quality: 84, clip: { x: 0, y: 54, width: 972, height: 718 } });
  await ev('cmdClose()');
  const first = planks.split(' ')[0];
  console.log('unhide um:', await ev(`cmdRun('UnHide ${first}').msg`), '| aviso:', await ev("document.getElementById('hideTxt').textContent"));
  console.log('UnHide All:', await ev(`cmdRun('UnHide All').msg`), '| triângulos', await tri(), '| aviso escondido:', await ev("document.getElementById('hideChip').hidden"));
  // com seleção: só dentro dela
  console.log('com seleção:', await ev(`(function(){ sel = selFrom([0, 0, 0], [11, 15, 23]); var r = cmdRun('hide ${first}'); sel = null; var vis1 = 0, esc = 0; forEachBlock(function (x, y, z, v) { if (BLOCKS[cellBlock(v)].java === '${first}') { if (hidden(x, y, z, cellBlock(v))) esc++; else vis1++; } }); cmdRun('unhide all'); return r.msg + ' | escondidos ' + esc + ', visíveis ' + vis1; })()`));
  console.log('ok esconder', errs); await b.close();
})();
