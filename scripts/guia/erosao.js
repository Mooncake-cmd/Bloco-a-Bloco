// Capturas do Pincel de erosão: node scripts/guia/erosao.js <url do editor> <pacote Bedrock .zip> <pasta de saída>
// Um muro de tijolos de pedra com uma varanda e uma rocha natural, antes (erosao-antes.jpg) e depois de algumas
// pinceladas com as três etapas (erosao-depois.jpg); um paredão de pedra só com Sulcos (erosao-sulcos.jpg) e a janela
// da tabela (erosao-tabela.jpg). Imprime o que cada etapa fez e confere que o Ctrl+Z volta tudo.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');
const [URL, PACK, OUT] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => { if (!sessionStorage.getItem('x')) { sessionStorage.setItem('x', '1'); localStorage.clear(); localStorage.setItem('bloco-a-bloco-measure', '0'); } });
  await p.goto(URL); await p.addStyleTag({ content: '#tabbar{display:none!important}' }); await p.waitForTimeout(2000);
  await p.setInputFiles('#packIn', PACK);
  await p.waitForFunction(() => /blocos com textura/.test(document.getElementById('toast').textContent), null, { timeout: 300000 });
  if (await p.evaluate(() => document.getElementById('measTbtn').getAttribute('aria-pressed') === 'true')) await p.click('#measTbtn');
  const ev = s => p.evaluate(x => window.__bab.ev(x), s);
  const shot = async (nome) => { await p.mouse.move(5, 795); await p.evaluate(() => document.getElementById('toast').classList.remove('show')); await p.waitForTimeout(1500); await p.screenshot({ path: path.join(OUT, nome), type: 'jpeg', quality: 84, clip: { x: 0, y: 54, width: 972, height: 718 } }); };
  const snap = `(function(){ var o = {}; forEachBlock(function (x, y, z, v) { o[x+','+y+','+z] = cellName(v); }); return o; })()`;
  await ev(`(function(){ newWorld(48, 32, 48); sym.on = [false,false,false]; var C = function (n) { return cellFromName(n); };
    beginBatch('cena'); for (var z = 0; z < 48; z++) for (var x = 0; x < 48; x++) { editSet(x, 0, z, C('stone')); editSet(x, 1, z, C('dirt')); editSet(x, 2, z, C('grass_block')); }
    for (var y = 3; y < 15; y++) for (var x = 10; x < 34; x++) for (var z = 20; z < 24; z++) { var e = z === 20 || z === 23 || x === 10 || x === 33; if (e && (y < 12 || x < 22)) editSet(x, y, z, C(y === 3 ? 'cobblestone' : 'stone_bricks')); }
    for (var x2 = 22; x2 < 30; x2++) for (var z2 = 16; z2 < 20; z2++) editSet(x2, 11, z2, C('stone_brick_slab[type=bottom]'));
    for (var x3 = 12; x3 < 20; x3++) editSet(x3, 15, 20, C('stone_brick_stairs[facing=south]'));
    for (var y4 = 3; y4 < 10; y4++) for (var z4 = 30; z4 < 40; z4++) for (var x4 = 30; x4 < 42; x4++) if ((x4 - 36) * (x4 - 36) + (z4 - 35) * (z4 - 35) < 30 - y4 * 2) editSet(x4, y4, z4, C('stone'));
    endBatch(); setTool('erode'); ero.r = 6; ero.s = 4; ero.wear = ero.fall = ero.groove = true; updateErodeChip();
    Object.assign(cam, { yaw: 0.6, pitch: 0.45, dist: 46, tx: 24, ty: 7, tz: 26 }); updateCamera(); requestRender(); })()`);
  await shot('erosao-antes.jpg');
  await ev(`window.__A = ${snap}`);
  console.log(await ev(`(function(){ var tot = { removed: 0, worn: 0, fallen: 0, debris: 0, grooves: 0 }; beginBatch('Erosão');
    [[16, 10, 20], [22, 12, 18], [28, 9, 23], [36, 6, 35], [12, 14, 21]].forEach(function (c) { for (var k = 0; k < 4; k++) eroAdd(tot, eroDab(c)); }); endBatch();
    var A = window.__A, B = ${snap}, soltos = 0; Object.keys(B).forEach(function (k) { if (!A[k]) { var q = k.split(',').map(Number); if (q[1] > 0 && !gget(q[0], q[1] - 1, q[2])) soltos++; } });
    return 'etapas ' + JSON.stringify(tot) + ', entulho sem apoio: ' + soltos; })()`));
  await shot('erosao-depois.jpg');
  console.log('desfazer:', await ev(`(function(){ undo(); var A = window.__A, B = ${snap}, d = 0; Object.keys(A).forEach(function (k) { if (A[k] !== B[k]) d++; }); Object.keys(B).forEach(function (k) { if (!A[k]) d++; }); return d + ' diferenças do original'; })()`));
  // paredão só com Sulcos
  await ev(`(function(){ newWorld(48, 32, 48); var C = function (n) { return cellFromName(n); }; beginBatch('cena');
    for (var z = 0; z < 48; z++) for (var x = 0; x < 48; x++) { editSet(x, 0, z, C('stone')); editSet(x, 1, z, C('grass_block')); }
    for (var y = 2; y < 18; y++) for (var z2 = 26; z2 < 34; z2++) for (var x2 = 8; x2 < 40; x2++) editSet(x2, y, z2, C(y > 15 ? 'grass_block' : y > 13 ? 'dirt' : (x2 * 7 + y * 3) % 11 ? 'stone' : 'andesite'));
    endBatch(); ero.wear = false; ero.fall = false; ero.groove = true; ero.r = 5; ero.s = 5; updateErodeChip(); var tot = { removed: 0, worn: 0, fallen: 0, debris: 0, grooves: 0 }; beginBatch('Erosão');
    for (var k = 0; k < 3; k++) for (var x3 = 11; x3 < 38; x3 += 4) eroAdd(tot, eroDab([x3, 15, 32])); // perto da borda sul, a que aparece na captura
    endBatch(); ero.wear = ero.fall = true; updateErodeChip();
    Object.assign(cam, { yaw: 0.25, pitch: 0.3, dist: 40, tx: 24, ty: 9, tz: 26 }); updateCamera(); requestRender(); return 'sulcos ' + JSON.stringify(tot); })()`).then(console.log);
  await shot('erosao-sulcos.jpg');
  await p.click('#eroTab'); await p.waitForSelector('#eroOk');
  await (await p.$('#overlayRoot .dialog')).screenshot({ path: path.join(OUT, 'erosao-tabela.jpg'), type: 'jpeg', quality: 86 });
  console.log('ok erosao', errs); await b.close();
})();
