// Capturas da pixel art para o guia: a janela com uma paisagem desenhada na hora (céu, sol, montanhas, lago) e o
// resultado colado de pé, com as texturas do Bedrock:
// node scripts/guia/pixelart.js <url do editor> <pacote Bedrock .zip> <pasta de saída>
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');
const [URL, PACK, OUT] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => { if (!sessionStorage.getItem('x')) { sessionStorage.setItem('x', '1'); localStorage.setItem('bloco-a-bloco-measure', '0'); localStorage.removeItem('bloco-a-bloco-pixelart'); } });
  await p.goto(URL); await p.waitForTimeout(2500);
  await p.setInputFiles('#packIn', PACK);
  await p.waitForFunction(() => /blocos com textura/.test(document.getElementById('toast').textContent), null, { timeout: 300000 });
  const ev = s => p.evaluate(x => window.__bab.ev(x), s);
  const hide = async () => { await p.evaluate(() => document.getElementById('toast').classList.remove('show')); await p.waitForTimeout(600); };
  await ev(`newWorld(96, 64, 40)`);
  // a imagem: desenhada num canvas e aberta pela janela (como se fosse um arquivo escolhido)
  await p.evaluate(() => new Promise(res => {
    const c = document.createElement('canvas'); c.width = 320; c.height = 200; const g = c.getContext('2d');
    const sky = g.createLinearGradient(0, 0, 0, 130); sky.addColorStop(0, '#2a3f8f'); sky.addColorStop(0.55, '#e0607a'); sky.addColorStop(1, '#ffb347'); g.fillStyle = sky; g.fillRect(0, 0, 320, 130);
    g.fillStyle = '#ffe066'; g.beginPath(); g.arc(235, 62, 24, 0, 7); g.fill();
    g.fillStyle = '#4b3a6b'; g.beginPath(); g.moveTo(0, 130); g.lineTo(70, 55); g.lineTo(130, 120); g.lineTo(190, 70); g.lineTo(260, 125); g.lineTo(320, 80); g.lineTo(320, 140); g.lineTo(0, 140); g.fill();
    g.fillStyle = '#f2f2f2'; [[70, 55, 14], [190, 70, 12], [320, 80, 10]].forEach(q => { g.beginPath(); g.moveTo(q[0] - q[2], q[1] + q[2] * 0.9); g.lineTo(q[0], q[1]); g.lineTo(q[0] + q[2], q[1] + q[2] * 0.9); g.fill(); });
    const lake = g.createLinearGradient(0, 130, 0, 200); lake.addColorStop(0, '#ff9f5a'); lake.addColorStop(1, '#2d4fa0'); g.fillStyle = lake; g.fillRect(0, 130, 320, 70);
    g.fillStyle = '#2f6b2f'; g.fillRect(0, 168, 320, 32);
    g.fillStyle = '#1d4a1d'; [[30, 168], [55, 172], [270, 166], [292, 170]].forEach(t => { g.beginPath(); g.moveTo(t[0], t[1] - 30); g.lineTo(t[0] - 9, t[1]); g.lineTo(t[0] + 9, t[1]); g.fill(); });
    const im = new Image(); im.onload = () => { window.__pimg = im; res(); }; im.src = c.toDataURL();
  }));
  await p.click('#menu summary'); await p.click('#pixBtn');
  await ev(`(function(){ $('paW').value = 80; openPixelArt.load(window.__pimg, 'por-do-sol.png (320 × 200 pixels)'); })()`); await p.waitForTimeout(600); await hide();
  await (await p.$('.dialog')).screenshot({ path: path.join(OUT, 'pixelart.jpg'), type: 'jpeg', quality: 85 });
  await p.click('#paOk'); await p.waitForTimeout(300);
  await ev(`(function(){ commitPaste({ place: [48, 0, 20] }); pasting = false; selRefresh();
    var g = cellFromName('grass_block'); beginBatch(); for (var x=0;x<96;x++) for (var z=0;z<40;z++) if (!gget(x,0,z)) editSet(x,0,z,g); endBatch();
    setTool('place'); Object.assign(cam,{yaw:-0.28,pitch:0.12,dist:78,tx:48,ty:24,tz:20}); updateCamera(); requestRender(); })()`);
  await p.mouse.move(1100, 700); await p.waitForTimeout(4000); await hide();
  await p.screenshot({ path: path.join(OUT, 'pixelart-colada.jpg'), type: 'jpeg', quality: 82, clip: { x: 0, y: 0, width: 972, height: 772 } });
  console.log('ok pixelart', errs);
  await b.close();
})();
