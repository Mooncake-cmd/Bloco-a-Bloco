# Compara a região dos testes entre dois mundos (pastas db ou .mcworld): nome e estados de cada bloco
import sys, os, struct, zipfile, shutil, tempfile, json
sys.path.insert(0, sys.argv[1])
import leveldb
from nbtle import subchunk
def opendb(p):
    t = tempfile.mkdtemp()
    if p.endswith('.mcworld'): zipfile.ZipFile(p).extractall(t); return leveldb.LevelDB(os.path.join(t, 'db'))
    shutil.copytree(p, t + '/db'); return leveldb.LevelDB(t + '/db')
cache = {}
def blk(db, tag, x, y, z):
    k = struct.pack('<ii', x >> 4, z >> 4) + bytes([0x2f]) + struct.pack('b', y >> 4)
    ck = (tag, k)
    if ck not in cache:
        try: v = db.get(k)
        except KeyError: v = None
        cache[ck] = subchunk(v) if v else None
    sc = cache[ck]
    if not sc: return ('air', {})
    ver, yy, layers, end = sc
    idx, pal = layers[0]; e = pal[idx[((x & 15) << 8) | ((z & 15) << 4) | (y & 15)]]
    return (e['name'].replace('minecraft:', ''), {k: (v if not isinstance(v, bytes) else v) for k, v in e.get('states', {}).items()})
A, B = opendb(sys.argv[2]), opendb(sys.argv[3]); la, lb = sys.argv[4], sys.argv[5]
diff = 0; same = 0
for x in range(0, 48):
    for z in range(2, 44):
        for y in range(99, 104):
            a, b = blk(A, 'a', x, y, z), blk(B, 'b', x, y, z)
            if a == b: same += 1 if a[0] != 'air' else 0; continue
            diff += 1
            ks = set(a[1]) | set(b[1]); dd = {k: (a[1].get(k), b[1].get(k)) for k in ks if a[1].get(k) != b[1].get(k)}
            print('%3d %3d %3d  %s: %-22s %s: %-22s %s' % (x, y, z, la, a[0], lb, b[0], dd if a[0] == b[0] else (a[1], b[1])))
print('iguais (sem ar):', same, '| diferentes:', diff)
