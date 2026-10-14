/* ---------- Seleção: selecionar, copiar, recortar, colar, apagar e substituir ---------- */
/* A seleção é uma caixa [min, max] escolhida com dois cliques (ferramenta Selecionar, V). A área de transferência guarda
   as células cruas (bloco + estado) relativas ao canto mínimo, então colar mantém direção, portas abertas etc. */
var selA = null;          // primeiro canto, enquanto a seleção está sendo feita
var sel = null;           // { a: [x,y,z] mínimo, b: [x,y,z] máximo }
var clip = null;          // { w, h, l, cells: Uint32Array, n: blocos }
var pasting = false;      // modo colar: a prévia segue o mouse e o clique cola
var selBox = null;

function selSize(s) { return [s.b[0] - s.a[0] + 1, s.b[1] - s.a[1] + 1, s.b[2] - s.a[2] + 1]; }
function selFrom(p, q) {
  return { a: [Math.min(p[0], q[0]), Math.min(p[1], q[1]), Math.min(p[2], q[2])], b: [Math.max(p[0], q[0]), Math.max(p[1], q[1]), Math.max(p[2], q[2])] };
}
function drawSelBox() {
  if (selBox) { scene.remove(selBox); selBox.geometry.dispose(); selBox = null; }
  var s = sel || (selA && hoverT && (hoverT.hit || hoverT.place) ? selFrom(selA, hoverT.hit || hoverT.place) : selA ? selFrom(selA, selA) : null);
  if (!s) { requestRender(); return; }
  var d = selSize(s);
  selBox = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(d[0] + 0.04, d[1] + 0.04, d[2] + 0.04)),
    new THREE.LineBasicMaterial({ color: new THREE.Color(cssColor('--info')), depthTest: false, transparent: true }));
  selBox.position.set(s.a[0] + d[0] / 2, s.a[1] + d[1] / 2, s.a[2] + d[2] / 2);
  selBox.renderOrder = 7; scene.add(selBox); requestRender();
}
function updateSelChip() {
  var c = $('selChip');
  if (pasting && clip) {
    c.hidden = false;
    $('selTxt').innerHTML = '<b>Colar</b> ' + clip.w + ' × ' + clip.h + ' × ' + clip.l + ' (' + clip.n + ' blocos). Clique para colar.';
    $('selBtns').innerHTML = '<button data-s="rot" title="Girar 90° (R)">Girar 90°</button><button data-s="cancel">Cancelar</button>';
  } else if (sel) {
    var d = selSize(sel);
    c.hidden = false;
    $('selTxt').innerHTML = '<b>Seleção</b> ' + d[0] + ' × ' + d[1] + ' × ' + d[2];
    $('selBtns').innerHTML = '<button data-s="copy" title="Ctrl+C">Copiar</button><button data-s="cut" title="Ctrl+X">Recortar</button>' +
      '<button data-s="del" title="Delete">Apagar</button><button data-s="repl">Substituir…</button>' +
      (clip ? '<button data-s="paste" title="Ctrl+V">Colar</button>' : '') + '<button data-s="clear" title="Esc">Limpar</button>';
  } else if (clip && tool === 'select') {
    c.hidden = false;
    $('selTxt').innerHTML = '<b>Copiado</b> ' + clip.w + ' × ' + clip.h + ' × ' + clip.l;
    $('selBtns').innerHTML = '<button data-s="paste" title="Ctrl+V">Colar</button>';
  } else if (selA) {
    c.hidden = false; $('selTxt').innerHTML = '<b>Seleção</b>: clique no canto oposto'; $('selBtns').innerHTML = '<button data-s="clear">Cancelar</button>';
  } else c.hidden = true;
}
function selRefresh() { updateSelChip(); drawSelBox(); updatePreview(); updateStatus(); }

/* Clique da ferramenta Selecionar: primeiro canto, depois o oposto (aceita bloco ou espaço vazio) */
function selectPress(t) {
  var c = t && (t.hit || t.place); if (!c) return;
  if (!selA || sel) { sel = null; selA = c.slice(); }
  else { sel = selFrom(selA, c); selA = null; }
  selRefresh();
}
function clearSel() { sel = null; selA = null; pasting = false; selRefresh(); }

function copySel(cut) {
  if (!sel) { toast('Selecione uma área primeiro (ferramenta Selecionar, V).'); return; }
  var d = selSize(sel), vol = d[0] * d[1] * d[2], n = 0;
  if (vol > 64e6) { toast('Área grande demais para copiar de uma vez (' + Math.round(vol / 1e6) + ' milhões de espaços; o máximo é 64 milhões). Copie em partes.', 7000); return; }
  var cells = new Uint32Array(vol);
  blocksInBox(sel.a[0], sel.a[1], sel.a[2], sel.b[0], sel.b[1], sel.b[2], function (x, y, z, v) {
    cells[((y - sel.a[1]) * d[2] + (z - sel.a[2])) * d[0] + (x - sel.a[0])] = v; n++;
  });
  clip = { w: d[0], h: d[1], l: d[2], cells: cells, n: n };
  if (cut) { deleteSel(true); toast('Recortado: ' + n + ' blocos. Ctrl+V para colar.'); }
  else toast('Copiado: ' + n + ' blocos. Ctrl+V para colar.');
  selRefresh();
}
function deleteSel(quiet) {
  if (!sel) return;
  var n = 0;
  beginBatch();
  var list = []; blocksInBox(sel.a[0], sel.a[1], sel.a[2], sel.b[0], sel.b[1], sel.b[2], function (x, y, z) { list.push(x, y, z); });
  for (var k = 0; k < list.length; k += 3) if (gget(list[k], list[k + 1], list[k + 2])) { editSet(list[k], list[k + 1], list[k + 2], 0); n++; }
  endBatch();
  if (!quiet) toast('Apagados ' + n + ' blocos.');
}

/* Girar 90° no sentido horário (visto de cima): posição e estado de cada bloco */
var CWD = { north: 'east', east: 'south', south: 'west', west: 'north' };
var RAIL_CW = { north_south: 'east_west', east_west: 'north_south', ascending_north: 'ascending_east', ascending_east: 'ascending_south',
  ascending_south: 'ascending_west', ascending_west: 'ascending_north', south_east: 'south_west', south_west: 'north_west', north_west: 'north_east', north_east: 'south_east' };
function rotValue(k, v) {
  if (k === 'facing' && CWD[v]) return CWD[v];
  if (k === 'axis') return v === 'x' ? 'z' : v === 'z' ? 'x' : v;
  if (k === 'rotation') return String((+v + 4) % 16);
  if (k === 'shape' && RAIL_CW[v]) return RAIL_CW[v];
  if (k === 'orientation') return v.split('_').map(function (p) { return CWD[p] || p; }).join('_');
  return v;
}
function rotateCell(v) {
  if (!v) return 0;
  var bi = cellBlock(v), b = BLOCKS[bi], s = cellOri(v);
  if (b.shape) {
    var o = stateProps(b, s), r = {};
    for (var k in o) r[k] = rotValue(k, o[k]);
    ['north', 'east', 'south', 'west'].forEach(function (h) { if (h in o) r[CWD[h]] = o[h]; }); // trepadeiras e afins
    return mkCell(bi, stateIndex(b, r));
  }
  if (b.ori) {
    var want = rotValue(b.ori.k, b.ori.o[s][0]);
    for (var i = 0; i < b.ori.o.length; i++) if (b.ori.o[i][0] === want) return mkCell(bi, i);
  }
  return v;
}
function rotateClip() {
  if (!clip) return;
  var w = clip.w, h = clip.h, l = clip.l, out = new Uint32Array(clip.cells.length);
  for (var y = 0; y < h; y++) for (var z = 0; z < l; z++) for (var x = 0; x < w; x++) {
    var nx = l - 1 - z, nz = x; // norte vira leste
    out[(y * w + nz) * l + nx] = rotateCell(clip.cells[(y * l + z) * w + x]);
  }
  clip = { w: l, h: h, l: w, cells: out, n: clip.n };
  updateSelChip(); updatePreview();
}

/* Colar: a prévia fica centralizada no ponto apontado, apoiada nele */
function pasteOrigin(t) {
  var c = t && t.place; if (!c || !clip) return null;
  return [c[0] - Math.floor(clip.w / 2), c[1], c[2] - Math.floor(clip.l / 2)];
}
function startPaste() {
  if (!clip) { toast('Nada copiado ainda: selecione uma área e use Copiar (Ctrl+C).'); return; }
  pasting = true; anchor = null; updateAnchorChip(); selRefresh();
  toast('Clique onde quer colar. R gira 90°, Esc cancela.');
}
function commitPaste(t) {
  var o = pasteOrigin(t); if (!o) return;
  var n = 0, out = 0;
  beginBatch();
  for (var y = 0; y < clip.h; y++) for (var z = 0; z < clip.l; z++) for (var x = 0; x < clip.w; x++) {
    var v = clip.cells[(y * clip.l + z) * clip.w + x]; if (!v) continue; // o ar copiado não apaga o que já existe
    var X = o[0] + x, Y = o[1] + y, Z = o[2] + z;
    if (!inB(X, Y, Z)) { out++; continue; }
    editSet(X, Y, Z, v); n++;
  }
  endBatch();
  toast('Colados ' + n + ' blocos' + (out ? ' (' + out + ' ficaram fora do espaço)' : '') + '. Clique de novo para colar outra cópia, Esc para terminar.', 5000);
}
function pastePreview(t) {
  var o = pasteOrigin(t); if (!o) return;
  var m = new THREE.Matrix4(), k = 0, info = new THREE.Color(cssColor('--info'));
  for (var y = 0; y < clip.h && k < 40000; y++) for (var z = 0; z < clip.l && k < 40000; z++) for (var x = 0; x < clip.w && k < 40000; x++) {
    if (!clip.cells[(y * clip.l + z) * clip.w + x]) continue;
    m.setPosition(o[0] + x + 0.5, o[1] + y + 0.5, o[2] + z + 0.5); previewInst.setMatrixAt(k++, m);
  }
  previewInst.count = k; previewInst.instanceMatrix.needsUpdate = true; previewInst.material.color.copy(info);
  ghostEdges.visible = false;
}

/* Substituir na seleção: um tipo de bloco (ou todos) por outro; opcionalmente preenche o ar */
function convertCell(v, bi) {
  // tenta manter direção e estado quando o bloco novo tem as mesmas propriedades (escada por escada, tronco por tronco)
  var b = BLOCKS[bi];
  if (!v) return mkCell(bi);
  var from = BLOCKS[cellBlock(v)], s = cellOri(v), props = {};
  if (from.shape) props = stateProps(from, s);
  else if (from.ori) props[from.ori.k] = from.ori.o[s][0];
  if (b.shape) return mkCell(bi, stateIndex(b, props));
  if (b.ori && props[b.ori.k] != null) for (var i = 0; i < b.ori.o.length; i++) if (b.ori.o[i][0] === props[b.ori.k]) return mkCell(bi, i);
  return mkCell(bi);
}
function blockByText(txt) {
  txt = String(txt || '').trim().toLowerCase().replace(/^minecraft:/, '');
  if (!txt) return -1;
  if (/^(ar|air|nada|apagar)$/.test(txt)) return -2;
  if (txt in BY_JAVA) return BY_JAVA[txt];
  for (var i = 0; i < BLOCKS.length; i++) if (!BLOCKS[i].hide && BLOCKS[i].name.toLowerCase() === txt) return i;
  return -1;
}
function openReplace() {
  if (!sel) { toast('Selecione uma área primeiro (ferramenta Selecionar, V).'); return; }
  var counts = {}, sd = selSize(sel), vol = sd[0] * sd[1] * sd[2];
  blocksInBox(sel.a[0], sel.a[1], sel.a[2], sel.b[0], sel.b[1], sel.b[2], function (x, y, z, v) { var bi = cellBlock(v); counts[bi] = (counts[bi] || 0) + 1; });
  var total = Object.keys(counts).reduce(function (a, k) { return a + counts[k]; }, 0), empty = vol - total;
  var opts = '<option value="all">Todos os blocos (' + total + ')</option>' + Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; })
    .map(function (k) { return '<option value="' + k + '">' + esc(BLOCKS[k].name) + ' (' + counts[k] + ')</option>'; }).join('');
  var list = BLOCKS.map(function (b) { return b.hide ? '' : '<option value="' + esc(b.java) + '">' + esc(b.name) + '</option>'; }).join('');
  var d = selSize(sel);
  openDialog('<h3>Substituir na seleção</h3><p>Área de ' + d[0] + ' × ' + d[1] + ' × ' + d[2] + ' com ' + total + ' blocos e ' + empty + ' espaços vazios. Quando o bloco novo tem as mesmas propriedades (ex.: escada por escada), a direção é mantida.</p>' +
    '<label>Trocar<select id="rpFrom">' + opts + '</select></label>' +
    '<label>Por (nome ou id; “ar” apaga)<input type="text" id="rpTo" list="rpList" value="' + esc(BLOCKS[curBlock()].java) + '" autocomplete="off"></label><datalist id="rpList">' + list + '</datalist>' +
    '<label class="check"><input type="checkbox" id="rpFill"><span>Também preencher os espaços vazios da seleção com o bloco novo</span></label>' +
    '<p id="rpErr" class="err" hidden></p>' +
    '<div class="row"><button class="btn primary" id="rpOk">Substituir</button><button class="btn" id="rpNo">Cancelar</button></div>',
    function () {
      $('rpNo').onclick = closeDialog;
      $('rpOk').onclick = function () {
        var to = blockByText($('rpTo').value);
        if (to === -1) { $('rpErr').hidden = false; $('rpErr').textContent = 'Bloco não encontrado: escreva o id (ex.: stone_bricks) ou escolha um nome da lista.'; return; }
        var from = $('rpFrom').value, fill = $('rpFill').checked && to >= 0, n = 0;
        if (fill && vol > 16e6) { $('rpErr').hidden = false; $('rpErr').textContent = 'Preencher ' + Math.round(vol / 1e6) + ' milhões de espaços de uma vez é demais para desfazer. Selecione uma área menor.'; return; }
        beginBatch();
        if (fill) {
          for (var y = sel.a[1]; y <= sel.b[1]; y++) for (var z = sel.a[2]; z <= sel.b[2]; z++) for (var x = sel.a[0]; x <= sel.b[0]; x++) {
            var v = gget(x, y, z);
            if (v ? (from === 'all' || cellBlock(v) === +from) : true) { editSet(x, y, z, convertCell(v, to)); n++; }
          }
        } else { // só onde há blocos: percorre só os pedaços ocupados
          var list = []; blocksInBox(sel.a[0], sel.a[1], sel.a[2], sel.b[0], sel.b[1], sel.b[2], function (x, y, z, v) { if (from === 'all' || cellBlock(v) === +from) list.push(x, y, z); });
          for (var k = 0; k < list.length; k += 3) { var w = gget(list[k], list[k + 1], list[k + 2]); if (w) { editSet(list[k], list[k + 1], list[k + 2], to === -2 ? 0 : convertCell(w, to)); n++; } }
        }
        endBatch(); closeDialog();
        toast(n + ' blocos ' + (to === -2 ? 'apagados' : 'trocados por ' + BLOCKS[to].name) + '.');
      };
    });
}

$('selBtns').addEventListener('click', function (e) {
  var b = e.target.closest('[data-s]'); if (!b) return;
  var a = b.getAttribute('data-s');
  if (a === 'copy') copySel(false); else if (a === 'cut') copySel(true); else if (a === 'del') deleteSel(false);
  else if (a === 'repl') openReplace(); else if (a === 'paste') startPaste(); else if (a === 'rot') rotateClip();
  else if (a === 'cancel') { pasting = false; selRefresh(); } else if (a === 'clear') clearSel();
});
/* Teclado da seleção (chamado antes dos atalhos normais); devolve true se tratou a tecla */
function selectionKey(e, k) {
  var ctrl = e.ctrlKey || e.metaKey;
  if (ctrl && k === 'c' && sel) { e.preventDefault(); copySel(false); return true; }
  if (ctrl && k === 'x' && sel) { e.preventDefault(); copySel(true); return true; }
  if (ctrl && k === 'v') { e.preventDefault(); startPaste(); return true; }
  if ((k === 'delete' || k === 'backspace') && sel && !ctrl) { e.preventDefault(); deleteSel(false); return true; }
  if (pasting && k === 'r' && !ctrl) { rotateClip(); return true; }
  return false;
}
function selectionEscape() {
  if (pasting) { pasting = false; selRefresh(); return true; }
  if (sel || selA) { clearSel(); return true; }
  return false;
}
