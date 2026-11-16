import * as THREE from 'three';
import { TAU, clamp, rnd, Builder, radialSprite, stoneTexture } from './core.js';

/* ================================================================ the Undercroft
   A crypt the old wardens cut beneath the colossi: an antechamber, a pillared hall that
   a seal closes off, and the throne of the Stone Warden. It lies far below the valley
   (FLOOR_Y), reached by a door in the hillside. While you are in it the game answers every
   terrain question from this floor (core.setUnderground) and every collision from these
   walls (world.enterUnderground), so everything else works unchanged.

   It is lit without lights: each vertex is brightened by its distance to the braziers when
   the vault is built. A real light per brazier would also tax every shader in the valley. */

export const FLOOR_Y = -500;

// rooms and corridors as rectangles: [x0, x1, z0, z1, ceiling height]
const RECTS = {
  A: [-12, 12, 18, 40, 8],
  AB: [-3, 3, 5, 18, 6],
  B: [-18, 18, -26, 5, 11],
  BC: [-3, 3, -44, -26, 6],
  C: [-16, 16, -82, -44, 13],
};
const SEAL_Z = -30;
export const VAULT_SPAWN = { x: 0, z: 36, yaw: Math.PI };       // facing -z, down the vault

const BRAZIERS = [[-9, 37], [9, 37], [-15, 1], [15, 1], [-15, -22], [15, -22], [-2.4, -34], [-13, -48], [13, -48], [-13, -78], [13, -78], [8, -62]];
const PILLARS = [[-9, -4], [9, -4], [-9, -13], [9, -13], [-9, -22], [9, -22], [-10, -56], [10, -56], [-10, -70], [10, -70], [-6, 26], [6, 26]];

/** keep a circle of radius r inside the union of the rooms */
function clampToRooms(x, z, r, sealOpen) {
  let best = null, bd = Infinity;
  for (const k in RECTS) {
    // every room counts, sealed or not: the seal itself is a wall of obstacles in the corridor, and the throne's guard must be able to stand in the throne
    const [x0, x1, z0, z1] = RECTS[k];
    const cx = clamp(x, x0 + r, x1 - r), cz = clamp(z, z0 + r, z1 - r);
    const d = (cx - x) * (cx - x) + (cz - z) * (cz - z);
    if (d < bd) { bd = d; best = [cx, cz]; }
    if (d === 0) return [x, z];
  }
  return best || [x, z];
}

export function buildVault(scene) {
  const V = {
    floorY: FLOOR_Y, obstacles: [], sealOpen: false, flames: [], group: new THREE.Group(),
    spawn: { x: VAULT_SPAWN.x, y: FLOOR_Y, z: VAULT_SPAWN.z, yaw: VAULT_SPAWN.yaw },
    height: () => FLOOR_Y,
    clamp: (x, z, r) => clampToRooms(x, z, r, V.sealOpen),
    rooms: RECTS,
  };
  const tex = stoneTexture();
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, map: tex, fog: true });
  const b = new Builder();
  const STONE = [0x6f7478, 0x5c6266, 0x7a7f82];
  const fy = FLOOR_Y;

  const box = (x0, x1, y0, y1, z0, z1, col, jit = 0.05) =>
    b.add(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), col, { pos: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], jitter: jit });

  // floors, ceilings and walls: each room is a hollow box, openings left where corridors join
  const room = (key, openZ = []) => {
    const [x0, x1, z0, z1, h] = RECTS[key], t = 1.2;
    box(x0 - t, x1 + t, fy - t, fy, z0 - t, z1 + t, 0x4e5458);                   // floor slab (top face at floor level)
    box(x0 - t, x1 + t, fy + h, fy + h + t, z0 - t, z1 + t, 0x42484c);           // ceiling
    box(x0 - t, x0, fy, fy + h, z0 - t, z1 + t, STONE[0]);                        // west wall
    box(x1, x1 + t, fy, fy + h, z0 - t, z1 + t, STONE[1]);                        // east wall
    // north and south walls with doorways where a corridor attaches
    for (const [zEdge, side] of [[z0, -1], [z1, 1]]) {
      const open = openZ.includes(side);
      const zA = side < 0 ? zEdge - t : zEdge, zB = side < 0 ? zEdge : zEdge + t;
      if (!open) box(x0, x1, fy, fy + h, zA, zB, STONE[2]);
      else {
        box(x0, -3, fy, fy + h, zA, zB, STONE[2]); box(3, x1, fy, fy + h, zA, zB, STONE[2]);
        box(-3, 3, fy + 6, fy + h, zA, zB, STONE[0]);                              // lintel over the doorway
      }
    }
  };
  room('A', [-1]); room('B', [1, -1]); room('C', [1]);
  // corridors
  for (const key of ['AB', 'BC']) {
    const [x0, x1, z0, z1, h] = RECTS[key], t = 1.2;
    box(x0 - t, x1 + t, fy - t, fy, z0, z1, 0x4e5458); box(x0 - t, x1 + t, fy + h, fy + h + t, z0, z1, 0x42484c);
    box(x0 - t, x0, fy, fy + h, z0, z1, STONE[0]); box(x1, x1 + t, fy, fy + h, z0, z1, STONE[1]);
  }
  // pillars with capitals and plinths
  for (const [px, pz] of PILLARS) {
    const h = pz > -30 ? (pz > 5 ? 8 : 11) : 13;
    b.add(new THREE.CylinderGeometry(0.85, 0.95, h, 10), 0x8a9094, { pos: [px, fy + h / 2, pz], jitter: 0.05 });
    b.add(new THREE.BoxGeometry(2.1, 0.7, 2.1), 0x62686c, { pos: [px, fy + 0.35, pz] });
    b.add(new THREE.BoxGeometry(2.2, 0.8, 2.2), 0x62686c, { pos: [px, fy + h - 0.4, pz] });
    V.obstacles.push({ x: px, z: pz, r: 1.1, h });
  }
  // sarcophagi and fallen stone, for company
  for (const [sx, sz, ry] of [[-8, 22, 0], [8, 22, 0], [-12, -2, 0.2], [13, -9, -0.1], [-14, -16, 0.1], [0, -52, 0]]) {
    b.add(new THREE.BoxGeometry(2.4, 0.9, 1.1), 0x70767a, { pos: [sx, fy + 0.45, sz], rot: [0, ry, 0], jitter: 0.05 });
    b.add(new THREE.BoxGeometry(2.6, 0.3, 1.3), 0x80868a, { pos: [sx, fy + 1.05, sz], rot: [0, ry, 0], jitter: 0.05 });
    V.obstacles.push({ x: sx, z: sz, r: 1.5, h: 1.2 });
  }
  // the boss room: a stepped dais and a ring of runes
  b.add(new THREE.CylinderGeometry(8.5, 8.8, 0.14, 24), 0x5a6064, { pos: [0, fy + 0.07, -66], jitter: 0.04 });
  b.add(new THREE.CylinderGeometry(6.2, 6.4, 0.14, 24), 0x666c70, { pos: [0, fy + 0.21, -66], jitter: 0.04 });

  // brazier bowls
  for (const [bx, bz] of BRAZIERS) {
    b.add(new THREE.CylinderGeometry(0.28, 0.4, 1.0, 8), 0x3c4044, { pos: [bx, fy + 0.5, bz] });
    b.add(new THREE.CylinderGeometry(0.62, 0.34, 0.4, 10), 0x2c2f33, { pos: [bx, fy + 1.15, bz] });
    V.obstacles.push({ x: bx, z: bz, r: 0.5, h: 1.4 });
  }

  // wardens carved in stone, standing guard along the walls of the hall and the throne
  const statue = (sx, sz, ry) => {
    const R = (ry) => ({ rot: [0, ry, 0] });
    b.add(new THREE.BoxGeometry(2.0, 0.6, 2.0), 0x62686c, { pos: [sx, fy + 0.3, sz] });
    b.add(new THREE.CylinderGeometry(0.55, 0.95, 3.3, 10), 0x80868a, { pos: [sx, fy + 2.25, sz], jitter: 0.05 });          // robe
    b.add(new THREE.SphereGeometry(0.8, 10, 8), 0x8a9094, { pos: [sx, fy + 4.05, sz], scale: [1.1, 0.7, 0.8] });              // shoulders
    b.add(new THREE.SphereGeometry(0.46, 10, 8), 0x8d9296, { pos: [sx, fy + 4.7, sz] });                                      // head
    b.add(new THREE.SphereGeometry(0.58, 10, 8), 0x6a7074, { pos: [sx, fy + 4.78, sz - Math.sin(ry) * 0.05], scale: [1, 1.05, 1] });   // hood
    b.add(new THREE.BoxGeometry(0.16, 3.6, 0.5), 0x9aa0a4, { pos: [sx + Math.cos(ry) * 0.9, fy + 2.6, sz - Math.sin(ry) * 0.9], rot: [0, ry, 0.04] });  // the sword at its side
    V.obstacles.push({ x: sx, z: sz, r: 1.1, h: 5 });
  };
  for (const [sx, sz, ry] of [[-16.2, -8, Math.PI / 2], [16.2, -8, -Math.PI / 2], [-16.2, -18, Math.PI / 2], [16.2, -18, -Math.PI / 2],
    [-14.6, -58, Math.PI / 2], [14.6, -58, -Math.PI / 2], [-14.6, -70, Math.PI / 2], [14.6, -70, -Math.PI / 2]]) statue(sx, sz, ry);

  // rune light: bands along the walls and a path of marks down the middle that leads you on (the throne's stretch wakes with the seal)
  const pathA = new Builder(), pathC = new Builder(), bands = new Builder();
  for (const [key, h] of [['A', 8], ['B', 11], ['C', 13]]) {
    const [x0, x1, z0, z1] = RECTS[key];
    bands.add(new THREE.BoxGeometry(0.1, 0.16, z1 - z0 - 3), 0xffb060, { pos: [x0 + 0.06, fy + 2.7, (z0 + z1) / 2] });
    bands.add(new THREE.BoxGeometry(0.1, 0.16, z1 - z0 - 3), 0xffb060, { pos: [x1 - 0.06, fy + 2.7, (z0 + z1) / 2] });
    for (let z = z0 + 3; z < z1 - 2; z += 4.2) for (const sx of [x0 + 0.06, x1 - 0.06]) {
      bands.add(new THREE.BoxGeometry(0.08, 0.7, 0.32), 0xffb060, { pos: [sx, fy + 2.7, z], rot: [0, 0, 0] });
    }
  }
  for (let z = 36; z > -28; z -= 3.4) pathA.add(new THREE.BoxGeometry(0.55, 0.03, 1.9), 0xffb060, { pos: [0, fy + 0.04, z] });
  for (let z = -33; z > -78; z -= 3.4) pathC.add(new THREE.BoxGeometry(0.55, 0.03, 1.9), 0xffe08a, { pos: [0, fy + 0.04, z] });
  const glowMat = (op) => new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: true });
  V.bandMesh = new THREE.Mesh(bands.build(), glowMat(0.75));
  V.pathMeshA = new THREE.Mesh(pathA.build(), glowMat(0.4));
  V.pathMeshC = new THREE.Mesh(pathC.build(), glowMat(0.55));
  V.group.add(V.bandMesh, V.pathMeshA, V.pathMeshC);

  // ---- bake the light: every vertex takes its brightness from the braziers near it
  const g = b.buildUV(0.4);
  const pos = g.attributes.position.array, col = g.attributes.color.array;
  const tint = new THREE.Color();
  for (let i = 0; i < pos.length; i += 3) {
    let warm = 0;
    for (const [bx, bz] of BRAZIERS) {
      const dx = pos[i] - bx, dy = pos[i + 1] - (fy + 1.5), dz = pos[i + 2] - bz, d2 = dx * dx + dy * dy + dz * dz;
      warm += 1 / (1 + d2 / 40);
    }
    warm = Math.min(1.5, warm);
    // dim cool blue far from a flame, warm gold near one
    col[i] *= 0.16 + warm * 1.05; col[i + 1] *= 0.19 + warm * 0.82; col[i + 2] *= 0.26 + warm * 0.5;
  }
  g.attributes.color.needsUpdate = true;
  const mesh = new THREE.Mesh(g, mat);
  V.group.add(mesh);

  // flames: additive sprites that flicker (no lights)
  const flameTex = radialSprite('rgba(255,214,120,1)', 'rgba(255,90,20,0)', 64);
  for (const [bx, bz] of BRAZIERS) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    sp.position.set(bx, fy + 1.9, bz); sp.scale.set(1.5, 2.3, 1);
    V.group.add(sp);
    V.flames.push({ sp, seed: rnd(0, 10), base: fy + 1.9 });
  }

  // the rune ring on the throne dais, and the seal across the corridor
  const glow = new THREE.MeshBasicMaterial({ color: 0xffb060, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(new THREE.RingGeometry(5.0, 5.35, 48), glow);
  ring.rotation.x = -Math.PI / 2; ring.position.set(0, fy + 0.3, -66);
  V.group.add(ring); V.ring = ring;
  const film = new THREE.CanvasTexture((() => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 128; const c = cv.getContext('2d');
    const gr = c.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, 'rgba(255,190,110,0.15)'); gr.addColorStop(1, 'rgba(255,190,110,0.55)');
    c.fillStyle = gr; c.fillRect(0, 0, 128, 128); c.strokeStyle = 'rgba(255,235,200,0.75)'; c.lineWidth = 2;
    for (let i = 1; i < 8; i++) { c.beginPath(); c.moveTo(0, i * 16); c.lineTo(128, i * 16 + (i % 2 ? 6 : -6)); c.stroke(); }
    return cv;
  })());
  film.wrapT = THREE.RepeatWrapping;
  V.seal = new THREE.Mesh(new THREE.PlaneGeometry(6.2, 6), new THREE.MeshBasicMaterial({ map: film, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
  V.seal.position.set(0, fy + 3, SEAL_Z);
  V.group.add(V.seal);
  // the seal is solid until its guardians fall
  V.sealBlocks = [[-2.2, SEAL_Z], [0, SEAL_Z], [2.2, SEAL_Z]].map(([x, z]) => ({ x, z, r: 1.5, h: 6 }));
  for (const o of V.sealBlocks) V.obstacles.push(o);

  V.openSeal = () => {
    if (V.sealOpen) return;
    V.sealOpen = true; V.seal.visible = false;
    for (const o of V.sealBlocks) { const i = V.obstacles.indexOf(o); if (i >= 0) V.obstacles.splice(i, 1); }
  };
  V.closeSeal = () => {
    V.sealOpen = false; V.seal.visible = true;
    for (const o of V.sealBlocks) if (!V.obstacles.includes(o)) V.obstacles.push(o);
  };

  /** keep a camera inside the rooms and under the ceiling (the third-person camera would otherwise slip through a wall) */
  V.clampCamera = (p) => {
    const [x, z] = clampToRooms(p.x, p.z, 0.7, V.sealOpen);
    p.x = x; p.z = z;
    p.y = clamp(p.y, fy + 0.6, fy + 7.4);
  };

  V.update = (t) => {
    for (const f of V.flames) {
      const w = Math.sin(t * 9 + f.seed) * 0.5 + Math.sin(t * 23.7 + f.seed * 2) * 0.25;
      f.sp.scale.set(1.4 + w * 0.25, 2.1 + w * 0.5, 1); f.sp.position.y = f.base + w * 0.06;
    }
    if (V.seal.visible) { V.seal.material.opacity = 0.42 + 0.1 * Math.sin(t * 1.7); V.seal.material.map.offset.y = (t * 0.05) % 1; }
    V.ring.material.opacity = 0.55 + 0.2 * Math.sin(t * 2.2);
    V.bandMesh.material.opacity = 0.6 + 0.2 * Math.sin(t * 1.3);
    V.pathMeshA.material.opacity = 0.3 + 0.2 * Math.sin(t * 2.4);
    V.pathMeshC.visible = V.sealOpen; V.pathMeshC.material.opacity = 0.4 + 0.2 * Math.sin(t * 2.4 + 1);
  };

  V.group.visible = true;
  scene.add(V.group);
  return V;
}
