/* ---------- Primeira pessoa: andar dentro da construção ---------- */
/* Entra pela ferramenta Teleporte (Shift + clique num bloco, ou o botão do aviso). O mouse fica preso na tela
   (pointer lock) e gira a visão; WASD anda, Espaço pula, F liga o voo (Espaço sobe, Shift desce), Esc sai.
   Colisão com os blocos (caixa de 0,6 × 1,8 do jogador); degraus de 1 bloco são subidos sozinhos; escada de mão,
   trepadeira e andaime sobem com Espaço ou W; na água, Espaço nada para cima. Como no jogo: clique esquerdo quebra,
   direito coloca o bloco da hotbar, botão do meio pega o bloco; a roda e 1 a 9 trocam o bloco. */
var walk = null;
var WALK_PASS = /^(air|water|lava|bubble_column|light|.*torch|.*_sapling|.*flower.*|poppy|dandelion|.*tulip|allium|azure_bluet|blue_orchid|oxeye_daisy|cornflower|lily_of_the_valley|wither_rose|short_grass|tall_grass|fern|large_fern|dead_bush|.*rail|redstone_wire|.*button|lever|.*sign|.*banner|vine|.*carpet|snow|tripwire.*|.*door|.*trapdoor|.*fence_gate|seagrass|tall_seagrass|kelp.*|sugar_cane|wheat|carrots|potatoes|beetroots|.*mushroom|cobweb|.*_roots|.*fungus|nether_sprouts|.*coral_fan|.*coral|ladder|scaffolding|lily_pad|sweet_berry_bush|glow_lichen|sculk_vein|pink_petals|.*pressure_plate|fire|soul_fire|end_portal|nether_portal|structure_void|.*_bush|pitcher_plant|torchflower|spore_blossom|hanging_roots|cave_vines.*|twisting_vines.*|weeping_vines.*|small_dripleaf|frogspawn|leaf_litter|.*_petals)$/;
var WALK_CLIMB = /^(ladder|vine|scaffolding|cave_vines.*|twisting_vines.*|weeping_vines.*)$/;
function walkCellBlock(x, y, z) { var v = gget(x, y, z); return v ? BLOCKS[cellBlock(v)] : null; }
function walkSolid(x, y, z) {
  if (y < 0 || x < 0 || z < 0 || x >= SX || z >= SZ) return true; // o fundo e as bordas do espaço seguram o jogador
  if (y >= SY || (layerOn && y > layerY)) return false;           // acima do corte da Camada não há nada
  var b = walkCellBlock(x, y, z); return !!b && !WALK_PASS.test(b.java);
}
function walkBox(p, fn) {
  for (var y = Math.floor(p[1]); y <= Math.floor(p[1] + 1.8 - 1e-6); y++)
    for (var z = Math.floor(p[2] - 0.3); z <= Math.floor(p[2] + 0.3 - 1e-6); z++)
      for (var x = Math.floor(p[0] - 0.3); x <= Math.floor(p[0] + 0.3 - 1e-6); x++) if (fn(x, y, z)) return true;
  return false;
}
function walkHits(p) { return walkBox(p, walkSolid); }
function walkIn(p, re) { return walkBox(p, function (x, y, z) { var b = walkCellBlock(x, y, z); return !!b && re.test(b.java); }); }
function walkStart(c) {
  if (walk) return;
  var cv = renderer.domElement;
  var p = c ? [c[0] + 0.5, c[1] + 1, c[2] + 0.5] : [cam.tx, cam.ty, cam.tz];
  while (walkHits(p) && p[1] < SY + 2) p[1] += 1; // não nascer dentro de um bloco
  walk = { p: p, v: [0, 0, 0], yaw: cam.yaw, pitch: -0.15, fly: false, ground: false, keys: {}, t: performance.now(), saved: Object.assign({}, cam) };
  anchor = null; anchor2 = null; updateAnchorChip(); pasting = false;
  $('walkChip').hidden = false; $('crosshair').hidden = false; document.body.classList.add('walking');
  helpers.forEach(function (h) { if (h._compass) h.visible = false; }); // as letras da bússola no chão atrapalham de dentro
  try { var q = cv.requestPointerLock(); if (q && q.catch) q.catch(function () {}); } catch (e) {}
  hoverT = null; updatePreview(); walkHud();
  requestAnimationFrame(walkTick);
  toast('Primeira pessoa: WASD anda, Espaço pula, F voa, clique esquerdo quebra, direito coloca. Esc sai.', 6000);
}
function walkStop() {
  if (!walk) return;
  var w = walk; walk = null;
  $('walkChip').hidden = true; $('crosshair').hidden = true; document.body.classList.remove('walking');
  helpers.forEach(function (h) { if (h._compass) h.visible = true; });
  if (document.pointerLockElement) try { document.exitPointerLock(); } catch (e) {}
  // a câmera normal volta a girar em volta de onde o jogador estava, olhando na mesma direção
  cam.tx = w.p[0]; cam.ty = w.p[1] + 1; cam.tz = w.p[2]; cam.yaw = w.yaw; cam.pitch = 0.45; cam.dist = Math.max(8, Math.min(w.saved.dist, 20));
  updateCamera(); requestRender(); updatePreview();
}
function walkDir() { var cp = Math.cos(walk.pitch); return [-Math.sin(walk.yaw) * cp, Math.sin(walk.pitch), -Math.cos(walk.yaw) * cp]; }
/* Câmera nos olhos do jogador (chamada por updateCamera durante a caminhada) */
function walkCamera() {
  var e = [walk.p[0], walk.p[1] + 1.62, walk.p[2]], d = walkDir();
  camera.position.set(e[0], e[1], e[2]); camera.lookAt(e[0] + d[0], e[1] + d[1], e[2] + d[2]); camera.updateMatrixWorld(true);
  cam.tx = e[0]; cam.ty = e[1]; cam.tz = e[2]; // os chunks em volta são montados a partir daqui
}
function walkMove(a, d) {
  if (!d) return false;
  var p = walk.p, o = p[a]; p[a] += d;
  if (!walkHits(p)) return false;
  if (a !== 1 && (walk.g0 || walk.fly)) { // degrau de 1 bloco: sobe sozinho
    p[1] += 1; if (!walkHits(p)) return false; p[1] -= 1;
  }
  p[a] = o;
  if (a === 1) { // chão: pousa em cima do bloco; teto: encosta embaixo dele
    p[1] = d < 0 ? Math.floor(o + d) + 1 : Math.floor(o + d + 1.8) - 1.8 - 1e-4;
    if ((d < 0 && p[1] > o) || walkHits(p)) p[1] = o;
    if (d < 0) walk.ground = true; walk.v[1] = 0;
  }
  else { var lim = d > 0 ? Math.floor(o + 0.3 + d) - 0.3 - 1e-4 : Math.floor(o - 0.3 + d) + 1.3 + 1e-4; p[a] = lim; if (walkHits(p)) p[a] = o; }
  return true;
}
function walkTick(now) {
  if (!walk) return;
  var total = Math.min(0.25, (now - walk.t) / 1000); walk.t = now;
  // passos de até 1/40 s: a velocidade é a mesma em computador lento, sem atravessar paredes
  for (var left = total; left > 1e-4; left -= 0.025) walkStep(Math.min(0.025, left));
  if (walk.p[1] < -20) walk.p[1] = 0;
  updateCamera(); requestRender();
  walkHud();
  requestAnimationFrame(walkTick);
}
function walkStep(dt) {
  var now = function () { return performance.now(); };
  var k = walk.keys, f = (k.KeyW ? 1 : 0) - (k.KeyS ? 1 : 0), s = (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0);
  var sy = Math.sin(walk.yaw), cy = Math.cos(walk.yaw), speed = walk.fly ? 11 : 4.6;
  var mx = (-sy * f + cy * s), mz = (-cy * f - sy * s), ml = Math.hypot(mx, mz) || 1;
  if (f || s) { mx = mx / ml * speed; mz = mz / ml * speed; } else { mx = 0; mz = 0; }
  var climb = !walk.fly && walkIn(walk.p, WALK_CLIMB), wet = !walk.fly && walkIn(walk.p, /^(water|bubble_column)$/);
  if (walk.fly) walk.v[1] = ((k.Space ? 1 : 0) - (k.ShiftLeft || k.ShiftRight ? 1 : 0)) * 9;
  else if (climb) walk.v[1] = k.Space || k.KeyW ? 3 : (k.ShiftLeft || k.ShiftRight ? -3 : Math.max(walk.v[1] - 20 * dt, -1.2));
  else if (wet) { walk.v[1] = k.Space ? 3 : Math.max(walk.v[1] - 8 * dt, -2); mx *= 0.6; mz *= 0.6; }
  else {
    // o pulo fica guardado um instante: um toque rápido em Espaço não se perde entre dois quadros
    if ((k.Space || walk.jump > now()) && walk.ground) { walk.v[1] = 8.6; walk.jump = 0; }
    walk.v[1] = Math.max(walk.v[1] - 30 * dt, -60);
  }
  walk.g0 = walk.ground; walk.ground = false;
  walkMove(0, mx * dt); walkMove(2, mz * dt);
  if (walkMove(1, walk.v[1] * dt) && walk.v[1] <= 0) walk.ground = true;
  if (!walk.ground && walk.v[1] <= 0) { var q = walk.p.slice(); q[1] -= 0.02; if (walkHits(q)) walk.ground = true; }
}
function walkHud() {
  var p = walk.p, w = [Math.floor(p[0]), Math.floor(p[1]), Math.floor(p[2])];
  $('walkTxt').innerHTML = '<b>Primeira pessoa</b> ' + (wio && wio.area ? wioWorldPos(w) : w).join(', ') + (walk.fly ? ' · voando' : '') + ' · WASD anda · Espaço pula · F ' + (walk.fly ? 'para de voar' : 'voa') + ' · Esc sai';
}
/* Clique durante a caminhada: no centro da tela, como no jogo */
function walkClick(btn) {
  var r = renderer.domElement.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, t = targetAt(cx, cy);
  if (!t) return;
  var reach = function (c) { return c && Math.hypot(c[0] + 0.5 - walk.p[0], c[1] + 0.5 - walk.p[1] - 1.62, c[2] + 0.5 - walk.p[2]) <= 8; };
  if (btn === 0 && t.hit && reach(t.hit)) { beginBatch(); eraseAt(t.hit); endBatch(); }
  else if (btn === 2 && t.place && reach(t.place)) {
    var p = walk.p, c = t.place;
    if (c[0] === Math.floor(p[0]) && c[2] === Math.floor(p[2]) && c[1] >= Math.floor(p[1]) && c[1] <= Math.floor(p[1] + 1.7)) return; // não pôr bloco dentro do jogador
    beginBatch(); placeAt(c, t); endBatch();
  } else if (btn === 1 && t.hit) { var v = gget(t.hit[0], t.hit[1], t.hit[2]); if (v) chooseBlock(cellBlock(v)); }
}
(function () {
  window.addEventListener('keydown', function (e) {
    if (!walk) return;
    if (e.code === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); walkStop(); return; }
    if (/^(Key[WASDF]|Space|ShiftLeft|ShiftRight)$/.test(e.code)) {
      e.preventDefault(); e.stopImmediatePropagation();
      if (e.code === 'KeyF' && !e.repeat) { walk.fly = !walk.fly; walk.v[1] = 0; walkHud(); }
      walk.keys[e.code] = true; if (e.code === 'Space' && !e.repeat) walk.jump = performance.now() + 300;
    } else if (e.code === 'KeyQ' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); e.stopImmediatePropagation(); if (!e.repeat) projWalkThrow(); // lança o projétil escolhido na ferramenta Lançar
    } else if (e.code === 'KeyZ' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); e.stopImmediatePropagation(); if (!e.repeat) apoioPut(); // bloco de apoio sob os pés
    } else if (!/^Digit[1-9]$/.test(e.code)) { e.stopImmediatePropagation(); } // outras teclas (ferramentas) ficam paradas
  }, true);
  window.addEventListener('keyup', function (e) { if (walk) walk.keys[e.code] = false; }, true);
  window.addEventListener('blur', function () { if (walk) walk.keys = {}; });
  document.addEventListener('pointerlockchange', function () {
    if (walk && !document.pointerLockElement && walk.locked) walkStop(); // Esc do navegador solta o mouse: sai
    if (walk && document.pointerLockElement) walk.locked = true;
  });
  document.addEventListener('mousemove', function (e) {
    if (!walk || !document.pointerLockElement) return;
    walk.yaw -= e.movementX * 0.0024; walk.pitch = Math.max(-1.55, Math.min(1.55, walk.pitch - e.movementY * 0.0024));
  });
})();
function walkBind(cv) {
  // cliques e roda vão para a caminhada (fase de captura: os gestos normais do editor não rodam)
  var drag = null;
  cv.addEventListener('pointerdown', function (e) {
    if (!walk) return;
    e.stopImmediatePropagation(); e.preventDefault();
    if (!document.pointerLockElement) { try { var q = cv.requestPointerLock(); if (q && q.catch) q.catch(function () {}); } catch (x) {} drag = { x: e.clientX, y: e.clientY }; return; }
    walkClick(e.button);
  }, true);
  cv.addEventListener('pointermove', function (e) {
    if (!walk) return; e.stopImmediatePropagation();
    if (drag && !document.pointerLockElement) { // sem mouse preso (ex.: toque): arrastar gira a visão
      walk.yaw -= (e.clientX - drag.x) * 0.005; walk.pitch = Math.max(-1.55, Math.min(1.55, walk.pitch - (e.clientY - drag.y) * 0.005)); drag = { x: e.clientX, y: e.clientY };
    }
  }, true);
  ['pointerup', 'pointercancel'].forEach(function (n) { cv.addEventListener(n, function (e) { if (walk) { e.stopImmediatePropagation(); drag = null; } }, true); });
  cv.addEventListener('wheel', function (e) { if (!walk) return; e.preventDefault(); e.stopImmediatePropagation(); selectSlot((slot + (e.deltaY > 0 ? 1 : 8)) % 9); }, { capture: true, passive: false });
}
