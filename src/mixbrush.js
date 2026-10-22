/* ---------- Pincel de mistura: vários blocos em proporções definidas ---------- */
/* O usuário monta uma mistura de 2 a 10 blocos, cada um com uma porcentagem (a soma tem de dar exatamente 100%).
   O raio do ponteiro (castRay, a partir da câmera) dá o ponto de impacto; em volta dele, uma esfera ou um cubo de
   raio r (brushVolume, o mesmo do pincel de troca). Cada voxel do volume que o modo aceita sorteia o seu bloco pela
   distribuição: amostragem ponderada por uma tabela acumulada (ex.: 60/30/10 → [60, 90, 100]; um número de 0 a 100
   cai no primeiro degrau maior que ele). Como cada voxel sorteia sozinho, o resultado é um salpicado natural que, em
   média, segue as porcentagens. Os voxels já pintados no mesmo traço não sorteiam de novo (passar o pincel parado
   não "ferve" a textura). As mudanças entram no lote de desfazer do traço e marcam os pedaços da malha a refazer.
   Modos: Pintar (troca só blocos que existem), Superfície (só os que têm uma face no vazio: a "pele" do terreno ou da
   parede) e Encher (só o vazio: constrói uma bola ou um cubo misturado sem mexer no que existe).
   "Ar" pode entrar na mistura: no Pintar, abre falhas (ruínas, erosão); no Encher, deixa buracos. */
var MIX_PRESETS = [
  ['Pedra velha', [['stone_bricks', 55], ['cracked_stone_bricks', 25], ['mossy_stone_bricks', 20]]],
  ['Caminho de terra', [['dirt_path', 50], ['coarse_dirt', 30], ['gravel', 20]]],
  ['Chão de floresta', [['grass_block', 60], ['podzol', 20], ['coarse_dirt', 10], ['moss_block', 10]]],
  ['Praia', [['sand', 70], ['sandstone', 15], ['gravel', 15]]],
  ['Montanha', [['stone', 50], ['andesite', 25], ['cobblestone', 15], ['gravel', 10]]],
  ['Neve', [['snow_block', 70], ['powder_snow', 15], ['packed_ice', 15]]],
  ['Calçada', [['cobblestone', 50], ['mossy_cobblestone', 25], ['stone', 15], ['gravel', 10]]],
  ['Ruína', [['stone_bricks', 45], ['cracked_stone_bricks', 25], ['mossy_stone_bricks', 15], ['air', 15]]],
  ['Telhado gasto', [['deepslate_tiles', 60], ['cracked_deepslate_tiles', 25], ['cobbled_deepslate', 15]]]
];
var mix = { mats: [['stone', 60], ['andesite', 25], ['cobblestone', 15]], r: 2, shape: 'sphere', mode: 'paint' };
try { var mx0 = JSON.parse(localStorage.getItem('bloco-a-bloco-mix') || 'null'); if (mx0 && Array.isArray(mx0.mats)) mix = Object.assign(mix, mx0); } catch (e) {}
function mixSave() { try { localStorage.setItem('bloco-a-bloco-mix', JSON.stringify(mix)); } catch (e) {} }
function mixBi(j) { return j === 'air' ? AIR_BI : j in BY_JAVA ? BY_JAVA[j] : -1; }
/* Blocos que não servem para a mistura: de duas partes (porta, cama, planta alta) e os só de parede */
function mixOk(bi) { var b = BLOCKS[bi]; return !!b && !b.hide && !(b.shape && b.shape.multi); }

/* Tabela da amostragem ponderada. Recebe [[bloco, porcentagem], ...] e devolve { pick(u), bis, cum } ou um erro.
   pick recebe um número uniforme em [0, 1) e devolve o índice do bloco sorteado. */
function mixSampler(mats) {
  if (!mats || mats.length < 2) return { err: 'A mistura precisa de pelo menos 2 blocos.' };
  var bis = [], cum = [], acc = 0;
  for (var i = 0; i < mats.length; i++) {
    var bi = mixBi(mats[i][0]), p = +mats[i][1];
    if (bi < 0 || !mixOk(bi)) return { err: 'Bloco que não serve na mistura: ' + mats[i][0] + '.' };
    if (!(p > 0)) return { err: 'Cada bloco precisa de mais de 0%.' };
    acc += p; bis.push(bi); cum.push(acc);
  }
  if (Math.abs(acc - 100) > 1e-6) return { err: 'A soma das porcentagens é ' + mixFmt(acc) + '%: precisa dar 100%.' };
  return {
    bis: bis, cum: cum,
    pick: function (u) { var x = u * 100, lo = 0, hi = cum.length - 1; while (lo < hi) { var m = (lo + hi) >> 1; if (x < cum[m]) hi = m; else lo = m + 1; } return lo; }
  };
}
function mixFmt(p) { return (Math.round(p * 10) / 10).toLocaleString('pt-BR'); }
/* O voxel entra no modo? */
function mixAccepts(mode, x, y, z) {
  var v = gget(x, y, z);
  if (mode === 'fill') return !v;
  if (!v) return false;
  if (mode === 'surface') {
    // pele: ao menos um vizinho vazio dentro do espaço, ou o topo do espaço (céu); a borda dos lados não conta
    if (y + 1 >= SY) return true;
    var nb = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    for (var k = 0; k < 6; k++) { var a = x + nb[k][0], b = y + nb[k][1], c = z + nb[k][2]; if (inB(a, b, c) && !gget(a, b, c)) return true; }
    return false;
  }
  return true;
}
/* O algoritmo pedido: ponto de impacto, raio, forma, mistura, modo. Devolve quantos voxels mudaram e quantos de cada
   bloco foram sorteados (counts[i] para mats[i]). done (Set de índices) guarda os voxels já sorteados no traço. */
function mixBrush(center, r, shape, mats, mode, done, rnd) {
  var S = mixSampler(mats); if (S.err) return { err: S.err, n: 0 };
  rnd = rnd || Math.random;
  var counts = mats.map(function () { return 0; }), n = 0, todo = [];
  // primeiro escolhe os voxels (o teste de superfície olha os vizinhos como estavam antes desta pincelada)
  brushVolume(center, r, shape, function (x, y, z) {
    var i = idx(x, y, z); if (done && done.has(i)) return;
    if (mixAccepts(mode, x, y, z)) todo.push(x, y, z, i);
  });
  for (var k = 0; k < todo.length; k += 4) {
    var x = todo[k], y = todo[k + 1], z = todo[k + 2], m = S.pick(rnd()), bi = S.bis[m];
    if (done) done.add(todo[k + 3]);
    counts[m]++;
    var v = gget(x, y, z), nv = bi === AIR_BI ? 0 : convertCell(v, bi); // convertCell mantém a direção quando dá
    if (nv !== v) { editSet(x, y, z, nv); n++; }
  }
  return { n: n, counts: counts, tried: todo.length / 4 };
}
function mixApply(t) {
  if (!t || !t.hit) return;
  var c = mix.mode === 'fill' && t.place ? t.place : t.hit;
  var res = mixBrush(c, mix.r, mix.shape, mix.mats, mix.mode, stroke && stroke.done);
  if (res.err) { toast(res.err + ' Ajuste em Editar mistura.', 5000); if (stroke) stroke.on = false; return; }
  if (stroke) { stroke.n += res.n; res.counts.forEach(function (q, i) { stroke.counts[i] = (stroke.counts[i] || 0) + q; }); }
}
function mixStart(t, shift) {
  if (shift) { if (t && t.hit) { var bi = cellBlock(gget(t.hit[0], t.hit[1], t.hit[2])); openMixEditor(BLOCKS[bi].java); } return; }
  if (!t || !t.hit) return;
  stroke = { mode: 'mix', cells: new Set(), done: new Set(), n: 0, counts: [] }; beginBatch('Pincel de mistura');
  mixApply(t); stroke.last = (t.hit || []).join(); if (stroke) stroke.on = stroke.on !== false;
}
function mixDrag(t) {
  if (!t || !t.hit) return;
  var key = t.hit.join(); if (key === stroke.last) return;
  mixApply(t); stroke.last = key;
}
function mixEnd(sm) {
  var tot = sm.counts.reduce(function (a, b) { return a + b; }, 0); if (!tot) { toast(mix.mode === 'fill' ? 'Nenhum espaço vazio dentro do pincel.' : 'Nenhum bloco dentro do pincel.'); return; }
  // o que saiu de fato, para comparar com a mistura pedida
  toast(tot.toLocaleString('pt-BR') + ' blocos sorteados: ' + mix.mats.map(function (m, i) { return mixName(m[0]) + ' ' + Math.round(100 * (sm.counts[i] || 0) / tot) + '% (pedido ' + mixFmt(m[1]) + '%)'; }).join(' · '), 6000);
}
function mixName(j) { var bi = mixBi(j); return bi === AIR_BI ? 'Ar' : bi >= 0 ? BLOCKS[bi].name : j; }

/* ---------- Aviso do canto ---------- */
function mixBarHtml(mats, big) {
  return '<span class="mixbar' + (big ? ' big' : '') + '">' + mats.map(function (m) {
    var bi = mixBi(m[0]), b = BLOCKS[bi] || {}, p = Math.max(0, +m[1] || 0);
    return '<span style="flex:' + p + ' 1 0;' + (bi >= 0 ? swatch(b) : 'background:#888') + '" title="' + esc(mixName(m[0])) + ': ' + mixFmt(p) + '%"></span>';
  }).join('') + '</span>';
}
function updateMixChip() {
  var c = $('mixChip'), on = tool === 'mix';
  c.hidden = !on; if (!on) return;
  var S = mixSampler(mix.mats);
  $('mixTxt').innerHTML = '<b>Mistura</b>' + mixBarHtml(mix.mats) + '<span class="mixl">' + mix.mats.map(function (m) { return esc(mixName(m[0])) + ' ' + mixFmt(m[1]) + '%'; }).join(' · ') + (S.err ? ' <b class="err">(soma ≠ 100%)</b>' : '') + '</span>';
  $('mixR').textContent = mix.r;
  c.querySelectorAll('[data-xs]').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-xs') === mix.shape); });
  c.querySelectorAll('[data-xm]').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-xm') === mix.mode); });
}
function setMixR(r) { mix.r = Math.max(0, Math.min(16, r)); mixSave(); updateMixChip(); updatePreview(); }
$('mixChip').addEventListener('click', function (e) {
  var b = e.target.closest('button'); if (!b) return;
  if (b.hasAttribute('data-xs')) { mix.shape = b.getAttribute('data-xs'); mixSave(); updateMixChip(); updatePreview(); }
  else if (b.hasAttribute('data-xm')) { mix.mode = b.getAttribute('data-xm'); mixSave(); updateMixChip(); updatePreview(); }
  else if (b.id === 'mixMinus') setMixR(mix.r - 1);
  else if (b.id === 'mixPlus') setMixR(mix.r + 1);
  else if (b.id === 'mixEdit') openMixEditor();
});
/* Prévia: os voxels que o pincel vai sortear, cada um já com a cor de um sorteio (uma amostra de como vai ficar) */
var mixPrevCol = null;
function mixPreview(t, accent) {
  if (!t || !t.hit) return;
  var c = mix.mode === 'fill' && t.place ? t.place : t.hit, S = mixSampler(mix.mats), m = new THREE.Matrix4(), n = 0, col = new THREE.Color();
  if (!previewInst.instanceColor) { previewInst.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(previewInst.instanceMatrix.count * 3).fill(1), 3); previewInst.material.needsUpdate = true; }
  brushVolume(c, mix.r, mix.shape, function (x, y, z) {
    if (n >= 40000 || !mixAccepts(mix.mode, x, y, z)) return;
    m.setPosition(x + 0.5, y + 0.5, z + 0.5); previewInst.setMatrixAt(n, m);
    // cor do sorteio para este voxel, fixa pela posição (a prévia não pisca ao mexer o mouse)
    var h = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453, u = h - Math.floor(h);
    var b = S.err ? null : BLOCKS[S.bis[S.pick(u)]], q = b && !b.isAir ? b.top || [150, 150, 150] : [255, 255, 255];
    col.setRGB(q[0] / 255, q[1] / 255, q[2] / 255); previewInst.setColorAt(n, col); n++;
  });
  previewInst.count = n; previewInst.instanceMatrix.needsUpdate = true; previewInst.instanceColor.needsUpdate = true;
  previewInst.material.color.setRGB(1, 1, 1); mixPrevCol = true;
  var d = 2 * mix.r + 1;
  ghostEdges.material.color.copy(accent); ghostEdges.scale.set(d, d, d); setBoxAt(ghostEdges, c); ghostEdges.visible = true;
}
/* As outras prévias usam uma cor só: volta as cores das instâncias para branco quando sai do pincel de mistura */
function mixPreviewReset() {
  if (!mixPrevCol || !previewInst.instanceColor) return;
  previewInst.instanceColor.array.fill(1); previewInst.instanceColor.needsUpdate = true; mixPrevCol = null;
}

/* ---------- Janela: editar a mistura ---------- */
/* done (opcional): quem chamou (ex.: Substituir na seleção) continua dali; sem ele, a ferramenta vira o pincel de mistura */
function openMixEditor(addJava, done) {
  var rows = mix.mats.map(function (m) { return [m[0], +m[1]]; });
  if (addJava && rows.length < 10 && !rows.some(function (r) { return r[0] === addJava; })) rows.push([addJava, 0]);
  var list = '<option value="ar">Ar (deixa vazio)</option>' + BLOCKS.map(function (b, i) { return b.hide || b.isAir || !mixOk(i) ? '' : '<option value="' + esc(b.java) + '">' + esc(b.name) + '</option>'; }).join('');
  openDialog('<h3>Mistura de blocos</h3><p>Cada voxel que o pincel toca sorteia um destes blocos, com a chance de cada um. A soma tem de dar <b>100%</b>. “Ar” abre falhas (no modo Pintar) ou deixa buracos (no Encher).</p>' +
    '<div class="row"><label style="flex:1">Começar de uma mistura pronta<select id="mxPre"><option value="">—</option>' + MIX_PRESETS.map(function (p, i) { return '<option value="' + i + '">' + esc(p[0]) + ' (' + p[1].map(function (m) { return m[1] + '% ' + mixName(m[0]); }).join(', ') + ')</option>'; }).join('') + '</select></label></div>' +
    '<div id="mxRows" class="mxrows"></div><datalist id="mxList">' + list + '</datalist>' +
    '<div id="mxBar"></div>' +
    '<div class="row"><button class="btn" id="mxAdd">+ Bloco</button><button class="btn" id="mxHot" title="Põe o bloco ativo da hotbar">+ Bloco da hotbar</button><button class="btn" id="mxEq">Dividir igualmente</button><button class="btn" id="mxNorm" title="Mantém a proporção entre os números e faz a soma virar 100 (ex.: 3, 1, 1 vira 60, 20, 20)">Ajustar para 100%</button><span id="mxSum" class="pen"></span></div>' +
    '<p class="err" id="mxErr" hidden></p>' +
    '<div class="row"><button class="btn primary" id="mxOk">Usar esta mistura</button><button class="btn" id="mxNo">Cancelar</button></div>', function () {
    overlayRoot.querySelector('.dialog').classList.add('wide');
    var read = function () {
      overlayRoot.querySelectorAll('.mxrow').forEach(function (el, i) {
        var t = el.querySelector('[data-mn]').value, bi = blockByText(t);
        rows[i][0] = bi === -2 ? 'air' : bi >= 0 ? BLOCKS[bi].java : t.trim();
        rows[i][1] = parseFloat(String(el.querySelector('[data-mp]').value).replace(',', '.')) || 0;
      });
    };
    var sum = function () { return rows.reduce(function (a, r) { return a + r[1]; }, 0); };
    var foot = function () {
      var s = sum(), ok = Math.abs(s - 100) < 1e-6;
      $('mxSum').innerHTML = 'Soma: <b class="' + (ok ? 'ok' : 'err') + '">' + mixFmt(s) + '%</b>' + (ok ? '' : s < 100 ? ' (faltam ' + mixFmt(100 - s) + ')' : ' (sobram ' + mixFmt(s - 100) + ')');
      $('mxBar').innerHTML = mixBarHtml(rows, true);
      overlayRoot.querySelectorAll('.mxrow').forEach(function (el, i) { var bi = mixBi(rows[i][0]); el.querySelector('.sw').setAttribute('style', bi >= 0 ? swatch(BLOCKS[bi]) : 'background:transparent;border:1px dashed var(--danger)'); el.querySelector('[data-mr]').value = Math.round(rows[i][1]); });
      $('mxAdd').disabled = $('mxHot').disabled = rows.length >= 10;
    };
    var draw = function () {
      $('mxRows').innerHTML = rows.map(function (r, i) {
        return '<div class="mxrow"><span class="sw"></span><input type="text" data-mn list="mxList" value="' + esc(r[0] === 'air' ? 'ar' : mixBi(r[0]) >= 0 ? BLOCKS[mixBi(r[0])].name : r[0]) + '" autocomplete="off" aria-label="Bloco ' + (i + 1) + '">' +
          '<input type="range" data-mr min="0" max="100" step="1" value="' + Math.round(r[1]) + '" aria-label="Porcentagem">' +
          '<input type="number" data-mp min="0" max="100" step="any" value="' + r[1] + '" aria-label="Porcentagem"><span>%</span>' +
          '<button class="btn" data-mx="' + i + '" title="Tirar"' + (rows.length <= 2 ? ' disabled' : '') + '>×</button></div>';
      }).join('');
      foot();
    };
    draw();
    $('mxRows').addEventListener('input', function (e) {
      var row = e.target.closest('.mxrow'); if (!row) return;
      if (e.target.hasAttribute('data-mr')) row.querySelector('[data-mp]').value = e.target.value;
      read(); foot(); $('mxErr').hidden = true;
    });
    $('mxRows').addEventListener('click', function (e) {
      var b = e.target.closest('[data-mx]'); if (!b) return;
      read(); rows.splice(+b.getAttribute('data-mx'), 1); draw();
    });
    $('mxPre').onchange = function (e) { var p = MIX_PRESETS[+e.target.value]; if (!p || e.target.value === '') return; rows = p[1].map(function (m) { return [m[0], m[1]]; }); draw(); };
    $('mxAdd').onclick = function () { read(); rows.push(['', 0]); draw(); overlayRoot.querySelector('.mxrow:last-child [data-mn]').focus(); };
    $('mxHot').onclick = function () { read(); var b = BLOCKS[curBlock()]; rows.push([b.isAir ? 'air' : b.java, 0]); draw(); };
    $('mxEq').onclick = function () {
      read(); var n = rows.length, base = Math.floor(1000 / n) / 10; // em décimos, e o resto vai para o primeiro
      rows.forEach(function (r) { r[1] = base; }); rows[0][1] = Math.round((100 - base * (n - 1)) * 10) / 10; draw();
    };
    $('mxNorm').onclick = function () {
      read(); var s = sum(); if (!(s > 0)) return;
      var acc = 0; rows.forEach(function (r, i) { if (i < rows.length - 1) { r[1] = Math.round(r[1] * 1000 / s) / 10; acc += r[1]; } });
      rows[rows.length - 1][1] = Math.round((100 - acc) * 10) / 10; draw();
    };
    $('mxNo').onclick = function () { closeDialog(); if (done) done(); };
    $('mxOk').onclick = function () {
      read();
      var seen = {}, dup = rows.filter(function (r) { if (seen[r[0]]) return true; seen[r[0]] = 1; return false; })[0];
      var S = dup ? { err: 'O bloco ' + mixName(dup[0]) + ' aparece duas vezes: junte as porcentagens numa linha só.' } : mixSampler(rows);
      if (S.err) { $('mxErr').hidden = false; $('mxErr').textContent = S.err; return; }
      mix.mats = rows; mixSave(); closeDialog();
      if (done) { updateMixChip(); done(); return; }
      if (tool !== 'mix') setTool('mix'); updateMixChip(); updatePreview();
      toast('Mistura pronta: ' + rows.map(function (m) { return mixFmt(m[1]) + '% ' + mixName(m[0]); }).join(', ') + '.');
    };
  });
}
