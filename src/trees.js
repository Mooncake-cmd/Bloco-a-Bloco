/* ---------- Árvores: Usar numa muda faz a árvore crescer, como a farinha de osso ---------- */
/* Cada gerador imita o formato da árvore do jogo (tronco, copa, cipós, cacau, raízes), com variação aleatória a cada uso.
   Como no jogo: o tronco precisa de espaço livre, as folhas só ocupam o ar (ou plantinhas) e o bloco de grama embaixo do
   tronco vira terra. Carvalho-escuro e carvalho-pálido só crescem com 4 mudas em quadrado; abeto e selva crescem gigantes assim. */
var TREE_R = Math.random;
function tRnd(a, b) { return a + Math.floor(TREE_R() * (b - a + 1)); }
function tChance(p) { return TREE_R() < p; }
function cellOf(name, props) {
  var bi = BY_JAVA[name]; if (bi == null) return 0;
  var b = BLOCKS[bi];
  if (b.shape) return mkCell(bi, stateIndex(b, props || {}));
  if (b.ori && props && props[b.ori.k] != null) for (var i = 0; i < b.ori.o.length; i++) if (b.ori.o[i][0] === props[b.ori.k]) return mkCell(bi, i);
  return mkCell(bi);
}
/* Plantinhas que a árvore pode cobrir (só as de um bloco) */
var TREE_SOFT = { short_grass: 1, grass: 1, fern: 1, dead_bush: 1, snow: 1, vine: 1, moss_carpet: 1, pale_moss_carpet: 1, leaf_litter: 1, dandelion: 1, poppy: 1, short_dry_grass: 1 };
function treeFree(x, y, z, sap, log) {
  if (!inB(x, y, z)) return false;
  var v = gget(x, y, z); if (!v) return true;
  var j = BLOCKS[cellBlock(v)].java;
  return j === sap || j in TREE_SOFT || (log && /_leaves$|_wart_block$/.test(j)); // tronco e galhos atravessam folhas
}

/* Plano da árvore: mapa de células; o tronco tem prioridade sobre folhas */
function TreePlan(sap) { this.cells = new Map(); this.trunk = []; this.sap = sap; }
TreePlan.prototype.key = function (x, y, z) { return x + ',' + y + ',' + z; };
TreePlan.prototype.log = function (x, y, z, name, axis) {
  this.cells.set(this.key(x, y, z), { x: x, y: y, z: z, v: cellOf(name, { axis: axis || 'y' }), t: 1 });
  this.trunk.push([x, y, z]);
};
TreePlan.prototype.put = function (x, y, z, name, props, strong) {
  var k = this.key(x, y, z), o = this.cells.get(k);
  if (o && (o.t || !strong)) return;
  this.cells.set(k, { x: x, y: y, z: z, v: cellOf(name, props), t: 0 });
};
TreePlan.prototype.has = function (x, y, z) { return this.cells.has(this.key(x, y, z)); };
TreePlan.prototype.leaf = function (x, y, z, name) { this.put(x, y, z, name); };
/* Camada de folhas quadrada de raio r em volta de (cx, cz), com as quinas cortadas (sempre, ou ao acaso) */
TreePlan.prototype.layer = function (cx, y, cz, r, name, corners, wide) {
  var w = wide ? 1 : 0;
  for (var dx = -r; dx <= r + w; dx++) for (var dz = -r; dz <= r + w; dz++) {
    var ex = dx < 0 ? -dx : dx - w, ez = dz < 0 ? -dz : dz - w;
    if (r > 0 && ex === r && ez === r && (corners === 'cut' || (corners === 'rand' && tChance(0.5)))) continue;
    this.leaf(cx + dx, y, cz + dz, name);
  }
};
/* Camada redonda (disco) */
TreePlan.prototype.disk = function (cx, y, cz, r, name, wide, ragged) {
  var w = wide ? 0.5 : 0, R = Math.ceil(r) + 1;
  for (var dx = -R; dx <= R + 1; dx++) for (var dz = -R; dz <= R + 1; dz++) {
    var ddx = dx - w, ddz = dz - w, d = Math.sqrt(ddx * ddx + ddz * ddz);
    if (d > r + 0.3 || (ragged && d > r - 0.7 && tChance(ragged))) continue;
    this.leaf(cx + dx, y, cz + dz, name);
  }
};
TreePlan.prototype.trunkUp = function (x, y, z, h, name, wide) {
  for (var i = 0; i < h; i++) {
    this.log(x, y + i, z, name);
    if (wide) { this.log(x + 1, y + i, z, name); this.log(x, y + i, z + 1, name); this.log(x + 1, y + i, z + 1, name); }
  }
};
/* Galho de toras em linha reta (com o eixo certo) */
TreePlan.prototype.branch = function (x0, y0, z0, x1, y1, z1, name) {
  var n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0));
  for (var i = 1; i <= n; i++) {
    var x = Math.round(x0 + (x1 - x0) * i / n), y = Math.round(y0 + (y1 - y0) * i / n), z = Math.round(z0 + (z1 - z0) * i / n);
    var ax = Math.abs(x1 - x0), az = Math.abs(z1 - z0), ay = Math.abs(y1 - y0);
    this.log(x, y, z, name, ay >= ax && ay >= az ? 'y' : ax >= az ? 'x' : 'z');
  }
};

var DIRS4 = [[0, -1, 'north', 'south'], [1, 0, 'east', 'west'], [0, 1, 'south', 'north'], [-1, 0, 'west', 'east']];
/* Cipós pendurados nas bordas da copa (selva, pântano) */
function addVines(P, prob, maxLen) {
  var leaves = []; P.cells.forEach(function (c) { if (!c.t) leaves.push(c); });
  leaves.forEach(function (c) {
    DIRS4.forEach(function (d) {
      if (!tChance(prob)) return;
      var x = c.x + d[0], z = c.z + d[1];
      if (P.has(x, c.y, z)) return;
      var len = tRnd(1, maxLen), pr = {}; pr[d[3]] = 'true';
      for (var y = c.y; y > c.y - len; y--) { if (P.has(x, y, z)) break; P.put(x, y, z, 'vine', pr); }
    });
  });
}
/* Cipós e cacau no tronco */
function trunkDecor(P, x0, y0, z0, h, wide, vineProb, cocoaProb) {
  var w = wide ? 1 : 0;
  for (var y = y0; y < y0 + h; y++) for (var tx = 0; tx <= w; tx++) for (var tz = 0; tz <= w; tz++) {
    DIRS4.forEach(function (d) {
      var x = x0 + tx + d[0], z = z0 + tz + d[1];
      if (P.has(x, y, z)) return;
      if (tChance(cocoaProb) && y < y0 + 4) { P.put(x, y, z, 'cocoa', { facing: d[3], age: String(tRnd(0, 2)) }); return; }
      if (tChance(vineProb)) { var pr = {}; pr[d[3]] = 'true'; P.put(x, y, z, 'vine', pr); }
    });
  }
}
/* Copa de bolha (carvalho, bétula, selva pequena): 4 camadas, raio 2, 2, 1, 1 */
function blobCrown(P, x, top, z, leaves, r) {
  r = r || 2;
  for (var y = top - 3; y <= top; y++) {
    var rr = y >= top - 1 ? r - 1 : r;
    P.layer(x, y, z, rr, leaves, y === top ? 'cut' : 'rand');
  }
}
/* Aglomerado redondo de folhas (carvalho grande, galhos) */
function cluster(P, x, y, z, leaves, rs) {
  rs = rs || [2, 3, 3, 2];
  for (var i = 0; i < rs.length; i++) P.disk(x, y + i, z, rs[i] - 0.5, leaves, false, 0.25);
}

var TREES = {
  oak: function (P, x, y, z, big) {
    if (big || tChance(0.1)) return fancyTree(P, x, y, z, 'oak_log', 'oak_leaves');
    var h = tRnd(4, 6); P.trunkUp(x, y, z, h, 'oak_log'); blobCrown(P, x, y + h, z, 'oak_leaves');
  },
  birch: function (P, x, y, z, big) {
    var h = tRnd(5, 7) + (big ? tRnd(5, 7) : 0); P.trunkUp(x, y, z, h, 'birch_log'); blobCrown(P, x, y + h, z, 'birch_leaves');
  },
  spruce: function (P, x, y, z, big, wide) {
    if (wide) return megaSpruce(P, x, y, z);
    if (big) { // pinheiro: copa só no alto
      var hp = tRnd(7, 10); P.trunkUp(x, y, z, hp, 'spruce_log');
      P.leaf(x, y + hp, z, 'spruce_leaves'); P.layer(x, y + hp - 1, z, 1, 'spruce_leaves', 'cut');
      for (var yy = y + hp - 2; yy >= y + hp - 4; yy--) P.layer(x, yy, z, yy === y + hp - 3 ? 2 : 1, 'spruce_leaves', yy === y + hp - 3 ? 'cut' : 'rand');
      return;
    }
    var h = tRnd(6, 9), top = y + h, fh = h - tRnd(1, 2), maxR = tRnd(2, 3);
    P.trunkUp(x, y, z, h, 'spruce_log');
    var r = tRnd(0, 1), mr = 1, sr = 0;
    for (var yy = top; yy >= top - fh; yy--) {
      P.layer(x, yy, z, r, 'spruce_leaves', 'cut');
      if (r >= mr) { r = sr; sr = 1; mr = Math.min(mr + 1, maxR); } else r++;
    }
  },
  jungle: function (P, x, y, z, big, wide) {
    if (wide) return megaJungle(P, x, y, z);
    var h = tRnd(4, 10) + (big ? 4 : 0);
    P.trunkUp(x, y, z, h, 'jungle_log'); blobCrown(P, x, y + h, z, 'jungle_leaves');
    trunkDecor(P, x, y, z, h, false, 0.3, 0.12); addVines(P, 0.12, 3);
  },
  acacia: function (P, x, y, z) {
    var h = tRnd(5, 8), bend = tRnd(1, 3), d = DIRS4[tRnd(0, 3)], cx = x, cz = z;
    var straight = h - bend - 1;
    for (var i = 0; i < h; i++) {
      if (i >= straight && i < straight + bend) { cx += d[0]; cz += d[1]; }
      P.log(cx, y + i, cz, 'acacia_log');
    }
    acaciaCrown(P, cx, y + h - 1, cz);
    if (tChance(0.6)) { // segundo galho para outro lado
      var d2 = DIRS4[(DIRS4.indexOf(d) + tRnd(1, 3)) % 4], bx = x, bz = z, by = y + straight - tRnd(0, 1), n = tRnd(2, 3);
      for (var k = 1; k <= n; k++) { bx += d2[0]; bz += d2[1]; P.log(bx, by + k, bz, 'acacia_log'); }
      acaciaCrown(P, bx, by + n, bz, true);
    }
  },
  dark_oak: function (P, x, y, z, big, wide) {
    if (!wide) return 'need2';
    roofTree(P, x, y, z, 'dark_oak_log', 'dark_oak_leaves');
  },
  pale_oak: function (P, x, y, z, big, wide) {
    if (!wide) return 'need2';
    roofTree(P, x, y, z, 'pale_oak_log', 'pale_oak_leaves');
    var under = []; P.cells.forEach(function (c) { if (!c.t && !P.has(c.x, c.y - 1, c.z)) under.push(c); });
    under.forEach(function (c) {
      if (!tChance(0.25)) return;
      var n = tRnd(1, 3);
      for (var i = 1; i <= n; i++) if (!P.has(c.x, c.y - i, c.z)) P.put(c.x, c.y - i, c.z, 'pale_hanging_moss', { tip: i === n ? 'true' : 'false' });
    });
  },
  cherry: function (P, x, y, z) {
    var h = tRnd(4, 6); P.trunkUp(x, y, z, h, 'cherry_log');
    var d = DIRS4[tRnd(0, 3)], n = tRnd(2, 3);
    var ex = x + d[0] * n, ez = z + d[1] * n, ey = y + h - 1 + tRnd(1, 2);
    P.branch(x, y + h - 2, z, ex, ey, ez, 'cherry_log'); P.log(ex, ey, ez, 'cherry_log');
    cherryCrown(P, ex, ey + 1, ez);
    if (tChance(0.5)) {
      var d2 = DIRS4[(DIRS4.indexOf(d) + 2) % 4], m = tRnd(2, 3), fx = x + d2[0] * m, fz = z + d2[1] * m, fy = y + h - 2 + tRnd(0, 1);
      P.branch(x, y + h - 3, z, fx, fy, fz, 'cherry_log'); P.log(fx, fy, fz, 'cherry_log');
      cherryCrown(P, fx, fy + 1, fz);
    } else P.layer(x, y + h, z, 1, 'cherry_leaves', 'cut');
  },
  mangrove: function (P, x, y, z) {
    var h = tRnd(4, 7), base = y + tRnd(1, 2);
    P.trunkUp(x, base, z, h, 'mangrove_log');
    // raízes em arco até o chão
    DIRS4.forEach(function (d) {
      if (!tChance(0.8)) return;
      var rx = x, rz = z, ry = base, out = tRnd(1, 2);
      for (var i = 0; i < out; i++) { rx += d[0]; rz += d[1]; P.put(rx, ry, rz, 'mangrove_roots', null, true); }
      for (var yy = ry - 1; yy >= y - 1; yy--) P.put(rx, yy, rz, 'mangrove_roots', null, true);
    });
    for (var yy = base - 1; yy >= y; yy--) P.put(x, yy, z, 'mangrove_roots', null, true);
    var top = base + h;
    P.layer(x, top - 3, z, 2, 'mangrove_leaves', 'rand'); P.layer(x, top - 2, z, 3, 'mangrove_leaves', 'cut');
    P.layer(x, top - 1, z, 2, 'mangrove_leaves', 'rand'); P.layer(x, top, z, 1, 'mangrove_leaves', 'cut');
    var under = []; P.cells.forEach(function (c) { if (!c.t && c.y === top - 3 && !P.has(c.x, c.y - 1, c.z)) under.push(c); });
    under.forEach(function (c) { if (tChance(0.15)) P.put(c.x, c.y - 1, c.z, 'mangrove_propagule', { hanging: 'true', age: String(tRnd(0, 4)) }); });
    addVines(P, 0.05, 2);
  },
  azalea: function (P, x, y, z) {
    var h = tRnd(4, 5), d = DIRS4[tRnd(0, 3)], cx = x, cz = z;
    for (var i = 0; i < h; i++) { if (i === h - 1 && tChance(0.6)) { cx += d[0]; cz += d[1]; } P.log(cx, y + i, cz, 'oak_log'); }
    var top = y + h;
    var pick = function () { return tChance(0.3) ? 'flowering_azalea_leaves' : 'azalea_leaves'; };
    [[top - 2, 2], [top - 1, 2], [top, 1]].forEach(function (L) {
      for (var dx = -L[1]; dx <= L[1]; dx++) for (var dz = -L[1]; dz <= L[1]; dz++) {
        if (L[1] > 1 && Math.abs(dx) === L[1] && Math.abs(dz) === L[1]) continue;
        if (L[1] > 1 && (Math.abs(dx) === L[1] || Math.abs(dz) === L[1]) && tChance(0.2)) continue;
        P.leaf(cx + dx, L[0], cz + dz, pick());
      }
    });
    P.put(x, y - 1, z, 'rooted_dirt', null, true);
  },
  red_mushroom: function (P, x, y, z, big) {
    var h = tRnd(4, 6) * (big || tChance(1 / 12) ? 2 : 1) - (big ? 2 : 0);
    var stem = { up: 'false', down: 'false', north: 'true', south: 'true', east: 'true', west: 'true' };
    for (var i = 0; i < h; i++) P.cells.set(P.key(x, y + i, z), { x: x, y: y + i, z: z, v: cellOf('mushroom_stem', stem), t: 1 }), P.trunk.push([x, y + i, z]);
    P.layer(x, y + h, z, 1, 'red_mushroom_block');
    for (var yy = y + h - 3; yy < y + h; yy++)
      for (var dx = -2; dx <= 2; dx++) for (var dz = -2; dz <= 2; dz++) {
        if ((Math.abs(dx) === 2 || Math.abs(dz) === 2) && !(Math.abs(dx) === 2 && Math.abs(dz) === 2)) P.leaf(x + dx, yy, z + dz, 'red_mushroom_block');
      }
  },
  brown_mushroom: function (P, x, y, z, big) {
    var h = tRnd(4, 6) * (big || tChance(1 / 12) ? 2 : 1) - (big ? 2 : 0);
    var stem = { up: 'false', down: 'false', north: 'true', south: 'true', east: 'true', west: 'true' };
    for (var i = 0; i < h; i++) P.cells.set(P.key(x, y + i, z), { x: x, y: y + i, z: z, v: cellOf('mushroom_stem', stem), t: 1 }), P.trunk.push([x, y + i, z]);
    P.layer(x, y + h, z, 3, 'brown_mushroom_block', 'cut');
  },
  crimson_fungus: function (P, x, y, z, big) { hugeFungus(P, x, y, z, big, 'crimson_stem', 'nether_wart_block', true); },
  warped_fungus: function (P, x, y, z, big) { hugeFungus(P, x, y, z, big, 'warped_stem', 'warped_wart_block', false); }
};
function fancyTree(P, x, y, z, log, leaves) {
  var h = tRnd(8, 13); P.trunkUp(x, y, z, h, log);
  cluster(P, x, y + h - 2, z, leaves, [2, 3, 3, 2]);
  var n = tRnd(3, 5), a0 = TREE_R() * Math.PI * 2;
  for (var i = 0; i < n; i++) {
    var a = a0 + i * (Math.PI * 2 / n) + (TREE_R() - 0.5) * 0.8, len = tRnd(2, 4);
    var by = y + Math.floor(h * (0.45 + 0.4 * TREE_R())), ex = x + Math.round(Math.cos(a) * len), ez = z + Math.round(Math.sin(a) * len), ey = by + tRnd(1, 2);
    P.branch(x, by, z, ex, ey, ez, log);
    cluster(P, ex, ey, ez, leaves, [2, 3, 2]);
  }
}
function megaSpruce(P, x, y, z) {
  var h = tRnd(14, 22), top = y + h, fh = tRnd(8, 12);
  P.trunkUp(x, y, z, h, 'spruce_log', true);
  for (var yy = top + 1; yy >= top - fh; yy--) {
    var dep = top + 1 - yy, r = Math.min(4, Math.floor(dep / 2.2) + (dep % 2 ? 0.5 : 0));
    P.disk(x, yy, z, r + 0.5, 'spruce_leaves', true);
  }
}
function megaJungle(P, x, y, z) {
  var h = tRnd(12, 20), top = y + h;
  P.trunkUp(x, y, z, h, 'jungle_log', true);
  P.disk(x, top - 1, z, 3.5, 'jungle_leaves', true, 0.3); P.disk(x, top, z, 3, 'jungle_leaves', true, 0.3); P.disk(x, top + 1, z, 2, 'jungle_leaves', true);
  for (var b = 0; b < tRnd(2, 4); b++) {
    var d = DIRS4[tRnd(0, 3)], by = y + tRnd(Math.floor(h * 0.4), h - 4), len = tRnd(2, 3);
    var sx = x + (d[0] > 0 ? 1 : 0), sz = z + (d[1] > 0 ? 1 : 0), ex = sx + d[0] * len, ez = sz + d[1] * len;
    P.branch(sx, by, sz, ex, by + 1, ez, 'jungle_log');
    P.disk(ex, by + 1, ez, 2, 'jungle_leaves', false, 0.3); P.disk(ex, by + 2, ez, 1.5, 'jungle_leaves');
  }
  trunkDecor(P, x, y, z, h, true, 0.35, 0.05); addVines(P, 0.1, 4);
}
function roofTree(P, x, y, z, log, leaves) {
  var h = tRnd(6, 8), top = y + h;
  P.trunkUp(x, y, z, h, log, true);
  P.disk(x, top - 2, z, 3.5, leaves, true, 0.35);
  P.disk(x, top - 1, z, 3.5, leaves, true, 0.2);
  P.disk(x, top, z, 2.6, leaves, true);
  // galhos curtos saindo do tronco por baixo da copa
  DIRS4.forEach(function (d) {
    if (!tChance(0.5)) return;
    var bx = x + (d[0] > 0 ? 2 : d[0] < 0 ? -1 : tRnd(0, 1)), bz = z + (d[1] > 0 ? 2 : d[1] < 0 ? -1 : tRnd(0, 1)), by = top - tRnd(3, 4);
    P.log(bx, by, bz, log, d[0] ? 'x' : 'z'); P.log(bx, by + 1, bz, log);
    P.layer(bx, by + 2, bz, 1, leaves, 'rand');
  });
}
function acaciaCrown(P, x, y, z, small) {
  var r = small ? 2 : 3;
  P.layer(x, y, z, r, 'acacia_leaves', 'cut');
  for (var dx = -r; dx <= r; dx++) for (var dz = -r; dz <= r; dz++) {
    var q = P.cells.get(P.key(x + dx, y, z + dz));
    if (q && !q.t && Math.abs(dx) + Math.abs(dz) > r + 1) P.cells.delete(P.key(x + dx, y, z + dz));
  }
  P.layer(x, y + 1, z, r - 1, 'acacia_leaves', 'cut');
}
function cherryCrown(P, x, y, z) {
  var rs = [[-1, 3], [0, 4], [1, 4], [2, 3], [3, 2]];
  rs.forEach(function (L) { P.disk(x, y + L[0], z, L[1] - 0.4, 'cherry_leaves', false, 0.3); });
  var low = []; P.cells.forEach(function (c) { if (!c.t && c.y === y - 1 && !P.has(c.x, c.y - 1, c.z)) low.push(c); });
  low.forEach(function (c) { if (tChance(0.25)) P.leaf(c.x, c.y - 1, c.z, 'cherry_leaves'); });
}
function hugeFungus(P, x, y, z, big, stem, wart, vines) {
  var h = tRnd(4, 9) * (big ? 2 : 1);
  P.trunkUp(x, y, z, h, stem);
  var top = y + h, capH = Math.min(h, tRnd(3, 4));
  for (var yy = top - capH; yy <= top; yy++) {
    var r = yy === top ? 1 : 2;
    for (var dx = -r; dx <= r; dx++) for (var dz = -r; dz <= r; dz++) {
      var edge = Math.abs(dx) === r || Math.abs(dz) === r, corner = Math.abs(dx) === r && Math.abs(dz) === r;
      if (yy === top - capH && !edge) continue;
      if (corner && tChance(0.6)) continue;
      if (yy === top - capH && tChance(0.3)) continue;
      P.leaf(x + dx, yy, z + dz, !edge && yy < top && tChance(0.15) ? 'shroomlight' : wart);
    }
  }
  if (vines) {
    var low = []; P.cells.forEach(function (c) { if (!c.t && !P.has(c.x, c.y - 1, c.z)) low.push(c); });
    low.forEach(function (c) {
      if (!tChance(0.2)) return;
      var n = tRnd(1, 3);
      for (var i = 1; i <= n; i++) if (!P.has(c.x, c.y - i, c.z)) P.put(c.x, c.y - i, c.z, i === n ? 'weeping_vines' : 'weeping_vines_plant', i === n ? { age: String(tRnd(0, 25)) } : null);
    });
  }
}

/* Muda (id java) -> tipo de árvore */
var SAPLINGS = {
  oak_sapling: 'oak', birch_sapling: 'birch', spruce_sapling: 'spruce', jungle_sapling: 'jungle', acacia_sapling: 'acacia',
  dark_oak_sapling: 'dark_oak', pale_oak_sapling: 'pale_oak', cherry_sapling: 'cherry', mangrove_propagule: 'mangrove',
  azalea: 'azalea', flowering_azalea: 'azalea', red_mushroom: 'red_mushroom', brown_mushroom: 'brown_mushroom',
  crimson_fungus: 'crimson_fungus', warped_fungus: 'warped_fungus'
};
var TREE_NAMES = { oak: 'Carvalho', birch: 'Bétula', spruce: 'Abeto', jungle: 'Árvore da selva', acacia: 'Acácia', dark_oak: 'Carvalho-escuro', pale_oak: 'Carvalho-pálido',
  cherry: 'Cerejeira', mangrove: 'Mangue', azalea: 'Azaleia', red_mushroom: 'Cogumelo vermelho gigante', brown_mushroom: 'Cogumelo marrom gigante',
  crimson_fungus: 'Fungo carmesim gigante', warped_fungus: 'Fungo distorcido gigante' };
/* 4 mudas iguais em quadrado: devolve o canto mínimo */
function saplingSquare(c, bi) {
  for (var ox = -1; ox <= 0; ox++) for (var oz = -1; oz <= 0; oz++) {
    var ok = true;
    for (var i = 0; i < 2 && ok; i++) for (var k = 0; k < 2 && ok; k++) {
      var x = c[0] + ox + i, z = c[2] + oz + k;
      ok = inB(x, c[1], z) && cellBlock(gget(x, c[1], z)) === bi && gget(x, c[1], z) !== 0;
    }
    if (ok) return [c[0] + ox, c[1], c[2] + oz];
  }
  return null;
}
/* Usar numa muda: faz crescer. Com Shift, a versão grande (carvalho grande, bétula alta, pinheiro, cogumelo alto…). Devolve true se tratou. */
/* Faz a árvore crescer a partir da muda em c, gravando com editSet (sem abrir passo de histórico nem avisar).
   Devolve null se o bloco não é muda; senão { kind, sq, n, out } ou { err: 'need2' | 'tall' | 'blocked', ... }. */
function treeGrow(c, big) {
  var v = gget(c[0], c[1], c[2]), bi = cellBlock(v), b = BLOCKS[bi], kind = SAPLINGS[b.java];
  if (!kind) return null;
  if (b.java === 'mangrove_propagule' && stateProps(b, cellOri(v)).hanging === 'true') return { err: 'hanging' };
  var sq = (kind === 'spruce' || kind === 'jungle' || kind === 'dark_oak' || kind === 'pale_oak') ? saplingSquare(c, bi) : null;
  var o = sq || c, P = new TreePlan(b.java);
  var r = TREES[kind](P, o[0], o[1], o[2], big, !!sq);
  if (r === 'need2') return { err: 'need2', kind: kind };
  // o tronco precisa de espaço (as mudas do quadrado contam como livres)
  var top = 0, blocked = null;
  P.trunk.forEach(function (t) { if (t[1] > top) top = t[1]; if (!blocked && inB(t[0], 0, t[2]) && t[1] < SY && !treeFree(t[0], t[1], t[2], b.java, true)) blocked = t; });
  if (top >= SY) return { err: 'tall', need: top - o[1] + 1 };
  if (blocked) return { err: 'blocked', at: blocked };
  var n = 0, out = 0;
  P.cells.forEach(function (q) {
    if (!inB(q.x, q.y, q.z)) { out++; return; }
    if (!q.t && !treeFree(q.x, q.y, q.z, b.java)) {
      // raízes e terra enraizada entram na terra
      var cur = gget(q.x, q.y, q.z), j = cur && BLOCKS[cellBlock(cur)].java;
      if (!(/mangrove_roots|rooted_dirt/.test(BLOCKS[cellBlock(q.v)].java) && /^(dirt|grass_block|mud|coarse_dirt|podzol|rooted_dirt|moss_block)$/.test(j))) return;
    }
    if (q.v) { editSet(q.x, q.y, q.z, q.v); n++; }
  });
  // como no jogo, a grama embaixo do tronco vira terra
  P.trunk.forEach(function (t) {
    if (t[1] - 1 < 0 || P.has(t[0], t[1] - 1, t[2])) return;
    var u = gget(t[0], t[1] - 1, t[2]);
    if (u && /^(grass_block|podzol|mycelium)$/.test(BLOCKS[cellBlock(u)].java)) editSet(t[0], t[1] - 1, t[2], cellOf('dirt'));
  });
  // mudas do quadrado que sobraram (fora do tronco) somem
  if (sq) for (var i = 0; i < 2; i++) for (var k = 0; k < 2; k++) if (cellBlock(gget(sq[0] + i, sq[1], sq[2] + k)) === bi) editSet(sq[0] + i, sq[1], sq[2] + k, 0);
  return { kind: kind, sq: sq, n: n, out: out };
}
function growAt(c, big) {
  var v = gget(c[0], c[1], c[2]);
  if (!SAPLINGS[BLOCKS[cellBlock(v)].java]) return false;
  beginBatch('Árvore');
  var r = treeGrow(c, big);
  endBatch();
  if (r.err === 'hanging') toast('O propágulo pendurado não cresce: coloque-o no chão para virar um mangue.');
  else if (r.err === 'need2') toast(TREE_NAMES[r.kind] + ' só cresce com 4 mudas em quadrado 2 × 2, como no jogo.');
  else if (r.err === 'tall') toast('Falta altura no espaço: esta árvore precisa de ' + r.need + ' blocos acima da muda. Aumente a altura em Projeto > Tamanho do espaço.', 6000);
  else if (r.err === 'blocked') toast('Sem espaço para a árvore crescer: há um bloco em ' + r.at.join(', ') + ' no caminho do tronco.', 5000);
  else toast(TREE_NAMES[r.kind] + (r.sq && (r.kind === 'spruce' || r.kind === 'jungle') ? ' gigante' : big ? ' (versão grande)' : '') + ' cresceu: ' + r.n + ' blocos' + (r.out ? ' (' + r.out + ' ficaram fora do espaço)' : '') + '. Ctrl+Z desfaz; usar de novo depois de desfazer dá outra forma.', 5000);
  return true;
}
