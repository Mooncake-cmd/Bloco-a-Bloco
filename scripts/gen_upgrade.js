// Gera data/bedrock-upgrade.json a partir das tabelas de atualização de blocos do Bedrock
// (https://github.com/pmmp/BedrockBlockUpgradeSchema, domínio público/CC0): node scripts/gen_upgrade.js <pasta nbt_upgrade_schema>
// Cada tabela leva os nomes e estados de uma versão do jogo para a seguinte (ex.: 1.20.70 renomeou grass para grass_block
// e separou leaves em oak_leaves, spruce_leaves...). O site aplica em ordem as que vêm depois da versão gravada no bloco.
const fs = require('fs'), path = require('path');
const dir = process.argv[2], out = [];
const strip = s => s.replace(/^minecraft:/, '');
const val = t => t == null ? null : 'byte' in t ? t.byte : 'int' in t ? t.int : t.string;
const props = o => { if (!o) return null; const r = {}; for (const k in o) r[k] = val(o[k]); return r; };
const byName = (o, f) => { if (!o) return undefined; const r = {}; for (const k in o) r[strip(k)] = f(o[k]); return r; };
const flat = f => f && { p: strip(f.prefix), k: f.flattenedProperty, s: f.suffix, m: f.flattenedValueRemaps };
for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort()) {
  const d = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')), e = {};
  e.v = ((d.maxVersionMajor << 24) | (d.maxVersionMinor << 16) | (d.maxVersionPatch << 8) | d.maxVersionRevision) >>> 0;
  if (d.renamedIds) e.r = byName(d.renamedIds, strip);
  if (d.addedProperties) e.a = byName(d.addedProperties, props);
  if (d.removedProperties) e.d = byName(d.removedProperties, x => x);
  if (d.renamedProperties) e.rp = byName(d.renamedProperties, x => x);
  if (d.remappedPropertyValues) e.vp = byName(d.remappedPropertyValues, x => x);
  if (d.remappedPropertyValuesIndex) { e.vi = {}; for (const k in d.remappedPropertyValuesIndex) e.vi[k] = d.remappedPropertyValuesIndex[k].map(x => [val(x.old), val(x.new)]); }
  if (d.flattenedProperties) e.f = byName(d.flattenedProperties, flat);
  if (d.remappedStates) e.s = byName(d.remappedStates, a => a.map(x => {
    const r = { o: props(x.oldState), n: props(x.newState) };
    if (x.newName) r.nm = strip(x.newName); else r.nf = flat(x.newFlattenedName);
    if (x.copiedState) r.c = x.copiedState;
    return r;
  }));
  out.push(e);
}
fs.writeFileSync(path.join(__dirname, '../data/bedrock-upgrade.json'), JSON.stringify(out));
console.log(out.length + ' tabelas, ' + fs.statSync(path.join(__dirname, '../data/bedrock-upgrade.json')).size + ' bytes');

// Blocos ainda mais antigos (até a 1.12) gravam o tipo como número (val) em vez de estados: id_meta_to_nbt/1.12.0.bin
// dá, para cada nome e val, os estados da 1.12.0; dali as tabelas acima seguem até hoje.
// node scripts/gen_upgrade.js <pasta nbt_upgrade_schema> <id_meta_to_nbt/1.12.0.bin>
if (process.argv[3]) {
  const u = fs.readFileSync(process.argv[3]); let p = 0;
  const vu = () => { let r = 0, s = 0, b; do { b = u[p++]; r |= (b & 127) << s; s += 7; } while (b & 128); return r >>> 0; };
  const str = () => { const n = u.readUInt16LE(p); p += 2; const s = u.toString('utf8', p, p + n); p += n; return s; };
  function tag(t) {
    switch (t) {
      case 1: return u.readInt8(p++);
      case 2: p += 2; return u.readInt16LE(p - 2);
      case 3: p += 4; return u.readInt32LE(p - 4);
      case 8: return str();
      case 10: { const o = {}; for (;;) { const tt = u[p++]; if (!tt) return o; const k = str(); o[k] = tag(tt); } }
      default: throw new Error('tag ' + t);
    }
  }
  const n = vu(), map = {};
  for (let i = 0; i < n; i++) {
    const nl = vu(), name = strip(u.toString('utf8', p, p + nl)); p += nl;
    const m = vu(), e = {};
    for (let j = 0; j < m; j++) {
      const meta = vu(); if (u[p++] !== 10) throw new Error('nbt'); str(); const o = tag(10);
      const st = o.states || {}, nn = strip(o.name);
      e[meta] = nn === name ? st : [nn, st];
    }
    map[name] = e;
  }
  fs.writeFileSync(path.join(__dirname, '../data/bedrock-val.json'), JSON.stringify(map));
  console.log(n + ' blocos com val, ' + fs.statSync(path.join(__dirname, '../data/bedrock-val.json')).size + ' bytes');
}
