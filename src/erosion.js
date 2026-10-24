/* ---------- Pincel de erosão: desgaste do tempo em terrenos e construções ---------- */
/* Cada pincelada (ao clicar e a cada 140 ms com o botão apertado) olha a esfera de raio r em volta do bloco apontado e
   faz, nesta ordem (cada etapa pode ser desligada no aviso):
     1. Desgaste: conta as faces de cada bloco expostas ao ar (ou à água, a plantas, a tochas). Pontas soltas (4 a 6
        faces) e quinas (3) caem com mais chance; quinas, arestas (2) e faces (1) envelhecem pela tabela de desgaste
        (tijolo de pedra → rachado ou com musgo, cobre → oxidado...). O bloco que cai vira entulho e desce.
     2. Desmoronar: um bloco sem nada embaixo e preso por no máximo um vizinho do lado (uma saliência, um pedaço de
        parede solta) cai; quanto mais alto na esfera, maior a chance. Ao cair, vira entulho (tabela de entulho:
        pedra → pedregulho ou cascalho...), desce pela coluna até achar apoio e escorrega para um vizinho mais baixo,
        se houver, formando um monte no pé da construção.
     3. Sulcos: gotas de água partem do alto da esfera, escorrem pelo chão para o lado que desce e caem pelas paredes;
        descendo encostadas numa parede, cavam o bloco dela (um sulco vertical); no chão, de vez em quando, um canal.
        Onde a gota para, deixa parte do que cavou como sedimento (cascalho ou areia).
   A chance de tudo cresce com a intensidade (1 a 5) e cai do meio para a borda da esfera, (1 - t²)². Baús, placas,
   blocos de comando, rocha-mãe e líquidos não são mexidos. Um traço é um passo de desfazer; a malha é refeita aos
   poucos pela fila de pedaços (rebuildDirty), sem travar a tela. */
var ero = { r: 4, s: 2, wear: true, fall: true, groove: true };
try { var ero0 = JSON.parse(localStorage.getItem('bloco-a-bloco-erosao') || 'null'); if (ero0) ero = Object.assign(ero, ero0); } catch (e) {}
var ERO_TABLE_DEF = {
  wear: ['stone_bricks = cracked_stone_bricks, mossy_stone_bricks', 'cracked_stone_bricks = cobblestone, mossy_cobblestone', 'mossy_stone_bricks = mossy_cobblestone',
    'stone_brick_stairs = mossy_stone_brick_stairs', 'stone_brick_slab = mossy_stone_brick_slab', 'stone_brick_wall = mossy_stone_brick_wall',
    'cobblestone = mossy_cobblestone', 'cobblestone_stairs = mossy_cobblestone_stairs', 'cobblestone_slab = mossy_cobblestone_slab', 'cobblestone_wall = mossy_cobblestone_wall',
    'stone = cobblestone, andesite', 'smooth_stone = stone', 'polished_andesite = andesite', 'polished_diorite = diorite', 'polished_granite = granite',
    'deepslate_bricks = cracked_deepslate_bricks', 'deepslate_tiles = cracked_deepslate_tiles', 'polished_blackstone_bricks = cracked_polished_blackstone_bricks', 'nether_bricks = cracked_nether_bricks',
    'cut_sandstone = sandstone', 'smooth_sandstone = sandstone', 'chiseled_sandstone = sandstone', 'cut_red_sandstone = red_sandstone', 'smooth_red_sandstone = red_sandstone',
    'copper_block = exposed_copper', 'exposed_copper = weathered_copper', 'weathered_copper = oxidized_copper', 'cut_copper = exposed_cut_copper', 'exposed_cut_copper = weathered_cut_copper', 'weathered_cut_copper = oxidized_cut_copper',
    'grass_block = coarse_dirt, dirt', 'dirt = coarse_dirt'].join('\n'),
  debris: ['stone_bricks = cobblestone, gravel', 'cracked_stone_bricks = cobblestone, gravel', 'mossy_stone_bricks = mossy_cobblestone, gravel', 'chiseled_stone_bricks = cobblestone, gravel',
    'stone = cobblestone, gravel', 'smooth_stone = cobblestone, gravel', 'cobblestone = cobblestone, gravel', 'mossy_cobblestone = mossy_cobblestone, gravel',
    'andesite = gravel, cobblestone', 'diorite = gravel', 'granite = gravel', 'tuff = gravel', 'polished_andesite = gravel', 'polished_diorite = gravel', 'polished_granite = gravel',
    'deepslate = cobbled_deepslate', 'deepslate_bricks = cobbled_deepslate', 'cracked_deepslate_bricks = cobbled_deepslate', 'deepslate_tiles = cobbled_deepslate', 'cracked_deepslate_tiles = cobbled_deepslate',
    'sandstone = sand', 'cut_sandstone = sand', 'smooth_sandstone = sand', 'chiseled_sandstone = sand', 'red_sandstone = red_sand', 'cut_red_sandstone = red_sand', 'smooth_red_sandstone = red_sand',
    'grass_block = dirt', 'coarse_dirt = dirt', 'podzol = dirt', 'mycelium = dirt', 'bricks = gravel, terracotta', 'netherrack = netherrack', 'end_stone = end_stone'].join('\n')
};
var eroTable = { wear: ERO_TABLE_DEF.wear, debris: ERO_TABLE_DEF.debris };
try { var et0 = JSON.parse(localStorage.getItem('bloco-a-bloco-erosao-tabela') || 'null'); if (et0) eroTable = Object.assign(eroTable, et0); } catch (e) {}
/* Texto da tabela → Map(índice do bloco → [índices dos destinos]); linhas "origem = destino1, destino2"; # comenta */
function eroParse(txt) {
  var m = new Map(), bad = [];
  String(txt || '').split('\n').forEach(function (ln) {
    ln = ln.replace(/#.*/, '').trim(); if (!ln) return;
    var p = ln.split('='); if (p.length !== 2) { bad.push(ln); return; }
    var from = blockByText(p[0]), to = p[1].split(',').map(function (s) { return blockByText(s); });
    if (from < 0 || to.some(function (t) { return t === -1; })) { bad.push(ln); return; }
    m.set(from, to.map(function (t) { return t === -2 ? AIR_BI : t; }));
  });
  return { map: m, bad: bad };
}
var eroMaps = null;
function eroMapsGet() { if (!eroMaps) eroMaps = { wear: eroParse(eroTable.wear).map, debris: eroParse(eroTable.debris).map }; return eroMaps; }
var ERO_FIXED = /^(water|lava|bedrock|barrier|light|structure_void|structure_block|jigsaw|(chain_|repeating_)?command_block|end_portal(_frame)?|nether_portal|end_gateway|spawner|trial_spawner|vault)$|chest|barrel|shulker_box|furnace|smoker|hopper|dispenser|dropper|sign$|lectern|jukebox|brewing_stand|crafter|decorated_pot|chiseled_bookshelf/;
var eroKind = null; // por bloco: 0 = vazio para a erosão (ar, água, plantas, tochas), 1 = sólido que gasta, 2 = sólido intocável
function eroKindOf(bi) {
  if (!eroKind || eroKind.length !== BLOCKS.length) {
    eroKind = new Uint8Array(BLOCKS.length);
    BLOCKS.forEach(function (b, i) {
      if (b.isAir || /^(water|lava)$/.test(b.java)) eroKind[i] = 0;
      else if (b.shape && !b.shape.fc && !/(stairs|slab|wall)$/.test(b.java)) eroKind[i] = 0; // plantas, tochas, botões: deixam o ar passar
      else eroKind[i] = ERO_FIXED.test(b.java) ? 2 : 1;
    });
  }
  return eroKind[bi];
}
function eroAt(x, y, z) { if (!inB(x, y, z) || y > layerMax()) return 0; var v = gget(x, y, z); return v ? eroKindOf(cellBlock(v)) : 0; }
var ERO_N6 = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]], ERO_N4 = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]];
function eroExposed(x, y, z) { var n = 0; for (var k = 0; k < 6; k++) { var d = ERO_N6[k]; if (!eroAt(x + d[0], y + d[1], z + d[2])) n++; } return n; }
function eroFalloff(t) { return t >= 1 ? 0 : (1 - t * t) * (1 - t * t); }
function eroPick(list) { return list[Math.floor(Math.random() * list.length)]; }
/* Troca o bloco mantendo direção e estado quando dá (escada por escada) */
function eroSet(x, y, z, bi) { var v = gget(x, y, z); editSet(x, y, z, bi === AIR_BI ? 0 : convertCell(v, bi)); }
/* Tira o bloco; o que estava preso em cima (planta, tocha) sai junto */
function eroRemove(x, y, z, st) {
  editSet(x, y, z, 0); st.removed++;
  var up = gget(x, y + 1, z); if (up && eroAt(x, y + 1, z) === 0 && !/^(water|lava)$/.test(BLOCKS[cellBlock(up)].java)) editSet(x, y + 1, z, 0);
}
/* Um bloco que cai: vira entulho, desce pela coluna até achar apoio e escorrega para um vizinho mais baixo
   (até 4 vezes): o monte se espalha no pé da construção em vez de virar uma coluna */
function eroDrop(x, y, z, bi, st) {
  var D = eroMapsGet().debris.get(bi), nb = D ? eroPick(D) : bi;
  if (nb === AIR_BI) return;
  var v = convertCell(gget(x, y, z) || mkCell(bi), nb);
  if (!BLOCKS[nb].shape) v = mkCell(nb); // entulho cheio: sem a direção do bloco original
  var cx = x, cy = y, cz = z;
  for (var slide = 0; slide < 5; slide++) {
    var fall = 0; while (cy > 0 && !eroAt(cx, cy - 1, cz) && fall < 96) { cy--; fall++; }
    if (slide === 4) break;
    var opts = ERO_N4.filter(function (d) { return !eroAt(cx + d[0], cy, cz + d[2]) && !eroAt(cx + d[0], cy - 1, cz + d[2]) && cy > 0 && inB(cx + d[0], cy, cz + d[2]); });
    if (!opts.length) break;
    var d = eroPick(opts); cx += d[0]; cz += d[2];
  }
  if (!inB(cx, cy, cz) || eroAt(cx, cy, cz)) return;
  editSet(cx, cy, cz, v); st.debris++;
}
/* ---------- Uma pincelada ---------- */
function eroDab(c) {
  if (!c) return null;
  var r = ero.r, I = ero.s / 5, st = { removed: 0, worn: 0, fallen: 0, debris: 0, grooves: 0 }, M = eroMapsGet();
  var cells = [];
  for (var dy = -r; dy <= r; dy++) for (var dz = -r; dz <= r; dz++) for (var dx = -r; dx <= r; dx++) {
    var d2 = dx * dx + dy * dy + dz * dz; if (d2 > (r + 0.5) * (r + 0.5)) continue;
    var x = c[0] + dx, y = c[1] + dy, z = c[2] + dz; if (eroAt(x, y, z) !== 1) continue;
    cells.push([x, y, z, eroFalloff(Math.sqrt(d2) / (r + 0.5)), dy]);
  }
  // 1. desgaste: as exposições são lidas antes de mudar qualquer coisa (o resultado não depende da ordem da varredura)
  if (ero.wear) {
    var plan = [];
    cells.forEach(function (q) {
      var e = eroExposed(q[0], q[1], q[2]); if (!e) return;
      var w = q[3] * I, pr = e >= 4 ? 0.5 : e === 3 ? 0.22 : e === 2 ? 0.05 : 0, pw = e >= 3 ? 0.55 : e === 2 ? 0.4 : 0.14;
      var rnd = Math.random();
      if (rnd < pr * w) plan.push([q, 'drop']);
      else if (rnd < (pr + pw) * w) plan.push([q, 'wear']);
    });
    plan.forEach(function (p) {
      var q = p[0], v = gget(q[0], q[1], q[2]); if (!v) return;
      var bi = cellBlock(v);
      if (p[1] === 'drop') { eroRemove(q[0], q[1], q[2], st); if (Math.random() < 0.6) eroDrop(q[0], q[1], q[2], bi, st); }
      else { var W = M.wear.get(bi); if (W) { eroSet(q[0], q[1], q[2], eroPick(W)); st.worn++; } }
    });
  }
  // 2. desmoronar: de cima para baixo, saliências sem apoio embaixo e presas por no máximo um vizinho do lado
  if (ero.fall) {
    cells.sort(function (a, b) { return b[1] - a[1]; });
    cells.forEach(function (q) {
      var x = q[0], y = q[1], z = q[2]; if (eroAt(x, y, z) !== 1 || y === 0 || eroAt(x, y - 1, z)) return;
      var side = 0; for (var k = 0; k < 4; k++) { var d = ERO_N4[k]; if (eroAt(x + d[0], y, z + d[2])) side++; }
      if (side > 1 || (side === 1 && eroAt(x, y + 1, z))) return; // preso dos lados ou segurando algo em cima
      var h = (q[4] + r) / (2 * r + 1); // 0 embaixo da esfera, 1 em cima
      if (Math.random() < q[3] * I * (0.35 + 0.65 * h)) { var bi = cellBlock(gget(x, y, z)); eroRemove(x, y, z, st); eroDrop(x, y, z, bi, st); st.fallen++; }
    });
  }
  // 3. sulcos: gotas que escorrem pelo chão e descem pelas paredes, cavando por onde passam
  if (ero.groove) {
    var drops = Math.max(2, Math.round(r * ero.s * 0.8)), carved = 0;
    for (var g = 0; g < drops; g++) {
      var a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * r, px = Math.round(c[0] + Math.cos(a) * rr), pz = Math.round(c[2] + Math.sin(a) * rr), py = c[1] + r;
      if (!inB(px, 0, pz)) continue;
      while (py > c[1] - r && !eroAt(px, py - 1, pz)) py--; // a gota cai até o primeiro sólido
      if (eroAt(px, py, pz) || !eroAt(px, py - 1, pz)) continue;
      var wall = null, load = 0, prev = null, flat = 0, run = false;
      for (var step = 0; step < r * 4 && py > 0; step++) {
        var w = eroFalloff(Math.hypot(px - c[0], py - c[1], pz - c[2]) / (r + 0.5)) * I;
        if (!eroAt(px, py - 1, pz)) { // caindo: encostada numa parede, cava o bloco dela
          if (!wall || eroAt(px + wall[0], py, pz + wall[2]) !== 1) wall = ERO_N4.filter(function (d) { return eroAt(px + d[0], py, pz + d[2]) === 1; })[0] || null;
          // depois que começa a cavar, a água segue o mesmo sulco descendo (uma ranhura, não furos soltos)
          if (wall && Math.random() < (run ? 0.92 : 0.5 * w + 0.1 * I)) { eroRemove(px + wall[0], py, pz + wall[2], st); load++; carved++; run = true; } else run = false;
          py--; continue;
        }
        // no chão: de vez em quando cava um canal, e segue para o lado que desce (ou continua na mesma direção)
        if (eroAt(px, py - 1, pz) === 1 && Math.random() < 0.12 * w) { eroRemove(px, py - 1, pz, st); load++; carved++; py--; continue; }
        var best = null, bs = -1;
        ERO_N4.forEach(function (d) {
          var nx = px + d[0], nz = pz + d[2]; if (!inB(nx, py, nz) || eroAt(nx, py, nz)) return;
          var drop = 0; while (drop < 6 && py - drop - 1 >= 0 && !eroAt(nx, py - drop - 1, nz)) drop++;
          var sc = drop * 2 + (prev && prev[0] === d[0] && prev[2] === d[2] ? 1 : 0) + Math.random() * 0.9;
          if (sc > bs) { bs = sc; best = d; }
        });
        if (!best) break;
        flat = bs < 2 ? flat + 1 : 0; // no plano a gota anda no máximo 2 passos, depois para (poça)
        if (flat > 2) break;
        px += best[0]; pz += best[2]; prev = best; wall = [-best[0], 0, -best[2]];
      }
      // sedimento: parte do que a gota cavou fica onde ela parou
      for (var s2 = 0; s2 < Math.floor(load / 3); s2++) { var sb = BY_JAVA[Math.random() < 0.7 ? 'gravel' : 'sand']; if (sb != null) eroDrop(px, py, pz, sb, st); }
    }
    st.grooves = carved;
  }
  return st;
}

/* ---------- Traço ---------- */
var eroStroke = null, eroTimer = 0;
function eroCenter(t) { return t && (t.hit || (t.place && [t.place[0], t.place[1] - 1, t.place[2]])); }
function eroAdd(a, b) { if (b) for (var k in a) a[k] += b[k]; }
function eroStart(t) {
  var c = eroCenter(t); if (!c) return;
  if (!ero.wear && !ero.fall && !ero.groove) { toast('Ligue pelo menos uma etapa no aviso: Desgaste, Desmoronar ou Sulcos.'); return; }
  eroStroke = { removed: 0, worn: 0, fallen: 0, debris: 0, grooves: 0 };
  stroke = { mode: 'erode', cells: new Set(), on: true }; beginBatch('Erosão'); fluidStop();
  eroAdd(eroStroke, eroDab(c)); requestRender();
  clearInterval(eroTimer);
  eroTimer = setInterval(function () { if (!stroke || stroke.mode !== 'erode') { clearInterval(eroTimer); return; } eroAdd(eroStroke, eroDab(eroCenter(hoverT))); updatePreview(); requestRender(); }, 140);
}
function eroEnd() {
  clearInterval(eroTimer); eroTimer = 0;
  var s = eroStroke; eroStroke = null; if (!s) return;
  var p = [];
  if (s.worn) p.push(s.worn + ' envelhecidos'); if (s.removed) p.push(s.removed + ' tirados'); if (s.fallen) p.push(s.fallen + ' desmoronaram'); if (s.grooves) p.push(s.grooves + ' cavados por sulcos'); if (s.debris) p.push(s.debris + ' de entulho no chão');
  toast(p.length ? 'Erosão: ' + p.join(', ') + '. Ctrl+Z desfaz o traço.' : 'Nada a gastar aqui: aumente a intensidade ou passe sobre quinas e paredes.', 5000);
}

/* ---------- Aviso, prévia e tabela ---------- */
function eroSave() { try { localStorage.setItem('bloco-a-bloco-erosao', JSON.stringify(ero)); } catch (e) {} }
function updateErodeChip() {
  var c = $('erodeChip'), on = tool === 'erode'; c.hidden = !on; if (!on) return;
  $('eroR').textContent = ero.r; $('eroS').textContent = ero.s;
  c.querySelectorAll('[data-ek]').forEach(function (b) { b.setAttribute('aria-pressed', !!ero[b.getAttribute('data-ek')]); });
}
function setEroR(r) { ero.r = Math.max(1, Math.min(16, r)); eroSave(); updateErodeChip(); updatePreview(); }
$('erodeChip').addEventListener('click', function (e) {
  var b = e.target.closest('button'); if (!b) return;
  if (b.hasAttribute('data-ek')) { var k = b.getAttribute('data-ek'); ero[k] = !ero[k]; }
  else if (b.id === 'eroRm') ero.r = Math.max(1, ero.r - 1);
  else if (b.id === 'eroRp') ero.r = Math.min(16, ero.r + 1);
  else if (b.id === 'eroSm') ero.s = Math.max(1, ero.s - 1);
  else if (b.id === 'eroSp') ero.s = Math.min(5, ero.s + 1);
  else if (b.id === 'eroTab') { openEroTable(); return; }
  eroSave(); updateErodeChip(); updatePreview();
});
/* Prévia: os blocos expostos dentro da esfera (os que o pincel pode gastar), mais fortes perto do meio */
function erodePreview(t, accent) {
  var c = eroCenter(t); if (!c) return;
  var r = ero.r, m = new THREE.Matrix4(), k = 0, cap = Math.min(previewInst.instanceMatrix.count, 40000);
  for (var dy = -r; dy <= r && k < cap; dy++) for (var dz = -r; dz <= r && k < cap; dz++) for (var dx = -r; dx <= r && k < cap; dx++) {
    var d2 = dx * dx + dy * dy + dz * dz; if (d2 > (r + 0.5) * (r + 0.5)) continue;
    var x = c[0] + dx, y = c[1] + dy, z = c[2] + dz; if (eroAt(x, y, z) !== 1 || !eroExposed(x, y, z)) continue;
    m.setPosition(x + 0.5, y + 0.5, z + 0.5); previewInst.setMatrixAt(k++, m);
  }
  previewInst.count = k; previewInst.instanceMatrix.needsUpdate = true; previewInst.material.color.copy(accent);
}
function openEroTable() {
  var ta = function (id, v) { return '<textarea id="' + id + '" rows="9" spellcheck="false" style="width:100%;font-family:var(--font-mono,monospace);font-size:12px">' + esc(v) + '</textarea>'; };
  openDialog('<h3>Tabela da erosão</h3><p>Uma regra por linha: <code>origem = destino1, destino2</code> (nomes do Java, como na barra de status; quando há mais de um destino, cada bloco sorteia um; <code>ar</code> apaga). Escadas, lajes e muros mantêm a direção.</p>' +
    '<label>Desgaste: o bloco exposto envelhece ou racha</label>' + ta('eroW', eroTable.wear) +
    '<label>Entulho: o bloco que cai vira (sem regra, cai como ele mesmo)</label>' + ta('eroD', eroTable.debris) +
    '<p id="eroBad" class="err"></p><div class="row"><button class="btn primary" id="eroOk">Usar</button><button class="btn" id="eroDef">Voltar ao padrão</button><button class="btn" id="eroNo">Cancelar</button></div>', function () {
    var check = function () { var a = eroParse($('eroW').value).bad.concat(eroParse($('eroD').value).bad); $('eroBad').textContent = a.length ? 'Linhas com bloco desconhecido (ficam de fora): ' + a.join(' · ') : ''; };
    $('eroW').oninput = $('eroD').oninput = check; check();
    $('eroOk').onclick = function () { eroTable = { wear: $('eroW').value, debris: $('eroD').value }; eroMaps = null; try { localStorage.setItem('bloco-a-bloco-erosao-tabela', JSON.stringify(eroTable)); } catch (e) {} closeDialog(); var m = eroMapsGet(); toast('Tabela da erosão: ' + m.wear.size + ' regras de desgaste e ' + m.debris.size + ' de entulho.'); };
    $('eroDef').onclick = function () { $('eroW').value = ERO_TABLE_DEF.wear; $('eroD').value = ERO_TABLE_DEF.debris; check(); };
    $('eroNo').onclick = closeDialog;
  });
}
