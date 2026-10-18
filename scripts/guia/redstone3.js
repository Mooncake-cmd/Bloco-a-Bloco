// Capturas da etapa 3 da redstone para o guia: baú com armadilha aberto, atril virando a página, toca-discos com disco,
// para-raios atingido, trilho detector com carrinho, armadilha de linha disparada e sensores de luz (normal e
// invertido) pela hora do dia, cada um acendendo uma lâmpada; e a janela da hora do dia:
// node scripts/guia/redstone3.js <url do editor> <pacote Bedrock .zip> <pasta de saída>
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');
const [URL, PACK, OUT] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => { if (!sessionStorage.getItem('x')) { sessionStorage.setItem('x', '1'); localStorage.setItem('bloco-a-bloco-measure', '0'); localStorage.setItem('bloco-a-bloco-redstone', '1'); localStorage.removeItem('bloco-a-bloco-hora'); } });
  await p.goto(URL); await p.waitForTimeout(2500);
  await p.setInputFiles('#packIn', PACK);
  await p.waitForFunction(() => /blocos com textura/.test(document.getElementById('toast').textContent), null, { timeout: 300000 });
  const ev = s => p.evaluate(x => window.__bab.ev(x), s);
  const hide = async () => { await p.evaluate(() => document.getElementById('toast').classList.remove('show')); await p.waitForTimeout(600); };
  await ev(`(function(){ newWorld(22, 10, 12); setRsTime(6000, 0);
    window.S = function(l){ beginBatch(); l.forEach(function(e){ editSet(e[0],e[1],e[2], e[3]?cellFromName(e[3]):0); }); endBatch(); };
    var l = []; for (var x = 0; x < 22; x++) for (var z = 0; z < 12; z++) l.push([x, 0, z, 'smooth_stone']); S(l);
    // fileira de trás: baú com armadilha, atril, toca-discos, para-raios, cada um com uma lâmpada ao lado
    S([[2,1,3,'trapped_chest[facing=south]'],[3,1,3,'redstone_lamp'],[6,1,3,'lectern[facing=south]'],[7,1,3,'redstone_lamp'],
       [10,1,3,'jukebox'],[11,1,3,'redstone_lamp'],[14,1,3,'lightning_rod[facing=up]'],[15,1,3,'redstone_lamp'],
       [18,1,3,'daylight_detector'],[19,1,3,'redstone_wire'],[20,1,3,'redstone_lamp']]);
    // frente: trilho detector com trilhos energizados, armadilha de linha com lâmpadas, sensor invertido apagado
    S([[2,1,8,'detector_rail[shape=east_west]'],[3,1,8,'powered_rail[shape=east_west]'],[4,1,8,'powered_rail[shape=east_west]'],
       [7,1,8,'tripwire_hook[facing=east]'],[8,1,8,'tripwire'],[9,1,8,'tripwire'],[10,1,8,'tripwire'],[11,1,8,'tripwire_hook[facing=west]'],[7,1,9,'redstone_lamp'],[11,1,9,'redstone_lamp'],
       [18,1,8,'daylight_detector[inverted=true]'],[19,1,8,'redstone_wire'],[20,1,8,'redstone_lamp']]);
    useAt([2,1,3], false, null); useAt([6,1,3], false, null); useAt([6,1,3], false, null);
    beginBatch('disco'); rsFillSet(idx(10,1,3), 5, true); endBatch();
    useAt([14,1,3], false, null); useAt([2,1,8], false, null); useAt([9,1,8], false, null);
    rsStop(); // congela os pulsos para a foto
    setTool('use'); Object.assign(cam,{yaw:0.18,pitch:0.6,dist:21,tx:11.5,ty:1,tz:6}); updateCamera(); requestRender(); })()`);
  await p.mouse.move(1270, 790); await p.waitForTimeout(3000); await hide();
  await p.screenshot({ path: path.join(OUT, 'redstone-fontes.jpg'), type: 'jpeg', quality: 82, clip: { x: 0, y: 0, width: 972, height: 772 } });
  await ev(`openTime()`); await p.waitForTimeout(400);
  const d = await p.evaluate(() => { const r = document.querySelector('.dialog').getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; });
  await p.screenshot({ path: path.join(OUT, 'redstone-hora.jpg'), type: 'jpeg', quality: 85, clip: { x: d[0] - 8, y: d[1] - 8, width: d[2] + 16, height: d[3] + 16 } });
  console.log('ok redstone3', d.map(Math.round), errs);
  await b.close();
})();
