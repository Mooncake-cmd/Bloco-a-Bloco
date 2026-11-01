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
   enquanto o jogo ainda não abriu o mundo (depois que o jogo abre, ele junta o .log ao banco e apaga o arquivo). */
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
function appStart() {
  document.body.classList.add('app');
  app = { worlds: [], world: null };
  var div = document.createElement('div'); div.id = 'appHome'; document.body.appendChild(div);
  appList();
}
window.appFolderPicked = function (ok, msg) { if (!ok && msg) toast(msg, 9000); appList(); };
function appList() {
  closeWorldMap(); wio = null; app.world = null;
  var folder = BabApp.folder(), worlds = [];
  if (folder) { try { worlds = JSON.parse(BabApp.worlds()); } catch (e) { toast('Não foi possível ler a pasta: ' + e.message, 8000); } }
  app.worlds = worlds;
  var h = '<header><b>Bloco a Bloco</b><span>Editor de mundos</span></header>';
  if (!folder) h += '<div class="appbox"><p>Escolha a pasta do Minecraft. O seletor do Android abre já nela (<code>Android/data/com.mojang.minecraftpe</code>): toque em <b>Usar esta pasta</b> e depois em <b>Permitir</b>. O aplicativo acha os mundos dentro.</p><button class="btn primary" id="appPick">Escolher a pasta do Minecraft</button>' +
    '<p class="mixl">Se o seletor não deixar usar a pasta, tente abrir nas outras:</p><div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn" data-apk="Android/data/com.mojang.minecraftpe/files/games/com.mojang/minecraftWorlds">Abrir em minecraftWorlds</button><button class="btn" data-apk="Android/data">Abrir em Android/data</button></div></div>';
  else {
    h += '<div class="applist">' + (worlds.length ? worlds.map(function (w, i) {
      return '<button class="appworld" data-aw="' + i + '">' + (w.icon ? '<img src="' + appBase() + '/w/' + appEnc(w.id) + '/f/world_icon.jpeg" alt="">' : '<span class="noimg"></span>') +
        '<span><b>' + esc(w.name) + '</b><small>' + (w.time ? new Date(w.time).toLocaleString('pt-BR') : '') + '</small></span></button>';
    }).join('') : '<p>Nenhum mundo nesta pasta. Confira se é a pasta <code>minecraftWorlds</code> (ou a <code>com.mojang</code>).</p>') + '</div>' +
      '<div class="row appfoot"><button class="btn" id="appPick">Trocar a pasta</button><button class="btn" id="appTex">Texturas…</button></div>';
  }
  $('appHome').innerHTML = h;
  $('appPick').onclick = function () { BabApp.pickFolder('Android/data/com.mojang.minecraftpe'); };
  document.querySelectorAll('[data-apk]').forEach(function (b) { b.onclick = function () { BabApp.pickFolder(b.getAttribute('data-apk')); }; });
  if ($('appTex')) $('appTex').onclick = openTextures;
  document.querySelectorAll('[data-aw]').forEach(function (b) { b.onclick = function () { appOpen(app.worlds[+b.getAttribute('data-aw')]); }; });
}
async function appOpen(w) {
  try {
    busy('Abrindo ' + w.name + '…', null);
    var src = await appWorldSrc(w.id);
    var o = await wioOpenFile(src, function (i, n) { busy('Lendo o mundo: ' + Math.round(i) + ' de ' + n + ' arquivos', i / n); });
    if (o.java || o.old) throw new Error('O aplicativo abre os mundos do Bedrock atual.');
    o.markId = 'app:' + w.id; o.name = o.name || w.name;
    if (o.leg) o.legKeep = true; // chunks no formato antigo: o mapa mostra como estão (o aplicativo não converte)
    wio = o; app.world = w; busyEnd();
    appWorldHome();
  } catch (e) { busyEnd(); toast(e.message || 'Não foi possível abrir o mundo.', 9000); }
}
function appUndoKey() { return 'bloco-a-bloco-app-desfazer:' + app.world.id; }
function appWorldHome() {
  var u = null; try { u = JSON.parse(localStorage.getItem(appUndoKey()) || 'null'); } catch (e) {}
  $('appHome').innerHTML = '<header><button class="btn" id="appBack">‹ Mundos</button><b>' + esc(wio.name) + '</b></header>' +
    '<div class="appbox"><button class="btn primary big" id="appMap">Mapa e marcações</button><button class="btn primary big" id="appNbt">Editor NBT</button>' +
    (u ? '<button class="btn" id="appUndo">Desfazer a última gravação (' + new Date(u.t).toLocaleString('pt-BR') + ')</button>' : '') +
    '<p class="mixl">O Editor NBT grava direto neste mundo, com o Minecraft fechado. Antes de gravar, o aplicativo guarda uma cópia do que vai trocar.</p></div>';
  $('appBack').onclick = appList;
  $('appMap').onclick = openWorldMap;
  $('appNbt').onclick = openNbtEditor;
  if ($('appUndo')) $('appUndo').onclick = function () { appUndo(u); };
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
  } finally { busyEnd(); }
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
