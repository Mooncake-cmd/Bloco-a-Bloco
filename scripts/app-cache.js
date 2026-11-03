// Confere o que o aplicativo guarda no aparelho (src/appmode.js), com a mesma pasta simulada do scripts/guia/app.js:
// a preparação sozinha dos mundos da pasta, abrir de novo (tempo, tabelas .ldb lidas), reabrir o aplicativo e um mundo
// mudado "pelo jogo" (um .log a mais na pasta db, apagado no fim).
// node scripts/app-cache.js <url do editor> <pasta com mundos>
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs'), path = require('path');
const [EDITOR, WORLDS] = process.argv.slice(2);
const listDir = (dir, pre = '') => fs.readdirSync(dir).flatMap(f => { const p = path.join(dir, f); return fs.statSync(p).isDirectory() ? (pre ? [] : listDir(p, pre + f + '/')) : [{ p: pre + f, s: fs.statSync(p).size }]; });
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: 412, height: 860 } });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  const worlds = fs.readdirSync(WORLDS).filter(d => fs.existsSync(path.join(WORLDS, d, 'level.dat'))).sort();
  const info = worlds.map(d => ({ id: d, name: d, time: 0, icon: false }));
  await p.addInitScript(info => { let folder = 'x'; window.BabApp = { folder: () => folder, worlds: () => JSON.stringify(info), pickFolder: () => {}, write: () => 'ok', backup: () => 'ok', restore: () => 'ok', remove: () => 'ok' }; }, info);
  const base = new URL(EDITOR).origin; let ldb = 0, bytes = 0;
  await p.route(base + '/w/**', r => {
    const u = new URL(r.request().url()), m = /^\/w\/([^/]+)\/(list|f\/(.*))$/.exec(u.pathname), id = decodeURIComponent(m[1]);
    if (m[2] === 'list') return r.fulfill({ contentType: 'application/json', body: JSON.stringify(listDir(path.join(WORLDS, id))) });
    const f = path.join(WORLDS, id, ...m[3].split('/').map(decodeURIComponent));
    if (/\.ldb$/.test(f)) ldb++; if (fs.existsSync(f)) bytes += fs.statSync(f).size;
    return fs.existsSync(f) ? r.fulfill({ body: fs.readFileSync(f), contentType: 'application/octet-stream' }) : r.fulfill({ status: 404, body: '' });
  });
  const st = () => p.evaluate(() => Array.from(document.querySelectorAll('.appst')).map(e => e.textContent));
  const wait = async (re, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const s = await st(); if (s.length && s.every(x => re.test(x))) return s; await p.waitForTimeout(500); } return await st(); };
  const openW = async (i) => { ldb = 0; bytes = 0; const t0 = Date.now(); await p.click('[data-aw="' + i + '"]'); await p.waitForSelector('#appNbt', { timeout: 900000 }); const t1 = Date.now() - t0;
    const t2 = Date.now(); await p.click('#appMap'); await p.waitForFunction(() => window.__bab.ev('!!(wm && wm.ov)'), null, { timeout: 900000, polling: 200 }); const t3 = Date.now() - t2;
    const r = { abrir: t1, mapa: t3, ldbLidas: ldb, MB: +(bytes / 1e6).toFixed(1), status: await p.evaluate(() => (document.getElementById('appMapSt') || {}).textContent) };
    await p.evaluate(() => window.__bab.ev('closeWorldMap()')); return r; };
  await p.goto(EDITOR); await p.waitForTimeout(2500);
  let t0 = Date.now(); console.log('1ª vez, preparando sozinho:', JSON.stringify(await wait(/Pronto/, 1800000)), ((Date.now() - t0) / 1000).toFixed(1) + ' s', 'MB lidos', (bytes / 1e6).toFixed(1));
  console.log('abrir Grande (já preparado):', JSON.stringify(await openW(0)));
  // fecha o aplicativo e abre de novo (o guardado fica)
  await p.reload(); await p.waitForTimeout(2500);
  console.log('depois de reabrir o app:', JSON.stringify(await st()));
  console.log('abrir Grande de novo:', JSON.stringify(await openW(0)));
  // o "jogo" muda o mundo: um .log novo na pasta db (cópia do .log atual)
  const db = path.join(WORLDS, worlds[0], 'db'), lg = fs.readdirSync(db).filter(f => /\.log$/.test(f)).sort().pop();
  fs.copyFileSync(path.join(db, lg), path.join(db, '999999.log'));
  await p.evaluate(() => window.appResume()); await p.waitForTimeout(1500);
  await p.click('#appBack'); await p.waitForTimeout(1500); console.log('depois do jogo mudar:', JSON.stringify(await st()));
  t0 = Date.now(); console.log('re-preparado:', JSON.stringify(await wait(/Pronto/, 1800000)), ((Date.now() - t0) / 1000).toFixed(1) + ' s');
  fs.unlinkSync(path.join(db, '999999.log'));
  console.log('erros', errs); await b.close();
})();
