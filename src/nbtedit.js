/* ---------- Editor NBT (etapa 1): configurações do mundo, regras do jogo, jogador e inventário ---------- */
/* Projeto → Editor NBT… (com um mundo do jogo aberto). Lê o level.dat (Bedrock: 8 bytes de cabeçalho + NBT
   little-endian; Java: NBT big-endian em gzip, com o jogador dentro de Data.Player) e, no Bedrock, o jogador da
   chave ~local_player do banco do mundo. As mudanças ficam em wio.files (arquivos inteiros trocados ao exportar:
   level.dat, levelname.txt) e em wio.patches (o jogador), e vão no Exportar mundo; o mundo original não muda.
   Os campos usam a árvore de nbtTreeLE (src/worldio.js), que guarda o tipo de cada valor: um número volta com o
   mesmo tipo (byte, int, long, float...), e o que o editor não mostra volta igual.
   Conquistas (Bedrock): mudar o mundo ou o jogador por fora é como usar comandos no jogo. Por isso, ao gravar
   qualquer mudança que não seja só o nome, o level.dat sai com hasBeenLoadedInCreative = 1, a mesma marca que o
   jogo põe: as conquistas ficam desativadas naquele mundo. O editor não tem como reativá-las. */
var nbe = null; // { java, lvl: árvore do level.dat, hdr: versão do cabeçalho (Bedrock), D: compound de dados, pl: compound do jogador, plTree, dirtyL, dirtyP, cheat, tab }

/* ---------- Acesso aos valores da árvore ---------- */
function nbeGet(c, k) { if (!c) return null; for (var i = 0; i < c.length; i++) if (c[i].k === k) return c[i]; return null; }
function nbeLE() { return !nbe.java; }
/* número de uma entrada de qualquer tipo numérico (long, float e double ficam em bytes crus na árvore) */
function nbeNum(e) {
  if (!e) return null;
  var v = e.v, le = nbeLE();
  if (e.t === 4) { var dv = new DataView(v.buffer, v.byteOffset, 8); return Number(dv.getBigInt64(0, le)); }
  if (e.t === 5) return new DataView(v.buffer, v.byteOffset, 4).getFloat32(0, le);
  if (e.t === 6) return new DataView(v.buffer, v.byteOffset, 8).getFloat64(0, le);
  if (e.t === 1) return v > 127 ? v - 256 : v;
  return v;
}
function nbeRaw(t, n) {
  var le = nbeLE(), b;
  if (t === 4) { b = new Uint8Array(8); new DataView(b.buffer).setBigInt64(0, BigInt(Math.round(n)), le); return b; }
  if (t === 5) { b = new Uint8Array(4); new DataView(b.buffer).setFloat32(0, n, le); return b; }
  if (t === 6) { b = new Uint8Array(8); new DataView(b.buffer).setFloat64(0, n, le); return b; }
  if (t === 1) return Math.round(n) & 255;
  if (t === 8) return String(n);
  return Math.round(n) | 0;
}
/* grava (cria a entrada com o tipo t se não existir) */
function nbeSet(c, k, t, n) { var e = nbeGet(c, k); if (!e) { e = { k: k, t: t, v: null }; c.push(e); } e.v = nbeRaw(e.t, n); return e; }
/* lista de números (Pos, Rotation): a = { et, a } */
function nbeListNums(e) { if (!e || e.t !== 9) return null; var o = { t: e.v.et, v: null }; return e.v.a.map(function (x) { o.v = x; return nbeNum(o); }); }
function nbeSetList(e, i, n) { e.v.a[i] = nbeRaw(e.v.et, n); }
/* atributo do jogador do Bedrock (Attributes: lista de { Name, Base, Current, Max... }) */
function nbeAttr(name) { var L = nbeGet(nbe.pl, 'Attributes'); if (!L) return null; for (var i = 0; i < L.v.a.length; i++) { var c = L.v.a[i], n = nbeGet(c, 'Name'); if (n && n.v === name) return c; } return null; }

/* ---------- Abrir: lê os dados do mundo aberto ---------- */
async function nbeLoad() {
  var zip = wio.zip, pre = wio.prefix, raw = wio.files && wio.files.has('level.dat') ? wio.files.get('level.dat') : await zip.read(pre + 'level.dat');
  var o = { java: !!wio.java, dirtyL: false, dirtyP: false, cheat: false, tab: 'mundo' };
  if (o.java) {
    var u = await gunzipMaybe(raw); o.lvl = nbtTreeLE(u, true);
    var D = nbeGetIn(o.lvl.v, 'Data'); o.D = D ? D.v : o.lvl.v;
    var P = nbeGetIn(o.D, 'Player'); o.pl = P ? P.v : null;
  } else {
    var dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
    o.hdr = dv.getInt32(0, true); o.lvl = nbtTreeLE(raw.subarray(8)); o.D = o.lvl.v;
    if (wio.old) { var P0 = nbeGetIn(o.D, 'Player'); o.old = true; o.pl = P0 ? P0.v : null; } // Pocket Edition 0.2 a 0.8: o jogador fica no level.dat (src/legacy.js)
    else { var pr = await wioGet('~local_player'); if (pr) { o.plTree = nbtTreeLE(pr); o.pl = o.plTree.v; } }
  }
  return o;
}
function nbeGetIn(c, k) { for (var i = 0; i < c.length; i++) if (c[i].k === k) return c[i]; return null; }
/* ---------- Gravar: volta as árvores para bytes e guarda nas mudanças do mundo ---------- */
async function nbeCommit() {
  if (!nbe.dirtyL && !nbe.dirtyP) return false;
  wio.files = wio.files || new Map();
  if (nbe.old) { if (nbe.dirtyP) nbe.dirtyL = true; if (nbe.cheat) wio.oldCheat = true; nbe.cheat = false; } // 0.8: sem conquistas (a marca vai só se o mundo for convertido, src/legacy.js)
  if (!nbe.java && nbe.cheat) nbeSet(nbe.D, 'hasBeenLoadedInCreative', 1, 1); // a marca de "usou trapaças" do jogo
  if (nbe.java) {
    var body = nbtTreeWrite(nbe.lvl, true);
    wio.files.set('level.dat', await MCExport.gzip(body));
  } else {
    if (nbe.dirtyL || nbe.cheat) {
      var b = nbtTreeWrite(nbe.lvl), hd = new Uint8Array(8), dv = new DataView(hd.buffer);
      dv.setInt32(0, nbe.hdr, true); dv.setInt32(4, b.length, true);
      wio.files.set('level.dat', wioCat([hd, b]));
      var nm = nbeGet(nbe.D, 'LevelName'); if (nm && !nbe.old) wio.files.set('levelname.txt', new TextEncoder().encode(nm.v));
    }
    if (nbe.dirtyP && nbe.plTree) wio.patches.set('~local_player', nbtTreeWrite(nbe.plTree));
  }
  var ln = nbeGet(nbe.D, 'LevelName'); if (ln && ln.v) { wio.name = ln.v; if (typeof wioChip === 'function') wioChip(); }
  var pos = nbe.pl && nbeListNums(nbeGet(nbe.pl, 'Pos'));
  if (pos) wio.player = { dim: nbePlayerDim(), x: Math.floor(pos[0]), z: Math.floor(pos[2]) };
  nbe.dirtyL = nbe.dirtyP = false;
  await wioSaveSession(false);
  return true;
}
function nbePlayerDim() {
  if (!nbe.java) { var d = nbeGet(nbe.pl, 'DimensionId'); return d ? d.v | 0 : 0; }
  var dn = nbeGet(nbe.pl, 'Dimension'), s = dn ? String(dn.t === 8 ? dn.v : dn.v) : 'minecraft:overworld';
  return /nether/.test(s) || s === '-1' ? 1 : /end/.test(s) || s === '1' ? 2 : 0;
}

/* ---------- Textos ---------- */
var NBE_RULES = { // regras do jogo (o nome do Bedrock, em minúsculas; o do Java é o mesmo sem as maiúsculas)
  keepinventory: 'Manter o inventário ao morrer', dodaylightcycle: 'O dia passa (ciclo do dia)', doweathercycle: 'O clima muda sozinho', domobspawning: 'Criaturas surgem sozinhas',
  mobgriefing: 'Criaturas mexem em blocos (creeper explode, enderman pega)', dofiretick: 'O fogo se espalha', tntexplodes: 'TNT explode', tntexplosiondropdecay: 'Explosão de TNT perde parte dos blocos',
  falldamage: 'Dano de queda', firedamage: 'Dano de fogo', drowningdamage: 'Dano de afogamento', freezedamage: 'Dano de congelamento', pvp: 'Jogadores podem se atacar (PvP)',
  naturalregeneration: 'A vida volta sozinha', doimmediaterespawn: 'Renascer na hora (sem a tela de morte)', doinsomnia: 'Phantoms aparecem (insônia)', doentitydrops: 'Entidades soltam itens (carrinho, moldura)',
  domobloot: 'Criaturas soltam itens', dotiledrops: 'Blocos quebrados soltam itens', showcoordinates: 'Mostrar coordenadas', showdaysplayed: 'Mostrar dias jogados', showdeathmessages: 'Mensagens de morte',
  showtags: 'Mostrar etiquetas dos itens', showrecipemessages: 'Avisos de receitas novas', recipesunlock: 'Receitas liberadas aos poucos', dolimitedcrafting: 'Só fabricar receitas liberadas',
  commandblockoutput: 'Blocos de comando escrevem no chat', commandblocksenabled: 'Blocos de comando funcionam', sendcommandfeedback: 'Respostas dos comandos no chat',
  respawnblocksexplode: 'Âncora e cama explodem na dimensão errada', projectilescanbreakblocks: 'Projéteis quebram blocos (pote, coral)', showbordereffect: 'Efeito da borda do mundo',
  randomtickspeed: 'Velocidade dos ticks aleatórios (plantas crescem, fogo)', spawnradius: 'Raio do ponto de nascimento', playerssleepingpercentage: '% de jogadores dormindo para passar a noite',
  functioncommandlimit: 'Limite de comandos por função', maxcommandchainlength: 'Limite da corrente de blocos de comando', announceadvancements: 'Anunciar progressos', disableraids: 'Sem invasões',
  dopatrolspawning: 'Patrulhas surgem', dotraderspawning: 'Mercador ambulante surge', dowardenspawning: 'Warden surge', forgivedeadplayers: 'Criaturas esquecem jogador morto', universalanger: 'Raiva universal',
  spectatorsgeneratechunks: 'Espectadores geram o mundo', reduceddebuginfo: 'Menos informações no F3', logadmincommands: 'Registrar comandos de administrador', maxentitycramming: 'Máximo de entidades amontoadas',
  snowaccumulationheight: 'Altura máxima da neve acumulada', waterSourceConversion: 'Água forma fonte nova', watersourceconversion: 'Água forma fonte nova', lavasourceconversion: 'Lava forma fonte nova',
  blockexplosiondropdecay: 'Explosão de bloco perde parte dos blocos', mobexplosiondropdecay: 'Explosão de criatura perde parte dos blocos', globalsoundevents: 'Sons globais (wither, dragão)', dovinesspread: 'Vinhas se espalham',
  enderpearlsvanishondeath: 'Pérolas do Ender somem ao morrer', fallflying: 'Planar com élitros', playersnetherportaldefaultdelay: 'Atraso do portal do Nether', doinsomia: 'Phantoms aparecem'
};
var NBE_EFFECTS = [[1, 'speed', 'Velocidade'], [2, 'slowness', 'Lentidão'], [3, 'haste', 'Pressa'], [4, 'mining_fatigue', 'Cansaço'], [5, 'strength', 'Força'], [6, 'instant_health', 'Vida instantânea'],
  [7, 'instant_damage', 'Dano instantâneo'], [8, 'jump_boost', 'Super pulo'], [9, 'nausea', 'Náusea'], [10, 'regeneration', 'Regeneração'], [11, 'resistance', 'Resistência'], [12, 'fire_resistance', 'Resistência ao fogo'],
  [13, 'water_breathing', 'Respiração aquática'], [14, 'invisibility', 'Invisibilidade'], [15, 'blindness', 'Cegueira'], [16, 'night_vision', 'Visão noturna'], [17, 'hunger', 'Fome'], [18, 'weakness', 'Fraqueza'],
  [19, 'poison', 'Veneno'], [20, 'wither', 'Wither'], [21, 'health_boost', 'Vida extra'], [22, 'absorption', 'Absorção'], [23, 'saturation', 'Saturação'], [24, 'levitation', 'Levitação'],
  [26, 'conduit_power', 'Poder do conduíte'], [27, 'slow_falling', 'Queda lenta'], [28, 'bad_omen', 'Mau presságio'], [29, 'hero_of_the_village', 'Herói da vila'], [30, 'darkness', 'Escuridão']];
var NBE_DIM = [[0, 'Mundo normal', 'minecraft:overworld'], [1, 'Nether', 'minecraft:the_nether'], [2, 'End', 'minecraft:the_end']];
/* itens que não são blocos (para a lista de sugestões do inventário; os blocos vêm da lista do site) */
var NBE_ITEMS = ('wooden_sword stone_sword iron_sword golden_sword diamond_sword netherite_sword wooden_pickaxe stone_pickaxe iron_pickaxe golden_pickaxe diamond_pickaxe netherite_pickaxe ' +
  'wooden_axe stone_axe iron_axe golden_axe diamond_axe netherite_axe wooden_shovel stone_shovel iron_shovel golden_shovel diamond_shovel netherite_shovel wooden_hoe stone_hoe iron_hoe golden_hoe diamond_hoe netherite_hoe ' +
  'mace trident bow crossbow arrow spectral_arrow tipped_arrow shield fishing_rod flint_and_steel shears brush spyglass compass recovery_compass clock lead name_tag saddle elytra totem_of_undying ' +
  'leather_helmet leather_chestplate leather_leggings leather_boots chainmail_helmet chainmail_chestplate chainmail_leggings chainmail_boots iron_helmet iron_chestplate iron_leggings iron_boots ' +
  'golden_helmet golden_chestplate golden_leggings golden_boots diamond_helmet diamond_chestplate diamond_leggings diamond_boots netherite_helmet netherite_chestplate netherite_leggings netherite_boots turtle_helmet ' +
  'coal charcoal diamond emerald lapis_lazuli quartz amethyst_shard iron_ingot gold_ingot copper_ingot netherite_ingot netherite_scrap raw_iron raw_gold raw_copper iron_nugget gold_nugget redstone glowstone_dust ' +
  'stick string feather flint leather rabbit_hide paper book writable_book enchanted_book bone bone_meal gunpowder slime_ball magma_cream blaze_rod blaze_powder breeze_rod ender_pearl ender_eye ghast_tear nether_star ' +
  'phantom_membrane prismarine_shard prismarine_crystals nautilus_shell heart_of_the_sea echo_shard disc_fragment_5 honeycomb ink_sac glow_ink_sac clay_ball brick nether_brick experience_bottle firework_rocket ' +
  'wheat_seeds pumpkin_seeds melon_seeds beetroot_seeds torchflower_seeds pitcher_pod cocoa_beans sugar_cane egg snowball bucket water_bucket lava_bucket milk_bucket powder_snow_bucket axolotl_bucket cod_bucket ' +
  'apple golden_apple enchanted_golden_apple bread cookie cake pumpkin_pie melon_slice glistering_melon_slice carrot golden_carrot potato baked_potato poisonous_potato beetroot beetroot_soup mushroom_stew rabbit_stew ' +
  'suspicious_stew sweet_berries glow_berries chorus_fruit dried_kelp honey_bottle beef cooked_beef porkchop cooked_porkchop chicken cooked_chicken mutton cooked_mutton rabbit cooked_rabbit cod cooked_cod salmon cooked_salmon ' +
  'tropical_fish pufferfish rotten_flesh spider_eye fermented_spider_eye potion splash_potion lingering_potion glass_bottle map filled_map bowl minecart chest_minecart hopper_minecart tnt_minecart oak_boat ' +
  'armor_stand item_frame glow_item_frame painting oak_sign oak_door bed white_bed goat_horn music_disc_13 music_disc_cat wind_charge trial_key ominous_trial_key netherite_upgrade_smithing_template').split(' ');

/* ---------- Janela ---------- */
async function openNbtEditor() {
  if (!wio) { toast('Abra um mundo do jogo primeiro (Projeto → Abrir mundo do jogo).', 6000); return; }
  busy('Lendo os dados do mundo…', null);
  try { nbe = await nbeLoad(); } catch (e) { busyEnd(); reportErr(e); return; }
  busyEnd(); nbeOpen();
}
function nbeOpen() {
  var locked = !nbe.java && (nbeNum(nbeGet(nbe.D, 'hasBeenLoadedInCreative')) === 1 || nbeNum(nbeGet(nbe.D, 'commandsEnabled')) === 1);
  var tabs = [['mundo', 'Mundo'], ['regras', 'Regras'], ['jogador', 'Jogador'], ['inv', 'Inventário']];
  openDialog('<h3>Editor NBT</h3><div class="nbetabs" role="tablist">' + tabs.map(function (t) { return '<button class="btn" role="tab" data-nt="' + t[0] + '" aria-pressed="' + (t[0] === nbe.tab) + '">' + t[1] + '</button>'; }).join('') + '</div>' +
    (nbe.java ? '' : nbe.old ? '<p class="mixl" id="nbeAch">Mundo da Pocket Edition 0.2 a 0.8: só aparecem os dados que essa versão guarda (ela não tem regras, clima, efeitos nem conquistas). Se o mundo for exportado convertido, um mundo mudado aqui sai com as conquistas desativadas.</p>' : '<p class="mixl" id="nbeAch">' + (locked ? 'As conquistas já estão desativadas neste mundo (ele já usou comandos ou o criativo).' : 'Atenção: ao gravar uma mudança (fora o nome do mundo), as conquistas ficam desativadas no mundo exportado, como ao ligar os comandos no jogo.') + '</p>') +
    '<div id="nbeBody" class="nbebody"></div><datalist id="nbeItems"></datalist>' +
    '<div class="row"><button class="btn primary" id="nbeOk">Gravar mudanças</button><button class="btn" id="nbeNo">Fechar sem gravar</button><span id="nbeState" class="mixl"></span></div>', function () {
    var dg = $('nbeBody').closest('.dialog'); if (dg) dg.classList.add('wide');
    var dl = $('nbeItems'); dl.innerHTML = NBE_ITEMS.concat(BLOCKS.filter(function (b) { return !b.hide && !b.isAir; }).map(function (b) { return b.java; })).map(function (n) { return '<option value="' + n + '">'; }).join('');
    document.querySelectorAll('[data-nt]').forEach(function (b) { b.onclick = function () { nbe.tab = b.getAttribute('data-nt'); document.querySelectorAll('[data-nt]').forEach(function (q) { q.setAttribute('aria-pressed', q === b); }); nbeRender(); }; });
    $('nbeOk').onclick = async function () { if (window.BabApp) { appNbeSave(); return; } try { var ch = await nbeCommit(); closeDialog(); toast(ch ? 'Mudanças gravadas: vão no Exportar mundo (o mundo original não muda).' + (nbe.java || !nbe.cheat ? '' : ' As conquistas ficam desativadas no mundo exportado.') : 'Nada mudou.', 7000); } catch (e) { reportErr(e); } };
    $('nbeNo').onclick = function () { nbe = null; closeDialog(); };
    nbeRender();
  });
}
function nbeTouch(level, cheat) { if (level) nbe.dirtyL = true; else nbe.dirtyP = true; if (cheat !== false) nbe.cheat = true; var s = $('nbeState'); if (s) s.textContent = 'Há mudanças não gravadas.'; }
/* Campos: [rótulo, html do controle]; o controle tem data-nf com o nome da função de gravação em NBE_SET */
function nbeRow(label, ctl, hint) { return '<label class="nberow"><span>' + label + (hint ? ' <small class="mixl">' + hint + '</small>' : '') + '</span>' + ctl + '</label>'; }
function nbeInput(id, val, type, attrs) { return '<input type="' + (type || 'number') + '" data-nf="' + id + '" value="' + esc(val == null ? '' : String(val)) + '" ' + (attrs || '') + '>'; }
function nbeSelect(id, val, opts) { return '<select data-nf="' + id + '">' + opts.map(function (o) { return '<option value="' + o[0] + '"' + (String(o[0]) === String(val) ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select>'; }
function nbeCheck(id, on) { return '<input type="checkbox" data-nf="' + id + '"' + (on ? ' checked' : '') + '>'; }
var NBE_SET = {};
function nbeRender() {
  var b = $('nbeBody'); if (!b) return; NBE_SET = {}; nbeSeq = 0;
  var h = nbe.tab === 'mundo' ? nbeWorldHtml() : nbe.tab === 'regras' ? nbeRulesHtml() : nbe.tab === 'jogador' ? nbePlayerHtml() : nbeInvHtml();
  b.innerHTML = h;
  b.querySelectorAll('[data-nf]').forEach(function (el) {
    el.addEventListener('change', function () {
      var f = NBE_SET[el.getAttribute('data-nf')]; if (!f) return;
      var v = el.type === 'checkbox' ? (el.checked ? 1 : 0) : el.value;
      var err = f(v); if (err) { toast(err, 5000); nbeRender(); }
    });
  });
  if (nbe.tab === 'inv') nbeInvBind();
  if (nbe.tab === 'jogador') nbeFxBind();
}
/* valor numérico conferido */
function nbeNumIn(v, min, max, name) { var n = +String(v).replace(',', '.'); if (!isFinite(n)) return { err: name + ': digite um número.' }; if (n < min || n > max) return { err: name + ': de ' + min + ' a ' + max + '.' }; return { n: n }; }
function nbeField(c, k, t, label, min, max, level, hint, cheat) {
  var e = nbeGet(c, k); if (!e && t == null) return '';
  var id = nbeId();
  NBE_SET[id] = function (v) { var r = nbeNumIn(v, min, max, label); if (r.err) return r.err; nbeSet(c, k, e ? e.t : t, r.n); nbeTouch(level, cheat); };
  return nbeRow(label, nbeInput(id, e ? Math.round(nbeNum(e) * 1000) / 1000 : '', 'number', 'min="' + min + '" max="' + max + '" step="any"'), hint);
}
function nbeBool(c, k, label, level, hint) {
  var e = nbeGet(c, k); if (!e) return '';
  var id = nbeId();
  NBE_SET[id] = function (v) { nbeSet(c, k, e.t, v); nbeTouch(level); };
  return nbeRow(label, nbeCheck(id, nbeNum(e) === 1), hint);
}
function nbeSel(c, k, label, opts, level, hint, t) {
  var e = nbeGet(c, k); if (!e && t == null) return '';
  var id = nbeId();
  NBE_SET[id] = function (v) { nbeSet(c, k, e ? e.t : t, e && e.t === 8 ? v : +v); nbeTouch(level); };
  return nbeRow(label, nbeSelect(id, e ? (e.t === 8 ? e.v : nbeNum(e)) : opts[0][0], opts), hint);
}
var nbeSeq = 0;
function nbeId() { return 'f' + (nbeSeq++); } // um número novo a cada campo (NBE_SET recebe a função depois)
var NBE_MODES = [[0, 'Sobrevivência'], [1, 'Criativo'], [2, 'Aventura'], [6, 'Espectador']];

/* ---------- Aba Mundo ---------- */
function nbeWorldHtml() {
  var D = nbe.D, J = nbe.java, h = '<h4>Mundo</h4>';
  var nm = nbeGet(D, 'LevelName'), id = nbeId();
  NBE_SET[id] = function (v) { v = String(v).trim(); if (!v) return 'O nome não pode ficar vazio.'; nbeSet(D, 'LevelName', 8, v); nbeTouch(true, false); };
  h += nbeRow('Nome do mundo', nbeInput(id, nm ? nm.v : '', 'text', 'maxlength="64"'));
  h += nbeSel(D, 'GameType', nbe.old ? 'Modo de jogo' : 'Modo de jogo padrão', J ? NBE_MODES.map(function (m) { return [m[0] === 6 ? 3 : m[0], m[1]]; }) : nbe.old ? NBE_MODES.slice(0, 2) : NBE_MODES, true);
  h += nbeSel(D, 'Difficulty', 'Dificuldade', [[0, 'Pacífico'], [1, 'Fácil'], [2, 'Normal'], [3, 'Difícil']], true);
  h += nbeBool(D, J ? 'hardcore' : 'IsHardcore', 'Hardcore (uma vida só)', true);
  h += nbeBool(D, J ? 'allowCommands' : 'commandsEnabled', 'Comandos (trapaças) ligados', true, J ? '' : 'desativa as conquistas');
  h += '<h4>Ponto de nascimento do mundo</h4>';
  var sp = J ? nbeGet(D, 'spawn') : null, sv = sp && nbeGet(sp.v, 'pos');
  if (sv && sv.t === 11) ['X', 'Y', 'Z'].forEach(function (a, i) { var fid = nbeId(); NBE_SET[fid] = function (v) { var r = nbeNumIn(v, -30000000, 30000000, a); if (r.err) return r.err; sv.v[i] = Math.round(r.n); nbeTouch(true); }; h += nbeRow(a, nbeInput(fid, sv.v[i])); });
  else h += nbeField(D, 'SpawnX', 3, 'X', -30000000, 30000000, true) + (nbe.old ? nbeField(D, 'SpawnY', 3, 'Y', 0, 128, true) : nbeField(D, 'SpawnY', 3, 'Y', -64, 32767, true, J ? '' : '32767 = o jogo escolhe a altura')) + nbeField(D, 'SpawnZ', 3, 'Z', -30000000, 30000000, true);
  // hora: dia e hora do dia (24000 ticks por dia)
  var tk = J ? 'DayTime' : 'Time', te = nbeGet(D, tk);
  if (te) {
    var T = Math.max(0, nbeNum(te)), day = Math.floor(T / 24000) + 1, hr = T % 24000, i1 = nbeId(), i2;
    NBE_SET[i1] = function (v) { var r = nbeNumIn(v, 1, 10000000, 'Dia'); if (r.err) return r.err; var cur = Math.max(0, nbeNum(te)); nbeSet(D, tk, te.t, (Math.round(r.n) - 1) * 24000 + cur % 24000); nbeTouch(true); };
    i2 = nbeId(); NBE_SET[i2] = function (v) { var r = nbeNumIn(v, 0, 23999, 'Hora'); if (r.err) return r.err; var cur = Math.max(0, nbeNum(te)); nbeSet(D, tk, te.t, Math.floor(cur / 24000) * 24000 + Math.round(r.n)); nbeTouch(true); nbeRender(); };
    h += '<h4>Hora</h4>' + nbeRow('Dia', nbeInput(i1, day, 'number', 'min="1" step="1"'), 'contando do 1 (o /time query day mostra 1 a menos)') +
      nbeRow('Hora do dia', nbeInput(i2, hr, 'number', 'min="0" max="23999" step="100"'), '0 nascer do sol · 6000 meio-dia · 12000 pôr do sol · 18000 meia-noite') +
      '<div class="row nbechips">' + [[0, 'Nascer do sol'], [1000, 'Manhã'], [6000, 'Meio-dia'], [12000, 'Pôr do sol'], [13000, 'Noite'], [18000, 'Meia-noite']].map(function (p) { return '<button class="btn" data-nhr="' + p[0] + '">' + p[1] + '</button>'; }).join('') + '</div>';
    setTimeout(function () { document.querySelectorAll('[data-nhr]').forEach(function (b) { b.onclick = function () { NBE_SET[i2](b.getAttribute('data-nhr')); }; }); }, 0);
  }
  // clima (a Pocket Edition 0.8 não tem)
  var w = nbeWeather(), iw = nbeId(), im = nbeId();
  if (nbe.old) return h + '<h4>Só para ver</h4><p class="mixl"><b>Semente:</b> ' + esc(String(nbeNum(nbeGet(D, 'RandomSeed')))) + (nbeDate(nbeGet(D, 'LastPlayed')) ? ' · <b>Última vez jogado:</b> ' + esc(nbeDate(nbeGet(D, 'LastPlayed'))) : '') + ' · <b>Versão:</b> Pocket Edition 0.2 a 0.8 (mundo de 256 × 256)</p>';
  NBE_SET[iw] = function (v) { nbeWeatherSet(v, nbeWeather().min); nbeTouch(true); };
  NBE_SET[im] = function (v) { var r = nbeNumIn(v, 0, 10000, 'Duração'); if (r.err) return r.err; nbeWeatherSet(nbeWeather().k, r.n); nbeTouch(true); };
  h += '<h4>Clima</h4>' + nbeRow('Agora', nbeSelect(iw, w.k, [['clear', 'Limpo'], ['rain', 'Chuva (ou neve)'], ['thunder', 'Tempestade']])) + nbeRow('Por quanto tempo', nbeInput(im, w.min, 'number', 'min="0" step="1"'), 'minutos de jogo; depois o clima muda sozinho (se o ciclo do clima estiver ligado)');
  h += '<h4>Só para ver</h4><p class="mixl">' + [['Semente', J ? nbeSeedJava() : nbeNum(nbeGet(D, 'RandomSeed'))], ['Última vez jogado', nbeDate(nbeGet(D, 'LastPlayed'))], ['Versão do jogo', J ? (nbeGet(D, 'Version') ? nbeGet(nbeGet(D, 'Version').v, 'Name').v : '') : (nbeListNums(nbeGet(D, 'lastOpenedWithVersion')) || []).join('.')]].filter(function (q) { return q[1] != null && q[1] !== ''; }).map(function (q) { return '<b>' + q[0] + ':</b> ' + esc(String(q[1])); }).join(' · ') + '</p>';
  return h;
}
function nbeSeedJava() { var wg = nbeGet(nbe.D, 'WorldGenSettings'); var s = wg && nbeGet(wg.v, 'seed'); return s ? nbeNum(s) : nbeNum(nbeGet(nbe.D, 'RandomSeed')); }
function nbeDate(e) { if (!e) return null; var n = nbeNum(e); if (!n) return null; var ms = n > 1e11 ? n : n * 1000; return new Date(ms).toLocaleString('pt-BR'); }
function nbeWeather() {
  var D = nbe.D;
  if (nbe.java) { var r = nbeNum(nbeGet(D, 'raining')), t = nbeNum(nbeGet(D, 'thundering')), k = t ? 'thunder' : r ? 'rain' : 'clear', tk = k === 'clear' ? (nbeGet(D, 'clearWeatherTime') ? 'clearWeatherTime' : 'rainTime') : k === 'thunder' ? 'thunderTime' : 'rainTime'; return { k: k, min: Math.round((nbeNum(nbeGet(D, tk)) || 0) / 1200) }; }
  var rl = nbeNum(nbeGet(D, 'rainLevel')) || 0, ll = nbeNum(nbeGet(D, 'lightningLevel')) || 0, kk = ll > 0 ? 'thunder' : rl > 0 ? 'rain' : 'clear';
  return { k: kk, min: Math.round((nbeNum(nbeGet(D, kk === 'thunder' ? 'lightningTime' : 'rainTime')) || 0) / 1200) };
}
function nbeWeatherSet(k, min) {
  var D = nbe.D, t = Math.max(1, Math.round(min * 1200));
  if (nbe.java) {
    nbeSet(D, 'raining', 1, k !== 'clear' ? 1 : 0); nbeSet(D, 'thundering', 1, k === 'thunder' ? 1 : 0);
    if (k === 'clear') { nbeSet(D, 'clearWeatherTime', 3, t); nbeSet(D, 'rainTime', 3, t); nbeSet(D, 'thunderTime', 3, t); }
    else { nbeSet(D, 'clearWeatherTime', 3, 0); nbeSet(D, 'rainTime', 3, t); nbeSet(D, 'thunderTime', 3, k === 'thunder' ? t : t + 12000); }
    return;
  }
  nbeSet(D, 'rainLevel', 5, k !== 'clear' ? 1 : 0); nbeSet(D, 'lightningLevel', 5, k === 'thunder' ? 1 : 0);
  nbeSet(D, 'rainTime', 3, t); nbeSet(D, 'lightningTime', 3, k === 'thunder' ? t : t + 12000);
}

/* ---------- Aba Regras ---------- */
function nbeRulesHtml() {
  var h = '<p class="mixl">As regras do jogo (as do comando /gamerule).</p>', rows = [];
  if (nbe.old) return '<p>A Pocket Edition 0.8 não tem regras do jogo (o /gamerule veio depois).</p>';
  if (nbe.java) {
    var G = nbeGet(nbe.D, 'GameRules'); if (!G) return '<p>Este mundo não tem regras guardadas.</p>';
    G.v.forEach(function (e) {
      var k = e.k.replace(/^minecraft:/, ''), lab = NBE_RULES[k.toLowerCase().replace(/_/g, '')] || k, id = nbeId(), s = String(e.v);
      if (s === 'true' || s === 'false' || e.t === 1) { NBE_SET[id] = function (v) { if (e.t === 8) e.v = v ? 'true' : 'false'; else e.v = v ? 1 : 0; nbeTouch(true); }; rows.push([lab, nbeRow(lab, nbeCheck(id, s === 'true' || s === '1'))]); }
      else { NBE_SET[id] = function (v) { var r = nbeNumIn(v, -2147483648, 2147483647, lab); if (r.err) return r.err; if (e.t === 8) e.v = String(Math.round(r.n)); else e.v = Math.round(r.n); nbeTouch(true); }; rows.push([lab, nbeRow(lab, nbeInput(id, s, 'number', 'step="1"'))]); }
    });
  } else {
    nbe.D.forEach(function (e) {
      var lab = NBE_RULES[e.k]; if (!lab) return;
      rows.push([lab, e.t === 1 ? nbeBool(nbe.D, e.k, lab, true) : nbeField(nbe.D, e.k, e.t, lab, 0, 2147483647, true)]);
    });
  }
  rows.sort(function (a, b) { return a[0].localeCompare(b[0], 'pt-BR'); });
  return h + '<div class="nbecols">' + rows.map(function (r) { return r[1]; }).join('') + '</div>';
}

/* ---------- Aba Jogador ---------- */
function nbePlayerHtml() {
  var P = nbe.pl, J = nbe.java;
  if (nbe.old) return nbeOldPlayerHtml();
  if (!P) return '<p>Este mundo não tem um jogador guardado' + (J ? ' no level.dat (num servidor, os jogadores ficam na pasta playerdata).' : ' (~local_player): o jogador ainda não entrou no mundo, ou é um mundo de servidor.') + '</p>';
  var h = '<h4>Posição</h4>', pe = nbeGet(P, 'Pos'), pos = nbeListNums(pe) || [0, 0, 0];
  ['X', 'Y', 'Z'].forEach(function (a, i) { var id = nbeId(); NBE_SET[id] = function (v) { var r = nbeNumIn(v, i === 1 ? -128 : -30000000, i === 1 ? 2000 : 30000000, a); if (r.err) return r.err; nbeSetList(pe, i, r.n + (i !== 1 && J ? 0 : 0)); nbeTouch(false); }; h += nbeRow(a, nbeInput(id, Math.round(pos[i] * 100) / 100, 'number', 'step="any"')); });
  if (J) { var de = nbeGet(P, 'Dimension'); if (de && de.t === 8) { var did = nbeId(); NBE_SET[did] = function (v) { de.v = v; nbeTouch(false); }; h += nbeRow('Dimensão', nbeSelect(did, de.v, NBE_DIM.map(function (d) { return [d[2], d[1]]; }))); } }
  else h += nbeSel(P, 'DimensionId', 'Dimensão', NBE_DIM.map(function (d) { return [d[0], d[1]]; }), false);
  if (wio.player) h += '<div class="row"><button class="btn" id="nbePosSel" title="A posição vira o meio da seleção do editor (na área carregada)">Pôr o jogador no meio da seleção</button></div>';
  h += '<h4>Estado</h4>';
  h += J ? nbeSel(P, 'playerGameType', 'Modo de jogo', NBE_MODES.map(function (m) { return [m[0] === 6 ? 3 : m[0], m[1]]; }), false)
    : nbeSel(P, 'PlayerGameMode', 'Modo de jogo', [[5, 'O padrão do mundo']].concat(NBE_MODES), false);
  if (J) {
    h += nbeField(P, 'Health', 5, 'Vida', 0, 1024, false, '20 = 10 corações') + nbeField(P, 'foodLevel', 3, 'Fome', 0, 20, false, '20 = cheia') + nbeField(P, 'foodSaturationLevel', 5, 'Saturação', 0, 20, false);
    h += nbeField(P, 'XpLevel', 3, 'Nível de experiência', 0, 24791, false) + nbeField(P, 'XpP', 5, 'Progresso para o próximo nível', 0, 0.999, false, 'de 0 a 0,999');
  } else {
    h += nbeAttrField('minecraft:health', 'Vida', '20 = 10 corações') + nbeAttrField('minecraft:player.hunger', 'Fome', '20 = cheia') + nbeAttrField('minecraft:player.saturation', 'Saturação');
    var lv = nbeId(); NBE_SET[lv] = function (v) { var r = nbeNumIn(v, 0, 24791, 'Nível'); if (r.err) return r.err; nbeSet(P, 'PlayerLevel', 3, r.n); var a = nbeAttr('minecraft:player.level'); if (a) { nbeSet(a, 'Current', 5, r.n); nbeSet(a, 'Base', 5, r.n); } nbeTouch(false); };
    h += nbeRow('Nível de experiência', nbeInput(lv, nbeNum(nbeGet(P, 'PlayerLevel')) || 0, 'number', 'min="0" max="24791" step="1"'));
    var lp = nbeId(); NBE_SET[lp] = function (v) { var r = nbeNumIn(v, 0, 0.999, 'Progresso'); if (r.err) return r.err; nbeSet(P, 'PlayerLevelProgress', 5, r.n); var a = nbeAttr('minecraft:player.experience'); if (a) { nbeSet(a, 'Current', 5, r.n); nbeSet(a, 'Base', 5, r.n); } nbeTouch(false); };
    h += nbeRow('Progresso para o próximo nível', nbeInput(lp, Math.round((nbeNum(nbeGet(P, 'PlayerLevelProgress')) || 0) * 1000) / 1000, 'number', 'min="0" max="0.999" step="0.05"'), 'de 0 a 0,999');
  }
  var ab = nbeGet(P, 'abilities');
  if (ab) h += '<h4>Habilidades</h4>' + nbeBool(ab.v, 'mayfly', 'Pode voar', false) + nbeBool(ab.v, 'flying', 'Está voando', false) + nbeBool(ab.v, 'invulnerable', 'Invulnerável', false);
  // ponto de renascimento (a cama ou a âncora)
  h += '<h4>Ponto de renascimento</h4>';
  if (J) {
    var rs = nbeGet(P, 'respawn'), rp = rs && nbeGet(rs.v, 'pos');
    if (rp && rp.t === 11) ['X', 'Y', 'Z'].forEach(function (a, i) { var id = nbeId(); NBE_SET[id] = function (v) { var r = nbeNumIn(v, -30000000, 30000000, a); if (r.err) return r.err; rp.v[i] = Math.round(r.n); nbeTouch(false); }; h += nbeRow(a, nbeInput(id, rp.v[i])); });
    else if (nbeGet(P, 'SpawnX')) h += nbeField(P, 'SpawnX', 3, 'X', -30000000, 30000000, false) + nbeField(P, 'SpawnY', 3, 'Y', -64, 320, false) + nbeField(P, 'SpawnZ', 3, 'Z', -30000000, 30000000, false);
    else h += '<p class="mixl">Sem cama: renasce no ponto de nascimento do mundo.</p>';
  } else if (nbeGet(P, 'SpawnX') && nbeNum(nbeGet(P, 'SpawnY')) !== -2147483648) {
    var sx = function (k, a, lo, hi) { var e = nbeGet(P, k), id = nbeId(); NBE_SET[id] = function (v) { var r = nbeNumIn(v, lo, hi, a); if (r.err) return r.err; nbeSet(P, k, 3, r.n); var bk = k.replace('Spawn', 'SpawnBlockPosition'); if (nbeGet(P, bk)) nbeSet(P, bk, 3, r.n); nbeTouch(false); }; return nbeRow(a, nbeInput(id, nbeNum(e))); };
    h += sx('SpawnX', 'X', -30000000, 30000000) + sx('SpawnY', 'Y', -64, 320) + sx('SpawnZ', 'Z', -30000000, 30000000) + nbeSel(P, 'SpawnDimension', 'Dimensão', NBE_DIM.map(function (d) { return [d[0], d[1]]; }), false);
  } else h += '<p class="mixl">Sem cama: renasce no ponto de nascimento do mundo.</p>';
  h += '<h4>Efeitos</h4><div id="nbeFx">' + nbeFxHtml() + '</div>';
  return h;
}
function nbeAttrField(name, label, hint) {
  var a = nbeAttr(name); if (!a) return '';
  var max = nbeNum(nbeGet(a, 'Max')) || 20, id = nbeId();
  NBE_SET[id] = function (v) { var r = nbeNumIn(v, 0, max, label); if (r.err) return r.err; nbeSet(a, 'Current', 5, r.n); nbeTouch(false); };
  return nbeRow(label, nbeInput(id, Math.round(nbeNum(nbeGet(a, 'Current')) * 100) / 100, 'number', 'min="0" max="' + max + '" step="any"'), hint);
}
/* Efeitos: Bedrock ActiveEffects (Id número); Java active_effects (id texto) */
function nbeFxList(make) {
  var P = nbe.pl, k = nbe.java ? 'active_effects' : 'ActiveEffects', e = nbeGet(P, k);
  if (!e && make) { e = { k: k, t: 9, v: { et: 10, a: [] } }; P.push(e); }
  return e;
}
function nbeFxRead(c) {
  if (nbe.java) { var id = String((nbeGet(c, 'id') || {}).v || '').replace(/^minecraft:/, ''); return { name: id, lv: (nbeNum(nbeGet(c, 'amplifier')) || 0) + 1, sec: Math.round((nbeNum(nbeGet(c, 'duration')) || 0) / 20) }; }
  var n = nbeNum(nbeGet(c, 'Id')), f = NBE_EFFECTS.filter(function (q) { return q[0] === n; })[0];
  return { name: f ? f[1] : String(n), lv: (nbeNum(nbeGet(c, 'Amplifier')) || 0) + 1, sec: Math.round((nbeNum(nbeGet(c, 'Duration')) || 0) / 20) };
}
function nbeFxHtml() {
  if (nbe.java && !nbeGet(nbe.pl, 'active_effects') && nbeGet(nbe.pl, 'ActiveEffects')) return '<p class="mixl">Os efeitos deste mundo estão no formato antigo do Java (antes da 1.20.2): só abrindo no jogo uma vez.</p>';
  var L = nbeFxList(false), rows = L ? L.v.a.map(function (c, i) { var r = nbeFxRead(c), f = NBE_EFFECTS.filter(function (q) { return q[1] === r.name; })[0]; return '<div class="row nbefx"><b>' + esc(f ? f[2] : r.name) + '</b> nível ' + r.lv + ' · ' + (r.sec >= 1e6 ? 'sem fim' : r.sec + ' s') + ' <button class="btn" data-fxdel="' + i + '">Tirar</button></div>'; }) : [];
  return (rows.length ? rows.join('') : '<p class="mixl">Nenhum efeito.</p>') +
    '<div class="row nbefx"><select id="nbeFxN">' + NBE_EFFECTS.map(function (q) { return '<option value="' + q[1] + '">' + q[2] + '</option>'; }).join('') + '</select><label>Nível <input type="number" id="nbeFxL" value="1" min="1" max="255" style="width:64px"></label><label>Segundos <input type="number" id="nbeFxS" value="300" min="1" max="1000000" style="width:90px"></label><button class="btn" id="nbeFxAdd">Pôr efeito</button></div>';
}
function nbeFxBind() {
  var ps = $('nbePosSel'); if (ps) ps.onclick = function () {
    if (!sel || !wio.area) { toast('Marque uma área com Selecionar (V) na área do mundo carregada.'); return; }
    var c = [(sel.a[0] + sel.b[0] + 1) / 2, sel.b[1] + 1, (sel.a[2] + sel.b[2] + 1) / 2], w = wioWorldPos(c), pe = nbeGet(nbe.pl, 'Pos');
    nbeSetList(pe, 0, w[0]); nbeSetList(pe, 1, w[1] + (nbe.java ? 0 : 1.62)); nbeSetList(pe, 2, w[2]); // no Bedrock, Pos é a altura dos olhos
    if (nbe.java) { var de = nbeGet(nbe.pl, 'Dimension'); if (de && de.t === 8) de.v = NBE_DIM[wio.area.dim][2]; } else if (!nbe.old) nbeSet(nbe.pl, 'DimensionId', 3, wio.area.dim);
    nbeTouch(false); nbeRender(); toast('O jogador vai aparecer em ' + w.map(Math.floor).join(', ') + ' (em cima da seleção).');
  };
  var add = $('nbeFxAdd'); if (!add) return;
  add.onclick = function () {
    var nm = $('nbeFxN').value, lv = Math.max(1, Math.min(255, +$('nbeFxL').value || 1)), sec = Math.max(1, Math.min(1000000, +$('nbeFxS').value || 1)), L = nbeFxList(true), f = NBE_EFFECTS.filter(function (q) { return q[1] === nm; })[0];
    L.v.a = L.v.a.filter(function (c) { return nbeFxRead(c).name !== nm; }); // um efeito de cada tipo
    var le = !nbe.java, c;
    if (nbe.java) c = [{ k: 'id', t: 8, v: 'minecraft:' + nm }, { k: 'amplifier', t: 1, v: (lv - 1) & 255 }, { k: 'duration', t: 3, v: sec * 20 }, { k: 'ambient', t: 1, v: 0 }, { k: 'show_particles', t: 1, v: 1 }, { k: 'show_icon', t: 1, v: 1 }];
    else c = [{ k: 'Ambient', t: 1, v: 0 }, { k: 'Amplifier', t: 1, v: (lv - 1) & 255 }, { k: 'DisplayOnScreenTextureAnimation', t: 1, v: 0 }, { k: 'Duration', t: 3, v: sec * 20 }, { k: 'DurationEasy', t: 3, v: sec * 20 }, { k: 'DurationHard', t: 3, v: sec * 20 }, { k: 'DurationNormal', t: 3, v: sec * 20 }, { k: 'Id', t: 1, v: f[0] }, { k: 'ShowParticles', t: 1, v: 1 }];
    L.v.a.push(c); nbeTouch(false); $('nbeFx').innerHTML = nbeFxHtml(); nbeFxBind();
  };
  document.querySelectorAll('[data-fxdel]').forEach(function (b) { b.onclick = function () { var L = nbeFxList(false); L.v.a.splice(+b.getAttribute('data-fxdel'), 1); nbeTouch(false); $('nbeFx').innerHTML = nbeFxHtml(); nbeFxBind(); }; });
}

/* ---------- Aba Inventário ---------- */
/* Grupos: main (36: 0 a 8 é a barra de baixo), armor (cabeça, peito, pernas, pés), off (mão secundária), ender (27).
   Bedrock: Inventory e EnderChestInventory pelo Slot; Armor e Offhand pela posição na lista. Item: Name, Count,
   Damage (o "valor auxiliar"), tag.Damage (o desgaste das ferramentas). Java: Inventory pelo Slot (armadura 100 a 103
   e mão secundária -106 nas versões antes da 1.21.5; depois, no compound equipment); item: id, count (Count e tag antes
   da 1.20.5), components.minecraft:damage. */
var NBE_GROUPS = [['main', 'Inventário', 36], ['armor', 'Armadura', 4], ['off', 'Mão secundária', 1], ['ender', 'Baú do Ender', 27]];
var NBE_ARMOR = ['Cabeça', 'Peito', 'Pernas', 'Pés'], NBE_JEQ = ['head', 'chest', 'legs', 'feet'];
var nbeSlotSel = null;
function nbeJavaNew() { return !(wio.dataVersion && wio.dataVersion < 3837); } // 1.20.5: count int e components
function nbeListOf(k, make) { var e = nbeGet(nbe.pl, k); if (!e && make) { e = { k: k, t: 9, v: { et: 10, a: [] } }; nbe.pl.push(e); } if (e && e.v.et === 0) e.v.et = 10; return e; }
/* o compound do item no espaço (ou null), e onde gravar */
function nbeSlotRef(g, i) {
  var J = nbe.java, P = nbe.pl;
  if (!J) {
    var lk = { main: 'Inventory', ender: 'EnderChestInventory', armor: 'Armor', off: 'Offhand' }[g], L = nbeListOf(lk, true);
    if (g === 'armor' || g === 'off') { while (L.v.a.length <= i) L.v.a.push(nbeBedEmpty(null)); return { c: L.v.a[i], L: L, idx: i }; }
    for (var k = 0; k < L.v.a.length; k++) if (nbeNum(nbeGet(L.v.a[k], 'Slot')) === i) return { c: L.v.a[k], L: L, idx: k, slot: i };
    return { c: null, L: L, slot: i };
  }
  var eq = nbeGet(P, 'equipment');
  // 1.21.5 (DataVersion 4325): armadura e mão secundária no compound equipment
  if ((g === 'armor' || g === 'off') && (eq || (wio.dataVersion || 0) >= 4325 && !nbeHasOldArmor())) { if (!eq) { eq = { k: 'equipment', t: 10, v: [] }; P.push(eq); } var key = g === 'off' ? 'offhand' : NBE_JEQ[i], e = nbeGet(eq.v, key); return { c: e ? e.v : null, eq: eq, key: key }; }
  var slot = g === 'main' ? i : g === 'ender' ? i : g === 'off' ? -106 : 103 - i, L2 = nbeListOf(g === 'ender' ? 'EnderItems' : 'Inventory', true);
  for (var q = 0; q < L2.v.a.length; q++) if (nbeNum(nbeGet(L2.v.a[q], 'Slot')) === slot) return { c: L2.v.a[q], L: L2, idx: q, slot: slot };
  return { c: null, L: L2, slot: slot };
}
function nbeHasOldArmor() { var L = nbeGet(nbe.pl, 'Inventory'); return !!(L && L.v.a.some(function (c) { var s = nbeNum(nbeGet(c, 'Slot')); return s >= 100 || s === -106; })); }
function nbeBedEmpty(slot) { var c = [{ k: 'Count', t: 1, v: 0 }, { k: 'Damage', t: 2, v: 0 }, { k: 'Name', t: 8, v: '' }, { k: 'WasPickedUp', t: 1, v: 0 }]; if (slot != null) c.push({ k: 'Slot', t: 1, v: slot & 255 }); return c; }
function nbeItemRead(g, i) {
  var r = nbeSlotRef(g, i), c = r.c; if (!c) return null;
  if (!nbe.java) {
    var nm = (nbeGet(c, 'Name') || {}).v || '', n = nbeNum(nbeGet(c, 'Count')) || 0; if (!nm || !n) return null;
    var tg = nbeGet(c, 'tag'), dm = tg && nbeGet(tg.v, 'Damage');
    return { id: nm.replace(/^minecraft:/, ''), n: n, dmg: dm ? nbeNum(dm) : 0, aux: nbeNum(nbeGet(c, 'Damage')) || 0, ench: nbeEnchRead(c) };
  }
  var id = (nbeGet(c, 'id') || {}).v || ''; if (!id) return null;
  var cn = nbeGet(c, 'count') || nbeGet(c, 'Count'), comp = nbeGet(c, 'components'), d = comp && nbeGet(comp.v, 'minecraft:damage'), tg2 = nbeGet(c, 'tag'), d2 = tg2 && nbeGet(tg2.v, 'Damage');
  return { id: id.replace(/^minecraft:/, ''), n: cn ? nbeNum(cn) : 1, dmg: d ? nbeNum(d) : d2 ? nbeNum(d2) : 0, aux: 0, ench: nbeEnchRead(c) };
}
function nbeItemWrite(g, i, it) {
  var r = nbeSlotRef(g, i), old = nbeItemRead(g, i), same = old && it && old.id === it.id;
  if (!nbe.java) {
    if (!it) { if (!r.c) return; var e0 = nbeBedEmpty(r.slot); r.c.length = 0; e0.forEach(function (x) { r.c.push(x); }); return; } // o espaço fica na lista, vazio (como o jogo grava)
    var c = r.c; if (!c) { c = nbeBedEmpty(r.slot); r.L.v.a.push(c); }
    if (!same) for (var k = c.length - 1; k >= 0; k--) if (/^(tag|Block|CanPlaceOn|CanDestroy)$/.test(c[k].k)) c.splice(k, 1); // outro item: sem os dados do anterior
    nbeSet(c, 'Name', 8, 'minecraft:' + it.id); nbeSet(c, 'Count', 1, it.n); if (!nbeGet(c, 'Damage')) nbeSet(c, 'Damage', 2, 0); if (!nbeGet(c, 'WasPickedUp')) nbeSet(c, 'WasPickedUp', 1, 0);
    var tg = nbeGet(c, 'tag');
    if (it.dmg > 0) { if (!tg) { tg = { k: 'tag', t: 10, v: [] }; c.push(tg); } nbeSet(tg.v, 'Damage', 3, it.dmg); }
    else if (tg) { tg.v = tg.v.filter(function (x) { return x.k !== 'Damage'; }); }
    return;
  }
  var nw = nbeJavaNew();
  var make = function () {
    var o = [{ k: 'id', t: 8, v: 'minecraft:' + it.id }];
    if (nw) o.push({ k: 'count', t: 3, v: it.n }); else o.push({ k: 'Count', t: 1, v: it.n & 255 });
    if (same && r.c) r.c.forEach(function (x) { if (/^(components|tag)$/.test(x.k)) o.push(x); }); // o mesmo item: guarda encantamentos e nome
    var dk = nw ? 'components' : 'tag', comp = nbeGet(o, dk);
    if (it.dmg > 0) { if (!comp) { comp = { k: dk, t: 10, v: [] }; o.push(comp); } nbeSet(comp.v, nw ? 'minecraft:damage' : 'Damage', 3, it.dmg); }
    else if (comp) comp.v = comp.v.filter(function (x) { return x.k !== 'minecraft:damage' && x.k !== 'Damage'; });
    return o;
  };
  if (r.eq) { r.eq.v = r.eq.v.filter(function (x) { return x.k !== r.key; }); if (it) r.eq.v.push({ k: r.key, t: 10, v: make() }); return; }
  if (r.c) r.L.v.a.splice(r.idx, 1);
  if (it) { var o2 = make(); o2.unshift({ k: 'Slot', t: 1, v: r.slot & 255 }); r.L.v.a.push(o2); }
}
function nbeShort(id) { var b = BY_JAVA[id] != null ? BLOCKS[BY_JAVA[id]].name : id.replace(/_/g, ' '); return b; }
function nbeInvHtml() {
  if (!nbe.pl) return nbePlayerHtml();
  if (nbe.old) return nbeOldInvHtml();
  var h = '<p class="mixl">Clique num espaço para pôr, trocar ou tirar um item e ver ou mudar os encantamentos dele (✦). 0 a 8 são a barra de baixo do jogo.</p>';
  if (!packs.some(function (P) { return P.items; })) h += '<p class="mixl">' + (packs.length ? 'Para ver o desenho de cada item, escolha o pacote de texturas de novo em Projeto › Texturas (os pacotes guardados antes não trazem os itens).' : 'Para ver o desenho de cada item, escolha um pacote de texturas em Projeto › Texturas.') + '</p>';
  NBE_GROUPS.forEach(function (G) {
    h += '<h4>' + G[1] + '</h4><div class="nbeinv nbe' + G[0] + '">';
    for (var i = 0; i < G[2]; i++) {
      var it = nbeItemRead(G[0], i), on = nbeSlotSel && nbeSlotSel[0] === G[0] && nbeSlotSel[1] === i;
      var en = it && it.ench.length;
      h += '<button class="nbeslot' + (it ? ' full' : '') + (en ? ' ench' : '') + (on ? ' on' : '') + '" data-ns="' + G[0] + ':' + i + '" title="' + esc(it ? nbeShort(it.id) + ' × ' + it.n + (it.dmg ? ' (uso ' + it.dmg + ')' : '') + (en ? '\n' + it.ench.map(nbeEnchLabel).join('\n') : '') : (G[0] === 'armor' ? NBE_ARMOR[i] : G[0] === 'main' && i < 9 ? 'Barra ' + (i + 1) : 'Vazio')) + '">' +
        (it ? nbeIcon(it) + '<span class="nbenm">' + esc(nbeShort(it.id)) + '</span><b>' + it.n + '</b>' + (en ? '<i>✦</i>' : '') : '<span class="nbenm mixl">' + (G[0] === 'armor' ? NBE_ARMOR[i] : G[0] === 'main' && i < 9 ? i + 1 : '') + '</span>') + '</button>';
    }
    h += '</div>';
  });
  if (nbeSlotSel) {
    var it = nbeItemRead(nbeSlotSel[0], nbeSlotSel[1]) || { id: '', n: 1, dmg: 0 };
    h += '<div class="nbeedit row"><label>Item <input type="text" id="nbeIt" list="nbeItems" value="' + esc(it.id) + '" placeholder="diamond_sword" autocomplete="off"></label><label>Quantidade <input type="number" id="nbeIn" value="' + it.n + '" min="1" max="' + (nbe.java ? 99 : 255) + '" style="width:70px"></label>' +
      '<label>Uso <input type="number" id="nbeId2" value="' + it.dmg + '" min="0" max="10000" style="width:70px" title="Durabilidade gasta (0 = nova)"></label><button class="btn primary" id="nbeItOk">Usar</button><button class="btn" id="nbeIt64">64</button><button class="btn" id="nbeItDel">Esvaziar</button>' +
      (it.id ? nbeEnchHtml(it) : '') + '</div>';
  }
  nbeIconLater();
  return h;
}
function nbeInvBind() {
  document.querySelectorAll('[data-ns]').forEach(function (b) { b.onclick = function () { var p = b.getAttribute('data-ns').split(':'); nbeSlotSel = [p[0], +p[1]]; nbeRender(); var i = $('nbeIt'); if (i) i.focus(); }; });
  var ok = $('nbeItOk'); if (!ok) return;
  var apply = function (n) {
    var id = $('nbeIt').value.trim().toLowerCase().replace(/^minecraft:/, '').replace(/\s+/g, '_');
    if (!id) { toast('Digite o nome do item (o do Java, como diamond_sword) ou use Esvaziar.'); return; }
    if (!/^[a-z0-9_.]+$/.test(id)) { toast('Nome de item inválido: use letras minúsculas, números e _.'); return; }
    var max = nbe.java ? 99 : 255, cnt = Math.max(1, Math.min(max, Math.round(n || +$('nbeIn').value || 1))), dmg = Math.max(0, Math.round(+$('nbeId2').value || 0));
    if (NBE_ITEMS.indexOf(id) < 0 && BY_JAVA[id] == null) toast('Aviso: “' + id + '” não está na lista do site; confira o nome (se o jogo não conhecer, o item some ao abrir o mundo).', 7000);
    nbeItemWrite(nbeSlotSel[0], nbeSlotSel[1], { id: id, n: cnt, dmg: dmg }); nbeTouch(false); nbeRender();
  };
  ok.onclick = function () { apply(0); };
  $('nbeIt64').onclick = function () { apply(64); };
  $('nbeItDel').onclick = function () { nbeItemWrite(nbeSlotSel[0], nbeSlotSel[1], null); nbeTouch(false); nbeRender(); };
  $('nbeIt').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); apply(0); } });
  nbeEnchBind();
}

/* ---------- Encantamentos ----------
   Bedrock: tag.ench, lista de {id: short (o número abaixo), lvl: short}; o livro encantado usa o mesmo (conferido com o
   servidor oficial 1.26.52: um livro de cada encantamento pela tabela de loot, lido do baú). Java: components
   "minecraft:enchantments" (livro: "minecraft:stored_enchantments") com {nome: nível} (de 1.20.5 a 1.21.4 dentro de
   "levels"); antes da 1.20.5, tag.Enchantments (livro: StoredEnchantments), lista de {id: "minecraft:nome", lvl: short}.
   [número no Bedrock, nome, nome no jogo em português (texts/pt_BR.lang), nível máximo normal, itens em que vem] */
var NBE_ENCH = [[0, 'protection', 'Proteção', 4, 'armor'], [1, 'fire_protection', 'Proteção Contra Fogo', 4, 'armor'], [2, 'feather_falling', 'Peso-pena', 4, 'boots'],
  [3, 'blast_protection', 'Proteção Contra Explosões', 4, 'armor'], [4, 'projectile_protection', 'Proteção Contra Projéteis', 4, 'armor'], [5, 'thorns', 'Espinhos', 3, 'armor'],
  [6, 'respiration', 'Respiração', 3, 'helmet'], [7, 'depth_strider', 'Passos Profundos', 3, 'boots'], [8, 'aqua_affinity', 'Afinidade Aquática', 1, 'helmet'],
  [9, 'sharpness', 'Afiação', 5, 'sword axe spear'], [10, 'smite', 'Julgamento', 5, 'sword axe mace spear'], [11, 'bane_of_arthropods', 'Ruína dos Artrópodes', 5, 'sword axe mace spear'],
  [12, 'knockback', 'Repulsão', 2, 'sword spear'], [13, 'fire_aspect', 'Aspecto de Fogo', 2, 'sword mace spear'], [14, 'looting', 'Pilhagem', 3, 'sword spear'],
  [15, 'efficiency', 'Eficiência', 5, 'tool axe shears'], [16, 'silk_touch', 'Toque de Seda', 1, 'tool axe'], [17, 'unbreaking', 'Inquebrável', 3, 'dur'],
  [18, 'fortune', 'Fortuna', 3, 'tool axe'], [19, 'power', 'Força', 5, 'bow'], [20, 'punch', 'Impacto', 2, 'bow'], [21, 'flame', 'Chama', 1, 'bow'], [22, 'infinity', 'Infinidade', 1, 'bow'],
  [23, 'luck_of_the_sea', 'Sorte do Mar', 3, 'rod'], [24, 'lure', 'Isca', 3, 'rod'], [25, 'frost_walker', 'Caminhante de Geada', 2, 'boots'], [26, 'mending', 'Reparação', 1, 'dur'],
  [27, 'binding', 'Maldição de Fuga', 1, 'armor elytra'], [28, 'vanishing', 'Maldição do Desaparecimento', 1, 'dur'], [29, 'impaling', 'Empalamento', 5, 'trident'],
  [30, 'riptide', 'Correnteza', 3, 'trident'], [31, 'loyalty', 'Lealdade', 3, 'trident'], [32, 'channeling', 'Condutividade', 1, 'trident'], [33, 'multishot', 'Tiro Múltiplo', 1, 'xbow'],
  [34, 'piercing', 'Perfuração', 4, 'xbow'], [35, 'quick_charge', 'Carregamento Rápido', 3, 'xbow'], [36, 'soul_speed', 'Velocidade de Almas', 3, 'boots'], [37, 'swift_sneak', 'Passos Furtivos', 3, 'legs'],
  [38, 'wind_burst', 'Explosão de Vento', 3, 'mace'], [39, 'density', 'Densidade', 5, 'mace'], [40, 'breach', 'Brecha', 4, 'mace'], [41, 'lunge', 'Investida', 3, 'spear']];
var NBE_ENCH_JAVA = { binding: 'binding_curse', vanishing: 'vanishing_curse' };
function nbeEnchByName(n) { n = String(n).replace(/^minecraft:/, ''); for (var i = 0; i < NBE_ENCH.length; i++) if (NBE_ENCH[i][1] === n || NBE_ENCH_JAVA[NBE_ENCH[i][1]] === n) return NBE_ENCH[i]; return null; }
function nbeEnchById(n) { for (var i = 0; i < NBE_ENCH.length; i++) if (NBE_ENCH[i][0] === n) return NBE_ENCH[i]; return null; }
var NBE_ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
function nbeEnchLabel(e) { var E = nbeEnchByName(e.n); return (E ? E[2] : e.n) + ' ' + (NBE_ROMAN[e.lv] || e.lv); }
/* os grupos do item (para pôr primeiro os encantamentos que o jogo dá a ele) */
function nbeItemCats(id) {
  var c = [];
  if (/_helmet$|^turtle_helmet$/.test(id)) c.push('armor', 'helmet');
  if (/_chestplate$/.test(id)) c.push('armor');
  if (/_leggings$/.test(id)) c.push('armor', 'legs');
  if (/_boots$/.test(id)) c.push('armor', 'boots');
  if (/_sword$/.test(id)) c.push('sword'); if (/(^|_)axe$/.test(id) && !/pickaxe$/.test(id)) c.push('axe');
  if (/_(pickaxe|shovel|hoe)$/.test(id)) c.push('tool'); if (id === 'shears') c.push('shears'); if (/_spear$/.test(id)) c.push('spear');
  if (id === 'bow') c.push('bow'); if (id === 'crossbow') c.push('xbow'); if (id === 'trident') c.push('trident'); if (id === 'fishing_rod') c.push('rod'); if (id === 'mace') c.push('mace');
  if (id === 'elytra') c.push('elytra');
  if (c.length || /^(flint_and_steel|carrot_on_a_stick|warped_fungus_on_a_stick|shield|brush)$/.test(id)) c.push('dur');
  if (/^(enchanted_book|book)$/.test(id)) c.push('*');
  return c;
}
function nbeEnchFits(E, cats) { return cats.indexOf('*') >= 0 || E[4].split(' ').some(function (k) { return cats.indexOf(k) >= 0; }); }
function nbeJavaEnchKey(c) { var id = ((nbeGet(c, 'id') || {}).v || '').replace(/^minecraft:/, ''); return id === 'enchanted_book'; }
function nbeEnchRead(c) {
  if (!c) return [];
  var out = [], push = function (n, lv) { out.push({ n: String(n).replace(/^minecraft:/, ''), lv: lv }); };
  if (!nbe.java) {
    var tg = nbeGet(c, 'tag'), L = tg && nbeGet(tg.v, 'ench');
    if (L && L.t === 9 && L.v.et === 10) L.v.a.forEach(function (e) { var id = nbeNum(nbeGet(e, 'id')), E = nbeEnchById(id); push(E ? E[1] : 'número ' + id, nbeNum(nbeGet(e, 'lvl'))); });
    return out;
  }
  var book = nbeJavaEnchKey(c), comp = nbeGet(c, 'components');
  var ce = comp && nbeGet(comp.v, book ? 'minecraft:stored_enchantments' : 'minecraft:enchantments');
  if (ce && ce.t === 10) { var m = nbeGet(ce.v, 'levels'); (m && m.t === 10 ? m.v : ce.v).forEach(function (e) { if (e.k !== 'show_in_tooltip' && e.t !== 10) push(e.k, nbeNum(e)); }); return out; }
  var tg2 = nbeGet(c, 'tag'), L2 = tg2 && nbeGet(tg2.v, book ? 'StoredEnchantments' : 'Enchantments');
  if (L2 && L2.t === 9 && L2.v.et === 10) L2.v.a.forEach(function (e) { var id = nbeGet(e, 'id'); push(id ? (id.t === 8 ? id.v : 'número ' + nbeNum(id)) : '?', nbeNum(nbeGet(e, 'lvl'))); });
  return out;
}
function nbeEnchWrite(c, list) {
  if (!nbe.java) {
    var tg = nbeGet(c, 'tag');
    if (!list.length) { if (tg) tg.v = tg.v.filter(function (x) { return x.k !== 'ench'; }); return; }
    if (!tg) { tg = { k: 'tag', t: 10, v: [] }; c.push(tg); }
    tg.v = tg.v.filter(function (x) { return x.k !== 'ench'; });
    tg.v.push({ k: 'ench', t: 9, v: { et: 10, a: list.map(function (e) { var E = nbeEnchByName(e.n); return [{ k: 'id', t: 2, v: E ? E[0] : 0 }, { k: 'lvl', t: 2, v: e.lv }]; }) } });
    return;
  }
  var book = nbeJavaEnchKey(c), jn = function (n) { return 'minecraft:' + (NBE_ENCH_JAVA[n] || n); };
  if (nbeJavaNew()) {
    var key = book ? 'minecraft:stored_enchantments' : 'minecraft:enchantments', comp = nbeGet(c, 'components');
    if (!comp) { if (!list.length) return; comp = { k: 'components', t: 10, v: [] }; c.push(comp); }
    comp.v = comp.v.filter(function (x) { return x.k !== key; });
    if (!list.length) return;
    var lv = list.map(function (e) { return { k: jn(e.n), t: 3, v: e.lv }; });
    comp.v.push({ k: key, t: 10, v: (wio.dataVersion || 0) >= 4325 ? lv : [{ k: 'levels', t: 10, v: lv }] }); // 1.21.5 tirou o "levels"
    return;
  }
  var k2 = book ? 'StoredEnchantments' : 'Enchantments', tg2 = nbeGet(c, 'tag');
  if (!tg2) { if (!list.length) return; tg2 = { k: 'tag', t: 10, v: [] }; c.push(tg2); }
  tg2.v = tg2.v.filter(function (x) { return x.k !== k2; });
  if (list.length) tg2.v.push({ k: k2, t: 9, v: { et: 10, a: list.map(function (e) { return [{ k: 'id', t: 8, v: jn(e.n) }, { k: 'lvl', t: 2, v: e.lv }]; }) } });
}
function nbeEnchHtml(it) {
  var cats = nbeItemCats(it.id), fit = NBE_ENCH.filter(function (E) { return nbeEnchFits(E, cats); }), rest = NBE_ENCH.filter(function (E) { return !nbeEnchFits(E, cats); });
  var opt = function (E) { return '<option value="' + E[1] + '">' + esc(E[2]) + ' (até ' + (NBE_ROMAN[E[3]] || E[3]) + ')</option>'; };
  var h = '<div class="nbench"><b>Encantamentos</b>';
  if (!it.ench.length) h += '<span class="mixl">Este item não tem encantamento.</span>';
  it.ench.forEach(function (e, i) {
    var E = nbeEnchByName(e.n);
    h += '<div class="row"><b class="nm">' + esc(E ? E[2] : e.n) + '</b><label>Nível <input type="number" data-enlv="' + i + '" value="' + e.lv + '" min="1" max="32767" style="width:70px"></label>' + (E ? '<span class="mixl">normal até ' + E[3] + '</span>' : '') + '<button class="btn" data-endel="' + i + '">Tirar</button></div>';
  });
  h += '<div class="row"><select id="nbeEnN">' + (fit.length ? '<optgroup label="Os que o jogo dá a este item">' + fit.map(opt).join('') + '</optgroup><optgroup label="Outros">' + rest.map(opt).join('') + '</optgroup>' : NBE_ENCH.map(opt).join('')) + '</select>' +
    '<label>Nível <input type="number" id="nbeEnL" value="1" min="1" max="32767" style="width:70px"></label><button class="btn" id="nbeEnAdd">Pôr encantamento</button><button class="btn" id="nbeEnMax" title="Põe os do item com o nível máximo normal (sem os que brigam entre si nem as maldições)">Todos no máximo</button></div></div>';
  return h;
}
/* encantamentos que o jogo não deixa juntos: fica o primeiro da lista */
var NBE_ENCH_CLASH = [['protection', 'fire_protection', 'blast_protection', 'projectile_protection'], ['sharpness', 'smite', 'bane_of_arthropods', 'breach', 'density'], ['silk_touch', 'fortune'], ['infinity', 'mending'], ['riptide', 'loyalty', 'channeling'], ['multishot', 'piercing'], ['depth_strider', 'frost_walker']];
function nbeEnchBind() {
  var add = $('nbeEnAdd'); if (!add) return;
  var cur = function () { return nbeSlotRef(nbeSlotSel[0], nbeSlotSel[1]).c; };
  var save = function (list) { var c = cur(); if (!c) return; nbeEnchWrite(c, list); nbeTouch(false); nbeRender(); };
  var lvOf = function (v) { var n = Math.round(+v); return isFinite(n) && n >= 1 && n <= 32767 ? n : null; };
  add.onclick = function () {
    var n = $('nbeEnN').value, lv = lvOf($('nbeEnL').value); if (!lv) { toast('Nível: de 1 a 32767.'); return; }
    var list = nbeEnchRead(cur()).filter(function (e) { return e.n !== n; }); list.push({ n: n, lv: lv }); save(list);
  };
  $('nbeEnMax').onclick = function () {
    var it = nbeItemRead(nbeSlotSel[0], nbeSlotSel[1]), cats = nbeItemCats(it.id), list = it.ench.slice();
    if (cats.indexOf('*') >= 0 || !cats.length) { toast('Escolha um encantamento na lista: este item não tem os do jogo definidos.'); return; }
    NBE_ENCH.forEach(function (E) {
      if (!nbeEnchFits(E, cats) || /^(binding|vanishing)$/.test(E[1])) return;
      var grp = NBE_ENCH_CLASH.filter(function (g) { return g.indexOf(E[1]) >= 0; })[0];
      if (grp && list.some(function (e) { return e.n !== E[1] && grp.indexOf(e.n) >= 0; })) return;
      list = list.filter(function (e) { return e.n !== E[1]; }); list.push({ n: E[1], lv: E[3] });
    });
    save(list);
  };
  document.querySelectorAll('[data-endel]').forEach(function (b) { b.onclick = function () { var i = +b.getAttribute('data-endel'), list = nbeEnchRead(cur()); list.splice(i, 1); save(list); }; });
  document.querySelectorAll('[data-enlv]').forEach(function (el) { el.onchange = function () { var lv = lvOf(el.value); if (!lv) { toast('Nível: de 1 a 32767.'); nbeRender(); return; } var i = +el.getAttribute('data-enlv'), list = nbeEnchRead(cur()); list[i].lv = lv; save(list); }; });
}

/* ---------- O desenho de cada item (do pacote de texturas: textures/items no Bedrock, textures/item no Java) ---------- */
var NBE_COLORS = 'white orange magenta light_blue yellow lime pink gray light_gray cyan purple blue brown green red black'.split(' ');
var NBE_ICON = {}, nbeIconBusy = false;
function nbeIconKey(it) { return it.id === 'bed' && !nbe.java ? 'bed:' + (it.aux & 15) : it.id; }
function nbeIcon(it) {
  var u = NBE_ICON[nbeIconKey(it)];
  return u ? '<img class="nbeimg" src="' + u + '" alt="">' : '<span class="nbesw" style="' + beSwatch(it.id) + '"></span>';
}
function nbeIconTex(k) {
  for (var i = packs.length - 1; i >= 0; i--) { var P = packs[i]; if (P.items && P.items[k]) return P.items[k]; }
  return k.indexOf(':') > 0 ? nbeIconTex(k.split(':')[0]) : null;
}
/* lê os desenhos que faltam e mostra de novo (uma vez: o que não tem desenho fica marcado) */
function nbeIconLater() {
  if (nbeIconBusy) return;
  var want = [];
  NBE_GROUPS.forEach(function (G) { for (var i = 0; i < G[2]; i++) { var it = nbeItemRead(G[0], i); if (it && !(nbeIconKey(it) in NBE_ICON)) want.push(nbeIconKey(it)); } });
  if (!want.length) return;
  nbeIconBusy = true;
  (async function () {
    for (var j = 0; j < want.length; j++) {
      var k = want[j]; if (k in NBE_ICON) continue; NBE_ICON[k] = '';
      var t = nbeIconTex(k); if (!t) continue;
      try { NBE_ICON[k] = nbeIconUrl(await decodeImage(t), k); } catch (e) {}
    }
    nbeIconBusy = false;
    if (nbe && nbe.tab === 'inv' && $('nbeBody')) { var sc = $('nbeBody').scrollTop; nbeRender(); $('nbeBody').scrollTop = sc; }
  })();
}
/* o primeiro quadro (alguns desenhos são tiras animadas); o couro vem cinza e o jogo pinta com a cor padrão */
function nbeIconUrl(img, k) {
  var s = Math.min(img.w, img.h), cv = document.createElement('canvas'); cv.width = cv.height = s;
  var g = cv.getContext('2d'), out = g.createImageData(s, s), tint = /^leather_(helmet|chestplate|leggings|boots|horse_armor)$/.test(k) ? [0xa0 / 255, 0x65 / 255, 0x40 / 255] : null;
  for (var y = 0; y < s; y++) for (var x = 0; x < s; x++) {
    var i = (y * img.w + x) * 4, o = (y * s + x) * 4;
    out.data[o] = tint ? img.d[i] * tint[0] : img.d[i]; out.data[o + 1] = tint ? img.d[i + 1] * tint[1] : img.d[i + 1]; out.data[o + 2] = tint ? img.d[i + 2] * tint[2] : img.d[i + 2]; out.data[o + 3] = img.d[i + 3];
  }
  g.putImageData(out, 0, 0); return cv.toDataURL();
}

/* ---------- Pocket Edition 0.2 a 0.8 (o jogador dentro do level.dat) ---------- */
/* O que essa versão guarda do jogador: posição, vida, a cama e o inventário por número. Sem modo próprio, fome,
   experiência, efeitos ou habilidades. */
function nbeOldPlayerHtml() {
  var P = nbe.pl; if (!P) return '<p>Este mundo não tem o jogador no level.dat.</p>';
  var h = '<h4>Posição</h4>', pe = nbeGet(P, 'Pos'), pos = nbeListNums(pe) || [0, 0, 0];
  ['X', 'Y', 'Z'].forEach(function (a, i) { var id = nbeId(); NBE_SET[id] = function (v) { var r = nbeNumIn(v, i === 1 ? 0 : 0, i === 1 ? 200 : 256, a); if (r.err) return r.err; nbeSetList(pe, i, r.n); nbeTouch(false); }; h += nbeRow(a, nbeInput(id, Math.round(pos[i] * 100) / 100, 'number', 'step="any"'), i === 1 ? '' : 'o mundo vai de 0 a 256'); });
  if (wio.player) h += '<div class="row"><button class="btn" id="nbePosSel" title="A posição vira o meio da seleção do editor (na área carregada)">Pôr o jogador no meio da seleção</button></div>';
  h += '<h4>Estado</h4>' + nbeField(P, 'Health', 2, 'Vida', 1, 20, false, '20 = 10 corações');
  h += '<h4>Ponto de renascimento</h4>';
  if (nbeNum(nbeGet(P, 'SpawnY')) >= 0 && nbeGet(P, 'SpawnX')) h += nbeField(P, 'SpawnX', 3, 'X', 0, 256, false) + nbeField(P, 'SpawnY', 3, 'Y', 0, 128, false) + nbeField(P, 'SpawnZ', 3, 'Z', 0, 256, false);
  else h += '<p class="mixl">Sem cama: renasce no ponto de nascimento do mundo.</p>';
  return h;
}
/* Inventário: os itens por número (id e Damage). Os espaços 0 a 8 da lista são a barra, que aponta para os espaços do
   inventário (id 255 = nada); o site mostra, mas não muda (o formato não pôde ser conferido com o jogo antigo). */
function nbeOldName(id, dmg) {
  if (id > 0 && id < 256) { var j = LEG.b[id + ':' + (dmg || 0)] || LEG.b[id + ':0']; if (j) { j = j.replace(/\[.*$/, ''); return LEG_RENAME[j] || j; } }
  return LEG.i[id] || ('item ' + id);
}
function nbeOldInvHtml() {
  var L = nbeGet(nbe.pl, 'Inventory'), rows = [];
  (L && L.v.et === 10 ? L.v.a : []).forEach(function (c) {
    var id = nbeNum(nbeGet(c, 'id')), n = nbeNum(nbeGet(c, 'Count')), s = nbeNum(nbeGet(c, 'Slot')), d = nbeNum(nbeGet(c, 'Damage'));
    if (s < 9 || !id || id === 255 || !n || n === 255) return; // barra (aponta para o inventário) e espaços vazios
    rows.push('<div class="row"><span class="nbesw" style="' + beSwatch(nbeOldName(id, d)) + '"></span><b>' + esc(beItemName(nbeOldName(id, d))) + '</b> × ' + n + ' <span class="mixl">(espaço ' + (s - 8) + '; número ' + id + (d > 0 ? ':' + d : '') + ')</span></div>');
  });
  return '<p class="mixl">Nesta versão, os itens ficam guardados por número, e a barra de baixo aponta para os espaços do inventário. O site mostra o inventário, mas não muda: o jeito exato que a versão antiga grava não pôde ser conferido no jogo, e um erro aqui pode apagar o inventário.</p>' +
    (rows.length ? rows.join('') : '<p>O inventário está vazio.</p>');
}
