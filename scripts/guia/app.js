// O aplicativo para Android, simulado no navegador: a ponte window.BabApp e as respostas da pasta (/w/<id>/list e
// /w/<id>/f/<caminho>) vêm de uma pasta de mundos no disco. Faz as capturas do guia (lista de mundos, o mundo, o mapa com
// marcações e o Editor NBT, na tela de um celular) e confere a gravação: põe um jogador de exemplo, muda a hora e um
// encantamento pelo Editor NBT, grava (level.dat e um .log novo na pasta db do mundo) e lê de volta do disco. Também
// confere o Desfazer. A pasta de mundos é mudada: use uma cópia.
// node scripts/guia/app.js <url do editor> <pasta com mundos (cada um com level.dat e db/)> <pasta de saída> [pacote]
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs'), path = require('path');
const [EDITOR, WORLDS, OUT, PACK] = process.argv.slice(2);
const listDir = (dir, pre = '') => fs.readdirSync(dir).flatMap(f => { const p = path.join(dir, f); return fs.statSync(p).isDirectory() ? listDir(p, pre + f + '/') : [{ p: pre + f, s: fs.statSync(p).size }]; });
const bak = path.join(OUT, '.app-backup');
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: 412, height: 860 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  const worlds = fs.readdirSync(WORLDS).filter(d => fs.existsSync(path.join(WORLDS, d, 'level.dat')));
  const info = worlds.map(d => ({ id: d, name: fs.existsSync(path.join(WORLDS, d, 'levelname.txt')) ? fs.readFileSync(path.join(WORLDS, d, 'levelname.txt'), 'utf8').trim() : d, time: fs.statSync(path.join(WORLDS, d, 'level.dat')).mtimeMs, icon: fs.existsSync(path.join(WORLDS, d, 'world_icon.jpeg')) }));
  await p.exposeFunction('__appWrite', (id, rel, b64) => { const f = path.join(WORLDS, id, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, Buffer.from(b64, 'base64')); });
  await p.exposeFunction('__appBackup', (id, rel, t, back) => { const a = path.join(WORLDS, id, rel), c = path.join(bak, id, t, rel); if (back) fs.copyFileSync(c, a); else { fs.mkdirSync(path.dirname(c), { recursive: true }); fs.copyFileSync(a, c); } });
  await p.exposeFunction('__appRemove', (id, rel) => fs.unlinkSync(path.join(WORLDS, id, rel)));
  await p.addInitScript(info => {
    if (!sessionStorage.getItem('x')) { sessionStorage.setItem('x', '1'); localStorage.clear(); }
    let folder = '';
    window.BabApp = { folder: () => folder, worlds: () => JSON.stringify(info), pickFolder: () => { folder = 'minecraftWorlds'; setTimeout(() => window.appFolderPicked(true, ''), 50); },
      write: (id, rel, b64) => { window.__appWrite(id, rel, b64); return 'ok'; }, backup: (id, rel, t) => { window.__appBackup(id, rel, t, false); return 'ok'; },
      restore: (id, rel, t) => { window.__appBackup(id, rel, t, true); return 'ok'; }, remove: (id, rel) => { window.__appRemove(id, rel); return 'ok'; } };
  }, info);
  const base = new URL(EDITOR).origin;
  await p.route(base + '/w/**', r => {
    const u = new URL(r.request().url()), m = /^\/w\/([^/]+)\/(list|f\/(.*))$/.exec(u.pathname), id = decodeURIComponent(m[1]);
    if (m[2] === 'list') return r.fulfill({ contentType: 'application/json', body: JSON.stringify(listDir(path.join(WORLDS, id))) });
    const f = path.join(WORLDS, id, ...m[3].split('/').map(decodeURIComponent));
    return fs.existsSync(f) ? r.fulfill({ body: fs.readFileSync(f), contentType: 'application/octet-stream' }) : r.fulfill({ status: 404, body: '' });
  });
  await p.goto(EDITOR); await p.waitForTimeout(2500);
  const ev = s => p.evaluate(x => window.__bab.ev(x), s);
  const shot = async (nome) => { await p.evaluate(() => document.getElementById('toast').classList.remove('show')); await p.waitForTimeout(500); await p.screenshot({ path: path.join(OUT, nome), type: 'jpeg', quality: 84 }); };
  if (PACK) { await p.setInputFiles('#packIn', PACK); await p.waitForFunction(() => /blocos com textura/.test(document.getElementById('toast').textContent), null, { timeout: 300000 }); }
  await shot('app-pasta.jpg');
  await p.click('#appPick'); await p.waitForSelector('[data-aw]'); await shot('app-mundos.jpg');
  await p.click('[data-aw="0"]'); await p.waitForSelector('#appNbt', { timeout: 300000 });
  // jogador de exemplo (o mundo do servidor não tem o jogador do aparelho), com uma espada encantada
  await ev(`(function(){ var f = function (n) { var b = new Uint8Array(4); new DataView(b.buffer).setFloat32(0, n, true); return b; };
    var it = function (nm, n, slot, ench) { var c = [{ k: 'Count', t: 1, v: n }, { k: 'Damage', t: 2, v: 0 }, { k: 'Name', t: 8, v: nm ? 'minecraft:' + nm : '' }, { k: 'WasPickedUp', t: 1, v: 0 }, { k: 'Slot', t: 1, v: slot }]; if (ench) c.push({ k: 'tag', t: 10, v: [{ k: 'ench', t: 9, v: { et: 10, a: ench.map(function (e) { return [{ k: 'id', t: 2, v: e[0] }, { k: 'lvl', t: 2, v: e[1] }]; }) } }] }); return c; };
    var inv = []; for (var s = 0; s < 36; s++) inv.push(s === 0 ? it('diamond_sword', 1, 0, [[9, 3]]) : s === 1 ? it('bread', 12, 1) : it('', 0, s));
    wio.patches.set('~local_player', nbtTreeWrite({ k: '', t: 10, v: [{ k: 'Inventory', t: 9, v: { et: 10, a: inv } }, { k: 'DimensionId', t: 3, v: 0 }, { k: 'Pos', t: 9, v: { et: 5, a: [f(4.5), f(80), f(6.5)] } }, { k: 'PlayerGameMode', t: 3, v: 0 }] }));
    wio.player = { dim: 0, x: 4, z: 6 }; })()`);
  await shot('app-mundo.jpg');
  // mapa com duas marcações
  await p.click('#appMap'); await p.waitForFunction(() => !/visão geral/.test((document.getElementById('wmvStat') || {}).textContent || 'x'), null, { timeout: 300000 });
  await ev(`wio.marks = [{ n: 'Casa', c: '#e8453c', d: 0, x: 8, y: 70, z: 10 }, { n: 'Portal', c: '#9a5ce6', d: 0, x: -20, y: 66, z: 30 }]; wmMarksSave(); wm.cx = 0; wm.cz = 15; wm.s = 6 * wm.dpr; wm.sel = [8, 10]; wmInfo(); wmDraw()`);
  await p.waitForTimeout(3000); await shot('app-mapa.jpg');
  await p.click('#wmvMk'); await p.waitForTimeout(300); await shot('app-marcacoes.jpg');
  await ev('closeDialog(); closeWorldMap()');
  // Editor NBT: meio-dia, e a espada com Afiação 5
  await p.click('#appNbt'); await p.waitForSelector('#nbeBody .nberow');
  await p.click('[data-nhr="6000"]'); await p.waitForTimeout(200);
  await p.click('[data-nt="inv"]'); await p.waitForTimeout(800); await p.click('[data-ns="main:0"]'); await p.waitForTimeout(300);
  await p.fill('[data-enlv="0"]', '5'); await p.dispatchEvent('[data-enlv="0"]', 'change'); await p.waitForTimeout(300);
  await shot('app-nbt.jpg');
  const before = listDir(path.join(WORLDS, worlds[0])).map(f => f.p);
  await p.click('#nbeOk'); await p.waitForSelector('#apwOk'); await shot('app-gravar.jpg');
  await p.click('#apwOk'); await p.waitForSelector('#appUndo', { timeout: 60000 }); await p.waitForTimeout(500);
  const after = listDir(path.join(WORLDS, worlds[0])).map(f => f.p), novos = after.filter(f => before.indexOf(f) < 0);
  console.log('arquivos novos no mundo:', novos);
  // lê de volta do disco: abre o mundo de novo (agora o jogador vem do .log gravado)
  await p.click('#appBack'); await p.click('[data-aw="0"]'); await p.waitForSelector('#appNbt', { timeout: 300000 });
  const back = await ev(`(async function(){ var pl = nbtRead(await ldbGet(wio.db, '~local_player'), true), ld = nbtRead((await wio.zip.read('level.dat')).subarray(8), true);
    return JSON.stringify({ espada: pl.Inventory[0].tag, hora: ld.Time != null ? ld.Time : ld.time, criativo: ld.hasBeenLoadedInCreative }); })()`);
  console.log('lido de volta:', back);
  await shot('app-mundo2.jpg');
  console.log('erros', errs); await b.close();
})();
