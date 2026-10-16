/* ---------- Camada fantasma (papel vegetal) ---------- */
/* Com a Camada ligada, o aviso "Fantasma" liga uma cópia translúcida dos blocos de uma camada de baixo, desenhada na
   altura da camada atual, só onde ela ainda está vazia. Serve para alinhar as paredes do andar de cima com as do de
   baixo mesmo com o piso no meio. A referência começa 1 camada abaixo e muda com − e + (até 64 abaixo). */
var ghost = { on: false, off: 1 }, ghostInst = null, ghostKey = '';
try { var gh0 = JSON.parse(localStorage.getItem('bloco-a-bloco-ghost') || 'null'); if (gh0) ghost = Object.assign(ghost, gh0); } catch (e) {}
var GHOST_MAX = 200000;
function ghostSave() { try { localStorage.setItem('bloco-a-bloco-ghost', JSON.stringify(ghost)); } catch (e) {} }
function updateGhostChip() {
  var c = $('ghostChip'); if (!c) return;
  c.hidden = !layerOn; if (c.hidden) return;
  $('ghostOn').setAttribute('aria-pressed', String(ghost.on)); $('ghostOn').textContent = ghost.on ? 'Ligado' : 'Desligado';
  var ry = layerY - ghost.off;
  $('ghostRef').textContent = ry >= 0 ? 'camada Y ' + (wio && wio.area ? ry + wioDim(wio.area.dim).min : ry) + ' (' + ghost.off + ' abaixo)' : 'abaixo do chão';
  $('ghostMinus').disabled = ghost.off <= 1; $('ghostPlus').disabled = ghost.off >= Math.min(64, layerY);
}
/* Chamado a cada quadro: refaz o fantasma quando a camada, a referência ou os blocos mudam */
function updateGhost() {
  if (!scene) return;
  var y = layerY, ry = y - ghost.off, key = layerOn && ghost.on && ry >= 0 ? [y, ry, verCounter].join('|') : '';
  if (key === ghostKey) return;
  ghostKey = key;
  if (!ghostInst) {
    ghostInst = new THREE.InstancedMesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false }), GHOST_MAX);
    ghostInst.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(GHOST_MAX * 3), 3);
    ghostInst.count = 0; ghostInst.frustumCulled = false; ghostInst.renderOrder = 5; scene.add(ghostInst);
  }
  var n = 0;
  if (key) {
    var m = new THREE.Matrix4(), col = new THREE.Color(), cy = ry >> 4, ly = ry & 15;
    W.forEach(function (ch) {
      if (ch.cy !== cy || n >= GHOST_MAX) return;
      var x0 = ch.cx << 4, z0 = ch.cz << 4;
      for (var o = ly << 8, e = o + 256; o < e && n < GHOST_MAX; o++) {
        var v = ch.d ? ch.pal[ch.d[o]] : ch.u; if (!v) continue;
        var x = x0 + (o & 15), z = z0 + ((o >> 4) & 15);
        if (gget(x, y, z)) continue; // já construído na camada atual: o fantasma some ali
        var b = BLOCKS[cellBlock(v)], c = b.top || [150, 150, 150];
        m.setPosition(x + 0.5, y + 0.5, z + 0.5); ghostInst.setMatrixAt(n, m);
        // a cor do bloco puxada para o azul: fica claro que é fantasma, sobre qualquer piso
        col.setRGB((c[0] * 0.45 + 70 * 0.55) / 255, (c[1] * 0.45 + 150 * 0.55) / 255, (c[2] * 0.45 + 255 * 0.55) / 255); ghostInst.setColorAt(n, col); n++;
      }
    });
  }
  ghostInst.count = n; ghostInst.instanceMatrix.needsUpdate = true; if (ghostInst.instanceColor) ghostInst.instanceColor.needsUpdate = true;
  requestRender();
}
$('ghostChip').addEventListener('click', function (e) {
  var b = e.target.closest('button'); if (!b) return;
  if (b.id === 'ghostOn') ghost.on = !ghost.on;
  else if (b.id === 'ghostMinus') ghost.off = Math.max(1, ghost.off - 1);
  else if (b.id === 'ghostPlus') ghost.off = Math.min(64, ghost.off + 1);
  ghostSave(); updateGhostChip(); requestRender();
});
