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
const ctx = { console, TextDecoder, TextEncoder, Blob, Response, DecompressionStream, CompressionStream, ReadableStream, Uint8Array, DataView, Map, Set, Math, String, Number, JSON, Array, Object, Promise };
vm.createContext(ctx);
ctx.MCExport = require(path.join(root, 'src/exporters.js'));
vm.runInContext(fs.readFileSync(path.join(root, 'src/import.js'), 'utf8').replace('/*%%UPGRADE%%*/[]', () => fs.readFileSync(path.join(root, 'data/bedrock-upgrade.json'), 'utf8')).replace('/*%%BEVAL%%*/{}', () => fs.readFileSync(path.join(root, 'data/bedrock-val.json'), 'utf8')), ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'src/worldio.js'), 'utf8'), ctx);
(async () => {
  const files = unzip(fs.readFileSync(path.join(__dirname, 'fixtures/mundo-teste.mcworld')));
  const names = Object.keys(files).filter(n => n.startsWith('db/')).map(n => n.slice(3));
  const read = async n => files['db/' + n];
  const db = await ctx.ldbOpen(names, read);
  let live = 0, subs = 0; db.idx.forEach((r, k) => { if (r.t === 1) live++; if (r.t === 1 && k.length === 10 && k.charCodeAt(8) === 0x2f) subs++; });
  check(live === 998, 'índice do banco: 998 chaves (com o Fim) (achou ' + live + ')');
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
  // nomes de versões antigas do jogo (mundo salvo na 1.18.31): grama, folhas com o tipo no estado, granito
  const V118 = 0x01121E04, up = (n, st) => JSON.stringify(ctx.beUpgrade(n, st, V118));
  check(up('grass', {}) === '["grass_block",{}]' && up('leaves', { old_leaf_type: 'birch', persistent_bit: 0, update_bit: 1 }) === '["birch_leaves",{"persistent_bit":0,"update_bit":1}]'
    && up('stone', { stone_type: 'granite' }) === '["granite",{}]' && up('grass_block', {}) === '["grass_block",{}]', 'nomes antigos do Bedrock: grass, leaves e stone_type viram os de hoje');
  check(JSON.stringify(ctx.beUpgrade('log', null, 0, 1)) === '["spruce_log",{"pillar_axis":"y"}]' && ctx.beUpgrade('tallgrass', null, 0, 2)[0] === 'fern' && ctx.beUpgrade('red_flower', null, 0, 0)[0] === 'poppy', 'blocos de antes da 1.13 (val): log 1 = tronco de abeto, tallgrass 2 = samambaia, red_flower 0 = papoula');
  // .log lido aos poucos (mundos com .log enormes): pedaços de tamanho qualquer, os mesmos valores
  const stream = async n => new ReadableStream({ start(c) { const u = files['db/' + n]; for (let i = 0; i < u.length; i += 5000) c.enqueue(u.slice(i, i + 5000)); c.close(); } });
  const db3 = await ctx.ldbOpen(names.concat(['000099.log']), read, null, stream);
  let eq = db3.idx.size === db2.idx.size, big3 = 0;
  for (const [k, r] of db2.idx) {
    const a = await ctx.ldbGet(db2, k), b = await ctx.ldbGet(db3, k);
    if ((a === null) !== (b === null) || (a && (a.length !== b.length || !a.every((x, i) => x === b[i])))) { eq = false; break; }
    if (db3.idx.get(k).f === -3) big3++;
  }
  check(eq && big3 > 0, '.log lido aos poucos: as mesmas chaves e valores, os grandes guardados comprimidos (' + big3 + ')');
  // mundo novo: level.dat do modelo com nome, gerador plano e ponto de nascimento trocados; MANIFEST legível
  ctx.atob = s => Buffer.from(s, 'base64').toString('latin1');
  ctx.NW_LEVEL = fs.readFileSync(path.join(root, 'data/leveldat-plano.dat')).toString('base64');
  const lv = ctx.nwLevelDat('Construção nova', 64, 96), tree = ctx.nbtTreeLE(lv.subarray(8)), get = k => (tree.v.find(e => e.k === k) || {}).v;
  check(new DataView(lv.buffer, lv.byteOffset).getInt32(4, true) === lv.length - 8, 'level.dat: tamanho no cabeçalho');
  check(get('LevelName') === 'Construção nova' && get('Generator') === 2 && get('GameType') === 1 && get('SpawnX') === 32 && get('SpawnZ') === 48, 'level.dat: nome, mundo plano, criativo e nascimento no meio');
  check(ctx.wioStr(ctx.nbtTreeWrite(ctx.nbtTreeLE(fs.readFileSync(path.join(root, 'data/leveldat-plano.dat')).subarray(8)))) === ctx.wioStr(new Uint8Array(fs.readFileSync(path.join(root, 'data/leveldat-plano.dat')).subarray(8))), 'NBT genérico: ler e gravar o level.dat dá os mesmos bytes');
  const man = ctx.ldbManifest(ctx.nwManifest(5));
  check(man.ok && man.log === 3 && man.next === 4 && man.seq === 5, 'MANIFEST do mundo novo: log 3, próximo arquivo 4, sequência 5');
  // CRC32C do registro (valor conhecido: "123456789" -> e3069283)
  check(ctx.crc32c(new TextEncoder().encode('123456789')) === 0xe3069283, 'CRC32C');
})();
