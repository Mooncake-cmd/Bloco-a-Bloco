/* ---------- Formas: blocos que não são cubos inteiros ---------- */
/* Os dados (data/shapes.json) vêm compactados em gzip + base64 e são abertos ao iniciar. Cada forma é desenhada a partir
   do modelo Java do estado: propriedades guardadas na célula (direção, metade, aberta...), calculadas pelos vizinhos
   (conexões de cerca, muro, vidraça, redstone, formato da escada, baú duplo) ou fixas no padrão. */
var SHAPES_GZ = '%%SHAPES%%';
var SH = null;
var DIRS = ['up', 'down', 'north', 'south', 'east', 'west'];
var DV = { up: [0, 1, 0], down: [0, -1, 0], north: [0, 0, -1], south: [0, 0, 1], east: [1, 0, 0], west: [-1, 0, 0] };
var BED_COLORS = ['white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray', 'light_gray', 'cyan', 'purple', 'blue', 'brown', 'green', 'red', 'black'];
var CW = { north: 'east', east: 'south', south: 'west', west: 'north' }, CCW = { north: 'west', west: 'south', south: 'east', east: 'north' };

async function loadShapes() {
  var bin = Uint8Array.from(atob(SHAPES_GZ), function (c) { return c.charCodeAt(0); });
  var txt = await new Response(new Blob([bin]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
  SH = JSON.parse(txt);
  var base = BLOCKS.length;
  SH.blocks.forEach(function (d, i) {
    var avg = SH.texAvg[d.pt] || [128, 128, 128];
    if (d.ti) avg = [avg[0] * (d.tint >> 16 & 255) / 255, avg[1] * (d.tint >> 8 & 255) / 255, avg[2] * (d.tint & 255) / 255].map(Math.round);
    var b = { java: d.n, name: d.d, bedrock: d.n, top: avg, side: avg, bottom: avg, kind: d.k, glass: false, solid: false,
      shape: d, jt: d.t, bt: d.t.map(function (t) { return SH.beTex[t] ? '@' + SH.beTex[t] : null; }), tint: [], ori: null, bst: null,
      tile: d.t.map(function () { return -1; }), icon: '', hide: !!d.hide, bo: !!d.bo };
    b.texIdx = {}; d.t.forEach(function (t, k) { b.texIdx[t] = k; });
    b.ptIdx = d.pt in b.texIdx ? b.texIdx[d.pt] : 0;
    // propriedades guardadas na célula: base mista na ordem de d.p
    b.sp = d.p.filter(function (p) { return p[2] === 's'; });
    b.defs = {}; d.p.forEach(function (p) { b.defs[p[0]] = p[1][Math.max(0, p[3])]; });
    BLOCKS.push(b); BY_JAVA[d.n] = base + i;
  });
  BLOCKS.forEach(function (b) {
    if (!b.shape) return;
    if (b.shape.wall) b.wallBi = BY_JAVA[b.shape.wall];
    b.cat = catOf(b); b.hay = (b.java + ' ' + b.name).toLowerCase();
  });
}

/* Estado guardado <-> propriedades */
function stateProps(b, s) {
  var o = {};
  for (var i = 0; i < b.sp.length; i++) { var p = b.sp[i], n = p[1].length; o[p[0]] = p[1][s % n]; s = Math.floor(s / n); }
  return o;
}
function stateIndex(b, props) {
  var s = 0, m = 1;
  for (var i = 0; i < b.sp.length; i++) {
    var p = b.sp[i], k = p[1].indexOf(props[p[0]] != null ? props[p[0]] : b.defs[p[0]]);
    s += Math.max(0, k) * m; m *= p[1].length;
  }
  return s;
}
function defaultState(b) { return stateIndex(b, {}); }

/* Vizinhos */
function blockAt(x, y, z) {
  if (x < 0 || y < 0 || z < 0 || x >= SX || y >= SY || z >= SZ) return null;
  var v = grid[(y * SZ + z) * SX + x]; if (!v) return null;
  return { b: BLOCKS[cellBlock(v)], s: cellOri(v), v: v };
}
var NOT_STURDY = /leaves|pumpkin|melon|jack_o_lantern|shulker_box/;
function sturdy(n) { return n && !n.b.shape && !NOT_STURDY.test(n.b.java); }
function isWire(n) { return n && n.b.java === 'redstone_wire'; }
var REDSTONE_PART = /^(redstone_wire|redstone_torch|redstone_wall_torch|redstone_block|lever|.*_button|.*_pressure_plate|target|daylight_detector|observer|repeater|comparator|trapped_chest|lectern|sculk_sensor|calibrated_sculk_sensor|tripwire_hook|lightning_rod)$/;
function propOf(n, p) { return n.b.shape ? stateProps(n.b, n.s)[p] : null; }

/* Todas as propriedades Java da célula: guardadas, calculadas pelos vizinhos e padrão */
function fullProps(b, s, x, y, z) {
  var o = {}, d = b.shape, k;
  for (k in b.defs) o[k] = b.defs[k];
  var st = stateProps(b, s); for (k in st) o[k] = st[k];
  var fam = d.fam;
  if (!fam && !/tripwire_hook/.test(b.java)) return o;
  var H = ['north', 'east', 'south', 'west'];
  var nb = function (dir, dy) { var v = DV[dir]; return blockAt(x + v[0], y + (dy || 0) + v[1], z + v[2]); };
  if (fam === 'fence') {
    var wood = /^(?!nether_brick).*_fence$/.test(b.java);
    H.forEach(function (h) {
      var n = nb(h), c = false;
      if (n) {
        if (/_fence$/.test(n.b.java)) c = n.b.java === b.java || (wood && !/nether_brick/.test(n.b.java));
        else if (/_fence_gate$/.test(n.b.java)) { var f = propOf(n, 'facing'); c = f !== h && f !== OPP[h]; }
        else c = sturdy(n);
      }
      o[h] = c ? 'true' : 'false';
    });
  } else if (fam === 'pane' || fam === 'wall') {
    var above = nb('up'), conn = {};
    H.forEach(function (h) {
      var n = nb(h), c = false;
      if (n) {
        var nf = n.b.shape && n.b.shape.fam;
        if (nf === 'pane' || nf === 'wall') c = true;
        else if (/_fence_gate$/.test(n.b.java)) { var f = propOf(n, 'facing'); c = f !== h && f !== OPP[h]; }
        else c = sturdy(n);
      }
      conn[h] = c;
      if (fam === 'pane') o[h] = c ? 'true' : 'false';
      else o[h] = !c ? 'none' : (above && (sturdy(above) || (above.b.shape && above.b.shape.fam === 'wall'))) ? 'tall' : 'low';
    });
    if (fam === 'wall') {
      var straight = (conn.north && conn.south && !conn.east && !conn.west) || (conn.east && conn.west && !conn.north && !conn.south);
      o.up = straight && !(above && above.b.shape && above.b.shape.fam === 'wall' && propOf(above, 'up') === 'true') ? 'false' : 'true';
    }
  } else if (fam === 'gate') {
    var ax = o.facing === 'north' || o.facing === 'south' ? ['east', 'west'] : ['north', 'south'];
    o.in_wall = ax.some(function (h) { var n = nb(h); return n && n.b.shape && n.b.shape.fam === 'wall'; }) ? 'true' : 'false';
  } else if (fam === 'wire') {
    var up = nb('up'), solidUp = sturdy(up), cnt = 0;
    H.forEach(function (h) {
      var n = nb(h), r = 'none';
      if (n && REDSTONE_PART.test(n.b.java)) {
        if (/^(repeater|comparator)$/.test(n.b.java)) { var f = propOf(n, 'facing'); r = f === h || f === OPP[h] ? 'side' : 'none'; }
        else if (n.b.java === 'observer') r = 'side';
        else r = 'side';
      }
      if (r === 'none' && !solidUp && sturdy(n) && isWire(nb(h, 1))) r = 'up';
      if (r === 'none' && !sturdy(n) && isWire(nb(h, -1))) r = 'side';
      o[h] = r; if (r !== 'none') cnt++;
    });
    // sem conexão vira cruz; com uma só, a linha atravessa o bloco
    if (!cnt) H.forEach(function (h) { o[h] = 'side'; });
    else if (cnt === 1) H.forEach(function (h) { if (o[h] !== 'none' && o[OPP[h]] === 'none') o[OPP[h]] = 'side'; });
    o.power = '0';
  } else if (fam === 'stairs') {
    o.shape = stairShape(o, x, y, z);
  } else if (fam === 'chest') {
    var same = function (h) { var n = nb(h); return n && n.b === b && propOf(n, 'facing') === o.facing; };
    o.type = same(CW[o.facing]) ? 'left' : same(CCW[o.facing]) ? 'right' : 'single';
  } else if (fam === 'tripwire') {
    H.forEach(function (h) { var n = nb(h); o[h] = n && (n.b.java === 'tripwire' || n.b.java === 'tripwire_hook') ? 'true' : 'false'; });
  } else if (fam === 'chorus') {
    DIRS.forEach(function (h) { var n = nb(h); o[h] = n && (/^chorus_(plant|flower)$/.test(n.b.java) || (h === 'down' && n.b.java === 'end_stone')) ? 'true' : 'false'; });
  }
  if (b.java === 'tripwire_hook') { var w = nb(o.facing); o.attached = w && w.b.java === 'tripwire' ? 'true' : 'false'; }
  return o;
}
function isStairs(n) { return n && n.b.shape && n.b.shape.fam === 'stairs'; }
function stairShape(o, x, y, z) {
  var f = o.facing, h = o.half;
  var at = function (dir) { var v = DV[dir]; return blockAt(x + v[0], y, z + v[2]); };
  var sp = function (n) { return stateProps(n.b, n.s); };
  var canTake = function (dir) { var n = at(dir); if (!isStairs(n)) return true; var p = sp(n); return p.facing !== f || p.half !== h; };
  var axis = function (d) { return d === 'north' || d === 'south' ? 'z' : 'x'; };
  var back = at(f);
  if (isStairs(back) && sp(back).half === h) {
    var d2 = sp(back).facing;
    if (axis(d2) !== axis(f) && canTake(OPP[d2])) return d2 === CCW[f] ? 'outer_left' : 'outer_right';
  }
  var front = at(OPP[f]);
  if (isStairs(front) && sp(front).half === h) {
    var d3 = sp(front).facing;
    if (axis(d3) !== axis(f) && canTake(d3)) return d3 === CCW[f] ? 'inner_left' : 'inner_right';
  }
  return 'straight';
}

/* Modelo do estado: variantes ou multipart do blockstate Java */
function matchWhen(w, o) {
  if (!w) return true;
  if (w.OR) return w.OR.some(function (c) { return matchWhen(c, o); });
  if (w.AND) return w.AND.every(function (c) { return matchWhen(c, o); });
  for (var k in w) if (String(w[k]).split('|').indexOf(o[k]) < 0) return false;
  return true;
}
function appliedModels(b, o) {
  var st = SH.states[b.java], out = [];
  if (st.variants) {
    for (var k in st.variants) {
      var ok = !k || k.split(',').every(function (pv) { var a = pv.split('='); return o[a[0]] === a[1]; });
      if (ok) { var v = st.variants[k]; out.push(Array.isArray(v) ? v[0] : v); break; }
    }
  } else st.multipart.forEach(function (p) { if (matchWhen(p.when, o)) { var a = p.apply; out.push(Array.isArray(a) ? a[0] : a); } });
  return out;
}
var modelCache = {};
function cleanModel(n) { return n.indexOf('bab:') === 0 ? n : n.replace('minecraft:', '').replace(/^block\//, ''); }
function resolveModel(n) {
  n = cleanModel(n);
  if (modelCache[n]) return modelCache[n];
  var tex = {}, el = null, m = SH.models[n], g = 0;
  while (m && g++ < 20) {
    for (var k in (m.textures || {})) if (!(k in tex)) tex[k] = m.textures[k];
    if (!el && m.elements) el = m.elements;
    m = m.parent ? SH.models[cleanModel(m.parent)] : null;
  }
  var res = function (v) { for (var i = 0; i < 10 && v && v.charAt(0) === '#'; i++) v = tex[v.slice(1)]; return v && v.charAt(0) !== '#' ? v.replace('minecraft:', '').replace(/^block\//, '') : null; };
  return (modelCache[n] = { el: el || [], res: res });
}

/* Geometria: quads em coordenadas do bloco (0..1), uv em 0..16, índice da textura, face de descarte e se recebe tinta */
function rotX(p, c, s) { var y = p[1] - 0.5, z = p[2] - 0.5; return [p[0], 0.5 + y * c - z * s, 0.5 + y * s + z * c]; }
function rotY(p, c, s) { var x = p[0] - 0.5, z = p[2] - 0.5; return [0.5 + x * c + z * s, p[1], 0.5 - x * s + z * c]; }
function rotDir(d, x, y) {
  var v = DV[d].slice(), i;
  for (i = 0; i < ((x || 0) / 90) % 4; i++) v = [v[0], v[2], -v[1]].map(function (q) { return q || 0; });
  for (i = 0; i < ((y || 0) / 90) % 4; i++) v = [-v[2], v[1], v[0]].map(function (q) { return q || 0; });
  for (var k in DV) if (DV[k][0] === v[0] && DV[k][1] === v[1] && DV[k][2] === v[2]) return k;
  return d;
}
function faceCorners(d, a, b) { // a = from, b = to (0..1); ordem: alto-esquerda, alto-direita, baixo-direita, baixo-esquerda
  var x1 = a[0], y1 = a[1], z1 = a[2], x2 = b[0], y2 = b[1], z2 = b[2];
  switch (d) {
    case 'north': return [[x2, y2, z1], [x1, y2, z1], [x1, y1, z1], [x2, y1, z1]];
    case 'south': return [[x1, y2, z2], [x2, y2, z2], [x2, y1, z2], [x1, y1, z2]];
    case 'east': return [[x2, y2, z2], [x2, y2, z1], [x2, y1, z1], [x2, y1, z2]];
    case 'west': return [[x1, y2, z1], [x1, y2, z2], [x1, y1, z2], [x1, y1, z1]];
    case 'up': return [[x1, y2, z1], [x2, y2, z1], [x2, y2, z2], [x1, y2, z2]];
    default: return [[x1, y1, z2], [x2, y1, z2], [x2, y1, z1], [x1, y1, z1]];
  }
}
function defaultUV(d, f, t) {
  switch (d) {
    case 'down': return [f[0], 16 - t[2], t[0], 16 - f[2]];
    case 'up': return [f[0], f[2], t[0], t[2]];
    case 'north': return [16 - t[0], 16 - t[1], 16 - f[0], 16 - f[1]];
    case 'south': return [f[0], 16 - t[1], t[0], 16 - f[1]];
    case 'west': return [f[2], 16 - t[1], t[2], 16 - f[1]];
    default: return [16 - t[2], 16 - t[1], 16 - f[2], 16 - f[1]];
  }
}
var geomCache = new Map();
function shapeGeom(b, o) {
  var key = b.java + JSON.stringify(o);
  var g = geomCache.get(key); if (g) return g;
  g = [];
  appliedModels(b, o).forEach(function (ap) {
    var mdl = resolveModel(ap.model), ax = ap.x || 0, ay = ap.y || 0, yf = ap.yf || 0;
    var cx = Math.cos(-ax * Math.PI / 180), sx = Math.sin(-ax * Math.PI / 180);
    var cy = Math.cos(-(ay + yf) * Math.PI / 180), sy = Math.sin(-(ay + yf) * Math.PI / 180);
    mdl.el.forEach(function (e) {
      var f = e.from, t = e.to, A = [f[0] / 16, f[1] / 16, f[2] / 16], B = [t[0] / 16, t[1] / 16, t[2] / 16], R = e.rotation;
      for (var d in e.faces) {
        var fc = e.faces[d], tn = mdl.res(fc.texture);
        if (tn && b.shape.tm && b.shape.tm[tn]) tn = b.shape.tm[tn]; // blocos só do Bedrock: mesma forma, outra textura
        if (!tn || !(tn in b.texIdx)) continue;
        var pts = faceCorners(d, A, B);
        if (R && R.angle) {
          var an = R.angle * Math.PI / 180, ca = Math.cos(an), sa = Math.sin(an), og = [R.origin[0] / 16, R.origin[1] / 16, R.origin[2] / 16];
          var sc = R.rescale ? 1 / Math.cos(Math.abs(an)) : 1;
          pts = pts.map(function (p) {
            var q = [p[0] - og[0], p[1] - og[1], p[2] - og[2]], r;
            if (R.axis === 'x') r = [q[0], q[1] * ca - q[2] * sa, q[1] * sa + q[2] * ca];
            else if (R.axis === 'y') r = [q[0] * ca + q[2] * sa, q[1], -q[0] * sa + q[2] * ca];
            else r = [q[0] * ca - q[1] * sa, q[0] * sa + q[1] * ca, q[2]];
            if (R.rescale) { if (R.axis !== 'x') r[0] *= sc; if (R.axis !== 'y') r[1] *= sc; if (R.axis !== 'z') r[2] *= sc; }
            return [r[0] + og[0], r[1] + og[1], r[2] + og[2]];
          });
        }
        // rotação do blockstate: x (para baixo, como no jogo) e depois y
        pts = pts.map(function (p) { if (ax) p = rotX(p, cx, sx); if (ay || yf) p = rotY(p, cy, sy); return p; });
        var uv = fc.uv || defaultUV(d, f, t), rr = ((fc.rotation || 0) / 90) % 4;
        var cs = [[uv[0], uv[1]], [uv[2], uv[1]], [uv[2], uv[3]], [uv[0], uv[3]]];
        var uvs = [0, 1, 2, 3].map(function (i) { return cs[(i + 4 - rr) % 4]; });
        var u1 = [pts[1][0] - pts[0][0], pts[1][1] - pts[0][1], pts[1][2] - pts[0][2]], u2 = [pts[3][0] - pts[0][0], pts[3][1] - pts[0][1], pts[3][2] - pts[0][2]];
        var nn = [u2[1] * u1[2] - u2[2] * u1[1], u2[2] * u1[0] - u2[0] * u1[2], u2[0] * u1[1] - u2[1] * u1[0]], ln = Math.hypot(nn[0], nn[1], nn[2]) || 1;
        nn = [nn[0] / ln, nn[1] / ln, nn[2] / ln];
        var sh = e.shade === false ? 1 : nn[0] * nn[0] * 0.8 + nn[1] * nn[1] * (nn[1] > 0 ? 1 : 0.55) + nn[2] * nn[2] * 0.9;
        g.push({ p: pts, uv: uvs, ti: b.texIdx[tn], cull: fc.cullface ? rotDir(fc.cullface === 'bottom' ? 'down' : fc.cullface, ax, ay) : null, sh: sh, tint: fc.tintindex != null && fc.tintindex >= 0, ov: /_overlay$/.test(tn) });
      }
    });
  });
  geomCache.set(key, g);
  return g;
}

/* Malha: chamado por buildChunk para cada célula com forma */
/* Água e lava: altura pelo nível (fonte 8/9, corrente (8 - nível)/9, coluna caindo cheia) e faces escondidas
   entre células do mesmo fluido, como no jogo */
function fluidH(b, s) { var lv = +stateProps(b, s).level; return lv === 0 || lv >= 8 ? 8 / 9 : (8 - lv) / 9; }
function fluidGeom(b, s, x, y, z) {
  var same = function (dx, dy, dz) { var n = blockAt(x + dx, y + dy, z + dz); return n && n.b === b ? n : null; };
  var hOf = function (n, dx, dz) { return same(dx, 1, dz) ? 1 : fluidH(b, n.s); };
  var h = same(0, 1, 0) ? 1 : fluidH(b, s), g = [], tint = b.java === 'water';
  var add = function (d, A, B, sh) {
    var f = [A[0] * 16, A[1] * 16, A[2] * 16], t = [B[0] * 16, B[1] * 16, B[2] * 16], uv = defaultUV(d, f, t);
    g.push({ p: faceCorners(d, A, B), uv: [[uv[0], uv[1]], [uv[2], uv[1]], [uv[2], uv[3]], [uv[0], uv[3]]], ti: 0, cull: null, sh: sh, tint: tint, ov: false });
  };
  if (h < 1) add('up', [0, 0, 0], [1, h, 1], 1);
  var dn = blockAt(x, y - 1, z);
  if (!(dn && (dn.b === b || dn.b.solid))) add('down', [0, 0, 0], [1, h, 1], 0.55);
  [['north', 0, -1, 0.9], ['south', 0, 1, 0.9], ['east', 1, 0, 0.8], ['west', -1, 0, 0.8]].forEach(function (q) {
    var n = blockAt(x + q[1], y, z + q[2]), lo = 0;
    if (n) { if (n.b.solid) return; if (n.b === b) { lo = hOf(n, q[1], q[2]); if (lo >= h) return; } }
    add(q[0], [0, lo, 0], [1, h, 1], q[3]);
  });
  return g;
}
function emitShape(b, s, x, y, z, O, C, G) {
  var o = fullProps(b, s, x, y, z), g = b.java === 'water' || b.java === 'lava' ? fluidGeom(b, s, x, y, z) : shapeGeom(b, o);
  var T = b.kind === 1 ? G : C, tintC = b.shape.tint;
  var tr = (tintC >> 16 & 255) / 255, tg = (tintC >> 8 & 255) / 255, tb = (tintC & 255) / 255;
  for (var i = 0; i < g.length; i++) {
    var q = g[i];
    if (q.cull) {
      var v = DV[q.cull], n = vis(x + v[0], y + v[1], z + v[2]);
      if (n && BLOCKS[cellBlock(n)].solid) continue;
    }
    var tl = b.tile[q.ti], col, uvT;
    if (tl >= 0) { col = [255, 255, 255]; uvT = tileUV[tl]; }
    else {
      if (q.ov) continue; // contorno da redstone sem textura: só atrapalha
      col = SH.texAvg[b.jt[q.ti]] || b.top; uvT = tileUV[b.kind === 1 ? 1 : 0];
    }
    var l = q.sh / 255, cr = col[0] * l, cg = col[1] * l, cb = col[2] * l;
    if (q.tint) { cr *= tr; cg *= tg; cb *= tb; }
    var bi = T.n;
    for (var k = 0; k < 4; k++) {
      var p = q.p[k], u = q.uv[k];
      T.p.push(x + p[0], y + p[1], z + p[2]);
      T.c.push(cr, cg, cb);
      T.u.push(uvT[0] + (uvT[2] - uvT[0]) * u[0] / 16, uvT[3] - (uvT[3] - uvT[1]) * u[1] / 16);
    }
    T.i.push(bi, bi + 3, bi + 2, bi, bi + 2, bi + 1);
    T.n += 4;
  }
}

/* Colocação: estado inicial pelo contexto do clique, como no jogo */
var SAME_LOOK = /(_stairs|_door|_fence_gate|_bed)$/;
function placeShape(bi, t) {
  var b = BLOCKS[bi], d = b.shape;
  var n = t && t.normal ? t.normal : [0, 1, 0];
  var nface = n[1] > 0 ? 'up' : n[1] < 0 ? 'down' : n[0] > 0 ? 'east' : n[0] < 0 ? 'west' : n[2] > 0 ? 'south' : 'north';
  var horiz = nface !== 'up' && nface !== 'down';
  if (horiz && b.wallBi != null) { bi = b.wallBi; b = BLOCKS[bi]; d = b.shape; }
  var ray = t && t.d ? t.d : [0, -1, -1];
  var look = nearestDir(ray, false), lookV = nearestDir(ray, true);
  var frac = t && t.pt ? t.pt[1] - Math.floor(t.pt[1]) : 0;
  var upperHalf = nface === 'down' || (horiz && frac > 0.5);
  var o = {}, has = function (p) { return b.sp.some(function (q) { return q[0] === p; }); };
  var vals = function (p) { return b.sp.filter(function (q) { return q[0] === p; })[0][1]; };
  if (has('facing')) {
    var fv = vals('facing'), six = fv.indexOf('up') >= 0;
    if (has('face')) o.facing = horiz ? nface : look;
    else if (b.shape.hide || /ladder|tripwire_hook|cocoa|_wall_/.test(b.java)) o.facing = horiz ? nface : OPP[look];
    else if (six && /(_rod|amethyst_cluster|_amethyst_bud|hopper)$/.test(b.java)) o.facing = b.java === 'hopper' ? (nface === 'up' ? 'down' : OPP[nface]) : nface;
    else if (six) o.facing = OPP[lookV];
    else if (/_trapdoor$/.test(b.java)) o.facing = horiz ? nface : OPP[look];
    else if (/anvil$/.test(b.java)) o.facing = CW[look];
    else if (SAME_LOOK.test(b.java)) o.facing = look;
    else o.facing = OPP[look];
    if (fv.indexOf(o.facing) < 0) o.facing = b.defs.facing;
  }
  if (has('face')) o.face = nface === 'up' ? 'floor' : nface === 'down' ? 'ceiling' : 'wall';
  if (has('half') && !(d.multi && d.multi.p === 'half')) o.half = upperHalf ? 'top' : 'bottom';
  if (has('type') && vals('type').indexOf('double') >= 0) o.type = upperHalf ? 'top' : 'bottom';
  if (has('axis')) o.axis = n[0] ? 'x' : n[2] ? 'z' : 'y';
  if (has('hanging')) o.hanging = nface === 'down' ? 'true' : 'false';
  if (has('attachment')) o.attachment = nface === 'up' ? 'floor' : nface === 'down' ? 'ceiling' : 'single_wall';
  if (has('vertical_direction')) o.vertical_direction = nface === 'down' ? 'down' : 'up';
  if (has('shape') && /rail/.test(b.java)) o.shape = Math.abs(ray[2]) > Math.abs(ray[0]) ? 'north_south' : 'east_west';
  if (has('rotation')) { var th = Math.atan2(ray[0], -ray[2]); o.rotation = String(((Math.round(th / (Math.PI / 8)) % 16) + 16) % 16); }
  // trepadeiras e líquens: grudam na face do bloco clicado
  var sides = ['north', 'east', 'south', 'west', 'up', 'down'].filter(function (h) { return has(h); });
  if (sides.length >= 4 && !d.fam) {
    var att = OPP[nface];
    sides.forEach(function (h) { o[h] = 'false'; });
    o[has(att) ? att : sides[0]] = 'true';
  }
  if (d.multi) o[d.multi.p] = d.multi.a;
  return { bi: bi, s: stateIndex(b, o) };
}
/* Parte de cima da porta, cabeceira da cama...: posição e estado */
function partnerOf(b, s, x, y, z) {
  var m = b.shape && b.shape.multi; if (!m) return null;
  var o = stateProps(b, s), isA = o[m.p] === m.a, v;
  if (m.d === 'up') v = [0, isA ? 1 : -1, 0];
  else { var f = DV[o.facing] || [0, 0, 1]; v = isA ? f : [-f[0], -f[1], -f[2]]; }
  var o2 = {}; for (var k in o) o2[k] = o[k]; o2[m.p] = isA ? m.b : m.a;
  return { x: x + v[0], y: y + v[1], z: z + v[2], s: stateIndex(b, o2) };
}
/* Ferramenta Usar: abre/fecha, liga/desliga, idade das plantas... (Shift: segunda propriedade) */
function cycleProp(b, s, prop, back) {
  var o = stateProps(b, s), vs = b.sp.filter(function (q) { return q[0] === prop; })[0][1];
  var i = vs.indexOf(o[prop]); o[prop] = vs[(i + (back ? vs.length - 1 : 1)) % vs.length];
  return stateIndex(b, o);
}
function cycleOrient(b, s, back) {
  var ps = b.shape.ori; if (!ps.length) return s;
  var o = stateProps(b, s), all = [], idx = 0;
  // percorre todas as combinações das propriedades de direção, mantendo as outras
  var rec = function (k, cur) {
    if (k === ps.length) { all.push(cur.slice()); return; }
    var vs = b.sp.filter(function (q) { return q[0] === ps[k]; })[0][1];
    for (var i = 0; i < vs.length; i++) { cur[k] = vs[i]; rec(k + 1, cur); }
  };
  rec(0, []);
  for (var i = 0; i < all.length; i++) if (ps.every(function (p, j) { return all[i][j] === o[p]; })) idx = i;
  var nx = all[(idx + (back ? all.length - 1 : 1)) % all.length];
  ps.forEach(function (p, j) { o[p] = nx[j]; });
  return stateIndex(b, o);
}
function shapeLabel(b, s) {
  var o = stateProps(b, s), out = [];
  b.shape.ori.concat(b.shape.tog).forEach(function (p) { if (o[p] != null) out.push(p + '=' + o[p]); });
  return out.join(', ');
}

/* Exportação: estado Java completo e estado Bedrock pela tabela Java -> Bedrock */
function shapeExport(b, s, x, y, z) {
  var o = fullProps(b, s, x, y, z), d = b.shape;
  var j = '[' + d.p.map(function (p) { return p[0] + '=' + o[p[0]]; }).join(',') + ']';
  if (!d.p.length) j = '';
  var r = bedrockFromProps(b, o); r.j = j;
  var bm = /^(\w+?)_bed$/.exec(b.java);
  if (bm) r.ent = { id: 'Bed', color: BED_COLORS.indexOf(bm[1]) };
  return r;
}
/* Nome e estados Bedrock de um conjunto completo de propriedades Java */
function bedrockFromProps(b, o) {
  var d = b.shape;
  var look = function (tab) { return tab[1][tab[0].map(function (p) { return o[p]; }).join('|')]; };
  var bn = d.be['#name'] ? look(d.be['#name']) : b.java;
  var def = SH.beStates[bn], st = {};
  if (def) for (var k in def[1]) st[k] = { t: def[1][k][0], v: def[1][k][1] };
  for (var key in d.be) {
    if (key === '#name' || !st[key]) continue;
    var v = look(d.be[key]); if (v == null) continue;
    st[key].v = st[key].t === 'string' ? v : st[key].t === 'byte' ? (v === 'true' || v === '1' ? 1 : 0) : +v;
  }
  return { bn: bn, bs: st, bv: def ? def[0] : 0 };
}
