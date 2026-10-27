// Exportadores de estruturas do Minecraft: .schem (Java, Sponge v3) e .mcstructure (Bedrock).
// Sem dependências: funciona no navegador e no Node.
(function (root) {
  'use strict';

  // ---------- Escritor NBT mínimo ----------
  // Valores: {t:'byte'|'short'|'int'|'string'|'bytes'|'list'|'compound', v:...}
  function NbtWriter(little) {
    this.little = little;
    this.buf = new Uint8Array(1024);
    this.len = 0;
  }
  NbtWriter.prototype.ensure = function (n) {
    if (this.len + n <= this.buf.length) return;
    let cap = this.buf.length;
    while (cap < this.len + n) cap *= 2;
    const nb = new Uint8Array(cap);
    nb.set(this.buf.subarray(0, this.len));
    this.buf = nb;
  };
  NbtWriter.prototype.u8 = function (v) { this.ensure(1); this.buf[this.len++] = v & 255; };
  NbtWriter.prototype.u16 = function (v) {
    this.ensure(2);
    if (this.little) { this.buf[this.len++] = v & 255; this.buf[this.len++] = (v >> 8) & 255; }
    else { this.buf[this.len++] = (v >> 8) & 255; this.buf[this.len++] = v & 255; }
  };
  NbtWriter.prototype.i32 = function (v) {
    this.ensure(4);
    if (this.little) for (let i = 0; i < 4; i++) this.buf[this.len++] = (v >> (8 * i)) & 255;
    else for (let i = 3; i >= 0; i--) this.buf[this.len++] = (v >> (8 * i)) & 255;
  };
  NbtWriter.prototype.str = function (s) {
    const b = new TextEncoder().encode(s);
    this.u16(b.length);
    this.ensure(b.length);
    this.buf.set(b, this.len);
    this.len += b.length;
  };
  const TAGID = { byte: 1, short: 2, int: 3, bytes: 7, string: 8, list: 9, compound: 10, ints: 11 };
  NbtWriter.prototype.payload = function (val) {
    switch (val.t) {
      case 'byte': this.u8(val.v); break;
      case 'short': this.u16(val.v); break;
      case 'int': this.i32(val.v); break;
      case 'string': this.str(val.v); break;
      case 'bytes':
        this.i32(val.v.length);
        this.ensure(val.v.length);
        this.buf.set(val.v, this.len);
        this.len += val.v.length;
        break;
      case 'ints': this.i32(val.v.length); for (const x of val.v) this.i32(x); break;
      case 'list': { // val.of = tipo dos itens; val.v = array de payloads
        this.u8(TAGID[val.of] || 0);
        this.i32(val.v.length);
        for (const item of val.v) this.payload({ t: val.of, v: item });
        break;
      }
      case 'compound':
        for (const k of Object.keys(val.v)) {
          const c = val.v[k];
          this.u8(TAGID[c.t]);
          this.str(k);
          this.payload(c);
        }
        this.u8(0);
        break;
      default: throw new Error('tag NBT desconhecida: ' + val.t);
    }
  };
  NbtWriter.prototype.finish = function () { return this.buf.slice(0, this.len); };

  function nbtRoot(name, compound, little) {
    const w = new NbtWriter(little);
    w.u8(10);
    w.str(name);
    w.payload({ t: 'compound', v: compound });
    return w.finish();
  }

  // ---------- Util ----------
  function varint(out, n) {
    while (n >= 0x80) { out.push((n & 0x7f) | 0x80); n >>>= 7; }
    out.push(n);
  }

  function bounds(voxels) {
    let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (const [x, y, z] of voxels) {
      if (x < minX) minX = x; if (y < minY) minY = y; if (z < minZ) minZ = z;
      if (x > maxX) maxX = x; if (y > maxY) maxY = y; if (z > maxZ) maxZ = z;
    }
    return { minX, minY, minZ, maxX, maxY, maxZ, w: maxX - minX + 1, h: maxY - minY + 1, l: maxZ - minZ + 1 };
  }

  async function gzip(u8) {
    if (typeof CompressionStream !== 'undefined') {
      const cs = new CompressionStream('gzip');
      const stream = new Blob([u8]).stream().pipeThrough(cs);
      return new Uint8Array(await new Response(stream).arrayBuffer());
    }
    // Node
    const zlib = require('zlib');
    return new Uint8Array(zlib.gzipSync(u8));
  }

  // Estados padrão extras (folhas não devem decair)
  // ori: índice da direção em blk.ori.o (ausente = direção inicial)
  function oriOf(blk, ori) { return blk.ori ? blk.ori.o[ori == null || !blk.ori.o[ori] ? blk.ori.d : ori] : null; }
  function javaState(blk, ori) {
    const o = oriOf(blk, ori);
    if (o) return '[' + blk.ori.k + '=' + o[0] + ']';
    if (/_leaves$/.test(blk.java)) return '[persistent=true]';
    return '';
  }

  // ---------- .schem (Sponge Schematic v3, Java) ----------
  // voxels: array de [x,y,z,idx,direção?]; BLOCKS[idx] = {java, bedrock, ori?, bst?}
  async function exportSchem(voxels, BLOCKS, opts) {
    opts = opts || {};
    if (!voxels.length) throw new Error('A construção está vazia.');
    // blocos que só existem no Bedrock (bo) não têm equivalente no Java: ficam de fora
    voxels = voxels.filter(v => !BLOCKS[v[3]].bo);
    if (!voxels.length) throw new Error('A construção só tem blocos que não existem no Java.');
    const b = bounds(voxels);
    const grid = new Int32Array(b.w * b.h * b.l).fill(-1), oris = new Int32Array(grid.length), extra = [], bents = [];
    for (const [x, y, z, idx, o, ex, be] of voxels) {
      const i = ((y - b.minY) * b.l + (z - b.minZ)) * b.w + (x - b.minX);
      grid[i] = idx; oris[i] = o == null ? -1 : o; if (ex) extra[i] = ex;
      // itens e texto (Sponge v3: Pos relativo, Id e os dados em Data)
      if (be && be.java) bents.push({ Pos: { t: 'ints', v: [x - b.minX, y - b.minY, z - b.minZ] }, Id: { t: 'string', v: be.jid }, Data: { t: 'compound', v: be.java } });
    }
    const palette = { 'minecraft:air': 0 };
    let next = 1;
    const data = [];
    for (let i = 0; i < grid.length; i++) {
      const idx = grid[i];
      if (idx < 0) { varint(data, 0); continue; }
      // ex.j: estado Java completo já calculado pelo editor (formas: portas, escadas, cercas...)
      const key = 'minecraft:' + BLOCKS[idx].java + (extra[i] ? extra[i].j : javaState(BLOCKS[idx], oris[i] < 0 ? null : oris[i]));
      if (palette[key] === undefined) palette[key] = next++;
      varint(data, palette[key]);
    }
    const pal = {};
    for (const k of Object.keys(palette)) pal[k] = { t: 'int', v: palette[k] };
    const dataVersion = opts.dataVersion || 4671; // Java 1.21.11
    const root = {
      Schematic: {
        t: 'compound',
        v: {
          Version: { t: 'int', v: 3 },
          DataVersion: { t: 'int', v: dataVersion },
          Metadata: { t: 'compound', v: { Name: { t: 'string', v: opts.name || 'construcao' }, Author: { t: 'string', v: opts.author || '' } } },
          Width: { t: 'short', v: b.w },
          Height: { t: 'short', v: b.h },
          Length: { t: 'short', v: b.l },
          Offset: { t: 'ints', v: [0, 0, 0] },
          Blocks: {
            t: 'compound',
            v: {
              Palette: { t: 'compound', v: pal },
              Data: { t: 'bytes', v: Uint8Array.from(data) },
              BlockEntities: { t: 'list', of: 'compound', v: bents }
            }
          }
        }
      }
    };
    return gzip(nbtRoot('', root, false));
  }

  // ---------- .mcstructure (Bedrock) ----------
  const BEDROCK_BLOCK_VERSION = 18090528; // 1.20.80: o jogo atualiza para a versão atual ao carregar
  // Blocos com direção trazem os estados padrão completos e a versão do esquema (blk.bst = [versão, {nome: [tipo, valor]}]);
  // o estado da direção (blk.ori.bk) recebe o valor da direção escolhida.
  function bedrockStates(blk, ori) {
    if (blk.bst) {
      const st = {}, o = oriOf(blk, ori);
      for (const k of Object.keys(blk.bst[1])) st[k] = { t: blk.bst[1][k][0], v: blk.bst[1][k][1] };
      if (o && st[blk.ori.bk]) st[blk.ori.bk].v = o[1];
      return st;
    }
    if (/_leaves$/.test(blk.bedrock)) return { persistent_bit: { t: 'byte', v: 1 }, update_bit: { t: 'byte', v: 0 } };
    return {};
  }
  // opts.preserveTerrain: células vazias viram structure_void (não substituem o que já existe no mundo)
  async function exportMcstructure(voxels, BLOCKS, opts) {
    opts = opts || {};
    if (!voxels.length) throw new Error('A construção está vazia.');
    const b = bounds(voxels);
    const sx = b.w, sy = b.h, sz = b.l;
    const total = sx * sy * sz;
    const grid = new Int32Array(total).fill(-1), oris = new Int32Array(total), extra = [], bents = [];
    for (const [x, y, z, idx, o, ex, be] of voxels) {
      const i = ((x - b.minX) * sy + (y - b.minY)) * sz + (z - b.minZ);
      grid[i] = idx; oris[i] = o == null ? -1 : o; if (ex) extra[i] = ex; if (be && be.bed) bents[i] = be.bed;
    }
    // dados de entidade que o jogo guarda fora do estado (cor da cama, comando, itens, texto da placa)
    const entData = function (ent) {
      const e = { id: { t: 'string', v: ent.id }, isMovable: { t: 'byte', v: 1 } };
      for (const k of Object.keys(ent)) if (k !== 'id') e[k] = typeof ent[k] === 'object' ? ent[k] : { t: 'byte', v: ent[k] }; // número: byte; {t, v}: o tipo dado
      return { t: 'compound', v: { block_entity_data: { t: 'compound', v: e } } };
    };
    const emptyName = opts.preserveTerrain === false ? 'minecraft:air' : 'minecraft:structure_void';
    const pal = []; const palIndex = {};
    function getPal(name, states, version) {
      const key = name + JSON.stringify(states);
      if (palIndex[key] === undefined) {
        palIndex[key] = pal.length;
        pal.push({ name: { t: 'string', v: name }, states: { t: 'compound', v: states }, version: { t: 'int', v: version || BEDROCK_BLOCK_VERSION } });
      }
      return palIndex[key];
    }
    const emptyIdx = getPal(emptyName, {});
    const layer0 = new Array(total), posData = {};
    for (let i = 0; i < total; i++) {
      const idx = grid[i];
      if (idx < 0) { layer0[i] = emptyIdx; continue; }
      const blk = BLOCKS[idx], ex = extra[i];
      // ex.bn/bs/bv: nome, estados e versão Bedrock calculados pelo editor (tabela Java -> Bedrock)
      if (ex) {
        layer0[i] = getPal('minecraft:' + ex.bn, ex.bs, ex.bv);
        if (ex.ent || bents[i]) posData[String(i)] = entData(ex.ent || bents[i]);
        continue;
      }
      layer0[i] = getPal('minecraft:' + blk.bedrock, bedrockStates(blk, oris[i] < 0 ? null : oris[i]), blk.bst && blk.bst[0]);
      if (bents[i]) posData[String(i)] = entData(bents[i]);
    }
    const layer1 = new Array(total).fill(-1);
    const root = {
      format_version: { t: 'int', v: 1 },
      size: { t: 'list', of: 'int', v: [sx, sy, sz] },
      structure_world_origin: { t: 'list', of: 'int', v: [0, 0, 0] },
      structure: {
        t: 'compound',
        v: {
          block_indices: { t: 'list', of: 'list', v: [] },
          entities: { t: 'list', of: 'compound', v: [] },
          palette: {
            t: 'compound',
            v: {
              default: {
                t: 'compound',
                v: {
                  block_palette: { t: 'list', of: 'compound', v: pal.map(p => p) },
                  block_position_data: { t: 'compound', v: posData }
                }
              }
            }
          }
        }
      }
    };
    // block_indices é lista de listas de int: payload manual
    const w = new NbtWriter(true);
    w.u8(10); w.str('');
    // compound raiz escrito à mão para a lista aninhada
    function writeCompound(obj) {
      for (const k of Object.keys(obj)) {
        const c = obj[k];
        if (k === 'block_indices') {
          w.u8(9); w.str(k);
          w.u8(9); w.i32(2);
          for (const layer of [layer0, layer1]) {
            w.u8(3); w.i32(layer.length);
            for (let i = 0; i < layer.length; i++) w.i32(layer[i]);
          }
          continue;
        }
        w.u8(TAGID[c.t]); w.str(k);
        if (c.t === 'compound') { writeCompound(c.v); w.u8(0); }
        else w.payload(c);
      }
    }
    writeCompound(root);
    w.u8(0);
    return w.finish(); // .mcstructure não é comprimido
  }

  // ---------- ZIP mínimo (sem compressão) ----------
  const CRC_T = (function () {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(u8) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < u8.length; i++) c = CRC_T[(c ^ u8[i]) & 255] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function makeZip(files) {
    const enc = new TextEncoder();
    const parts = [], central = [];
    let offset = 0;
    const d = new Date();
    const dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    for (const f of files) {
      const name = enc.encode(f.name);
      const crc = crc32(f.data);
      const size = f.data.length;
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true);
      lh.setUint16(8, 0, true); lh.setUint16(10, dosTime, true); lh.setUint16(12, dosDate, true);
      lh.setUint32(14, crc, true); lh.setUint32(18, size, true); lh.setUint32(22, size, true);
      lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
      parts.push(new Uint8Array(lh.buffer), name, f.data);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true);
      ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true); ch.setUint16(12, dosTime, true);
      ch.setUint16(14, dosDate, true); ch.setUint32(16, crc, true); ch.setUint32(20, size, true);
      ch.setUint32(24, size, true); ch.setUint16(28, name.length, true); ch.setUint32(42, offset, true);
      central.push(new Uint8Array(ch.buffer), name);
      offset += 30 + name.length + size;
    }
    let csize = 0;
    for (const c of central) csize += c.length;
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
    end.setUint32(12, csize, true); end.setUint32(16, offset, true);
    const all = parts.concat(central, [new Uint8Array(end.buffer)]);
    let total = 0;
    for (const p of all) total += p.length;
    const out = new Uint8Array(total);
    let o = 0;
    for (const p of all) { out.set(p, o); o += p.length; }
    return out;
  }

  // Nome, estados e versão Bedrock de um bloco que não é forma (usado ao gravar num mundo do jogo)
  function bedrockEntry(blk, ori) { return { name: blk.bedrock, states: bedrockStates(blk, ori == null ? null : ori), version: blk.bst && blk.bst[0] }; }
  const api = { exportSchem, exportMcstructure, bounds, NbtWriter, makeZip, bedrockEntry, crc32, gzip };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MCExport = api;
})(typeof window !== 'undefined' ? window : globalThis);
