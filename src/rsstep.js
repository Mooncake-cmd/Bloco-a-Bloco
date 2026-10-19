/* ---------- Redstone passo a passo ---------- */
/* Pausar a simulação, avançar um tique por vez e ver num gráfico quando cada componente ligou e desligou.
   - Pausada, a agenda da redstone (rs.q) continua guardando o que vai acontecer, mas o relógio (rsTick a cada 50 ms)
     não corre: cada clique em "+1 tique" chama rsTick uma vez. As edições do usuário (alavanca com Usar, pó
     colocado) continuam reagindo na hora, como no jogo (a mudança imediata acontece dentro do tique atual).
   - Gráfico: com o painel aberto, cada mudança de um componente (pela simulação em rsSet, pelo usuário em
     rsAfterBatch, o pulso do observador e a força do comparador) entra no registro com o tique do jogo (rs.gt). Uma
     linha por componente, na ordem em que mudou pela primeira vez; a cor mais forte é força 15, e o pó mostra a força
     de 0 a 15 em tons. O tempo só anda quando há algo na agenda (ou nos cliques de avançar): pausas sem nada
     agendado não aparecem no gráfico.
   - Passar o mouse numa linha destaca o bloco na cena; clicar leva a câmera até ele. */
var RS_LOG_ROWS = 48, RS_LOG_SPAN = 120; // linhas guardadas; tiques visíveis no gráfico
var rsLog = { on: false, t0: 0, rows: new Map(), order: [], extra: 0, hover: -1, raf: 0 };
rs.paused = false;
/* Valor de um componente para o gráfico: 0 a 15, ou null se a célula não é um componente que liga e desliga */
function rsLogVal(v) {
  if (!v) return null;
  var bi = cellBlock(v), k = rsKind(bi);
  if (!k || k === 'solid' || k === 'head' || k === 'rblock') return null;
  var b = BLOCKS[bi]; if (!b.shape) return null;
  var p = stateProps(b, cellOri(v));
  if (p.power != null) return +p.power || 0;
  var on = p.extended != null ? p.extended : p.lit != null ? p.lit : p.open != null ? p.open : p.powered != null ? p.powered : p.triggered;
  return on == null ? null : on === 'true' ? 15 : 0;
}
function rsLogWhat(v) {
  var b = BLOCKS[cellBlock(v)], p = b.shape ? stateProps(b, cellOri(v)) : {};
  return p.power != null ? 'força' : p.extended != null ? 'estendido' : p.lit != null ? 'aceso' : p.open != null ? 'aberto' : 'ligado';
}
/* Registra o valor val (0 a 15, null = o bloco saiu) do componente em i; before é o valor de antes (para a linha
   nova começar certa) */
function rsLogPut(i, val, before, name, what) {
  if (!rsLog.on) return;
  var r = rsLog.rows.get(i);
  if (!r) {
    if (val == null) return;
    if (rsLog.order.length >= RS_LOG_ROWS) { rsLog.extra++; return; }
    var p = unidx(i); r = { i: i, x: p[0], y: p[1], z: p[2], name: name, what: what, ev: [[rsLog.t0, before == null ? 0 : before]] };
    rsLog.rows.set(i, r); rsLog.order.push(r);
  }
  var last = r.ev[r.ev.length - 1];
  if (last[0] === rs.gt) { last[1] = val; if (r.ev.length > 1 && r.ev[r.ev.length - 2][1] === val) r.ev.pop(); }
  else if (last[1] !== val) r.ev.push([rs.gt, val]);
  if (r.ev.length > 4000) r.ev.splice(1, 1000);
  rsLogDraw();
}
/* Chamado por rsSet e pelas edições do usuário: célula mudou de old para v */
function rsLogCell(x, y, z, old, v) {
  if (!rsLog.on || (!v && !old)) return;
  if (rsKind(cellBlock(v || old)) === 'comparator') return; // o comparador entra pela força (rsLogCmp)
  var a = rsLogVal(v), b = rsLogVal(old);
  if (a == null && b == null) return;
  if (a != null && b != null && cellBlock(v) !== cellBlock(old)) b = null;
  var src = a != null ? v : old;
  rsLogPut(idx(x, y, z), a, b, BLOCKS[cellBlock(src)].name, rsLogWhat(src));
}
function rsLogObs(c, on) { if (rsLog.on) rsLogPut(rsIdx(c), on ? 15 : 0, on ? 0 : 15, c.b.name, 'pulso'); }
function rsLogCmp(c, lv, was) { if (rsLog.on) rsLogPut(rsIdx(c), lv, was, c.b.name, 'força'); }
/* O gráfico começa um pouco antes de agora: a primeira mudança mostra como estava antes */
function rsLogClear() { rsLog.t0 = rs.gt - 4; rsLog.rows = new Map(); rsLog.order = []; rsLog.extra = 0; rsLog.hover = -1; rsHi(null); rsLogDraw(); }

/* ---------- Pausar e avançar ---------- */
function rsSetPaused(on) {
  rs.paused = on;
  if (on) { clearInterval(rs.timer); rs.timer = 0; }
  else if (rs.q.length && !rs.timer) rs.timer = setInterval(rsTick, 50);
  rsPanelUI();
}
function rsStep(n) {
  if (!rsOn) { toast('Ligue a redstone primeiro (Projeto → Redstone funcionando).'); return; }
  if (!rs.paused) rsSetPaused(true);
  for (var k = 0; k < n; k++) rsTick();
  rsPanelUI();
}

/* ---------- Painel ---------- */
function openRsStep() {
  if (!rsOn) setRedstone(true);
  if (!rsLog.on) { rsLog.on = true; rsLogClear(); }
  $('rsPanel').hidden = false; rsPanelUI(); rsLogDraw();
}
function closeRsStep() { rsLog.on = false; $('rsPanel').hidden = true; rsHi(null); if (rs.paused) rsSetPaused(false); }
function rsPanelUI() {
  if (!$('rsPanel') || $('rsPanel').hidden) return;
  var q = rs.q, next = q.length ? Math.min.apply(null, q.map(function (e) { return e.t; })) - rs.gt : 0;
  $('rsPause').textContent = rs.paused ? '▶ Continuar' : '⏸ Pausar';
  $('rsPause').setAttribute('aria-pressed', rs.paused);
  $('rsClock').innerHTML = 'Tique <b>' + rs.gt.toLocaleString('pt-BR') + '</b> <span class="mixl">(' + (rs.gt / 2).toLocaleString('pt-BR') + ' de redstone)</span> · ' +
    (q.length ? q.length + (q.length > 1 ? ' na fila' : ' na fila') + ', o próximo daqui a ' + next + (next > 1 ? ' tiques' : ' tique') : 'nada na fila') + (rs.paused ? ' · <b>pausada</b>' : '');
}
/* Gráfico: uma linha por componente, o tempo na horizontal (os últimos RS_LOG_SPAN tiques) */
function rsLogDraw() {
  if (rsLog.raf || !rsLog.on) return;
  rsLog.raf = requestAnimationFrame(function () { rsLog.raf = 0; rsLogPaint(); });
}
function rsLogGeom() {
  var cv = $('rsChart'), W = cv.clientWidth, LW = Math.min(190, W * 0.38), RH = 16, t1 = rs.gt + 1, t0 = Math.max(rsLog.t0, t1 - RS_LOG_SPAN);
  return { cv: cv, W: W, LW: LW, RH: RH, H: 18 + Math.max(1, rsLog.order.length) * RH + 4, t0: t0, t1: t1, tw: (W - LW - 8) / Math.max(1, t1 - t0) };
}
function rsLogPaint() {
  if (!$('rsPanel') || $('rsPanel').hidden) return;
  rsPanelUI();
  var G = rsLogGeom(), cv = G.cv, dpr = window.devicePixelRatio || 1;
  cv.style.height = G.H + 'px'; cv.width = Math.round(G.W * dpr); cv.height = Math.round(G.H * dpr);
  var g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  var fg = cssColor('--fg'), mut = cssColor('--muted'), line = cssColor('--line'), acc = cssColor('--accent') || '#c55a11';
  g.clearRect(0, 0, G.W, G.H); g.font = '11px ' + (getComputedStyle(document.body).getPropertyValue('--font-mono') || 'monospace');
  var X = function (t) { return G.LW + 4 + (t - G.t0) * G.tw; };
  // grade: um traço por tique de redstone, mais forte a cada segundo (20 tiques)
  for (var t = Math.ceil(G.t0 / 2) * 2; t <= G.t1; t += 2) {
    var sec = t % 20 === 0; if (!sec && G.tw < 3) continue;
    g.fillStyle = line; g.globalAlpha = sec ? 1 : 0.45; g.fillRect(Math.round(X(t)), 14, 1, G.H - 14);
    if (sec) { g.globalAlpha = 1; g.fillStyle = mut; g.fillText(String(t), X(t) + 2, 10); }
  }
  g.globalAlpha = 1;
  if (!rsLog.order.length) { g.fillStyle = mut; g.fillText('Mexa num circuito (alavanca, botão...) para as linhas aparecerem.', 6, 30); }
  rsLog.order.forEach(function (r, n) {
    var y = 18 + n * G.RH;
    if (n === rsLog.hover) { g.fillStyle = line; g.fillRect(0, y - 1, G.W, G.RH); }
    g.fillStyle = fg; var lbl = r.name + ' ' + r.x + ',' + r.y + ',' + r.z;
    while (g.measureText(lbl).width > G.LW - 6 && lbl.length > 4) lbl = lbl.slice(0, -2);
    g.fillText(lbl, 4, y + 11);
    for (var k = 0; k < r.ev.length; k++) {
      var a = Math.max(r.ev[k][0], G.t0), b = k + 1 < r.ev.length ? r.ev[k + 1][0] : G.t1, v = r.ev[k][1];
      if (b <= G.t0 || v == null || !v) continue;
      g.fillStyle = acc; g.globalAlpha = 0.25 + 0.75 * v / 15;
      g.fillRect(X(a), y + 2, Math.max(1, X(b) - X(a)), G.RH - 5);
    }
    g.globalAlpha = 1; g.fillStyle = line; g.fillRect(G.LW + 4, y + G.RH - 2, G.W - G.LW - 8, 1);
  });
  // agora
  g.fillStyle = fg; g.fillRect(Math.round(X(rs.gt)), 12, 2, G.H - 12);
  $('rsMore').textContent = rsLog.extra ? '+' + rsLog.extra + ' mudanças de outros componentes não cabem (limite de ' + RS_LOG_ROWS + ' linhas): Limpar recomeça.' : '';
}
/* Linha e tique debaixo do ponteiro */
function rsLogAt(e) {
  var G = rsLogGeom(), r = G.cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
  var n = Math.floor((y - 18) / G.RH); if (n < 0 || n >= rsLog.order.length) n = -1;
  var t = Math.floor(G.t0 + (x - G.LW - 4) / G.tw); if (x < G.LW + 4) t = null;
  return { n: n, t: t };
}
function rsValAt(r, t) { var v = 0; for (var k = 0; k < r.ev.length && r.ev[k][0] <= t; k++) v = r.ev[k][1]; return v; }
var rsHiObj = null;
function rsHi(r) {
  if (rsHiObj) { scene.remove(rsHiObj); rsHiObj.geometry.dispose(); rsHiObj = null; }
  if (r) {
    rsHiObj = new THREE.Mesh(new THREE.BoxGeometry(1.08, 1.08, 1.08), new THREE.MeshBasicMaterial({ color: new THREE.Color(cssColor('--accent')), transparent: true, opacity: 0.45, depthTest: false }));
    rsHiObj.position.set(r.x + 0.5, r.y + 0.5, r.z + 0.5); rsHiObj.renderOrder = 11; scene.add(rsHiObj);
  }
  requestRender();
}
$('rsChart').addEventListener('mousemove', function (e) {
  var a = rsLogAt(e), r = a.n >= 0 ? rsLog.order[a.n] : null;
  if (a.n !== rsLog.hover) { rsLog.hover = a.n; rsHi(r); rsLogDraw(); }
  $('rsChart').title = r ? r.name + ' em ' + r.x + ', ' + r.y + ', ' + r.z + (a.t != null ? ' · tique ' + a.t + ': ' + r.what + ' ' + rsValAt(r, a.t) : '') + ' (clique: a câmera vai até ele)' : '';
});
$('rsChart').addEventListener('mouseleave', function () { rsLog.hover = -1; rsHi(null); rsLogDraw(); });
$('rsChart').addEventListener('click', function (e) { var a = rsLogAt(e); if (a.n >= 0) { var r = rsLog.order[a.n]; teleportTo({ hit: [r.x, r.y, r.z] }); } });
$('rsPanel').addEventListener('click', function (e) {
  var b = e.target.closest('button'); if (!b) return;
  if (b.id === 'rsPause') rsSetPaused(!rs.paused);
  else if (b.hasAttribute('data-rstep')) rsStep(+b.getAttribute('data-rstep'));
  else if (b.id === 'rsLogClr') rsLogClear();
  else if (b.id === 'rsStepClose') closeRsStep();
});
/* Teclas com o painel aberto: ponto (.) avança 1 tique de redstone, Shift + ponto 1 tique do jogo, P pausa e continua */
function rsStepKey(e, k) {
  if (!rsLog.on || e.ctrlKey || e.metaKey || e.altKey) return false;
  if (k === '.' || k === '>') { e.preventDefault(); rsStep(e.shiftKey || k === '>' ? 1 : 2); return true; }
  if (k === 'p' && $('symChip').hidden) { rsSetPaused(!rs.paused); return true; }
  return false;
}
