// Capturas da redstone funcionando para o guia: o mesmo circuito desligado e ligado (alavanca, pó com a força caindo,
// repetidor, lâmpadas, pistão grudento, porta e uma tocha invertendo o sinal):
// node scripts/guia/redstone.js <url do editor> <pacote Bedrock .zip> <pasta de saída>
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');
const [URL, PACK, OUT] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => { if (!sessionStorage.getItem('x')) { sessionStorage.setItem('x', '1'); localStorage.setItem('bloco-a-bloco-measure', '0'); localStorage.setItem('bloco-a-bloco-redstone', '1'); } });
  await p.goto(URL); await p.waitForTimeout(2500);
  await p.setInputFiles('#packIn', PACK);
  await p.waitForFunction(() => /blocos com textura/.test(document.getElementById('toast').textContent), null, { timeout: 300000 });
  const ev = s => p.evaluate(x => window.__bab.ev(x), s);
  const hide = async () => { await p.evaluate(() => document.getElementById('toast').classList.remove('show')); await p.waitForTimeout(600); };
  await ev(`(function(){ newWorld(28, 12, 22);
    var C = function (n, o) { var bi = BY_JAVA[n], b = BLOCKS[bi]; return b.shape ? mkCell(bi, stateIndex(b, o || {})) : mkCell(bi); };
    var l = [], put = function (x, y, z, n, o) { l.push([x, y, z, C(n, o)]); };
    for (var x = 0; x < 28; x++) for (var z = 0; z < 22; z++) put(x, 0, z, 'smooth_stone');
    put(3, 1, 10, 'lever', { face: 'floor', facing: 'east' });
    for (var x2 = 4; x2 <= 13; x2++) put(x2, 1, 10, 'redstone_wire');          // a força cai de 15 até 6
    put(14, 1, 10, 'repeater', { facing: 'west', delay: '2' });               // renova para 15
    for (var x3 = 15; x3 <= 19; x3++) put(x3, 1, 10, 'redstone_wire');
    put(20, 1, 10, 'redstone_lamp');
    for (var z2 = 11; z2 <= 14; z2++) put(8, 1, z2, 'redstone_wire');         // ramo para o pistão
    put(8, 1, 15, 'sticky_piston', { facing: 'south' }); put(8, 1, 16, 'oak_planks'); put(8, 1, 17, 'oak_planks');
    for (var z3 = 9; z3 >= 6; z3--) put(11, 1, z3, 'redstone_wire');           // ramo para a porta
    put(11, 1, 5, 'oak_door', { facing: 'south', half: 'lower' }); put(11, 2, 5, 'oak_door', { facing: 'south', half: 'upper' });
    put(10, 1, 4, 'stone_bricks'); put(12, 1, 4, 'stone_bricks'); put(10, 2, 4, 'stone_bricks'); put(12, 2, 4, 'stone_bricks'); put(11, 3, 4, 'stone_bricks'); put(10, 3, 4, 'stone_bricks'); put(12, 3, 4, 'stone_bricks');
    put(16, 1, 11, 'redstone_wire'); put(16, 1, 12, 'stone_bricks'); put(16, 2, 12, 'redstone_torch'); put(16, 3, 12, 'redstone_lamp'); // o pó aponta para o bloco: a tocha em cima apaga (inversor) e a lâmpada em cima dela também
    beginBatch(); l.forEach(function (e) { editSet(e[0], e[1], e[2], e[3]); }); endBatch();
    setTool('use'); Object.assign(cam, { yaw: -0.5, pitch: 0.72, dist: 23, tx: 12, ty: 1, tz: 11 }); updateCamera(); requestRender(); })()`);
  await p.mouse.move(1100, 700); await p.waitForTimeout(2500); await hide();
  await p.screenshot({ path: path.join(OUT, 'redstone-desligada.jpg'), type: 'jpeg', quality: 82, clip: { x: 0, y: 0, width: 972, height: 772 } });
  await ev(`useAt([3, 1, 10], false, null)`); await p.waitForTimeout(1200);
  await p.mouse.move(1100, 700); await p.waitForTimeout(2000); await hide();
  await p.screenshot({ path: path.join(OUT, 'redstone-ligada.jpg'), type: 'jpeg', quality: 82, clip: { x: 0, y: 0, width: 972, height: 772 } });
  console.log('ok redstone', errs);
  await b.close();
})();
