// Capturas dos tubos para o guia (e a barra de ferramentas, com as posições dos números para o guia):
// node scripts/guia/tubos.js <url do editor> <pacote Bedrock .zip> <pasta de saída>
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');
const [URL, PACK, OUT] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  const S = [56, 40, 56], A = S[0] * S[2], proj = { v: 1, size: S, pal: ['grass_block'], rle: [1, A, 0, A * (S[1] - 1)] };
  await p.addInitScript(s => { if (!sessionStorage.getItem('x')) { sessionStorage.setItem('x', '1'); localStorage.setItem('bloco-a-bloco-v1', s); localStorage.setItem('bloco-a-bloco-measure', '0'); localStorage.removeItem('bloco-a-bloco-tube'); } }, JSON.stringify(proj));
  await p.goto(URL); await p.waitForTimeout(2500);
  await p.setInputFiles('#packIn', PACK);
  await p.waitForFunction(() => /blocos com textura/.test(document.getElementById('toast').textContent), null, { timeout: 300000 });
  if (await p.evaluate(() => document.getElementById('measTbtn').getAttribute('aria-pressed') === 'true')) await p.click('#measTbtn');
  const ev = s => p.evaluate(x => window.__bab.ev(x), s);
  const hide = () => p.evaluate(() => document.getElementById('toast').classList.remove('show'));
  // barra de ferramentas e o centro de cada botão (em % da largura da imagem) para os números do guia
  await hide(); await p.waitForTimeout(500);
  await p.screenshot({ path: path.join(OUT, 'barra.jpg'), type: 'jpeg', quality: 82, clip: { x: 0, y: 0, width: 972, height: 54 } });
  console.log('pinos', await p.evaluate(() => [...document.querySelectorAll('#tools [data-tool]'), ...['#undo', '#histBtn', '#redo', '#measTbtn', '#layerBtn', '#layerRange', '#matBtn'].map(s => document.querySelector(s))].map(e => { const r = e.getBoundingClientRect(); return ((r.left + r.width / 2) / 972 * 100).toFixed(1); }).join(' ')));
  // linhas desenhadas: um caminho com curva subindo no ar, uma linha flutuante e a prévia (oco)
  await ev(`(function(){ setTool('tube'); chooseBlock(BY_JAVA['copper_block'] != null ? BY_JAVA['copper_block'] : BY_JAVA['stone_bricks']); tube.d = 5; tube.hollow = true;
    tube.paths = [[[10, 3, 44], [28, 3, 44], [40, 14, 32]], [[30, 18, 8], [42, 27, 13], [50, 22, 22]]]; tube.sel = [1, 1]; tubeChanged();
    Object.assign(cam, { yaw: 0.75, pitch: 0.5, dist: 62, tx: 27, ty: 8, tz: 27 }); updateCamera(); requestRender(); })()`);
  const o = await p.evaluate(() => { const r = document.querySelector('#viewport canvas').getBoundingClientRect(); return [r.left, r.top]; });
  const find = w => p.evaluate(([w, o]) => { for (let y = 0; y < 760; y += 3) for (let x = 0; x < 960; x += 3) { const t = window.__bab.target(o[0] + x, o[1] + y); if (t && t.place && t.place[0] === w[0] && t.place[1] === w[1] && t.place[2] === w[2]) return [o[0] + x, o[1] + y]; } return null; }, [w, o]);
  const c = await find([46, 1, 46]); if (c) await p.mouse.move(c[0], c[1]); await p.waitForTimeout(300); await hide(); await p.waitForTimeout(500);
  await p.screenshot({ path: path.join(OUT, 'tubos-linhas.jpg'), type: 'jpeg', quality: 82, clip: { x: 0, y: 0, width: 972, height: 772 } });
  console.log('linhas', await ev(`$('tubeTxt').textContent`));
  // gerado: o cano oco de cobre e, ao lado, galhos maciços de tronco (o tronco segue a direção de cada trecho)
  await ev(`(function(){ tubeRun(false); chooseBlock(BY_JAVA['oak_log']); tube.d = 3; tube.hollow = false;
    tube.paths = [[[12, 1, 14], [12, 15, 14], [5, 24, 22]], [[12, 15, 14], [20, 23, 5]]]; tubeRun(false); })()`);
  await p.mouse.move(o[0] + 940, o[1] + 60); await p.waitForTimeout(300); await hide(); await p.waitForTimeout(500);
  await p.screenshot({ path: path.join(OUT, 'tubos.jpg'), type: 'jpeg', quality: 82, clip: { x: 0, y: 0, width: 972, height: 772 } });
  console.log('ok tubos', await ev('blockCount'), errs);
  await b.close();
})();
