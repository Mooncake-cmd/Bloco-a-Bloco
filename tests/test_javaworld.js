// Teste do leitor e do gravador de mundos do Java (src/javaworld.js) com o mundo de teste tests/fixtures/mundo-java.zip
// (gerado por scripts/gen_javaworld.py): regiões, chunks, longs empacotados, paleta e regravação de um arquivo de região.
const fs = require('fs'), path = require('path'), vm = require('vm'), zlib = require('zlib');
function check(ok, msg) { if (!ok) { console.error('FALHOU: ' + msg); process.exitCode = 1; } else console.log('ok: ' + msg); }
function unzip(buf) {
  let e = buf.length - 22; while (buf.readUInt32LE(e) !== 0x06054b50) e--;
  const n = buf.readUInt16LE(e + 10); let p = buf.readUInt32LE(e + 16); const out = {};
  for (let i = 0; i < n; i++) {
    const m = buf.readUInt16LE(p + 10), cs = buf.readUInt32LE(p + 20), nl = buf.readUInt16LE(p + 28), xl = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32), off = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nl); p += 46 + nl + xl + cl;
    const st = off + 30 + buf.readUInt16LE(off + 26) + buf.readUInt16LE(off + 28), raw = buf.subarray(st, st + cs);
    out[name] = new Uint8Array(m === 8 ? zlib.inflateRawSync(raw) : raw);
  }
  return out;
}
const root = path.join(__dirname, '..');
const ctx = { console, TextDecoder, TextEncoder, Blob, Response, DecompressionStream, CompressionStream, Uint8Array, Uint16Array, Uint32Array, Int16Array, DataView, Map, Set, Math, String, Number, JSON, Array, Object, Promise };
vm.createContext(ctx);
ctx.BIOMES = JSON.parse(fs.readFileSync(path.join(root, 'data/biomes.json'), 'utf8')); ctx.BIO_BY_ID = {}; ctx.BIOMES.forEach(b => { ctx.BIO_BY_ID[b.id] = b; });
ctx.MCExport = require(path.join(root, 'src/exporters.js'));
vm.runInContext(fs.readFileSync(path.join(root, 'src/import.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'src/worldio.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'src/javaworld.js'), 'utf8'), ctx);
(async () => {
  // longs empacotados: ida e volta com vários tamanhos (sem atravessar); e a versão que atravessa (.litematic)
  let okp = true;
  for (const bits of [1, 2, 4, 5, 6, 7, 9, 12, 15]) {
    const idx = new Uint16Array(4096).map((_, i) => (i * 2654435761 >>> 7) & ((1 << bits) - 1));
    const back = ctx.jwUnpack(ctx.jwPack(idx, bits), bits, 4096);
    if (!idx.every((v, i) => v === back[i])) okp = false;
  }
  check(okp, 'longs empacotados: empacotar e desempacotar dá os mesmos índices (1 a 15 bits)');
  const vals = Array.from({ length: 40 }, (_, i) => (i * 5 + 3) & 7); let big = 0n; vals.forEach((v, i) => { big |= BigInt(v) << BigInt(3 * i); });
  const sp = new Uint8Array(16), sdv = new DataView(sp.buffer); sdv.setBigUint64(0, big & ((1n << 64n) - 1n)); sdv.setBigUint64(8, big >> 64n);
  const sv = ctx.jwUnpack(sp, 3, 40, null, true);
  check(vals.every((v, i) => v === sv[i]), 'longs que atravessam (.litematic): os valores que cruzam a divisa entre longs são lidos inteiros');
  // abrir o mundo de teste (zip falso com as entradas já extraídas)
  const files = unzip(fs.readFileSync(path.join(__dirname, 'fixtures/mundo-java.zip')));
  const zip = { paths: Object.keys(files), read: async n => files[n] };
  const w = await ctx.jwOpen({ zip, blob: null, prefix: 'Mundo Java de teste/', java: true });
  ctx.wio = w;
  check(w.name === 'Mundo Java de teste' && w.player && w.player.x === 24, 'level.dat: nome e posição do jogador');
  check(w.dims[0].size === 18 && w.dims[1].size === 1 && w.dims[2].size === 1, 'regiões: 18 chunks no mundo normal, 1 no Nether, 1 no End (entities/ ignorada)');
  const t = await ctx.jwChunk(0, 1, 1), sec = t && ctx.jwSections(t).find(s => ctx.nbtVal(s, 'Y') === 4), dec = sec && ctx.jwSecDecode(sec);
  const keyAt = (x, y, z) => dec.pal[dec.idx[((y & 15) << 8) | (z << 4) | x]];
  check(dec && keyAt(4, 65, 4) === 'minecraft:chest[facing=north,type=single,waterlogged=false]' && keyAt(5, 65, 7) === 'minecraft:oak_log[axis=x]', 'chunk 1,1 (zlib): baú e tronco deitado com as propriedades');
  check((await ctx.jwChunk(0, 0, 0)) && (await ctx.jwChunk(0, 3, 3)), 'chunks com gzip (0,0) e sem compressão (3,3) abertos');
  check((await ctx.jwChunk(0, 5, 0)) === null && w.dims[0].get('5,0').ok === false, 'chunk incompleto (Status features) fica como não gerado');
  // trocar um bloco, regravar a região e ler de novo
  dec.idx[((65 & 15) << 8) | (4 << 4) | 4] = dec.pal.length; dec.pal.push('minecraft:gold_block');
  ctx.jwSecEncode(sec, dec.pal, dec.idx); ctx.jwPut(0, 1, 1, t, true);
  const reg = await ctx.jwRegionRebuild('Mundo Java de teste/region/r.0.0.mca', new Map([[1 * 32 + 1, w.patches.get('j0:1,1')]]));
  files['Mundo Java de teste/region/r.0.0.mca'] = reg; w.patches.clear(); w.rcache.clear();
  const t2 = await ctx.jwChunk(0, 1, 1), d2 = ctx.jwSecDecode(ctx.jwSections(t2).find(s => ctx.nbtVal(s, 'Y') === 4));
  check(d2.pal[d2.idx[((65 & 15) << 8) | (4 << 4) | 4]] === 'minecraft:gold_block' && d2.pal[d2.idx[((65 & 15) << 8) | (7 << 4) | 5]] === 'minecraft:oak_log[axis=x]', 'região regravada: o bloco trocado e os outros lidos de volta');
  check(ctx.nbtVal(t2.v, 'isLightOn') === 0 && !ctx.nbtGet(t2.v, 'Heightmaps'), 'chunk mudado: luz e mapa de alturas marcados para o jogo refazer');
  check((await ctx.jwChunk(0, 3, 3)) && (await ctx.jwChunk(0, 0, 0)), 'os outros chunks da região continuam legíveis');
  check(ctx.jwBioId('minecraft:snowy_plains') === 12 && ctx.jwBioName(12) === 'minecraft:snowy_plains' && ctx.jwBioName(17) === 'minecraft:desert', 'biomas: nomes do Java <-> números do Bedrock (e o mais parecido para os que só existem no Bedrock)');
})();
