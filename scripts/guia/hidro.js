// Capturas do Pincel de água: o aviso com a prévia, um rio traçado nas colinas, um lago na divisa entre pântano e
// deserto (a decoração muda aos poucos), o recife de um oceano quente (com a água escondida) e a janela das regras. Também confere o desfazer
// (o traço inteiro volta) e que a água não vaza (nenhuma água corrente depois de a simulação andar).
// node scripts/guia/hidro.js <url do editor> <pacote Bedrock .zip> <pasta de saída>
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');
const [URL, PACK, OUT] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => { if (!sessionStorage.getItem('x')) { sessionStorage.setItem('x', '1'); localStorage.clear(); localStorage.setItem('bloco-a-bloco-measure', '0'); localStorage.setItem('bloco-a-bloco-view', '100000000'); } });
  await p.goto(URL); await p.addStyleTag({ content: '#tabbar{display:none!important}' }); await p.waitForTimeout(2000);
  await p.setInputFiles('#packIn', PACK);
  await p.waitForFunction(() => /blocos com textura/.test(document.getElementById('toast').textContent), null, { timeout: 300000 });
  const ev = s => p.evaluate(x => window.__bab.ev(x), s);
  const hide = () => p.evaluate(() => document.getElementById('toast').classList.remove('show'));
  const settle = async () => { await p.waitForFunction(() => window.__bab.ev('dirty.size') === 0, null, { timeout: 300000, polling: 300 }); await p.waitForTimeout(900); await hide(); await p.waitForTimeout(700); };
  // colinas de 192 x 192; metade oeste pântano, metade leste deserto (a divisa em x = 96, para o lago da transição)
  await ev(`(async function(){ newWorld(192, 96, 192); var T = TR_TYPES.colinas; await trGenerate(Object.assign({}, tr, { type: 'colinas', A: 16, S: 50, sea: -40, seaOn: false, where: 'all', margin: 0, seed: 31, bio: 'plains', deco: true })); worldShift(0, 24, 0, SX, SY + 24, SZ); histReset(); })()`); // 24 blocos de chão embaixo, para o oceano fundo
  await ev(`(function(){ for (var x = 64; x < 128; x++) for (var z = 120; z < 184; z++) bioSetRaw(x, z, x < 96 ? 6 : 2); })()`);
  const top = (x, z) => ev(`(function(){ var y = SY - 1; while (y > 0 && (!gget(${x}, y, ${z}) || (hydAt(${x}, y, ${z}) === 2 && !hydIsWater(${x}, y, ${z})))) y--; return y; })()`);
  const hash = () => ev(`(function(){ var h = 0, n = 0; forEachBlock(function (x, y, z, v) { var q = Math.imul(x * 73856093 ^ y * 19349663 ^ z * 83492791 ^ Math.imul(v, 2654435761), 1597334677); h = (h + (q ^ (q >>> 15))) | 0; n++; /* soma: não depende da ordem dos pedaços */ }); return h + ':' + n; })()`);
  const flowing = () => ev(`(function(){ var n = 0; forEachBlock(function (x, y, z, v) { if (BLOCKS[cellBlock(v)].java === 'water' && fluidLv(v) !== 0) n++; }); return n; })()`);
  const stroke = async (kind, r, bio, pts) => {
    await ev(`setTool('water'); hyd.kind = '${kind}'; hyd.r = ${r}; hyd.bio = ${bio}; hyd.lvl = null; hyd.carve = hyd.fill = hyd.deco = true; updateWaterChip()`);
    const y0 = await top(pts[0][0], pts[0][1]); await ev(`hoverT = { hit: [${pts[0][0]}, ${y0}, ${pts[0][1]}] }; hydStart(hoverT)`);
    for (const [x, z] of pts.slice(1)) { const y = await top(x, z); await ev(`hoverT = { hit: [${x}, ${y}, ${z}] }`); await p.waitForTimeout(200); }
    await ev('releaseStroke()'); const t = await p.textContent('#toast'); console.log(kind, '→', t); return t;
  };
  const shot = async (name, x, z, yaw, pitch, dist) => {
    const y = await top(x, z);
    await ev(`Object.assign(cam, { yaw: ${yaw}, pitch: ${pitch}, dist: ${dist}, tx: ${x}, ty: ${y}, tz: ${z} }); updateCamera(); updateView(true); requestRender()`);
    await settle(); await p.screenshot({ path: path.join(OUT, name), type: 'jpeg', quality: 82, clip: { x: 0, y: 54, width: 972, height: 718 } });
  };
  // o aviso e a prévia (a superfície da água que o lago vai ter)
  await ev(`setTool('water'); hyd.kind = 'lake'; hyd.r = 10; hyd.bio = -1; hyd.lvl = null; updateWaterChip()`);
  { const y = await top(48, 48); await ev(`Object.assign(cam, { yaw: 0.7, pitch: 0.7, dist: 70, tx: 48, ty: ${y}, tz: 48 }); updateCamera(); updateView(true); hoverT = { hit: [48, ${y}, 48] }; updatePreview(); requestRender()`); }
  await settle(); await p.screenshot({ path: path.join(OUT, 'hidro-aviso.jpg'), type: 'jpeg', quality: 82, clip: { x: 0, y: 54, width: 972, height: 718 } });
  // rio: arrastando por cima das colinas (o nível sai do primeiro ponto); desfazer e refazer
  const h0 = await hash();
  const rio = []; for (let i = 0; i <= 16; i++) rio.push([12 + i * 7, 30 + Math.round(Math.sin(i / 2.4) * 14)]);
  const t0 = Date.now(); await stroke('river', 5, -1, rio); const ms = Date.now() - t0;
  const h1 = await hash(); await ev('undo()'); const h2 = await hash(); await ev('redo()'); const h3 = await hash();
  console.log('rio em', ms, 'ms; desfazer volta ao de antes:', h2 === h0, '; refazer volta ao rio:', h3 === h1);
  await shot('hidro-rio.jpg', 70, 32, 0.25, 0.95, 120);
  // lago na divisa pântano | deserto: o bioma de cada coluna é lido (Automático) e muda aos poucos
  await stroke('lake', 13, -1, [[96, 152]]);
  await shot('hidro-transicao.jpg', 96, 152, 0.0, 1.05, 62);
  // oceano quente (bioma escolhido no aviso, num lugar sem bioma lido): recifes, corais e pepinos-do-mar
  await stroke('ocean', 11, 40, [[150, 60], [160, 70]]);
  // o recife: a água escondida (comando hide water), para ver as formações de coral, a crosta e os corais
  await ev(`cmdRun('hide water')`);
  await ev(`Object.assign(cam, { yaw: 0.75, pitch: 0.5, dist: 34, tx: 152, ty: 30, tz: 62 }); updateCamera(); updateView(true); requestRender()`);
  await settle(); await p.screenshot({ path: path.join(OUT, 'hidro-oceano.jpg'), type: 'jpeg', quality: 82, clip: { x: 0, y: 54, width: 972, height: 718 } });
  await ev(`cmdRun('unhide all')`);
  await p.waitForTimeout(5000);
  console.log('água corrente depois da simulação (vazamento):', await flowing());
  // a janela das regras
  await ev('openHydRules()'); await p.waitForTimeout(500);
  const d = await p.evaluate(() => { const r = document.querySelector('.dialog').getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; });
  await p.screenshot({ path: path.join(OUT, 'hidro-regras.jpg'), type: 'jpeg', quality: 85, clip: { x: d[0] - 8, y: d[1] - 8, width: d[2] + 16, height: Math.min(d[3] + 16, 790 - d[1]) } });
  console.log(errs); await b.close();
})();
