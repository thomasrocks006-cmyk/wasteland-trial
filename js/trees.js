import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/* ================================================================ the trees
   Trees generated with EZ-Tree (Dan Greenheck, MIT; assets/trees/CREDITS.txt): three pines, an oak, an aspen. Near the
   player each is the real tree (instanced: one draw call per species part); further out the same tree is a card, a
   picture of that tree rendered once at start-up (an impostor, the way large game forests are drawn). Which spots are
   near is re-sorted a few times a second. */

export const TREES = {};
const FILES = ['pine_a', 'pine_b', 'pine_c', 'oak_a', 'aspen_a'];
const SPECIES = { fir: ['pine_a', 'pine_b', 'pine_c'], broad: ['oak_a'], giant: ['oak_a'], birch: ['aspen_a'] };

export async function preloadTrees(base = 'assets/trees/') {
  const L = new GLTFLoader();
  await Promise.all(FILES.map(async (n) => { try { const g = await L.loadAsync(base + n + '.glb'); g.scene.updateMatrixWorld(true); TREES[n] = g.scene; } catch (e) { /* the old trees stand in */ } }));
  return TREES;
}
export const treesReady = () => FILES.every((n) => TREES[n]);

function floatGeo(geo) {
  for (const [k, a] of Object.entries(geo.attributes)) {
    if (a.array instanceof Float32Array && !a.isInterleavedBufferAttribute) continue;
    const n = a.count, sz = a.itemSize, f = new Float32Array(n * sz), get = [a.getX, a.getY, a.getZ, a.getW];
    for (let i = 0; i < n; i++) for (let c = 0; c < sz; c++) f[i * sz + c] = get[c].call(a, i);
    geo.setAttribute(k, new THREE.BufferAttribute(f, sz));
  }
  for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k);
  return geo;
}

/** one tree model as parts merged by material, standing on y = 0, centred, height 1 */
function variantOf(name) {
  const root = TREES[name], by = new Map();
  root.traverse((o) => { if (!o.isMesh) return; const g = floatGeo(o.geometry.clone()); g.applyMatrix4(o.matrixWorld); if (!by.has(o.material)) by.set(o.material, []); by.get(o.material).push(g); });
  const parts = [...by].map(([mat, gs]) => ({ mat, geo: mergeGeometries(gs, false) }));
  const box = new THREE.Box3(); for (const p of parts) { p.geo.computeBoundingBox(); box.union(p.geo.boundingBox); }
  const h = box.max.y - box.min.y, cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2;
  for (const p of parts) { p.geo.translate(-cx, -box.min.y, -cz); p.geo.scale(1 / h, 1 / h, 1 / h); p.geo.computeBoundingSphere(); }
  const w = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) / h;
  return { name, parts, w };
}

export class TreeField {
  constructor(scene, quality = 'balanced', time = { value: 0 }) {
    this.scene = scene; this.quality = quality; this.time = time;
    this.R = quality === 'fast' ? 25 : quality === 'high' ? 55 : 35;
    this.variants = {}; for (const n of FILES) this.variants[n] = variantOf(n);
    this.spots = [];       // { v, x, y, z, h, ry }
    this.last = null; this.acc = 0;
  }

  /** a tree of a kind (fir, broad, giant, birch) at x, y, z, h metres tall */
  add(kind, x, y, z, h) {
    const list = SPECIES[kind] || SPECIES.fir, v = list[Math.floor(Math.random() * list.length)];
    this.spots.push({ v, x, y: y - 0.15, z, h, ry: Math.random() * Math.PI * 2 });
  }

  build() {
    const sway = (mat) => {
      const m = mat.clone(); m.side = THREE.DoubleSide;
      m.onBeforeCompile = (sh) => {
        sh.uniforms.uTime = this.time;
        sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
          #ifdef USE_INSTANCING
            vec3 tp = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
          #else
            vec3 tp = vec3(0.0);
          #endif
          float k = transformed.y * transformed.y;
          transformed.x += sin(uTime * 1.3 + tp.x * 0.3 + tp.z * 0.2) * 0.015 * k;
          transformed.z += cos(uTime * 1.1 + tp.z * 0.3) * 0.012 * k;`);
      };
      m.customProgramCacheKey = () => 'treesway';
      return m;
    };
    this.sets = {};
    for (const [n, V] of Object.entries(this.variants)) {
      const mine = this.spots.filter((s) => s.v === n);
      if (!mine.length) continue;
      const cap = mine.length;
      const near = V.parts.map((p) => {
        const leafy = p.mat.alphaTest > 0 || p.mat.transparent || (p.mat.map && p.mat.alphaMap);
        const mat = leafy ? sway(p.mat) : p.mat;
        const m = new THREE.InstancedMesh(p.geo, mat, cap); m.castShadow = true; m.receiveShadow = true; m.count = 0; m.frustumCulled = false;
        if (leafy) m.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: p.mat.map, alphaTest: Math.max(0.3, p.mat.alphaTest || 0.5) });
        this.scene.add(m); return m;
      });
      // the card: a quad that turns to face the player (refreshed with the sort), textured with the baked picture
      const quad = new THREE.PlaneGeometry(V.w * 1.0, 1); quad.translate(0, 0.5, 0);
      const cardMat = new THREE.MeshLambertMaterial({ alphaTest: 0.45, side: THREE.DoubleSide, transparent: false, color: 0xffffff });
      const card = new THREE.InstancedMesh(quad, cardMat, cap); card.count = 0; card.frustumCulled = false; card.receiveShadow = false; card.visible = false;
      this.scene.add(card);
      this.sets[n] = { spots: mine, near, card, V };
    }
  }

  /** render each tree once into a picture for its card (needs the renderer, so the game calls it after the world is built) */
  bake(renderer) {
    const sc = new THREE.Scene();
    sc.add(new THREE.AmbientLight(0xffffff, 1.6));
    const dl = new THREE.DirectionalLight(0xffffff, 1.2); dl.position.set(0.4, 1, 1); sc.add(dl);
    const prevT = renderer.getRenderTarget(), prevC = renderer.getClearColor(new THREE.Color()), prevA = renderer.getClearAlpha();
    renderer.setClearColor(0x000000, 0);
    for (const S of Object.values(this.sets)) {
      const V = S.V, g = new THREE.Group();
      for (const p of V.parts) g.add(new THREE.Mesh(p.geo, p.mat));
      sc.add(g);
      const cam = new THREE.OrthographicCamera(-V.w / 2, V.w / 2, 1, 0, 0.01, 10); cam.position.set(0, 0, 4); cam.lookAt(0, 0, 0);
      const rt = new THREE.WebGLRenderTarget(128, Math.round(128 / Math.max(0.3, V.w)), { samples: 0 });
      renderer.setRenderTarget(rt); renderer.clear(); renderer.render(sc, cam);
      sc.remove(g);
      S.card.material.map = rt.texture; S.card.material.needsUpdate = true; S.card.visible = true;
      S.rt = rt;
    }
    renderer.setRenderTarget(prevT); renderer.setClearColor(prevC, prevA);
    this.baked = true;
  }

  /** sort the spots into near (real trees) and far (cards) around the player */
  update(dt, p) {
    this.acc += dt;
    if (this.last && this.acc < 0.3 && this.last.distanceToSquared(p) < 9) return;
    this.acc = 0; (this.last || (this.last = new THREE.Vector3())).copy(p);
    const R2 = this.R * this.R, m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), t = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    for (const S of Object.values(this.sets)) {
      let nn = 0, nf = 0;
      for (const sp of S.spots) {
        const dx = sp.x - p.x, dz = sp.z - p.z, d2 = dx * dx + dz * dz;
        if (d2 < R2 || !this.baked) {
          m.compose(t.set(sp.x, sp.y, sp.z), q.setFromAxisAngle(up, sp.ry), s.set(sp.h, sp.h, sp.h));
          for (const mesh of S.near) mesh.setMatrixAt(nn, m);
          nn++;
        } else {
          m.compose(t.set(sp.x, sp.y, sp.z), q.setFromAxisAngle(up, Math.atan2(-dx, -dz)), s.set(sp.h, sp.h, sp.h));
          S.card.setMatrixAt(nf++, m);
        }
      }
      for (const mesh of S.near) { mesh.count = nn; mesh.instanceMatrix.needsUpdate = true; }
      S.card.count = nf; S.card.instanceMatrix.needsUpdate = true;
    }
  }
}
