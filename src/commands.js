/* ---------- Comandos: uma caixa de texto discreta (/ duas vezes) ---------- */
/* Apertar / duas vezes seguidas (em até meio segundo) abre a caixa embaixo da tela, acima da hotbar. Enter executa,
   Esc fecha, ↑ e ↓ andam pelos comandos já usados (guardados no navegador), Tab completa o nome do comando ou do
   bloco. Os comandos ficam em CMDS: cada um tem a ajuda (uso e descrição) e a função que recebe as palavras depois
   do nome. A barra no começo é opcional ("/delblock stone" e "delblock stone" valem igual). Também abre pelo menu
   Projeto → Comandos… (no celular, sem teclado). */
var CMD_KEY = 'bloco-a-bloco-comandos', cmdHist = [], cmdPos = -1, cmdSlashAt = 0;
try { cmdHist = JSON.parse(localStorage.getItem(CMD_KEY) || '[]') || []; } catch (e) {}
/* A área de trabalho dos comandos: a seleção, se houver; senão o espaço inteiro (a construção ou a área do mundo) */
function cmdScope() {
  if (sel) return { a: sel.a, b: sel.b, txt: 'na seleção' };
  return { a: [0, 0, 0], b: [SX - 1, SY - 1, SZ - 1], txt: wio && wio.area ? 'na área do mundo carregada' : 'na construção inteira' };
}
/* Blocos de uma lista de palavras (nome do Java, com ou sem "minecraft:"; espaço ou vírgula separam) */
function cmdBlocks(args) {
  var ok = [], bad = [];
  args.join(' ').split(/[,\s]+/).filter(Boolean).forEach(function (w) {
    var bi = blockByText(w);
    if (bi === -1) bi = blockByText(w.replace(/-/g, '_'));
    if (bi < 0) bad.push(w); else if (ok.indexOf(bi) < 0) ok.push(bi);
  });
  return { ok: ok, bad: bad };
}
var CMDS = {
  delblock: {
    use: 'delblock <bloco> [outro bloco...]',
    help: 'Apaga todos os blocos desse tipo (em qualquer direção ou estado) na seleção; sem seleção, na construção inteira ou na área do mundo carregada. Vários blocos: separe com espaço.',
    run: function (args) {
      if (!args.length) return { err: 'Falta o bloco. Ex.: delblock stone (ou delblock oak_leaves birch_leaves).' };
      var B = cmdBlocks(args);
      if (B.bad.length) return { err: 'Bloco desconhecido: ' + B.bad.join(', ') + '. Use o nome do Java (o da barra de status), como stone_bricks.' };
      var want = new Set(B.ok), sc = cmdScope(), list = [];
      blocksInBox(sc.a[0], sc.a[1], sc.a[2], sc.b[0], sc.b[1], sc.b[2], function (x, y, z, v) { if (want.has(cellBlock(v))) list.push(x, y, z); });
      var names = B.ok.map(function (bi) { return BLOCKS[bi].name; }).join(', ');
      if (!list.length) return { msg: 'Nenhum bloco de ' + names + ' ' + sc.txt + '.' };
      if (list.length / 3 > 16e6) return { err: 'Blocos demais para apagar de uma vez (' + (list.length / 3).toLocaleString('pt-BR') + '; o máximo é 16 milhões). Selecione uma área menor.' };
      var saved = symBusy; symBusy = true; // a simetria não repete: o comando já pega tudo o que existe
      fluidStop(); beginBatch('delblock ' + args.join(' '));
      try { for (var k = 0; k < list.length; k += 3) editSet(list[k], list[k + 1], list[k + 2], 0); endBatch(); } finally { symBusy = saved; }
      return { msg: 'Apagados ' + (list.length / 3).toLocaleString('pt-BR') + ' blocos de ' + names + ' ' + sc.txt + '. Ctrl+Z desfaz.' };
    }
  },
  ajuda: {
    use: 'ajuda',
    help: 'Lista os comandos.',
    run: function () { var seen = new Set(); return { msg: Object.keys(CMDS).filter(function (k) { if (seen.has(CMDS[k])) return false; seen.add(CMDS[k]); return true; }).map(function (k) { return '/' + CMDS[k].use; }).join(' · ') + ' (Esc fecha, ↑ ↓ histórico, Tab completa)', long: true }; }
  }
};
CMDS.help = CMDS.ajuda;
function cmdRun(txt) {
  txt = String(txt || '').trim().replace(/^\/+/, ''); if (!txt) return;
  if (cmdHist[cmdHist.length - 1] !== txt) { cmdHist.push(txt); if (cmdHist.length > 50) cmdHist.shift(); try { localStorage.setItem(CMD_KEY, JSON.stringify(cmdHist)); } catch (e) {} }
  var w = txt.split(/\s+/), name = w[0].toLowerCase(), C = CMDS[name], r;
  if (!C) r = { err: 'Comando desconhecido: ' + name + '. Digite ajuda para ver a lista.' };
  else { try { r = C.run(w.slice(1)) || {}; } catch (e) { r = { err: e.message || String(e) }; } }
  cmdShow(r);
  if (!r.err) { updateStatus(); requestRender(); }
  return r;
}
function cmdShow(r) {
  var o = $('cmdOut'); if (!o) return;
  o.textContent = r.err || r.msg || ''; o.className = r.err ? 'err' : '';
  if (!r.err && r.msg && !r.long) toast(r.msg, 6000);
}
function cmdOpen() {
  var b = $('cmdBox'); if (!b) return;
  b.hidden = false; cmdPos = cmdHist.length;
  var i = $('cmdIn'); i.value = ''; $('cmdOut').textContent = 'Digite um comando (ajuda lista todos). ' + (sel ? 'Vale para a seleção.' : 'Sem seleção: vale para ' + (wio && wio.area ? 'a área do mundo inteira.' : 'a construção inteira.')); $('cmdOut').className = '';
  setTimeout(function () { i.focus(); }, 0);
}
function cmdClose() { var b = $('cmdBox'); if (b && !b.hidden) { b.hidden = true; $('cmdIn').blur(); } }
/* Tab: completa o comando (primeira palavra) ou o bloco (as outras) */
function cmdComplete(i) {
  var v = i.value, m = /(\S*)$/.exec(v), w = m[1], first = !/\s/.test(v.replace(/^\/+/, '').trim()) && !/\s$/.test(v);
  var pool = first ? Object.keys(CMDS) : BLOCKS.filter(function (b) { return !b.hide && !b.isAir; }).map(function (b) { return b.java; });
  var lw = w.replace(/^\/+/, '').toLowerCase(), hits = pool.filter(function (n) { return n.indexOf(lw) === 0; });
  if (!hits.length) hits = pool.filter(function (n) { return n.indexOf(lw) >= 0; });
  if (!hits.length) { $('cmdOut').textContent = 'Nada começa com “' + lw + '”.'; return; }
  var pre = hits.reduce(function (a, b) { var k = 0; while (k < a.length && a[k] === b[k]) k++; return a.slice(0, k); });
  var rep = hits.length === 1 ? hits[0] + ' ' : pre.length > lw.length ? pre : w.replace(/^\/+/, '');
  i.value = v.slice(0, v.length - w.length) + (first && /^\//.test(w) ? '/' : '') + rep;
  if (hits.length > 1) $('cmdOut').textContent = hits.slice(0, 12).join('  ') + (hits.length > 12 ? '  … (+' + (hits.length - 12) + ')' : '');
}
function cmdBind() {
  var i = $('cmdIn'); if (!i) return;
  i.addEventListener('keydown', function (e) {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); var r = cmdRun(i.value); if (r && !r.err && !r.keep) { i.value = ''; cmdPos = cmdHist.length; } } // find fica na caixa: Enter de novo vai ao próximo
    else if (e.key === 'Escape') { e.preventDefault(); cmdClose(); }
    else if (e.key === 'Tab') { e.preventDefault(); cmdComplete(i); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (cmdPos > 0) { cmdPos--; i.value = cmdHist[cmdPos] || ''; } }
    else if (e.key === 'ArrowDown') { e.preventDefault(); if (cmdPos < cmdHist.length) { cmdPos++; i.value = cmdHist[cmdPos] || ''; } }
  });
  $('cmdX').addEventListener('click', cmdClose);
  $('cmdGo').addEventListener('click', function () { var r = cmdRun($('cmdIn').value); if (r && !r.err && !r.keep) $('cmdIn').value = ''; $('cmdIn').focus(); });
}
/* No teclado geral: / duas vezes abre a caixa (devolve true quando tratou a tecla) */
function cmdKey(e) {
  if (e.key !== '/' || ((e.ctrlKey || e.metaKey || e.altKey) && !(e.getModifierState && e.getModifierState('AltGraph')))) return false; // AltGr + Q também dá /
  var now = Date.now();
  e.preventDefault();
  if (now - cmdSlashAt < 500) { cmdSlashAt = 0; cmdOpen(); } else cmdSlashAt = now;
  return true;
}

/* ---------- hide / unhide: esconder tipos de bloco só na tela ---------- */
/* hide guarda regras { bi, a, b } (a caixa: a seleção, ou null = o espaço inteiro). Um bloco escondido continua na
   construção (exportar, copiar, redstone e as ferramentas o enxergam); só não é desenhado, não esconde as faces dos
   vizinhos (o que estava atrás aparece) e não é acertado pelo clique. hideOn[bi] diz rápido se um tipo tem regra
   (vis() é chamada muitas vezes por bloco ao montar a malha). Vale até unhide, Novo ou abrir outro projeto. */
var hideRules = [], hideOn = new Uint8Array(0);
function hideIndex() { hideOn = new Uint8Array(BLOCKS.length); hideRules.forEach(function (r) { hideOn[r.bi] = 1; }); }
function hidden(x, y, z, bi) {
  if (!hideOn[bi]) return false;
  for (var k = 0; k < hideRules.length; k++) { var r = hideRules[k]; if (r.bi === bi && (!r.a || (x >= r.a[0] && x <= r.b[0] && y >= r.a[1] && y <= r.b[1] && z >= r.a[2] && z <= r.b[2]))) return true; }
  return false;
}
function hideChanged() { hideIndex(); hideUI(); dirtyAll(); hoverT = null; updatePreview(); requestRender(); }
function hideReset() { if (!hideRules.length) return; hideRules = []; hideIndex(); hideUI(); }
function hideUI() {
  var c = $('hideChip'); if (!c) return;
  c.hidden = !hideRules.length; if (!hideRules.length) return;
  var names = []; hideRules.forEach(function (r) { var n = BLOCKS[r.bi].name + (r.a ? ' (numa área)' : ''); if (names.indexOf(n) < 0) names.push(n); });
  $('hideTxt').innerHTML = '<b>Escondidos</b> ' + esc(names.slice(0, 4).join(', ') + (names.length > 4 ? ' e mais ' + (names.length - 4) : ''));
}
CMDS.hide = {
  use: 'hide <bloco> [outro bloco...]',
  help: 'Esconde esses blocos na tela (eles continuam na construção) na seleção; sem seleção, na construção inteira ou na área do mundo carregada.',
  run: function (args) {
    if (!args.length) return { err: 'Falta o bloco. Ex.: hide oak_leaves (ou hide oak_leaves glass).' };
    var B = cmdBlocks(args); if (B.bad.length) return { err: 'Bloco desconhecido: ' + B.bad.join(', ') + '. Use o nome do Java (o da barra de status), como stone_bricks.' };
    var sc = cmdScope(), box = sel ? { a: sel.a.slice(), b: sel.b.slice() } : null, n = 0;
    B.ok.forEach(function (bi) {
      if (!box) hideRules = hideRules.filter(function (r) { return r.bi !== bi; }); // o espaço inteiro engole as áreas
      else if (hideRules.some(function (r) { return r.bi === bi && !r.a; })) return; // já escondido em tudo
      hideRules.push({ bi: bi, a: box && box.a, b: box && box.b });
      blocksInBox(sc.a[0], sc.a[1], sc.a[2], sc.b[0], sc.b[1], sc.b[2], function (x, y, z, v) { if (cellBlock(v) === bi) n++; });
    });
    hideChanged();
    return { msg: 'Escondidos ' + n.toLocaleString('pt-BR') + ' blocos de ' + B.ok.map(function (bi) { return BLOCKS[bi].name; }).join(', ') + ' ' + sc.txt + ' (só na tela: continuam na construção). unhide all mostra tudo.' };
  }
};
CMDS.unhide = {
  use: 'unhide <bloco> [outro bloco...] | unhide all',
  help: 'Mostra de novo esses blocos (em todo lugar onde estavam escondidos); unhide all mostra todos.',
  run: function (args) {
    if (!args.length) return { err: 'Falta o bloco (ou all). Ex.: unhide oak_leaves, unhide all.' };
    if (!hideRules.length) return { msg: 'Nenhum bloco está escondido.' };
    if (args.length === 1 && args[0].toLowerCase() === 'all') { hideRules = []; hideChanged(); return { msg: 'Todos os blocos estão visíveis de novo.' }; }
    var B = cmdBlocks(args); if (B.bad.length) return { err: 'Bloco desconhecido: ' + B.bad.join(', ') + '.' };
    var before = hideRules.length; hideRules = hideRules.filter(function (r) { return B.ok.indexOf(r.bi) < 0; });
    if (hideRules.length === before) return { msg: 'Esses blocos não estavam escondidos.' };
    hideChanged();
    return { msg: B.ok.map(function (bi) { return BLOCKS[bi].name; }).join(', ') + ' visível de novo.' };
  }
};

/* ---------- Ajudas dos comandos de terreno ---------- */
/* Lista de destinos com porcentagem: "stone_bricks" ou "70%stone_bricks,30%cracked_stone_bricks" (vírgula ou espaço);
   sem porcentagem, partes iguais. Devolve { pick(), names } ou { err } */
function cmdMix(words) {
  var items = [], bad = [];
  words.join(' ').split(/[,\s]+/).filter(Boolean).forEach(function (w) {
    var m = /^(\d+(?:[.,]\d+)?)%(.+)$/.exec(w), pct = m ? +m[1].replace(',', '.') : null, nm = m ? m[2] : w;
    var bi = blockByText(nm); if (bi === -1) bi = blockByText(nm.replace(/-/g, '_'));
    if (bi === -1) bad.push(nm); else items.push([bi === -2 ? AIR_BI : bi, pct]);
  });
  if (bad.length) return { err: 'Bloco desconhecido: ' + bad.join(', ') + '. Use o nome do Java (o da barra de status), como stone_bricks.' };
  if (!items.length) return { err: 'Falta o bloco novo.' };
  var free = items.filter(function (it) { return it[1] == null; }).length, given = items.reduce(function (a, it) { return a + (it[1] || 0); }, 0);
  if (given > 100.001) return { err: 'As porcentagens somam ' + given + '%: o máximo é 100%.' };
  items.forEach(function (it) { if (it[1] == null) it[1] = free ? (100 - given) / free : 0; });
  var tot = items.reduce(function (a, it) { return a + it[1]; }, 0); if (tot <= 0) return { err: 'As porcentagens somam 0%.' };
  return {
    pick: function () { var r = Math.random() * tot; for (var k = 0; k < items.length; k++) { r -= items[k][1]; if (r < 0) return items[k][0]; } return items[items.length - 1][0]; },
    names: items.map(function (it) { return (items.length > 1 ? Math.round(it[1] * 10) / 10 + '% ' : '') + (it[0] === AIR_BI ? 'ar' : BLOCKS[it[0]].name); }).join(', ')
  };
}
/* Edita sem a simetria repetir (os comandos já pegam tudo o que existe) e com a água parada; um passo de desfazer */
function cmdEdit(label, fn) {
  var saved = symBusy; symBusy = true; fluidStop(); beginBatch(label);
  try { fn(); } finally { endBatch(); symBusy = saved; }
}
function cmdCols(sc, fn) { for (var z = sc.a[2]; z <= sc.b[2]; z++) for (var x = sc.a[0]; x <= sc.b[0]; x++) fn(x, z); }
var cmdNatOf = null;
/* Terreno natural: pedra, terra, grama, areia, cascalho, minérios... (o de "só a superfície" e o do pincel de bioma) */
function cmdNat(bi) {
  if (!cmdNatOf || cmdNatOf.length !== BLOCKS.length) { cmdNatOf = new Uint8Array(BLOCKS.length); BLOCKS.forEach(function (b, i) { if (!b.shape && b.java && (SURF_RE.test(b.java) || BIO_GROUND.test(b.java)) && !/glazed/.test(b.java)) cmdNatOf[i] = 1; }); }
  return cmdNatOf[bi] === 1;
}
var CMD_SOIL = /^(grass_block|dirt|coarse_dirt|podzol|mycelium|rooted_dirt|mud|sand|red_sand|snow_block|moss_block|stone)$/; // o que o naturalize troca (o resto do terreno, como minério e andesito, fica)
var CMD_SOFT = /^(water|lava)$/;
function cmdJ(v) { return v ? BLOCKS[cellBlock(v)].java : ''; }
function cmdAirish(v) { if (!v) return true; var j = cmdJ(v); return BIO_PLANT.test(j) || j === 'snow' || j === 'short_grass' || j === 'tall_grass'; }

/* ---------- replace ---------- */
CMDS.replace = {
  use: 'replace <bloco> <novo> (ex.: replace stone 70%stone_bricks,30%cracked_stone_bricks)',
  help: 'Troca um bloco (ou vários, separados por vírgula) por outro, ou por uma mistura com porcentagens, mantendo a direção. Na seleção; sem seleção, no espaço inteiro.',
  run: function (args) {
    if (args.length < 2) return { err: 'Use: replace <bloco> <novo>. Ex.: replace oak_planks,birch_planks spruce_planks, ou replace stone 70%stone_bricks,30%cracked_stone_bricks.' };
    var F = cmdBlocks([args[0]]); if (F.bad.length) return { err: 'Bloco desconhecido: ' + F.bad.join(', ') + '.' };
    var T = cmdMix(args.slice(1)); if (T.err) return T;
    var want = new Set(F.ok), sc = cmdScope(), list = [];
    blocksInBox(sc.a[0], sc.a[1], sc.a[2], sc.b[0], sc.b[1], sc.b[2], function (x, y, z, v) { if (want.has(cellBlock(v))) list.push(x, y, z, v); });
    var from = F.ok.map(function (bi) { return BLOCKS[bi].name; }).join(', ');
    if (!list.length) return { msg: 'Nenhum bloco de ' + from + ' ' + sc.txt + '.' };
    cmdEdit('replace ' + args.join(' '), function () { for (var k = 0; k < list.length; k += 4) { var nb = T.pick(); editSet(list[k], list[k + 1], list[k + 2], nb === AIR_BI ? 0 : convertCell(list[k + 3], nb)); } });
    return { msg: 'Trocados ' + (list.length / 4).toLocaleString('pt-BR') + ' blocos de ' + from + ' por ' + T.names + ' ' + sc.txt + '. Ctrl+Z desfaz.' };
  }
};

/* ---------- drain ---------- */
var CMD_WET = /^(kelp|kelp_plant|seagrass|tall_seagrass|bubble_column)$/;
CMDS.drain = {
  use: 'drain [agua|lava]',
  help: 'Tira toda a água e a lava (com algas, plantas marinhas e colunas de bolhas); drain agua ou drain lava tira só uma delas. Na seleção; sem seleção, no espaço inteiro.',
  run: function (args) {
    var a = (args[0] || '').toLowerCase().replace('á', 'a'), w = !a || /^(agua|water)$/.test(a), l = !a || a === 'lava';
    if (a && !w && !l) return { err: 'Use drain, drain agua ou drain lava.' };
    var sc = cmdScope(), list = [], nw = 0, nl = 0;
    blocksInBox(sc.a[0], sc.a[1], sc.a[2], sc.b[0], sc.b[1], sc.b[2], function (x, y, z, v) { var j = cmdJ(v); if ((w && (j === 'water' || CMD_WET.test(j))) || (l && j === 'lava')) { list.push(x, y, z); if (j === 'lava') nl++; else nw++; } });
    if (!list.length) return { msg: 'Nada para secar ' + sc.txt + '.' };
    cmdEdit('drain ' + args.join(' '), function () { for (var k = 0; k < list.length; k += 3) editSet(list[k], list[k + 1], list[k + 2], 0); });
    return { msg: 'Secado ' + sc.txt + ': ' + [nw ? nw.toLocaleString('pt-BR') + ' de água (com plantas aquáticas)' : '', nl ? nl.toLocaleString('pt-BR') + ' de lava' : ''].filter(Boolean).join(' e ') + '. Ctrl+Z desfaz.' };
  }
};

/* ---------- find ---------- */
var cmdFindState = null; // { key, seen: Set } para o próximo find ir ao próximo bloco
CMDS.find = {
  use: 'find <bloco> [outro...]',
  help: 'Leva a câmera ao bloco desse tipo mais perto do centro da tela; repetir o mesmo find vai ao próximo. Na seleção; sem seleção, no espaço inteiro.',
  run: function (args) {
    if (!args.length) { if (!cmdFindState) return { err: 'Falta o bloco. Ex.: find chest.' }; args = cmdFindState.args; }
    var B = cmdBlocks(args); if (B.bad.length) return { err: 'Bloco desconhecido: ' + B.bad.join(', ') + '.' };
    var want = new Set(B.ok), sc = cmdScope(), key = B.ok.join() + '|' + sc.a + sc.b;
    if (!cmdFindState || cmdFindState.key !== key) cmdFindState = { key: key, args: args, seen: new Set() };
    var S = cmdFindState, best = null, bd = Infinity, n = 0, c = [cam.tx, cam.ty, cam.tz];
    blocksInBox(sc.a[0], sc.a[1], sc.a[2], sc.b[0], sc.b[1], sc.b[2], function (x, y, z, v) {
      if (!want.has(cellBlock(v))) return; n++;
      var i = idx(x, y, z); if (S.seen.has(i)) return;
      var d = (x + 0.5 - c[0]) * (x + 0.5 - c[0]) + (y + 0.5 - c[1]) * (y + 0.5 - c[1]) + (z + 0.5 - c[2]) * (z + 0.5 - c[2]);
      if (d < bd) { bd = d; best = [x, y, z]; }
    });
    var names = B.ok.map(function (bi) { return BLOCKS[bi].name; }).join(', ');
    if (!n) { cmdFindState = null; return { msg: 'Nenhum bloco de ' + names + ' ' + sc.txt + '.' }; }
    if (!best) { S.seen.clear(); return CMDS.find.run(args); } // já passou por todos: recomeça
    S.seen.add(idx(best[0], best[1], best[2]));
    teleportTo({ hit: best }); findMark(best);
    var w = wio && wio.area ? wioWorldPos(best) : best;
    return { msg: names + ' ' + S.seen.size + ' de ' + n + ' em ' + w.join(', ') + (n > 1 ? '. Enter de novo vai ao próximo.' : '.'), long: true, keep: true };
  }
};
/* Uma caixa piscando em volta do bloco achado, por 2,5 s */
var findBox = null, findTimer = 0;
function findMark(c) {
  if (!findBox) { findBox = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.12, 1.12, 1.12)), new THREE.LineBasicMaterial({ color: new THREE.Color(cssColor('--accent')), depthTest: false, transparent: true })); findBox.renderOrder = 9; scene.add(findBox); }
  findBox.position.set(c[0] + 0.5, c[1] + 0.5, c[2] + 0.5); findBox.visible = true;
  clearInterval(findTimer); var k = 0;
  findTimer = setInterval(function () { k++; findBox.visible = k < 10 ? k % 2 === 0 : false; requestRender(); if (k >= 10) clearInterval(findTimer); }, 250);
  requestRender();
}

/* ---------- overlay ---------- */
CMDS.overlay = {
  use: 'overlay <bloco> [espessura] (ex.: overlay snow, overlay 60%moss_carpet,40%air)',
  help: 'Põe uma camada do bloco (ou de uma mistura) em cima de tudo o que dá para o céu: no topo de cada coluna, sobre o terreno, telhados e copas. Plantas pequenas no caminho saem. Na seleção; sem seleção, no espaço inteiro.',
  run: function (args) {
    if (!args.length) return { err: 'Falta o bloco. Ex.: overlay snow, overlay moss_carpet, overlay 70%grass_block,30%coarse_dirt 1.' };
    var th = 1; if (args.length > 1 && /^\d+$/.test(args[args.length - 1])) th = Math.max(1, Math.min(16, +args.pop()));
    var T = cmdMix(args); if (T.err) return T;
    var sc = cmdScope(), put = [], cols = 0, top = Math.min(SY - 1, sel ? sel.b[1] + th : SY - 1);
    cmdCols(sc, function (x, z) {
      var y = sc.b[1];
      while (y >= sc.a[1]) { var v = gget(x, y, z); if (v && !cmdAirish(v)) break; y--; }
      if (y < sc.a[1]) return;
      var j = cmdJ(gget(x, y, z)); if (CMD_SOFT.test(j)) return; // água e lava: não cobre
      // a coluna tem de dar para o céu (nada sólido acima do espaço da seleção)
      for (var yy = sc.b[1] + 1; yy < SY; yy++) { var w = gget(x, yy, z); if (w && !cmdAirish(w)) return; }
      cols++;
      for (var k = 1; k <= th && y + k <= top; k++) put.push(x, y + k, z, T.pick());
    });
    if (!put.length) return { msg: 'Nenhum topo descoberto ' + sc.txt + '.' };
    var n = 0;
    cmdEdit('overlay ' + args.join(' '), function () { for (var k = 0; k < put.length; k += 4) { if (put[k + 3] === AIR_BI) continue; var v = gget(put[k], put[k + 1], put[k + 2]); if (v && !cmdAirish(v)) continue; editSet(put[k], put[k + 1], put[k + 2], mkCell(put[k + 3])); n++; } });
    return { msg: 'Camada de ' + T.names + (th > 1 ? ' (' + th + ' de espessura)' : '') + ' em ' + cols.toLocaleString('pt-BR') + ' colunas ' + sc.txt + ': ' + n.toLocaleString('pt-BR') + ' blocos. Ctrl+Z desfaz.' };
  }
};

/* ---------- smooth ---------- */
/* O terreno como mapa de alturas (o bloco natural mais alto de cada coluna, com só ar, plantas, folhas ou troncos em
   cima); n passadas de média ponderada 5 × 5; cada coluna sobe com o bloco do topo dela (a grama coberta vira terra) ou
   desce tirando terreno (o bloco do topo desce junto). Colunas com construção em cima ficam como estão, mas entram na
   média, então o terreno em volta acompanha. */
CMDS.smooth = {
  use: 'smooth [passadas 1 a 10]',
  help: 'Suaviza o terreno: arredonda degraus, picos e buracos. Mais passadas, mais liso. Mexe só no terreno natural; construções ficam. Na seleção; sem seleção, no espaço inteiro.',
  run: function (args) {
    var it = args.length ? +args[0] : 2; if (!(it >= 1 && it <= 10)) return { err: 'Use smooth ou smooth <1 a 10> (passadas).' };
    var sc = cmdScope(), w = sc.b[0] - sc.a[0] + 1, l = sc.b[2] - sc.a[2] + 1, H = new Float32Array(w * l), fixed = new Uint8Array(w * l), has = new Uint8Array(w * l), surf = new Uint32Array(w * l);
    cmdCols(sc, function (x, z) {
      var i = (z - sc.a[2]) * w + (x - sc.a[0]), y, v, j, blocked = false;
      for (y = sc.b[1]; y >= sc.a[1]; y--) {
        v = gget(x, y, z); if (!v) continue; j = cmdJ(v);
        if (cmdAirish(v) || /leaves$|_log$|_stem$/.test(j)) { if (/_log$|_stem$/.test(j)) blocked = true; continue; }
        if (cmdNat(cellBlock(v))) break;
        blocked = true; // construção em cima
      }
      if (y < sc.a[1]) return;
      has[i] = 1; H[i] = y; fixed[i] = blocked ? 1 : 0; surf[i] = gget(x, y, z);
    });
    var K = [1, 4, 6, 4, 1];
    for (var p = 0; p < it; p++) {
      var N = new Float32Array(H);
      for (var z = 0; z < l; z++) for (var x = 0; x < w; x++) {
        var i = z * w + x; if (!has[i] || fixed[i]) continue;
        var s = 0, ws = 0;
        for (var dz = -2; dz <= 2; dz++) for (var dx = -2; dx <= 2; dx++) { var X = x + dx, Z = z + dz; if (X < 0 || Z < 0 || X >= w || Z >= l) continue; var q = Z * w + X; if (!has[q]) continue; var k = K[dx + 2] * K[dz + 2]; s += H[q] * k; ws += k; }
        N[i] = s / ws;
      }
      H = N;
    }
    var up = 0, down = 0, cols = 0, dirt = BY_JAVA.dirt;
    cmdEdit('smooth ' + it, function () {
      cmdCols(sc, function (x, z) {
        var i = (z - sc.a[2]) * w + (x - sc.a[0]); if (!has[i] || fixed[i]) return;
        var old = -1; for (var y = sc.b[1]; y >= sc.a[1]; y--) { var v = gget(x, y, z); if (v && cmdNat(cellBlock(v))) { old = y; break; } }
        if (old < 0) return;
        var want = Math.max(sc.a[1], Math.min(sc.b[1], Math.round(H[i]))), top = surf[i], tj = cmdJ(top);
        if (want === old) return; cols++;
        if (want > old) {
          if (SURFACE.test(tj) && dirt != null) editSet(x, old, z, mkCell(dirt)); // a grama coberta vira terra
          for (var y2 = old + 1; y2 <= want; y2++) { var c = gget(x, y2, z); if (c && !cmdAirish(c)) { want = y2 - 1; break; } editSet(x, y2, z, y2 === want ? top : (SURFACE.test(tj) && dirt != null ? mkCell(dirt) : top)); up++; }
        } else {
          var plant = gget(x, old + 1, z), pv = plant && cmdAirish(plant) ? plant : 0; if (pv) editSet(x, old + 1, z, 0);
          for (var y3 = old; y3 > want; y3--) { var c2 = gget(x, y3, z); if (c2 && cmdNat(cellBlock(c2))) { editSet(x, y3, z, 0); down++; } }
          if (SURFACE.test(tj)) editSet(x, want, z, top); // a grama desce junto
          if (pv && !gget(x, want + 1, z)) editSet(x, want + 1, z, pv);
        }
      });
    });
    if (!cols) return { msg: 'O terreno ' + sc.txt.replace(/^na |^no /, 'da ') + ' já está liso (ou não há terreno natural).' };
    return { msg: 'Terreno suavizado ' + sc.txt + ' (' + it + ' passada' + (it > 1 ? 's' : '') + '): ' + cols.toLocaleString('pt-BR') + ' colunas mudaram, ' + up.toLocaleString('pt-BR') + ' blocos postos e ' + down.toLocaleString('pt-BR') + ' tirados. Ctrl+Z desfaz.' };
  }
};

/* ---------- naturalize ---------- */
/* Em cada coluna, desce contando a profundidade dentro de cada trecho de terreno (a partir do ar, da água ou de uma
   planta em cima). Com céu em cima: as camadas do bioma da coluna (bioRecipe, src/biome.js; sem bioma, grama e 3 de
   terra), e pedra abaixo delas. Embaixo d'água: areia (até 3 de água) ou cascalho. Sob uma saliência rasa (até 4 blocos
   de terreno em cima): terra. Fundo de caverna e o resto: pedra. Só troca o "solo" (grama, terra, areia, pedra, neve e
   os blocos dados no comando); minérios, andesito, construções e o que não é terreno ficam. */
var CMD_PLAIN = null;
function cmdRecipe(x, z) {
  var id = bioAt(x, z), b = id >= 0 ? BIO_BY_ID[id] : null;
  if (!b) { if (CMD_PLAIN === null) CMD_PLAIN = { layers: ['grass_block', 'dirt', 'dirt', 'dirt'] }; return { R: CMD_PLAIN, id: -1 }; }
  var R = bioRecipeCache[id] || (bioRecipeCache[id] = bioRecipe(b) || 0);
  return { R: R || CMD_PLAIN || (CMD_PLAIN = { layers: ['grass_block', 'dirt', 'dirt', 'dirt'] }), id: id };
}
CMDS.naturalize = {
  use: 'naturalize [bloco...] [plantas]',
  help: 'Refaz as camadas do terreno: grama (ou a areia, a neve, o micélio do bioma) em cima, 3 de terra e pedra embaixo; fundo de água vira areia ou cascalho. Blocos a mais no comando também contam como terreno; plantas põe a vegetação do bioma. Na seleção; sem seleção, no espaço inteiro.',
  run: function (args) {
    var plants = false, extra = [];
    args = args.filter(function (a) { if (/^(plantas|plants|vegetacao|vegetação)$/i.test(a)) { plants = true; return false; } return true; });
    if (args.length) { var B = cmdBlocks(args); if (B.bad.length) return { err: 'Bloco desconhecido: ' + B.bad.join(', ') + '.' }; extra = B.ok; }
    var ex = new Set(extra), soil = function (v) { if (!v) return false; var bi = cellBlock(v); return ex.has(bi) || CMD_SOIL.test(BLOCKS[bi].java); };
    var terr = function (v) { return v && (ex.has(cellBlock(v)) || cmdNat(cellBlock(v))); };
    var sc = cmdScope(), nether = !!(wio && wio.area && wio.area.dim === 1), changes = [], snows = [], plantCols = {}, cols = 0;
    cmdCols(sc, function (x, z) {
      var rc = cmdRecipe(x, z), R = rc.R, Ls = R.layers.map(function (L) { return typeof L === 'function' ? L() : L; });
      // sky: céu em cima; water: água logo acima; covered: terreno já passado (a espessura de uma saliência);
      // built: passou por uma construção (o terreno debaixo dela fica como está); d: profundidade no trecho atual
      var sky = true, water = 0, covered = 0, built = false, d = -1, touched = false, rSky = false, rWater = 0, rCov = 0;
      for (var y = SY - 1; y >= sc.a[1]; y--) {
        var v = gget(x, y, z), j = cmdJ(v), inS = y <= sc.b[1];
        if (!terr(v)) {
          d = -1;
          if (j === 'water') water++;
          else if (!v || cmdAirish(v) || /leaves$/.test(j) || (nether && j === 'bedrock')) water = 0;
          else if (j !== 'lava') { sky = false; built = true; water = 0; }
          continue;
        }
        d++;
        if (d === 0) { rSky = sky; rWater = water; rCov = covered; } // o trecho todo segue o que havia em cima dele
        if (inS && !built && soil(v)) {
          var nm;
          if (rSky && rWater) nm = d < 3 ? (rWater <= 3 ? 'sand' : 'gravel') : 'stone';
          else if (rSky) { nm = d < Ls.length ? Ls[d] : 'stone'; if (nm === 'mesa') nm = MESA_BANDS[((y % 16) + 16) % 16]; }
          else nm = rCov <= 4 && d < 3 ? 'dirt' : 'stone';
          if (nether && nm === 'stone') nm = 'netherrack';
          var nv = cellFromName(nm); if (nv && nv !== v) { changes.push(x, y, z, nv); touched = true; }
        }
        if (inS && !built && rSky && !rWater && d === 0 && y + 1 < SY) {
          if (R.snow && !gget(x, y + 1, z)) snows.push(x, y + 1, z);
          if (plants) (plantCols[rc.id] = plantCols[rc.id] || []).push(x, z);
        }
        sky = false; covered++; water = 0;
      }
      if (touched) cols++;
    });
    if (!changes.length && !snows.length && !Object.keys(plantCols).length) return { msg: 'Nada a mudar ' + sc.txt + ': o terreno já está com as camadas, ou não há grama, terra, areia ou pedra' + (extra.length ? ' (nem dos blocos dados)' : '') + '.' };
    var st = {};
    cmdEdit('naturalize ' + args.concat(plants ? ['plantas'] : []).join(' '), function () {
      for (var k = 0; k < changes.length; k += 4) editSet(changes[k], changes[k + 1], changes[k + 2], changes[k + 3]);
      var sn = cellFromName('snow'); if (sn) for (k = 0; k < snows.length; k += 3) if (!gget(snows[k], snows[k + 1], snows[k + 2])) editSet(snows[k], snows[k + 1], snows[k + 2], sn);
      if (plants) {
        var plainId = (BIOMES.filter(function (b) { return b.n === 'plains'; })[0] || {}).id;
        Object.keys(plantCols).forEach(function (id) { var bid = +id < 0 ? plainId : +id; if (bid != null) bioTerra(plantCols[id], bid, st); });
      }
    });
    var T = st.terra;
    return { msg: 'Terreno naturalizado ' + sc.txt + ': ' + (changes.length / 4).toLocaleString('pt-BR') + ' blocos trocados em ' + cols.toLocaleString('pt-BR') + ' colunas' + (snows.length ? ', ' + (snows.length / 3).toLocaleString('pt-BR') + ' de neve' : '') + (T ? ', ' + (T.plantas || 0) + ' plantas e ' + (T.arvores || 0) + ' árvores' : '') + '. Ctrl+Z desfaz.' };
  }
};
