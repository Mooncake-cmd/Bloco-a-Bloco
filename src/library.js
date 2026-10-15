/* ---------- Biblioteca de construções ---------- */
/* Guarda construções com nome no navegador (IndexedDB, chaves 'lib:<id>'), separadas do projeto: valem para qualquer
   projeto, estrutura importada ou mundo do jogo aberto depois, e continuam depois de recarregar a página.
   Cada item: { id, name, w, h, l, n (blocos), t (data), pal: [nome da célula], d: índices (y, z, x), pres: [NBT em
   base64 dos blocos do jogo que o editor não conhece], thumb (miniatura vista de cima, PNG em base64) }.
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
  var pal = [''], map = new Map([[0, 0]]), pres = [], presMap = new Map(), vol = c.cells.length, big = false;
  var d = new Uint16Array(vol);
  for (var i = 0; i < vol; i++) {
    var v = c.cells[i]; if (!v) continue;
    var pi = map.get(v);
    if (pi === undefined) {
      var nm = cellName(v);
      if (cellBlock(v) === PRES_BI) { // bloco do jogo: leva os bytes junto, para colar em outro mundo
        var e = wio && wio.pres[cellOri(v)], pk = e ? b64(e.raw) : null;
        if (pk != null) { if (!presMap.has(pk)) { presMap.set(pk, pres.length); pres.push(pk); } nm = 'bab_preserved#' + presMap.get(pk); }
      }
      pi = pal.length; pal.push(nm); map.set(v, pi);
      if (pal.length > 65535) { big = true; break; }
    }
    d[i] = pi;
  }
  if (big) throw new Error('Blocos diferentes demais nessa seleção para a biblioteca.');
  return { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: name, w: c.w, h: c.h, l: c.l, n: c.n, t: Date.now(), pal: pal, d: d, pres: pres, thumb: libThumb(c) };
}
/* Item -> cópia pronta para colar; blocos do jogo voltam para a lista do mundo aberto (sem mundo, ficam de fora) */
function libToClip(it) {
  var lost = 0, vals = it.pal.map(function (nm) {
    if (!nm) return 0;
    var m = /^bab_preserved#(\d+)$/.exec(nm);
    if (m) {
      var raw = it.pres && it.pres[+m[1]] ? unb64(it.pres[+m[1]]) : null;
      if (!raw || !wio) return -1;
      var k = wioStr(raw), j = wio.presMap.get(k);
      if (j === undefined) { j = wio.pres.length; wio.pres.push({ raw: raw, name: String(nbtRead(raw, true).name) }); wio.presMap.set(k, j); }
      return (PRES_BI + 1) + j * 4096;
    }
    return cellFromName(nm) || -1;
  });
  var d = it.d instanceof Uint16Array ? it.d : new Uint16Array(it.d.buffer || it.d), cells = new Uint32Array(d.length), n = 0;
  for (var i = 0; i < d.length; i++) { var v = vals[d[i]]; if (v > 0) { cells[i] = v; n++; } else if (v < 0) lost++; }
  return { clip: { w: it.w, h: it.h, l: it.l, cells: cells, n: n }, lost: lost };
}
function libSaveSel() {
  if (!sel) { toast('Selecione a construção primeiro (ferramenta Selecionar, V).'); return; }
  var d = selSize(sel);
  openDialog('<h3>Salvar na biblioteca</h3><p>Área de ' + d[0] + ' × ' + d[1] + ' × ' + d[2] + '. Fica guardada neste navegador para colar em qualquer projeto ou mundo, mesmo depois de fechar a página.</p>' +
    '<label>Nome<input type="text" id="lbName" maxlength="60" placeholder="ex.: torre de vigia"></label><p id="lbErr" class="err" hidden></p>' +
    '<div class="row"><button class="btn primary" id="lbOk">Salvar</button><button class="btn" id="lbNo">Cancelar</button></div>', function () {
    $('lbNo').onclick = closeDialog;
    var go = function () {
      var nm = $('lbName').value.trim(); if (!nm) { $('lbErr').hidden = false; $('lbErr').textContent = 'Dê um nome para a construção.'; return; }
      var prev = clip; copySel(false); var c = clip; clip = prev || c; updateSelChip(); // a área copiada do usuário continua a mesma
      if (!c || !c.n) { closeDialog(); toast('A seleção está vazia: não há blocos para guardar.'); return; }
      var it; try { it = libFromClip(c, nm); } catch (e) { $('lbErr').hidden = false; $('lbErr').textContent = e.message; return; }
      libPut(it).then(function () { closeDialog(); toast('“' + nm + '” salva na biblioteca (' + c.n + ' blocos). Projeto → Biblioteca para colar.', 6000); },
        function () { $('lbErr').hidden = false; $('lbErr').textContent = 'O navegador não deixou guardar (espaço cheio?).'; });
    };
    $('lbOk').onclick = go; $('lbName').addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
  });
}
function libPaste(it) {
  var r = libToClip(it);
  if (!r.clip.n) { toast(r.lost ? 'Esta construção só tem blocos do jogo que o editor não conhece: eles só colam com um mundo do jogo aberto (Projeto → Abrir mundo do jogo).' : 'Nada para colar: os blocos desta construção não existem aqui.', 7000); return; }
  clip = r.clip; closeDialog(); startPaste();
  toast('Colando “' + it.name + '”: clique onde quer pôr. R gira, F espelha, Esc termina.' + (r.lost ? ' ' + r.lost + ' blocos do jogo ficaram de fora (só colam com um mundo do jogo aberto).' : ''), 7000);
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
      '<p>Construções guardadas neste navegador. Para pôr uma aqui: selecione com <b>Selecionar</b> (V) e use <b>Salvar na biblioteca</b> no aviso da seleção. <b>Colar</b> funciona em qualquer projeto ou mundo aberto.</p>' +
      (rows ? '<div class="lib">' + rows + '</div>' : '<div class="info">A biblioteca está vazia.</div>') +
      '<div class="row"><button class="btn" id="lbImp">Importar arquivo…</button>' + (sel ? '<button class="btn" id="lbSave">Salvar a seleção atual</button>' : '') + '<button class="btn" id="lbClose">Fechar</button></div>' +
      '<input type="file" id="lbIn" accept=".json,application/json" hidden>', function () {
      overlayRoot.querySelector('.dialog').classList.add('wide');
      $('lbClose').onclick = closeDialog;
      if ($('lbSave')) $('lbSave').onclick = function () { closeDialog(); libSaveSel(); };
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
