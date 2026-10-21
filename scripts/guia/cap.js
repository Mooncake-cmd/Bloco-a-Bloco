const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs'), path = require('path');
const OUT = process.argv[4], URL = process.argv[2], PACK = process.argv[3];
eval(fs.readFileSync(__dirname + '/demo.inc', 'utf8'));
const meta = {};
const rectsOf = async (p, sels) => p.evaluate(sels => { const o = {}; for (const [k, s] of Object.entries(sels)) { const e = document.querySelector(s); if (e) { const r = e.getBoundingClientRect(); o[k] = [r.left, r.top, r.width, r.height].map(Math.round); } } return o; }, sels);
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(s => { if (!sessionStorage.getItem('x')) { sessionStorage.setItem('x', '1'); localStorage.setItem('bloco-a-bloco-v1', s); localStorage.removeItem('bloco-a-bloco-tex'); } }, JSON.stringify(proj));
  await p.goto(URL); await p.addStyleTag({ content: 'body:not(.cap-abas) #tabbar{display:none}' }); await p.waitForTimeout(2500); // as capturas recortam a partir da barra de ferramentas; a visão geral mostra a barra das abas
  const cam = async c => { await p.evaluate(c => { Object.assign(window.__bab.cam, c); window.__bab.update(); }, c); await p.waitForTimeout(900); };
  const shot = async (name, clip, rects) => { await p.screenshot({ path: path.join(OUT, name + '.jpg'), type: 'jpeg', quality: 82, clip: clip || undefined }); if (rects) meta[name] = { clip: clip || { x: 0, y: 0, width: 1280, height: 800 }, rects }; console.log('ok', name); };
  const hideToast = () => p.evaluate(() => document.getElementById('toast').classList.remove('show'));
  const VIEW = { yaw: 0.55, pitch: 0.5, dist: 30, tx: 11, ty: 3, tz: 12 };
  // sem textura
  await hideToast(); await cam(VIEW); await shot('sem-textura', { x: 0, y: 54, width: 972, height: 718 });
  // carregando pacote
  await p.setInputFiles('#packIn', PACK);
  await p.waitForFunction(() => /Lendo texturas: [1-9]/.test(document.getElementById('busyTxt').textContent) && !document.getElementById('busy').hidden, null, { timeout: 120000, polling: 50 });
  await shot('carregando', { x: 340, y: 0, width: 600, height: 160 });
  await p.waitForFunction(() => /blocos com textura/.test(document.getElementById('toast').textContent), null, { timeout: 300000 });
  await p.waitForTimeout(1500); await hideToast(); await cam(VIEW);
  await p.evaluate(() => document.body.classList.add('cap-abas')); await cam(VIEW);
  await shot('visao-geral', null, await rectsOf(p, { tabs: '#tabbar', tools: '#tools', undo: '#undo', layer: '#layerBtn', mat: '#matBtn', exp: '#exportBtn', menu: '#menu summary', view: '#viewport', hotbar: '#hotbar', status: '#status', search: '#search', chips: '#chips', list: '#list' }));
  await p.evaluate(() => document.body.classList.remove('cap-abas')); await cam(VIEW);
  await cam({ yaw: 0.6, pitch: 0.42, dist: 26, tx: 12, ty: 3, tz: 12 }); await hideToast();
  await shot('medidas', { x: 0, y: 54, width: 972, height: 718 });
  await cam(VIEW);
  // barra de ferramentas
  const tsel = {}; for (const t of ['place', 'erase', 'pick', 'use', 'rotate', 'line', 'box', 'hbox', 'sphere', 'hsphere', 'shape2', 'tube', 'fill', 'select', 'mask', 'biome', 'mix', 'sculpt', 'ruler', 'throw', 'tp']) tsel[t] = '[data-tool="' + t + '"]';
  Object.assign(tsel, { undo: '#undo', hist: '#histBtn', redo: '#redo', meas: '#measTbtn', layer: '#layerBtn', range: '#layerRange', mat: '#matBtn', exp: '#exportBtn', menu: '#menu summary' });
  await shot('barra', { x: 0, y: 0, width: 972, height: 54 }, await rectsOf(p, tsel));
  // hotbar e status
  await p.mouse.move(640, 380); await p.waitForTimeout(400);
  await shot('mira', { x: 160, y: 140, width: 640, height: 480 });
  const hb = await rectsOf(p, { h: '#hotbar' }); await shot('hotbar', { x: hb.h[0] - 10, y: hb.h[1] - 10, width: hb.h[2] + 20, height: hb.h[3] + 20 });
  // porta: alvo + usar
  await cam({ yaw: 0, pitch: 0.25, dist: 9, tx: 10.5, ty: 2, tz: 14 });
  const door = await p.evaluate(() => { const r = document.querySelector('#viewport canvas').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
  await p.mouse.move(door[0], door[1] + 10); await p.waitForTimeout(300);
  await shot('status', { x: 0, y: 772, width: 972, height: 28 });
  await shot('porta-fechada', { x: 186, y: 150, width: 600, height: 500 });
  await p.keyboard.press('u'); await p.mouse.click(door[0], door[1] + 10); await p.waitForTimeout(900);
  await shot('porta-aberta', { x: 186, y: 150, width: 600, height: 700 - 150 + 100 });
  await p.keyboard.press('Control+z'); await p.keyboard.press('b'); await hideToast();
  // forma: caixa com âncora
  await cam(VIEW);
  await p.keyboard.press('r');
  await p.mouse.click(250, 560); await p.waitForTimeout(200); await p.mouse.click(420, 640); await p.waitForTimeout(200); await p.mouse.move(420, 520); await p.waitForTimeout(500);
  await shot('caixa', { x: 0, y: 54, width: 972, height: 718 });
  await p.keyboard.press('Escape'); await hideToast();
  // borracha 3 x 3
  await p.keyboard.press('e'); await p.click('[data-es="3"]'); await p.mouse.move(300, 600); await p.waitForTimeout(400);
  await shot('borracha', { x: 0, y: 54, width: 640, height: 600 });
  await p.click('[data-es="1"]'); await p.keyboard.press('b'); await hideToast();
  // seleção: área da casa, colar uma cópia ao lado e a janela Substituir
  await cam(VIEW); await p.keyboard.press('v');
  // a árvore: caixa das folhas, do chão (y = 1) até o topo
  await p.evaluate(() => { const B = window.__bab, mn = [1e9, 1e9, 1e9], mx = [-1, -1, -1]; B.vox().forEach(q => { if (!/leaves/.test(B.name(q))) return; for (let i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], q[i]); mx[i] = Math.max(mx[i], q[i]); } }); mn[1] = 1; B.setSel(mn, mx); });
  await p.mouse.move(900, 200); await p.waitForTimeout(500);
  await shot('selecao', { x: 0, y: 54, width: 972, height: 718 });
  await p.keyboard.press('Control+c'); await p.keyboard.press('Control+v'); await hideToast();
  await p.mouse.click(150, 520); await p.waitForTimeout(400); await hideToast(); await p.mouse.move(800, 640); await p.waitForTimeout(500);
  await shot('colar', { x: 0, y: 54, width: 972, height: 718 });
  await p.keyboard.press('Escape'); await p.keyboard.press('Control+z'); await hideToast();
  await p.click('#selBtns [data-s="repl"]'); await p.waitForTimeout(500);
  { const r = await rectsOf(p, { d: '.dialog' }); await shot('substituir', { x: r.d[0] - 8, y: r.d[1] - 8, width: r.d[2] + 16, height: r.d[3] + 16 }); }
  await p.keyboard.press('Escape'); await p.keyboard.press('Escape'); await p.keyboard.press('b'); await hideToast();
  // camada
  await p.click('#layerBtn'); await p.evaluate(() => { const r = document.getElementById('layerRange'); r.value = 2; r.dispatchEvent(new Event('input')); }); await p.waitForTimeout(800);
  await cam({ yaw: 0.55, pitch: 0.9, dist: 26, tx: 11, ty: 2, tz: 12 });
  await shot('camada', null);
  await cam({ yaw: 0.55, pitch: 1.2, dist: 30, tx: 12, ty: 2, tz: 12 }); await hideToast();
  await shot('medidas-camada', { x: 0, y: 54, width: 972, height: 718 });
  await p.click('#layerBtn'); await p.waitForTimeout(300);
  // menu projeto
  await p.click('#menu summary'); await p.waitForTimeout(300);
  const mr = await rectsOf(p, { pop: '#menu .pop' });
  await shot('menu', { x: mr.pop[0] - 12, y: 0, width: mr.pop[2] + 24, height: mr.pop[1] + mr.pop[3] + 12 });
  await p.click('#menu summary');
  // diálogos
  const dlg = async (name, opener) => { await opener(); await p.waitForTimeout(500); const r = await rectsOf(p, { d: '.dialog' }); await shot(name, { x: r.d[0] - 8, y: r.d[1] - 8, width: r.d[2] + 16, height: Math.min(800 - r.d[1] + 8, r.d[3] + 16) }); await p.keyboard.press('Escape'); await p.waitForTimeout(200); };
  await dlg('exportar', () => p.click('#exportBtn'));
  await dlg('materiais', () => p.click('#matBtn'));
  await dlg('texturas', async () => { await p.click('#menu summary'); await p.click('#texBtn'); });
  await dlg('tamanho', async () => { await p.click('#menu summary'); await p.click('#sizeBtn'); });
  await dlg('chao', async () => { await p.click('#menu summary'); await p.click('#floorBtn'); });
  await dlg('ajuda', async () => { await p.click('#menu summary'); await p.click('#helpBtn'); });
  // paleta
  const pal = async (name, cat, q) => { if (cat) await p.click('[data-cat="' + cat + '"]'); if (q != null) await p.fill('#search', q); await p.waitForTimeout(400); await shot(name, { x: 972, y: 0, width: 308, height: 800 }); };
  await pal('paleta', 'all', '');
  await pal('paleta-formas', 'formas', '');
  await pal('paleta-busca', 'all', 'stairs');
  await pal('paleta-tecnicos', 'tecnico', '');
  await p.fill('#search', ''); await p.click('[data-cat="all"]');
  // vitrine de formas
  // tema escuro
  await p.click('#menu summary'); await p.click('#themeBtn'); await p.click('#themeBtn'); await p.click('#menu summary').catch(() => {}); await p.waitForTimeout(600); await hideToast(); await cam(VIEW);
  await shot('escuro', null);
  await p.click('#menu summary'); await p.click('#themeBtn'); await p.click('#menu summary').catch(() => {});
  // importar estrutura grande
  await p.setInputFiles('#fileIn', process.argv[5]);
  await p.waitForFunction(() => /importado/.test(document.getElementById('toast').textContent), null, { timeout: 60000 });
  await p.waitForTimeout(5000); await shot('importado', null);
  // celular
  const m = await ctx.newPage(); await m.setViewportSize({ width: 390, height: 844 });
  await m.goto(URL); await m.waitForTimeout(6000);
  await m.screenshot({ path: path.join(OUT, 'celular.jpg'), type: 'jpeg', quality: 82 }); console.log('ok celular');
  fs.writeFileSync(path.join(OUT, 'meta.json'), JSON.stringify(meta));
  console.log('errors', JSON.stringify(errs)); await b.close();
})();
