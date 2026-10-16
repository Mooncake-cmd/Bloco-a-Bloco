// Capturas do pincel de bioma para o guia: o mesmo terreno pintado de quatro biomas, só com a cor e com o terreno
// transformado, e o mapa de um mundo no modo Biomas:
// node scripts/guia/bioma.js <url do editor> <pacote Bedrock .zip> <pasta de saída> [mundo .mcworld gerado pelo jogo]
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');
const [URL, PACK, OUT] = process.argv.slice(2);
const WORLD = process.argv[5] || path.join(__dirname, '../../tests/fixtures/mundo-teste.mcworld'); // o mundo de teste não guarda biomas: para a captura do guia, passe um mundo gerado pelo jogo
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => { if (!sessionStorage.getItem('x')) { sessionStorage.setItem('x', '1'); localStorage.setItem('bloco-a-bloco-measure', '0'); } });
  await p.goto(URL); await p.waitForTimeout(2500);
  await p.setInputFiles('#packIn', PACK);
  await p.waitForFunction(() => /blocos com textura/.test(document.getElementById('toast').textContent), null, { timeout: 300000 });
  const ev = s => p.evaluate(x => window.__bab.ev(x), s);
  const hide = async () => { await p.evaluate(() => document.getElementById('toast').classList.remove('show')); await p.waitForTimeout(600); };
  // o mesmo terreno nos quatro quadrantes (grama, capim, papoulas, um lago; uma casa de tábuas num deles), pintado
  // de deserto, pântano, planície nevada e selva: primeiro só o bioma (a cor muda), depois com "Transformar o terreno"
  const scene = `(function(){ newWorld(64, 40, 64); var R = (function(){ var s=11; return function(){ s=(s*16807)%2147483647; return s/2147483647; }; })(); Math.random = R; TREE_R = R;
    var g=cellFromName('grass_block'), d=cellFromName('dirt'), w=cellFromName('water'), sg=cellFromName('short_grass'), po=cellFromName('poppy'), pl=cellFromName('oak_planks'), lg=cellFromName('oak_log'); beginBatch();
    for (var x=0;x<64;x++) for (var z=0;z<64;z++) { var lx=x%32, lz=z%32, pond=(lx-20)*(lx-20)+(lz-9)*(lz-9) < 14;
      for (var y=0;y<=3;y++) editSet(x,y,z, y<3 ? d : pond ? w : g);
      if (pond) editSet(x,2,z,w); else { var r=R(); if (r<0.25) editSet(x,4,z,sg); else if (r<0.29) editSet(x,4,z,po); } }
    for (var x=6;x<12;x++) for (var z=4;z<10;z++) for (var y=4;y<8;y++) if (x===6||x===11||z===4||z===9||y===7) editSet(x,y,z,(x===6||x===11)&&(z===4||z===9)?lg:pl);
    endBatch(); bio.show=false; bio.sq=true; bio.r=15; setTool('biome');
    Object.assign(cam,{yaw:0.6,pitch:0.62,dist:78,tx:32,ty:4,tz:32}); updateCamera(); requestRender(); })()`;
  const paint = terra => ev(`(function(){ bio.terra=${terra}; [[15,15,2],[15,47,6],[47,15,12],[47,47,21]].forEach(function(e){ bio.id=e[2]; stroke={mode:'biome',cells:new Set(),n:0}; beginBatch('Pincel de bioma'); bioApply({hit:[e[0],3,e[1]]}); endBatch(); stroke=null; }); bio.id=2; bio.r=5; updateBioChip(); })()`);
  await ev(scene); await paint(false);
  await p.mouse.move(1270, 790); await p.waitForTimeout(3000); await hide();
  await p.screenshot({ path: path.join(OUT, 'bioma-cor.jpg'), type: 'jpeg', quality: 82, clip: { x: 0, y: 0, width: 972, height: 772 } });
  await ev(scene); await paint(true);
  await p.mouse.move(1270, 790); await p.waitForTimeout(3500); await hide();
  await p.screenshot({ path: path.join(OUT, 'bioma.jpg'), type: 'jpeg', quality: 82, clip: { x: 0, y: 0, width: 972, height: 772 } });
  // o mapa do mundo de teste no modo Biomas
  await p.click('#menu summary'); await p.click('#worldBtn').catch(() => {});
  await p.setInputFiles('#worldIn', WORLD);
  await p.waitForFunction(() => /chunks já gerados/.test((document.getElementById('wmInfo') || {}).textContent || ''), null, { timeout: 120000 });
  await p.selectOption('#wmS', '256'); await p.fill('#wmX', '0'); await p.fill('#wmZ', '0'); await p.dispatchEvent('#wmX', 'input');
  await p.click('#wmModeB'); await p.waitForTimeout(300);
  const bx = await (await p.$('#wmCv')).boundingBox(); await p.mouse.move(bx.x + bx.width * 0.5, bx.y + bx.height * 0.55); await p.waitForTimeout(300); await hide();
  await (await p.$('.dialog')).screenshot({ path: path.join(OUT, 'mundo-biomas.jpg'), type: 'jpeg', quality: 82 });
  console.log('legenda:', await p.$eval('#wmBio', e => e.textContent));
  console.log('ok bioma', errs);
  await b.close();
})();
