/* ---------- Aplicativo para Android: Editor NBT e mapa direto na pasta dos mundos do jogo ---------- */
/* O aplicativo (pasta android/ do repositório) é este mesmo site dentro de uma WebView, com uma ponte (window.BabApp)
   para a pasta dos mundos do Minecraft, escolhida uma vez pelo seletor do Android (SAF):
   - BabApp.pickFolder(caminho): abre o seletor já nessa pasta (como o File Manager+ pede, o que no Android 11 e 12 deixa
     escolher dentro de Android/data); a resposta chega em appFolderPicked(ok, msg).
   - BabApp.folder(): a pasta escolhida ('' se nenhuma). BabApp.worlds(): JSON [{ id, name, time, icon }].
   - Leitura: fetch('/w/<id>/list') dá [{ p, s }] (caminho e tamanho, com a pasta db); fetch('/w/<id>/f/<caminho>') dá o
     arquivo. A WebView responde direto da pasta, sem copiar o mundo.
   - BabApp.write(id, caminho, base64), BabApp.remove(id, caminho): 'ok' ou a mensagem do erro.
   - BabApp.backup(id, caminho, carimbo) e BabApp.restore(id, caminho, carimbo): cópia de segurança na área do aplicativo.
   Gravar no mundo: o level.dat (e o levelname.txt) trocados e um .log novo na pasta db com as chaves mudadas (o jogador
   do aparelho), do mesmo jeito que o Exportar mundo grava (o jogo lê o .log ao abrir e junta ao banco). O Minecraft tem de
   estar fechado: aberto, ele regrava o mundo por cima. "Desfazer a última gravação" volta o level.dat e apaga o .log
   enquanto o jogo ainda não abriu o mundo (depois que o jogo abre, ele junta o .log ao banco e apaga o arquivo).
   Guardado no aparelho (IndexedDB 'bab-app'), para abrir sem ler o mundo de novo:
   - 't:<mundo>|<tabela>': as chaves de cada tabela .ldb (uma tabela nunca muda depois de criada; as novas, que o jogo cria
     ao jogar, são lidas e guardadas na vez seguinte). As tabelas só são lidas quando um valor delas é pedido (ldbTable).
   - 'map:<mundo>:<dimensão>': a visão geral do mapa já desenhada, com a assinatura dos arquivos da pasta db (nome e
     tamanho) de quando foi feita. Se o jogo mudou o mundo, o mapa guardado aparece na hora e é refeito por trás.
   - 'm:<mundo>': a assinatura da última preparação. Na lista dos mundos (ao abrir o aplicativo e ao voltar para ele), os
     mundos novos na pasta ou mudados pelo jogo são preparados sozinhos, um de cada vez. */
var app = null; // { worlds, world: { id, name }, saved: false }
function appBase() { return location.origin; }
function appEnc(s) { return encodeURIComponent(s); }
function appB64(u) {
  var s = '', CH = 0x8000;
  for (var i = 0; i < u.length; i += CH) s += String.fromCharCode.apply(null, u.subarray(i, i + CH));
  return btoa(s);
}
async function appFetch(url, bin) {
  var r = await fetch(url); if (!r.ok) throw new Error('Não foi possível ler ' + decodeURIComponent(url.split('/').pop()) + ' (' + r.status + ').');
  return bin ? new Uint8Array(await r.arrayBuffer()) : r.json();
}
/* A fonte dos arquivos do mundo (como a de um .zip: paths e read) */
async function appWorldSrc(id) {
  var list = await appFetch(appBase() + '/w/' + appEnc(id) + '/list');
  var sizes = new Map(); list.forEach(function (f) { sizes.set(f.p, f.s); });
  return { paths: list.map(function (f) { return f.p; }), size: function (p) { return sizes.get(p); }, dir: true,
    read: function (p) { return appFetch(appBase() + '/w/' + appEnc(id) + '/f/' + p.split('/').map(appEnc).join('/'), true); } };
}
/* ---------- O que fica guardado no aparelho ---------- */
var appIdbP = null;
function appIdb() {
  if (!appIdbP) appIdbP = new Promise(function (res, rej) { var q = indexedDB.open('bab-app', 1); q.onupgradeneeded = function () { q.result.createObjectStore('c'); }; q.onsuccess = function () { res(q.result); }; q.onerror = function () { rej(q.error); }; });
  return appIdbP;
}
async function appDb(mode, fn) {
  var db = await appIdb();
  return new Promise(function (res, rej) { var t = db.transaction('c', mode), r = fn(t.objectStore('c')); t.oncomplete = function () { res(r && r.result); }; t.onerror = t.onabort = function () { rej(t.error); }; });
}
function appGet(k) { return appDb('readonly', function (st) { return st.get(k); }).catch(function () { return null; }); }
function appPut(k, v) { return appDb('readwrite', function (st) { st.put(v, k); }).catch(function () {}); }
/* apaga as chaves que começam com pre e não passam em keep */
function appPrune(pre, keep) {
  return appDb('readwrite', function (st) { var q = st.openKeyCursor(IDBKeyRange.bound(pre, pre + '\uffff')); q.onsuccess = function () { var c = q.result; if (!c) return; if (!keep(c.key)) st.delete(c.key); c.continue(); }; }).catch(function () {});
}
function appTCache(id) { return { get: function (n) { return appGet('t:' + id + '|' + n); }, put: function (n, e) { return appPut('t:' + id + '|' + n, e); } }; }
/* a assinatura da pasta db: muda quando o jogo grava no mundo */
function appSig(src) {
  var L = src.paths.filter(function (p) { return p.indexOf('db/') === 0; }).sort().map(function (p) { return p + ':' + src.size(p); }).join('|'), h = 2166136261;
  for (var i = 0; i < L.length; i++) h = Math.imul(h ^ L.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36) + '.' + L.length;
}
async function appZ(u) { return new Uint8Array(await new Response(new Blob([u]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer()); }
async function appMapPack(m, sig) {
  return { sig: sig, w: m.w, h: m.h, x0: m.x0, z0: m.z0, sc: m.sc, min: m.min, bcnt: m.bcnt, img: await appZ(new Uint8Array(m.img.data.buffer)), bimg: await appZ(new Uint8Array(m.bimg.data.buffer)), bid: await appZ(m.bid) };
}
async function appMapUnpack(p) {
  return { w: p.w, h: p.h, x0: p.x0, z0: p.z0, sc: p.sc, min: p.min, bcnt: p.bcnt, img: new ImageData(new Uint8ClampedArray((await inflate(p.img)).buffer), p.w, p.h), bimg: new ImageData(new Uint8ClampedArray((await inflate(p.bimg)).buffer), p.w, p.h), bid: await inflate(p.bid) };
}
function appDimsOf(o) { return [0, 1, 2].filter(function (d) { return Array.from(o.dims[d].values()).some(function (c) { return c.ok; }); }); }
/* abre o mundo (com as chaves guardadas) e põe no objeto os mapas guardados; stale: as dimensões cujo mapa falta ou é velho */
async function appLoad(w, prog) {
  var src = await appWorldSrc(w.id), sig = appSig(src);
  var o = await wioOpenFile(src, prog, appTCache(w.id));
  if (o.java || o.old) throw new Error('O aplicativo abre os mundos do Bedrock atual.');
  o.markId = 'app:' + w.id; o.name = o.name || w.name; o.sig = sig; o.stale = [];
  if (o.leg) o.legKeep = true; // chunks no formato antigo: o mapa mostra como estão (o aplicativo não converte)
  var dims = appDimsOf(o);
  for (var i = 0; i < dims.length; i++) {
    var p = await appGet('map:' + w.id + ':' + dims[i]), m = null;
    if (p) { try { m = await appMapUnpack(p); } catch (e) { m = null; } }
    if (m) o.maps[dims[i]] = m;
    if (!m || p.sig !== sig) o.stale.push(dims[i]);
  }
  // tabelas que o jogo já apagou: as chaves guardadas delas saem
  var live = {}; o.db.tnames.forEach(function (n) { live['t:' + w.id + '|' + n] = 1; });
  appPrune('t:' + w.id + '|', function (k) { return live[k]; });
  return o;
}
/* refaz os mapas velhos ou que faltam (com wio = o); prog(texto) */
async function appMaps(o, w, prog) {
  while (o.stale.length) {
    var d = o.stale[0], had = !!o.maps[d], label = WIO_DIMS[d].name;
    if (wio !== o) return false;
    var cb = function (i, n) { prog(label + ': ' + Math.round(100 * i / Math.max(1, n)) + '%'); };
    var m = had ? await wioMapDraw(d, cb) : await wioMap(d, cb); // sem mapa guardado: o mesmo desenho que o mapa aberto usaria
    if (wio !== o) return false;
    o.maps[d] = m; o.stale.shift();
    if (m) await appPut('map:' + w.id + ':' + d, await appMapPack(m, o.sig));
    if (had && wm && wm.dim === d) { wm.ov = m; wm.ovT = await createImageBitmap(m.img); wm.ovB = await createImageBitmap(m.bimg); wmDraw(); } // o mapa aberto troca para o novo
  }
  await appPut('m:' + w.id, { sig: o.sig, t: Date.now() });
  return true;
}
function appStart() {
  document.body.classList.add('app');
  app = { worlds: [], world: null };
  var div = document.createElement('div'); div.id = 'appHome'; document.body.appendChild(div);
  appList();
}
window.appFolderPicked = function (ok, msg) { if (!ok && msg) toast(msg, 9000); appList(); };
/* o Android avisa quando o aplicativo volta para a tela (o jogo pode ter mudado os mundos) */
window.appResume = function () {
  if (!app) return;
  if (!app.world) { if (!overlayRoot.firstChild) appList(); return; }
  if (app.checking) return; app.checking = true;
  appWorldSrc(app.world.id).then(function (src) { app.checking = false; if (wio && app.world && appSig(src) !== wio.sig && !app.writing) { app.changed = true; appWorldHome(); } }, function () { app.checking = false; });
};
function appList() {
  closeWorldMap(); if (!app.job) wio = null; app.world = null; app.changed = false;
  var folder = BabApp.folder(), worlds = [];
  if (folder) { try { worlds = JSON.parse(BabApp.worlds()); } catch (e) { toast('Não foi possível ler a pasta: ' + e.message, 8000); } }
  app.worlds = worlds;
  var h = '<header><b>Bloco a Bloco</b><span>Editor de mundos</span></header>';
  if (!folder) h += '<div class="appbox"><p>Escolha a pasta do Minecraft. O seletor do Android abre já nela (<code>Android/data/com.mojang.minecraftpe</code>): toque em <b>Usar esta pasta</b> e depois em <b>Permitir</b>. O aplicativo acha os mundos dentro.</p><button class="btn primary" id="appPick">Escolher a pasta do Minecraft</button>' +
    '<p class="mixl">Se o seletor não deixar usar a pasta, tente abrir nas outras:</p><div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn" data-apk="Android/data/com.mojang.minecraftpe/files/games/com.mojang/minecraftWorlds">Abrir em minecraftWorlds</button><button class="btn" data-apk="Android/data">Abrir em Android/data</button></div></div>';
  else {
    h += '<div class="applist">' + (worlds.length ? worlds.map(function (w, i) {
      return '<button class="appworld" data-aw="' + i + '">' + (w.icon ? '<img src="' + appBase() + '/w/' + appEnc(w.id) + '/f/world_icon.jpeg" alt="">' : '<span class="noimg"></span>') +
        '<span><b>' + esc(w.name) + '</b><small>' + (w.time ? new Date(w.time).toLocaleString('pt-BR') : '') + '</small><small class="appst" id="aps' + i + '"></small></span></button>';
    }).join('') : '<p>Nenhum mundo nesta pasta. Confira se é a pasta <code>minecraftWorlds</code> (ou a <code>com.mojang</code>).</p>') + '</div>' +
      '<div class="row appfoot"><button class="btn" id="appPick">Trocar a pasta</button><button class="btn" id="appTex">Texturas…</button></div>';
  }
  $('appHome').innerHTML = h;
  $('appPick').onclick = function () { BabApp.pickFolder('Android/data/com.mojang.minecraftpe'); };
  document.querySelectorAll('[data-apk]').forEach(function (b) { b.onclick = function () { BabApp.pickFolder(b.getAttribute('data-apk')); }; });
  if ($('appTex')) $('appTex').onclick = openTextures;
  document.querySelectorAll('[data-aw]').forEach(function (b) { b.onclick = function () { appOpen(app.worlds[+b.getAttribute('data-aw')]); }; });
  appScan();
}
function appStatus(w, t) { w.st = t; var i = app.worlds.indexOf(w), e = i >= 0 && $('aps' + i); if (e) e.textContent = t; }
/* confere cada mundo da pasta e prepara (chaves e mapa) os novos e os que o jogo mudou, um de cada vez */
async function appScan() {
  var my = app.scan = {}, todo = [];
  for (var i = 0; i < app.worlds.length; i++) {
    var w = app.worlds[i];
    if (app.job && app.job.w.id === w.id) { appStatus(w, app.job.st || 'Preparando…'); continue; }
    try {
      var src = await appWorldSrc(w.id), meta = await appGet('m:' + w.id), sig = appSig(src);
      if (app.scan !== my) return;
      if (meta && meta.sig === sig) appStatus(w, 'Pronto para abrir');
      else { appStatus(w, meta ? 'Mudou no jogo: vai ser atualizado' : 'Novo: vai ser lido'); todo.push(w); }
    } catch (e) { appStatus(w, ''); }
  }
  if (app.job) await app.job.p;
  for (var j = 0; j < todo.length; j++) {
    if (app.scan !== my || app.world) return; // saiu da lista: para (volta na próxima vez)
    await appPrepare(todo[j]);
  }
}
/* a preparação para no meio quando outro mundo é aberto (job.cancel): as chaves das tabelas já lidas ficam guardadas, e
   ela continua de onde parou na próxima vez que a lista aparecer */
function appPrepare(w) {
  var job = app.job = { w: w, st: 'Lendo…', cancel: false };
  var st = function (t) { if (job.cancel) throw new Error('parado'); job.st = t; appStatus(w, t); };
  job.p = (async function () {
    try {
      var o = await appLoad(w, function (i, n) { st('Lendo: ' + Math.round(100 * i / Math.max(1, n)) + '%'); });
      if (wio && wio !== o && app.world) throw new Error('aberto outro');
      wio = o; job.o = o;
      var ok = await appMaps(o, w, function (t) { st('Desenhando o mapa: ' + t); });
      if (wio === o && !app.world) wio = null;
      st(ok ? 'Pronto para abrir' : '');
    } catch (e) { job.st = job.cancel ? 'Pausado: continua ao voltar para a lista' : ''; appStatus(w, job.st); if (wio === job.o && !app.world) wio = null; }
    finally { if (app.job === job) app.job = null; }
  })();
  return job.p;
}
async function appOpen(w) {
  try {
    if (app.job) {
      var job = app.job; app.scan = null; // a fila de preparação para
      if (job.w.id === w.id) busy('Terminando de preparar ' + w.name + '…', null); // o mesmo mundo: espera ficar pronto
      else job.cancel = true; // outro mundo: a preparação pausa (continua quando a lista aparecer de novo)
      await job.p;
    }
    busy('Abrindo ' + w.name + '…', null);
    var o = await appLoad(w, function (i, n) { busy('Lendo o mundo: ' + Math.round(i) + ' de ' + n + ' arquivos', i / n); });
    wio = o; app.world = w; app.changed = false; busyEnd();
    appWorldHome();
    if (o.stale.length) { // o mapa guardado é velho ou falta: refaz por trás
      var e = function (t) { var x = $('appMapSt'); if (x) x.textContent = 'Atualizando o mapa (' + t + ')…'; };
      appMaps(o, w, e).then(function (ok) { var x = $('appMapSt'); if (x && ok) x.textContent = 'Mapa atualizado.'; }, function () { var x = $('appMapSt'); if (x) x.textContent = ''; });
    }
  } catch (e) { busyEnd(); toast(e.message || 'Não foi possível abrir o mundo.', 9000); }
}
function appUndoKey() { return 'bloco-a-bloco-app-desfazer:' + app.world.id; }
function appWorldHome() {
  var u = null; try { u = JSON.parse(localStorage.getItem(appUndoKey()) || 'null'); } catch (e) {}
  $('appHome').innerHTML = '<header><button class="btn" id="appBack">‹ Mundos</button><b>' + esc(wio.name) + '</b></header>' +
    '<div class="appbox">' + (app.changed ? '<div class="info">O mundo mudou fora do aplicativo (o jogo gravou nele). Leia de novo antes de editar.<div class="row" style="margin-top:6px"><button class="btn primary" id="appReread">Ler o mundo de novo</button></div></div>' : '') +
    '<button class="btn primary big" id="appMap">Mapa e marcações</button><small class="mixl" id="appMapSt"></small><button class="btn primary big" id="appNbt">Editor NBT</button>' +
    (u ? '<button class="btn" id="appUndo">Desfazer a última gravação (' + new Date(u.t).toLocaleString('pt-BR') + ')</button>' : '') +
    '<p class="mixl">O Editor NBT grava direto neste mundo, com o Minecraft fechado. Antes de gravar, o aplicativo guarda uma cópia do que vai trocar.</p></div>';
  $('appBack').onclick = appList;
  $('appMap').onclick = openWorldMap;
  $('appNbt').onclick = openNbtEditor;
  if ($('appUndo')) $('appUndo').onclick = function () { appUndo(u); };
  if ($('appReread')) $('appReread').onclick = function () { appOpen(app.world); };
}
/* Grava no mundo o que o Editor NBT mudou (wio.files e wio.patches, como o Exportar mundo) */
function appConfirm() {
  if (appConfirm.ok) return Promise.resolve(true);
  return new Promise(function (res) {
    openDialog('<h3>Gravar no mundo</h3><p>Feche o Minecraft antes de gravar, inclusive em segundo plano (deslize ele para fora da lista de apps recentes). Com o jogo aberto, ele regrava o mundo por cima e as mudanças se perdem, ou o mundo pode estragar.</p>' +
      '<div class="row"><button class="btn primary" id="apwOk">O jogo está fechado: gravar</button><button class="btn" id="apwNo">Voltar</button></div>', function () {
      $('apwOk').onclick = function () { closeDialog(); appConfirm.ok = true; res(true); }; $('apwNo').onclick = function () { closeDialog(); res(false); };
    });
  });
}
async function appWrite() {
  var id = app.world.id, t = Date.now(), names = [], undo = { t: t, files: [], added: null };
  var src = await appWorldSrc(id); // o que existe agora na pasta
  if (appSig(src) !== wio.sig) { app.changed = true; appWorldHome(); throw new Error('O mundo mudou fora do aplicativo (o jogo gravou nele) depois de aberto. Toque em Ler o mundo de novo e refaça a mudança. Nada foi mudado no mundo.'); }
  app.writing = true;
  if (wio.files) wio.files.forEach(function (d, nm) { names.push(nm); });
  var log = null;
  if (wio.patches.size) {
    var ents = []; wio.patches.forEach(function (v, k) { ents.push([k, v]); });
    ents.sort(function (a, b) { return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0; });
    var num = wio.db.maxFile + 1, nm = String(num); while (nm.length < 6) nm = '0' + nm;
    log = { name: 'db/' + nm + '.log', data: ldbLogWrite(ents, wio.db.maxSeq + 1), n: ents.length, num: num };
    if (src.paths.indexOf(log.name) >= 0) throw new Error('Já existe ' + log.name + ' na pasta: o jogo mexeu no mundo. Volte à lista e abra o mundo de novo.');
  }
  busy('Gravando no mundo…', null);
  try {
    var chk = function (r, what) { if (r !== 'ok') throw new Error('Não foi possível gravar ' + what + ': ' + r); };
    for (var i = 0; i < names.length; i++) if (src.paths.indexOf(names[i]) >= 0) { chk(BabApp.backup(id, names[i], String(t)), 'a cópia de ' + names[i]); undo.files.push(names[i]); }
    // o .log primeiro e o level.dat depois; se algo falhar no meio, o que já foi gravado volta (o mundo fica como estava)
    try {
      if (log) { chk(BabApp.write(id, log.name, appB64(log.data)), log.name); undo.added = log.name; }
      for (i = 0; i < names.length; i++) { chk(BabApp.write(id, names[i], appB64(wio.files.get(names[i]))), names[i]); undo.done = i + 1; }
    } catch (e) {
      for (i = 0; i < (undo.done || 0); i++) if (undo.files.indexOf(names[i]) >= 0) BabApp.restore(id, names[i], String(t));
      if (undo.added) BabApp.remove(id, undo.added);
      throw new Error(e.message + ' Nada foi mudado no mundo.');
    }
    if (log) { wio.db.maxFile = log.num; wio.db.maxSeq += log.n; }
    try { localStorage.setItem(appUndoKey(), JSON.stringify(undo)); } catch (e) {}
    // a gravação não muda os chunks: o mapa guardado continua valendo, com a assinatura nova da pasta
    var old = wio.sig; wio.sig = appSig(await appWorldSrc(id));
    var meta = await appGet('m:' + id); if (meta && meta.sig === old) await appPut('m:' + id, { sig: wio.sig, t: Date.now() });
    for (var d = 0; d < 3; d++) { var p = await appGet('map:' + id + ':' + d); if (p && p.sig === old) { p.sig = wio.sig; await appPut('map:' + id + ':' + d, p); } }
  } finally { busyEnd(); app.writing = false; }
  appWorldHome();
  return true;
}
/* o botão Gravar mudanças do Editor NBT no aplicativo: confirma que o jogo está fechado, junta e grava no mundo */
async function appNbeSave() {
  if (!nbe.dirtyL && !nbe.dirtyP) { closeDialog(); toast('Nada mudou.'); return; }
  if (!(await appConfirm())) { nbeOpen(); return; }
  try {
    await nbeCommit(); closeDialog();
    if (await appWrite()) toast('Gravado no mundo.' + (nbe && !nbe.java && nbe.cheat ? ' As conquistas ficam desativadas nele.' : '') + ' Já pode abrir o Minecraft.', 8000);
  } catch (e) { busyEnd(); toast(e.message || 'Não foi possível gravar.', 10000); }
}
async function appUndo(u) {
  var id = app.world.id, src = await appWorldSrc(id);
  if (u.added && src.paths.indexOf(u.added) < 0) { toast('O jogo já abriu o mundo depois da gravação (ele junta as mudanças ao banco): não dá mais para desfazer por aqui.', 9000); localStorage.removeItem(appUndoKey()); appWorldHome(); return; }
  var r;
  for (var i = 0; i < u.files.length; i++) { r = BabApp.restore(id, u.files[i], String(u.t)); if (r !== 'ok') { toast('Não foi possível voltar ' + u.files[i] + ': ' + r, 9000); return; } }
  if (u.added) { r = BabApp.remove(id, u.added); if (r !== 'ok') { toast('Não foi possível apagar ' + u.added + ': ' + r, 9000); return; } }
  localStorage.removeItem(appUndoKey());
  toast('A última gravação foi desfeita.', 5000);
  appOpen(app.world);
}
/* o botão Voltar do Android: fecha a janela aberta, o mapa ou o mundo; na lista de mundos, sai do aplicativo */
function appOnBack() {
  if (!app) return false;
  if (overlayRoot.firstChild) { closeDialog(); return true; }
  if (wm) { closeWorldMap(); return true; }
  if (app.world) { appList(); return true; }
  return false;
}
