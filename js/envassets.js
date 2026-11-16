import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/* ================================================================ scanned props
   Photo-scanned rocks, stumps, roots, ferns, a fire pit, a castle door and an iron gate from Poly Haven (CC0; credits in
   assets/env/CREDITS.txt), cut down for the web (a few thousand triangles, 512 px WebP textures). Loaded before the
   world is built; any that fail leave the world's own procedural stand-ins in place. */

export const ENV = {};
const IDS = ['rock_moss_set_01', 'rock_moss_set_02', 'namaqualand_boulder_02', 'tree_stump_01', 'dead_tree_trunk', 'fern_02', 'pine_roots',
  'stone_fire_pit', 'large_castle_door', 'large_iron_gate', 'rock_face_01', 'mountainside', 'fern_lo', 'pebbles_lo'];

export async function preloadEnv(base = 'assets/env/') {
  const L = new GLTFLoader();
  await Promise.all(IDS.map(async (id) => {
    try { const g = await L.loadAsync(base + id + '.glb'); g.scene.updateMatrixWorld(true); ENV[id] = g.scene; }
    catch (e) { /* the procedural stand-in stays */ }
  }));
  return ENV;
}

/**
 * Every mesh of a scanned model as { geo, mat, name }, its node transform baked into the geometry.
 * norm: centre each on x/z, stand it on y = 0, and scale it so its larger horizontal half-extent is 1 (a 'radius').
 */
export function envParts(id, { norm = false, merge = false } = {}) {
  const root = ENV[id]; if (!root) return [];
  if (merge) {
    // every mesh that shares a material becomes one geometry (one draw call per material)
    const by = new Map();
    for (const p of envParts(id, { norm: false })) { if (!by.has(p.mat)) by.set(p.mat, []); by.get(p.mat).push(p.geo); }
    return [...by].map(([mat, geos]) => ({ geo: mergeGeometries(geos.map((g) => { for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); return g; }), false), mat, name: id }));
  }
  const out = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    const geo = toFloat(o.geometry.clone()); geo.applyMatrix4(o.matrixWorld);
    if (norm) {
      geo.computeBoundingBox(); const b = geo.boundingBox;
      geo.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
      const r = Math.max(b.max.x - b.min.x, b.max.z - b.min.z) / 2 || 1; geo.scale(1 / r, 1 / r, 1 / r);
      geo.userData.height = (b.max.y - b.min.y) / r;
    }
    geo.computeBoundingSphere();
    out.push({ geo, mat: o.material, name: o.name });
  });
  return out;
}

/** quantized attributes (int16, normalized) cannot hold metres once transformed: plain floats first */
function toFloat(geo) {
  for (const [k, a] of Object.entries(geo.attributes)) {
    if (a.array instanceof Float32Array && !a.isInterleavedBufferAttribute) continue;
    const n = a.count, sz = a.itemSize, f = new Float32Array(n * sz);
    const get = [a.getX, a.getY, a.getZ, a.getW];                  // these undo the normalisation
    for (let i = 0; i < n; i++) for (let c = 0; c < sz; c++) f[i * sz + c] = get[c].call(a, i);
    geo.setAttribute(k, new THREE.BufferAttribute(f, sz));
  }
  return geo;
}

/** a placed copy of a whole scanned model (shares geometry and materials) */
export function envPiece(id) {
  const root = ENV[id]; if (!root) return null;
  const c = root.clone(true);
  c.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return c;
}
