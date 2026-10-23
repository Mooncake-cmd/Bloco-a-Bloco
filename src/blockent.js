/* ---------- Conteúdo dos blocos: itens de baús, ejetores, funis... e o texto das placas ---------- */
/* Os dados que o jogo guarda fora do estado do bloco (a entidade de bloco). O editor guarda por célula (bent: índice ->
   registro) só o que dá para levar de um jogo para o outro:
     contêiner: { k: 'inv', items: [[id, quantidade, espaço], ...], fv }   (id sem "minecraft:")
     placa:     { k: 'sign', f: { t: [4 linhas], c: cor, g: brilho }, b: { ... } (o verso), w: encerada }
   Vem de .litematic, .schem, .mcstructure, mundos do Bedrock e do Java; vai para os mesmos (mundo, .mcstructure, .schem).
   Encantamentos, nomes e outros dados dos itens ficam de fora.
   A simulação da redstone conta os itens pelo rsFill (um tipo de item e a quantidade por contêiner): ao entrar, o
   conteúdo vira também um rsFill (fv guarda o valor). Se a simulação ou a janela de conteúdo mudarem o rsFill, ele passa
   a valer (os itens saem dele); senão, valem os itens originais, espaço por espaço. */
var bent = new Map(), bentSave = false, bentDirty = new Set();
var BE_INV = /^(chest|trapped_chest|barrel|hopper|dropper|dispenser|furnace|blast_furnace|smoker|brewing_stand|crafter|(\w+_)?shulker_box|(waxed_)?((exposed|weathered|oxidized)_)?copper_chest)$/;
var BE_SIGN = /_sign$/;
var BE_ITEM_CODE = { arrow: 1, snowball: 2, egg: 3, water_bucket: 4, lava_bucket: 5, bucket: 6, bone_meal: 7, flint_and_steel: 8 };
var BE_CODE_ITEM = ['cobblestone', 'arrow', 'snowball', 'egg', 'water_bucket', 'lava_bucket', 'bucket', 'bone_meal', 'flint_and_steel'];
var BE_COLORS = { white: 0xFFF0F0F0, orange: 0xFFF9801D, magenta: 0xFFC74EBD, light_blue: 0xFF3AB3DA, yellow: 0xFFFED83D, lime: 0xFF80C71F, pink: 0xFFF38BAA, gray: 0xFF474F52,
  light_gray: 0xFF9D9D97, cyan: 0xFF169C9C, purple: 0xFF8932B8, blue: 0xFF3C44AA, brown: 0xFF835432, green: 0xFF5E7C16, red: 0xFFB02E26, black: 0xFF000000 };
var BE_COLOR_PT = { white: 'branco', orange: 'laranja', magenta: 'magenta', light_blue: 'azul-claro', yellow: 'amarelo', lime: 'verde-limão', pink: 'rosa', gray: 'cinza',
  light_gray: 'cinza-claro', cyan: 'ciano', purple: 'roxo', blue: 'azul', brown: 'marrom', green: 'verde', red: 'vermelho', black: 'preto' };
function beSlots(j) {
  if (/^(dropper|dispenser|crafter)$/.test(j)) return 9;
  if (j === 'hopper' || j === 'brewing_stand') return 5;
  if (/furnace$|^smoker$/.test(j)) return 3;
  return 27;
}
function beKind(j) { return BE_INV.test(j) ? 'inv' : BE_SIGN.test(j) ? 'sign' : null; }
function beJ(i) { var v = gat(i); if (!v || cellBlock(v) === PRES_BI) return null; return BLOCKS[cellBlock(v)].java; }
function beId(s) { return String(s || '').replace(/^minecraft:/, ''); }
/* Valor de rsFill que representa os itens (para a simulação e o comparador) */
function beFillOf(items, j) {
  if (!items || !items.length) return 0;
  if (j === 'crafter') return Math.min(9, items.length);
  var code = BE_ITEM_CODE[items[0][0]] || 0, n = 0;
  items.forEach(function (it) { if ((BE_ITEM_CODE[it[0]] || 0) === code) n += it[1]; });
  return n > 0 ? 16 + Math.min(4095, n) + 4096 * code : 0;
}
/* Registro de uma célula; mark: o conteúdo mudou (vai para o mundo ao exportar) */
function bentSet(i, be, mark) {
  var j = beJ(i);
  if (!be || !j || beKind(j) !== be.k) { if (bent.delete(i)) bentSave = true; return; }
  if (be.k === 'inv') {
    be.items = (be.items || []).filter(function (it) { return it[0] && it[1] > 0; });
    be.fv = beFillOf(be.items, j);
    if (j !== 'jukebox') { if (be.fv) rsFill.set(i, be.fv); else rsFill.delete(i); rsFillSave = true; }
  }
  bent.set(i, be); bentSave = true;
  if (mark) bentMark(i);
}
function bentMark(i) {
  bentDirty.add(i);
  if (wio && wio.area) { var p = unidx(i); wio.edited.add((p[0] >> 4) + ',' + (p[1] >> 4) + ',' + (p[2] >> 4)); }
}
/* Itens que valem na célula: os originais (se a simulação não mexeu) ou os que saem do rsFill */
function beItems(i, j) {
  var be = bent.get(i), fv = rsFill.get(i) || 0;
  if (be && be.k === 'inv' && be.fv === fv) return be.items;
  if (!fv || j === 'jukebox' || j === 'crafter') return [];
  var q = rsInv(i, j), id = BE_CODE_ITEM[q.code] || 'cobblestone', st = RS_ITEMS[q.code].s, out = [], n = q.n, s = 0;
  while (n > 0 && s < beSlots(j)) { var k = Math.min(st, n); out.push([id, k, s++]); n -= k; }
  return out;
}
function beSign(i) { var be = bent.get(i); return be && be.k === 'sign' ? be : null; }
/* Há algo para gravar no jogo? */
function beHas(i, j) { var k = beKind(j); return k === 'inv' ? beItems(i, j).length > 0 : k === 'sign' ? !!beSign(i) : false; }

/* ---------- Leitura ---------- */
/* Texto de uma linha de placa do Java: JSON ("\"oi\"" ou {"text": ...}), texto puro (1.21.5+) ou um compound */
function beJavaLine(m) {
  var s = m;
  if (s && typeof s === 'object') return beTextOf(s);
  s = String(s == null ? '' : s);
  if (/^["{\[]/.test(s)) { try { return beTextOf(JSON.parse(s)); } catch (e) {} }
  return s;
}
function beTextOf(o) {
  if (o == null) return '';
  if (typeof o === 'string') return o;
  if (Array.isArray(o)) return o.map(beTextOf).join('');
  return String(o.text != null ? o.text : '') + (o.extra ? o.extra.map(beTextOf).join('') : '');
}
function beFromJava(o, j) {
  var k = beKind(j); if (!k || !o) return null;
  if (k === 'inv') {
    var items = (o.Items || o.items || []).map(function (it) { return [beId(it.id || it.Name), +(it.count != null ? it.count : it.Count != null ? it.Count : 1), +(it.Slot || 0) & 255]; });
    return items.length ? { k: 'inv', items: items } : null;
  }
  var side = function (t, old) {
    if (t) return { t: [0, 1, 2, 3].map(function (q) { return beJavaLine((t.messages || [])[q]); }), c: String(t.color || 'black'), g: +(t.has_glowing_text || 0) ? 1 : 0 };
    if (old) return { t: [1, 2, 3, 4].map(function (q) { return beJavaLine(o['Text' + q]); }), c: String(o.Color || 'black'), g: +(o.GlowingText || 0) ? 1 : 0 };
    return null;
  };
  var f = side(o.front_text, o.Text1 != null), b = side(o.back_text, false);
  if (!f && !b) return null;
  var be = { k: 'sign', f: f || { t: ['', '', '', ''], c: 'black', g: 0 }, b: b || { t: ['', '', '', ''], c: 'black', g: 0 }, w: +(o.is_waxed || 0) ? 1 : 0 };
  return beSignEmpty(be) ? null : be;
}
function beColorName(argb) {
  var best = 'black', bd = 1e9, r = (argb >> 16) & 255, g = (argb >> 8) & 255, b = argb & 255;
  for (var k in BE_COLORS) { var c = BE_COLORS[k], d = Math.pow(((c >> 16) & 255) - r, 2) + Math.pow(((c >> 8) & 255) - g, 2) + Math.pow((c & 255) - b, 2); if (d < bd) { bd = d; best = k; } }
  return best;
}
function beFromBedrock(o, j) {
  var k = beKind(j); if (!k || !o) return null;
  if (k === 'inv') {
    var items = (o.Items || []).map(function (it) { return [beId(it.Name), +(it.Count || 0) & 255, +(it.Slot || 0) & 255]; }).filter(function (it) { return it[0] && it[1]; });
    return items.length ? { k: 'inv', items: items } : null;
  }
  var side = function (t) {
    if (!t) return { t: ['', '', '', ''], c: 'black', g: 0 };
    var L = String(t.Text || '').split('\n'); while (L.length < 4) L.push('');
    return { t: L.slice(0, 4), c: t.SignTextColor != null ? beColorName(t.SignTextColor >>> 0) : 'black', g: +(t.IgnoreLighting || 0) ? 1 : 0 };
  };
  var be = o.FrontText ? { k: 'sign', f: side(o.FrontText), b: side(o.BackText), w: +(o.IsWaxed || 0) ? 1 : 0 }
    : { k: 'sign', f: side({ Text: o.Text, SignTextColor: o.SignTextColor, IgnoreLighting: o.IgnoreLighting }), b: side(null), w: 0 }; // formato antigo
  return beSignEmpty(be) ? null : be;
}
function beSignEmpty(be) { return !be.f.t.join('') && !be.b.t.join('') && be.f.c === 'black' && !be.f.g && !be.w; }
/* Árvore NBT (nbtTreeLE: compound = [{k, t, v}], lista = {et, a}) -> objeto simples */
function nbtTreeObj(v, t) {
  if (t === 10 || (Array.isArray(v) && v.length && v[0] && v[0].k !== undefined) || (Array.isArray(v) && t == null)) { var o = {}; v.forEach(function (e) { o[e.k] = nbtTreeObj(e.v, e.t); }); return o; }
  if (t === 9 || (v && v.a)) return v.a.map(function (x) { return nbtTreeObj(x, v.et); });
  if (t === 1) return v > 127 ? v - 256 : v;
  return v;
}
/* Entidades de bloco do mundo do Bedrock (a lista do chunk) para as células da área: (x0, ymin, z0) = canto da área */
function bentLoadBedrock(list, x0, ymin, z0) {
  (list || []).forEach(function (e) {
    var o = e.o, x = o.x - x0, y = o.y - ymin, z = o.z - z0; if (!inB(x, y, z)) return;
    var i = idx(x, y, z), j = beJ(i); if (!j) return;
    var be = beFromBedrock(o, j); if (be) bentSet(i, be, false);
  });
}
function bentLoadJava(list, x0, ymin, z0) {
  (list || []).forEach(function (c) {
    var o = nbtTreeObj(c, 10), x = o.x - x0, y = o.y - ymin, z = o.z - z0; if (!inB(x, y, z)) return;
    var i = idx(x, y, z), j = beJ(i); if (!j) return;
    var be = beFromJava(o, j); if (be) bentSet(i, be, false);
  });
}

/* ---------- Escrita ---------- */
function beBedrockId(j) {
  if (/hanging_sign$/.test(j)) return 'HangingSign';
  if (BE_SIGN.test(j)) return 'Sign';
  if (/shulker_box$/.test(j)) return 'ShulkerBox';
  return { chest: 'Chest', trapped_chest: 'Chest', barrel: 'Barrel', hopper: 'Hopper', dropper: 'Dropper', dispenser: 'Dispenser', furnace: 'Furnace', blast_furnace: 'BlastFurnace',
    smoker: 'Smoker', brewing_stand: 'BrewingStand', crafter: 'Crafter' }[j] || (/copper_chest$/.test(j) ? 'Chest' : null);
}
/* Entidade para o Bedrock (formato de wioEntTags e do exportador do .mcstructure: número = byte, {t, v} = tipado) */
function beBedrockEnt(i, j) {
  var id = beBedrockId(j); if (!id || !beHas(i, j)) return null;
  var e = { id: id };
  if (beKind(j) === 'inv') {
    e.Items = { t: 'list', of: 'compound', v: beItems(i, j).map(function (it) {
      return { Name: { t: 'string', v: 'minecraft:' + it[0] }, Count: { t: 'byte', v: Math.min(127, it[1]) }, Damage: { t: 'short', v: 0 }, Slot: { t: 'byte', v: it[2] }, WasPickedUp: { t: 'byte', v: 0 } };
    }) };
    return e;
  }
  var be = beSign(i), side = function (s) {
    return { t: 'compound', v: { Text: { t: 'string', v: s.t.join('\n').replace(/\n+$/, '') }, SignTextColor: { t: 'int', v: (BE_COLORS[s.c] || BE_COLORS.black) | 0 }, IgnoreLighting: { t: 'byte', v: s.g ? 1 : 0 },
      HideGlowOutline: { t: 'byte', v: 0 }, PersistFormatting: { t: 'byte', v: 1 }, TextOwner: { t: 'string', v: '' }, FilteredText: { t: 'string', v: '' } } };
  };
  e.FrontText = side(be.f); e.BackText = side(be.b); e.IsWaxed = be.w ? 1 : 0;
  return e;
}
function beJavaId(j) {
  if (/hanging_sign$/.test(j)) return 'minecraft:hanging_sign';
  if (BE_SIGN.test(j)) return 'minecraft:sign';
  if (/shulker_box$/.test(j)) return 'minecraft:shulker_box';
  if (/copper_chest$/.test(j)) return 'minecraft:copper_chest';
  return 'minecraft:' + j;
}
/* Dados para o Java (1.21.5+: itens com "count", linhas da placa como texto), tipados {t, v} sem o id e a posição */
function beJavaData(i, j) {
  if (!beHas(i, j)) return null;
  if (beKind(j) === 'inv') return { Items: { t: 'list', of: 'compound', v: beItems(i, j).map(function (it) { return { Slot: { t: 'byte', v: it[2] }, id: { t: 'string', v: 'minecraft:' + it[0] }, count: { t: 'int', v: it[1] } }; }) } };
  var be = beSign(i), side = function (s) { return { t: 'compound', v: { messages: { t: 'list', of: 'string', v: s.t.slice(0, 4) }, color: { t: 'string', v: s.c }, has_glowing_text: { t: 'byte', v: s.g ? 1 : 0 } } }; };
  return { front_text: side(be.f), back_text: side(be.b), is_waxed: { t: 'byte', v: be.w ? 1 : 0 } };
}
/* Tipado {t, v} -> árvore NBT (para o chunk do Java) */
var BE_TAG = { byte: 1, short: 2, int: 3, long: 4, float: 5, double: 6, string: 8, list: 9, compound: 10 };
function beTypedTree(o) {
  return Object.keys(o).map(function (k) { return beTypedEntry(k, o[k]); });
}
function beTypedEntry(k, q) {
  var t = BE_TAG[q.t];
  if (q.t === 'compound') return { k: k, t: 10, v: beTypedTree(q.v) };
  if (q.t === 'list') { var et = BE_TAG[q.of]; return { k: k, t: 9, v: { et: et, a: q.v.map(function (x) { return et === 10 ? beTypedTree(x) : x; }) } }; }
  return { k: k, t: t, v: q.t === 'byte' ? q.v & 255 : q.v };
}
function beJavaTree(i, j, wx, wy, wz) {
  var d = beJavaData(i, j); if (!d) return null;
  return beTypedTree(Object.assign({ id: { t: 'string', v: beJavaId(j) }, x: { t: 'int', v: wx }, y: { t: 'int', v: wy }, z: { t: 'int', v: wz }, keepPacked: { t: 'byte', v: 0 } }, d));
}

/* ---------- Gravar no projeto e no navegador ---------- */
function bentRecord() { return { e: Array.from(bent), d: Array.from(bentDirty) }; }
function bentFrom(r) {
  bent = new Map(); bentDirty = new Set();
  if (Array.isArray(r)) r = { e: r };
  if (r && r.e) r.e.forEach(function (q) { bent.set(q[0], q[1]); });
  if (r && r.d) r.d.forEach(function (i) { bentDirty.add(i); });
  bentSave = false;
}
function bentReset() { bent = new Map(); bentDirty = new Set(); bentSave = true; }
/* Depois de mudar blocos: o registro sai de onde o bloco não é mais contêiner ou placa */
function bentCheck(i) { if (!bent.has(i)) return; var j = beJ(i), be = bent.get(i); if (!j || beKind(j) !== be.k) { bent.delete(i); bentSave = true; } }

/* ---------- Cópia: o conteúdo vai junto (índice local da cópia -> registro) ---------- */
function bentClipBox(a, b) {
  var d = [b[0] - a[0] + 1, b[1] - a[1] + 1, b[2] - a[2] + 1], m = new Map();
  bent.forEach(function (be, i) {
    var p = unidx(i); if (p[0] < a[0] || p[1] < a[1] || p[2] < a[2] || p[0] > b[0] || p[1] > b[1] || p[2] > b[2]) return;
    var j = beJ(i); if (!j) return;
    var e = be.k === 'inv' ? { k: 'inv', items: beItems(i, j).map(function (it) { return it.slice(); }) } : JSON.parse(JSON.stringify(be));
    if (e.k === 'inv' && !e.items.length) return;
    m.set(((p[1] - a[1]) * d[2] + (p[2] - a[2])) * d[0] + (p[0] - a[0]), e);
  });
  // contêineres só com a simulação (sem registro): os itens saem do rsFill
  rsFill.forEach(function (fv, i) {
    if (bent.has(i)) return; var p = unidx(i); if (p[0] < a[0] || p[1] < a[1] || p[2] < a[2] || p[0] > b[0] || p[1] > b[1] || p[2] > b[2]) return;
    var j = beJ(i); if (!j || beKind(j) !== 'inv') return; var it = beItems(i, j); if (!it.length) return;
    m.set(((p[1] - a[1]) * d[2] + (p[2] - a[2])) * d[0] + (p[0] - a[0]), { k: 'inv', items: it });
  });
  return m.size ? m : null;
}
/* Girar ou espelhar a cópia: o índice de cada registro segue o bloco (map(x, y, z) -> novo índice) */
function bentClipMap(be, w, h, l, fn) {
  if (!be) return null;
  var m = new Map();
  be.forEach(function (e, k) { var x = k % w, z = Math.floor(k / w) % l, y = Math.floor(k / (w * l)); m.set(fn(x, y, z), e); });
  return m;
}
function bentPasteAt(be, w, l, o) {
  if (!be) return 0; var n = 0;
  be.forEach(function (e, k) {
    var x = o[0] + k % w, z = o[2] + Math.floor(k / w) % l, y = o[1] + Math.floor(k / (w * l));
    if (!inB(x, y, z)) return; bentSet(idx(x, y, z), JSON.parse(JSON.stringify(e)), true); n++;
  });
  return n;
}

/* ---------- Ver e mudar ---------- */
function beItemName(id) {
  if (id in BY_JAVA) return BLOCKS[BY_JAVA[id]].name;
  return id.split('_').map(function (w) { return w.charAt(0).toUpperCase() + w.slice(1); }).join(' ');
}
var BE_ITEM_COL = { water_bucket: '#3f76e4', lava_bucket: '#e4741f', bucket: '#9aa1a6', arrow: '#8b6a3e', snowball: '#e8f2f7', egg: '#e8dcc0', bone_meal: '#f0efe6', flint_and_steel: '#6b6b6b',
  diamond: '#4ee2ec', emerald: '#17dd62', iron_ingot: '#d8d8d8', gold_ingot: '#fdf55f', redstone: '#ff0000', coal: '#2b2b2b', bread: '#c8913e', apple: '#e01e1e' };
function beSwatch(id) {
  if (id in BY_JAVA) return swatch(BLOCKS[BY_JAVA[id]]);
  var c = BE_ITEM_COL[id] || '#8a8f94';
  return 'background:' + c;
}
function beGrid(items, n) {
  var by = {}; items.forEach(function (it) { by[it[2]] = it; });
  var h = '<div class="begrid">';
  for (var s = 0; s < n; s++) {
    var it = by[s];
    h += '<div class="beslot" title="' + (it ? esc(beItemName(it[0]) + ' × ' + it[1] + ' (' + it[0] + ')') : 'vazio') + '">' + (it ? '<span class="sw" style="' + beSwatch(it[0]) + '"></span><b>' + (it[1] > 1 ? it[1] : '') + '</b>' : '') + '</div>';
  }
  return h + '</div>';
}
function beSummary(items) {
  var t = {}; items.forEach(function (it) { t[it[0]] = (t[it[0]] || 0) + it[1]; });
  return Object.keys(t).map(function (k) { return t[k] + ' × ' + beItemName(k); }).join(', ');
}
/* Linha da barra de status: o que tem no bloco apontado */
function beStatus(c) {
  if (!c || !inB(c[0], c[1], c[2])) return '';
  var i = idx(c[0], c[1], c[2]), j = beJ(i); if (!j) return '';
  var k = beKind(j);
  if (k === 'inv') { var it = beItems(i, j), sm = it.length ? beSummary(it).split(', ') : []; return sm.length > 3 ? sm.slice(0, 3).join(', ') + ' e mais ' + (sm.length - 3) : sm.join(', '); }
  if (k === 'sign') { var s = beSign(i); return s ? '“' + s.f.t.filter(Boolean).join(' / ') + '”' : ''; }
  return '';
}
/* A placa: frente e verso (4 linhas cada), cor, brilho e cera */
function openSign(c, b) {
  var i = idx(c[0], c[1], c[2]), be = beSign(i) || { k: 'sign', f: { t: ['', '', '', ''], c: 'black', g: 0 }, b: { t: ['', '', '', ''], c: 'black', g: 0 }, w: 0 };
  var cols = Object.keys(BE_COLORS).map(function (k) { return '<option value="' + k + '">' + BE_COLOR_PT[k] + '</option>'; }).join('');
  var side = function (p, s, lab) {
    return '<fieldset class="besign"><legend>' + lab + '</legend>' + s.t.map(function (l, q) { return '<input type="text" id="sg' + p + q + '" maxlength="90" value="' + esc(l) + '" aria-label="' + lab + ', linha ' + (q + 1) + '">'; }).join('') +
      '<div class="row"><label>Cor do texto<select id="sg' + p + 'c">' + cols + '</select></label><label class="check"><input type="checkbox" id="sg' + p + 'g"' + (s.g ? ' checked' : '') + '><span>Texto brilhante (tinta brilhante)</span></label></div></fieldset>';
  };
  openDialog('<h3>' + esc(b.name) + ': texto</h3><p>O que está escrito na placa. Vai junto ao exportar para o mundo, o .mcstructure e o .schem, e ao copiar e colar.</p>' +
    side('f', be.f, 'Frente') + side('b', be.b, 'Verso') +
    '<label class="check"><input type="checkbox" id="sgW"' + (be.w ? ' checked' : '') + '><span>Encerada (no jogo, ninguém consegue editar)</span></label>' +
    '<div class="row"><button class="btn primary" id="sgOk">Usar</button><button class="btn" id="sgNo">Cancelar</button></div>', function () {
    $('sgfc').value = be.f.c; $('sgbc').value = be.b.c;
    $('sgNo').onclick = closeDialog;
    $('sgOk').onclick = function () {
      var rd = function (p) { return { t: [0, 1, 2, 3].map(function (q) { return $('sg' + p + q).value; }), c: $('sg' + p + 'c').value, g: $('sg' + p + 'g').checked ? 1 : 0 }; };
      var nb = { k: 'sign', f: rd('f'), b: rd('b'), w: $('sgW').checked ? 1 : 0 };
      closeDialog();
      if (beSignEmpty(nb)) { bent.delete(i); bentSave = true; bentMark(i); } else bentSet(i, nb, true);
      autosave(); updateStatus(); toast(b.name + ': texto guardado.');
    };
  });
}
