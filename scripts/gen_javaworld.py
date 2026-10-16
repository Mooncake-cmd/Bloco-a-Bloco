# Gera o mundo de teste do Java (tests/fixtures/mundo-java.zip), no formato Anvil da 1.21:
#   python3 scripts/gen_javaworld.py tests/fixtures/mundo-java.zip tests/fixtures/casa.litematic   (precisa de: pip install nbtlib)
# Mundo normal: chunks 0..3 x 0..3 (r.0.0.mca) e -1,-1 (r.-1.-1.mca): rocha-mãe, pedra, terra e grama até y 63; no chunk
# 1,1 uma casa de tábuas com escada, baú com itens, tronco deitado e um bloco que o editor não conhece; um lago no 2,2;
# biomas: planície, deserto no 2,0 e meio a meio (planície/floresta) no 0,2. Compressão gzip no 0,0, nenhuma no 3,3 e
# zlib no resto; o chunk 5,0 está incompleto (Status features). Nether e End com um chunk cada. entities/ só com cabeçalho.
import sys, io, gzip, zlib, struct, zipfile, time
import nbtlib
from nbtlib import Compound, List, String, Int, Byte, Long, LongArray, Double, IntArray

DV = 3955  # Java 1.21.1


def pack(idx, bits):
    per = 64 // bits
    out = []
    for i in range(0, len(idx), per):
        v = 0
        for j, x in enumerate(idx[i:i + per]):
            v |= x << (j * bits)
        out.append(v - (1 << 64) if v >= 1 << 63 else v)
    return LongArray(out)


def bits_for(n, mn):
    b = mn
    while (1 << b) < n:
        b += 1
    return b


def entry(name, props=None):
    c = Compound({'Name': String('minecraft:' + name)})
    if props:
        c['Properties'] = Compound({k: String(v) for k, v in props.items()})
    return c


def section(y, get, biome):
    """get(x, y, z) -> (nome, props) ou None (ar); biome = nome ou função (bx, by, bz) -> nome"""
    pal, keys, idx = [], {}, []
    for ly in range(16):
        for z in range(16):
            for x in range(16):
                b = get(x, y * 16 + ly, z) or ('air', None)
                k = b[0] + str(sorted((b[1] or {}).items()))
                if k not in keys:
                    keys[k] = len(pal)
                    pal.append(entry(*b))
                idx.append(keys[k])
    bs = Compound({'palette': List[Compound](pal)})
    if len(pal) > 1:
        bs['data'] = pack(idx, bits_for(len(pal), 4))
    bpal, bkeys, bidx = [], {}, []
    for by in range(4):
        for bz in range(4):
            for bx in range(4):
                n = 'minecraft:' + (biome(bx, by, bz) if callable(biome) else biome)
                if n not in bkeys:
                    bkeys[n] = len(bpal)
                    bpal.append(String(n))
                bidx.append(bkeys[n])
    bio = Compound({'palette': List[String](bpal)})
    if len(bpal) > 1:
        bio['data'] = pack(bidx, bits_for(len(bpal), 1))
    return Compound({'Y': Byte(y), 'block_states': bs, 'biomes': bio})


def chunk(cx, cz, ys, get, biome, status='minecraft:full', bes=()):
    return Compound({
        'DataVersion': Int(DV), 'xPos': Int(cx), 'zPos': Int(cz), 'yPos': Int(ys[0]), 'Status': String(status),
        'LastUpdate': Long(0), 'InhabitedTime': Long(0), 'isLightOn': Byte(1),
        'sections': List[Compound]([section(y, get, biome) for y in ys]),
        'block_entities': List[Compound](list(bes)),
        'Heightmaps': Compound({}), 'structures': Compound({'References': Compound({}), 'starts': Compound({})}),
    })


def nbt_bytes(c):
    buf = io.BytesIO()
    nbtlib.File(c).write(buf, byteorder='big')
    return buf.getvalue()


def region(chunks):
    """chunks: {(lx, lz): (Compound, compressão)} -> bytes do .mca"""
    hdr, body, sec = bytearray(8192), bytearray(), 2
    for (lx, lz), (c, kind) in chunks.items():
        raw = nbt_bytes(c)
        data = gzip.compress(raw) if kind == 1 else zlib.compress(raw) if kind == 2 else raw
        blob = struct.pack('>IB', len(data) + 1, kind) + data
        n = (len(blob) + 4095) // 4096
        blob += b'\0' * (n * 4096 - len(blob))
        s = lz * 32 + lx
        hdr[s * 4:s * 4 + 4] = bytes([sec >> 16 & 255, sec >> 8 & 255, sec & 255, n])
        hdr[4096 + s * 4:4096 + s * 4 + 4] = struct.pack('>I', 1700000000)
        body += blob
        sec += n
    return bytes(hdr) + bytes(body)


def ground(x, y, z):
    if y == -64: return ('bedrock', None)
    if y < 60: return ('stone', None)
    if y < 63: return ('dirt', None)
    if y == 63: return ('grass_block', {'snowy': 'false'})
    return None


def house(x, y, z):
    g = ground(x, y, z)
    if 2 <= x <= 9 and 2 <= z <= 9:
        if y == 64: return ('oak_planks', None)
        if 65 <= y <= 67 and (x in (2, 9) or z in (2, 9)):
            if y == 66 and x == 2 and z == 5: return ('glass', None)
            return ('oak_planks', None)
        if y == 68: return ('oak_planks', None)
        if (x, y, z) == (4, 65, 4): return ('chest', {'facing': 'north', 'type': 'single', 'waterlogged': 'false'})
        if (x, y, z) == (6, 65, 4): return ('oak_stairs', {'facing': 'east', 'half': 'bottom', 'shape': 'straight', 'waterlogged': 'false'})
        if (x, y, z) == (5, 65, 7): return ('oak_log', {'axis': 'x'})
        if (x, y, z) == (7, 65, 7): return ('bloco_futuro', {'cor': 'azul'})
    return g


def pond(x, y, z):
    if (x - 8) ** 2 + (z - 8) ** 2 < 20 and 61 <= y <= 63: return ('water', {'level': '0'})
    return ground(x, y, z)


def nether(x, y, z):
    if y == 0 or y == 127: return ('bedrock', None)
    if y < 40: return ('netherrack', None)
    if y > 120: return ('netherrack', None)
    return None


def end(x, y, z):
    if 50 <= y <= 60 and (x - 8) ** 2 + (z - 8) ** 2 < 40: return ('end_stone', None)
    return None


OW = list(range(-4, 20))
chest = Compound({'id': String('minecraft:chest'), 'x': Int(16 + 4), 'y': Int(65), 'z': Int(16 + 4), 'keepPacked': Byte(0),
                  'Items': List[Compound]([Compound({'Slot': Byte(0), 'id': String('minecraft:diamond'), 'count': Int(3)})])})
r00 = {}
for cx in range(4):
    for cz in range(4):
        get = house if (cx, cz) == (1, 1) else pond if (cx, cz) == (2, 2) else ground
        bio = 'desert' if (cx, cz) == (2, 0) else (lambda bx, by, bz: 'plains' if bx < 2 else 'forest') if (cx, cz) == (0, 2) else 'plains'
        kind = 1 if (cx, cz) == (0, 0) else 3 if (cx, cz) == (3, 3) else 2
        r00[(cx, cz)] = (chunk(cx, cz, OW, get, bio, bes=[chest] if (cx, cz) == (1, 1) else []), kind)
r00[(5, 0)] = (chunk(5, 0, OW, ground, 'plains', status='minecraft:features'), 2)
rm1 = {(31, 31): (chunk(-1, -1, OW, ground, 'plains'), 2)}
nth = {(0, 0): (chunk(0, 0, list(range(0, 16)), nether, 'nether_wastes'), 2)}
ed = {(0, 0): (chunk(0, 0, list(range(0, 16)), end, 'the_end'), 2)}

lvl = Compound({'Data': Compound({
    'LevelName': String('Mundo Java de teste'), 'DataVersion': Int(DV), 'version': Int(19133),
    'Version': Compound({'Id': Int(DV), 'Name': String('1.21.1'), 'Series': String('main'), 'Snapshot': Byte(0)}),
    'SpawnX': Int(8), 'SpawnY': Int(64), 'SpawnZ': Int(8), 'GameType': Int(1), 'LastPlayed': Long(int(time.time() * 1000)),
    'Player': Compound({'Pos': List[Double]([Double(24.5), Double(66.0), Double(24.5)]), 'Dimension': String('minecraft:overworld')}),
})})
lvbuf = io.BytesIO()
nbtlib.File(lvl).write(lvbuf, byteorder='big')

out = sys.argv[1]
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    P = 'Mundo Java de teste/'
    z.writestr(P + 'level.dat', gzip.compress(lvbuf.getvalue()))
    z.writestr(P + 'region/r.0.0.mca', region(r00))
    z.writestr(P + 'region/r.-1.-1.mca', region(rm1))
    z.writestr(P + 'DIM-1/region/r.0.0.mca', region(nth))
    z.writestr(P + 'DIM1/region/r.0.0.mca', region(ed))
    z.writestr(P + 'entities/r.0.0.mca', bytes(8192))
print('ok', out)

# .litematic de teste (tests/fixtures/casa.litematic): a casa do chunk 1,1 com o chão, numa região de tamanho negativo
# (como o Litematica grava quando o segundo canto é o menor), índices empacotados atravessando os longs
if len(sys.argv) > 2:
    pal, keys, idx = [], {}, []
    SX, SY, SZ = 12, 7, 12
    for y in range(SY):
        for z in range(SZ):
            for x in range(SX):
                b = house(x + 0, y + 62, z + 0) or ('air', None)
                k = b[0] + str(sorted((b[1] or {}).items()))
                if k not in keys:
                    keys[k] = len(pal); pal.append(entry(*b))
                idx.append(keys[k])
    bits = bits_for(len(pal), 2)
    total = 0
    for i, v in enumerate(idx):
        total |= v << (i * bits)
    nl = (len(idx) * bits + 63) // 64
    longs = [(total >> (64 * i)) & ((1 << 64) - 1) for i in range(nl)]
    longs = [v - (1 << 64) if v >= 1 << 63 else v for v in longs]
    lit = Compound({'Version': Int(7), 'SubVersion': Int(1), 'MinecraftDataVersion': Int(DV),
        'Metadata': Compound({'Name': String('Casa de teste'), 'Author': String('Bloco a Bloco'), 'RegionCount': Int(1),
            'EnclosingSize': Compound({'x': Int(SX), 'y': Int(SY), 'z': Int(SZ)}), 'TotalBlocks': Int(sum(1 for v in idx if str(pal[v]['Name']) != 'minecraft:air'))}),
        'Regions': Compound({'casa': Compound({
            'Position': Compound({'x': Int(SX - 1), 'y': Int(0), 'z': Int(SZ - 1)}), 'Size': Compound({'x': Int(-SX), 'y': Int(SY), 'z': Int(-SZ)}),
            'BlockStatePalette': List[Compound](pal), 'BlockStates': LongArray(longs),
            'TileEntities': List[Compound]([]), 'Entities': List[Compound]([]), 'PendingBlockTicks': List[Compound]([]), 'PendingFluidTicks': List[Compound]([])})})})
    buf = io.BytesIO(); nbtlib.File(lit).write(buf, byteorder='big')
    open(sys.argv[2], 'wb').write(gzip.compress(buf.getvalue()))
    print('ok', sys.argv[2])
