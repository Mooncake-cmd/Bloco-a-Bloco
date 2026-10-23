/* ---------- Biblioteca de construções ---------- */
/* Guarda construções com nome no navegador (IndexedDB, chaves 'lib:<id>'), separadas do projeto: valem para qualquer
   projeto, estrutura importada ou mundo do jogo aberto depois, e continuam depois de recarregar a página.
   Cada item: { id, name, w, h, l, n (blocos), t (data), pal: [nome da célula], d: índices (y, z, x), pres: [base64
   dos blocos do jogo que o editor não conhece], presFmt: ['java' ou 'bedrock' de cada um], thumb (miniatura vista de
   cima, PNG em base64) }. Os blocos do jogo guardam o original de cada jogo: no Bedrock, a entrada de paleta em NBT;
   no Java, o texto do estado ("minecraft:nome[prop=valor]"). Só voltam num mundo do mesmo jogo; no outro (ou sem
   mundo aberto) ficam de fora, com aviso. Itens antigos, sem presFmt: o NBT começa com o byte 10, o texto não.
   Os blocos ficam por nome (como no projeto .json), então sobrevivem a mudanças na lista de blocos. */
function libKeyRange() { return IDBKeyRange.bound('lib:', 'lib:￿'); }
function libAll() { return idbDo('readonly', function (st) { return st.getAll(libKeyRange()); }).then(function (l) { return (l || []).sort(function (a, b) { return b.t - a.t; }); }, function () { return []; }); }
function libPut(it) { return idbDo('readwrite', function (st) { st.put(it, 'lib:' + it.id); }); }
function libDel(id) { return idbDo('readwrite', function (st) { st.delete('lib:' + id); }); }
/* Miniatura: vista pelo lado de maior área (de cima para um piso, de frente para uma parede ou torre); em cada ponto,
   o primeiro bloco visto, mais escuro quanto mais longe */
function libThumb(c) {
  var S = 96, dims = [c.w, c.h, c.l];
  var view = c.w * c.l >= Math.max(c.w * c.h, c.l * c.h) ? 1 : c.w * c.h >= c.l * c.h ? 2 : 0; // eixo da profundidade
  var ua = view === 0 ? 2 : 0, va = view === 1 ? 2 : 1, U = dims[ua], V = dims[va], D = dims[view];
  var cv = document.createElement('canvas'); cv.width = cv.height = S;
  var g = cv.getContext('2d'), sc = S / Math.max(U, V), ox = (S - U * sc) / 2, oy = (S - V * sc) / 2;
  for (var v = 0; v < V; v++) for (var u = 0; u < U; u++) for (var k = 0; k < D; k++) {
    var p = [0, 0, 0]; p[ua] = u; p[va] = view === 1 ? v : V - 1 - v; p[view] = view === 1 ? D - 1 - k : k; // de cima: do alto para baixo; de frente: de perto para longe
    var cell = c.cells[(p[1] * c.l + p[2]) * c.w + p[0]]; if (!cell) continue;
    var b = BLOCKS[cellBlock(cell)], col = (b && (view === 1 ? b.top : b.side)) || [150, 150, 150], f = 1 - 0.4 * (D > 1 ? k / (D - 1) : 0);
    g.fillStyle = 'rgb(' + Math.round(col[0] * f) + ',' + Math.round(col[1] * f) + ',' + Math.round(col[2] * f) + ')';
    g.fillRect(ox + u * sc, oy + v * sc, Math.ceil(sc), Math.ceil(sc)); break;
  }
  return cv.toDataURL('image/png');
}
/* Cópia (clip) -> item da biblioteca */
function libFromClip(c, name) {
  var pal = [''], map = new Map([[0, 0]]), pres = [], presFmt = [], presMap = new Map(), vol = c.cells.length, big = false;
  var d = new Uint16Array(vol);
  for (var i = 0; i < vol; i++) {
    var v = c.cells[i]; if (!v) continue;
    var pi = map.get(v);
    if (pi === undefined) {
      var nm = cellName(v);
      if (cellBlock(v) === PRES_BI) { // bloco do jogo: leva os bytes junto, para colar em outro mundo
        var e = wio && wio.pres[cellOri(v)], pk = e ? b64(e.raw) : null;
        if (pk != null) { if (!presMap.has(pk)) { presMap.set(pk, pres.length); pres.push(pk); presFmt.push(e.key != null ? 'java' : 'bedrock'); } nm = 'bab_preserved#' + presMap.get(pk); }
      }
      pi = pal.length; pal.push(nm); map.set(v, pi);
      if (pal.length > 65535) { big = true; break; }
    }
    d[i] = pi;
  }
  if (big) throw new Error('Blocos diferentes demais nessa seleção para a biblioteca.');
  return { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: name, w: c.w, h: c.h, l: c.l, n: c.n, t: Date.now(), pal: pal, d: d, pres: pres, presFmt: presFmt, be: c.be ? Array.from(c.be) : null, thumb: libThumb(c) };
}
/* Item -> cópia pronta para colar; blocos do jogo voltam para a lista do mundo aberto (sem mundo, ficam de fora) */
function libToClip(it) {
  var lost = 0, other = 0, fmts = {}, vals = it.pal.map(function (nm) {
    if (!nm) return 0;
    var m = /^bab_preserved#(\d+)$/.exec(nm);
    if (m) {
      var raw = it.pres && it.pres[+m[1]] ? unb64(it.pres[+m[1]]) : null;
      if (!raw) return -1;
      var fmt = (it.presFmt && it.presFmt[+m[1]]) || (raw[0] === 10 ? 'bedrock' : 'java'), j;
      if (fmt === 'java') {
        var key = new TextDecoder().decode(raw), cj = cellFromJava(key);
        if (cj) return cj; // o editor passou a conhecer o bloco: vale em qualquer lugar
        if (!wio || !wio.java) { fmts.java = 1; return wio ? -2 : -1; }
        j = wio.presMap.get(key);
        if (j === undefined) { j = wio.pres.length; wio.pres.push({ raw: raw, name: key.replace(/\[.*$/, ''), key: key }); wio.presMap.set(key, j); wio.presDirty = true; }
      } else {
        if (!wio || wio.java) { fmts.bedrock = 1; return wio ? -2 : -1; }
        var k = wioStr(raw); j = wio.presMap.get(k);
        if (j === undefined) { j = wio.pres.length; wio.pres.push({ raw: raw, name: String(nbtRead(raw, true).name) }); wio.presMap.set(k, j); wio.presDirty = true; }
      }
      return (PRES_BI + 1) + j * 4096;
    }
    return cellFromName(nm) || -1;
  });
  var d = it.d instanceof Uint16Array ? it.d : new Uint16Array(it.d.buffer || it.d), cells = new Uint32Array(d.length), n = 0;
  for (var i = 0; i < d.length; i++) { var v = vals[d[i]]; if (v > 0) { cells[i] = v; n++; } else if (v === -2) other++; else if (v < 0) lost++; }
  return { clip: { w: it.w, h: it.h, l: it.l, cells: cells, n: n, be: it.be ? new Map(it.be) : null }, lost: lost, other: other, from: fmts.java ? 'Java' : 'Bedrock' };
}
/* Cópia de uma caixa (cantos a e b) para guardar; noApoio tira os vidros de apoio (Z) */
function libClipBox(a, b, noApoio) {
  var d = [b[0] - a[0] + 1, b[1] - a[1] + 1, b[2] - a[2] + 1], vol = d[0] * d[1] * d[2], n = 0;
  if (vol > 64e6) throw new Error('Área grande demais para a biblioteca (' + Math.round(vol / 1e6) + ' milhões de espaços; o máximo é 64 milhões). Salve em partes, com a seleção.');
  var cells = new Uint32Array(vol);
  blocksInBox(a[0], a[1], a[2], b[0], b[1], b[2], function (x, y, z, v) {
    if (noApoio && isApoio(x, y, z, v)) return;
    cells[((y - a[1]) * d[2] + (z - a[2])) * d[0] + (x - a[0])] = v; n++;
  });
  return { w: d[0], h: d[1], l: d[2], cells: cells, n: n, be: bentClipBox(a, b) };
}
/* Caixa da construção inteira: os blocos do espaço todo (sem os de apoio), apertada em volta deles */
function libWholeBox() {
  var bb = bbox(); if (!bb) return null;
  if (!apoio.size) return { a: [bb.minX, bb.minY, bb.minZ], b: [bb.maxX, bb.maxY, bb.maxZ] };
  var lo = [1e9, 1e9, 1e9], hi = [-1, -1, -1];
  forEachBlock(function (x, y, z, v) {
    if (isApoio(x, y, z, v)) return;
    if (x < lo[0]) lo[0] = x; if (y < lo[1]) lo[1] = y; if (z < lo[2]) lo[2] = z;
    if (x > hi[0]) hi[0] = x; if (y > hi[1]) hi[1] = y; if (z > hi[2]) hi[2] = z;
  });
  return hi[0] < 0 ? null : { a: lo, b: hi };
}
/* Salvar na biblioteca: a seleção ou a construção inteira (mode 'sel' ou 'all'; com as duas possíveis, a janela deixa
   escolher) */
function libSaveSel(mode) {
  var whole = libWholeBox(), sz = function (q) { return (q.b[0] - q.a[0] + 1) + ' × ' + (q.b[1] - q.a[1] + 1) + ' × ' + (q.b[2] - q.a[2] + 1); };
  if (!sel && !whole) { toast('Não há blocos para guardar.'); return; }
  mode = mode === 'all' || !sel ? 'all' : 'sel';
  if (mode === 'all' && !whole) mode = 'sel';
  var pick = sel && whole ? '<div class="row"><label class="check"><input type="radio" name="lbWhat" value="sel"' + (mode === 'sel' ? ' checked' : '') + '> A seleção (' + sz(sel) + ')</label>' +
    '<label class="check"><input type="radio" name="lbWhat" value="all"' + (mode === 'all' ? ' checked' : '') + '> A construção inteira (' + sz(whole) + ')</label></div>'
    : '<p>' + (mode === 'all' ? 'A construção inteira: ' + sz(whole) + '.' : 'A seleção: ' + sz(sel) + '.') + '</p>';
  openDialog('<h3>Salvar na biblioteca</h3>' + pick + '<p>Fica guardada neste navegador para colar em qualquer projeto ou mundo, mesmo depois de fechar a página.' + (apoio.size ? ' Os blocos de apoio (Z) ficam de fora da construção inteira.' : '') + '</p>' +
    '<label>Nome<input type="text" id="lbName" maxlength="60" placeholder="ex.: torre de vigia"></label><p id="lbErr" class="err" hidden></p>' +
    '<div class="row"><button class="btn primary" id="lbOk">Salvar</button><button class="btn" id="lbNo">Cancelar</button></div>', function () {
    $('lbNo').onclick = closeDialog;
    var go = function () {
      var nm = $('lbName').value.trim(); if (!nm) { $('lbErr').hidden = false; $('lbErr').textContent = 'Dê um nome para a construção.'; return; }
      var r = overlayRoot.querySelector('input[name=lbWhat]:checked'), m = r ? r.value : mode, q = m === 'all' ? whole : sel, c, it;
      try { c = libClipBox(q.a, q.b, m === 'all'); } catch (e) { $('lbErr').hidden = false; $('lbErr').textContent = e.message; return; }
      if (!c.n) { closeDialog(); toast(m === 'all' ? 'O espaço está vazio: não há blocos para guardar.' : 'A seleção está vazia: não há blocos para guardar.'); return; }
      try { it = libFromClip(c, nm); } catch (e) { $('lbErr').hidden = false; $('lbErr').textContent = e.message; return; }
      libPut(it).then(function () { closeDialog(); toast('“' + nm + '” salva na biblioteca (' + c.n.toLocaleString('pt-BR') + ' blocos). Projeto → Biblioteca para colar.', 6000); },
        function () { $('lbErr').hidden = false; $('lbErr').textContent = 'O navegador não deixou guardar (espaço cheio?).'; });
    };
    $('lbOk').onclick = go; $('lbName').addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
    $('lbName').focus();
  });
}
function libPaste(it) {
  var r = libToClip(it);
  var why = (r.lost ? ' ' + r.lost + ' blocos do jogo ficaram de fora (só colam com um mundo do jogo aberto).' : '') + (r.other ? ' ' + r.other + ' blocos do jogo vieram de um mundo do ' + r.from + ' e não existem neste mundo: ficaram de fora.' : '');
  if (!r.clip.n) { toast(r.other && !r.lost ? 'Esta construção só tem blocos do jogo de um mundo do ' + r.from + ', que não existem neste mundo.' : r.lost ? 'Esta construção só tem blocos do jogo que o editor não conhece: eles só colam com um mundo do jogo aberto (Projeto → Abrir mundo do jogo).' : 'Nada para colar: os blocos desta construção não existem aqui.', 7000); return; }
  clip = r.clip; closeDialog(); startPaste();
  toast('Colando “' + it.name + '”: clique onde quer pôr. R gira, F espelha, Esc termina.' + why, 8000);
}
/* Arquivo para levar a outro navegador ou aparelho */
function libFile(it) {
  var o = Object.assign({}, it, { kind: 'bloco-a-bloco-biblioteca', v: 1, d: b64(new Uint8Array((it.d.buffer ? it.d : new Uint16Array(it.d)).buffer)) });
  return new TextEncoder().encode(JSON.stringify(o));
}
function libFromFile(txt) {
  var o = JSON.parse(txt);
  if (o.kind !== 'bloco-a-bloco-biblioteca' || !o.pal || !o.d) throw new Error('Este arquivo não é uma construção da biblioteca.');
  var u = unb64(o.d); o.d = new Uint16Array(u.buffer, 0, u.length >> 1);
  o.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6); o.t = Date.now(); delete o.kind; delete o.v;
  return o;
}
function openLibrary() {
  libAll().then(function (list) {
    var rows = list.map(function (it) {
      return '<div class="libit" data-id="' + it.id + '"><img src="' + (it.thumb || '') + '" alt=""><div class="nm"><b>' + esc(it.name) + '</b><small>' + it.w + ' × ' + it.h + ' × ' + it.l + ' · ' + it.n.toLocaleString('pt-BR') + ' blocos · ' + new Date(it.t).toLocaleDateString('pt-BR') + (it.pres && it.pres.length ? ' · com blocos do jogo' : '') + '</small></div>' +
        '<div class="row"><button class="btn primary" data-lb="paste">Colar</button><button class="btn" data-lb="ren">Renomear</button><button class="btn" data-lb="dl">Baixar</button><button class="btn" data-lb="del">Apagar</button></div></div>';
    }).join('');
    openDialog('<h3>Biblioteca de construções</h3>' +
      '<p>Construções guardadas neste navegador. Para pôr uma aqui: <b>Salvar a construção inteira</b> (tudo o que está no espaço), ou selecione uma parte com <b>Selecionar</b> (V) e use <b>Salvar na biblioteca</b> no aviso da seleção. <b>Colar</b> funciona em qualquer projeto ou mundo aberto.</p>' +
      (rows ? '<div class="lib">' + rows + '</div>' : '<div class="info">A biblioteca está vazia.</div>') +
      '<div class="row"><button class="btn" id="lbImp">Importar arquivo…</button>' + (blockCount ? '<button class="btn" id="lbAll">Salvar a construção inteira</button>' : '') + (sel ? '<button class="btn" id="lbSave">Salvar a seleção atual</button>' : '') + '<button class="btn" id="lbClose">Fechar</button></div>' +
      '<input type="file" id="lbIn" accept=".json,application/json" hidden>', function () {
      overlayRoot.querySelector('.dialog').classList.add('wide');
      $('lbClose').onclick = closeDialog;
      if ($('lbSave')) $('lbSave').onclick = function () { closeDialog(); libSaveSel('sel'); };
      if ($('lbAll')) $('lbAll').onclick = function () { closeDialog(); libSaveSel('all'); };
      $('lbImp').onclick = function () { $('lbIn').click(); };
      $('lbIn').onchange = function (e) {
        var f = e.target.files && e.target.files[0]; if (!f) return;
        f.text().then(function (t) { var it = libFromFile(t); return libPut(it).then(function () { toast('“' + it.name + '” entrou na biblioteca.'); openLibrary(); }); })
          .catch(function (x) { toast(x.message || 'Não foi possível importar.', 6000); });
      };
      overlayRoot.querySelectorAll('.libit').forEach(function (row) {
        var it = list.find(function (q) { return q.id === row.getAttribute('data-id'); });
        row.addEventListener('click', function (e) {
          var b = e.target.closest('[data-lb]'); if (!b) return;
          var a = b.getAttribute('data-lb');
          if (a === 'paste') libPaste(it);
          else if (a === 'del') {
            if (b.dataset.armed) libDel(it.id).then(openLibrary);
            else { b.dataset.armed = '1'; b.textContent = 'Confirmar'; b.classList.add('danger'); }
          } else if (a === 'ren') {
            var nm = prompt('Novo nome:', it.name); if (nm && nm.trim()) { it.name = nm.trim(); libPut(it).then(openLibrary); }
          } else if (a === 'dl') {
            saveBytes(cleanName(it.name) + '.biblioteca.json', libFile(it), 'application/json').then(function (r) { reportSave(r, cleanName(it.name) + '.biblioteca.json'); }, reportErr);
          }
        });
      });
    });
  });
}
