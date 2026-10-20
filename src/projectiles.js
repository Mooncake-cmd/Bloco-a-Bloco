/* ---------- Lançar: flecha, flecha em chamas, tridente, bola de neve e ovo ---------- */
/* A ferramenta Lançar (W) atira do ponto de vista da câmera na direção do ponteiro; em primeira pessoa, Q atira na
   direção da mira. A física é a do jogo (Java, por tique, 20 por segundo):
     posição += velocidade; velocidade *= resistência (0,99 no ar; na água 0,6 a flecha, 0,99 o tridente, 0,8 os
     arremessados); velocidade.y -= gravidade (0,05 flecha e tridente, 0,03 bola de neve e ovo).
   Velocidade inicial: flecha 3 blocos por tique com o arco carregado (a Força escolhe a carga), tridente 2,5, bola de
   neve e ovo 1,5. Sem a dispersão aleatória do jogo: vai exatamente para onde a prévia mostra.
   Cada tique testa o trecho entre a posição e a próxima com o raio do editor (a forma real dos blocos). Passam sem
   bater: ar, água, plantas, tochas, trilhos, pó, alavancas, placas e botões (como no jogo, esses não têm colisão);
   mas o que o trecho atravessa conta:
   - Linha de armadilha: dispara (todos os projéteis).
   - Botão de madeira e placa de pressão de madeira: ficam pressionados enquanto a flecha ou o tridente estiver
     cravado neles (a placa, cravado no bloco embaixo dela). Placas de peso: força pelo número de flechas (leve: 1 por
     flecha até 15; pesada: 1 a cada 10).
   Ao bater num bloco: o alvo dá força de 1 a 15 pela distância do centro, por 20 tiques (flecha, tridente) ou 8 (bola
   de neve, ovo); o sino toca; a flecha em chamas acende velas e fogueiras. Flecha e tridente ficam cravados (a flecha
   some depois de 1 minuto, como no jogo; o tridente fica até Recolher); bola de neve e ovo se desfazem. */
var PROJ_TYPES = {
  arrow: { name: 'Flecha', v: 3, g: 0.05, water: 0.6, stick: true, pressHold: true, tgt: 20, life: 1200 },
  fire: { name: 'Flecha em chamas', v: 3, g: 0.05, water: 0.6, stick: true, pressHold: true, tgt: 20, life: 1200, fire: true },
  trident: { name: 'Tridente', v: 2.5, g: 0.05, water: 0.99, stick: true, pressHold: true, tgt: 20, life: 0 },
  snowball: { name: 'Bola de neve', v: 1.5, g: 0.03, water: 0.8, stick: false, tgt: 8 },
  egg: { name: 'Ovo', v: 1.5, g: 0.03, water: 0.8, stick: false, tgt: 8 }
};
var PROJ_PASS = /^(air|water|lava|bubble_column|light|.*torch|.*_sapling|.*flower.*|poppy|dandelion|.*tulip|allium|azure_bluet|blue_orchid|oxeye_daisy|cornflower|lily_of_the_valley|wither_rose|short_grass|tall_grass|fern|large_fern|dead_bush|.*rail|redstone_wire|lever|.*button|.*sign|.*banner|vine|tripwire|seagrass|tall_seagrass|kelp.*|sugar_cane|wheat|carrots|potatoes|beetroots|.*mushroom|cobweb|.*_roots|.*fungus|nether_sprouts|.*coral_fan|.*coral|sweet_berry_bush|glow_lichen|sculk_vein|.*pressure_plate|fire|soul_fire|end_portal|nether_portal|structure_void|.*_bush|pitcher_plant|torchflower|spore_blossom|hanging_roots|cave_vines.*|twisting_vines.*|weeping_vines.*|small_dripleaf|frogspawn|leaf_litter|.*_petals|resin_clump)$/;
var proj = { type: 'arrow', pow: 1, flying: [], stuck: [], raf: 0, last: 0, acc: 0, prev: null };
try { var pj0 = JSON.parse(localStorage.getItem('bloco-a-bloco-lancar') || 'null'); if (pj0 && PROJ_TYPES[pj0.t]) { proj.type = pj0.t; proj.pow = pj0.p || 1; } } catch (e) {}
function projSave() { try { localStorage.setItem('bloco-a-bloco-lancar', JSON.stringify({ t: proj.type, p: proj.pow })); } catch (e) {} }

/* Um trecho do voo: de o, andando o vetor s. Devolve { hit: {cell, normal, t (0 a 1), pt}, cross: [[x, y, z, java]] }
   (cross = botões, placas e linhas que o trecho atravessou, na ordem) */
function projSeg(o, s) {
  var len = Math.hypot(s[0], s[1], s[2]); if (len < 1e-9) return { hit: null, cross: [] };
  var d = [s[0] / len, s[1] / len, s[2] / len], c = [Math.floor(o[0]), Math.floor(o[1]), Math.floor(o[2])];
  var st = [d[0] > 0 ? 1 : -1, d[1] > 0 ? 1 : -1, d[2] > 0 ? 1 : -1];
  var td = [d[0] ? Math.abs(1 / d[0]) : Infinity, d[1] ? Math.abs(1 / d[1]) : Infinity, d[2] ? Math.abs(1 / d[2]) : Infinity], tm = [];
  for (var a = 0; a < 3; a++) tm[a] = !d[a] ? Infinity : d[a] > 0 ? (c[a] + 1 - o[a]) / d[a] : (o[a] - c[a]) / -d[a];
  var face = [0, 0, 0], t = 0, cross = [];
  for (var n = 0; n < 64; n++) {
    var v = inB(c[0], c[1], c[2]) && c[1] <= layerMax() ? gget(c[0], c[1], c[2]) : 0;
    if (v) {
      var b = BLOCKS[cellBlock(v)], O = [o[0] - c[0], o[1] - c[1], o[2] - c[2]];
      if (PROJ_PASS.test(b.java)) {
        if (/_button$|pressure_plate$|^tripwire$/.test(b.java) && b.shape) { var sx = shapeRayHit(b, cellOri(v), c[0], c[1], c[2], O, d); if (sx && sx.t <= len) cross.push([c[0], c[1], c[2], b.java]); else if (/^tripwire$/.test(b.java)) cross.push([c[0], c[1], c[2], b.java]); }
      } else {
        if (!b.shape) { if (n > 0) return { hit: { cell: c.slice(), normal: face.slice(), t: t / len, pt: [o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t] }, cross: cross }; }
        else { var sh = shapeRayHit(b, cellOri(v), c[0], c[1], c[2], O, d); if (sh && sh.t <= len) return { hit: { cell: c.slice(), normal: sh.n, t: sh.t / len, pt: [o[0] + d[0] * sh.t, o[1] + d[1] * sh.t, o[2] + d[2] * sh.t] }, cross: cross }; }
      }
    }
    var ax = tm[0] < tm[1] ? (tm[0] < tm[2] ? 0 : 2) : (tm[1] < tm[2] ? 1 : 2);
    t = tm[ax]; if (t > len) break;
    c[ax] += st[ax]; tm[ax] += td[ax]; face = [0, 0, 0]; face[ax] = -st[ax];
  }
  return { hit: null, cross: cross };
}
function projInWater(p) { var x = Math.floor(p[0]), y = Math.floor(p[1]), z = Math.floor(p[2]); if (!inB(x, y, z)) return false; var v = gget(x, y, z); return !!v && /^(water|bubble_column)$/.test(BLOCKS[cellBlock(v)].java); }
/* Um tique de física: devolve { p, v, hit, cross } */
function projStep(P) {
  var T = PROJ_TYPES[P.type], r = projSeg(P.p, P.v), p2;
  if (r.hit) { var f = r.hit.t; p2 = [P.p[0] + P.v[0] * f, P.p[1] + P.v[1] * f, P.p[2] + P.v[2] * f]; return { p: p2, v: P.v, hit: r.hit, cross: r.cross }; }
  p2 = [P.p[0] + P.v[0], P.p[1] + P.v[1], P.p[2] + P.v[2]];
  var k = projInWater(p2) ? T.water : 0.99, v2 = [P.v[0] * k, P.v[1] * k - T.g, P.v[2] * k];
  return { p: p2, v: v2, hit: null, cross: r.cross };
}
function projGone(p) { return p[1] < -16 || p[1] > SY + 256 || p[0] < -256 || p[2] < -256 || p[0] > SX + 256 || p[2] > SZ + 256; }
function projSpeed(type) { var T = PROJ_TYPES[type]; return T.v * (type === 'arrow' || type === 'fire' ? proj.pow : 1); }
/* Prévia: o caminho inteiro (até 400 tiques) a partir de o na direção d */
function projPath(o, d, type) {
  var sp = projSpeed(type), P = { type: type, p: o.slice(), v: [d[0] * sp, d[1] * sp, d[2] * sp] }, pts = [o.slice()], hit = null;
  for (var n = 0; n < 400; n++) { var s = projStep(P); pts.push(s.p); if (s.hit) { hit = s.hit; break; } P.p = s.p; P.v = s.v; if (projGone(P.p)) break; }
  return { pts: pts, hit: hit, ticks: pts.length - 1 };
}

/* ---------- Lançar e animar ---------- */
function projMesh(type) {
  var g = new THREE.Group(), M = function (c, o) { return new THREE.MeshBasicMaterial(Object.assign({ color: c }, o || {})); };
  if (type === 'snowball' || type === 'egg') {
    var m = new THREE.Mesh(new THREE.SphereGeometry(type === 'egg' ? 0.11 : 0.13, 10, 8), M(type === 'egg' ? 0xe8d6b0 : 0xf4f8ff));
    if (type === 'egg') m.scale.set(1, 1, 1.3); g.add(m);
  } else if (type === 'trident') {
    var sh = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 1.3), M(0x4fa8a0)); sh.position.z = -0.25; g.add(sh);
    [-0.12, 0, 0.12].forEach(function (x) { var pr = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.28), M(0x9fe0d6)); pr.position.set(x, 0, 0.45); g.add(pr); });
    var cr = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, 0.05), M(0x9fe0d6)); cr.position.z = 0.32; g.add(cr);
  } else {
    var s2 = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.85), M(0x7a5a32)); s2.position.z = -0.12; g.add(s2);
    var tip = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.12), M(0x8c8c8c)); tip.position.z = 0.32; g.add(tip);
    var fl = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.02, 0.18), M(0xf0f0f0)); fl.position.z = -0.48; g.add(fl);
    var fl2 = fl.clone(); fl2.rotation.z = Math.PI / 2; g.add(fl2);
    if (type === 'fire') { var gl = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), M(0xff8a1c, { transparent: true, opacity: 0.55 })); gl.position.z = 0.1; g.add(gl); }
  }
  return g;
}
function projAim(m, p, v) { m.position.set(p[0], p[1], p[2]); var l = Math.hypot(v[0], v[1], v[2]); if (l > 1e-6) m.lookAt(p[0] + v[0], p[1] + v[1], p[2] + v[2]); }
function projThrow(o, d) {
  var sp = projSpeed(proj.type), P = { type: proj.type, p: o.slice(), v: [d[0] * sp, d[1] * sp, d[2] * sp], ticks: 0 };
  P.prev = P.p.slice(); P.mesh = projMesh(P.type); projAim(P.mesh, P.p, P.v); scene.add(P.mesh);
  proj.flying.push(P); projRun();
}
function projRun() { if (!proj.raf) { proj.last = performance.now(); proj.acc = 0; proj.raf = requestAnimationFrame(projFrame); } }
function projFrame(now) {
  proj.raf = 0;
  proj.acc += Math.min(250, now - proj.last); proj.last = now;
  while (proj.acc >= 50) { proj.acc -= 50; projTick(); }
  var a = proj.acc / 50;
  proj.flying.forEach(function (P) { projAim(P.mesh, [P.prev[0] + (P.p[0] - P.prev[0]) * a, P.prev[1] + (P.p[1] - P.prev[1]) * a, P.prev[2] + (P.p[2] - P.prev[2]) * a], P.v); });
  requestRender();
  if (proj.flying.length) proj.raf = requestAnimationFrame(projFrame);
}
function projTick() {
  proj.flying = proj.flying.filter(function (P) {
    P.prev = P.p.slice(); P.ticks++;
    var s = projStep(P);
    s.cross.forEach(function (q) { projCross(P, q); });
    P.p = s.p; P.v = s.v;
    if (s.hit) { projHit(P, s.hit); return false; }
    if (projGone(P.p) || P.ticks > 2400) { scene.remove(P.mesh); return false; }
    return true;
  });
}
/* Cravados: somem depois do tempo de vida (em tiques, contados a cada segundo) ou se o bloco em que estão saiu */
function projStuckCheck() {
  var gone = false;
  proj.stuck = proj.stuck.filter(function (S) {
    var v = inB(S.cell[0], S.cell[1], S.cell[2]) ? gget(S.cell[0], S.cell[1], S.cell[2]) : 0;
    if ((S.life && (S.life -= 20) <= 0) || !v) { scene.remove(S.mesh); gone = true; return false; }
    return true;
  });
  if (gone) { projPlatesAll(); updateProjChip(); requestRender(); }
  if (!proj.stuck.length) { clearInterval(proj.timer); proj.timer = 0; }
}
/* Atravessou um botão, uma placa ou uma linha */
function projCross(P, q) {
  var j = q[3];
  if (j === 'tripwire') {
    var ln = rsTripFind(q[0], q[1], q[2]);
    if (ln && rsOn && !ln.hooks.some(function (h) { return rsP(h).powered === 'true'; })) { rsPulse(ln.hooks.concat(ln.wires), PROJ_TYPES[P.type].name + ': armadilha', 10, 'tripOff'); toast(PROJ_TYPES[P.type].name + ' passou pela linha: armadilha disparada.'); }
    return;
  }
  if (PROJ_TYPES[P.type].pressHold) (P.over || (P.over = [])).push(q); // vale se ele cravar logo depois (ver projHit)
}
function projHit(P, h) {
  var T = PROJ_TYPES[P.type], c = h.cell, v = gget(c[0], c[1], c[2]), b = BLOCKS[cellBlock(v)], msg = '';
  if (b.java === 'target' && rsOn) {
    var lv = rsHitTarget(c, { pt: h.pt, normal: h.normal }, T.tgt, T.name + ': alvo');
    if (lv == null) lv = 0;
    msg = T.name + ' no alvo: força ' + lv + ' por ' + T.tgt + ' tiques.';
  } else if (b.java === 'bell') { rsPlayBell(); msg = T.name + ' no sino: dlem!'; }
  else if (T.fire && b.shape && /candle|campfire/.test(b.java)) {
    var p = stateProps(b, cellOri(v));
    if (p.lit === 'false') { p.lit = 'true'; beginBatch(T.name + ': acender'); editSet(c[0], c[1], c[2], mkCell(cellBlock(v), stateIndex(b, p))); endBatch(); msg = b.name + ' acesa pela flecha em chamas.'; }
  }
  if (!T.stick) { scene.remove(P.mesh); if (msg) toast(msg); return; }
  // crava: um pouco para dentro do bloco, apontando para onde ia
  var dl = Math.hypot(P.v[0], P.v[1], P.v[2]) || 1, u = [P.v[0] / dl, P.v[1] / dl, P.v[2] / dl], deep = P.type === 'trident' ? 0.35 : 0.25;
  projAim(P.mesh, [h.pt[0] - u[0] * (0.42 - deep), h.pt[1] - u[1] * (0.42 - deep), h.pt[2] - u[2] * (0.42 - deep)], P.v);
  var S = { mesh: P.mesh, type: P.type, cell: c.slice(), life: T.life, holds: [] };
  // botão e placa que ele atravessou logo antes de cravar (até 0,6 bloco antes da batida)
  (P.over || []).forEach(function (q) {
    var dx = q[0] + 0.5 - h.pt[0], dy = q[1] + 0.5 - h.pt[1], dz = q[2] + 0.5 - h.pt[2];
    if (Math.hypot(dx, dy, dz) <= 1.0) S.holds.push(q);
  });
  proj.stuck.push(S); if (!proj.timer) proj.timer = setInterval(projStuckCheck, 1000);
  if (proj.stuck.length > 256) { var o = proj.stuck.shift(); scene.remove(o.mesh); }
  S.holds.forEach(function (q) {
    var cv = gget(q[0], q[1], q[2]); if (!cv) return; var qb = BLOCKS[cellBlock(cv)];
    if (!rsOn) return;
    if (/^(stone|polished_blackstone)_(button|pressure_plate)$/.test(qb.java)) return; // de pedra: só jogadores e criaturas
    if (/_button$|_pressure_plate$/.test(qb.java) && !/weighted/.test(qb.java)) {
      var qp = stateProps(qb, cellOri(cv));
      if (qp.powered !== 'true') { qp.powered = 'true'; beginBatch(T.name + ': ' + qb.name); editSet(q[0], q[1], q[2], mkCell(cellBlock(cv), stateIndex(qb, qp))); endBatch(); }
      msg = msg || T.name + ' cravada em ' + qb.name + ': fica pressionado enquanto ela estiver ali.';
    }
  });
  projPlatesAll();
  updateProjChip();
  if (msg) toast(msg, 4000);
}
/* Quantos projéteis cravados seguram o botão ou a placa em i */
function projHolding(x, y, z) { var n = 0; proj.stuck.forEach(function (S) { S.holds.forEach(function (q) { if (q[0] === x && q[1] === y && q[2] === z) n++; }); }); return n; }
/* Placas de peso: força pela contagem de flechas cravadas nelas */
function projPlatesAll() {
  if (!rsOn) return;
  var seen = {};
  proj.stuck.forEach(function (S) { S.holds.forEach(function (q) { seen[q.slice(0, 3).join()] = q; }); });
  (proj.wplates || []).forEach(function (k) { if (!seen[k]) { var p = k.split(',').map(Number); seen[k] = [p[0], p[1], p[2], 'x']; } });
  var list = [];
  Object.keys(seen).forEach(function (k) {
    var q = seen[k], cv = inB(q[0], q[1], q[2]) ? gget(q[0], q[1], q[2]) : 0; if (!cv) return;
    var b = BLOCKS[cellBlock(cv)]; if (!/weighted_pressure_plate$/.test(b.java)) return;
    var n = projHolding(q[0], q[1], q[2]), lv = /heavy/.test(b.java) ? Math.min(15, Math.ceil(Math.min(n, 150) / 10)) : Math.min(15, n);
    var p = stateProps(b, cellOri(cv)); if (n) list.push(k);
    if (+p.power !== lv) { p.power = String(lv); beginBatch('Flechas: ' + b.name); editSet(q[0], q[1], q[2], mkCell(cellBlock(cv), stateIndex(b, p))); endBatch(); }
  });
  proj.wplates = list;
}
function projClear() {
  proj.stuck.forEach(function (S) { scene.remove(S.mesh); }); proj.stuck = [];
  projPlatesAll(); updateProjChip(); requestRender();
}

/* ---------- Ferramenta: prévia, aviso e teclas ---------- */
var projObj = null;
function projOrigin(cx, cy) { var r = rayFrom(cx, cy); return { o: r.o, d: r.d }; }
function projPreview() {
  if (projObj) { scene.remove(projObj); projObj.traverse(function (o) { if (o.geometry) o.geometry.dispose(); }); projObj = null; }
  if (tool !== 'throw' || walk || !hoverXY) return;
  var r = projOrigin(hoverXY[0], hoverXY[1]), path = projPath(r.o, r.d, proj.type), g = new THREE.Group();
  var pts = path.pts.slice(1).map(function (p) { return new THREE.Vector3(p[0], p[1], p[2]); });
  if (pts.length > 1) { var ln = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 0.5, gapSize: 0.35, depthTest: false, transparent: true, opacity: 0.85 })); ln.computeLineDistances(); ln.renderOrder = 9; g.add(ln); }
  if (path.hit) {
    var m = new THREE.Mesh(new THREE.BoxGeometry(1.03, 1.03, 1.03), new THREE.MeshBasicMaterial({ color: new THREE.Color(cssColor('--accent')), transparent: true, opacity: 0.3, depthTest: false }));
    m.position.set(path.hit.cell[0] + 0.5, path.hit.cell[1] + 0.5, path.hit.cell[2] + 0.5); m.renderOrder = 9; g.add(m);
    var dot = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false })); dot.position.set(path.hit.pt[0], path.hit.pt[1], path.hit.pt[2]); dot.renderOrder = 10; g.add(dot);
  }
  projObj = g; scene.add(g);
  var hb = path.hit && BLOCKS[cellBlock(gget(path.hit.cell[0], path.hit.cell[1], path.hit.cell[2]))];
  $('projHit').textContent = path.hit ? 'acerta ' + hb.name + ' em ' + (path.ticks / 20).toFixed(2).replace('.', ',') + ' s' : 'não acerta nada';
}
function updateProjChip() {
  var c = $('projChip'), on = tool === 'throw' && !walk;
  c.hidden = !on;
  if (!on) { if (projObj) projPreview(); return; }
  c.querySelectorAll('[data-pj]').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-pj') === proj.type); });
  var bow = proj.type === 'arrow' || proj.type === 'fire';
  $('projPowB').hidden = !bow; $('projPow').textContent = Math.round(proj.pow * 100) + '%';
  $('projClr').textContent = 'Recolher' + (proj.stuck.length ? ' (' + proj.stuck.length + ')' : '');
  projPreview();
}
$('projChip').addEventListener('click', function (e) {
  var b = e.target.closest('button'); if (!b) return;
  if (b.hasAttribute('data-pj')) { proj.type = b.getAttribute('data-pj'); projSave(); }
  else if (b.id === 'projMinus') { proj.pow = Math.max(0.25, proj.pow - 0.25); projSave(); }
  else if (b.id === 'projPlus') { proj.pow = Math.min(1, proj.pow + 0.25); projSave(); }
  else if (b.id === 'projClr') projClear();
  updateProjChip(); requestRender();
});
/* Clique com a ferramenta: lança do ponto de vista da câmera na direção do ponteiro */
function projPress(cx, cy) { var r = projOrigin(cx, cy); projThrow(r.o, r.d); }
/* Primeira pessoa: Q lança da altura dos olhos, na direção da mira */
function projWalkThrow() {
  if (!walk) return;
  var e = [walk.p[0], walk.p[1] + 1.62, walk.p[2]], d = walkDir();
  projThrow([e[0] + d[0] * 0.3, e[1] + d[1] * 0.3, e[2] + d[2] * 0.3], d);
}
function projKey(e, k) {
  if (tool !== 'throw' || walk || e.ctrlKey || e.metaKey || e.altKey) return false;
  var order = ['arrow', 'fire', 'trident', 'snowball', 'egg'];
  if (k >= '1' && k <= '5' && e.shiftKey) { proj.type = order[+k - 1]; projSave(); updateProjChip(); requestRender(); return true; }
  if (k === '-' || k === '=' || k === '+') { proj.pow = Math.max(0.25, Math.min(1, proj.pow + (k === '-' ? -0.25 : 0.25))); projSave(); updateProjChip(); requestRender(); toast('Força do arco: ' + Math.round(proj.pow * 100) + '%.', 1200); return true; }
  return false;
}
