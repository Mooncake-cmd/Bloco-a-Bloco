/* ---------- Pixel art a partir de uma imagem ---------- */
/* A imagem é reduzida para L × A pixels (o navegador faz a média das cores ao diminuir) e cada pixel vira o bloco de
   cor mais parecida. A comparação é no espaço de cor CIELAB (a distância nele segue melhor o que o olho acha "parecido"
   que a distância em RGB). A cor de cada bloco é a média da textura da face que fica à vista: a lateral para a pixel
   art de pé, o topo para a deitada. Pixels transparentes (alfa < 50%) ficam vazios. Com "pontilhado", o erro de cor
   de cada pixel passa para os vizinhos (Floyd–Steinberg), o que imita tons que nenhum bloco tem.
   O resultado vai para a área de cópia (como um Ctrl+C) e começa a colagem: R gira, F espelha, o clique cola. */
var PA_GROUPS = [
  ['solid', 'Todos os blocos de uma cor só (recomendado)'],
  ['wcc', 'Lã, concreto e terracota'],
  ['wool', 'Só lã'],
  ['concrete', 'Só concreto'],
  ['terracotta', 'Só terracota']
];
var PA_MAX = 512, pa = { w: 64, vert: true, group: 'solid', dither: false, nofall: true };
try { var pa0 = JSON.parse(localStorage.getItem('bloco-a-bloco-pixelart') || 'null'); if (pa0) pa = Object.assign(pa, pa0); } catch (e) {}
function paSave() { try { localStorage.setItem('bloco-a-bloco-pixelart', JSON.stringify(pa)); } catch (e) {} }
var PA_FALLS = /(^|_)(sand|gravel|concrete_powder)$|^suspicious_|anvil|dragon_egg|scaffolding/;
/* Blocos que servem: cubos inteiros e opacos com a mesma cara em volta, sem cor de bioma (grama, folhas) e sem direção */
function paCandidates(group, nofall) {
  var out = [];
  for (var i = 0; i < BLOCKS.length; i++) {
    var b = BLOCKS[i];
    if (b.isAir || b.hide || b.shape || b.glass || b.kind || b.ori || b.tint.some(function (t) { return t; })) continue;
    if (/_ore$|^infested_|^(command_block|chain_command_block|repeating_command_block|structure_block|jigsaw|barrier|spawner|budding_amethyst|reinforced_deepslate|tnt)$/.test(b.java)) continue;
    if (nofall && PA_FALLS.test(b.java)) continue;
    if (group === 'wcc' ? !/_(wool|concrete|terracotta)$|^terracotta$/.test(b.java) || /glazed/.test(b.java)
      : group === 'wool' ? !/_wool$/.test(b.java)
      : group === 'concrete' ? !/_concrete$/.test(b.java)
      : group === 'terracotta' ? !/(^|_)terracotta$/.test(b.java) || /glazed/.test(b.java)
      : group.indexOf('pal:') === 0 ? !palHas(group.slice(4), b)
      : !/^(pedra|madeira|cor|minerio|natureza|outros)$/.test(b.cat)) continue;
    out.push(i);
  }
  return out;
}
function paLab(r, g, b) {
  var f = function (c) { c /= 255; return c > 0.04045 ? Math.pow((c + 0.055) / 1.055, 2.4) : c / 12.92; };
  var R = f(r), G = f(g), B = f(b);
  var X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047, Y = R * 0.2126 + G * 0.7152 + B * 0.0722, Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  var h = function (t) { return t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116; };
  var fx = h(X), fy = h(Y), fz = h(Z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
/* O algoritmo: pixels RGBA (L × A) → células do mundo (Uint32Array) e a contagem de cada bloco */
function paConvert(px, W, H, cands, vert, dither) {
  var cols = cands.map(function (bi) { var b = BLOCKS[bi]; return vert ? b.side : b.top; });
  var labs = cols.map(function (c) { return paLab(c[0], c[1], c[2]); });
  var cache = new Map(), out = new Int32Array(W * H).fill(-1), counts = new Map();
  var nearest = function (r, g, b) {
    var key = (r << 16) | (g << 8) | b, k = cache.get(key); if (k !== undefined) return k;
    var L = paLab(r, g, b), best = 0, bd = Infinity;
    for (var i = 0; i < labs.length; i++) { var q = labs[i], dl = q[0] - L[0], da = q[1] - L[1], db = q[2] - L[2], dd = dl * dl + da * da + db * db; if (dd < bd) { bd = dd; best = i; } }
    cache.set(key, best); return best;
  };
  var buf = new Float32Array(W * H * 3);
  for (var p = 0; p < W * H; p++) { buf[p * 3] = px[p * 4]; buf[p * 3 + 1] = px[p * 4 + 1]; buf[p * 3 + 2] = px[p * 4 + 2]; }
  var cl = function (v) { return v < 0 ? 0 : v > 255 ? 255 : Math.round(v); };
  for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
    var i = y * W + x; if (px[i * 4 + 3] < 128) continue;
    var r = cl(buf[i * 3]), g = cl(buf[i * 3 + 1]), b = cl(buf[i * 3 + 2]), m = nearest(r, g, b);
    out[i] = m; counts.set(m, (counts.get(m) || 0) + 1);
    if (dither) {
      var c = cols[m], er = r - c[0], eg = g - c[1], eb = b - c[2];
      var push = function (xx, yy, f) { if (xx < 0 || xx >= W || yy >= H) return; var j = (yy * W + xx) * 3; buf[j] += er * f; buf[j + 1] += eg * f; buf[j + 2] += eb * f; };
      push(x + 1, y, 7 / 16); push(x - 1, y + 1, 3 / 16); push(x, y + 1, 5 / 16); push(x + 1, y + 1, 1 / 16);
    }
  }
  return { idx: out, counts: counts, cols: cols };
}
/* Reduz a imagem para W × H pela média de cada retângulo de pixels (o filtro do navegador borra as bordas e mistura
   a cor de pixels vizinhos: um olho preto de 1 pixel num sprite virava cinza). A média pesa pelo alfa. */
function paShrink(img, W, H) {
  var iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height, k = Math.min(1, 4096 / Math.max(iw, ih));
  iw = Math.max(1, Math.round(iw * k)); ih = Math.max(1, Math.round(ih * k));
  var c = document.createElement('canvas'); c.width = iw; c.height = ih;
  var x = c.getContext('2d'); x.drawImage(img, 0, 0, iw, ih);
  var src = x.getImageData(0, 0, iw, ih).data, out = new Uint8ClampedArray(W * H * 4);
  for (var oy = 0; oy < H; oy++) {
    var y0 = Math.floor(oy * ih / H), y1 = Math.max(y0 + 1, Math.floor((oy + 1) * ih / H));
    for (var ox = 0; ox < W; ox++) {
      var x0 = Math.floor(ox * iw / W), x1 = Math.max(x0 + 1, Math.floor((ox + 1) * iw / W)), r = 0, g = 0, b = 0, a = 0, n = 0;
      for (var yy = y0; yy < y1; yy++) for (var xx = x0; xx < x1; xx++) { var i = (yy * iw + xx) * 4, al = src[i + 3]; r += src[i] * al; g += src[i + 1] * al; b += src[i + 2] * al; a += al; n++; }
      var o = (oy * W + ox) * 4;
      if (a) { out[o] = r / a; out[o + 1] = g / a; out[o + 2] = b / a; }
      out[o + 3] = a / n;
    }
  }
  return out;
}
/* Do resultado para a área de cópia: de pé (X para a direita, Y para cima, uma camada em Z) ou deitada (Z para o sul) */
function paToClip(res, W, H, cands, vert) {
  var cells = new Uint32Array(W * H), n = 0;
  for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
    var m = res.idx[y * W + x]; if (m < 0) continue;
    var v = mkCell(cands[m]);
    if (vert) cells[(H - 1 - y) * W + x] = v; // a linha de cima da imagem é a camada mais alta
    else cells[y * W + x] = v;               // deitada: o alto da imagem fica ao norte
    n++;
  }
  return vert ? { w: W, h: H, l: 1, cells: cells, n: n } : { w: W, h: 1, l: H, cells: cells, n: n };
}

/* ---------- Janela ---------- */
function openPixelArt() {
  var img = null, res = null, W = 0, H = 0, cands = [];
  var groups = PA_GROUPS.concat(palList().filter(function (p) { return p.id !== 'all' && p.id !== 'fav'; }).map(function (p) { return ['pal:' + p.id, 'Paleta: ' + p.name]; }));
  if (!groups.some(function (g) { return g[0] === pa.group; })) pa.group = 'solid';
  openDialog('<h3>Pixel art de uma imagem</h3><p>Escolha uma imagem (foto, desenho, logo): cada pixel vira o bloco de cor mais parecida. Imagens pequenas e de poucas cores (desenhos, ícones, sprites) ficam melhores que fotos. Partes transparentes ficam vazias.</p>' +
    '<div class="row"><button class="btn primary" id="paPick">Escolher imagem…</button><span id="paName" class="pen">nenhuma imagem</span></div>' +
    '<input type="file" id="paIn" accept="image/*" hidden>' +
    '<div class="row"><label>Largura em blocos<input type="number" id="paW" min="4" max="' + PA_MAX + '" value="' + pa.w + '" style="width:110px"></label>' +
    '<label>Altura<input type="text" id="paH" value="—" disabled style="width:90px"></label>' +
    '<label style="flex:1">Blocos<select id="paG">' + groups.map(function (g) { return '<option value="' + esc(g[0]) + '"' + (g[0] === pa.group ? ' selected' : '') + '>' + esc(g[1]) + '</option>'; }).join('') + '</select></label></div>' +
    '<div class="row"><span class="mbtns seg"><button class="btn" data-pv="1">De pé (parede)</button><button class="btn" data-pv="0">Deitada (chão)</button></span>' +
    '<label class="check"><input type="checkbox" id="paD"' + (pa.dither ? ' checked' : '') + '> Pontilhado (mistura blocos para imitar tons que faltam)</label>' +
    '<label class="check"><input type="checkbox" id="paF"' + (pa.nofall ? ' checked' : '') + '> Sem blocos que caem (areia, cascalho, pó de concreto)</label></div>' +
    '<div class="pawrap"><canvas id="paCv" width="1" height="1"></canvas><div id="paInfo" class="pen"></div></div>' +
    '<p class="err" id="paErr" hidden></p>' +
    '<div class="row"><button class="btn primary" id="paOk" disabled>Colar na construção</button><button class="btn" id="paNo">Cancelar</button></div>', function () {
    overlayRoot.querySelector('.dialog').classList.add('wide');
    var seg = function () { overlayRoot.querySelectorAll('[data-pv]').forEach(function (b) { b.setAttribute('aria-pressed', String((b.getAttribute('data-pv') === '1') === pa.vert)); }); };
    seg();
    var run = function () {
      if (!img) return;
      pa.w = Math.max(4, Math.min(PA_MAX, $('paW').value | 0 || 64)); W = pa.w;
      H = Math.max(1, Math.round(W * img.naturalHeight / img.naturalWidth));
      if (H > PA_MAX) { H = PA_MAX; W = Math.max(1, Math.round(H * img.naturalWidth / img.naturalHeight)); }
      $('paH').value = H; paSave();
      var px = paShrink(img, W, H);
      cands = paCandidates(pa.group, pa.nofall);
      if (cands.length < 2) { res = null; $('paErr').hidden = false; $('paErr').textContent = 'Essa escolha tem menos de 2 blocos que servem (cubos inteiros e opacos, sem direção).'; $('paOk').disabled = true; return; }
      $('paErr').hidden = true;
      res = paConvert(px, W, H, cands, pa.vert, pa.dither);
      // prévia: um quadradinho por bloco, com a cor média do bloco
      var cv = $('paCv'), s = Math.max(1, Math.min(8, Math.floor(560 / Math.max(W, H)))), g = cv.getContext('2d');
      cv.width = W * s; cv.height = H * s; g.clearRect(0, 0, cv.width, cv.height);
      for (var yy = 0; yy < H; yy++) for (var xx = 0; xx < W; xx++) { var m = res.idx[yy * W + xx]; if (m < 0) continue; var cc = res.cols[m]; g.fillStyle = 'rgb(' + cc[0] + ',' + cc[1] + ',' + cc[2] + ')'; g.fillRect(xx * s, yy * s, s, s); }
      var list = Array.from(res.counts.entries()).sort(function (a, b) { return b[1] - a[1]; }), tot = list.reduce(function (a, q) { return a + q[1]; }, 0);
      var fit = pa.vert ? (W <= SX && H <= SY) : (W <= SX && H <= SZ);
      $('paInfo').innerHTML = '<b>' + W + ' × ' + H + '</b> · ' + tot.toLocaleString('pt-BR') + ' blocos de ' + list.length + ' tipos' +
        (fit ? '' : '<br><b class="err">Não cabe no espaço (' + SX + ' × ' + SY + ' × ' + SZ + '): o que passar da borda fica de fora. Diminua a largura ou aumente o espaço em Projeto → Tamanho do espaço.</b>') +
        '<br>' + list.slice(0, 12).map(function (q) { return esc(BLOCKS[cands[q[0]]].name) + ' ' + q[1].toLocaleString('pt-BR'); }).join(' · ') + (list.length > 12 ? ' · …' : '');
      $('paOk').disabled = !tot;
    };
    $('paPick').onclick = function () { $('paIn').click(); };
    $('paIn').onchange = function (e) {
      var f = e.target.files && e.target.files[0]; if (!f) return;
      var url = URL.createObjectURL(f), im = new Image();
      im.onload = function () { img = im; $('paName').textContent = f.name + ' (' + im.naturalWidth + ' × ' + im.naturalHeight + ' pixels)'; if (im.naturalWidth < pa.w) $('paW').value = Math.max(4, Math.min(PA_MAX, im.naturalWidth)); run(); };
      im.onerror = function () { $('paErr').hidden = false; $('paErr').textContent = 'Não foi possível abrir essa imagem.'; };
      im.src = url;
    };
    $('paW').addEventListener('change', run);
    $('paG').onchange = function (e) { pa.group = e.target.value; run(); };
    $('paD').onchange = function (e) { pa.dither = e.target.checked; run(); };
    $('paF').onchange = function (e) { pa.nofall = e.target.checked; run(); };
    overlayRoot.querySelectorAll('[data-pv]').forEach(function (b) { b.onclick = function () { pa.vert = b.getAttribute('data-pv') === '1'; seg(); run(); }; });
    $('paNo').onclick = closeDialog;
    $('paOk').onclick = function () {
      if (!res) return;
      clip = paToClip(res, W, H, cands, pa.vert); closeDialog();
      startPaste();
      toast('Pixel art pronta (' + W + ' × ' + H + '): clique onde quer colar. R gira 90°, F espelha, Esc cancela.', 6000);
    };
    openPixelArt.run = run; // para testes
    openPixelArt.load = function (im, name) { img = im; $('paName').textContent = name; run(); };
  });
}
