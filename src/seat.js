/* ---------- Assentar no terreno: a construção selecionada passa a "nascer" do chão ---------- */
/* Depois de colar uma casa num mundo (ou num terreno gerado), ela costuma ficar flutuando num lado do morro e enterrada
   no outro, com a grama e as flores cortadas em volta. Com a construção selecionada (só ela, sem o chão), quatro passos,
   todos num lote só de desfazer:
   1. Fundação: em cada coluna da base da construção, o vão entre o bloco mais baixo e o chão é preenchido com o bloco
      da fundação. Só nas colunas da base (o bloco mais baixo até 2 acima do mais baixo de todos): um beiral do
      telhado não ganha uma parede embaixo.
   2. Terreno: numa faixa de M blocos em volta da base, o chão sobe ou desce até a altura da porta (o nível da base)
      e se mistura ao terreno de antes conforme se afasta (smoothstep pela distância até a base). Só mexe em chão:
      terra, grama, areia, pedra... Coluna com tronco de árvore ou água em cima fica como está.
   3. Caminho: de cada porta da base para fora, uma trilha de 3 de largura com a mistura escolhida (a de "Caminho de
      terra", por exemplo), seguindo o chão já ajustado.
   4. Vegetação: o chão e as plantas do bioma de cada coluna (bioTerra, o mesmo do pincel de bioma), sem árvores
      encostadas na construção nem no caminho. Sem bioma conhecido (fora de um mundo do jogo), o escolhido na janela. */
var seat = { found: true, fblock: '', terra: true, M: 6, path: true, pmix: 1, veg: true, bio: -1 };
try { var st0 = JSON.parse(localStorage.getItem('bloco-a-bloco-assentar') || 'null'); if (st0) seat = Object.assign(seat, st0); } catch (e) {}
function seatSave() { try { localStorage.setItem('bloco-a-bloco-assentar', JSON.stringify(seat)); } catch (e) {} }
/* O que conta como chão (o que o passo 2 pode subir, descer e cortar) */
var SEAT_GROUND = /^(stone|andesite|diorite|granite|tuff|deepslate|calcite|dripstone_block|smooth_basalt|ice|blue_ice)$/;
function seatJ(v) { return v ? BLOCKS[cellBlock(v)].java : ''; }
function seatIsGround(j) { return BIO_GROUND.test(j) || SEAT_GROUND.test(j); }
function seatIsSoft(j) { return !j || BIO_PLANT.test(j) || /leaves$/.test(j); } // o que fica por cima do chão e pode sair
/* Topo do chão da coluna, procurando de y0 para baixo: { y, j } ou null (tronco, água, construção, nada) */
function seatGround(x, z, y0) {
  for (var y = Math.min(y0, SY - 1); y >= 0; y--) {
    var j = seatJ(gget(x, y, z)); if (seatIsSoft(j)) continue;
    return seatIsGround(j) ? { y: y, j: j } : null;
  }
  return null;
}
/* Análise da seleção: a base (colunas e o nível), as portas e o bloco sugerido para a fundação */
/* Chão natural: o que vem de baixo da seleção sem interrupção é terreno, não construção (a casa enterrada no morro
   costuma ser selecionada com um pouco do morro junto) */
var SEAT_NATURAL = /^(grass_block|dirt|coarse_dirt|podzol|mycelium|sand|red_sand|gravel|mud|rooted_dirt|moss_block|pale_moss_block|clay|snow_block|powder_snow|stone|deepslate|andesite|diorite|granite|tuff|dirt_path|farmland)$/;
function seatTerrTop(x, z) {
  var y = sel.a[1];
  if (y > 0 && !SEAT_NATURAL.test(seatJ(gget(x, y - 1, z)))) return y - 1;
  while (y <= sel.b[1] && SEAT_NATURAL.test(seatJ(gget(x, y, z)))) y++;
  return y - 1;
}
function seatPlan() {
  var a = sel.a, b = sel.b, low = new Map(), minY = Infinity, cnt = {}, tt = new Map();
  var terr = function (x, z) { var k = x + z * SX; if (!tt.has(k)) tt.set(k, seatTerrTop(x, z)); return tt.get(k); };
  blocksInBox(a[0], a[1], a[2], b[0], b[1], b[2], function (x, y, z, v) {
    if (seatIsSoft(seatJ(v)) || y <= terr(x, z)) return;
    var k = x + ',' + z, o = low.get(k);
    if (o == null || y < o) low.set(k, y);
    if (y < minY) minY = y;
  });
  if (!low.size) return { err: 'Nenhum bloco na seleção.' };
  var base = new Map(), doors = [];
  low.forEach(function (y, k) { if (y <= minY + 2) base.set(k, y); });
  // bloco mais comum da camada de baixo (sugestão de fundação), se for um cubo comum
  base.forEach(function (y, k) { var p = k.split(','), j = seatJ(gget(+p[0], y, +p[1])), bl = BLOCKS[BY_JAVA[j]]; if (bl && !bl.shape && !bl.ori) cnt[j] = (cnt[j] || 0) + 1; });
  var fj = Object.keys(cnt).sort(function (p, q) { return cnt[q] - cnt[p]; })[0] || 'cobblestone';
  if (/planks|_log$|_wood$|wool|carpet|glass/.test(fj)) fj = 'cobblestone'; // piso de madeira: a fundação é de pedra
  blocksInBox(a[0], a[1], a[2], b[0], b[1], b[2], function (x, y, z, v) {
    var j = seatJ(v); if (!/_door$/.test(j) || /trapdoor/.test(j)) return;
    if (y > 0 && seatJ(gget(x, y - 1, z)) === j) return; // a metade de cima
    if (y > minY + 4) return; // porta da varanda do andar de cima
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
      var nx = x + d[0], nz = z + d[1];
      if (nx < 0 || nz < 0 || nx >= SX || nz >= SZ || base.has(nx + ',' + nz) || !seatIsSoft(seatJ(gget(nx, y, nz)))) return;
      doors.push({ x: x, y: y, z: z, dx: d[0], dz: d[1] });
    });
  });
  // nível do chão em volta: o de baixo da porta; sem porta, o de baixo da base
  var lvl = doors.length ? Math.min.apply(null, doors.map(function (d) { return d.y; })) - 1 : minY - 1;
  return { base: base, low: low, doors: doors, minY: minY, lvl: lvl, fj: fj };
}
/* Distância (em colunas) até a base, para cada coluna da faixa em volta (só a borda da base entra na conta) */
function seatRing(P, M) {
  var edge = [], x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  P.base.forEach(function (y, k) {
    var p = k.split(','), x = +p[0], z = +p[1];
    x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z);
    if (!P.base.has((x + 1) + ',' + z) || !P.base.has((x - 1) + ',' + z) || !P.base.has(x + ',' + (z + 1)) || !P.base.has(x + ',' + (z - 1))) edge.push(x, z);
  });
  var ring = [];
  for (var z = Math.max(0, z0 - M); z <= Math.min(SZ - 1, z1 + M); z++) for (var x = Math.max(0, x0 - M); x <= Math.min(SX - 1, x1 + M); x++) {
    if (P.base.has(x + ',' + z)) continue;
    var d2 = Infinity;
    for (var i = 0; i < edge.length; i += 2) { var dx = x - edge[i], dz = z - edge[i + 1], q = dx * dx + dz * dz; if (q < d2) d2 = q; }
    var d = Math.sqrt(d2); if (d <= M + 0.5) ring.push({ x: x, z: z, d: d });
  }
  return ring;
}
function seatRun(o) {
  var P = seatPlan(); if (P.err) return P;
  var R = { fund: 0, cols: 0, path: 0, terra: null, doors: P.doors.length }, saved = symBusy;
  var fv = cellFromName(o.fblock || P.fj); if (o.found && !fv) return { err: 'Bloco da fundação não encontrado: ' + o.fblock + '.' };
  symBusy = true; // a simetria não espelha o terreno
  beginBatch('Assentar no terreno');
  try {
    // 1. fundação
    if (o.found) P.base.forEach(function (yb, k) {
      var p = k.split(','), x = +p[0], z = +p[1];
      for (var y = yb - 1; y >= 0; y--) {
        var j = seatJ(gget(x, y, z));
        if (!(seatIsSoft(j) || j === 'water' || j === 'lava')) break;
        editSet(x, y, z, fv); R.fund++;
      }
    });
    var ring = seatRing(P, o.M), pathCols = new Set();
    // 2. terreno em volta: alvo = nível da base perto, o terreno de antes longe
    if (o.terra) ring.forEach(function (c) {
      var x = c.x, z = c.z, lo = P.low.get(x + ',' + z), g = seatGround(x, z, lo != null ? lo - 1 : SY - 1);
      if (!g) return;
      var t = Math.round(P.lvl + (g.y - P.lvl) * trSmooth(c.d / (o.M + 1))); if (lo != null) t = Math.min(t, lo - 1);
      if (t === g.y || t < 0) return;
      var above = seatJ(gget(x, g.y + 1, z)); if (above === 'water' || /(_log|_stem|_wood|hyphae)$/.test(above)) return;
      var top = gget(x, g.y, z), sub = g.y > 0 && seatIsGround(seatJ(gget(x, g.y - 1, z))) ? gget(x, g.y - 1, z) : (BIO_GROUND.test(g.j) && !/^(sand|red_sand|gravel)$/.test(g.j) ? cellFromName('dirt') : top);
      // as plantas e a neve de cima saem (a vegetação volta no passo 4)
      for (var y = g.y + 1; y < SY && y <= g.y + 3; y++) { var jj = seatJ(gget(x, y, z)); if (jj && BIO_PLANT.test(jj)) editSet(x, y, z, 0); }
      if (t > g.y) { // sobe: o topo vai para cima e o vão ganha o bloco de baixo
        for (y = g.y; y < t; y++) { if (y > g.y && !seatIsSoft(seatJ(gget(x, y, z)))) return; editSet(x, y, z, sub); }
        if (seatIsSoft(seatJ(gget(x, t, z)))) editSet(x, t, z, top);
      } else { // desce: tira o chão (só chão) e põe o topo mais embaixo
        for (y = g.y; y > t; y--) { if (!seatIsGround(seatJ(gget(x, y, z)))) break; editSet(x, y, z, 0); }
        if (y === t && seatIsGround(seatJ(gget(x, t, z)))) editSet(x, t, z, top);
      }
      R.cols++;
    });
    // 3. caminho das portas para fora (3 de largura, as beiradas com falhas)
    var PS = o.path ? mixSampler(o.pmix === -1 ? mix.mats : MIX_PRESETS[o.pmix][1]) : null;
    if (PS && PS.err) PS = null;
    if (PS) P.doors.forEach(function (d) {
      var len = o.M + 3, px = -d.dz, pz = d.dx;
      for (var s = 1; s <= len; s++) for (var w = -1; w <= 1; w++) {
        var x = d.x + d.dx * s + px * w, z = d.z + d.dz * s + pz * w;
        if (x < 0 || z < 0 || x >= SX || z >= SZ || P.base.has(x + ',' + z)) continue;
        pathCols.add(x + ',' + z);
        if (w && Math.random() < 0.3 + 0.4 * s / len) continue; // a trilha se desfaz nas beiradas e mais longe
        var g = seatGround(x, z, Math.min(SY - 1, d.y + 4)); if (!g) continue;
        for (var y = g.y + 1; y < SY && y <= g.y + 2; y++) { var jj = seatJ(gget(x, y, z)); if (jj && BIO_PLANT.test(jj)) editSet(x, y, z, 0); }
        var bi = PS.bis[PS.pick(Math.random())];
        if (bi !== AIR_BI) { editSet(x, g.y, z, mkCell(bi)); R.path++; }
      }
    });
    // 4. vegetação do bioma de cada coluna (sem árvore a menos de 4 blocos da base nem perto do caminho)
    if (o.veg) {
      var byBio = new Map(), near = function (x, z) {
        for (var dz = -4; dz <= 4; dz++) for (var dx = -4; dx <= 4; dx++) if (P.base.has((x + dx) + ',' + (z + dz))) return true;
        for (dz = -1; dz <= 1; dz++) for (dx = -1; dx <= 1; dx++) if (pathCols.has((x + dx) + ',' + (z + dz))) return true;
        return false;
      };
      ring.forEach(function (c) {
        if (pathCols.has(c.x + ',' + c.z) || P.low.has(c.x + ',' + c.z)) return;
        var id = bioAt(c.x, c.z); if (id < 0) id = o.bio;
        if (!byBio.has(id)) byBio.set(id, []); byBio.get(id).push(c.x, c.z);
      });
      var stt = { noTree: near };
      byBio.forEach(function (cols, id) { bioTerra(cols, id, stt); });
      R.terra = stt.terra;
    }
  } finally { endBatch(); symBusy = saved; }
  return R;
}
function openSeat() {
  if (!sel) { toast('Selecione a construção primeiro (ferramenta Selecionar, V): só ela, sem o chão em volta.'); return; }
  var P = seatPlan(); if (P.err) { toast(P.err); return; }
  var auto = bioAt(P.base.keys().next().value.split(',')[0] | 0, P.base.keys().next().value.split(',')[1] | 0) >= 0;
  if (seat.bio < 0) seat.bio = trBio('plains');
  var list = BLOCKS.map(function (b) { return b.hide ? '' : '<option value="' + esc(b.java) + '">' + esc(b.name) + '</option>'; }).join('');
  openDialog('<h3>Assentar no terreno</h3><p>Faz a construção selecionada parecer nascida do lugar: fundação até o chão, o terreno em volta acertado, um caminho saindo das portas e a vegetação do bioma. Tudo junto, num <kbd>Ctrl</kbd>+<kbd>Z</kbd> só.</p>' +
    '<p class="pen">Base: ' + P.base.size + ' colunas no nível Y ' + P.minY + '. ' + (P.doors.length ? P.doors.length + (P.doors.length > 1 ? ' saídas de porta' : ' saída de porta') + '; o chão em volta fica na altura da soleira (Y ' + P.lvl + ').' : 'Nenhuma porta na base: o chão fica rente ao bloco mais baixo, e não há caminho.') + '</p>' +
    '<label class="check"><input type="checkbox" id="saF"' + (seat.found ? ' checked' : '') + '><span>Fundação: preencher o vão entre a base e o chão</span></label>' +
    '<label>Bloco da fundação<input type="text" id="saFb" list="saList" value="' + esc(seat.fblock || P.fj) + '" autocomplete="off"></label><datalist id="saList">' + list + '</datalist>' +
    '<label class="check"><input type="checkbox" id="saT"' + (seat.terra ? ' checked' : '') + '><span>Acertar o terreno em volta (sobe ou desce até a soleira e se mistura ao terreno de antes)</span></label>' +
    '<label><span>Largura da faixa em volta: <b id="saMv">' + seat.M + '</b> blocos</span><input type="range" id="saM" min="2" max="16" value="' + seat.M + '"></label>' +
    '<label class="check"><input type="checkbox" id="saP"' + (seat.path ? ' checked' : '') + '><span>Caminho saindo das portas</span></label>' +
    '<label>Mistura do caminho<select id="saPm">' + MIX_PRESETS.map(function (q, i) { return '<option value="' + i + '"' + (seat.pmix === i ? ' selected' : '') + '>' + esc(q[0]) + '</option>'; }).join('') + '<option value="-1"' + (seat.pmix === -1 ? ' selected' : '') + '>A mistura do pincel de mistura (Q)</option></select></label>' +
    '<label class="check"><input type="checkbox" id="saV"' + (seat.veg ? ' checked' : '') + '><span>Vegetação e chão do bioma (grama, flores, árvores longe da construção)</span></label>' +
    '<label>' + (auto ? 'Bioma onde o mundo não diz qual é' : 'Bioma') + '<select id="saB">' + bioOptions(seat.bio) + '</select></label>' +
    (auto ? '<p class="pen">Num mundo do jogo, cada coluna usa o bioma dela.</p>' : '') +
    '<p id="saErr" class="err" hidden></p>' +
    '<div class="row"><button class="btn primary" id="saOk">Assentar</button><button class="btn" id="saNo">Cancelar</button></div>', function () {
    $('saM').oninput = function () { $('saMv').textContent = $('saM').value; };
    $('saNo').onclick = closeDialog;
    $('saOk').onclick = function () {
      var o = { found: $('saF').checked, fblock: $('saFb').value.trim(), terra: $('saT').checked, M: +$('saM').value, path: $('saP').checked, pmix: +$('saPm').value, veg: $('saV').checked, bio: +$('saB').value };
      var fb = blockByText(o.fblock);
      if (o.found && fb < 0) { $('saErr').hidden = false; $('saErr').textContent = 'Bloco da fundação não encontrado: escreva o id (ex.: cobblestone) ou escolha um nome da lista.'; return; }
      if (o.found) o.fblock = BLOCKS[fb].java;
      seat = Object.assign(seat, o, { fblock: o.fblock === P.fj ? '' : o.fblock }); seatSave();
      closeDialog();
      var R = seatRun(o);
      if (R.err) { toast(R.err, 6000); return; }
      var p = [];
      if (o.found) p.push(R.fund.toLocaleString('pt-BR') + ' blocos de fundação');
      if (o.terra) p.push(R.cols.toLocaleString('pt-BR') + ' colunas de terreno acertadas');
      if (o.path) p.push(R.doors ? R.path + ' blocos de caminho' : 'sem porta na base, sem caminho');
      toast('Assentado: ' + p.join(', ') + (o.veg ? bioTerraTxt(R.terra) : '') + '. Ctrl+Z desfaz tudo.', 8000);
    };
  });
}
