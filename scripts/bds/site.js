// Abre no site um mundo gerado pelo servidor oficial do Bedrock, constrói os testes (blocos com estados e circuitos de redstone em y = 100),
// exporta desligado e ligado e grava os comandos setblock que ligam as alavancas no servidor (ver README, "Teste com o servidor oficial"):
// node scripts/bds/site.js <url do editor> <mundo.mcworld> <pasta de saída>
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs'), path = require('path');
const [URL, WORLD, OUT] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(URL); await p.waitForTimeout(2500);
  const ev = s => p.evaluate(x => window.__bab.ev(x), s);
  await p.click('#menu summary'); await p.click('#worldBtn').catch(() => {});
  await p.setInputFiles('#worldIn', WORLD);
  await p.waitForFunction(() => /chunks já gerados/.test((document.getElementById('wmInfo') || {}).textContent || ''), null, { timeout: 120000 });
  await p.selectOption('#wmS', '64'); await p.fill('#wmX', '32'); await p.fill('#wmZ', '32'); await p.dispatchEvent('#wmX', 'input');
  console.log(await p.textContent('#wmInfo'));
  await p.click('#wmGo');
  await p.waitForFunction(() => /Área carregada/.test(document.getElementById('toast').textContent), null, { timeout: 120000 });
  console.log('área', await ev('JSON.stringify(wio.area)'));
  const Y = 164; // y do mundo 100
  const build = await ev(`(function(){
    var C = function (n, o) { var bi = BY_JAVA[n], b = BLOCKS[bi]; if (bi == null) throw new Error('sem bloco ' + n);
      if (b.shape) return mkCell(bi, stateIndex(b, o || {}));
      if (b.ori) { var k = b.ori.o.findIndex(function (q) { return q[0] === (o || {})[b.ori.k]; }); return mkCell(bi, Math.max(0, k)); }
      return mkCell(bi); };
    var Y = ${Y}, L = [], put = function (x, y, z, n, o) { L.push([x, y, z, n ? C(n, o) : 0]); };
    for (var x = 0; x < 48; x++) for (var z = 2; z < 44; z++) { put(x, Y - 1, z, 'smooth_stone'); for (var y = Y; y < Y + 6; y++) put(x, y, z, null); }
    // fileira de blocos parados (z = 4 e 7)
    var S = [['oak_stairs',{facing:'north'}],['oak_stairs',{facing:'east'}],['oak_stairs',{facing:'south',half:'top'}],['stone_brick_slab',{type:'bottom'}],['stone_brick_slab',{type:'top'}],['stone_brick_slab',{type:'double'}],
      ['oak_log',{axis:'x'}],['oak_log',{axis:'z'}],['chest',{facing:'south'}],['furnace',{facing:'east'}],['carved_pumpkin',{facing:'west'}],['white_glazed_terracotta',{facing:'north'}],
      ['hopper',{facing:'east'}],['observer',{facing:'up'}],['dispenser',{facing:'down'}],['oak_trapdoor',{facing:'east',half:'top'}],['lantern',{}],['anvil',{facing:'north'}],['glass',{}],['bricks',{}]];
    S.forEach(function (s, i) { put(2 + i * 2, Y, 4, s[0], s[1]); });
    var T = [['oak_fence',{}],['oak_fence',{}],['cobblestone_wall',{}],['glass_pane',{}],['glass_pane',{}],['torch',{}],['ladder',{facing:'south'}],['white_bed',{facing:'east',part:'foot'}],['white_bed',{facing:'east',part:'head'}],['campfire',{facing:'south'}],['bell',{facing:'north'}],['candle',{candles:'3'}],['oak_sign',{rotation:'4'}],['water',{level:'0'}]];
    T.forEach(function (s, i) { put(2 + i, Y, 7, s[0], s[1]); });
    put(14, Y, 8, 'stone'); // apoio da escada de mão em (8,7)? escada fica em x=8 encostada em z=8
    // circuitos (alavancas desligadas)
    var LV = [];
    var lever = function (x, z, o) { put(x, Y, z, 'lever', Object.assign({ face: 'floor', facing: 'east', powered: 'false' }, o || {})); LV.push([x, Y, z]); };
    lever(2, 14); for (var x1 = 3; x1 <= 18; x1++) put(x1, Y, 14, 'redstone_wire'); put(19, Y, 14, 'redstone_lamp');
    put(5, Y, 17, 'stone'); lever(4, 17, { face: 'wall', facing: 'west' }); put(6, Y, 17, 'redstone_wall_torch', { facing: 'east' }); put(6, Y + 1, 17, 'redstone_lamp');
    lever(2, 20); put(3, Y, 20, 'repeater', { facing: 'west', delay: '4' }); put(4, Y, 20, 'redstone_lamp');
    lever(2, 23); put(3, Y, 23, 'sticky_piston', { facing: 'east' }); put(4, Y, 23, 'oak_planks'); put(5, Y, 23, 'bricks'); put(6, Y, 23, 'glass'); put(7, Y - 1, 23, 'grass_block'); put(7, Y, 23, 'poppy');
    put(3, Y, 26, 'oak_door', { facing: 'south', half: 'lower' }); put(3, Y + 1, 26, 'oak_door', { facing: 'south', half: 'upper' }); lever(4, 26);
    put(2, Y, 29, 'redstone_block'); put(3, Y, 29, 'comparator', { facing: 'west', mode: 'subtract' }); for (var x2 = 4; x2 <= 6; x2++) put(x2, Y, 29, 'redstone_wire');
    put(3, Y, 30, 'redstone_wire'); put(3, Y, 31, 'redstone_wire'); lever(4, 31);
    lever(2, 34); for (var x3 = 3; x3 <= 14; x3++) put(x3, Y, 34, 'powered_rail', { shape: 'east_west' });
    put(2, Y, 37, 'oak_trapdoor', { facing: 'north' }); lever(3, 37);
    lever(2, 40); put(3, Y, 40, 'redstone_wire'); put(4, Y, 40, 'stone_bricks'); put(4, Y + 1, 40, 'redstone_torch'); put(4, Y + 2, 40, 'redstone_lamp');
    beginBatch(); L.forEach(function (e) { editSet(e[0], e[1], e[2], e[3]); }); endBatch();
    return JSON.stringify(LV); })()`);
  const LV = JSON.parse(build);
  await p.waitForTimeout(3000); // a simulação acomoda o estado desligado (tochas acesas etc.)
  const exportWorld = async (name) => {
    const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 120000 }), ev('wioExport()')]);
    await dl.saveAs(path.join(OUT, name)); console.log('exportado', name);
  };
  // estado esperado (Bedrock) da região, pelo próprio site
  const snap = () => ev(`(function(){ var o = {}; for (var x = 0; x < 48; x++) for (var z = 2; z < 44; z++) for (var y = ${Y} - 1; y < ${Y} + 4; y++) { var v = gget(x, y, z); if (!v) continue; var bi = cellBlock(v), b = BLOCKS[bi], e;
      if (b.shape) { e = shapeExport(b, cellOri(v), x, y, z); o[[x, y - 64, z].join(',')] = [e.bn, Object.keys(e.bs).reduce(function (q, k) { q[k] = e.bs[k].v; return q; }, {})]; }
      else o[[x, y - 64, z].join(',')] = [b.bedrock, null]; } return JSON.stringify(o); })()`);
  fs.writeFileSync(path.join(OUT, 'site-off.json'), await snap());
  await exportWorld('editado-off.mcworld');
  // comandos para ligar as alavancas no servidor: o estado Bedrock da alavanca ligada
  const cmds = await ev(`(function(){ return JSON.stringify(${JSON.stringify(LV)}.map(function (q) { var v = gget(q[0], q[1], q[2]), b = BLOCKS[cellBlock(v)], o = stateProps(b, cellOri(v)); o.powered = 'true'; var e = shapeExport(b, stateIndex(b, o), q[0], q[1], q[2]);
    var st = Object.keys(e.bs).map(function (k) { var s = e.bs[k]; return '"' + k + '"=' + (s.t === 'string' ? '"' + s.v + '"' : s.t === 'byte' ? (s.v ? 'true' : 'false') : s.v); }).join(',');
    return 'setblock ' + q[0] + ' ' + (q[1] - 64) + ' ' + q[2] + ' minecraft:' + e.bn + ' [' + st + ']'; })); })()`);
  fs.writeFileSync(path.join(OUT, 'cmds-on.json'), cmds);
  for (const q of LV) await ev(`useAt([${q.join(',')}], false, null)`);
  await p.waitForTimeout(5000);
  fs.writeFileSync(path.join(OUT, 'site-on.json'), await snap());
  await exportWorld('editado-on.mcworld');
  console.log('erros', errs);
  await b.close();
})();
