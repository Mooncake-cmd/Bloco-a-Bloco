/* ---------- Girar com precisão: a seleção gira em qualquer ângulo nos três eixos ---------- */
/* Selecionar → Girar com precisão… abre o aviso com os ângulos de X, Y e Z (em graus, com meio grau). A prévia azul mostra
   o resultado enquanto os números mudam; Enter aplica, Esc cancela. Cada bloco do resultado é o bloco da construção
   original que cai naquele lugar quando se desfaz o giro (o vizinho mais perto): não ficam buracos, e a construção não
   estica nem encolhe. A ordem é: inclina no Z (tomba para leste ou oeste), depois no X (tomba para sul ou norte) e por
   último gira no Y (visto de cima, sentido horário), em volta do meio da seleção; no modo Centro do chão (o padrão),
   o resultado depois desce ou sobe até o ponto mais baixo ficar na altura do chão da seleção (uma torre tombada fica
   deitada no chão, não metade enterrada). Onde o meio de um lugar cai no vazio, os cantos dele também são testados:
   paredes finas na diagonal ficam inteiras, sem frestas entre os blocos.
   O estado dos blocos (escadas, troncos, portas) gira junto com o múltiplo de 90° mais perto do giro no Y; nos tombos
   de 90° exatos, troncos, pistões, observadores e afins também deitam ou levantam. Com a simetria ligada e a seleção
   de um lado só, a cópia espelhada gira junto (espelhada). */
var TILT_PROBE = 0.15, tilt = null; // { sel, w, h, l, cells, a: [x, y, z], piv: 'base' | 'mid', cache }
var TILT_DIRS = { north: [0, 0, -1], south: [0, 0, 1], east: [1, 0, 0], west: [-1, 0, 0], up: [0, 1, 0], down: [0, -1, 0] };
function tiltMatrix(a) {
  var r = function (d) { var t = d * Math.PI / 180, c = Math.cos(t), s = Math.sin(t); if (Math.abs(c) < 1e-12) c = 0; if (Math.abs(s) < 1e-12) s = 0; return [c, s]; };
  var y = r(a[1]), x = r(a[0]), z = r(a[2]);
  var Ry = [[y[0], 0, -y[1]], [0, 1, 0], [y[1], 0, y[0]]]; // norte (-Z) vai para leste (+X) com +90
  var Rx = [[1, 0, 0], [0, x[0], -x[1]], [0, x[1], x[0]]]; // o topo tomba para o sul (+Z) com +90
  var Rz = [[z[0], z[1], 0], [-z[1], z[0], 0], [0, 0, 1]]; // o topo tomba para leste (+X) com +90
  var mul = function (A, B) { return A.map(function (row) { return [0, 1, 2].map(function (j) { return row[0] * B[0][j] + row[1] * B[1][j] + row[2] * B[2][j]; }); }); };
  return mul(Ry, mul(Rx, Rz));
}
function tiltOpen() {
  if (!sel) { toast('Selecione uma área primeiro (ferramenta Selecionar, V).'); return; }
  var d = selSize(sel), w = d[0], h = d[1], l = d[2];
  if (w * h * l > 32e6) { toast('Seleção grande demais para girar com precisão (o máximo é 32 milhões de espaços). Selecione uma área menor.', 7000); return; }
  var cells = new Uint32Array(w * h * l), n = 0, be = new Map(); // be: conteúdo (baú, placa) e enchimento, pela posição na seleção
  blocksInBox(sel.a[0], sel.a[1], sel.a[2], sel.b[0], sel.b[1], sel.b[2], function (x, y, z, v) {
    var f = ((y - sel.a[1]) * l + (z - sel.a[2])) * w + (x - sel.a[0]), i = idx(x, y, z); cells[f] = v; n++;
    if (bent.has(i) || rsFill.has(i)) be.set(f, [bent.get(i), rsFill.get(i)]);
  });
  if (!n) { toast('A seleção está vazia.'); return; }
  pasting = false;
  tilt = { sel: sel, w: w, h: h, l: l, cells: cells, be: be, n: n, a: tilt && tilt.sel === sel ? tilt.a : [0, 0, 0], piv: tilt ? tilt.piv : 'base', cache: null };
  tiltUI(); updatePreview();
}
function tiltClose() { tilt = null; tiltUI(); updatePreview(); }
/* O estado do bloco depois do giro */
function tiltStateFn(R, ay) {
  var q = R.map(function (row) { return row.map(Math.round); }), quarter = R.every(function (row, i) { return row.every(function (v, j) { return Math.abs(v - q[i][j]) < 0.02; }); });
  var memo = new Map();
  var yTurns = function (v, k) { for (var i = 0; i < k; i++) v = rotateCell(v); return v; };
  if (!quarter || q[1][1] === 1) { // só gira no Y (ou não é um múltiplo de 90°): pelos passos de 90° no Y
    var k = quarter ? ({ '1,0': 0, '0,1': 1, '-1,0': 2, '0,-1': 3 })[q[0][0] + ',' + q[2][0]] : ((Math.round(ay / 90) % 4) + 4) % 4;
    return function (v) { if (!k || !v) return v; var r = memo.get(v); if (r === undefined) { r = yTurns(v, k); memo.set(v, r); } return r; };
  }
  // tombo de 90°: a direção (facing) e o eixo (axis) dos blocos passam pela mesma rotação
  var dirOf = function (p) { for (var nm in TILT_DIRS) { var t = TILT_DIRS[nm]; if (t[0] === p[0] && t[1] === p[1] && t[2] === p[2]) return nm; } return null; };
  var rotDir = function (nm) { var t = TILT_DIRS[nm]; return dirOf([0, 1, 2].map(function (i) { return q[i][0] * t[0] + q[i][1] * t[1] + q[i][2] * t[2]; })); };
  var rotAxis = function (ax) { var t = ax === 'x' ? [1, 0, 0] : ax === 'y' ? [0, 1, 0] : [0, 0, 1], r = [0, 1, 2].map(function (i) { return Math.abs(q[i][0] * t[0] + q[i][1] * t[1] + q[i][2] * t[2]); }); return r[0] ? 'x' : r[1] ? 'y' : 'z'; };
  var fix = function (k, val, vals) {
    var nv = k === 'axis' ? rotAxis(val) : (k === 'facing' && TILT_DIRS[val]) ? rotDir(val) : val;
    return nv && vals.indexOf(nv) >= 0 ? nv : val; // uma escada não deita: fica como estava
  };
  return function (v) {
    if (!v) return v; var r = memo.get(v); if (r !== undefined) return r;
    var bi = cellBlock(v), b = BLOCKS[bi], s = cellOri(v); r = v;
    if (b.shape) { var o = stateProps(b, s), p = {}; b.sp.forEach(function (sp) { p[sp[0]] = fix(sp[0], o[sp[0]], sp[1]); }); r = mkCell(bi, stateIndex(b, p)); }
    else if (b.ori && (b.ori.k === 'axis' || b.ori.k === 'facing')) { var vals = b.ori.o.map(function (e) { return e[0]; }), want = fix(b.ori.k, b.ori.o[s][0], vals), i = vals.indexOf(want); if (i >= 0) r = mkCell(bi, i); }
    memo.set(v, r); return r;
  };
}
/* O resultado: [x, y, z, v, ...] nas posições novas, a caixa em volta e quantos sairiam do espaço */
function tiltCompute() {
  var T = tilt, key = T.a.join() + T.piv; if (T.cache && T.cache.key === key) return T.cache;
  var R = tiltMatrix(T.a), A = T.sel.a, w = T.w, h = T.h, l = T.l, C = T.cells;
  // gira em volta do meio de um bloco (o do meio da seleção): nos múltiplos de 90° cada bloco cai bem no meio de um
  // lugar, sem sobrar nem faltar; no modo chão, depois desce ou sobe até apoiar
  var c = [A[0] + Math.floor(w / 2) + 0.5, A[1] + Math.floor(h / 2) + 0.5, A[2] + Math.floor(l / 2) + 0.5];
  var lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (var k = 0; k < 8; k++) {
    var p = [(k & 1 ? w : 0) + A[0] - c[0], (k & 2 ? h : 0) + A[1] - c[1], (k & 4 ? l : 0) + A[2] - c[2]];
    for (var i = 0; i < 3; i++) { var v = R[i][0] * p[0] + R[i][1] * p[1] + R[i][2] * p[2] + c[i]; if (v < lo[i]) lo[i] = v; if (v > hi[i]) hi[i] = v; }
  }
  var x0 = Math.floor(lo[0] + 1e-6), y0 = Math.floor(lo[1] + 1e-6), z0 = Math.floor(lo[2] + 1e-6), x1 = Math.ceil(hi[0] - 1e-6), y1 = Math.ceil(hi[1] - 1e-6), z1 = Math.ceil(hi[2] - 1e-6);
  var lift = T.piv === 'mid' ? 0 : A[1] - y0; // centro do chão: o ponto mais baixo fica na altura do chão da seleção
  var st = tiltStateFn(R, T.a[1]), out = [], srcOf = [], from = -1, lost = 0, bb = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  // de volta à construção original (a inversa de uma rotação é a transposta): o bloco em que o ponto cai, ou 0
  var at = function (dx, dy, dz) {
    var sx = Math.floor(R[0][0] * dx + R[1][0] * dy + R[2][0] * dz + c[0] + 1e-6) - A[0], sy = Math.floor(R[0][1] * dx + R[1][1] * dy + R[2][1] * dz + c[1] + 1e-6) - A[1], sz = Math.floor(R[0][2] * dx + R[1][2] * dy + R[2][2] * dz + c[2] + 1e-6) - A[2];
    if (sx < 0 || sy < 0 || sz < 0 || sx >= w || sy >= h || sz >= l) return 0;
    from = (sy * l + sz) * w + sx; return C[from];
  };
  for (var y = y0; y < y1; y++) for (var z = z0; z < z1; z++) for (var x = x0; x < x1; x++) {
    var dx = x + 0.5 - c[0], dy = y + 0.5 - c[1], dz = z + 0.5 - c[2];
    // o meio do lugar; se cair no vazio, os cantos (a 0,15 do meio): paredes finas na diagonal ficam sem frestas
    var cv = at(dx, dy, dz);
    for (var q = 0; !cv && q < 8; q++) cv = at(dx + (q & 1 ? TILT_PROBE : -TILT_PROBE), dy + (q & 2 ? TILT_PROBE : -TILT_PROBE), dz + (q & 4 ? TILT_PROBE : -TILT_PROBE));
    if (!cv) continue;
    var Y = y + lift;
    if (!inB(x, Y, z)) { lost++; continue; }
    out.push(x, Y, z, st(cv)); srcOf.push(from);
    if (x < bb[0]) bb[0] = x; if (Y < bb[1]) bb[1] = Y; if (z < bb[2]) bb[2] = z; if (x > bb[3]) bb[3] = x; if (Y > bb[4]) bb[4] = Y; if (z > bb[5]) bb[5] = z;
  }
  T.cache = { key: key, out: out, src: srcOf, lost: lost, bb: out.length ? bb : null };
  return T.cache;
}
function tiltPreview() {
  if (!tilt || tilt.sel !== sel) { if (tilt) tiltClose(); return; }
  var r = tiltCompute(), o = r.out, n = o.length / 4, cap = previewInst.instanceMatrix.count, step = Math.max(1, Math.ceil(n / cap)), m = new THREE.Matrix4(), j = 0;
  for (var k = 0; k < n && j < cap; k += step) { m.setPosition(o[k * 4] + 0.5, o[k * 4 + 1] + 0.5, o[k * 4 + 2] + 0.5); previewInst.setMatrixAt(j++, m); }
  previewInst.count = j; previewInst.instanceMatrix.needsUpdate = true; previewInst.material.color.copy(new THREE.Color(cssColor('--info')));
  var info = $('tiltInfo');
  if (info) info.textContent = r.bb ? (r.bb[3] - r.bb[0] + 1) + ' × ' + (r.bb[4] - r.bb[1] + 1) + ' × ' + (r.bb[5] - r.bb[2] + 1) + ', ' + n + ' blocos (eram ' + tilt.n + ')' + (r.lost ? '; ' + r.lost + ' ficariam fora do espaço' : '') : 'nada ficaria no espaço';
}
function tiltApply() {
  if (!tilt) return;
  var r = tiltCompute(); if (!r.out.length) { toast('Nada ficaria dentro do espaço com esses ângulos.'); return; }
  var T = tilt, A = T.sel.a, o = r.out, cross = false;
  // simetria: com a seleção de um lado só, editSet gira a cópia espelhada junto; se ela cruza um plano, gira só a seleção
  for (var ax = 0; ax < 3; ax++) if (sym.on[ax] && sym.p[ax] - T.sel.b[ax] <= T.sel.b[ax] && T.sel.a[ax] <= sym.p[ax] - T.sel.a[ax]) cross = true;
  var saved = symBusy; if (cross) symBusy = true;
  fluidStop(); beginBatch('Girar com precisão');
  var flow = flowOn; flowOn = false;
  try {
    for (var y = 0; y < T.h; y++) for (var z = 0; z < T.l; z++) for (var x = 0; x < T.w; x++) if (T.cells[(y * T.l + z) * T.w + x]) editSet(A[0] + x, A[1] + y, A[2] + z, 0);
    for (var k = 0; k < o.length; k += 4) editSet(o[k], o[k + 1], o[k + 2], o[k + 3]);
    // o conteúdo vai para o primeiro lugar novo do bloco (num ângulo quebrado, um bloco pode aparecer em dois lugares: o baú não duplica os itens)
    var used = new Set(), beB = [], beA = [];
    T.be.forEach(function (e, f) { var x = f % T.w, r2 = (f - x) / T.w, z = r2 % T.l, y = (r2 - z) / T.l; beB.push([idx(A[0] + x, A[1] + y, A[2] + z), e[0] || null, e[1] || 0]); });
    for (k = 0; k < o.length; k += 4) { var f = r.src[k / 4], e = T.be.get(f); if (!e || used.has(f)) continue; used.add(f); var ni = idx(o[k], o[k + 1], o[k + 2]); beA.push([ni, e[0] || null, e[1] || 0]); if (e[0]) bentSet(ni, JSON.parse(JSON.stringify(e[0])), true); else if (e[1]) { rsFill.set(ni, e[1]); rsFillSave = true; } }
    endBatch();
  } finally { flowOn = flow; symBusy = saved; }
  var before = sel, bb = r.bb;
  sel = { a: [bb[0], bb[1], bb[2]], b: [bb[3], bb[4], bb[5]] };
  var last = histTop(); if (last) { last.selBefore = before; last.selAfter = sel; last.label = 'Girar com precisão'; if (beB.length) { last.beBefore = beB; last.beAfter = beA; } }
  var ang = T.a.map(function (v, i) { return v ? 'XYZ'[i] + ' ' + String(v).replace('.', ',') + '°' : ''; }).filter(Boolean).join(', ');
  tilt = null; tiltUI(); selRefresh();
  toast('Girada' + (ang ? ' (' + ang + ')' : '') + ': ' + (o.length / 4) + ' blocos.' + (r.lost ? ' ' + r.lost + ' ficaram fora do espaço.' : '') + (cross ? ' A seleção cruza o plano da simetria: só ela girou.' : '') + ' Ctrl+Z desfaz.', r.lost ? 9000 : 5000);
}
function tiltSet(i, v) {
  if (!tilt) return;
  v = Math.round((+v || 0) * 2) / 2; // meio grau
  while (v > 180) v -= 360; while (v <= -180) v += 360;
  tilt.a[i] = v; tilt.cache = null; tiltUI(true); updatePreview();
}
function tiltUI(keepInputs) {
  var c = $('tiltChip'); if (!c) return;
  c.hidden = !tilt; if (!tilt) return;
  if (keepInputs && c.firstChild) { for (var i = 0; i < 3; i++) { var e = $('tiltA' + i); if (document.activeElement !== e) e.value = tilt.a[i]; } return; }
  var nm = ['X <small>(tomba para o sul / norte)</small>', 'Y <small>(gira, visto de cima)</small>', 'Z <small>(tomba para leste / oeste)</small>'];
  c.innerHTML = '<b>Girar com precisão</b>' + [1, 0, 2].map(function (i) {
    return '<span class="mbtns tiltax"><b>' + nm[i] + '</b><button data-tt="' + i + ',-1" title="−1° (Shift: −15°)">−</button><input type="number" id="tiltA' + i + '" step="0.5" min="-180" max="180" value="' + tilt.a[i] + '" aria-label="Ângulo em ' + 'XYZ'[i] + '"><span>°</span><button data-tt="' + i + ',1" title="+1° (Shift: +15°)">+</button></span>';
  }).join('') +
    '<span class="mbtns"><b>Pivô</b><button data-tp="base" aria-pressed="' + (tilt.piv === 'base') + '" title="Gira em volta do meio e depois apoia o resultado no chão da seleção">Apoiado no chão</button><button data-tp="mid" aria-pressed="' + (tilt.piv === 'mid') + '" title="Gira em volta do meio da seleção, sem apoiar no chão">Centro</button></span>' +
    '<span id="tiltInfo" class="mixl"></span><span class="mbtns"><button data-tz="1">Zerar</button><button data-tc="1" title="Esc">Cancelar</button><button data-tg="1" class="on" title="Enter">Aplicar</button></span>';
}
function tiltBind() {
  var c = $('tiltChip'); if (!c) return;
  c.addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    if (b.dataset.tt) { var p = b.dataset.tt.split(','), i = +p[0]; tiltSet(i, tilt.a[i] + (+p[1]) * (e.shiftKey ? 15 : 1)); }
    else if (b.dataset.tp) { tilt.piv = b.dataset.tp; tilt.cache = null; tiltUI(); updatePreview(); }
    else if (b.dataset.tz) { tilt.a = [0, 0, 0]; tilt.cache = null; tiltUI(); updatePreview(); }
    else if (b.dataset.tc) tiltClose();
    else if (b.dataset.tg) tiltApply();
  });
  c.addEventListener('input', function (e) { var m = /^tiltA(\d)$/.exec(e.target.id || ''); if (m && e.target.value !== '' && e.target.value !== '-') tiltSet(+m[1], e.target.value); });
  c.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); tiltApply(); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); tiltClose(); }
  });
}
