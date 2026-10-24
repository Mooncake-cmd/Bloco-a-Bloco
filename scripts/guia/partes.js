// Capturas do colar em partes (estrutura maior que uma área) e conferência das emendas:
// node scripts/guia/partes.js <url do editor> <pacote Bedrock .zip> <mundo .mcworld gerado pelo jogo, com bastante área> <pasta de saída>
// Uma plataforma de 600 × 520 (borda de tijolos, piso de pedra lisa e uma grade de ouro de 50 em 50) presa no mapa
// em volta do jogador, no Y 150, colada nas 4 partes; depois de cada parte, confere os blocos dentro e fora da faixa dela.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');
const [URL, PACK, WORLD, OUT] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => { if (!sessionStorage.getItem('x')) { sessionStorage.setItem('x', '1'); localStorage.clear(); localStorage.setItem('bloco-a-bloco-measure', '0'); localStorage.setItem('bloco-a-bloco-view', '384'); } });
  await p.goto(URL); await p.addStyleTag({ content: '#tabbar{display:none!important}' }); await p.waitForTimeout(2000);
  await p.setInputFiles('#packIn', PACK);
  await p.waitForFunction(() => /blocos com textura/.test(document.getElementById('toast').textContent), null, { timeout: 300000 });
  const ev = s => p.evaluate(x => window.__bab.ev(x), s);
  const hide = () => p.evaluate(() => document.getElementById('toast').classList.remove('show'));
  const pronto = () => p.waitForFunction(() => window.__bab.ev('pasting && !!pasteLimit') && document.getElementById('busy').hidden, null, { timeout: 900000, polling: 500 });
  await ev(`(function(){ var w = 600, h = 4, l = 520, c = new Uint32Array(w * h * l), br = cellFromName('stone_bricks'), fl = cellFromName('smooth_stone'), au = cellFromName('gold_block'), n = 0;
    for (var y = 0; y < h; y++) for (var z = 0; z < l; z++) for (var x = 0; x < w; x++) { var e = x === 0 || z === 0 || x === w - 1 || z === l - 1, v = 0;
      if (e) v = br; else if (y === 0) v = fl; else if (y === 1 && (x % 50 === 0 || z % 50 === 0)) v = au;
      if (v) { c[(y * l + z) * w + x] = v; n++; } }
    clip = { w: w, h: h, l: l, cells: c, n: n }; })()`);
  await p.setInputFiles('#worldIn', WORLD); await p.waitForSelector('#wmGo', { timeout: 600000 });
  await p.waitForFunction(() => !/Desenhando/.test((document.getElementById('wmInfo') || {}).textContent || ''), null, { timeout: 600000 });
  await ev('closeDialog()'); await ev('openWorldMap()'); await p.waitForFunction(() => window.__bab.ev('!!(wm && wm.ov)'));
  await p.click('#wmvFp'); await p.waitForSelector('#wmfOk'); await p.click('#wmfOk'); await p.waitForTimeout(500);
  await ev(`(function(){ wmFoot.name = 'Plataforma'; wmFoot.y = 150; wm.s = 0.5; wm.cx = wmFoot.x + 300; wm.cz = wmFoot.z + 260; wmFootInfo(); wmDraw(); })()`);
  await p.waitForFunction(() => !/Desenhando/.test((document.getElementById('wmvInfo') || document.body).textContent || ''), null, { timeout: 600000 }).catch(() => {});
  await hide(); await p.waitForTimeout(3000);
  await p.screenshot({ path: path.join(OUT, 'partes-mapa.jpg'), type: 'jpeg', quality: 84 });
  console.log('retângulo:', await ev('JSON.stringify(wmFoot)'), await ev("document.getElementById('wmvFoot').textContent"));
  await p.click('#wmfPaste'); await pronto();
  const confere = `(function(){ var P = wmParts, A = wio.area, D = wioDim(P.dim), c = P.clip, o = [P.org[0] - A.x0, P.org[1] - D.min, P.org[2] - A.z0], r = P.rects[P.cur], L = [r[0] - A.x0, r[1] - A.z0, r[2] - A.x0, r[3] - A.z0], dentro = 0, certo = 0, fora = 0, vazou = 0;
    for (var y = 0; y < c.h; y++) for (var z = 0; z < c.l; z++) for (var x = 0; x < c.w; x++) { var v = c.cells[(y * c.l + z) * c.w + x]; if (!v) continue; var X = o[0] + x, Y = o[1] + y, Z = o[2] + z; if (!inB(X, Y, Z)) continue;
      if (X >= L[0] && Z >= L[1] && X < L[2] && Z < L[3]) { dentro++; if (gget(X, Y, Z) === v) certo++; } else { fora++; if (gget(X, Y, Z) === v) vazou++; } }
    return JSON.stringify({ parte: P.cur + 1, dentro: dentro, certos: certo, naAreaForaDaParte: fora, vazaram: vazou, canto: P.org }); })()`;
  // parte 1: sobe 2 com a seta e cola; a captura é a da parte 2, já presa no lugar
  await p.keyboard.press('ArrowUp'); await p.keyboard.press('ArrowUp'); await p.keyboard.press('Enter'); await p.waitForTimeout(500);
  console.log(await ev(confere));
  await p.click('#partsBtns [data-part="1"]'); await pronto();
  await ev('(function(){ cam.yaw = 0.6; cam.pitch = 0.7; updateCamera(); requestRender(); })()');
  await p.mouse.move(5, 795); await p.waitForFunction(() => window.__bab.meshInfo().naFila === 0, null, { timeout: 900000, polling: 1000 }); await hide(); await p.waitForTimeout(1500);
  await p.screenshot({ path: path.join(OUT, 'partes-colar.jpg'), type: 'jpeg', quality: 84, clip: { x: 0, y: 54, width: 972, height: 718 } });
  console.log('aviso:', await ev("document.getElementById('selTxt').textContent"), '|', await ev("document.getElementById('partsTxt').textContent"));
  await p.keyboard.press('Enter'); await p.waitForTimeout(500); console.log(await ev(confere));
  for (const i of [2, 3]) { await p.click('#partsBtns [data-part="' + i + '"]'); await pronto(); await p.keyboard.press('Enter'); await p.waitForTimeout(500); console.log(await ev(confere)); }
  console.log('fim:', await ev("document.getElementById('partsTxt').textContent"), '| colada de novo a área da parte 1 para conferir as emendas:');
  // volta à área da parte 1 sem colar (o que foi colado nela e nas vizinhas, dentro dela, tem de estar lá)
  await ev('(function(){ var P = wmParts, r = P.rects[0], a = wmRectArea(r[0], r[1], r[2] - r[0], r[3] - r[1]); window.__chk = { P: P, a: a }; wioGoArea(P.dim, a[0], a[1], a[2], a[3], true); })()');
  await p.waitForFunction(() => document.getElementById('busy').hidden && window.__bab.ev('wio.area.x0 === window.__chk.a[0] && wio.area.z0 === window.__chk.a[1]'), null, { timeout: 900000, polling: 500 });
  await p.waitForTimeout(1000);
  console.log(await ev(`(function(){ var P = window.__chk.P, A = wio.area, D = wioDim(P.dim), c = P.clip, o = [P.org[0] - A.x0, P.org[1] - D.min, P.org[2] - A.z0], tot = 0, ok = 0;
    for (var y = 0; y < c.h; y++) for (var z = 0; z < c.l; z++) for (var x = 0; x < c.w; x++) { var v = c.cells[(y * c.l + z) * c.w + x]; if (!v) continue; var X = o[0] + x, Y = o[1] + y, Z = o[2] + z; if (!inB(X, Y, Z)) continue; tot++; if (gget(X, Y, Z) === v) ok++; }
    return JSON.stringify({ blocosDaEstruturaNaArea: tot, presentes: ok }); })()`));
  console.log('ok partes', errs); await b.close();
})();
