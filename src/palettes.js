/* ---------- Paletas: as do site (editáveis) e as criadas pelo usuário ---------- */
/* As categorias do site continuam calculadas por catOf; o que o usuário muda fica guardado por cima, sem tocar nelas:
   pal.def[id] = { name, blocks } troca o nome e/ou a lista de uma paleta do site, pal.hidden lista as do site que
   foram excluídas (voltam com "Restaurar"), pal.mine são as paletas novas e pal.order a ordem dos avisos.
   "Todos" fica sempre em primeiro e não muda; "Favoritos" usa as estrelas. Tudo no localStorage, vale para
   qualquer projeto ou mundo aberto neste navegador. Os blocos ficam guardados pelo id do Java (ex.: stone_bricks). */
var PAL_KEY = 'bloco-a-bloco-paletas', PAL_FIXED = { all: 1, fav: 1 };
var pal = { def: {}, hidden: [], mine: [], order: null };
try { var pal0 = JSON.parse(localStorage.getItem(PAL_KEY) || 'null'); if (pal0) pal = Object.assign(pal, pal0); } catch (e) {}
function palSave() { try { localStorage.setItem(PAL_KEY, JSON.stringify(pal)); } catch (e) { toast('O navegador não guardou as paletas.'); } }
function palDefault(id) { return CATS.filter(function (c) { return c[0] === id; })[0]; }
function palMine(id) { return pal.mine.filter(function (m) { return m.id === id; })[0]; }
/* Todas as paletas, na ordem dos avisos (as escondidas ficam de fora, a não ser com all = true) */
function palList(all) {
  var ids = CATS.map(function (c) { return c[0]; }).concat(pal.mine.map(function (m) { return m.id; }));
  var order = (pal.order || []).filter(function (id) { return ids.indexOf(id) >= 0 && id !== 'all'; });
  ids.forEach(function (id) { if (id !== 'all' && order.indexOf(id) < 0) order.push(id); });
  order.unshift('all');
  return order.filter(function (id) { return all || pal.hidden.indexOf(id) < 0; }).map(function (id) {
    var m = palMine(id), d = palDefault(id), o = pal.def[id] || {};
    return { id: id, name: m ? m.name : o.name || d[1], mine: !!m, fixed: !!PAL_FIXED[id], edited: !!(o.name || o.blocks), hidden: pal.hidden.indexOf(id) >= 0 };
  });
}
/* Lista explícita da paleta (Set de ids do Java), ou null quando ela segue a regra do site */
var palSetCache = {};
function palSet(id) {
  var src = palMine(id) ? palMine(id).blocks : pal.def[id] && pal.def[id].blocks; if (!src) return null;
  var c = palSetCache[id]; if (c && c.src === src) return c.set;
  palSetCache[id] = { src: src, set: new Set(src) }; return palSetCache[id].set;
}
function palHas(id, b) {
  if (id === 'all') return true;
  if (id === 'fav') return favs.has(b.java);
  var s = palSet(id); return s ? s.has(b.java) : b.cat === id;
}
function palBlocks(id) { var out = []; for (var i = 0; i < BLOCKS.length; i++) if (!BLOCKS[i].hide && palHas(id, BLOCKS[i])) out.push(BLOCKS[i].java); return out; }
function palChanged() { palSetCache = {}; palSave(); if (!palList().some(function (p) { return p.id === activeCat; })) activeCat = 'all'; renderChips(); renderList(); }

/* ---------- Janela das paletas ---------- */
function openPalettes() {
  var rows = palList(true).map(function (p, k, arr) {
    var n = p.id === 'all' ? BLOCKS.filter(function (b) { return !b.hide; }).length : palBlocks(p.id).length;
    var tag = p.fixed ? '' : p.mine ? 'sua' : p.edited ? 'do site, modificada' : 'do site';
    return '<div class="palit' + (p.hidden ? ' off' : '') + '" data-p="' + p.id + '"><div class="nm"><b>' + esc(p.name) + '</b><small>' + n.toLocaleString('pt-BR') + ' blocos' + (tag ? ' · ' + tag : '') + (p.hidden ? ' · excluída' : '') + '</small></div><div class="row">' +
      (p.id === 'all' ? '<small>sempre a primeira</small>' :
        '<button class="btn" data-a="up" title="Mais para a esquerda"' + (k <= 1 ? ' disabled' : '') + '>↑</button><button class="btn" data-a="down" title="Mais para a direita"' + (k === arr.length - 1 ? ' disabled' : '') + '>↓</button>' +
        (p.hidden ? '<button class="btn" data-a="show">Trazer de volta</button>' :
          (p.id === 'fav' ? '' : '<button class="btn" data-a="edit">Editar</button>') + '<button class="btn" data-a="del">Excluir</button>')) +
      '</div></div>';
  }).join('');
  openDialog('<h3>Paletas de blocos</h3><p>As paletas são os avisos acima da lista de blocos. Crie as suas (por exemplo, “Casa medieval”) e edite ou exclua as que vêm com o site: nome e blocos. Ficam guardadas neste navegador e valem para todos os projetos.</p>' +
    '<div class="lib pal">' + rows + '</div>' +
    '<div class="row"><button class="btn primary" id="palNew">Nova paleta…</button><button class="btn" id="palReset">Restaurar as do site</button><button class="btn" id="palDl">Baixar</button><button class="btn" id="palImp">Importar…</button><button class="btn" id="palClose">Fechar</button></div>' +
    '<input type="file" id="palIn" accept=".json,application/json" hidden>', function () {
    overlayRoot.querySelector('.dialog').classList.add('wide');
    $('palClose').onclick = closeDialog;
    $('palNew').onclick = function () { palEdit(null); };
    $('palReset').onclick = function () {
      var b = $('palReset');
      if (!b.dataset.armed) { b.dataset.armed = '1'; b.textContent = 'Confirmar: desfazer as mudanças nas paletas do site'; b.classList.add('danger'); return; }
      pal.def = {}; pal.hidden = pal.hidden.filter(function (id) { return !palDefault(id); }); pal.order = null;
      palChanged(); toast('As paletas do site voltaram ao original. As suas continuam.'); openPalettes();
    };
    $('palDl').onclick = function () {
      var txt = JSON.stringify({ format: 'bloco-a-bloco-paletas', version: 1, paletas: pal }, null, 1);
      saveBytes('paletas.json', new TextEncoder().encode(txt), 'application/json').then(function (r) { reportSave(r, 'paletas.json'); }, reportErr);
    };
    $('palImp').onclick = function () { $('palIn').click(); };
    $('palIn').onchange = function (e) {
      var f = e.target.files && e.target.files[0]; if (!f) return;
      f.text().then(function (t) {
        var o = JSON.parse(t); if (!o || o.format !== 'bloco-a-bloco-paletas' || !o.paletas) throw new Error('Esse arquivo não é de paletas do Bloco a Bloco.');
        var q = o.paletas, n = 0;
        // as paletas do arquivo entram por cima: as do site como estão no arquivo, as próprias somadas às que já existem
        Object.keys(q.def || {}).forEach(function (id) { if (palDefault(id)) pal.def[id] = q.def[id]; });
        (q.hidden || []).forEach(function (id) { if (palDefault(id) && pal.hidden.indexOf(id) < 0) pal.hidden.push(id); });
        (q.mine || []).forEach(function (m) {
          if (!m || !m.name || !Array.isArray(m.blocks)) return;
          var old = pal.mine.filter(function (x) { return x.name === m.name; })[0];
          if (old) old.blocks = m.blocks; else pal.mine.push({ id: 'u' + Date.now().toString(36) + (n++), name: String(m.name), blocks: m.blocks.map(String) });
        });
        palChanged(); toast('Paletas importadas.'); openPalettes();
      }).catch(function (x) { toast(x instanceof SyntaxError ? 'Arquivo de paletas danificado.' : x.message, 6000); });
    };
    overlayRoot.querySelector('.pal').addEventListener('click', function (e) {
      var b = e.target.closest('[data-a]'); if (!b) return;
      var id = b.closest('[data-p]').getAttribute('data-p'), a = b.getAttribute('data-a');
      if (a === 'edit') { palEdit(id); return; }
      if (a === 'up' || a === 'down') {
        var ids = palList(true).map(function (p) { return p.id; }).slice(1), k = ids.indexOf(id), j = a === 'up' ? k - 1 : k + 1;
        if (j < 0 || j >= ids.length) return;
        ids[k] = ids[j]; ids[j] = id; pal.order = ids;
      } else if (a === 'show') pal.hidden = pal.hidden.filter(function (x) { return x !== id; });
      else if (a === 'del') {
        if (!b.dataset.armed) { b.dataset.armed = '1'; b.textContent = 'Confirmar'; b.classList.add('danger'); return; }
        if (palMine(id)) pal.mine = pal.mine.filter(function (m) { return m.id !== id; });
        else pal.hidden.push(id);
      }
      palChanged(); openPalettes();
    });
  });
}
/* Editar uma paleta (id null = nova): nome e blocos marcados numa lista com busca */
function palEdit(id) {
  var p = id ? palList(true).filter(function (q) { return q.id === id; })[0] : null;
  var chosen = new Set(id ? palBlocks(id) : []), q = '', only = false;
  openDialog('<h3>' + (p ? 'Editar a paleta' : 'Nova paleta') + '</h3>' +
    '<label>Nome<input type="text" id="peName" maxlength="40" value="' + esc(p ? p.name : '') + '" placeholder="Ex.: Casa medieval"></label>' +
    '<div class="row"><input type="text" id="peQ" placeholder="Buscar bloco (ex.: oak, brick)" style="flex:1"><label class="check"><input type="checkbox" id="peOnly"> Só os escolhidos</label></div>' +
    '<div class="row"><button class="btn" id="peUsed">Pôr os blocos da construção</button><button class="btn" id="peAllV">Marcar os da busca</button><button class="btn" id="peNone">Desmarcar todos</button><span id="peN" class="pen"></span></div>' +
    '<div class="pelist" id="peList"></div>' +
    '<p class="err" id="peErr" hidden></p>' +
    '<div class="row"><button class="btn primary" id="peOk">Salvar</button><button class="btn" id="peNo">Cancelar</button></div>', function () {
    overlayRoot.querySelector('.dialog').classList.add('wide');
    var visible = [];
    var draw = function () {
      var ws = q.trim().toLowerCase().split(/\s+/).filter(Boolean), out = [];
      visible = [];
      for (var i = 0; i < BLOCKS.length; i++) {
        var b = BLOCKS[i]; if (b.hide || b.isAir) continue;
        if (only && !chosen.has(b.java)) continue;
        if (ws.some(function (w) { return b.hay.indexOf(w) < 0; })) continue;
        visible.push(b.java);
        if (out.length < 400) out.push('<label class="peit"><input type="checkbox" data-j="' + b.java + '"' + (chosen.has(b.java) ? ' checked' : '') + '><span class="sw" style="' + swatch(b) + '"></span><span>' + esc(b.name) + '</span></label>');
      }
      $('peList').innerHTML = out.join('') + (visible.length > 400 ? '<div class="empty">… e mais ' + (visible.length - 400) + '. Use a busca para achar outros.</div>' : !visible.length ? '<div class="empty">Nenhum bloco.</div>' : '');
      $('peN').textContent = chosen.size + ' escolhido' + (chosen.size === 1 ? '' : 's');
    };
    draw();
    $('peQ').addEventListener('input', function (e) { q = e.target.value; draw(); });
    $('peOnly').onchange = function (e) { only = e.target.checked; draw(); };
    $('peList').addEventListener('change', function (e) {
      var j = e.target.getAttribute('data-j'); if (!j) return;
      if (e.target.checked) chosen.add(j); else chosen.delete(j);
      $('peN').textContent = chosen.size + ' escolhido' + (chosen.size === 1 ? '' : 's');
    });
    $('peUsed').onclick = function () {
      var seen = new Set(); forEachBlock(function (x, y, z, v) { var b = BLOCKS[cellBlock(v)]; if (b && !b.hide && !b.isAir) seen.add(b.java); });
      var n0 = chosen.size; seen.forEach(function (j) { chosen.add(j); }); draw();
      toast(seen.size ? (chosen.size - n0) + ' blocos da construção entraram na paleta.' : 'A construção está vazia.');
    };
    $('peAllV').onclick = function () { visible.forEach(function (j) { chosen.add(j); }); draw(); };
    $('peNone').onclick = function () { chosen.clear(); draw(); };
    $('peNo').onclick = openPalettes;
    $('peOk').onclick = function () {
      var nm = $('peName').value.trim(), err = $('peErr');
      if (!nm) { err.hidden = false; err.textContent = 'Dê um nome à paleta.'; return; }
      if (!chosen.size) { err.hidden = false; err.textContent = 'Escolha ao menos um bloco.'; return; }
      var list = BLOCKS.filter(function (b) { return chosen.has(b.java); }).map(function (b) { return b.java; });
      if (!p) { var nid = 'u' + Date.now().toString(36); pal.mine.push({ id: nid, name: nm, blocks: list }); activeCat = nid; }
      else if (p.mine) { var m = palMine(id); m.name = nm; m.blocks = list; }
      else {
        // paleta do site: guarda só o que mudou (o nome igual ao original, ou os mesmos blocos da regra, não ficam por cima)
        var d = palDefault(id), o = {}, rule = BLOCKS.filter(function (b) { return !b.hide && b.cat === id; }).map(function (b) { return b.java; });
        if (nm !== d[1]) o.name = nm;
        if (list.length !== rule.length || list.some(function (j, k) { return j !== rule[k]; })) o.blocks = list;
        if (o.name || o.blocks) pal.def[id] = o; else delete pal.def[id];
      }
      palChanged(); toast('Paleta “' + nm + '” salva.'); openPalettes();
    };
  });
}
