/* Fantasma para o survival (.mcpack): pacote de recursos do Bedrock que troca o visual do suporte de armadura.
   Com o nome escolhido (etiqueta renomeada na bigorna), o suporte some e no lugar aparece a construção
   semitransparente, no tamanho real, para construir por cima no survival (só visual: não desativa conquistas).
   Agachar + usar no suporte (ou sinal de redstone) troca a pose: pose 0 mostra tudo, poses 1 a 12 mostram uma faixa
   de camadas. Conferido no jogo (celular), com a casa de exemplo e com pacotes de diagnóstico:
   - modelo em faces soltas (poly_mesh), um osso por camada, x espelhado em relação ao editor (o jogo espelha de volta)
     e a ordem dos cantos de cada face mantida como no editor (com o espelho, ela fica com a frente para fora);
   - as faces entre um bloco e o de cima ou de baixo ficam sempre (vendo uma camada só, o bloco continua 3D); entre
     vizinhos da mesma camada, só as visíveis;
   - a área de desenho do modelo normal do suporte (1,5 bloco) é trocada por uma de 512 blocos: sem isso, a
     construção some quando o suporte sai da tela;
   - o jogo só desenha o suporte até ~64-72 blocos do jogador (mediu 72 com 12 chunks de distância): construção
     grande vai em pedaços de 32 x 32, cada um com o suporte no centro e o nome com o número do pedaço;
   - orientação fixa: '180 - q.body_y_rotation' no osso raiz desfaz o giro do suporte (com '-q.body_y_rotation' ficou
     parado, mas virado 180°); assim o norte do editor é o norte do mundo e os pedaços se encaixam;
   - material entity_alphablend, textura com a opacidade escolhida (85% ficou boa).
   Um pacote só (uuid fixo, versão pela hora): exportar de novo substitui o anterior, porque dois pacotes trocando o
   suporte de armadura brigariam entre si. */
var HOLO_UUID = ['3491f187-557f-4891-9f0f-4bcb000b322e', 'bb40bfaf-c8bc-4040-9a0b-1c6bd12c7de5'];
var HOLO_SHRINK = 0.96;
var HOLO_PIECE = 32; // lado dos pedaços: cada um com um suporte no centro // um pouco menor que o bloco: não pisca contra o bloco colocado
// suporte de armadura do jogo (bedrock-samples): entidade do cliente e modelo, para continuar igual sem o nome
var HOLO_STAND_ANIMS = { default_pose: 'animation.armor_stand.default_pose', no_pose: 'animation.armor_stand.no_pose', solemn_pose: 'animation.armor_stand.solemn_pose', athena_pose: 'animation.armor_stand.athena_pose', brandish_pose: 'animation.armor_stand.brandish_pose', honor_pose: 'animation.armor_stand.honor_pose', entertain_pose: 'animation.armor_stand.entertain_pose', salute_pose: 'animation.armor_stand.salute_pose', riposte_pose: 'animation.armor_stand.riposte_pose', zombie_pose: 'animation.armor_stand.zombie_pose', cancan_a_pose: 'animation.armor_stand.cancan_a_pose', cancan_b_pose: 'animation.armor_stand.cancan_b_pose', hero_pose: 'animation.armor_stand.hero_pose', wiggle: 'animation.armor_stand.wiggle', 'controller.pose': 'controller.animation.armor_stand.pose', 'controller.wiggling': 'controller.animation.armor_stand.wiggle', holding_heavy_core: 'animation.armor_stand.holding_heavy_core', 'controller.holding_heavy_core': 'controller.animation.armor_stand.holding_heavy_core' };
var HOLO_STAND_BONES = [{"name":"baseplate","cubes":[{"origin":[-6,0,-6],"size":[12,1,12],"uv":[0,32]}]},{"name":"waist","parent":"baseplate","pivot":[0,12,0]},{"name":"body","parent":"waist","pivot":[0,24,0],"cubes":[{"origin":[-6,21,-1.5],"size":[12,3,3],"uv":[0,26]},{"origin":[-3,14,-1],"size":[2,7,2],"uv":[16,0]},{"origin":[1,14,-1],"size":[2,7,2],"uv":[48,16]},{"origin":[-4,12,-1],"size":[8,2,2],"uv":[0,48]}]},{"name":"head","parent":"body","pivot":[0,24,0],"cubes":[{"origin":[-1,24,-1],"size":[2,7,2],"uv":[0,0]}]},{"name":"hat","parent":"head","pivot":[0,24,0],"cubes":[{"origin":[-4,24,-4],"size":[8,8,8],"uv":[32,0]}]},{"name":"leftarm","parent":"body","mirror":true,"pivot":[5,22,0],"cubes":[{"origin":[5,12,-1],"size":[2,12,2],"uv":[32,16]}]},{"name":"leftitem","parent":"leftarm","pivot":[6,15,1]},{"name":"leftleg","parent":"body","mirror":true,"pivot":[1.9,12,0],"cubes":[{"origin":[0.9,1,-1],"size":[2,11,2],"uv":[40,16]}]},{"name":"rightarm","parent":"body","pivot":[-5,22,0],"cubes":[{"origin":[-7,12,-1],"size":[2,12,2],"uv":[24,0]}]},{"name":"rightitem","parent":"rightarm","pivot":[-6,15,1]},{"name":"rightleg","parent":"body","pivot":[-1.9,12,0],"cubes":[{"origin":[-2.9,1,-1],"size":[2,11,2],"uv":[8,0]}]}];
function holoName(s) { return String(s || '').replace(/['"\\]/g, '').trim().slice(0, 40); }

/* Faces de uma célula: [{ p: 4 cantos (mundo), uv: 4 x [u, v] no ladrilho (0..1, v de baixo para cima), tile, tint, rev }].
   Só esconde a face quando o vizinho da mesma camada a cobre. */
function holoQuads(x, y, z, v, out) {
  var b = BLOCKS[cellBlock(v)];
  if (b.isAir) return;
  var vis0 = vis;
  vis = function (a, b2, c) { return b2 !== y ? 0 : vis0(a, b2, c); };
  try {
    if (b.shape) {
      var o = fullProps(b, cellOri(v), x, y, z), g = b.java === 'water' || b.java === 'lava' ? fluidGeom(b, cellOri(v), x, y, z) : shapeGeom(b, o);
      var tc = b.java === 'redstone_wire' ? wireTint(+o.power || 0) : bioTint(b.shape.tint, x, z) || b.shape.tint;
      for (var i = 0; i < g.length; i++) {
        var q = g[i];
        if (q.cull) { var dv = DV[q.cull], n = vis(x + dv[0], y + dv[1], z + dv[2]); if (n && BLOCKS[cellBlock(n)].solid) continue; }
        var tl = b.tile[q.ti], tint = null;
        if (tl >= 0) { if (q.tint) tint = [(tc >> 16 & 255) / 255, (tc >> 8 & 255) / 255, (tc & 255) / 255]; }
        else { if (q.ov) continue; var c0 = SH.texAvg[b.jt[q.ti]] || b.top; tint = [c0[0] / 255, c0[1] / 255, c0[2] / 255]; tl = b.kind === 1 ? 1 : 0; }
        out.push({ p: q.p.map(function (p) { return [x + p[0], y + p[1], z + p[2]]; }), uv: q.uv.map(function (u) { return [u[0] / 16, 1 - u[1] / 16]; }), tile: tl, tint: tint, rev: true, c: [x + 0.5, y + 0.5, z + 0.5] });
      }
      return;
    }
    var fm = b.ori ? b.ori.o[cellOri(v)] && b.ori.o[cellOri(v)][2] : 0;
    for (var f = 0; f < 6; f++) {
      var F = FACES[f], nv = vis(x + F.n[0], y + F.n[1], z + F.n[2]);
      if (nv) { var nb = BLOCKS[cellBlock(nv)]; if (nb.solid || (b.glass && nb.glass && cellBlock(nv) === cellBlock(v))) continue; }
      var src = fm ? fm[F.t * 2] : F.t, rk = fm ? fm[F.t * 2 + 1] : 0, t2 = b.tile[src], tn = null;
      if (!(t2 >= 0)) { var c1 = src === 0 ? b.top : src === 1 ? b.bottom : b.side; tn = [c1[0] / 255, c1[1] / 255, c1[2] / 255]; t2 = b.glass ? 1 : 0; }
      var P = [], U = [];
      for (var k = 0; k < 4; k++) { P.push([x + F.v[k][0], y + F.v[k][1], z + F.v[k][2]]); U.push(UVS[(k + rk) % 4].slice()); }
      out.push({ p: P, uv: U, tile: t2, tint: tn, rev: false, c: [x + 0.5, y + 0.5, z + 0.5] });
    }
  } finally { vis = vis0; }
}

/* Ladrilhos usados -> atlas pequeno (prateleiras, do maior para o menor), com a cor embutida (capim, pó, sem textura)
   e a opacidade do fantasma. Devolve { W, H, rect: chave -> [u0, v0, u1, v1] (v de baixo para cima), canvas }. */
function holoAtlas(keys, alpha) {
  var img = atlasTex.image, AW = img.width, AH = img.height, src = img.data;
  var tiles = keys.map(function (k) {
    var r = tileUV[k.tile] || tileUV[0], x0 = Math.round(r[0] * AW - 0.5), y0 = Math.round(r[1] * AH - 0.5);
    return { k: k, x0: x0, y0: y0, S: Math.max(1, Math.round((r[2] - r[0]) * AW + 1)) };
  });
  tiles.sort(function (a, b) { return b.S - a.S; });
  var area = tiles.reduce(function (s, t) { return s + t.S * t.S; }, 0), W = 16;
  while (W * W < area) W *= 2;
  var x = 0, y = 0, rowH = 0;
  tiles.forEach(function (t) { if (x + t.S > W) { x = 0; y += rowH; rowH = 0; } t.x = x; t.y = y; x += t.S; rowH = Math.max(rowH, t.S); });
  var H = 16; while (H < y + rowH) H *= 2;
  var c = document.createElement('canvas'); c.width = W; c.height = H;
  var g = c.getContext('2d'), id = g.createImageData(W, H), d = id.data, rect = {};
  tiles.forEach(function (t) {
    var tn = t.k.tint || [1, 1, 1];
    // atlas do editor: linha 0 = baixo (WebGL); a imagem nova: linha 0 = topo
    for (var r = 0; r < t.S; r++) for (var cc = 0; cc < t.S; cc++) {
      var si = ((t.y0 + t.S - 1 - r) * AW + t.x0 + cc) * 4, di = ((t.y + r) * W + t.x + cc) * 4;
      d[di] = src[si] * tn[0]; d[di + 1] = src[si + 1] * tn[1]; d[di + 2] = src[si + 2] * tn[2]; d[di + 3] = src[si + 3] * alpha;
    }
    var e = 0.5;
    rect[t.k.key] = [(t.x + e) / W, 1 - (t.y + t.S - e) / H, (t.x + t.S - e) / W, 1 - (t.y + e) / H];
  });
  g.putImageData(id, 0, 0);
  return { W: W, H: H, rect: rect, canvas: c };
}

/* Monta o pacote: { bytes, faces, layers, band, bb } */
async function holoBuild(name, opacity) {
  var bb = bbox(); if (!bb) throw new Error('A construção está vazia.');
  var quads = [];
  forEachBlock(function (x, y, z, v) { holoQuads(x, y, z, v, quads); });
  if (!quads.length) throw new Error('Nada para mostrar.');
  // ladrilho + cor -> um lugar no atlas novo
  var keyOf = {}, keys = [];
  quads.forEach(function (q) {
    var k = q.tile + (q.tint ? ':' + q.tint.map(function (c) { return Math.round(c * 255); }).join(',') : '');
    if (!(k in keyOf)) { keyOf[k] = 1; keys.push({ key: k, tile: q.tile, tint: q.tint }); }
    q.key = k;
  });
  var at = holoAtlas(keys, opacity);
  // pedaços de HOLO_PIECE x HOLO_PIECE, cada um com o suporte no centro (o jogo só desenha o suporte até ~64 blocos do
  // jogador: em construção grande, você está sempre perto do suporte do pedaço onde está); um osso por camada
  var NL = bb.maxY - bb.minY + 1, band = Math.ceil(NL / 12), r4 = function (v) { return Math.round(v * 1e4) / 1e4; };
  var nx = Math.ceil(bb.w / HOLO_PIECE), nz = Math.ceil(bb.l / HOLO_PIECE), pieces = {};
  quads.forEach(function (q) {
    var ix = Math.floor((Math.floor(q.c[0]) - bb.minX) / HOLO_PIECE), iz = Math.floor((Math.floor(q.c[2]) - bb.minZ) / HOLO_PIECE), pk = ix + ',' + iz;
    var PC = pieces[pk];
    if (!PC) {
      var x0 = bb.minX + ix * HOLO_PIECE, x1 = Math.min(x0 + HOLO_PIECE, bb.maxX + 1), z0 = bb.minZ + iz * HOLO_PIECE, z1 = Math.min(z0 + HOLO_PIECE, bb.maxZ + 1);
      PC = pieces[pk] = { ix: ix, iz: iz, sx: x0 + Math.floor((x1 - x0) / 2), sz: z0 + Math.floor((z1 - z0) / 2), bones: {}, faces: 0 };
    }
    PC.faces++;
    var ly = Math.floor(q.c[1]) - bb.minY;
    var B = PC.bones[ly] || (PC.bones[ly] = { pos: [], nor: [], uvs: [], polys: [], mp: {}, mn: {}, mu: {} });
    var cx = q.c[0], cy = q.c[1], cz = q.c[2];
    var a = [q.p[1][0] - q.p[0][0], q.p[1][1] - q.p[0][1], q.p[1][2] - q.p[0][2]], b = [q.p[3][0] - q.p[0][0], q.p[3][1] - q.p[0][1], q.p[3][2] - q.p[0][2]];
    var n = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    if (q.rev) n = [-n[0], -n[1], -n[2]];
    var ln = Math.hypot(n[0], n[1], n[2]) || 1; n = [-r4(n[0] / ln), r4(n[1] / ln), r4(n[2] / ln)]; // x espelhado
    var nk = n.join(','), ni = B.mn[nk]; if (ni == null) { ni = B.mn[nk] = B.nor.length; B.nor.push(n); }
    var R = at.rect[q.key], poly = [], order = q.rev ? [0, 3, 2, 1] : [0, 1, 2, 3];
    order.forEach(function (k) {
      var p = q.p[k], px = cx + (p[0] - cx) * HOLO_SHRINK, py = cy + (p[1] - cy) * HOLO_SHRINK, pz = cz + (p[2] - cz) * HOLO_SHRINK;
      var P = [r4(-((px - PC.sx) * 16 - 8)), r4((py - bb.minY) * 16), r4((pz - PC.sz) * 16 - 8)], pk2 = P.join(',');
      var pi = B.mp[pk2]; if (pi == null) { pi = B.mp[pk2] = B.pos.length; B.pos.push(P); }
      var u = q.uv[k], U = [r4(R[0] + (R[2] - R[0]) * u[0]), r4(R[1] + (R[3] - R[1]) * u[1])], uk = U.join(',');
      var ui = B.mu[uk]; if (ui == null) { ui = B.mu[uk] = B.uvs.length; B.uvs.push(U); }
      poly.push([pi, ni, ui]);
    });
    B.polys.push(poly);
  });
  var list = Object.keys(pieces).map(function (k) { return pieces[k]; }).sort(function (a, b) { return a.iz - b.iz || a.ix - b.ix; });
  var nm = holoName(name), many = list.length > 1, conds = [];
  // área de desenho grande (512 blocos, conferida no jogo): sem ela, a construção some quando o suporte sai da tela
  var BIG = 512, files = [], geos = {}, rcs = {}, rcl = [];
  list.forEach(function (PC, i) {
    PC.name = many ? nm + ' ' + (i + 1) : nm;
    var cond = "query.get_name == '" + PC.name + "'"; conds.push(cond);
    var boneList = [{ name: 'raiz', pivot: [0, 0, 0] }], vis2 = [{ '*': true }];
    Object.keys(PC.bones).forEach(function (ly) {
      var B = PC.bones[ly];
      boneList.push({ name: 'l' + ly, parent: 'raiz', pivot: [0, 0, 0], poly_mesh: { normalized_uvs: true, positions: B.pos, normals: B.nor, uvs: B.uvs, polys: B.polys } });
      var ps = Math.floor(ly / band) + 1, e = {}; e['l' + ly] = 'v.armor_stand.pose_index == 0 || v.armor_stand.pose_index == ' + ps; vis2.push(e);
    });
    var id = 'bab_fantasma_' + (i + 1);
    files.push({ name: 'models/entity/' + id + '.geo.json', obj: { format_version: '1.12.0', 'minecraft:geometry': [{ description: { identifier: 'geometry.' + id, texture_width: at.W, texture_height: at.H, visible_bounds_width: BIG, visible_bounds_height: BIG, visible_bounds_offset: [0, 0, 0] }, bones: boneList }] } });
    geos[id] = 'geometry.' + id;
    rcs['controller.render.' + id] = { geometry: 'geometry.' + id, materials: [{ '*': 'material.bab_fantasma' }], textures: ['texture.bab_fantasma'], part_visibility: vis2 };
    var o = {}; o['controller.render.' + id] = cond; rcl.push(o);
  });
  var any = conds.join(' || ');
  var standGeo = { format_version: '1.12.0', 'minecraft:geometry': [{ description: { identifier: 'geometry.armor_stand', texture_width: 64, texture_height: 64, visible_bounds_width: BIG, visible_bounds_height: BIG, visible_bounds_offset: [0, 0, 0] }, bones: HOLO_STAND_BONES }] };
  var anims = Object.assign({}, HOLO_STAND_ANIMS, { bab_fixa: 'animation.bab_fantasma.fixa' });
  var ent = { format_version: '1.10.0', 'minecraft:client_entity': { description: {
    identifier: 'minecraft:armor_stand', min_engine_version: '1.8.0',
    materials: { 'default': 'armor_stand', bab_fantasma: 'entity_alphablend' },
    textures: { 'default': 'textures/entity/armor_stand', bab_fantasma: 'textures/entity/bab/fantasma' },
    animations: anims,
    scripts: { initialize: ['variable.armor_stand.pose_index = 0;', 'variable.armor_stand.hurt_time = 0;'], animate: ['controller.pose', 'controller.wiggling', 'controller.holding_heavy_core', { bab_fixa: any }] },
    geometry: Object.assign({ 'default': 'geometry.armor_stand' }, geos),
    render_controllers: [{ 'controller.render.armor_stand': '!(' + any + ')' }].concat(rcl),
    enable_attachables: true } } };
  var rc = { format_version: '1.8.0', render_controllers: rcs };
  // orientação fixa (conferida no jogo): desfaz o giro do suporte; com os 180°, o norte do editor é o norte do mundo
  var anim = { format_version: '1.8.0', animations: { 'animation.bab_fantasma.fixa': { loop: true, bones: { raiz: { rotation: [0, '180 - q.body_y_rotation', 0] } } } } };
  var now = new Date(), day = Math.floor(now.getTime() / 864e5) - 20000;
  var man = { format_version: 2, header: { name: 'Bloco a Bloco: fantasma',  description: "Suporte de armadura chamado '" + nm + (many ? " 1' (até " + list.length + ')' : "'") + " mostra a construção (" + bb.w + ' x ' + bb.h + ' x ' + bb.l + '). Agachar + usar troca a camada.', uuid: HOLO_UUID[0], version: [1, day, now.getHours() * 60 + now.getMinutes()], min_engine_version: [1, 20, 0] },
    modules: [{ type: 'resources', uuid: HOLO_UUID[1], version: [1, day, now.getHours() * 60 + now.getMinutes()] }] };
  var png = new Uint8Array(await (await new Promise(function (res) { at.canvas.toBlob(res, 'image/png'); })).arrayBuffer());
  var icon = document.createElement('canvas'); icon.width = icon.height = 64;
  var ig = icon.getContext('2d'); ig.imageSmoothingEnabled = false; ig.drawImage(at.canvas, 0, 0, Math.min(at.W, at.H), Math.min(at.W, at.H), 0, 0, 64, 64);
  var iconPng = new Uint8Array(await (await new Promise(function (res) { icon.toBlob(res, 'image/png'); })).arrayBuffer());
  var enc = new TextEncoder(), J = function (o) { return enc.encode(JSON.stringify(o)); };
  var bytes = await holoZip([
    { name: 'manifest.json', data: J(man) },
    { name: 'pack_icon.png', data: iconPng },
    { name: 'entity/armor_stand.entity.json', data: J(ent) },
    { name: 'models/entity/armor_stand.geo.json', data: J(standGeo) },
    { name: 'render_controllers/bab_fantasma.render_controllers.json', data: J(rc) },
    { name: 'animations/bab_fantasma.animation.json', data: J(anim) },
    { name: 'textures/entity/bab/fantasma.png', data: png }].concat(files.map(function (f) { return { name: f.name, data: J(f.obj) }; })));
  return { bytes: bytes, faces: quads.length, layers: NL, band: band, bb: bb, name: nm, atlas: [at.W, at.H],
    pieces: list.map(function (PC) { return { name: PC.name, dx: PC.sx - bb.minX, dz: PC.sz - bb.minZ, faces: PC.faces }; }) };
}

/* ZIP com compressão (o modelo é um JSON grande: comprimido fica umas 10 vezes menor); sem CompressionStream, sem
   compressão */
async function holoZip(files) {
  var enc = new TextEncoder(), parts = [], central = [], off = 0, zip;
  try { new CompressionStream('deflate-raw'); zip = true; } catch (e) { zip = false; }
  for (var i = 0; i < files.length; i++) {
    var f = files[i], name = enc.encode(f.name), crc = MCExport.crc32(f.data), body = f.data, m = 0;
    if (zip && f.data.length > 256) {
      var c = new Uint8Array(await new Response(new Blob([f.data]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
      if (c.length < f.data.length) { body = c; m = 8; }
    }
    var lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, m, true); lh.setUint16(12, 0x21, true);
    lh.setUint32(14, crc, true); lh.setUint32(18, body.length, true); lh.setUint32(22, f.data.length, true); lh.setUint16(26, name.length, true);
    parts.push(new Uint8Array(lh.buffer), name, body);
    var ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, m, true); ch.setUint16(14, 0x21, true);
    ch.setUint32(16, crc, true); ch.setUint32(20, body.length, true); ch.setUint32(24, f.data.length, true); ch.setUint16(28, name.length, true); ch.setUint32(42, off, true);
    central.push(new Uint8Array(ch.buffer), name);
    off += 30 + name.length + body.length;
  }
  var cs = 0; central.forEach(function (c) { cs += c.length; });
  var end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, cs, true); end.setUint32(16, off, true);
  return new Uint8Array(await new Blob(parts.concat(central, [new Uint8Array(end.buffer)])).arrayBuffer());
}

/* Janela depois de baixar: o passo a passo no jogo e onde vai cada suporte (com o canto no mundo, as coordenadas) */
function holoHelp(r, corner) {
  var poses = [];
  for (var p = 1; p <= Math.min(12, Math.ceil(r.layers / r.band)); p++) {
    var a = (p - 1) * r.band + 1, b = Math.min(r.layers, p * r.band);
    poses.push('pose ' + p + ': ' + (a === b ? 'camada ' + a : 'camadas ' + a + ' a ' + b));
  }
  var many = r.pieces.length > 1;
  var rows = r.pieces.map(function (pc) {
    var where = corner ? (corner[0] + pc.dx) + ' ' + corner[1] + ' ' + (corner[2] + pc.dz) : pc.dx + ' para leste, ' + pc.dz + ' para o sul';
    return '<tr><td><b>' + esc(pc.name) + '</b></td><td>' + where + '</td></tr>';
  }).join('');
  var txt = r.pieces.map(function (pc) { return pc.name + ': ' + (corner ? (corner[0] + pc.dx) + ' ' + corner[1] + ' ' + (corner[2] + pc.dz) : pc.dx + ' leste, ' + pc.dz + ' sul'); }).join('\n');
  openDialog('<h3>Fantasma pronto</h3>' +
    '<div class="info">' + r.bb.w + ' × ' + r.bb.h + ' × ' + r.bb.l + ' blocos, ' + r.faces.toLocaleString('pt-BR') + ' faces' + (many ? ', em ' + r.pieces.length + ' pedaços de até ' + HOLO_PIECE + ' × ' + HOLO_PIECE + ', cada um com o seu suporte' : '') + '.</div>' +
    '<ol class="steps">' +
    '<li>Abra o <b>.mcpack</b> (no celular, toque nele): o Minecraft importa sozinho. Exportar de novo substitui o fantasma anterior.</li>' +
    '<li>Nas configurações do mundo, <b>Pacotes de recursos</b>: ative "Bloco a Bloco: fantasma". É só visual: as conquistas continuam ativas.</li>' +
    '<li>Renomeie ' + (many ? 'etiquetas' : 'uma etiqueta') + ' na bigorna (igualzinho: maiúsculas e minúsculas contam) e ponha ' + (many ? 'cada uma num suporte de armadura, no lugar abaixo' : 'num suporte de armadura, no lugar abaixo') + '. O suporte some e a construção aparece. Tanto faz para onde o suporte olha: o norte do editor (o N da bússola) é sempre o norte do jogo.</li>' +
    '<li><b>Agache e use</b> o suporte (mão vazia) para trocar a camada: pose 0 mostra tudo; ' + poses.join('; ') + '.' + (many ? ' Cada suporte troca a camada do seu pedaço.' : '') + '</li>' +
    '<li>No fim, quebre ' + (many ? 'os suportes' : 'o suporte') + ' e ponha os blocos que faltam no lugar ' + (many ? 'deles' : 'dele') + '.</li></ol>' +
    '<p>' + (corner ? 'Coordenadas de cada suporte no mundo (x y z):' : 'Onde fica cada suporte, contando a partir do canto noroeste da camada mais baixa da construção (todos na altura dela). Informe esse canto na janela Exportar para ver as coordenadas prontas:') + '</p>' +
    '<div class="mat"><table>' + rows + '</table></div>' +
    '<p>O jogo só desenha o fantasma até uns 64 blocos de distância do suporte' + (many ? ', por isso a divisão em pedaços' : '') + '. Olhando reto para cima, bem acima do suporte, ele pode sumir.</p>' +
    '<div class="row"><button class="btn" id="hoCopy">Copiar a lista</button><button class="btn" id="hoClose">Fechar</button></div>', function () {
      $('hoClose').onclick = closeDialog;
      $('hoCopy').onclick = function () { try { navigator.clipboard.writeText(txt).then(function () { toast('Lista copiada.'); }, function () { toast('Não deu para copiar.'); }); } catch (e) { toast('Não deu para copiar.'); } };
    });
}
