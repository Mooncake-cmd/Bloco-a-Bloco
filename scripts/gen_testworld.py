# Gera um mundo pequeno do Bedrock para os testes e para as capturas do guia (sem usar mundos de ninguém).
# Usa o LevelDB da Mojang (pacote amulet-leveldb), o mesmo formato que o jogo grava:
#   python3 -m venv /tmp/venv && /tmp/venv/bin/pip install amulet-leveldb
#   /tmp/venv/bin/python scripts/gen_testworld.py tests/fixtures/mundo-teste.mcworld
# Conteúdo: 8 x 8 chunks de terreno com morros, um lago com algas (água na segunda camada), árvores, uma casa
# com baú (com itens) e cama azul, um gerador de monstros (bloco que o editor não conhece) e um pedaço de Nether.
import sys, os, struct, math, shutil, tempfile, zipfile
import leveldb

VERSION = 18163713  # 1.21.40

# ---------- NBT little-endian ----------
def s(x): b = x.encode(); return struct.pack('<H', len(b)) + b
def tag(t, name, payload): return bytes([t]) + s(name) + payload
def comp(d):
    out = b''
    for k, (t, v) in d.items(): out += tag(t, k, pay(t, v))
    return out + b'\x00'
def pay(t, v):
    if t == 1: return struct.pack('<b', v)
    if t == 2: return struct.pack('<h', v)
    if t == 3: return struct.pack('<i', v)
    if t == 4: return struct.pack('<q', v)
    if t == 5: return struct.pack('<f', v)
    if t == 8: return s(v)
    if t == 9:
        et, items = v
        return bytes([et]) + struct.pack('<i', len(items)) + b''.join(pay(et, i) for i in items)
    if t == 10: return comp(v)
    raise Exception(t)
def root(d): return tag(10, '', comp(d))

def block(name, **st):
    states = {}
    for k, v in st.items():
        if isinstance(v, str): states[k] = (8, v)
        elif isinstance(v, bool): states[k] = (1, int(v))
        else: states[k] = (3, v)
    return root({'name': (8, 'minecraft:' + name), 'states': (10, states), 'version': (3, VERSION)})

AIR = block('air')

# ---------- sub-chunk (versão 9) ----------
def encode_layer(cells):
    pal = []; idx = {}
    ids = []
    for c in cells:
        if c not in idx: idx[c] = len(pal); pal.append(c)
        ids.append(idx[c])
    need = max(1, (len(pal) - 1).bit_length())
    bits = next(b for b in (1, 2, 3, 4, 5, 6, 8, 16) if b >= need)
    bpw = 32 // bits; words = -(-4096 // bpw); W = [0] * words
    for i, v in enumerate(ids): W[i // bpw] |= v << ((i % bpw) * bits)
    return bytes([bits << 1]) + struct.pack('<%dI' % words, *W) + struct.pack('<i', len(pal)) + b''.join(pal)
def encode_sub(y, layers): return bytes([9, len(layers), y & 255]) + b''.join(encode_layer(l) for l in layers)

def ck(x, z, dim, t, y=None):
    k = struct.pack('<ii', x, z) + (struct.pack('<i', dim) if dim else b'') + bytes([t])
    return k + (struct.pack('b', y) if y is not None else b'')

def main(out):
    tmp = tempfile.mkdtemp(); wd = os.path.join(tmp, 'world'); os.makedirs(os.path.join(wd, 'db'))
    db = leveldb.LevelDB(os.path.join(wd, 'db'), create_if_missing=True)
    B = {n: block(n) for n in ['stone', 'dirt', 'grass_block', 'bedrock', 'sand', 'oak_planks', 'glass', 'cobblestone', 'gravel', 'netherrack', 'glowstone', 'mob_spawner']}
    B['log'] = block('oak_log', pillar_axis='y'); B['leaves'] = block('oak_leaves', persistent_bit=False, update_bit=False)
    B['water'] = block('water', liquid_depth=0); B['seagrass'] = block('seagrass', sea_grass_type='default')
    B['chest'] = block('chest', **{'minecraft:cardinal_direction': 'south'})
    B['bed_foot'] = block('bed', direction=0, head_piece_bit=False, occupied_bit=False)
    B['bed_head'] = block('bed', direction=0, head_piece_bit=True, occupied_bit=False)
    B['door_lo'] = block('wooden_door', **{'minecraft:cardinal_direction': 'south', 'door_hinge_bit': False, 'open_bit': False, 'upper_block_bit': False})
    B['door_hi'] = block('wooden_door', **{'minecraft:cardinal_direction': 'south', 'door_hinge_bit': False, 'open_bit': False, 'upper_block_bit': True})
    world = {}  # (x, y, z) -> (camada 0, camada 1)
    def put(x, y, z, b, b2=None): world[(x, y, z)] = (b, b2)
    H = {}
    for x in range(-64, 64):
        for z in range(-64, 64):
            h = int(66 + 5 * math.sin(x / 11.0) + 4 * math.cos(z / 9.0) + 3 * math.sin((x + z) / 17.0))
            if (x - 20) ** 2 + (z + 18) ** 2 < 150: h = min(h, 58)  # lago
            H[(x, z)] = h
            put(x, -64, z, B['bedrock'])
            for y in range(-63, h - 3): put(x, y, z, B['stone'])
            for y in range(max(-63, h - 3), h): put(x, y, z, B['dirt'])
            if h < 62:
                put(x, h, z, B['sand'])
                for y in range(h + 1, 63): put(x, y, z, B['water'])
                if (x * 7 + z * 3) % 5 == 0: put(x, h + 1, z, B['seagrass'], B['water'])  # alga com água na 2ª camada
            else:
                put(x, h, z, B['grass_block'])
    def tree(x, z):
        h = H[(x, z)]
        for dy in range(1, 6): put(x, h + dy, z, B['log'])
        for dx in range(-2, 3):
            for dz in range(-2, 3):
                for dy in (4, 5, 6):
                    if (dx or dz or dy == 6) and abs(dx) + abs(dz) < 4 and (x + dx, h + dy, z + dz) not in world: put(x + dx, h + dy, z + dz, B['leaves'])
    for t in [(-30, -30), (-40, 10), (35, 30), (10, 40), (-15, 35), (40, -40)]: tree(*t)
    # casa: piso de pedregulho, paredes de tábuas, janelas, porta ao sul, baú e cama dentro
    hx, hz, hy = 0, 0, H[(0, 0)] + 1
    for x in range(hx - 4, hx + 5):
        for z in range(hz - 3, hz + 4):
            put(x, hy - 1, z, B['cobblestone'])
            for y in range(hy, hy + 8): world.pop((x, y, z), None)
            edge = x in (hx - 4, hx + 4) or z in (hz - 3, hz + 3)
            if edge:
                for y in range(hy, hy + 4): put(x, y, z, B['glass'] if y == hy + 1 and (x in (hx - 2, hx + 2) or z == hz) else B['oak_planks'])
            put(x, hy + 4, z, B['oak_planks'])
    put(hx, hy, hz + 3, B['door_lo']); put(hx, hy + 1, hz + 3, B['door_hi'])
    put(hx - 3, hy, hz - 2, B['chest'])
    put(hx + 2, hy, hz - 1, B['bed_foot']); put(hx + 2, hy, hz - 2, B['bed_head'])
    put(hx + 3, hy, hz + 2, B['mob_spawner'])
    bes = {}
    def be(x, y, z, d):
        d = dict(d); d['x'] = (3, x); d['y'] = (3, y); d['z'] = (3, z); d['isMovable'] = (1, 1)
        bes.setdefault((x >> 4, z >> 4), []).append(root(d))
    item = lambda n, c: {'Name': (8, 'minecraft:' + n), 'Count': (1, c), 'Damage': (2, 0), 'Slot': (1, 0), 'WasPickedUp': (1, 0)}
    be(hx - 3, hy, hz - 2, {'id': (8, 'Chest'), 'Items': (9, (10, [dict(item('diamond', 5)), dict(item('bread', 12), Slot=(1, 1))]))})
    be(hx + 2, hy, hz - 1, {'id': (8, 'Bed'), 'color': (1, 11)})
    be(hx + 2, hy, hz - 2, {'id': (8, 'Bed'), 'color': (1, 11)})
    be(hx + 3, hy, hz + 2, {'id': (8, 'MobSpawner'), 'EntityIdentifier': (8, 'minecraft:zombie')})
    # chunks do mundo normal
    for cx in range(-4, 4):
        for cz in range(-4, 4):
            db.put(ck(cx, cz, 0, 0x2c), bytes([42]))
            db.put(ck(cx, cz, 0, 0x36), struct.pack('<i', 2))
            hm = []
            for z in range(16):
                for x in range(16):
                    top = -999
                    for y in range(319, -65, -1):
                        if (cx * 16 + x, y, cz * 16 + z) in world: top = y; break
                    hm.append(top + 64 + 1)
            db.put(ck(cx, cz, 0, 0x2b), struct.pack('<256h', *hm) + bytes([0x03]) + b'\x00' * 24)  # mapa de alturas + bioma simplificado
            for sy in range(-4, 20):
                l0 = []; l1 = []; anyb = False; two = False
                for x in range(16):
                    for z in range(16):
                        for y in range(16):
                            c = world.get((cx * 16 + x, sy * 16 + y, cz * 16 + z))
                            l0.append(c[0] if c else AIR); l1.append(c[1] if c and c[1] else AIR)
                            anyb = anyb or bool(c); two = two or bool(c and c[1])
                if anyb: db.put(ck(cx, cz, 0, 0x2f, sy), encode_sub(sy, [l0, l1] if two else [l0]))
            if (cx, cz) in bes: db.put(ck(cx, cz, 0, 0x31), b''.join(bes[(cx, cz)]))
    # Nether: netherrack com cavernas, teto de bedrock e pedra luminosa
    for cx in range(-2, 2):
        for cz in range(-2, 2):
            db.put(ck(cx, cz, 1, 0x2c), bytes([42]))
            for sy in range(0, 8):
                l0 = []
                for x in range(16):
                    for z in range(16):
                        for y in range(16):
                            wx, wy, wz = cx * 16 + x, sy * 16 + y, cz * 16 + z
                            if wy == 0 or wy == 127: b = B['bedrock']
                            elif 30 < wy < 90 + int(8 * math.sin(wx / 7.0) * math.cos(wz / 9.0)): b = AIR if wy > 40 else B['netherrack']
                            else: b = B['netherrack']
                            if wy == 41 and (wx * 3 + wz) % 23 == 0: b = B['glowstone']
                            l0.append(b)
                db.put(ck(cx, cz, 1, 0x2f, sy), encode_sub(sy, [l0]))
    # Fim: ilha principal e uma ilha pequena, com chunks gerados só de vazio em volta e uma faixa nunca gerada entre
    # elas (para o destaque de chunks não gerados no mapa da área)
    B['end_stone'] = block('end_stone'); B['obsidian'] = block('obsidian')
    def isle(wx, wy, wz):
        r1 = (wx * wx + wz * wz) ** 0.5
        if r1 < 22 and 48 - (22 - r1) * 0.8 < wy <= 52 + int(2 * math.sin(wx / 5.0)): return B['end_stone']
        if wx in (6, 7) and wz in (6, 7) and 52 < wy <= 70 and r1 < 22: return B['obsidian']
        r2 = ((wx - 104) ** 2 + (wz - 24) ** 2) ** 0.5
        if r2 < 9 and 56 - (9 - r2) * 0.7 < wy <= 58: return B['end_stone']
        return None
    gen_end = [(cx, cz) for cx in range(-4, 3) for cz in range(-4, 3)] + [(cx, cz) for cx in range(5, 8) for cz in range(0, 3)]
    for cx, cz in gen_end:
        db.put(ck(cx, cz, 2, 0x2c), bytes([42]))
        for sy in range(2, 5):
            l0 = []; anyb = False
            for x in range(16):
                for z in range(16):
                    for y in range(16):
                        b = isle(cx * 16 + x, sy * 16 + y, cz * 16 + z); l0.append(b or AIR); anyb = anyb or bool(b)
            if anyb: db.put(ck(cx, cz, 2, 0x2f, sy), encode_sub(sy, [l0]))
    player = root({'Pos': (9, (5, [0.5, float(H[(4, 8)] + 1.62), 8.5])), 'DimensionId': (3, 0)})
    db.put(b'~local_player', player)
    db.compact(); db.close()
    lvl = root({'LevelName': (8, 'Mundo de teste'), 'StorageVersion': (3, 10), 'SpawnX': (3, 0), 'SpawnY': (3, 70), 'SpawnZ': (3, 0)})
    open(os.path.join(wd, 'level.dat'), 'wb').write(struct.pack('<ii', 10, len(lvl)) + lvl)
    open(os.path.join(wd, 'levelname.txt'), 'w').write('Mundo de teste')
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
        for dp, _, fs in os.walk(wd):
            for f in sorted(fs):
                p = os.path.join(dp, f)
                if f == 'LOCK': continue
                z.write(p, os.path.relpath(p, wd))
    shutil.rmtree(tmp)
    print('ok', out, os.path.getsize(out), 'bytes')

main(sys.argv[1])
