/* ---------- Histórico em árvore (linha do tempo com ramificações) ---------- */
/* Cada ação (traço de pincel, forma, colar, mover, balde...) é um nó; o nó guarda a lista de mudanças (EditLog:
   posição, valor antigo, valor novo). O estado atual é um nó da árvore (hist.cur). Desfazer volta ao pai; refazer
   desce para o último filho visitado. Uma ação nova feita num ponto do passado vira um filho novo: um ramo, e o que
   havia depois continua guardado. Ir até qualquer nó = desfazer até o ancestral comum e refazer o caminho até ele.
   Nós podem ser marcados com nome ("versões"). A árvore vai junto no salvamento automático (IndexedDB, 'h:'). */
var hist = null, HIST_MAX_NODES = 1000;
function histReset() {
  hist = { nodes: new Map(), root: 0, cur: 0, next: 1, total: 0, dirty: true, clear: true, gone: [] };
  hist.nodes.set(0, { id: 0, p: -1, kids: [], b: null, label: 'Início', t: Date.now(), n: 0, saved: true });
  histUI();
}
function histNode(id) { return hist.nodes.get(id); }
function histTop() { var n = histNode(hist.cur); if (n && n.b) { n.saved = false; hist.dirty = true; return n.b; } return null; }
function histCanUndo() { return hist.cur !== hist.root; }
function histCanRedo() { var n = histNode(hist.cur); return !!(n && n.kids.length); }
function histLabelFor(t) { var e = TOOLS.filter(function (q) { return q[0] === t; })[0]; return e ? e[1].split(':')[0].replace(/\s*\(.*$/, '') : 'Edição'; }
/* Ação nova: vira filho do nó atual */
function histPush(b) {
  var p = histNode(hist.cur), id = hist.next++;
  var n = { id: id, p: p.id, kids: [], b: b, label: b.label || histLabelFor(effTool(lastShift)), t: Date.now(), n: b.length, saved: false };
  hist.nodes.set(id, n); p.kids.push(id); p.last = id; hist.cur = id; hist.total += b.length; hist.dirty = true;
  histTrim(); histUI();
}
function histApplyNode(n, undo) {
  applyBatch(n.b, undo);
  var s = undo ? n.b.selBefore : n.b.selAfter; if (s) { sel = s; selRefresh(); }
  var sp = undo ? n.b.symBefore : n.b.symAfter; if (sp) { sym.p = sp.slice(); symRefresh(); }
  // conteúdo que andou junto (mover e girar a seleção): [índice, registro, enchimento]; tira de onde estava e põe de volta
  var bf = undo ? n.b.beAfter : n.b.beBefore, bt = undo ? n.b.beBefore : n.b.beAfter;
  if (bf) bf.forEach(function (e) { if (bent.delete(e[0])) bentSave = true; if (rsFill.delete(e[0])) rsFillSave = true; });
  if (bt) bt.forEach(function (e) { if (e[1]) bentSet(e[0], JSON.parse(JSON.stringify(e[1])), true); else if (e[2]) { rsFill.set(e[0], e[2]); rsFillSave = true; } });
}
function histUndo() {
  var n = histNode(hist.cur); if (!n || n.id === hist.root) return false;
  histApplyNode(n, true); hist.cur = n.p; histNode(n.p).last = n.id; hist.dirty = true; histUI(); return true;
}
function histRedo() {
  var n = histNode(hist.cur); if (!n || !n.kids.length) return false;
  var k = histNode(n.last != null && n.kids.indexOf(n.last) >= 0 ? n.last : n.kids[n.kids.length - 1]);
  histApplyNode(k, false); hist.cur = k.id; n.last = k.id; hist.dirty = true; histUI(); return true;
}
function histPath(id) { var out = []; for (var n = histNode(id); n; n = n.p >= 0 ? histNode(n.p) : null) out.unshift(n.id); return out; }
/* Vai até qualquer nó: desfaz até o ancestral comum e refaz o caminho; os filhos visitados viram o "último" de cada ramo */
function histGoto(id) {
  if (!histNode(id) || id === hist.cur) return;
  fluidStop(); rsStop();
  var target = histPath(id), set = new Set(target), steps = 0;
  while (!set.has(hist.cur)) { histUndo(); steps++; }
  for (var i = target.indexOf(hist.cur) + 1; i < target.length; i++) {
    var k = histNode(target[i]); histApplyNode(k, false); histNode(k.p).last = k.id; hist.cur = k.id; steps++;
  }
  hist.dirty = true; histUI(); changed(); return steps;
}
/* Limite de memória: tira primeiro os ramos mais antigos fora do caminho atual; se só sobrar o caminho, o começo dele
   vira o novo início (as ações mais antigas deixam de poder ser desfeitas) */
function histTrim() {
  while (hist.total > UNDO_MAX || hist.nodes.size > HIST_MAX_NODES) {
    var keep = new Set(histPath(hist.cur)), best = null;
    hist.nodes.forEach(function (n) { if (!n.kids.length && !keep.has(n.id) && !n.mark && (!best || n.t < best.t)) best = n; });
    if (!best) hist.nodes.forEach(function (n) { if (!n.kids.length && !keep.has(n.id) && (!best || n.t < best.t)) best = n; });
    if (best) { histDrop(best); continue; }
    var path = histPath(hist.cur); if (path.length < 2) break;
    var oldRoot = histNode(path[0]), nr = histNode(path[1]);
    oldRoot.kids.forEach(function (k) { if (k !== nr.id) histDropTree(k); });
    hist.nodes.delete(oldRoot.id); hist.gone.push(oldRoot.id);
    hist.total -= nr.b ? nr.b.length : 0; nr.b = null; nr.p = -1; nr.label = 'Início (o mais antigo foi apagado)'; nr.saved = false; hist.root = nr.id;
  }
}
function histDrop(n) {
  var p = histNode(n.p); if (p) { p.kids = p.kids.filter(function (k) { return k !== n.id; }); if (p.last === n.id) delete p.last; }
  hist.total -= n.b ? n.b.length : 0; hist.nodes.delete(n.id); hist.gone.push(n.id); hist.dirty = true;
}
function histDropTree(id) { var n = histNode(id); if (!n) return; n.kids.slice().forEach(histDropTree); histDrop(n); }

/* ---------- Guardar e ler a árvore (junto com o salvamento automático) ---------- */
function histSaveInto(st, clear) {
  if (!hist || !(hist.dirty || clear)) return;
  if (clear || hist.clear) { st.delete(IDBKeyRange.bound('h:', 'h:\uffff')); hist.nodes.forEach(function (n) { n.saved = false; }); hist.gone = []; hist.clear = false; }
  hist.gone.forEach(function (id) { st.delete('h:b:' + id); }); hist.gone = [];
  var meta = { root: hist.root, cur: hist.cur, next: hist.next, size: [SX, SY, SZ], nodes: [] };
  hist.nodes.forEach(function (n) {
    meta.nodes.push({ id: n.id, p: n.p, kids: n.kids, label: n.label, t: n.t, n: n.n, last: n.last, mark: n.mark });
    if (!n.saved && n.b) { var b = n.b, L = b.length; st.put({ i: b.i.slice(0, L), o: b.o.slice(0, L), v: b.v.slice(0, L), sb: b.selBefore, sa: b.selAfter, pb: b.symBefore, pa: b.symAfter, eb: b.beBefore, ea: b.beAfter }, 'h:b:' + n.id); }
    n.saved = true;
  });
  st.put(meta, 'h:meta'); hist.dirty = false;
}
function histLoad() {
  return idbDo('readonly', function (st) { return st.get('h:meta'); }).then(function (meta) {
    if (!meta || !meta.size || meta.size[0] !== SX || meta.size[1] !== SY || meta.size[2] !== SZ) return false;
    return Promise.all(meta.nodes.map(function (m) { return m.id === meta.root ? null : idbDo('readonly', function (st) { return st.get('h:b:' + m.id); }); })).then(function (bs) {
      var h = { nodes: new Map(), root: meta.root, cur: meta.cur, next: meta.next, total: 0, dirty: false, clear: false, gone: [] };
      for (var k = 0; k < meta.nodes.length; k++) {
        var m = meta.nodes[k], r = bs[k], n = { id: m.id, p: m.p, kids: m.kids, label: m.label, t: m.t, n: m.n, last: m.last, mark: m.mark, b: null, saved: true };
        if (r) { var b = new EditLog(); b.i = r.i; b.o = r.o; b.v = r.v; b.length = r.i.length; if (r.sb) b.selBefore = r.sb; if (r.sa) b.selAfter = r.sa; if (r.pb) b.symBefore = r.pb; if (r.pa) b.symAfter = r.pa; if (r.eb) b.beBefore = r.eb; if (r.ea) b.beAfter = r.ea; n.b = b; h.total += b.length; }
        else if (m.id !== meta.root) return false; // falta um pedaço: começa um histórico novo
        h.nodes.set(m.id, n);
      }
      if (!h.nodes.has(h.cur)) return false;
      hist = h; histUI(); return true;
    });
  }).catch(function () { return false; });
}

/* ---------- Linha do tempo (janela) ---------- */
function histUI() {
  if (!hist || typeof $ !== 'function' || !$('undo')) return;
  $('undo').disabled = !histCanUndo(); $('redo').disabled = !histCanRedo();
  if ($('histPanel')) histDraw();
}
function histMud(n) { return n.toLocaleString('pt-BR') + (n === 1 ? ' mudança' : ' mudanças'); }
function histAgo(t) {
  var s = Math.round((Date.now() - t) / 1000);
  return s < 60 ? 'agora' : s < 3600 ? Math.round(s / 60) + ' min' : s < 86400 ? Math.round(s / 3600) + ' h' : new Date(t).toLocaleDateString('pt-BR');
}
/* Desenho: cada coluna é um passo (profundidade na árvore), cada linha é um ramo. O primeiro filho segue na linha do
   pai; os outros abrem linhas novas embaixo. O nó atual fica cheio e o caminho até ele fica destacado. */
function histDraw() {
  var box = $('histPanel'); if (!box) return;
  var pos = new Map(), lane = 0, maxD = 0, onPath = new Set(histPath(hist.cur));
  (function lay(id, d, l) {
    pos.set(id, [d, l]); if (d > maxD) maxD = d;
    var n = histNode(id);
    n.kids.forEach(function (k, i) { if (i > 0) lane++; lay(k, d + 1, i ? lane : l); });
  })(hist.root, 0, 0);
  var CW = 34, RH = 34, PAD = 18, PT = 30, W2 = PAD * 2 + maxD * CW + 120, H2 = PT + PAD + lane * RH;
  var accent = cssColor('--accent') || '#c55a11', fg = cssColor('--fg') || '#222', mut = cssColor('--muted') || '#888', line = cssColor('--line') || '#ccc';
  var svg = '<svg width="' + W2 + '" height="' + H2 + '" viewBox="0 0 ' + W2 + ' ' + H2 + '">';
  var xy = function (id) { var q = pos.get(id); return [PAD + q[0] * CW, PT + q[1] * RH]; };
  hist.nodes.forEach(function (n) {
    if (n.p < 0 || !pos.has(n.p)) return;
    var a = xy(n.p), b = xy(n.id), hot = onPath.has(n.id);
    svg += '<path d="M' + a[0] + ' ' + a[1] + (a[1] === b[1] ? ' L' : ' C' + (a[0] + CW / 2) + ' ' + a[1] + ' ' + (b[0] - CW / 2) + ' ' + b[1] + ' ') + b[0] + ' ' + b[1] + '" fill="none" stroke="' + (hot ? accent : line) + '" stroke-width="' + (hot ? 3 : 2) + '"/>';
  });
  hist.nodes.forEach(function (n) {
    var c = xy(n.id), cur = n.id === hist.cur, hot = onPath.has(n.id);
    svg += '<g class="hn" data-h="' + n.id + '"><title>' + esc(n.label + (n.n ? ' · ' + histMud(n.n) : '') + ' · ' + histAgo(n.t) + (n.mark ? ' · versão “' + n.mark + '”' : '')) + '</title>' +
      '<circle cx="' + c[0] + '" cy="' + c[1] + '" r="' + (cur ? 9 : 7) + '" fill="' + (cur ? accent : hot ? '#fff' : 'var(--panel)') + '" stroke="' + (hot ? accent : mut) + '" stroke-width="' + (cur ? 3 : 2) + '"/>' +
      (n.mark ? '<path d="M' + (c[0] - 1) + ' ' + (c[1] - 22) + 'v13M' + (c[0] - 1) + ' ' + (c[1] - 22) + 'h11l-3 3.5 3 3.5h-11" fill="' + accent + '" stroke="' + accent + '" stroke-width="1.5"/><text x="' + (c[0] + 12) + '" y="' + (c[1] - 12) + '" font-size="11" fill="' + fg + '">' + esc(n.mark) + '</text>' : '') + '</g>';
  });
  svg += '</svg>';
  var cur = histNode(hist.cur), list = [];
  hist.nodes.forEach(function (n) { if (n.mark) list.push(n); });
  box.innerHTML = '<div class="hgraph">' + svg + '</div>' +
    '<div class="info">Agora: <b>' + esc(cur.label) + '</b>' + (cur.n ? ' (' + histMud(cur.n) + ')' : '') + ' · ' + histAgo(cur.t) + ' · passo ' + (histPath(hist.cur).length - 1) + (cur.mark ? ' · versão “' + esc(cur.mark) + '”' : '') + '<br>' + hist.nodes.size + ' ações guardadas em ' + (lane + 1) + ' ramo' + (lane ? 's' : '') + '.</div>' +
    (list.length ? '<div class="row hmarks"><b>Versões:</b>' + list.map(function (n) { return '<button class="btn" data-h="' + n.id + '"' + (n.id === hist.cur ? ' aria-pressed="true"' : '') + '>⚑ ' + esc(n.mark) + '</button>'; }).join('') + '</div>' : '');
  var g = box.querySelector('.hgraph'), cc = xy(hist.cur); g.scrollLeft = Math.max(0, cc[0] - g.clientWidth / 2); g.scrollTop = Math.max(0, cc[1] - g.clientHeight / 2);
}
function openHistory() {
  openDialog('<h3>Histórico</h3><p>Cada ponto é uma ação. Clique num ponto para levar a construção àquele momento; nada é perdido. Fazendo uma mudança depois de voltar, nasce um <b>ramo</b> novo e o caminho antigo continua aqui. <kbd>Ctrl</kbd>+<kbd>Z</kbd> e <kbd>Ctrl</kbd>+<kbd>Y</kbd> andam pelo ramo atual.</p>' +
    '<div id="histPanel"></div>' +
    '<div class="row"><button class="btn primary" id="hMark">Marcar esta versão…</button><button class="btn" id="hUnmark" hidden>Tirar a marca</button><button class="btn" id="hClose">Fechar</button></div>', function () {
    overlayRoot.querySelector('.dialog').classList.add('wide');
    var upd = function () { histDraw(); var c = histNode(hist.cur); $('hUnmark').hidden = !c.mark; };
    upd();
    $('hClose').onclick = closeDialog;
    $('histPanel').addEventListener('click', function (e) {
      var t = e.target.closest('[data-h]'); if (!t) return;
      var steps = histGoto(+t.getAttribute('data-h')); upd();
      if (steps) toast('Construção levada ao passo escolhido (' + steps + ' ação' + (steps > 1 ? 'ões' : '') + ' desfeitas ou refeitas).');
    });
    $('hMark').onclick = function () {
      var c = histNode(hist.cur), nm = prompt('Nome desta versão:', c.mark || ''); if (nm == null) return;
      nm = nm.trim(); if (nm) c.mark = nm; else delete c.mark; hist.dirty = true; changed(); upd();
    };
    $('hUnmark').onclick = function () { delete histNode(hist.cur).mark; hist.dirty = true; changed(); upd(); };
  });
}
histReset();
