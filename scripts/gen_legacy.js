// Gera data/legacy-pe.json: a tradução do formato antigo do Bedrock (Pocket Edition até a 1.0, chunks "LegacyTerrain":
// blocos por número e valor de dados) para os nomes do Java que o site usa, mais a luz de cada bloco e os números
// dos itens. Fontes (minecraft-data): bedrock/common/legacy.json (número:dados -> nome antigo do Bedrock com estados),
// bedrock/1.17.10/blocksB2J.json (nome antigo do Bedrock -> Java), pc/1.20/blocks.json (luz) e bedrock/1.0/items.json (itens).
// node scripts/gen_legacy.js
const fs = require('fs'), path = require('path');
const base = path.join(__dirname, '..', 'node_modules/minecraft-data/minecraft-data/data/bedrock/');
const L = require(base + 'common/legacy.json').blocks, B2J = require(base + '1.17.10/blocksB2J.json');
const items10 = require(base + '1.0/items.json');
const norm = k => { const m = /^([^\[]+)(?:\[(.*)\])?$/.exec(k); const st = (m[2] || '').split(',').filter(Boolean).sort(); return { n: m[1], st, key: m[1] + '[' + st.join(',') + ']' }; };
const BN = {}, byName = {};
for (const k in B2J) { const q = norm(k); BN[q.key] = B2J[k]; (byName[q.n] = byName[q.n] || []).push(q); }
const out = { b: {}, l: {}, i: {}, u: {} }; // u: os sem tradução (o nome antigo, para voltar igual)
let direto = 0, aprox = 0, falta = [];
for (const k in L) {
  const id = +k.split(':')[0]; if (id > 255) continue;
  const q = norm(L[k]); let j = BN[q.key];
  if (j) direto++;
  else if (byName[q.n]) { // estado fora do comum: o do mesmo bloco com mais estados iguais
    let best = null, bs = -1;
    byName[q.n].forEach(c => { const s = c.st.filter(x => q.st.includes(x)).length; if (s > bs) { bs = s; best = c; } });
    j = BN[best.key]; aprox++;
  } else { falta.push(k + ' ' + L[k]); out.u[k] = L[k]; continue; }
  out.b[k] = j.replace(/^minecraft:/, '').replace(/\[\]$/, '');
}
// luz: a do Java 1.20 pelo nome (a tabela do Bedrock 1.0 não tem a luz das tochas): [emite, quanto barra (15 = opaco)]
const pc = require(path.join(__dirname, '..', 'node_modules/minecraft-data/minecraft-data/data/pc/1.20/blocks.json')), PC = {};
pc.forEach(b => { PC[b.name] = b; });
new Set(Object.values(out.b).map(j => j.replace(/\[.*$/, ''))).forEach(n => { const b = PC[n]; if (b && (b.emitLight || b.filterLight !== 15)) out.l[n] = [b.emitLight || 0, b.filterLight == null ? 15 : b.filterLight]; });
items10.forEach(it => { out.i[it.id] = it.name; });
fs.writeFileSync(path.join(__dirname, '..', 'data/legacy-pe.json'), JSON.stringify(out));
console.log('blocos: ' + direto + ' diretos, ' + aprox + ' aproximados, ' + falta.length + ' sem tradução: ' + falta.join(' | '));
console.log('luz: ' + Object.keys(out.l).length + ' blocos; itens: ' + Object.keys(out.i).length);
