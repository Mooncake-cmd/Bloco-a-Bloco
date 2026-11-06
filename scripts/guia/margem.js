// Capturas da margem em degraus do Pincel de água: o mesmo rio, nas mesmas colinas com floresta, com a margem reta (o
// barranco fica como estava: parede) e em degraus (e a de suave). Também confere que a água não vaza e que o Ctrl+Z
// desfaz tudo (o rio e os degraus).
// node scripts/guia/margem.js <url do editor> <pacote Bedrock .zip> <pasta de saída>
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');
const [URL, PACK, OUT] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => { if (!sessionStorage.getItem('x')) { sessionStorage.setItem('x', '1'); localStorage.clear(); localStorage.setItem('bloco-a-bloco-measure', '0'); localStorage.setItem('bloco-a-bloco-view', '100000000'); } });
  await p.goto(URL); await p.addStyleTag({ content: '#tabbar{display:none!important}' }); await p.waitForTimeout(2000);
  if (PACK) { await p.setInputFiles('#packIn', PACK); await p.waitForFunction(() => /blocos com textura/.test(document.getElementById('toast').textContent), null, { timeout: 300000 }); }
  const ev = s => p.evaluate(x => window.__bab.ev(x), s);
  const settle = async () => { await p.waitForFunction(() => window.__bab.ev('dirty.size') === 0, null, { timeout: 300000, polling: 300 }); await p.waitForTimeout(900); await p.evaluate(() => document.getElementById('toast').classList.remove('show')); await p.waitForTimeout(500); };
  await ev(`(async function(){ newWorld(128, 96, 128); await trGenerate(Object.assign({}, tr, { type: 'colinas', A: 18, S: 45, sea: -40, seaOn: false, where: 'all', margin: 0, seed: 12, bio: 'plains', deco: false })); worldShift(0, 16, 0, SX, SY + 16, SZ); histReset(); })()`);
  const top = (x, z) => ev(`(function(){ var y = SY - 1; while (y > 0 && (!gget(${x}, y, ${z}) || hydAt(${x}, y, ${z}) === 2)) y--; return y; })()`);
  // o rio passa pelo ponto mais baixo de uma faixa e corta as colinas em volta
  const pts = []; for (let i = 0; i <= 18; i++) pts.push([10 + i * 6, 64 + Math.round(Math.sin(i / 3) * 10)]);
  let low = null; for (const [x, z] of pts) { const y = await top(x, z); if (!low || y < low[1]) low = [x, y, z]; }
  const stroke = async (bank) => {
    await ev(`setTool('water'); hyd.kind = 'river'; hyd.r = 5; hyd.bio = -1; hyd.dep = null; hyd.carve = hyd.fill = hyd.deco = true; hyd.bank = '${bank}'; hydSeed = 4242; hoverXY = null; updateWaterChip()`);
    await ev(`hoverT = { hit: [${low[0]}, ${low[1]}, ${low[2]}] }; hydStart(hoverT); hydStroke.last = [${pts[0][0]}, ${low[1]}, ${pts[0][1]}]`);
    for (const [x, z] of pts) { await ev(`hoverT = { hit: [${x}, ${low[1]}, ${z}] }`); await p.waitForTimeout(200); }
    await ev('releaseStroke()'); return p.textContent('#toast');
  };
  const hash = () => ev(`(function(){ var h = 0, n = 0; forEachBlock(function (x, y, z, v) { var q = Math.imul(x * 73856093 ^ y * 19349663 ^ z * 83492791 ^ Math.imul(v, 2654435761), 1597334677); h = (h + (q ^ (q >>> 15))) | 0; n++; }); return h + ':' + n; })()`);
  const flowing = () => ev(`(function(){ var n = 0; forEachBlock(function (x, y, z, v) { if (BLOCKS[cellBlock(v)].java === 'water' && fluidLv(v) !== 0) n++; }); return n; })()`);
  const shot = async (name) => {
    await ev(`Object.assign(cam, { yaw: ${best[3] > 0 ? 0.3 : 3.44}, pitch: 0.62, dist: 58, tx: ${best[1]}, ty: ${low[1] + 3}, tz: ${best[2] + best[3] / 3} }); updateCamera(); updateView(true); requestRender()`);
    await settle(); await p.screenshot({ path: path.join(OUT, name), type: 'jpeg', quality: 84, clip: { x: 0, y: 54, width: 972, height: 718 } });
  };
  // a câmera olha o trecho com o barranco mais alto (o terreno do lado do rio mais acima da água)
  let best = null; for (const [x, z] of pts) for (const dz of [-9, 9]) { const y = await top(x, z + dz); if (!best || y > best[0]) best = [y, x, z, dz]; }
  console.log('barranco mais alto:', best[0] - low[1], 'blocos acima da água, em X', best[1], 'Z', best[2] + best[3]);
  const h0 = await hash();
  for (const [bank, name] of [['reta', 'margem-reta.jpg'], ['degraus', 'margem-degraus.jpg'], ['suave', 'margem-suave.jpg']]) {
    console.log(bank, '→', await stroke(bank));
    await p.waitForTimeout(4000); console.log('  água corrente (vazamento):', await flowing());
    await shot(name);
    await ev('undo()'); console.log('  desfazer volta ao de antes:', (await hash()) === h0);
  }
  console.log(errs); await b.close();
})();
