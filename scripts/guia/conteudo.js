// Capturas do conteúdo dos blocos (baú, ejetor, placa) e da estrutura no mapa do mundo:
// node scripts/guia/conteudo.js <url do editor> <pacote Bedrock .zip> <mundo .mcworld gerado pelo jogo> <pasta de saída>
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');
const [URL, PACK, WORLD, OUT] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } }); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.setDefaultTimeout(600000);
  const S = [24, 16, 24], A = S[0] * S[2], proj = { v: 1, size: S, pal: ['grass_block'], rle: [1, A, 0, A * (S[1] - 1)] };
  await p.addInitScript(s => { if (!sessionStorage.getItem('x')) { sessionStorage.setItem('x', '1'); localStorage.setItem('bloco-a-bloco-v1', s); localStorage.setItem('bloco-a-bloco-measure', '0'); } }, JSON.stringify(proj));
  await p.goto(URL); await p.addStyleTag({ content: '#tabbar{display:none!important}' }); await p.waitForTimeout(2500); // as capturas recortam a partir da barra de ferramentas
  await p.setInputFiles('#packIn', PACK);
  await p.waitForFunction(() => /blocos com textura/.test(document.getElementById('toast').textContent));
  if (await p.evaluate(() => document.getElementById('measTbtn').getAttribute('aria-pressed') === 'true')) await p.click('#measTbtn');
  const ev = s => p.evaluate(x => window.__bab.ev(x), s);
  const hide = () => p.evaluate(() => document.getElementById('toast').classList.remove('show'));
  // um baú com itens variados, um ejetor com balde de água e uma placa escrita (como se viessem de um arquivo)
  await ev(`(function(){
    window.__bab.batchSet([[10,1,10,'chest[facing=south]'],[12,1,10,'dispenser[facing=up]'],[14,1,10,'oak_sign[rotation=0]'],[10,1,9,'oak_planks'],[12,1,9,'oak_planks'],[14,1,9,'oak_planks']]);
    bentSet(idx(10,1,10), { k: 'inv', items: [['diamond', 12, 0], ['iron_ingot', 64, 1], ['iron_ingot', 30, 2], ['bread', 16, 4], ['oak_log', 64, 9], ['oak_log', 64, 10], ['torch', 48, 13], ['water_bucket', 1, 18], ['redstone', 37, 22], ['emerald', 5, 26]] }, false);
    bentSet(idx(12,1,10), { k: 'inv', items: [['water_bucket', 1, 4]] }, false);
    bentSet(idx(14,1,10), { k: 'sign', f: { t: ['Bem-vindo', 'à base', '', '— Bloco a Bloco'], c: 'blue', g: 0 }, b: { t: ['', 'saída', '', ''], c: 'black', g: 0 }, w: 0 }, false);
    Object.assign(cam, { yaw: 0.2, pitch: 0.5, dist: 11, tx: 12.5, ty: 1.5, tz: 10.5 }); updateCamera(); requestRender(); })()`);
  // a barra de status com o baú apontado
  const pt = await ev("(function(){ var v=new THREE.Vector3(10.5,1.6,11.0).project(camera), r=renderer.domElement.getBoundingClientRect(); return [r.left+(v.x+1)/2*r.width, r.top+(1-v.y)/2*r.height]; })()");
  await ev("setTool('use')"); await p.mouse.move(pt[0], pt[1]); await p.waitForTimeout(500); await hide();
  await p.screenshot({ path: path.join(OUT, 'conteudo-status.jpg'), type: 'jpeg', quality: 84, clip: { x: 0, y: 54, width: 972, height: 746 } });
  console.log('status:', await ev("document.getElementById('stBlock').textContent"));
  // a janela do baú (Usar no baú) e a da placa
  await ev('openFill([10,1,10], BLOCKS[BY_JAVA.chest])'); await p.waitForTimeout(300);
  let d = await p.$('#overlayRoot .dialog'); await d.screenshot({ path: path.join(OUT, 'conteudo-bau.jpg'), type: 'jpeg', quality: 86 }); await ev('closeDialog()');
  await ev('openSign([14,1,10], BLOCKS[BY_JAVA.oak_sign])'); await p.waitForTimeout(300);
  d = await p.$('#overlayRoot .dialog'); await d.screenshot({ path: path.join(OUT, 'conteudo-placa.jpg'), type: 'jpeg', quality: 86 }); await ev('closeDialog()');
  // o mapa do mundo com uma estrutura posicionada (a cópia da construção)
  // a cópia: uma torre oca de tijolos de pedra (40 × 30 × 28) com um piso
  await ev(`(function(){ var w = 40, h = 30, l = 28, c = new Uint32Array(w * h * l), v = cellFromName('stone_bricks'), f = cellFromName('spruce_planks'), n = 0;
    for (var y = 0; y < h; y++) for (var z = 0; z < l; z++) for (var x = 0; x < w; x++) { var e = x === 0 || z === 0 || x === w - 1 || z === l - 1; if (e || y === 0 || y === 12) { c[(y * l + z) * w + x] = e ? v : f; n++; } }
    clip = { w: w, h: h, l: l, cells: c, n: n }; })()`);
  await p.setInputFiles('#worldIn', WORLD); await p.waitForSelector('#wmGo');
  await p.waitForFunction(() => !/Desenhando/.test((document.getElementById('wmInfo') || {}).textContent || ''));
  await p.click('#wmGo'); await p.waitForFunction(() => window.__bab.ev('!!(wio && wio.area)') && document.getElementById('busy').hidden); await hide();
  await ev('openWorldMap()'); await p.waitForFunction(() => window.__bab.ev('!!(wm && wm.ov)'));
  await p.click('#wmvFp'); await p.waitForSelector('#wmfOk'); await p.click('#wmfOk'); await p.waitForTimeout(500);
  // arrasta o retângulo um pouco e gira
  const c0 = await ev('(function(){ var s = wmFootSize(), q = wmToPx(wmFoot.x + s[0] / 2, wmFoot.z + s[1] / 2), r = wm.cv.getBoundingClientRect(); return [r.left + q[0] / wm.dpr, r.top + q[1] / wm.dpr]; })()');
  await p.mouse.move(c0[0], c0[1]); await p.mouse.down(); await p.mouse.move(c0[0] + 60, c0[1] + 30, { steps: 8 }); await p.mouse.up();
  await p.keyboard.press('r'); await p.waitForTimeout(300);
  await ev("(function(){ wm.grid = true; wmDraw(); })()"); await hide(); await p.waitForTimeout(3000);
  await p.screenshot({ path: path.join(OUT, 'mapa-estrutura.jpg'), type: 'jpeg', quality: 84 });
  console.log('estrutura:', await ev('JSON.stringify(wmFoot)'), await ev("document.getElementById('wmvFoot').textContent"));
  // Colar aqui: a área da estrutura é carregada e a cópia fica presa no lugar do retângulo; sobe 3 com as setas
  await p.click('#wmfPaste'); await p.waitForFunction(() => window.__bab.ev('pasting && !!pasteFixed') && document.getElementById('busy').hidden);
  for (const k of ['ArrowUp', 'ArrowUp', 'ArrowUp']) await p.keyboard.press(k);
  await ev('(function(){ cam.yaw = 0.7; updateCamera(); requestRender(); })()'); await hide();
  await p.mouse.move(5, 795); await p.waitForFunction(() => window.__bab.meshInfo().naFila === 0, null, { polling: 1000 }); await p.waitForTimeout(1500);
  await p.screenshot({ path: path.join(OUT, 'mapa-colar.jpg'), type: 'jpeg', quality: 84, clip: { x: 0, y: 54, width: 972, height: 718 } });
  console.log('colar aqui:', await ev("document.getElementById('selTxt').textContent"), await ev('JSON.stringify(wio.area)'));
  console.log('ok conteudo', errs); await b.close();
})();
