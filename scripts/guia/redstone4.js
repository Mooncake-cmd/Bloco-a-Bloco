// Capturas da etapa 4 da redstone para o guia (sensor de sculk, ejetor/liberador/funil, bloco de comando, janela de conteúdo, força do pó):
// node scripts/guia/redstone4.js <url do editor> <pacote Bedrock .zip> <pasta de saída>
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');
const [URL, PACK, OUT] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  const S = [32, 12, 32], A = S[0] * S[2], proj = { v: 1, size: S, pal: ['smooth_stone'], rle: [1, A, 0, A * (S[1] - 1)] };
  await p.addInitScript(s => { if (!sessionStorage.getItem('x')) { sessionStorage.setItem('x', '1'); localStorage.setItem('bloco-a-bloco-v1', s); localStorage.setItem('bloco-a-bloco-measure', '0'); localStorage.setItem('bloco-a-bloco-redstone', '1'); } }, JSON.stringify(proj));
  await p.goto(URL); await p.addStyleTag({ content: '#tabbar{display:none}' }); await p.waitForTimeout(2500); // as capturas recortam a partir da barra de ferramentas (a barra das abas tem a dela: abas.js)
  await p.setInputFiles('#packIn', PACK);
  await p.waitForFunction(() => /blocos com textura/.test(document.getElementById('toast').textContent), null, { timeout: 300000 });
  if (await p.evaluate(() => document.getElementById('measTbtn').getAttribute('aria-pressed') === 'true')) await p.click('#measTbtn');
  const ev = s => p.evaluate(x => window.__bab.ev(x), s);
  const hide = () => p.evaluate(() => document.getElementById('toast').classList.remove('show'));
  const build = (cells) => ev(`(function(){ beginBatch(); ${JSON.stringify(cells)}.forEach(function (e) { var v = e[3] ? cellFromName(e[3]) : 0; if (e[3] && !v) throw new Error('bloco ' + e[3]); editSet(e[0], e[1], e[2], v); }); endBatch(); setTool('pick'); })()`);
  const clear = () => ev(`(function(){ beginBatch(); forEachBlock(function (x, y, z) { if (y > 0) editSet(x, y, z, 0); }); endBatch(); rsStop(); projClear(); })()`);
  // 1. sensor de sculk: alavanca no meio; um sensor perto (já ligado), outro mais longe (a vibração no ar), um atrás da lã
  await build([[14, 1, 16, 'lever[face=floor,facing=north]'],
    [12, 1, 16, 'sculk_sensor'], [12, 1, 17, 'redstone_wire'], [12, 1, 18, 'redstone_lamp'],
    [21, 1, 16, 'sculk_sensor'], [21, 1, 17, 'redstone_wire'], [21, 1, 18, 'redstone_lamp'],
    [14, 1, 11, 'sculk_sensor'], [14, 1, 10, 'redstone_wire'], [14, 1, 9, 'redstone_lamp'],
    [13, 1, 13, 'white_wool'], [14, 1, 13, 'white_wool'], [15, 1, 13, 'white_wool'], [13, 2, 13, 'white_wool'], [14, 2, 13, 'white_wool'], [15, 2, 13, 'white_wool']]);
  await ev(`rsStop(); Object.assign(cam, { yaw: 0.25, pitch: 0.62, dist: 17, tx: 16, ty: 1, tz: 15 }); updateCamera(); requestRender();`);
  await p.waitForTimeout(400);
  await ev(`rsSetPaused(true); useAt([14, 1, 16], false, null); rsStep(3)`); // pausado: a vibração para o sensor de longe fica no meio do caminho
  await p.waitForTimeout(500); await hide();
  await p.screenshot({ path: path.join(OUT, 'redstone-sculk.jpg'), type: 'jpeg', quality: 85, clip: { x: 0, y: 54, width: 972, height: 718 } });
  console.log('sculk', await ev(`[cellName(gget(12,1,16)), cellName(gget(21,1,16)), cellName(gget(14,1,11))].join(' | ')`));
  await ev(`rsSetPaused(false)`); await p.waitForTimeout(2500);
  // 2. liberador -> alvo -> lâmpada; ejetor -> item na placa de madeira -> lâmpada; baú -> funil -> baú com comparador
  await clear();
  await build([[6, 2, 10, 'dispenser[facing=east]'], [6, 3, 10, 'lever[face=floor,facing=north]'], [13, 2, 10, 'target'], [13, 3, 10, 'redstone_lamp'],
    [6, 1, 10, 'stone_bricks'], [13, 1, 10, 'stone_bricks'],
    [6, 2, 15, 'dropper[facing=east]'], [6, 3, 15, 'lever[face=floor,facing=north]'], [6, 1, 15, 'stone_bricks'], [8, 1, 15, 'oak_pressure_plate'], [9, 1, 15, 'oak_pressure_plate'], [10, 1, 15, 'oak_pressure_plate'], [11, 1, 15, 'redstone_wire'], [12, 1, 15, 'redstone_lamp'],
    [6, 3, 20, 'chest[facing=south]'], [6, 2, 20, 'hopper[facing=east]'], [7, 2, 20, 'chest[facing=south]'], [6, 1, 20, 'stone_bricks'], [7, 1, 20, 'stone_bricks'], [8, 2, 20, 'comparator[facing=west]'], [8, 1, 20, 'stone_bricks'], [9, 2, 20, 'redstone_wire'], [9, 1, 20, 'stone_bricks'], [10, 2, 20, 'redstone_lamp'], [10, 1, 20, 'stone_bricks']]);
  await ev(`(function(){ rsFillSet(idx(6,2,10), 16 + 16 + 4096 * 1, false); rsFillSet(idx(6,2,15), 16 + 32, false); rsFillSet(idx(6,3,20), 16 + 40, false); rsInvChanged([6,3,20]); rsSettle();
    Object.assign(cam, { yaw: 0.55, pitch: 0.55, dist: 18, tx: 9, ty: 2, tz: 15.5 }); updateCamera(); requestRender(); })()`);
  await ev(`useAt([6, 3, 15], false, null)`); await p.waitForTimeout(1500);
  await ev(`useAt([6, 3, 10], false, null)`); await p.waitForTimeout(450); await hide();
  await p.screenshot({ path: path.join(OUT, 'redstone-ejetor.jpg'), type: 'jpeg', quality: 85, clip: { x: 0, y: 54, width: 972, height: 718 } });
  console.log('ejetor', await ev(`[cellName(gget(13,2,10)), cellName(gget(13,3,10)), [8,9,10].map(function(x){return cellName(gget(x,1,15))}).join(','), cellName(gget(12,1,15)), 'baú ' + rsLevel(7,2,20,'chest'), cellName(gget(10,2,20))].join(' | ')`));
  // 3. janela de conteúdo do liberador
  await ev(`useAt([6, 2, 10], false, null)`); await p.waitForTimeout(400);
  let dlg = await p.$('.dialog'); await dlg.screenshot({ path: path.join(OUT, 'redstone-conteudo.jpg'), type: 'jpeg', quality: 85 });
  await p.click('#fillNo');
  // 4. bloco de comando: impulso que põe ouro e uma corrente condicional
  await clear();
  await build([[10, 1, 14, 'command_block[facing=east]'], [11, 1, 14, 'chain_command_block[facing=east,conditional=true]'], [10, 1, 13, 'stone_button[face=floor,facing=north]']]);
  await ev(`(function(){ var a = rsCmdGet(idx(10,1,14)); a.c = 'setblock ~ ~2 ~ gold_block'; var c2 = rsCmdGet(idx(11,1,14)); c2.c = 'say Ouro colocado!'; c2.auto = true;
    Object.assign(cam, { yaw: 0.5, pitch: 0.45, dist: 11, tx: 11, ty: 1.5, tz: 14 }); updateCamera(); requestRender(); })()`);
  await ev(`useAt([10, 1, 14], false, null)`); await p.waitForTimeout(400);
  await ev(`$('cmdRun').click()`); await p.waitForTimeout(300);
  dlg = await p.$('.dialog'); await dlg.screenshot({ path: path.join(OUT, 'redstone-comando.jpg'), type: 'jpeg', quality: 85 });
  console.log('comando', await ev(`$('cmdOut').textContent`), await ev(`cellName(gget(10,3,14))`), errs);
  // 5. a força do pó: uma linha com um ramal e um repetidor, os números ligados
  await p.click('#cmdNo'); await clear();
  await build([[4, 1, 12, 'lever[face=floor,facing=north]'], ...[5, 6, 7, 8, 9, 10, 11, 12, 13].map(function (x) { return [x, 1, 12, 'redstone_wire']; }), [9, 1, 13, 'redstone_wire'], [9, 1, 14, 'redstone_wire'], [9, 1, 15, 'redstone_wire'],
    [14, 1, 12, 'repeater[facing=west]'], [15, 1, 12, 'redstone_wire'], [16, 1, 12, 'redstone_wire'], [17, 1, 12, 'redstone_wire'], [18, 1, 12, 'redstone_lamp']]);
  await ev(`(function(){ setRsNums(true); Object.assign(cam, { yaw: 0.2, pitch: 0.85, dist: 13, tx: 11, ty: 1, tz: 13 }); updateCamera(); requestRender(); })()`);
  await ev(`useAt([4, 1, 12], false, null)`); await p.waitForTimeout(900); await hide();
  await p.screenshot({ path: path.join(OUT, 'redstone-forca.jpg'), type: 'jpeg', quality: 85, clip: { x: 0, y: 54, width: 972, height: 718 } });
  await ev('setRsNums(false)');
  await b.close();
})();
