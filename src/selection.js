/* ---------- Seleção: selecionar, copiar, recortar, colar, apagar e substituir ---------- */
/* A seleção é uma caixa [min, max] escolhida com dois cliques (ferramenta Selecionar, V). A área de transferência guarda
   as células cruas (bloco + estado) relativas ao canto mínimo, então colar mantém direção, portas abertas etc. */
var selA = null;          // primeiro canto, enquanto a seleção está sendo feita
var sel = null;           // { a: [x,y,z] mínimo, b: [x,y,z] máximo }
var clip = null;          // { w, h, l, cells: Uint32Array, n: blocos }
var pasting = false;      // modo colar: a prévia segue o mouse e o clique cola
var pasteOff = [0, 0, 0]; // deslocamento da prévia pelas setas (soma ao ponto apontado; volta a zero ao começar a colar)
var pasteFixed = null;    // canto da cópia preso num lugar (Colar aqui, no mapa do mundo): a prévia não segue o mouse
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
    $('selTxt').innerHTML = '<b>Colar</b> ' + clip.w + ' × ' + clip.h + ' × ' + clip.l + ' (' + clip.n + ' blocos). ' + (pasteFixed ? 'No lugar marcado no mapa: as setas sobem, descem e empurram, R gira; Enter (ou um clique) cola.' : 'Clique (ou Enter) para colar.') + pasteOffTxt() + (pasteFixed && wio && wio.area ? ' <span class="mixl">Canto: X ' + (pasteFixed[0] + pasteOff[0] + wio.area.x0) + ', Y ' + (pasteFixed[1] + pasteOff[1] + wioDim(wio.area.dim).min) + ', Z ' + (pasteFixed[2] + pasteOff[2] + wio.area.z0) + '.</span>' : '');
    $('selBtns').innerHTML = '<span class="mvb"><b>Mover</b><button data-pm="u" title="Subir (seta ↑)">▲</button><button data-pm="d" title="Descer (seta ↓)">▼</button><button data-pm="l" title="Para a esquerda (seta ←)">←</button><button data-pm="r" title="Para a direita (seta →)">→</button><button data-pm="f" title="Para frente (Shift + seta ↑)">↑</button><button data-pm="b" title="Para trás (Shift + seta ↓)">↓</button>' + (pasteOff[0] || pasteOff[1] || pasteOff[2] ? '<button data-pm="0" title="Volta a prévia para o ponto apontado">Zerar</button>' : '') + (pasteFixed ? '<button data-pm="go" title="Enter">Colar aqui</button><button data-pm="free" title="A prévia volta a seguir o mouse">Seguir o mouse</button>' : '') + '</span>' +
      '<button data-s="rot" title="Girar 90° (R)">Girar 90°</button><button data-s="flipx" title="Espelhar: leste e oeste trocam de lado (F)">Espelhar ↔</button><button data-s="flipz" title="Espelhar: norte e sul trocam de lado (Shift+F)">Espelhar ↕</button><button data-s="cancel">Cancelar</button>';
  } else if (sel) {
    var d = selSize(sel);
    c.hidden = false;
    $('selTxt').innerHTML = '<b>Seleção</b> ' + d[0] + ' × ' + d[1] + ' × ' + d[2];
    $('selBtns').innerHTML = '<span class="mvb"><b>Mover</b><button data-m="f" title="Para frente (seta ↑)">↑</button><button data-m="b" title="Para trás (seta ↓)">↓</button><button data-m="l" title="Para a esquerda (seta ←)">←</button><button data-m="r" title="Para a direita (seta →)">→</button><button data-m="u" title="Subir (Page Up)">▲</button><button data-m="d" title="Descer (Page Down)">▼</button></span>' +
      '<button data-s="copy" title="Ctrl+C">Copiar</button><button data-s="cut" title="Ctrl+X">Recortar</button>' +
      '<button data-s="del" title="Delete">Apagar</button><button data-s="repl">Substituir…</button><button data-s="seat" title="Fundação até o chão, terreno acertado em volta, caminho das portas e vegetação do bioma">Assentar no terreno…</button><button data-s="lib" title="Guardar com nome para colar em outros projetos e mundos">Salvar na biblioteca</button>' +
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
  clip = { w: d[0], h: d[1], l: d[2], cells: cells, n: n, be: bentClipBox(sel.a, sel.b) }; // be: itens e texto (src/blockent.js)
  if (cut) { deleteSel(true); toast('Recortado: ' + n + ' blocos. Ctrl+V para colar.'); }
  else toast('Copiado: ' + n + ' blocos. Ctrl+V para colar.');
  selRefresh();
}
function deleteSel(quiet) {
  if (!sel) return;
  var n = 0;
  beginBatch('Apagar seleção');
  var list = []; blocksInBox(sel.a[0], sel.a[1], sel.a[2], sel.b[0], sel.b[1], sel.b[2], function (x, y, z) { list.push(x, y, z); });
  for (var k = 0; k < list.length; k += 3) if (gget(list[k], list[k + 1], list[k + 2])) { editSet(list[k], list[k + 1], list[k + 2], 0); n++; }
  endBatch();
  if (!quiet) toast('Apagados ' + n + ' blocos.');
}

/* Mover os blocos da seleção (e a seleção junto) um ou mais blocos. Frente, trás e lados seguem a câmera: "frente"
   é o eixo (X ou Z) mais perto da direção para onde a câmera olha. Os blocos movidos ocupam o lugar novo (trocando o que
   estiver lá); o ar da seleção não apaga nada. Com a simetria ligada, a área espelhada anda junto, para o lado espelhado.
   Cada passo é um passo de desfazer. */
function moveDir(m) {
  var fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw), f = Math.abs(fx) > Math.abs(fz) ? [Math.sign(fx), 0, 0] : [0, 0, Math.sign(fz)];
  var rt = [-f[2], 0, f[0]];
  return { f: f, b: [-f[0], 0, -f[2]], r: rt, l: [-rt[0], 0, -rt[2]], u: [0, 1, 0], d: [0, -1, 0] }[m];
}
function moveSel(d, steps) {
  if (!sel) return;
  steps = steps || 1;
  var dv = [d[0] * steps, d[1] * steps, d[2] * steps];
  // com a simetria ligada, a área espelhada (do outro lado de cada plano) anda junto, no sentido espelhado
  var moves = [{ a: sel.a, b: sel.b, d: dv }], skipped = 0;
  var on = [0, 1, 2].filter(function (a) { return sym.on[a]; });
  for (var mask = 1; mask < (1 << on.length); mask++) {
    var a = sel.a.slice(), b = sel.b.slice(), dd = dv.slice();
    on.forEach(function (ax, i) { if (!(mask & (1 << i))) return; var p = sym.p[ax], lo = p - b[ax], hi = p - a[ax]; a[ax] = lo; b[ax] = hi; dd[ax] = -dd[ax]; });
    var dup = false, clash = false;
    moves.forEach(function (m) {
      var same = m.a.join() === a.join() && m.b.join() === b.join();
      var meet = m.a[0] <= b[0] && a[0] <= m.b[0] && m.a[1] <= b[1] && a[1] <= m.b[1] && m.a[2] <= b[2] && a[2] <= m.b[2];
      if (same && m.d.join() === dd.join()) dup = true; else if (meet) clash = true; // a área cruza o plano: o espelho iria para o lado oposto
    });
    if (dup) continue;
    if (clash || !inB(a[0], a[1], a[2]) || !inB(b[0], b[1], b[2]) || !inB(a[0] + dd[0], a[1] + dd[1], a[2] + dd[2]) || !inB(b[0] + dd[0], b[1] + dd[1], b[2] + dd[2])) { skipped++; continue; }
    moves.push({ a: a, b: b, d: dd });
  }
  if (!inB(sel.a[0] + dv[0], sel.a[1] + dv[1], sel.a[2] + dv[2]) || !inB(sel.b[0] + dv[0], sel.b[1] + dv[1], sel.b[2] + dv[2])) { toast('A seleção sairia do espaço: não dá para mover para esse lado.'); return; }
  var lists = [], total = 0;
  moves.forEach(function (m) { var l = []; blocksInBox(m.a[0], m.a[1], m.a[2], m.b[0], m.b[1], m.b[2], function (x, y, z, v) { l.push(x, y, z, v); }); lists.push(l); total += l.length / 4; });
  if (total > 16e6) { toast('Blocos demais para mover de uma vez (o máximo é 16 milhões). Selecione uma área menor.', 7000); return; }
  fluidStop();
  beginBatch('Mover seleção');
  var flow = flowOn; flowOn = false; // a água movida não escorre no meio do caminho
  try {
    // primeiro tira tudo de todas as áreas, depois põe no lugar novo (as áreas podem se cruzar no caminho)
    lists.forEach(function (l) { for (var k = 0; k < l.length; k += 4) editSet1(l[k], l[k + 1], l[k + 2], 0); });
    lists.forEach(function (l, i) { var q = moves[i].d; for (var k = 0; k < l.length; k += 4) editSet1(l[k] + q[0], l[k + 1] + q[1], l[k + 2] + q[2], l[k + 3]); });
    endBatch();
  } finally { flowOn = flow; }
  var before = sel;
  sel = { a: [sel.a[0] + dv[0], sel.a[1] + dv[1], sel.a[2] + dv[2]], b: [sel.b[0] + dv[0], sel.b[1] + dv[1], sel.b[2] + dv[2]] };
  var last = histTop(); if (last) { last.selBefore = before; last.selAfter = sel; last.label = 'Mover seleção'; } // desfazer leva a seleção junto
  selRefresh();
  if (skipped && !moveSel.warned) { moveSel.warned = true; toast('Simetria: a cópia espelhada não foi movida porque a seleção cruza o plano (ou o espelho sairia do espaço).', 7000); }
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
  if (pasteFixed) { var fc = [pasteFixed[0] + w / 2, pasteFixed[2] + l / 2]; pasteFixed = [Math.round(fc[0] - l / 2), pasteFixed[1], Math.round(fc[1] - w / 2)]; } // gira em volta do centro
  clip = { w: l, h: h, l: w, cells: out, n: clip.n, be: bentClipMap(clip.be, w, h, l, function (x, y, z) { return (y * w + x) * l + (l - 1 - z); }) };
  updateSelChip(); updatePreview();
}

/* Espelhar a cópia (eixo 0 = X, leste-oeste; 2 = Z, norte-sul): posições e estados (escadas, portas com a dobradiça
   do outro lado) pela mesma regra da simetria */
function flipClip(a) {
  if (!clip) return;
  var w = clip.w, h = clip.h, l = clip.l, out = new Uint32Array(clip.cells.length);
  for (var y = 0; y < h; y++) for (var z = 0; z < l; z++) for (var x = 0; x < w; x++) {
    var nx = a === 0 ? w - 1 - x : x, nz = a === 2 ? l - 1 - z : z;
    out[(y * l + nz) * w + nx] = mirrorCell(clip.cells[(y * l + z) * w + x], a);
  }
  clip = { w: w, h: h, l: l, cells: out, n: clip.n, be: bentClipMap(clip.be, w, h, l, function (x, y, z) { return (y * l + (a === 2 ? l - 1 - z : z)) * w + (a === 0 ? w - 1 - x : x); }) };
  updateSelChip(); updatePreview();
  toast(a === 0 ? 'Cópia espelhada: leste e oeste trocaram de lado.' : 'Cópia espelhada: norte e sul trocaram de lado.');
}

/* Colar: a prévia fica centralizada no ponto apontado, apoiada nele */
function pasteOrigin(t) {
  if (pasteFixed && clip) return [pasteFixed[0] + pasteOff[0], pasteFixed[1] + pasteOff[1], pasteFixed[2] + pasteOff[2]];
  var c = t && t.place; if (!c || !clip) return null;
  return [c[0] - Math.floor(clip.w / 2) + pasteOff[0], c[1] + pasteOff[1], c[2] - Math.floor(clip.l / 2) + pasteOff[2]];
}
/* Setas no modo colar: a prévia anda um bloco (m: u, d, l, r, f, b; frente e lados seguem a câmera, como ao mover a seleção); '0' zera */
function pasteNudge(m) {
  if (m === 'go') { commitPaste(null); return; }
  if (m === 'free') { pasteFixed = null; pasteOff = [0, 0, 0]; updateSelChip(); updatePreview(); return; }
  if (m === '0') pasteOff = [0, 0, 0];
  else { var d = moveDir(m); for (var i = 0; i < 3; i++) pasteOff[i] += d[i]; }
  updateSelChip(); updatePreview();
}
function pasteOffTxt() {
  var o = pasteOff; if (!o[0] && !o[1] && !o[2]) return '';
  var p = [];
  if (o[1]) p.push(Math.abs(o[1]) + (o[1] > 0 ? ' acima' : ' abaixo'));
  if (o[0]) p.push(Math.abs(o[0]) + (o[0] > 0 ? ' a leste' : ' a oeste'));
  if (o[2]) p.push(Math.abs(o[2]) + (o[2] > 0 ? ' ao sul' : ' ao norte'));
  return ' <span class="mixl">Deslocada: ' + p.join(', ') + '.</span>';
}
function startPaste() {
  if (!clip) { toast('Nada copiado ainda: selecione uma área e use Copiar (Ctrl+C).'); return; }
  pasting = true; pasteOff = [0, 0, 0]; pasteFixed = null; anchor = null; updateAnchorChip(); selRefresh();
  toast('Clique onde quer colar. As setas sobem, descem e levam para os lados (Shift + ↑ ↓: frente e trás); R gira 90°, Esc cancela.', 6000);
}
function commitPaste(t) {
  var o = pasteOrigin(t); if (!o) return;
  var n = 0, out = 0, up = 0, down = 0;
  beginBatch('Colar');
  for (var y = 0; y < clip.h; y++) for (var z = 0; z < clip.l; z++) for (var x = 0; x < clip.w; x++) {
    var v = clip.cells[(y * clip.l + z) * clip.w + x]; if (!v) continue; // o ar copiado não apaga o que já existe
    var X = o[0] + x, Y = o[1] + y, Z = o[2] + z;
    if (!inB(X, Y, Z)) { out++; if (Y >= SY) up++; else if (Y < 0) down++; continue; }
    editSet(X, Y, Z, v); n++;
  }
  var nbe = bentPasteAt(clip.be, clip.w, clip.l, o); // itens e texto (src/blockent.js)
  endBatch();
  if (pasteFixed) { pasting = false; pasteFixed = null; selRefresh(); toast('Colados ' + n + ' blocos no lugar marcado' + (nbe ? ' (' + nbe + ' com conteúdo ou texto)' : '') + '. ' + pasteOutTxt(out, up, down) + 'Ctrl+Z desfaz.', out ? 12000 : 6000); return; }
  toast('Colados ' + n + ' blocos' + (nbe ? ' (' + nbe + ' com conteúdo ou texto)' : '') + '. ' + pasteOutTxt(out, up, down) + 'Clique de novo para colar outra cópia, Esc para terminar.', out ? 12000 : 5000);
}
/* Blocos da cópia que não cabem: acima do teto, abaixo do chão ou fora pelos lados (num mundo do jogo, os limites de altura são os do mundo) */
function pasteOutTxt(out, up, down) {
  if (!out) return '';
  var D = wio && wio.area ? (wio.java ? JW_DIMS[wio.area.dim] : wioDim(wio.area.dim)) : null, top = D ? D.min + D.h - 1 : null, bot = D ? D.min : null;
  var p = [];
  if (up) p.push(up.toLocaleString('pt-BR') + ' acima ' + (D ? 'do teto do mundo (Y ' + top + ')' : 'do espaço'));
  if (down) p.push(down.toLocaleString('pt-BR') + ' abaixo ' + (D ? 'do fundo do mundo (Y ' + bot + ')' : 'do espaço'));
  if (out - up - down) p.push((out - up - down).toLocaleString('pt-BR') + ' fora pelos lados' + (D ? ' (fora da área carregada)' : ''));
  return 'Atenção: ' + out.toLocaleString('pt-BR') + ' blocos ficaram de fora: ' + p.join(', ') + '. ';
}
/* Quantos blocos da cópia ficariam acima do teto e abaixo do fundo com a origem o (para o aviso da prévia): pela contagem
   de blocos de cada camada da cópia, feita uma vez por cópia ([total, acima, abaixo]) */
var pasteLayOf = null, pasteLay = null;
function pasteOutCount(o) {
  if (pasteLayOf !== clip) {
    pasteLay = new Int32Array(clip.h); var a = clip.w * clip.l;
    for (var y = 0; y < clip.h; y++) { var n = 0, b = y * a; for (var q = 0; q < a; q++) if (clip.cells[b + q]) n++; pasteLay[y] = n; }
    pasteLayOf = clip;
  }
  var up = 0, down = 0;
  for (var yy = 0; yy < clip.h; yy++) { var Y = o[1] + yy; if (Y >= SY) up += pasteLay[yy]; else if (Y < 0) down += pasteLay[yy]; }
  return [up + down, up, down];
}
var pasteWarnAt = '';
/* Pontos da prévia, calculados uma vez por cópia: todos os blocos se couberem; senão, só a casca (blocos com um lado
   vazio) e, se ainda passar, uma amostra espalhada dela (a prévia nunca mostra só as camadas de baixo) */
var pastePtsOf = null, pastePtsArr = null;
function pastePts() {
  if (pastePtsOf === clip && pastePtsArr) return pastePtsArr;
  var cap = previewInst.instanceMatrix.count, w = clip.w, h = clip.h, l = clip.l, c = clip.cells, out = [];
  var at = function (x, y, z) { return x >= 0 && y >= 0 && z >= 0 && x < w && y < h && z < l && c[(y * l + z) * w + x]; };
  var shell = clip.n > cap;
  for (var y = 0; y < h; y++) for (var z = 0; z < l; z++) for (var x = 0; x < w; x++) {
    if (!c[(y * l + z) * w + x]) continue;
    if (shell && at(x + 1, y, z) && at(x - 1, y, z) && at(x, y + 1, z) && at(x, y - 1, z) && at(x, y, z + 1) && at(x, y, z - 1)) continue;
    out.push(x, y, z);
  }
  var nn = out.length / 3;
  if (nn > cap) { var step = nn / cap, sm = []; for (var i = 0; i < cap; i++) { var q = Math.floor(i * step) * 3; sm.push(out[q], out[q + 1], out[q + 2]); } out = sm; }
  pastePtsOf = clip; pastePtsArr = out;
  return out;
}
/* Caixa de contorno da cópia no modo colar (como a da seleção, por cima dos blocos) */
var pasteBox = null;
function pasteBoxAt(o) {
  if (!pasteBox || pasteBox.userData.k !== clip.w + ',' + clip.h + ',' + clip.l) {
    if (pasteBox) { scene.remove(pasteBox); pasteBox.geometry.dispose(); }
    pasteBox = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(clip.w + 0.06, clip.h + 0.06, clip.l + 0.06)),
      new THREE.LineBasicMaterial({ color: new THREE.Color(cssColor('--info')), depthTest: false, transparent: true }));
    pasteBox.renderOrder = 8; pasteBox.userData.k = clip.w + ',' + clip.h + ',' + clip.l; scene.add(pasteBox);
  }
  pasteBox.position.set(o[0] + clip.w / 2, o[1] + clip.h / 2, o[2] + clip.l / 2); pasteBox.visible = true;
}
function pasteBoxHide() { if (pasteBox && pasteBox.visible) { pasteBox.visible = false; requestRender(); } }
function pastePreview(t) {
  var o = pasteOrigin(t); if (!o) return;
  // aviso quando a cópia passa do teto ou do fundo (uma vez por posição de altura)
  var oc = pasteOutCount(o), wk = o[1] + ':' + oc[1] + ':' + oc[2];
  if ((oc[1] || oc[2]) && wk !== pasteWarnAt) { pasteWarnAt = wk; toast(pasteOutTxt(oc[0], oc[1], oc[2]) + 'Cole mais ' + (oc[1] ? 'para baixo' : 'para cima') + ' para caber.', 6000); }
  if (!oc[1] && !oc[2]) pasteWarnAt = '';
  var m = new THREE.Matrix4(), info = new THREE.Color(cssColor('--info')), P = pastePts(), cap = previewInst.instanceMatrix.count, n = Math.min(P.length / 3, cap);
  for (var k = 0; k < n; k++) { m.setPosition(o[0] + P[k * 3] + 0.5, o[1] + P[k * 3 + 1] + 0.5, o[2] + P[k * 3 + 2] + 0.5); previewInst.setMatrixAt(k, m); }
  previewInst.count = n; previewInst.instanceMatrix.needsUpdate = true; previewInst.material.color.copy(info);
  pasteBoxAt(o); // o contorno da cópia, sempre visível, anda junto com o ponteiro e as setas
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
/* Substituir na seleção: por um bloco só, ou por uma mistura (a mesma do pincel de mistura, Q): cada bloco
   trocado sorteia o novo pela porcentagem de cada um da mistura (mixSampler, src/mixbrush.js).
   o (opcional) reabre a janela como estava: { mix, from, fill, surf } */
function openReplace(o) {
  if (!sel) { toast('Selecione uma área primeiro (ferramenta Selecionar, V).'); return; }
  o = o || {};
  var counts = {}, sd = selSize(sel), vol = sd[0] * sd[1] * sd[2];
  blocksInBox(sel.a[0], sel.a[1], sel.a[2], sel.b[0], sel.b[1], sel.b[2], function (x, y, z, v) { var bi = cellBlock(v); counts[bi] = (counts[bi] || 0) + 1; });
  var total = Object.keys(counts).reduce(function (a, k) { return a + counts[k]; }, 0), empty = vol - total;
  var opts = '<option value="all">Todos os blocos (' + total + ')</option>' + Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; })
    .map(function (k) { return '<option value="' + k + '">' + esc(BLOCKS[k].name) + ' (' + counts[k] + ')</option>'; }).join('');
  var list = BLOCKS.map(function (b) { return b.hide ? '' : '<option value="' + esc(b.java) + '">' + esc(b.name) + '</option>'; }).join('');
  var d = selSize(sel);
  openDialog('<h3>Substituir na seleção</h3><p>Área de ' + d[0] + ' × ' + d[1] + ' × ' + d[2] + ' com ' + total + ' blocos e ' + empty + ' espaços vazios. Quando o bloco novo tem as mesmas propriedades (ex.: escada por escada), a direção é mantida.</p>' +
    '<label>Trocar<select id="rpFrom">' + opts + '</select></label>' +
    '<div class="row" role="radiogroup" aria-label="Trocar por"><label class="check"><input type="radio" name="rpBy" value="one"' + (o.mix ? '' : ' checked') + '><span>Por um bloco</span></label><label class="check"><input type="radio" name="rpBy" value="mix"' + (o.mix ? ' checked' : '') + '><span>Por uma mistura (porcentagens)</span></label></div>' +
    '<div id="rpOne"><label>Por (nome ou id; “ar” apaga)<input type="text" id="rpTo" list="rpList" value="' + esc(BLOCKS[curBlock()].java) + '" autocomplete="off"></label><datalist id="rpList">' + list + '</datalist></div>' +
    '<div id="rpMix"><p class="pen">Cada bloco trocado sorteia um destes, com a chance de cada um (a mesma mistura do pincel de mistura, <kbd>Q</kbd>). “Ar” na mistura abre falhas.</p>' +
    '<div id="rpMixBar"></div><p id="rpMixTxt" class="pen"></p><div class="row"><button class="btn" id="rpMixEd">Editar mistura…</button><select id="rpPre" aria-label="Mistura pronta"><option value="">Mistura pronta…</option>' +
    MIX_PRESETS.map(function (q, i) { return '<option value="' + i + '">' + esc(q[0]) + '</option>'; }).join('') + '</select></div></div>' +
    '<label class="check"><input type="checkbox" id="rpSurf"' + (o.surf ? ' checked' : '') + '><span>Só a superfície (blocos com uma face para o vazio: a “pele” da parede ou do terreno)</span></label>' +
    '<label class="check"><input type="checkbox" id="rpFill"' + (o.fill ? ' checked' : '') + '><span>Também preencher os espaços vazios da seleção com o bloco novo (ou a mistura)</span></label>' +
    '<p id="rpErr" class="err" hidden></p>' +
    '<div class="row"><button class="btn primary" id="rpOk">Substituir</button><button class="btn" id="rpNo">Cancelar</button></div>',
    function () {
      if (o.from != null && overlayRoot.querySelector('#rpFrom option[value="' + o.from + '"]')) $('rpFrom').value = o.from;
      var byMix = function () { return overlayRoot.querySelector('[name="rpBy"]:checked').value === 'mix'; };
      var mixUI = function () {
        var S = mixSampler(mix.mats);
        $('rpMixBar').innerHTML = mixBarHtml(mix.mats, true);
        $('rpMixTxt').innerHTML = mix.mats.map(function (m) { return esc(mixName(m[0])) + ' ' + mixFmt(m[1]) + '%'; }).join(' · ') + (S.err ? ' <b class="err">(' + esc(S.err) + ')</b>' : '');
      };
      var sync = function () { var m = byMix(); $('rpOne').hidden = m; $('rpMix').hidden = !m; $('rpFill').nextElementSibling.textContent = 'Também preencher os espaços vazios da seleção com ' + (m ? 'a mistura' : 'o bloco novo'); $('rpErr').hidden = true; };
      var state = function () { return { mix: byMix(), from: $('rpFrom').value, fill: $('rpFill').checked, surf: $('rpSurf').checked }; };
      overlayRoot.querySelectorAll('[name="rpBy"]').forEach(function (r) { r.onchange = sync; });
      $('rpSurf').onchange = function () { if ($('rpSurf').checked) $('rpFill').checked = false; };
      $('rpFill').onchange = function () { if ($('rpFill').checked) $('rpSurf').checked = false; };
      // o editor da mistura é o do pincel; ao usar, volta para esta janela com a mistura nova
      $('rpMixEd').onclick = function () { var st = state(); openMixEditor(null, function () { openReplace(st); }); };
      $('rpPre').onchange = function (e) { var q = MIX_PRESETS[+e.target.value]; if (e.target.value === '' || !q) return; mix.mats = q[1].map(function (m) { return [m[0], m[1]]; }); mixSave(); updateMixChip(); mixUI(); e.target.value = ''; };
      mixUI(); sync();
      $('rpNo').onclick = closeDialog;
      $('rpOk').onclick = function () {
        var err = function (t) { $('rpErr').hidden = false; $('rpErr').textContent = t; };
        var useMix = byMix(), S = null, to = -1;
        if (useMix) { S = mixSampler(mix.mats); if (S.err) { err(S.err + ' Ajuste em Editar mistura.'); return; } }
        else { to = blockByText($('rpTo').value); if (to === -1) { err('Bloco não encontrado: escreva o id (ex.: stone_bricks) ou escolha um nome da lista.'); return; } }
        var from = $('rpFrom').value, fill = $('rpFill').checked && (useMix || to >= 0), surf = $('rpSurf').checked && !fill, n = 0;
        var got = useMix ? mix.mats.map(function () { return 0; }) : null;
        // o bloco novo de cada posição: o fixo, ou um sorteio da mistura (ar = apagar)
        var newCell = function (v) {
          if (!useMix) return to === -2 ? 0 : convertCell(v, to);
          var m = S.pick(Math.random()), bi = S.bis[m]; got[m]++;
          return bi === AIR_BI ? 0 : convertCell(v, bi);
        };
        if (fill && vol > 16e6) { err('Preencher ' + Math.round(vol / 1e6) + ' milhões de espaços de uma vez é demais para desfazer. Selecione uma área menor.'); return; }
        beginBatch((fill ? 'Substituir e preencher' : 'Substituir') + (useMix ? ' (mistura)' : ''));
        if (fill) {
          for (var y = sel.a[1]; y <= sel.b[1]; y++) for (var z = sel.a[2]; z <= sel.b[2]; z++) for (var x = sel.a[0]; x <= sel.b[0]; x++) {
            var v = gget(x, y, z);
            if (v ? (from === 'all' || cellBlock(v) === +from) : true) { var nv = newCell(v); if (nv !== v) { editSet(x, y, z, nv); n++; } }
          }
        } else { // só onde há blocos: percorre só os pedaços ocupados (a superfície é vista antes de mudar qualquer bloco)
          var list = []; blocksInBox(sel.a[0], sel.a[1], sel.a[2], sel.b[0], sel.b[1], sel.b[2], function (x, y, z, v) { if ((from === 'all' || cellBlock(v) === +from) && (!surf || mixAccepts('surface', x, y, z))) list.push(x, y, z); });
          for (var k = 0; k < list.length; k += 3) { var w = gget(list[k], list[k + 1], list[k + 2]); if (w) { var nw = newCell(w); if (nw !== w) { editSet(list[k], list[k + 1], list[k + 2], nw); n++; } } }
        }
        endBatch(); closeDialog();
        if (!useMix) { toast(n + ' blocos ' + (to === -2 ? 'apagados' : 'trocados por ' + BLOCKS[to].name) + '.'); return; }
        var tot = got.reduce(function (a, b) { return a + b; }, 0);
        if (!tot) { toast('Nenhum bloco para trocar na seleção.'); return; }
        // o que saiu de fato, para comparar com a mistura pedida (como no pincel)
        toast(tot.toLocaleString('pt-BR') + ' blocos sorteados: ' + mix.mats.map(function (m, i) { return mixName(m[0]) + ' ' + Math.round(100 * got[i] / tot) + '% (pedido ' + mixFmt(m[1]) + '%)'; }).join(' · '), 7000);
      };
    });
}

$('selBtns').addEventListener('click', function (e) {
  var pmv = e.target.closest('[data-pm]'); if (pmv) { pasteNudge(pmv.getAttribute('data-pm')); return; }
  var mv = e.target.closest('[data-m]'); if (mv) { moveSel(moveDir(mv.getAttribute('data-m')), e.shiftKey ? 5 : 1); return; }
  var b = e.target.closest('[data-s]'); if (!b) return;
  var a = b.getAttribute('data-s');
  if (a === 'copy') copySel(false); else if (a === 'cut') copySel(true); else if (a === 'del') deleteSel(false);
  else if (a === 'repl') openReplace(); else if (a === 'seat') openSeat(); else if (a === 'lib') libSaveSel(); else if (a === 'paste') startPaste(); else if (a === 'rot') rotateClip(); else if (a === 'flipx') flipClip(0); else if (a === 'flipz') flipClip(2);
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
  // setas no modo colar: ↑ ↓ sobem e descem, ← → para os lados, Shift + ↑ ↓ frente e trás (Page Up e Page Down também sobem e descem)
  var pm = pasting && !ctrl ? { arrowup: e.shiftKey ? 'f' : 'u', arrowdown: e.shiftKey ? 'b' : 'd', arrowleft: 'l', arrowright: 'r', pageup: 'u', pagedown: 'd' }[k] : null;
  if (pm) { e.preventDefault(); pasteNudge(pm); return true; }
  if (pasting && k === 'enter' && !ctrl && (hoverT || pasteFixed)) { e.preventDefault(); commitPaste(hoverT); updatePreview(); updateStatus(); return true; }
  if (pasting && k === 'f' && !ctrl) { flipClip(e.shiftKey ? 2 : 0); return true; }
  // com a ferramenta Selecionar e uma área marcada, as setas e Page Up/Down movem os blocos (Shift: 5 de cada vez)
  var mk = { arrowup: 'f', arrowdown: 'b', arrowleft: 'l', arrowright: 'r', pageup: 'u', pagedown: 'd' }[k];
  if (mk && sel && tool === 'select' && !pasting && !ctrl) { e.preventDefault(); moveSel(moveDir(mk), e.shiftKey ? 5 : 1); return true; }
  return false;
}
function selectionEscape() {
  if (pasting) { pasting = false; selRefresh(); return true; }
  if (sel || selA) { clearSel(); return true; }
  return false;
}
