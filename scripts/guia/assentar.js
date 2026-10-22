// Capturas do Assentar no terreno e da substituição com mistura para o guia:
// node scripts/guia/assentar.js <url do editor> <pacote Bedrock .zip> <pasta de saída>
// A cena (scripts/guia/encosta.inc): uma encosta com capim e uma casa que flutua do lado de baixo e entra no morro do outro.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs'), path = require('path');
const [URL, PACK, OUT] = process.argv.slice(2);
eval(fs.readFileSync(__dirname + '/encosta.inc', 'utf8'));
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(s => { if (!sessionStorage.getItem('x')) { sessionStorage.setItem('x', '1'); localStorage.setItem('bloco-a-bloco-v1', s); localStorage.setItem('bloco-a-bloco-measure', '0'); localStorage.removeItem('bloco-a-bloco-assentar'); localStorage.removeItem('bloco-a-bloco-mix'); } }, JSON.stringify(proj));
  await p.goto(URL); await p.addStyleTag({ content: '#tabbar{display:none!important}' }); await p.waitForTimeout(2500); // as capturas recortam a partir da barra de ferramentas
  await p.setInputFiles('#packIn', PACK);
  await p.waitForFunction(() => /blocos com textura/.test(document.getElementById('toast').textContent), null, { timeout: 300000 });
  if (await p.evaluate(() => document.getElementById('measTbtn').getAttribute('aria-pressed') === 'true')) await p.click('#measTbtn');
  const ev = s => p.evaluate(x => window.__bab.ev(x), s);
  const hide = () => p.evaluate(() => document.getElementById('toast').classList.remove('show'));
  const VIEW = { yaw: Number(process.env.YAW || 2.5), pitch: 0.42, dist: 34, tx: 30, ty: 21, tz: 30 };
  const cam = async c => { await p.evaluate(c => { Object.assign(window.__bab.cam, c); window.__bab.update(); }, c); await p.waitForTimeout(1200); };
  // a porta, com as duas metades
  await ev(`(function(){ editSet(${DOOR[0]},${DOOR[1]},${DOOR[2]},cellFromName('oak_door')); editSet(${DOOR[0]},${DOOR[1] + 1},${DOOR[2]},cellFromName('oak_door[half=upper]')); })()`);
  await hide(); await cam(VIEW);
  await p.screenshot({ path: path.join(OUT, 'assentar-antes.jpg'), type: 'jpeg', quality: 82, clip: { x: 0, y: 54, width: 972, height: 718 } });
  // seleção e a janela
  await ev('setTool("select")'); await p.evaluate(() => window.__bab.setSel([25, 21, 27], [35, 26, 35]));
  await ev('openSeat()'); await p.waitForTimeout(400);
  const dlg = await p.$('#overlayRoot .dialog'); await dlg.screenshot({ path: path.join(OUT, 'assentar-janela.jpg'), type: 'jpeg', quality: 85 });
  await p.click('#saOk'); await p.waitForTimeout(400);
  const txt = await ev("document.getElementById('toast').textContent");
  await ev('clearSel()'); await cam(VIEW);
  await p.evaluate(t => { const e = document.getElementById('toast'); e.textContent = t; e.classList.add('show'); }, txt);
  await p.screenshot({ path: path.join(OUT, 'assentar-depois.jpg'), type: 'jpeg', quality: 82, clip: { x: 0, y: 54, width: 972, height: 718 } });
  // substituir com mistura: a parede de pedregulho vira "Pedra velha"
  await ev('undo()'); await hide();
  await p.evaluate(() => window.__bab.setSel([26, 22, 28], [34, 25, 28]));
  await ev('openReplace()'); await p.check('[name="rpBy"][value="mix"]'); await p.selectOption('#rpPre', '0'); await p.waitForTimeout(200);
  await p.evaluate(() => { const o = [...document.querySelectorAll('#rpFrom option')].find(o => /^Cobblestone/.test(o.textContent)); document.getElementById('rpFrom').value = o.value; });
  const d2 = await p.$('#overlayRoot .dialog'); await d2.screenshot({ path: path.join(OUT, 'substituir-mistura.jpg'), type: 'jpeg', quality: 85 });
  await p.click('#rpOk'); await p.waitForTimeout(300);
  const t2 = await ev("document.getElementById('toast').textContent");
  await ev('clearSel()'); await cam({ yaw: VIEW.yaw, pitch: 0.25, dist: 16, tx: 30, ty: 23.5, tz: 28 });
  await p.evaluate(t => { const e = document.getElementById('toast'); e.textContent = t; e.classList.add('show'); }, t2);
  await p.screenshot({ path: path.join(OUT, 'substituir-mistura-resultado.jpg'), type: 'jpeg', quality: 82, clip: { x: 0, y: 54, width: 972, height: 718 } });
  console.log('ok assentar', txt, '|', t2, errs);
  await b.close();
})();
