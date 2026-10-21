// Captura da ferramenta Lançar para o guia: node scripts/guia/lancar.js <url do editor> <pacote Bedrock .zip> <pasta de saída>
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');
const [URL, PACK, OUT] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  const S = [24, 12, 32], A = S[0] * S[2], proj = { v: 1, size: S, pal: ['grass_block'], rle: [1, A, 0, A * (S[1] - 1)] };
  await p.addInitScript(s => { if (!sessionStorage.getItem('x')) { sessionStorage.setItem('x', '1'); localStorage.setItem('bloco-a-bloco-v1', s); localStorage.setItem('bloco-a-bloco-measure', '0'); localStorage.setItem('bloco-a-bloco-redstone', '1'); localStorage.removeItem('bloco-a-bloco-lancar'); } }, JSON.stringify(proj));
  await p.goto(URL); await p.addStyleTag({ content: '#tabbar{display:none}' }); await p.waitForTimeout(2500); // as capturas recortam a partir da barra de ferramentas (a barra das abas tem a dela: abas.js)
  await p.setInputFiles('#packIn', PACK);
  await p.waitForFunction(() => /blocos com textura/.test(document.getElementById('toast').textContent), null, { timeout: 300000 });
  if (await p.evaluate(() => document.getElementById('measTbtn').getAttribute('aria-pressed') === 'true')) await p.click('#measTbtn');
  const ev = s => p.evaluate(x => window.__bab.ev(x), s);
  // muro com alvo e lâmpada ao lado; botão de madeira com lâmpada em cima do bloco dele
  await ev(`(function(){ beginBatch(); var put = function (x, y, z, n) { editSet(x, y, z, cellFromName(n)); };
    for (var x = 4; x <= 17; x++) for (var y = 1; y <= 6; y++) put(x, y, 22, 'stone_bricks');
    put(8, 3, 22, 'target'); put(7, 3, 22, 'redstone_lamp'); put(9, 3, 22, 'redstone_lamp');
    put(13, 3, 21, 'oak_button[face=wall,facing=north]'); put(13, 4, 22, 'redstone_lamp');
    endBatch(); setTool('throw'); proj.type = 'arrow'; proj.pow = 1; updateProjChip();
    Object.assign(cam, { yaw: Math.PI - 0.45, pitch: 0.16, dist: 9, tx: 10.8, ty: 3.4, tz: 17.5 }); updateCamera(); requestRender(); })()`);
  const aim = (to) => ev(`(function(){ var r = rayFrom(0, 0); var o = [camera.position.x, camera.position.y, camera.position.z], T = ${JSON.stringify(to)}, best = null;
    for (var up = -0.1; up <= 0.3; up += 0.002) { var d = [T[0] - o[0], T[1] - o[1] + up * Math.hypot(T[0] - o[0], T[2] - o[2]), T[2] - o[2]], l = Math.hypot(d[0], d[1], d[2]); d = [d[0] / l, d[1] / l, d[2] / l];
      var pa = projPath(o, d, proj.type); if (pa.hit) { var e = Math.hypot(pa.hit.pt[0] - T[0], pa.hit.pt[1] - T[1], pa.hit.pt[2] - T[2]); if (!best || e < best.e) best = { d: d, e: e }; } }
    projThrow(o, best.d); return best.e; })()`);
  await aim([13.5, 3.5, 22]); await p.waitForTimeout(900);
  // ponteiro no alvo: a prévia mostra o arco até ele
  const t = await ev(`(function(){ var v = new THREE.Vector3(8.5, 3.55, 22).project(camera), r = renderer.domElement.getBoundingClientRect(); return [r.left + (v.x + 1) / 2 * r.width, r.top + (1 - v.y) / 2 * r.height]; })()`);
  await p.mouse.move(t[0], t[1] - 14); await p.waitForTimeout(300);
  await aim([8.45, 3.6, 22]); await p.waitForTimeout(450);
  await p.mouse.move(t[0] + 2, t[1] - 14); await p.waitForTimeout(150);
  await p.screenshot({ path: path.join(OUT, 'lancar.jpg'), type: 'jpeg', quality: 85, clip: { x: 0, y: 54, width: 972, height: 718 } });
  console.log('ok lancar', await ev(`[cellName(gget(8,3,22)), cellName(gget(7,3,22)), cellName(gget(13,3,21)), cellName(gget(13,4,22)), proj.stuck.length].join(' | ')`), errs);
  await b.close();
})();
