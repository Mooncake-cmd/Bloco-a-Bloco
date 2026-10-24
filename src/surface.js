/* ---------- Só a superfície: numa área de mundo do jogo, o subsolo não é desenhado ---------- */
/* Uma área de 512 × 512 tem dezenas de milhões de blocos, quase todos pedra debaixo da terra. Por padrão, só se desenha
   a casca de cima: em cada coluna, o terreno natural mais alto (pedra, terra, grama, areia, cascalho, minérios...;
   água, folhas e o que foi construído ficam de fora da conta) e 3 camadas para baixo, descendo até o nível da coluna
   vizinha mais baixa (o lado de um barranco aparece inteiro). Tudo o que está acima disso aparece: árvores, casas,
   a água do mar e o fundo dele. O que fica abaixo continua na memória (exportar, redstone, ferramentas usam tudo);
   só não vira malha nem é acertado pelo clique. O botão Subsolo do aviso do mundo mostra tudo. No Nether (teto de
   rocha-mãe) a área é sempre desenhada inteira. */
var SURF_KEY = 'bloco-a-bloco-subsolo', SURF_DEPTH = 3;
var surfUnder = false;
try { surfUnder = localStorage.getItem(SURF_KEY) === '1'; } catch (e) {}
var surfTop = null, surfFloor = null, surfStale = true, surfCols = new Set(), SURF_NAT = null;
var SURF_RE = /^(stone|granite|diorite|andesite|deepslate|tuff|calcite|dripstone_block|dirt|coarse_dirt|rooted_dirt|grass_block|podzol|mycelium|mud|clay|sand|red_sand|suspicious_sand|suspicious_gravel|gravel|[a-z_]*terracotta|hardened_clay|stained_hardened_clay|snow|snow_block|powder_snow|ice|packed_ice|blue_ice|moss_block|netherrack|soul_sand|soul_soil|basalt|smooth_basalt|blackstone|crimson_nylium|warped_nylium|magma_block|end_stone|bedrock|amethyst_block|budding_amethyst|infested_[a-z_]+|[a-z_]*_ore|raw_(iron|copper|gold)_block)$/;
function surfActive() { return !surfUnder && !!(wio && wio.area) && wio.area.dim !== 1; }
function surfNat() {
  if (!SURF_NAT || SURF_NAT.length !== BLOCKS.length) {
    SURF_NAT = new Uint8Array(BLOCKS.length);
    BLOCKS.forEach(function (b, i) { if (b.java && !b.shape && SURF_RE.test(b.java) && !/glazed/.test(b.java)) SURF_NAT[i] = 1; });
  }
  return SURF_NAT;
}
/* O terreno natural mais alto da coluna (-1: nenhum) */
function surfColTop(x, z) {
  var N = surfNat(), o = ((z & 15) << 4) | (x & 15);
  for (var cy = (SY - 1) >> 4; cy >= 0; cy--) {
    var ch = W.get(ckey(x >> 4, cy, z >> 4)); if (!ch) continue;
    if (!ch.d) { if (ch.u && N[cellBlock(ch.u)]) return Math.min(SY - 1, cy * 16 + 15); continue; }
    for (var ly = 15; ly >= 0; ly--) { var v = ch.pal[ch.d[(ly << 8) | o]]; if (v && N[cellBlock(v)]) return cy * 16 + ly; }
  }
  return -1;
}
/* Primeira camada desenhada da coluna: 3 abaixo do terreno dela e das 8 vizinhas (as vizinhas sem terreno, como um
   chunk que o jogo nunca gerou, não contam). Coluna sem terreno natural nenhum: tudo dela aparece. */
function surfFloorAt(x, z) {
  if (surfTop[z * SX + x] < 0) return 0;
  var m = Infinity;
  for (var dz = -1; dz <= 1; dz++) for (var dx = -1; dx <= 1; dx++) {
    var nx = x + dx, nz = z + dz; if (nx < 0 || nz < 0 || nx >= SX || nz >= SZ) continue;
    var t = surfTop[nz * SX + nx]; if (t >= 0 && t < m) m = t;
  }
  return Math.max(0, m - SURF_DEPTH + 1);
}
function surfCompute() {
  surfStale = false; surfCols.clear();
  if (!surfActive()) { surfTop = surfFloor = null; return; }
  var n = SX * SZ; surfTop = new Int16Array(n); surfFloor = new Int16Array(n);
  for (var z = 0; z < SZ; z++) for (var x = 0; x < SX; x++) surfTop[z * SX + x] = surfColTop(x, z);
  for (z = 0; z < SZ; z++) for (x = 0; x < SX; x++) surfFloor[z * SX + x] = surfFloorAt(x, z);
}
/* Uma edição no topo do terreno (ou acima) pode mudar a coluna: fica na fila para o próximo quadro */
function surfTouch(x, y, z) {
  var i = z * SX + x;
  if (i >= 0 && i < surfTop.length && y >= surfTop[i]) surfCols.add(i);
}
/* Refaz as colunas da fila; onde o fundo desenhado mudou, os pedaços daquela faixa são montados de novo */
function surfFlush() {
  if (surfStale) { surfCompute(); return; }
  if (!surfCols.size || !surfTop) return;
  var near = new Set();
  surfCols.forEach(function (i) {
    var x = i % SX, z = (i - x) / SX, t = surfColTop(x, z);
    if (t === surfTop[i]) return;
    surfTop[i] = t;
    for (var dz = -1; dz <= 1; dz++) for (var dx = -1; dx <= 1; dx++) { var nx = x + dx, nz = z + dz; if (nx >= 0 && nz >= 0 && nx < SX && nz < SZ) near.add(nz * SX + nx); }
  });
  surfCols.clear();
  near.forEach(function (i) {
    var x = i % SX, z = (i - x) / SX, f0 = surfFloor[i], f1 = surfFloorAt(x, z);
    if (f0 === f1) return;
    surfFloor[i] = f1;
    for (var cy = Math.min(f0, f1) >> 4; cy <= (Math.max(f0, f1) - 1) >> 4; cy++) dirty.add((x >> 4) + ',' + cy + ',' + (z >> 4));
  });
}
/* A célula está escondida (debaixo da casca)? */
function surfHid(x, y, z) { return surfFloor !== null && y < surfFloor[z * SX + x]; }
/* O menor fundo do pedaço de 16 × 16 (o pedaço inteiro abaixo dele nem é percorrido) */
function surfChunkMin(cx, cz) {
  var m = SY, x0 = cx * 16, z0 = cz * 16, x1 = Math.min(x0 + 16, SX), z1 = Math.min(z0 + 16, SZ);
  for (var z = z0; z < z1; z++) for (var x = x0; x < x1; x++) { var f = surfFloor[z * SX + x]; if (f < m) m = f; }
  return m;
}
function surfSet(under) {
  surfUnder = !!under;
  try { localStorage.setItem(SURF_KEY, surfUnder ? '1' : '0'); } catch (e) {}
  surfUI(); dirtyAll(); requestRender();
  if (wio && wio.area) toast(surfUnder ? 'Subsolo à mostra: a área inteira é desenhada (cavernas, minas, o que está debaixo da terra). Fica mais pesado.' :
    wio.area.dim === 1 ? 'No Nether a área é sempre desenhada inteira (o teto de rocha-mãe esconderia tudo).' : 'Só a superfície: o terreno e 3 camadas abaixo dele. O subsolo continua lá, só não é desenhado.', 6000);
}
function surfUI() {
  var b = $('worldUnder'); if (!b) return;
  b.setAttribute('aria-pressed', surfUnder ? 'true' : 'false');
  b.textContent = surfUnder ? 'Subsolo: à mostra' : 'Subsolo: escondido';
}
