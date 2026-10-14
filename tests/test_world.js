// Teste do leitor e do gravador de mundos do Bedrock (src/worldio.js) com o mundo de teste (tests/fixtures/mundo-teste.mcworld,
// gerado por scripts/gen_testworld.py com o LevelDB da Mojang): índice do banco, sub-chunks e arquivo de registro (.log).
const fs = require('fs'), path = require('path'), vm = require('vm'), zlib = require('zlib');
function check(ok, msg) { if (!ok) { console.error('FALHOU: ' + msg); process.exitCode = 1; } else console.log('ok: ' + msg); }
// .zip mínimo (diretório central + deflate)
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
const ctx = { console, TextDecoder, TextEncoder, Blob, Response, DecompressionStream, Uint8Array, DataView, Map, Set, Math, String, Number, JSON, Array, Object, Promise };
vm.createContext(ctx);
ctx.MCExport = require(path.join(root, 'src/exporters.js'));
vm.runInContext(fs.readFileSync(path.join(root, 'src/import.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'src/worldio.js'), 'utf8'), ctx);
(async () => {
  const files = unzip(fs.readFileSync(path.join(__dirname, 'fixtures/mundo-teste.mcworld')));
  const names = Object.keys(files).filter(n => n.startsWith('db/')).map(n => n.slice(3));
  const read = async n => files['db/' + n];
  const db = await ctx.ldbOpen(names, read);
  let live = 0, subs = 0; db.idx.forEach((r, k) => { if (r.t === 1) live++; if (r.t === 1 && k.length === 10 && k.charCodeAt(8) === 0x2f) subs++; });
  check(live === 912, 'índice do banco: 912 chaves (achou ' + live + ')');
  check(subs === 572, 'sub-chunks do mundo normal: 572 (achou ' + subs + ')');
  // sub-chunk: decodificar, gravar de novo e decodificar dá os mesmos blocos
  let same = true, n = 0;
  for (const [k, r] of db.idx) {
    if (r.t !== 1 || k.length !== 10 || k.charCodeAt(8) !== 0x2f) continue;
    const raw = await ctx.ldbGet(db, k), a = ctx.subDecode(raw), y = k.charCodeAt(9), b = ctx.subDecode(ctx.subEncode(y, a.layers));
    for (let L = 0; L < a.layers.length && same; L++) for (let i = 0; i < 4096; i++) {
      if (ctx.wioStr(a.layers[L].pal[a.layers[L].idx[i]]) !== ctx.wioStr(b.layers[L].pal[b.layers[L].idx[i]])) { same = false; break; }
    }
    if (++n >= 120) break;
  }
  check(same, 'sub-chunks: decodificar, regravar e decodificar mantém todos os blocos (' + n + ' testados)');
  // casa: baú com itens e cama azul nos dados de blocos do chunk (-1, -1) e (0, -1)
  const be = ctx.nbtList(await ctx.ldbGet(db, ctx.wioKey(-1, -1, 0, 0x31)));
  check(be.length === 1 && be[0].o.id === 'Chest' && be[0].o.Items.length === 2, 'dados do baú com 2 itens');
  // arquivo de registro: uma gravação nova e uma remoção ganham das tabelas
  const k1 = ctx.wioKey(0, 0, 0, 0x2f, 5), k2 = ctx.wioKey(-1, -1, 0, 0x31), big = new Uint8Array(70000).map((_, i) => i * 7);
  const log = ctx.ldbLogWrite([[k1, big], [k2, null]], db.maxSeq + 1);
  files['db/000099.log'] = log;
  const db2 = await ctx.ldbOpen(names.concat(['000099.log']), read);
  const v1 = await ctx.ldbGet(db2, k1), v2 = await ctx.ldbGet(db2, k2);
  check(v1 && v1.length === big.length && v1.every((x, i) => x === big[i]), 'registro: valor de 70 KB (mais de um bloco de 32 KB) lido de volta igual');
  check(v2 === null, 'registro: chave apagada some');
  check((await ctx.ldbGet(db2, ctx.wioKey(1, 1, 0, 0x2f, 3))) !== null, 'registro: as outras chaves continuam');
  // CRC32C do registro (valor conhecido: "123456789" -> e3069283)
  check(ctx.crc32c(new TextEncoder().encode('123456789')) === 0xe3069283, 'CRC32C');
})();
