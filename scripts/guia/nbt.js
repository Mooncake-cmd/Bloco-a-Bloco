// Capturas do Editor NBT: node scripts/guia/nbt.js <url do editor> <mundo .mcworld do Bedrock> <pasta de saída>
// [pacote Bedrock .zip, para os desenhos dos itens]
// O mundo (de preferência gerado pelo servidor oficial, sem jogador) ganha um jogador de exemplo montado aqui (~local_player
// com posição, atributos e alguns itens, a espada e as botas encantadas), para as abas Jogador e Inventário. Faz nbt-mundo.jpg,
// nbt-regras.jpg, nbt-jogador.jpg, nbt-inventario.jpg e nbt-encantamentos.jpg (a janela recortada). Também confere os
// encantamentos: põe um pelo botão, muda o nível de outro, grava e lê de volta o que foi gravado (os números do Bedrock).
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');
const [URL, WORLD, OUT, PACK] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => { if (!sessionStorage.getItem('x')) { sessionStorage.setItem('x', '1'); localStorage.clear(); } });
  await p.goto(URL); await p.addStyleTag({ content: '#tabbar{display:none!important}' }); await p.waitForTimeout(2500);
  const ev = s => p.evaluate(x => window.__bab.ev(x), s);
  if (PACK) { await p.setInputFiles('#packIn', PACK); await p.waitForFunction(() => /blocos com textura/.test(document.getElementById('toast').textContent), null, { timeout: 300000 }); }
  await p.setInputFiles('#worldIn', WORLD); await p.waitForSelector('#wmGo', { timeout: 600000 });
  await ev('closeDialog()'); await ev('wio.area = wio.area || { dim: 0, x0: 0, z0: 0, w: 64, d: 64 }');
  // jogador de exemplo (little-endian, como o do jogo)
  await ev(`(function(){ var f = function (n) { var b = new Uint8Array(4); new DataView(b.buffer).setFloat32(0, n, true); return b; };
    var it = function (nm, n, slot, dmg, ench, aux) { var c = [{ k: 'Count', t: 1, v: n }, { k: 'Damage', t: 2, v: aux || 0 }, { k: 'Name', t: 8, v: nm ? 'minecraft:' + nm : '' }, { k: 'WasPickedUp', t: 1, v: 0 }]; if (slot != null) c.push({ k: 'Slot', t: 1, v: slot });
      var tg = []; if (dmg) tg.push({ k: 'Damage', t: 3, v: dmg }); if (ench) tg.push({ k: 'ench', t: 9, v: { et: 10, a: ench.map(function (e) { return [{ k: 'id', t: 2, v: e[0] }, { k: 'lvl', t: 2, v: e[1] }]; }) } }); if (tg.length) c.push({ k: 'tag', t: 10, v: tg }); return c; };
    var at = function (nm, cur, max) { return [{ k: 'Base', t: 5, v: f(cur) }, { k: 'Current', t: 5, v: f(cur) }, { k: 'DefaultMax', t: 5, v: f(max) }, { k: 'DefaultMin', t: 5, v: f(0) }, { k: 'Max', t: 5, v: f(max) }, { k: 'Min', t: 5, v: f(0) }, { k: 'Name', t: 8, v: nm }]; };
    var items = { 0: ['diamond_sword', 1, 40, [[9, 5], [17, 3], [14, 3]]], 1: ['diamond_pickaxe', 1, 120, [[15, 4]]], 2: ['bow', 1], 3: ['arrow', 64], 4: ['torch', 48], 5: ['cooked_beef', 23], 6: ['oak_planks', 64], 7: ['water_bucket', 1], 8: ['ender_pearl', 9], 12: ['cobblestone', 64], 13: ['iron_ingot', 27], 14: ['enchanted_book', 1, 0, [[26, 1]]], 15: ['bed', 1, 0, null, 11], 21: ['redstone', 30], 22: ['golden_apple', 2], 23: ['spyglass', 1], 24: ['zombie_spawn_egg', 3] };
    var inv = []; for (var s = 0; s < 36; s++) { var q = items[s]; inv.push(q ? it(q[0], q[1], s, q[2], q[3], q[4]) : it('', 0, s)); }
    var ender = []; for (s = 0; s < 27; s++) ender.push(s === 0 ? it('diamond', 12, 0) : s === 1 ? it('emerald', 5, 1) : it('', 0, s));
    var P = [{ k: 'Armor', t: 9, v: { et: 10, a: [it('iron_helmet', 1), it('iron_chestplate', 1, null, 30), it('iron_leggings', 1), it('leather_boots', 1, null, 0, [[2, 4]])] } },
      { k: 'Attributes', t: 9, v: { et: 10, a: [at('minecraft:health', 20, 20), at('minecraft:player.hunger', 18, 20), at('minecraft:player.saturation', 5, 20), at('minecraft:player.level', 14, 24791), at('minecraft:player.experience', 0.3, 1)] } },
      { k: 'DimensionId', t: 3, v: 0 }, { k: 'EnderChestInventory', t: 9, v: { et: 10, a: ender } }, { k: 'Inventory', t: 9, v: { et: 10, a: inv } }, { k: 'Offhand', t: 9, v: { et: 10, a: [it('shield', 1)] } },
      { k: 'PlayerGameMode', t: 3, v: 5 }, { k: 'PlayerLevel', t: 3, v: 14 }, { k: 'PlayerLevelProgress', t: 5, v: f(0.3) }, { k: 'Pos', t: 9, v: { et: 5, a: [f(12.5), f(71.62), f(-8.5)] } },
      { k: 'SpawnDimension', t: 3, v: 0 }, { k: 'SpawnX', t: 3, v: 10 }, { k: 'SpawnY', t: 3, v: 70 }, { k: 'SpawnZ', t: 3, v: -6 },
      { k: 'abilities', t: 10, v: [{ k: 'flying', t: 1, v: 0 }, { k: 'invulnerable', t: 1, v: 0 }, { k: 'mayfly', t: 1, v: 0 }] },
      { k: 'ActiveEffects', t: 9, v: { et: 10, a: [[{ k: 'Ambient', t: 1, v: 0 }, { k: 'Amplifier', t: 1, v: 0 }, { k: 'Duration', t: 3, v: 3600 }, { k: 'Id', t: 1, v: 16 }, { k: 'ShowParticles', t: 1, v: 1 }]] } }];
    wio.patches.set('~local_player', nbtTreeWrite({ k: '', t: 10, v: P })); })()`);
  await ev('openNbtEditor()'); await p.waitForSelector('#nbeBody .nberow');
  const shot = async (nome) => { await p.evaluate(() => document.getElementById('toast').classList.remove('show')); await p.waitForTimeout(400); await (await p.$('#overlayRoot .dialog')).screenshot({ path: path.join(OUT, nome), type: 'jpeg', quality: 86 }); };
  await shot('nbt-mundo.jpg');
  await p.click('[data-nt="regras"]'); await shot('nbt-regras.jpg');
  await p.click('[data-nt="jogador"]'); await shot('nbt-jogador.jpg');
  await p.click('[data-nt="inv"]'); await p.waitForTimeout(1500); // os desenhos dos itens chegam depois
  await p.evaluate(() => { const d = document.querySelector('#nbeBody'); d.scrollTop = 0; }); await shot('nbt-inventario.jpg');
  // a espada: os encantamentos dela, mais um posto pelo botão e o nível de outro mudado
  await p.click('[data-ns="main:0"]'); await p.waitForTimeout(300);
  await p.selectOption('#nbeEnN', 'fire_aspect'); await p.fill('#nbeEnL', '2'); await p.click('#nbeEnAdd'); await p.waitForTimeout(300);
  await p.fill('[data-enlv="1"]', '5'); await p.dispatchEvent('[data-enlv="1"]', 'change'); await p.waitForTimeout(300);
  await p.evaluate(() => { const e = document.querySelector('.nbench'); e.scrollIntoView({ block: 'end' }); }); await shot('nbt-encantamentos.jpg');
  await p.click('#nbeOk'); await p.waitForTimeout(500);
  const back = await ev(`(function(){ var P = nbtTreeLE(wio.patches.get('~local_player')).v, inv = P.filter(function (e) { return e.k === 'Inventory'; })[0].v.a;
    var sw = inv.filter(function (c) { return c.some(function (e) { return e.k === 'Slot' && e.v === 0; }); })[0], tg = sw.filter(function (e) { return e.k === 'tag'; })[0].v, L = tg.filter(function (e) { return e.k === 'ench'; })[0];
    return JSON.stringify({ tipos: [L.t, L.v.et], ench: L.v.a.map(function (c) { return c.map(function (e) { return e.k + ':' + e.t + '=' + e.v; }).join(' '); }), dano: tg.filter(function (e) { return e.k === 'Damage'; })[0].v }); })()`);
  console.log('gravado:', back);
  console.log('ok nbt', errs); await b.close();
})();
