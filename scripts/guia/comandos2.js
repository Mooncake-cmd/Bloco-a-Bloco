// Capturas e conferência dos comandos de terreno (naturalize, smooth, overlay, replace, drain, find):
// node scripts/guia/comandos2.js <url do editor> <pacote Bedrock .zip> <pasta de saída>
// Uma cena de pedra pura (morros em degraus, um lago, uma saliência, uma casa com piso de pedra e um baú), cortada ao
// meio para mostrar as camadas. Faz naturalize-antes.jpg / naturalize-depois.jpg (camadas, com metade da área como
// deserto), smooth.jpg (antes e depois lado a lado não: o resultado), overlay.jpg (neve) e imprime as conferências.
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
  const shot = async (nome) => { await p.mouse.move(5, 795); await p.evaluate(() => document.getElementById('toast').classList.remove('show')); await p.waitForFunction(() => window.__bab.meshInfo().naFila === 0); await p.waitForTimeout(1200); await p.screenshot({ path: path.join(OUT, nome), type: 'jpeg', quality: 84, clip: { x: 0, y: 54, width: 972, height: 718 } }); };
  const cena = `(function(){ newWorld(48, 40, 40); sym.on = [false,false,false]; var S = cellFromName('stone'); beginBatch('cena');
    for (var z = 0; z < 40; z++) for (var x = 0; x < 48; x++) {
      var h = 8 + Math.round(4 * Math.sin(x / 6) + 3 * Math.cos(z / 5)); if (x > 30 && x < 42 && z > 6 && z < 18) h = 5; // vale do lago
      h = Math.floor(h / 2) * 2; // degraus de 2, para o smooth ter o que fazer
      for (var y = 0; y <= h; y++) editSet(x, y, z, S);
      if (x > 30 && x < 42 && z > 6 && z < 18) for (var yw = h + 1; yw <= 9; yw++) editSet(x, yw, z, cellFromName('water'));
    }
    for (var x2 = 6; x2 < 14; x2++) for (var z2 = 26; z2 < 34; z2++) editSet(x2, 17, z2, S); // saliência fina
    for (var x3 = 18; x3 < 25; x3++) for (var z3 = 24; z3 < 31; z3++) { editSet(x3, 14, z3, S); for (var y3 = 15; y3 < 19; y3++) if (x3 === 18 || x3 === 24 || z3 === 24 || z3 === 30) editSet(x3, y3, z3, cellFromName('oak_planks')); editSet(x3, 19, z3, cellFromName('oak_planks')); }
    editSet(20, 15, 26, cellFromName('chest')); editSet(4, 10, 4, cellFromName('chest')); editSet(44, 12, 36, cellFromName('chest'));
    endBatch(); return blockCount; })()`;
  console.log('cena:', await ev(cena));
  // corte: esconde a metade da frente (z < 20) com hide numa seleção, para ver as camadas
  const corte = `(function(){ sel = selFrom([0, 0, 0], [47, 39, 19]); cmdRun('hide stone grass_block dirt sand gravel sandstone water snow short_grass'); sel = null; selRefresh(); Object.assign(cam, { yaw: 0.35, pitch: 0.3, dist: 62, tx: 24, ty: 8, tz: 22 }); updateCamera(); requestRender(); })()`;
  await ev(corte); await shot('naturalize-antes.jpg'); await ev("cmdRun('unhide all')");
  // metade leste vira deserto (bioma pintado), e naturalize
  await ev(`(function(){ var d = (BIOMES.filter(function (b) { return b.n === 'desert'; })[0] || {}).id; for (var z = 0; z < 40; z++) for (var x = 26; x < 48; x++) bioSet(x, z, d); })()`);
  console.log('naturalize:', await ev(`cmdRun('naturalize').msg`));
  console.log('conferência:', await ev(`(function(){ var c = function (x, z) { var o = []; for (var y = 24; y >= 0; y--) { var v = gget(x, y, z); if (v) o.push(y + ':' + cellName(v).replace(/\\[.*/, '')); if (o.length >= 6) break; } return o.join(' '); };
    return 'grama/terra: ' + c(10, 10) + ' || deserto: ' + c(30, 30) + ' || lago: ' + c(36, 12) + ' || sob a saliência: ' + c(9, 29) + ' || piso da casa: ' + cellName(gget(21, 14, 27)); })()`));
  await ev(corte); await shot('naturalize-depois.jpg'); await ev("cmdRun('unhide all')");
  // smooth
  const deg = `(function(){ var m = 0; for (var z = 1; z < 39; z++) for (var x = 1; x < 25; x++) { var h = function (X, Z) { for (var y = 30; y >= 0; y--) if (gget(X, y, Z) && cmdNat(cellBlock(gget(X, y, Z)))) return y; return 0; }; m = Math.max(m, Math.abs(h(x, z) - h(x + 1, z))); } return m; })()`;
  const d0 = await ev(deg);
  console.log('smooth:', await ev(`(function(){ sel = selFrom([0, 0, 0], [25, 30, 39]); var r = cmdRun('smooth 3'); sel = null; selRefresh(); return r.msg; })()`), '| maior degrau', d0, '→', await ev(deg), '| piso da casa:', await ev("cellName(gget(21, 14, 27))"));
  await ev(`(function(){ Object.assign(cam, { yaw: 0.6, pitch: 0.42, dist: 62, tx: 24, ty: 8, tz: 20 }); updateCamera(); requestRender(); })()`); await shot('smooth.jpg');
  // overlay de neve, replace, find, drain
  console.log('overlay:', await ev(`cmdRun('overlay snow').msg`), '| neve no lago?', await ev("gget(36, 10, 12) ? cellName(gget(36, 10, 12)) : 'não'"));
  await shot('overlay.jpg');
  console.log('replace:', await ev(`(function(){ sel = selFrom([18, 14, 24], [24, 19, 30]); var r = cmdRun('REPLACE oak_planks 60%stripped_oak_wood,40%oak_planks'); sel = null; selRefresh(); return r.msg; })()`));
  console.log('find:', await ev(`(function(){ cam.tx = 0; cam.ty = 0; cam.tz = 0; var a = cmdRun('find chest').msg; var b = cmdRun('find').msg; var c = cmdRun('find chest').msg; var d = cmdRun('find chest').msg; return [a, b, c, d].join(' | '); })()`));
  console.log('drain:', await ev(`cmdRun('drain agua').msg`), '| água sobrando:', await ev(`(function(){ var n = 0; forEachBlock(function (x, y, z, v) { if (cmdJ(v) === 'water') n++; }); return n; })()`));
  console.log('desfazer drain:', await ev(`(function(){ undo(); var n = 0; forEachBlock(function (x, y, z, v) { if (cmdJ(v) === 'water') n++; }); return n + ' de água de volta'; })()`));
  console.log('erros de uso:', await ev(`[cmdRun('replace stone').err, cmdRun('overlay').err, cmdRun('smooth 50').err, cmdRun('drain mel').err, cmdRun('naturalize pedra_x').err].join(' | ')`));
  console.log('ok comandos2', errs); await b.close();
})();
