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
    if (e.key === 'Enter') { e.preventDefault(); var r = cmdRun(i.value); if (r && !r.err) { i.value = ''; cmdPos = cmdHist.length; } }
    else if (e.key === 'Escape') { e.preventDefault(); cmdClose(); }
    else if (e.key === 'Tab') { e.preventDefault(); cmdComplete(i); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (cmdPos > 0) { cmdPos--; i.value = cmdHist[cmdPos] || ''; } }
    else if (e.key === 'ArrowDown') { e.preventDefault(); if (cmdPos < cmdHist.length) { cmdPos++; i.value = cmdHist[cmdPos] || ''; } }
  });
  $('cmdX').addEventListener('click', cmdClose);
  $('cmdGo').addEventListener('click', function () { var r = cmdRun($('cmdIn').value); if (r && !r.err) $('cmdIn').value = ''; $('cmdIn').focus(); });
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
