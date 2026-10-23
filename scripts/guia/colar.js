// Captura da colagem com a prévia deslocada pelas setas: node scripts/guia/colar.js <url do editor> <pacote Bedrock .zip> <pasta de saída>
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs'), path = require('path');
const [URL, PACK, OUT] = process.argv.slice(2);
eval(fs.readFileSync(__dirname + '/demo.inc', 'utf8'));
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(s => { if (!sessionStorage.getItem('x')) { sessionStorage.setItem('x', '1'); localStorage.setItem('bloco-a-bloco-v1', s); localStorage.setItem('bloco-a-bloco-measure', '0'); } }, JSON.stringify(proj));
  await p.goto(URL); await p.addStyleTag({ content: '#tabbar{display:none!important}' }); await p.waitForTimeout(2500); // as capturas recortam a partir da barra de ferramentas
  await p.setInputFiles('#packIn', PACK);
  await p.waitForFunction(() => /blocos com textura/.test(document.getElementById('toast').textContent), null, { timeout: 300000 });
  if (await p.evaluate(() => document.getElementById('measTbtn').getAttribute('aria-pressed') === 'true')) await p.click('#measTbtn');
  const ev = s => p.evaluate(x => window.__bab.ev(x), s);
  // copia a árvore da casa de exemplo (o tronco e a copa) e começa a colar
  await ev(`(function(){ var lo = [1e9,1e9,1e9], hi = [-1,-1,-1]; forEachBlock(function (x, y, z, v) { if (!/_leaves$/.test(BLOCKS[cellBlock(v)].java)) return; lo = [Math.min(lo[0],x),Math.min(lo[1],y),Math.min(lo[2],z)]; hi = [Math.max(hi[0],x),Math.max(hi[1],y),Math.max(hi[2],z)]; });
    lo[1] = 1; sel = selFrom(lo, hi); copySel(false); sel = null; setTool('select'); startPaste();
    Object.assign(cam, { yaw: 0.55, pitch: 0.45, dist: 32, tx: 11, ty: 4, tz: 12 }); updateCamera(); requestRender(); })()`);
  const pt = await ev("(function(){ var v=new THREE.Vector3(18.5,1,6.5).project(camera), r=renderer.domElement.getBoundingClientRect(); return [r.left+(v.x+1)/2*r.width, r.top+(1-v.y)/2*r.height]; })()");
  await p.mouse.move(pt[0], pt[1]); await p.waitForTimeout(300);
  for (const k of ['ArrowUp', 'ArrowUp', 'ArrowUp', 'ArrowLeft']) await p.keyboard.press(k);
  await p.evaluate(() => document.getElementById('toast').classList.remove('show')); await p.waitForTimeout(800);
  await p.screenshot({ path: path.join(OUT, 'colar-mover.jpg'), type: 'jpeg', quality: 84, clip: { x: 0, y: 54, width: 972, height: 718 } });
  console.log('ok colar', await ev("document.getElementById('selTxt').textContent"), errs);
  await b.close();
})();
