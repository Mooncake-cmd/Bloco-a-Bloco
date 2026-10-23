// Capturas do Pincel de campo para o guia (tela limpa, tema escuro): node scripts/guia/campo.js <url do editor> <pacote Bedrock .zip> <pasta de saída>
// Cada forma é feita com o pincel de verdade (fld + fcur + fieldRun), com os ajustes que o guia descreve.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');
const [URL, PACK, OUT] = process.argv.slice(2);
const S = [112, 72, 112], C = [56, 30, 56];
const DISK = ['sea_lantern', 'pearlescent_froglight', 'glowstone', 'ochre_froglight', 'orange_concrete', 'magma_block', 'red_concrete', 'red_nether_bricks', 'blackstone'];
const BASE = { tilt: 0, ri: 30, T: 3, taper: true, hollow: false, a0: 0, a1: 360, arms: 3, twist: 1.9, depth: 20, pat: 'full', gap: 4, spokes: 16, axis: 'r', dither: true, inv: false, shift: 0, streak: 0, stw: 0.35, dens: 100, empty: false };
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  const A = S[0] * S[2];
  await p.addInitScript(s => { if (!sessionStorage.getItem('x')) { sessionStorage.setItem('x', '1'); localStorage.setItem('bloco-a-bloco-v1', s); localStorage.setItem('bloco-a-bloco-measure', '0'); localStorage.setItem('bloco-a-bloco-theme', 'dark'); localStorage.removeItem('bloco-a-bloco-campo'); } }, JSON.stringify({ v: 1, size: S, pal: ['stone'], rle: [0, A * S[1]] }));
  await p.goto(URL); await p.waitForTimeout(2500);
  await p.setInputFiles('#packIn', PACK);
  await p.waitForFunction(() => /blocos com textura/.test(document.getElementById('toast').textContent), null, { timeout: 300000 });
  if (await p.evaluate(() => document.getElementById('measTbtn').getAttribute('aria-pressed') === 'true')) await p.click('#measTbtn');
  const ev = s => p.evaluate(x => window.__bab.ev(x), s);
  await p.click('[data-tool="field"]');
  await p.keyboard.press('Tab'); await p.waitForTimeout(300); // tela limpa
  const camDir = c => { const cp = Math.cos(c.pitch); return [cp * Math.sin(c.yaw), Math.sin(c.pitch), cp * Math.cos(c.yaw)]; };
  // uma pincelada: ajustes, centro, normal do plano e raio
  const stroke = (o, c, n0, R) => ev(`(function(){ Object.assign(fld, ${JSON.stringify(Object.assign({}, BASE, o))}); fcur = { c: ${JSON.stringify(c.map(v => v + 0.5))}, n0: ${JSON.stringify(n0)}, F: fieldFrame(${JSON.stringify(n0)}, fld.tilt), R: ${R}, fixed: true }; fieldRun(); return blockCount; })()`);
  const clear = () => ev('(function(){ var l=[]; forEachBlock(function(x,y,z){ l.push([x,y,z,null]); }); window.__bab.batchSet(l); })()');
  const shot = async (name, c) => {
    await p.evaluate(c => { Object.assign(window.__bab.cam, c); window.__bab.update(); }, c);
    await p.evaluate(() => document.getElementById('toast').classList.remove('show'));
    await p.mouse.move(5, 795); await p.waitForFunction(() => window.__bab.meshInfo().naFila === 0, null, { timeout: 300000, polling: 500 }); await p.waitForTimeout(1200);
    await p.screenshot({ path: path.join(OUT, name + '.jpg'), type: 'jpeg', quality: 84 });
    console.log('ok', name, await ev('blockCount'));
  };
  const V = (yaw, pitch, dist, ty) => ({ yaw, pitch, dist, tx: C[0] + 0.5, ty: ty == null ? C[1] : ty, tz: C[2] + 0.5 });
  const UP = [0, 1, 0];
  // 1. disco
  await stroke({ shape: 'disk', tilt: 10, ri: 26, T: 3, dens: 55, streak: 47, grad: DISK }, C, UP, 34); await shot('campo-disco', V(0.5, 0.42, 78));
  // 2. toro (oco, gradiente pelo ângulo)
  await clear(); await stroke({ shape: 'torus', T: 14, hollow: true, axis: 'ang', grad: ['red_concrete', 'orange_concrete', 'yellow_concrete', 'lime_concrete', 'cyan_concrete', 'light_blue_concrete', 'blue_concrete', 'purple_concrete', 'magenta_concrete', 'red_concrete'] }, C, UP, 31); await shot('campo-toro', V(0.5, 0.55, 74));
  // 3. arco (em pé)
  await clear(); await stroke({ shape: 'arc', a0: 0, a1: 180, ri: 53, T: 3, taper: false, streak: 25, grad: ['sea_lantern', 'light_blue_concrete', 'cyan_concrete', 'blue_concrete', 'purple_concrete', 'magenta_concrete'] }, C, [0, 0, 1], 30); await shot('campo-arco', V(0.35, 0.18, 70, 38));
  // 4. espiral
  await clear(); await stroke({ shape: 'spiral', tilt: 18, ri: 17, T: 3, arms: 3, twist: 1.9, dens: 50, streak: 33, stw: 1.9, grad: ['sea_lantern', 'pearlescent_froglight', 'white_concrete', 'light_blue_concrete', 'light_blue_concrete', 'blue_concrete', 'purple_concrete', 'black_concrete'] }, C, UP, 36); await shot('campo-espiral', V(0.4, 0.75, 80));
  // 5. casca com um gomo aberto, e um planeta dentro
  await clear();
  await stroke({ shape: 'shell', T: 11, axis: 'y', streak: 100, grad: ['blue_concrete', 'grass_block', 'blue_concrete', 'grass_block', 'blue_concrete'] }, C, UP, 11);
  await stroke({ shape: 'shell', T: 2, axis: 'y', dens: 70, a0: 10, a1: 280, grad: ['white_concrete', 'light_blue_stained_glass', 'light_blue_concrete', 'cyan_concrete', 'blue_concrete'] }, C, UP, 22);
  await shot('campo-casca', V(0.75, 0.3, 64));
  // 6. funil com a grade
  await clear(); await stroke({ shape: 'funnel', ri: 10, T: 1, depth: 26, pat: 'grid', gap: 4, spokes: 24, axis: 'w', grad: ['cyan_concrete', 'light_blue_concrete', 'blue_concrete', 'purple_concrete', 'magenta_concrete'] }, [C[0], 46, C[2]], UP, 40); await shot('campo-funil', V(0.5, 0.38, 84, 34));
  // 7. horizonte de eventos: esfera preta, disco, os arcos e o anel no plano da câmera
  await clear(); const hc = V(0.3, 0.12, 62), cd = camDir(hc);
  await stroke({ shape: 'shell', T: 8, grad: ['black_concrete'] }, C, UP, 8);
  await stroke({ shape: 'disk', tilt: 8, ri: 36, T: 3, dens: 55, streak: 47, shift: -40, grad: DISK }, C, UP, 36);
  await stroke({ shape: 'arc', a0: 0, a1: 180, ri: 68, T: 1, taper: false, streak: 15, grad: DISK.slice(0, 6) }, C, cd, 14);
  await stroke({ shape: 'arc', a0: 180, a1: 360, ri: 86, T: 1, taper: false, grad: DISK.slice(0, 5) }, C, cd, 11);
  await stroke({ shape: 'disk', ri: 89, T: 1, taper: false, grad: ['sea_lantern'] }, C, cd, 9);
  await shot('campo-horizonte', hc);
  // a prévia de uma forma pendente, com o aviso, e a janela de ajustes
  await clear(); await ev(`(function(){ Object.assign(fld, ${JSON.stringify(Object.assign({}, BASE, { shape: 'spiral', tilt: 18, ri: 17, arms: 3, dens: 50, streak: 33, stw: 1.9, grad: DISK }))}); fcur = { c: [56.5, 30.5, 56.5], n0: [0, 1, 0], F: fieldFrame([0, 1, 0], 18), R: 30, fixed: true }; fieldChanged(); })()`);
  await p.evaluate(c => { Object.assign(window.__bab.cam, c); window.__bab.update(); }, V(0.4, 0.75, 76)); await p.waitForTimeout(800);
  await p.screenshot({ path: path.join(OUT, 'campo-previa.jpg'), type: 'jpeg', quality: 84 }); console.log('ok previa');
  await p.click('#fldEdit'); await p.waitForTimeout(400);
  const d = await p.$('#overlayRoot .dialog'); await d.screenshot({ path: path.join(OUT, 'campo-janela.jpg'), type: 'jpeg', quality: 85 }); console.log('ok janela');
  console.log('errs', errs); await b.close();
})();
