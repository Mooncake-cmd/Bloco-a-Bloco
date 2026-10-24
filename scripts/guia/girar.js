// Capturas do Girar com precisão: node scripts/guia/girar.js <url do editor> <pacote Bedrock .zip> <pasta de saída>
// A casa de exemplo (sem a árvore) num espaço maior: a prévia do giro de 30° no Y com o aviso aberto (girar-previa.jpg) e o resultado,
// com uma torre ao lado inclinada 12° no Z (girar-pronto.jpg).
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
  const hide = () => p.evaluate(() => document.getElementById('toast').classList.remove('show'));
  await ev(`(function(){ resizeWorld(40, 24, 28); beginBatch('chão'); for (var z = 0; z < 28; z++) for (var x = 0; x < 40; x++) if (!gget(x, 0, z)) editSet(x, 0, z, cellFromName('grass_block')); endBatch();
    // tira a árvore (copa e tronco) e marca a casa
    var tl = [1e9, 1e9], th = [-1, -1]; forEachBlock(function (x, y, z, v) { if (/_leaves$/.test(BLOCKS[cellBlock(v)].java)) { tl = [Math.min(tl[0], x), Math.min(tl[1], z)]; th = [Math.max(th[0], x), Math.max(th[1], z)]; } });
    var tc = [(tl[0] + th[0]) >> 1, (tl[1] + th[1]) >> 1]; beginBatch('árvore'); forEachBlock(function (x, y, z, v) { var n = BLOCKS[cellBlock(v)].java; if (/_leaves$/.test(n) || (/_log/.test(n) && Math.abs(x - tc[0]) <= 1 && Math.abs(z - tc[1]) <= 1)) editSet(x, y, z, 0); }); endBatch();
    var lo = [1e9, 1e9, 1e9], hi = [-1, -1, -1]; forEachBlock(function (x, y, z, v) { if (y < 1 || !/planks|cobblestone|log|glass|door|stairs|slab|torch|lantern/.test(BLOCKS[cellBlock(v)].java) || x > 17) return; lo = [Math.min(lo[0], x), Math.min(lo[1], y), Math.min(lo[2], z)]; hi = [Math.max(hi[0], x), Math.max(hi[1], y), Math.max(hi[2], z)]; });
    setTool('select'); sel = selFrom(lo, hi); selRefresh(); tiltOpen(); tiltSet(1, 30);
    Object.assign(cam, { yaw: 0.5, pitch: 0.55, dist: 40, tx: 14, ty: 3, tz: 12 }); updateCamera(); requestRender(); return JSON.stringify(sel); })()`).then(r => console.log('casa', r));
  await p.mouse.move(5, 795); await hide(); await p.waitForTimeout(1500);
  await p.screenshot({ path: path.join(OUT, 'girar-previa.jpg'), type: 'jpeg', quality: 84, clip: { x: 0, y: 54, width: 972, height: 718 } });
  console.log('aviso:', await ev("document.getElementById('tiltChip').textContent"));
  await p.keyboard.press('Enter'); await p.waitForTimeout(300);
  await ev(`(function(){ beginBatch('torre'); for (var y = 1; y <= 14; y++) for (var z = 10; z < 15; z++) for (var x = 30; x < 35; x++) { var e = x === 30 || x === 34 || z === 10 || z === 14; if (e) editSet(x, y, z, cellFromName(y % 4 === 0 ? 'polished_andesite' : 'stone_bricks')); } endBatch();
    sel = selFrom([30, 1, 10], [34, 14, 14]); tiltOpen(); tiltSet(2, 12); tiltApply(); sel = null; selRefresh();
    Object.assign(cam, { yaw: 0.35, pitch: 0.42, dist: 44, tx: 20, ty: 5, tz: 13 }); updateCamera(); requestRender(); })()`);
  await p.mouse.move(5, 795); await hide(); await p.waitForTimeout(1500);
  await p.screenshot({ path: path.join(OUT, 'girar-pronto.jpg'), type: 'jpeg', quality: 84, clip: { x: 0, y: 54, width: 972, height: 718 } });
  console.log('ok girar', errs); await b.close();
})();
