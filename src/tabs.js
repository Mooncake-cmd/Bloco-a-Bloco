/* ---------- Abas: várias construções ou mundos abertos ao mesmo tempo ---------- */
/* Uma barra de abas em cima, como no navegador. Cada aba é um espaço de trabalho inteiro: a construção, o histórico,
   os biomas pintados, os contêineres, os comandos, os blocos de apoio e o mundo do jogo aberto (com a área).
   Tudo isso já fica salvo no navegador (IndexedDB) com as chaves w:, h: e wio:. Cada aba usa as dela, com um prefixo
   (T<id>:); a aba 0 fica sem prefixo, então o que já estava salvo continua sendo a primeira aba. Trocar de aba = gravar
   a aba atual (o salvamento automático e a sessão do mundo) e abrir a outra pelo mesmo caminho de quando a página
   recarrega. O mundo do jogo de cada aba fica lido na memória, para a troca não ler o arquivo de novo.
   Ficam de todas as abas: a biblioteca, os pacotes de textura, as paletas, a cópia do Ctrl+C (copiar numa aba e
   colar na outra), a ferramenta e as preferências. A redstone e a água só andam na aba aberta. */
var TAB_KEY = 'bloco-a-bloco-abas', TAB_WS = /^(w:|h:|wio:)/;
var tabs = { list: [{ id: 0, name: 'Construção 1' }], cur: 0, next: 1, busy: false, wio: {} };
try { var tb0 = JSON.parse(localStorage.getItem(TAB_KEY) || 'null'); if (tb0 && tb0.list && tb0.list.length) { tabs.list = tb0.list; tabs.cur = tb0.cur | 0; tabs.next = tb0.next || 1; } } catch (e) {}
if (!tabs.list.some(function (t) { return t.id === tabs.cur; })) tabs.cur = tabs.list[0].id;
function tabSaveMeta() { try { localStorage.setItem(TAB_KEY, JSON.stringify({ list: tabs.list, cur: tabs.cur, next: tabs.next })); } catch (e) {} }
function tabCur() { return tabs.list.filter(function (t) { return t.id === tabs.cur; })[0]; }
/* As chaves do espaço de trabalho da aba atual (as outras ficam iguais) */
function tabMapKey(k, id) { return (id == null ? tabs.cur : id) && typeof k === 'string' && TAB_WS.test(k) ? 'T' + (id == null ? tabs.cur : id) + ':' + k : k; }
function tabMapQuery(q) {
  if (q && typeof q === 'object' && 'lower' in q && typeof q.lower === 'string') return IDBKeyRange.bound(tabMapKey(q.lower), tabMapKey(q.upper), q.lowerOpen, q.upperOpen);
  return tabMapKey(q);
}
/* idbDo entrega a loja por aqui: na aba 0, a própria; nas outras, uma que põe o prefixo */
function tabStore(st) {
  if (!tabs.cur) return st;
  return {
    put: function (v, k) { return st.put(v, tabMapKey(k)); },
    get: function (k) { return st.get(tabMapKey(k)); },
    delete: function (k) { return st.delete(tabMapQuery(k)); },
    getAll: function (q, n) { return st.getAll(tabMapQuery(q), n); }
  };
}
/* Apaga tudo o que a aba id guardou */
function tabDropData(id) {
  return idb().then(function (db) {
    return new Promise(function (res) {
      var t = db.transaction('kv', 'readwrite'), st = t.objectStore('kv');
      if (id) st.delete(IDBKeyRange.bound('T' + id + ':', 'T' + id + ':￿'));
      else ['w:', 'h:', 'wio:'].forEach(function (p) { st.delete(IDBKeyRange.bound(p, p + '￿')); });
      t.oncomplete = t.onerror = t.onabort = function () { res(); };
    });
  }).catch(function () {});
}

/* ---------- Barra ---------- */
function tabRender() {
  var bar = $('tabbar'); if (!bar) return;
  bar.innerHTML = tabs.list.map(function (t) {
    var on = t.id === tabs.cur;
    return '<div class="tab' + (on ? ' on' : '') + '" data-tab="' + t.id + '" title="' + esc(t.name) + (on ? ' (dois cliques: renomear)' : '') + '">' +
      '<span class="tabic">' + (t.world ? '🌍' : '▦') + '</span><span class="tabnm">' + esc(t.name) + '</span>' +
      '<button class="tabx" data-tabx="' + t.id + '" title="Fechar a aba" aria-label="Fechar a aba">×</button></div>';
  }).join('') + '<button class="tabnew" id="tabNew" title="Nova aba (uma construção nova)" aria-label="Nova aba">+</button>';
}
function tabBind() {
  var bar = $('tabbar');
  bar.addEventListener('click', function (e) {
    var x = e.target.closest('[data-tabx]'); if (x) { e.stopPropagation(); tabClose(+x.getAttribute('data-tabx')); return; }
    if (e.target.closest('#tabNew')) { tabNew(); return; }
    var t = e.target.closest('[data-tab]'); if (t) tabSwitch(+t.getAttribute('data-tab'));
  });
  bar.addEventListener('dblclick', function (e) {
    var t = e.target.closest('[data-tab]'); if (!t || +t.getAttribute('data-tab') !== tabs.cur || e.target.closest('[data-tabx]')) return;
    tabRename();
  });
  bar.addEventListener('auxclick', function (e) { var t = e.target.closest('[data-tab]'); if (t && e.button === 1) { e.preventDefault(); tabClose(+t.getAttribute('data-tab')); } }); // botão do meio fecha, como no navegador
}
function tabRename() {
  var t = tabCur();
  openDialog('<h3>Nome da aba</h3><label>Nome<input type="text" id="tabNm" maxlength="40"></label><div class="row"><button class="btn primary" id="tabOk">Usar</button><button class="btn" id="tabNo">Cancelar</button></div>', function () {
    $('tabNm').value = t.name; $('tabNm').select();
    var go = function () { var v = $('tabNm').value.trim(); if (v) { t.name = v; t.auto = false; tabSaveMeta(); tabRender(); } closeDialog(); };
    $('tabOk').onclick = go; $('tabNo').onclick = closeDialog; $('tabNm').addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
  });
}
/* Nome automático: o do arquivo aberto ou o do mundo, enquanto a aba tiver o nome padrão */
function tabAutoName(nm, world) {
  var t = tabCur(); if (!t) return;
  if (world != null) t.world = !!world;
  if (nm && (t.auto !== false)) t.name = String(nm).replace(/\.(json|mcstructure|schem|litematic|mcworld|zip)$/i, '').slice(0, 40);
  tabSaveMeta(); tabRender();
}

/* ---------- Trocar, abrir e fechar ---------- */
function tabWait(cond, ms) { return new Promise(function (res) { var t0 = Date.now(); (function k() { if (cond() || Date.now() - t0 > ms) res(); else setTimeout(k, 40); })(); }); }
/* Grava tudo da aba atual e para o que está andando */
async function tabFlush() {
  if (walk) walkStop();
  if (typeof wm !== 'undefined' && wm) closeWorldMap();
  if (overlayRoot.firstChild) closeDialog();
  rsStop(); fluidStop();
  if (typeof projClear === 'function') projClear();
  var t = tabCur(); if (t) t.cam = { tx: cam.tx, ty: cam.ty, tz: cam.tz, dist: cam.dist, yaw: cam.yaw, pitch: cam.pitch };
  autosave();
  await tabWait(function () { return !autosaveBusy && !autosaveAgain; }, 15000);
  if (worldDirty.size || (hist && hist.dirty)) { autosave(); await tabWait(function () { return !autosaveBusy && !autosaveAgain; }, 15000); }
  if (wio) { await wioSaveSession(false); tabs.wio[tabs.cur] = wio; }
}
/* Abre a aba atual a partir do que ela guardou (como ao recarregar a página) */
async function tabLoad() {
  wio = null; sel = null; selA = null; pasting = false; anchor = null; anchor2 = null;
  var ok = false;
  try { ok = await wioRestore(); } catch (e) { ok = false; }
  if (!ok) { busy('Abrindo a aba…', null); try { ok = await loadAutosave(); } catch (e) { ok = false; } busyEnd(); }
  if (ok) { try { await histLoad(); } catch (e) {} }
  if (!ok) { newWorld(32, 32, 32); dirtyAll(); }
  var t = tabCur();
  if (t && t.cam) { Object.assign(cam, t.cam); updateCamera(); } else resetCamera();
  verCounter++; changed(); updateStatus(); renderList(); renderHotbar(); wioChip(); histUI(); selRefresh(); updatePreview();
  rsDayUpdate(true);
  if (t) t.world = !!wio;
  tabSaveMeta(); tabRender();
}
async function tabSwitch(id, pre) {
  if (tabs.busy || id === tabs.cur || !tabs.list.some(function (t) { return t.id === id; })) return;
  tabs.busy = true; document.body.classList.add('tab-busy');
  try {
    if (pre) await pre();
    await tabFlush();
    tabs.cur = id; tabSaveMeta(); tabRender();
    await tabLoad();
  } finally { tabs.busy = false; document.body.classList.remove('tab-busy'); }
}
async function tabNew() {
  if (tabs.busy) return;
  var id = tabs.next++, n = 1;
  while (tabs.list.some(function (t) { return t.name === 'Construção ' + n; })) n++;
  tabs.list.push({ id: id, name: 'Construção ' + n });
  await tabSwitch(id, function () { return tabDropData(id); }); // começa vazia (se sobrou algo de uma aba antiga com o mesmo número)
  toast('Aba nova: uma construção vazia. Abra um projeto, uma estrutura ou um mundo do jogo nela pelo menu Projeto. As outras abas continuam como estavam.', 6000);
}
function tabClose(id) {
  if (tabs.busy) return;
  var t = tabs.list.filter(function (q) { return q.id === id; })[0]; if (!t) return;
  var now = Date.now();
  if (tabClose.ask !== id || now - tabClose.t > 4000) { tabClose.ask = id; tabClose.t = now; toast('Clique de novo no × em até 4 s para fechar “' + t.name + '”: o que está nela (e não foi salvo em arquivo ou exportado) se perde.', 5000); return; }
  tabClose.ask = null;
  (async function () {
    tabs.busy = true;
    try {
      var i = tabs.list.indexOf(t);
      if (tabs.list.length === 1) { // a última: fica uma vazia no lugar
        rsStop(); fluidStop(); delete tabs.wio[id]; wio = null; await tabDropData(id);
        t.name = 'Construção 1'; t.auto = true; t.cam = null; t.world = false; tabs.cur = id; tabSaveMeta();
        newWorld(32, 32, 32); dirtyAll(); resetCamera(); changed(); updateStatus(); wioChip(); worldClear = true; autosave(); tabRender();
        return;
      }
      tabs.list.splice(i, 1); delete tabs.wio[id];
      if (id === tabs.cur) {
        rsStop(); fluidStop(); wio = null;
        tabs.cur = tabs.list[Math.min(i, tabs.list.length - 1)].id; tabSaveMeta(); tabRender();
        await tabDropData(id);
        await tabLoad();
      } else { tabSaveMeta(); tabRender(); await tabDropData(id); }
      toast('Aba fechada.');
    } finally { tabs.busy = false; }
  })();
}
/* O mundo já lido desta aba (para wioRestore não ler o arquivo de novo) */
function tabWioTake() { var w = tabs.wio[tabs.cur] || null; delete tabs.wio[tabs.cur]; return w; }
