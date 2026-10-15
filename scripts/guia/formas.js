// Capturas das formas novas (cilindro, cone, pirâmide, cúpula, arco) e do balde para o guia:
// node scripts/guia/formas.js <url do editor> <pacote Bedrock .zip> <pasta de saída>
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');
const [URL, PACK, OUT] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  const S = [64, 32, 40], A = S[0] * S[2], proj = { v: 1, size: S, pal: ['grass_block'], rle: [1, A, 0, A * (S[1] - 1)] };
  await p.addInitScript(s => { if (!sessionStorage.getItem('x')) { sessionStorage.setItem('x', '1'); localStorage.setItem('bloco-a-bloco-v1', s); localStorage.setItem('bloco-a-bloco-measure', '0'); } }, JSON.stringify(proj));
  await p.goto(URL); await p.waitForTimeout(2500);
  await p.setInputFiles('#packIn', PACK);
  await p.waitForFunction(() => /blocos com textura/.test(document.getElementById('toast').textContent), null, { timeout: 300000 });
  const ev = s => p.evaluate(x => window.__bab.ev(x), s);
  const hide = async () => { await p.evaluate(() => document.getElementById('toast').classList.remove('show')); await p.waitForTimeout(600); };
  // uma forma de cada, com blocos diferentes
  await ev(`(function(){
    function put(type, hollow, a, b2, block) { shape2.type = type; shape2.hollow = hollow; var v = cellFromName(block); beginBatch(); shape2Cells(a, b2).forEach(function (c) { editSet(c[0], c[1], c[2], v); }); endBatch(); }
    put('cyl', true, [10, 1, 14], [14, 12, 14], 'stone_bricks');            // torre (cilindro oco)
    put('cone', false, [10, 13, 14], [15, 20, 14], 'spruce_planks');        // telhado da torre (cone)
    put('pyr', false, [22, 1, 8], [32, 1, 18], 'sandstone');                 // pirâmide
    put('dome', true, [44, 1, 14], [50, 1, 14], 'glass');                    // cúpula de vidro
    put('arch', false, [24, 1, 28], [34, 9, 28], 'quartz_block');            // arco
    shape2.type = 'cyl'; shape2.hollow = false;
    Object.assign(cam, { yaw: 0.35, pitch: 0.38, dist: 62, tx: 31, ty: 6, tz: 18 }); updateCamera(); requestRender();
  })()`);
  await p.keyboard.press('c'); await p.waitForTimeout(300);
  await p.mouse.move(1100, 700); await p.waitForTimeout(3000); await hide();
  await p.screenshot({ path: path.join(OUT, 'mais-formas.jpg'), type: 'jpeg', quality: 82, clip: { x: 0, y: 0, width: 972, height: 772 } });
  // balde: sala fechada, enche o piso por dentro
  await ev(`(function(){
    newWorld(32, 16, 24); var g = cellFromName('grass_block'), w = cellFromName('oak_planks'), l = cellFromName('oak_log');
    for (var x = 0; x < 32; x++) for (var z = 0; z < 24; z++) { gset(x, 0, z, g); blockCount++; }
    beginBatch();
    for (var x2 = 8; x2 <= 22; x2++) for (var y = 1; y <= 3; y++) { editSet(x2, y, 6, w); editSet(x2, y, 16, w); }
    for (var z2 = 6; z2 <= 16; z2++) for (var y2 = 1; y2 <= 3; y2++) { editSet(8, y2, z2, w); editSet(22, y2, z2, w); }
    for (var y3 = 1; y3 <= 3; y3++) [[8, 6], [22, 6], [8, 16], [22, 16]].forEach(function (c) { editSet(c[0], y3, c[1], l); });
    for (var x4 = 12; x4 <= 17; x4++) for (var z4 = 9; z4 <= 13; z4++) editSet(x4, 1, z4, cellFromName('cobblestone')); // um tapete no meio: o balde contorna
    endBatch(); verCounter++; dirtyAll(); changed();
    hotbar[0] = BY_JAVA.spruce_planks; selectSlot(0); setTool('fill');
    fillAt({ hit: [10, 0, 8], place: [10, 1, 8], normal: [0, 1, 0], d: [0, -1, 0] }, false);
    Object.assign(cam, { yaw: 0.5, pitch: 0.95, dist: 30, tx: 15, ty: 1, tz: 11 }); updateCamera(); requestRender();
  })()`);
  await p.mouse.move(1100, 700); await p.waitForTimeout(2500);
  await p.screenshot({ path: path.join(OUT, 'balde.jpg'), type: 'jpeg', quality: 82, clip: { x: 0, y: 54, width: 972, height: 718 } });
  console.log('ok formas', errs);
  await b.close();
})();
