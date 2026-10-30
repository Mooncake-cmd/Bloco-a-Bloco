// Mede rios, lagos e oceanos de um mundo gerado pelo servidor oficial do Bedrock, para o Pincel de água (src/agua.js)
// ficar com as densidades e as formas do jogo. Para cada coluna de água (por bioma da superfície): profundidade, bloco
// do fundo, o que cresce no fundo (alga, alga-marinha, corais, pepino-do-mar; altura da alga em relação à
// profundidade), o que há na superfície (vitória-régia, gelo) e os blocos de coral; para cada coluna de margem (terra
// encostada na água, com o chão no nível da água ou até 2 acima): o chão e a planta em cima (altura da cana). E a
// profundidade pela distância até a terra mais perto (o perfil do leito: o barranco do rio, o talude do oceano).
// node scripts/medir-agua.js <pasta do mundo> <áreas.txt: "nome x z" por linha> [raio em blocos, 80] > medidas.json
const fs = require('fs'), path = require('path'), vm = require('vm'), root = path.join(__dirname, '..');
const ctx = { console, TextDecoder, TextEncoder, Blob, Response, DecompressionStream, CompressionStream, ReadableStream, Uint8Array, Uint16Array, Int16Array, DataView, Map, Set, Math, String, Number, JSON, Array, Object, Promise };
vm.createContext(ctx); ctx.MCExport = require(path.join(root, 'src/exporters.js'));
vm.runInContext(fs.readFileSync(path.join(root, 'src/import.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'src/worldio.js'), 'utf8'), ctx);
{ const bs = fs.readFileSync(path.join(root, 'src/biome.js'), 'utf8'); vm.runInContext(bs.slice(bs.indexOf('function bioDecode3D'), bs.indexOf('function bioEncode3D')), ctx); } // só o leitor dos biomas 3D
const BIO = {}; JSON.parse(fs.readFileSync(path.join(root, 'data/biomes.json'), 'utf8')).forEach(b => { BIO[b.id] = b.n; });
const WATERY = /^(water|flowing_water|bubble_column)$/;
const AQUA = /^(seagrass|tall_seagrass|kelp|.*coral(_fan|_wall_fan)?|sea_pickle|.*coral_block)$/;
(async () => {
  const dir = process.argv[2], R = +(process.argv[4] || 80);
  const areas = fs.readFileSync(process.argv[3], 'utf8').trim().split('\n').map(l => l.trim().split(/\s+/)).map(a => [a[0], +a[1], +a[2]]);
  const names = fs.readdirSync(path.join(dir, 'db'));
  const db = await ctx.ldbOpen(names, async n => new Uint8Array(fs.readFileSync(path.join(dir, 'db', n))));
  const nameCache = new Map();
  const nm = raw => { const k = ctx.wioStr(raw); let v = nameCache.get(k); if (!v) { const o = ctx.nbtRead(raw, true); v = String(o.name).replace('minecraft:', ''); const st = o.states || {};
    if (v === 'seagrass') v = st.sea_grass_type === 'default' ? 'seagrass' : 'tall_seagrass'; nameCache.set(k, v); } return v; };
  const S = {}; // por bioma
  const stat = b => S[b] || (S[b] = { cols: 0, depth: {}, floor: {}, onFloor: {}, kelpH: [], surface: {}, coralBlocks: 0, coralCols: 0, coralKind: {}, shore: 0, shoreTop: {}, shoreAbove: {}, caneH: {}, prof: {} });
  const inc = (o, k, n) => { o[k] = (o[k] || 0) + (n || 1); };
  for (const [area, ax, az] of areas) {
    const chunks = [];
    for (let cx = Math.floor((ax - R) / 16) + 1; cx < Math.floor((ax + R) / 16) - 1; cx++) for (let cz = Math.floor((az - R) / 16) + 1; cz < Math.floor((az + R) / 16) - 1; cz++) {
      const fin = await ctx.ldbGet(db, ctx.wioKey(cx, cz, 0, 0x36)); if (!fin || fin[0] !== 2) continue;
      chunks.push([cx, cz]);
    }
    // grade de nomes do trecho da área (só de y 30 a 100, onde está a água do mar)
    const Y0 = 30, Y1 = 100, H = Y1 - Y0 + 1, grid = new Map(), bio = new Map();
    for (const [cx, cz] of chunks) {
      const g = new Array(16 * 16 * H).fill('air');
      for (let sy = Math.floor(Y0 / 16); sy <= Math.floor(Y1 / 16); sy++) {
        const raw = await ctx.ldbGet(db, ctx.wioKey(cx, cz, 0, 0x2f, sy)); if (!raw) continue;
        const dec = ctx.subDecode(raw); if (!dec) continue;
        const L0 = dec.layers[0], L1 = dec.layers[1];
        for (let i = 0; i < 4096; i++) {
          const y = sy * 16 + (i & 15); if (y < Y0 || y > Y1) continue;
          let n = nm(L0.pal[L0.idx[i]]); if (n === 'air' && L1) { const n1 = nm(L1.pal[L1.idx[i]]); if (WATERY.test(n1)) n = 'water'; }
          if (WATERY.test(n)) n = 'water';
          g[(((i >> 8) * 16) + ((i >> 4) & 15)) * H + (y - Y0)] = n;
        }
      }
      grid.set(cx + ',' + cz, g);
      const d3 = await ctx.ldbGet(db, ctx.wioKey(cx, cz, 0, 0x2b)); if (d3) bio.set(cx + ',' + cz, ctx.bioDecode3D(d3));
    }
    const at = (x, y, z) => { if (y < Y0 || y > Y1) return 'air'; const g = grid.get((x >> 4) + ',' + (z >> 4)); return g ? g[(((x & 15) * 16) + (z & 15)) * H + (y - Y0)] : null; };
    const bioAt = (x, y, z) => { const b = bio.get((x >> 4) + ',' + (z >> 4)); if (!b) return -1; const s = b.subs[(y + 64) >> 4]; return s ? s[((x & 15) << 8) | ((z & 15) << 4) | (y & 15)] : -1; };
    // a coluna: a superfície da água mais alta e o fundo
    const col = (x, z) => {
      let y = Y1; while (y >= Y0 && at(x, y, z) === 'air') y--;
      if (y < Y0) return null;
      let top = at(x, y, z), surf = null, ice = false, lily = false;
      if (top === 'waterlily' || top === 'lily_pad') { lily = true; y--; top = at(x, y, z); }
      if (top === 'ice' || top === 'packed_ice' || top === 'blue_ice') { if (at(x, y - 1, z) === 'water') { ice = true; y--; top = 'water'; } }
      if (top === 'water' || (AQUA.test(top) && at(x, y - 1, z) !== null)) {
        // superfície: a água mais alta (pode haver planta aquática nela)
        surf = y; let f = y; while (f >= Y0 && (at(x, f, z) === 'water' || AQUA.test(at(x, f, z)) && !/_block$/.test(at(x, f, z)))) f--;
        if (at(x, surf, z) !== 'water' && at(x, surf - 1, z) !== 'water') return { land: true, y, top };
        return { water: true, surf, floor: f, ice, lily };
      }
      return { land: true, y, top };
    };
    const cols = new Map();
    for (const [cx, cz] of chunks) for (let x = cx * 16; x < cx * 16 + 16; x++) for (let z = cz * 16; z < cz * 16 + 16; z++) cols.set(x + ',' + z, col(x, z));
    const C = (x, z) => cols.get(x + ',' + z);
    for (const [k, c] of cols) {
      if (!c) continue; const [x, z] = k.split(',').map(Number);
      if (c.water) {
        const b = BIO[bioAt(x, c.surf, z)] || '?', s = stat(b), dep = c.surf - c.floor;
        if (dep < 1) continue;
        s.cols++; inc(s.depth, dep); inc(s.floor, at(x, c.floor, z));
        const p = at(x, c.floor + 1, z); inc(s.onFloor, p === 'water' ? '-' : p);
        if (p === 'kelp') { let h = 0; while (at(x, c.floor + 1 + h, z) === 'kelp') h++; s.kelpH.push([h, dep]); }
        inc(s.surface, c.ice ? 'ice' : c.lily ? 'lily_pad' : '-');
        let cb = 0; for (let y = c.floor - 6; y <= c.surf; y++) { const q = at(x, y, z); if (/coral|sea_pickle/.test(q)) inc(s.coralKind, q); if (/coral_block$/.test(q)) cb++; } if (cb) { s.coralBlocks += cb; s.coralCols++; }
        // rio: distância até a margem (a coluna de terra mais perto, até 24)
        { // perfil: profundidade pela distância até a terra mais perto (até 40 blocos)
          let d = 0; search: for (d = 1; d <= 40; d++) for (let a = -d; a <= d; a++) for (const [qx, qz] of [[x + a, z - d], [x + a, z + d], [x - d, z + a], [x + d, z + a]]) { const q = C(qx, qz); if (q && q.land) break search; }
          if (d <= 40) { const pr = s.prof[d] || (s.prof[d] = [0, 0]); pr[0] += dep; pr[1]++; }
        }
      } else if (c.land) {
        // margem: terra encostada numa coluna de água, com o chão no nível da água ou até 2 acima
        let w = null; for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const q = C(x + dx, z + dz); if (q && q.water) w = q; }
        if (!w) continue;
        let gy = c.y, top = c.top, plant = '-';
        if (!/^(grass_block|dirt|coarse_dirt|sand|red_sand|gravel|clay|mud|stone|podzol|mycelium|sandstone|snow_block|packed_ice|ice|moss_block|muddy_mangrove_roots|mangrove_roots|terracotta|.*_terracotta|andesite|diorite|granite|dirt_with_roots|rooted_dirt|snow_layer)$/.test(top)) {
          plant = top; let y = gy; while (y > Y0 && !/^(grass_block|dirt|coarse_dirt|sand|red_sand|gravel|clay|mud|stone|podzol|mycelium|sandstone|snow_block|moss_block|muddy_mangrove_roots|terracotta|.*_terracotta|andesite|diorite|granite|rooted_dirt)$/.test(at(x, y, z)) && at(x, y, z) !== 'water') y--;
          gy = y; top = at(x, y, z);
        }
        const dh = gy - w.surf; if (dh < 0 || dh > 2) continue;
        const b = BIO[bioAt(x, gy, z)] || '?', s = stat(b);
        s.shore++; inc(s.shoreTop, top); inc(s.shoreAbove, plant === 'snow_layer' ? 'snow' : plant);
        if (plant === 'reeds' || plant === 'sugar_cane') { let h = 0; while (/reeds|sugar_cane/.test(at(x, gy + 1 + h, z))) h++; inc(s.caneH, h); }
      }
    }
    process.stderr.write(area + ': ' + chunks.length + ' chunks\n');
  }
  console.log(JSON.stringify(S));
})();
