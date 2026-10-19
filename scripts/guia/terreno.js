// Capturas do gerador de terreno para o guia: a janela (com a prévia) e um mosaico com os 8 tipos gerados em volta da
// casa de exemplo (a imagem de relevo é um morro redondo feito aqui).
// node scripts/guia/terreno.js <url do editor> <pacote Bedrock .zip> <pasta de saída>
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs'), path = require('path');
const [URL, PACK, OUT] = process.argv.slice(2);
eval(fs.readFileSync(__dirname + '/demo.inc', 'utf8'));
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(s => { if (!sessionStorage.getItem('x')) { sessionStorage.setItem('x', '1'); localStorage.setItem('bloco-a-bloco-v1', s); localStorage.removeItem('bloco-a-bloco-terreno'); localStorage.setItem('bloco-a-bloco-measure', '0'); } }, JSON.stringify(proj));
  await p.goto(URL); await p.waitForTimeout(2500);
  await p.setInputFiles('#packIn', PACK);
  await p.waitForFunction(() => /blocos com textura/.test(document.getElementById('toast').textContent), null, { timeout: 300000 });
  const ev = s => p.evaluate(x => window.__bab.ev(x), s);
  const hide = async () => { await p.evaluate(() => document.getElementById('toast').classList.remove('show')); await p.waitForTimeout(500); };
  await hide();
  await ev(`openTerrain()`); await p.waitForTimeout(600);
  const d = await p.evaluate(() => { const r = document.querySelector('.dialog').getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; });
  await p.screenshot({ path: path.join(OUT, 'terreno-janela.jpg'), type: 'jpeg', quality: 85, clip: { x: d[0] - 8, y: d[1] - 8, width: d[2] + 16, height: d[3] + 16 } });
  await ev(`closeDialog()`);
  // imagem de relevo: um morro redondo
  await ev(`(function(){ var n = 64, g = new Float32Array(n * n); for (var y = 0; y < n; y++) for (var x = 0; x < n; x++) g[y * n + x] = Math.pow(Math.max(0, 1 - Math.hypot(x - 32, y - 32) / 32), 0.7); trImg = { g: g, w: n, h: n }; })()`);
  const tiles = [];
  for (const t of ['planicie', 'colinas', 'montanhas', 'ilha', 'arquipelago', 'vale', 'planalto', 'imagem']) {
    await ev(`(async function(){ var T = TR_TYPES['${t}']; await trGenerate(Object.assign({}, tr, { type: '${t}', A: T.A, S: T.S, sea: T.sea === null ? 0 : T.sea, seaOn: true, where: 'build', margin: 40, seed: 77, bio: 'auto', deco: true }));
      var bb = bbox(); Object.assign(cam, { yaw: 0.7, pitch: 0.55, dist: Math.max(bb.w, bb.l) * 1.05, tx: bb.minX + bb.w / 2, ty: bb.minY + bb.h / 3, tz: bb.minZ + bb.l / 2 }); updateCamera(); requestRender(); })()`);
    await p.waitForFunction(() => window.__bab.ev('dirty.size') === 0, null, { timeout: 120000 }); await p.waitForTimeout(1500); await hide();
    const buf = await p.screenshot({ type: 'jpeg', quality: 80, clip: { x: 0, y: 60, width: 972, height: 640 } });
    tiles.push([await ev(`TR_TYPES['${t}'].n`), buf.toString('base64')]);
    await ev(`undo()`);
  }
  // mosaico 4 x 2 com o nome de cada tipo
  const q = await b.newPage({ viewport: { width: 1600, height: 560 } });
  await q.setContent('<body style="margin:0;background:#fff;font:600 18px sans-serif"><div style="display:grid;grid-template-columns:repeat(4,400px)">' + tiles.map(t => '<div style="position:relative"><img src="data:image/jpeg;base64,' + t[1] + '" style="width:400px;height:263px;display:block;object-fit:cover"><span style="position:absolute;left:8px;top:6px;background:#fffd;padding:2px 8px;border-radius:6px">' + t[0] + '</span></div>').join('') + '</div></body>');
  await q.waitForTimeout(500);
  await q.screenshot({ path: path.join(OUT, 'terreno-tipos.jpg'), type: 'jpeg', quality: 82, clip: { x: 0, y: 0, width: 1600, height: 526 } });
  console.log('ok terreno', errs);
  await b.close();
})();
