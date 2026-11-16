import * as THREE from 'three';
import { terrainHeight, terrainNormal, waterDist, trailDist, ARENA_R } from './core.js';

/* ================================================================ grass
   A field of blades drawn on the GPU around the player, after SimonDev's Quick_Grass (MIT): each blade is a few
   triangles, instanced tens of thousands of times in a patch that follows the player. Its x/z wraps inside the patch, so a
   blade stays put in the world while the patch moves; its height and whether grass grows there are read from two small
   maps baked once from the terrain (no grass on the trail, in the water, on the dais, on cliffs or under a rock).
   Lit by the scene's lights and fog (a Lambert material, patched), swaying in the wind, fading at the patch edge. */

const MAP = 256;

export class GrassField {
  constructor(scene, world, quality = 'balanced') {
    this.scene = scene;
    const n = quality === 'fast' ? 6000 : quality === 'high' ? 30000 : 14000;          // clumps of three blades
    this.size = quality === 'fast' ? 18 : quality === 'high' ? 32 : 24;
    // ---- the maps: height (R, as metres in a float), growth (G, 0..1)
    const ext = ARENA_R + 6, data = new Float32Array(MAP * MAP * 4), _n = new THREE.Vector3();
    for (let j = 0; j < MAP; j++) for (let i = 0; i < MAP; i++) {
      const x = -ext + (i + 0.5) / MAP * ext * 2, z = -ext + (j + 0.5) / MAP * ext * 2, k = (j * MAP + i) * 4;
      const r = Math.hypot(x, z);
      data[k] = terrainHeight(x, z);
      let g = r < ARENA_R - 1 && r > 15 ? 1 : 0;
      if (g) {
        if (waterDist(x, z) < 1.2) g = 0;
        else if (trailDist(x, z) < 1.4) g = 0;
        else if (terrainNormal(x, z, _n).y < 0.8) g = 0;
        else g *= Math.min(1, (trailDist(x, z) - 1.4) / 1.5) * Math.min(1, (waterDist(x, z) - 1.2) / 1.5);
      }
      data[k + 1] = g;
    }
    // under rocks, stumps, ruins: nothing grows
    for (const o of world.obstacles) {
      const rr = (o.r || 0.6) * 0.95, i0 = Math.floor((o.x - rr + ext) / (ext * 2) * MAP), i1 = Math.ceil((o.x + rr + ext) / (ext * 2) * MAP);
      const j0 = Math.floor((o.z - rr + ext) / (ext * 2) * MAP), j1 = Math.ceil((o.z + rr + ext) / (ext * 2) * MAP);
      for (let j = Math.max(0, j0); j <= Math.min(MAP - 1, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(MAP - 1, i1); i++) {
        const x = -ext + (i + 0.5) / MAP * ext * 2, z = -ext + (j + 0.5) / MAP * ext * 2;
        if (Math.hypot(x - o.x, z - o.z) < rr) data[(j * MAP + i) * 4 + 1] = 0;
      }
    }
    const half = new Uint16Array(data.length); for (let i = 0; i < data.length; i++) half[i] = THREE.DataUtils.toHalfFloat(data[i]);
    this.map = new THREE.DataTexture(half, MAP, MAP, THREE.RGBAFormat, THREE.HalfFloatType);
    this.map.magFilter = this.map.minFilter = THREE.LinearFilter; this.map.needsUpdate = true;
    // ---- one blade: a tapered strip, 3 segments (6 triangles), y 0..1, width 1 at the root
    // a clump: three blades, each a tapered strip (two segments and a tip), set a little apart and turned
    // (vertex x is in blade-widths, y 0..1 up the blade; the shader scales them; uv.x carries the blade's lean)
    const P = [], I = [], U = [];
    for (let b = 0; b < 3; b++) {
      const a = b * 2.1 + 0.4, ox = Math.cos(a * 1.7) * 1.6, oz = Math.sin(a * 1.3) * 1.6, ca = Math.cos(a), sa = Math.sin(a), lean = 0.6 + b * 0.35, base = P.length / 3;
      for (let s = 0; s < 3; s++) { const t = s / 3, w = (1 - t * 0.85) * 0.5; for (const x of [-w, w]) { P.push(ox + x * ca, t, oz + x * sa); U.push(lean, t); } }
      P.push(ox, 1, oz); U.push(lean, 1);
      I.push(base, base + 1, base + 2, base + 1, base + 3, base + 2, base + 2, base + 3, base + 4, base + 3, base + 5, base + 4, base + 4, base + 5, base + 6);
    }
    const blade = new THREE.InstancedBufferGeometry();
    blade.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); blade.setIndex(I);
    blade.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    blade.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(P.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    const off = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { off[i * 4] = Math.random() * this.size; off[i * 4 + 1] = Math.random() * this.size; off[i * 4 + 2] = Math.random(); off[i * 4 + 3] = Math.random(); }
    blade.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 4));
    blade.instanceCount = n;
    this.uni = { uTime: world.time, uPlayer: { value: new THREE.Vector2() }, uSize: { value: this.size }, uMap: { value: this.map }, uExt: { value: ext } };
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.uni);
      sh.vertexShader = `uniform float uTime; uniform vec2 uPlayer; uniform float uSize; uniform sampler2D uMap; uniform float uExt;
        attribute vec4 aOff; varying float vTip; varying vec3 vTint;\n` + sh.vertexShader
        .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
          objectNormal = vec3(0.0, 1.0, 0.0);`)
        .replace('#include <begin_vertex>', `
          // where this blade stands: fixed in the world, wrapped into the patch around the player
          vec2 w = uPlayer + mod(aOff.xy - uPlayer, uSize) - uSize * 0.5;
          vec2 muv = (w + uExt) / (uExt * 2.0);
          vec4 m = texture2D(uMap, muv);
          float edge = 1.0 - smoothstep(uSize * 0.36, uSize * 0.5, length(w - uPlayer));
          float grow = m.g * edge * step(aOff.z * 0.85, m.g);
          float h = (0.22 + aOff.w * 0.3) * grow;
          float ang = aOff.z * 6.2831;
          // blade width 6 cm, the clump 20 cm across; the tip bends over by the blade's lean
          vec3 transformed = vec3(position.x * 0.06, position.y * h, position.z * 0.06);
          transformed.x += uv.x * position.y * position.y * h * 0.35;
          transformed.xz = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * transformed.xz;
          // the wind: a slow wave across the field plus a quick flutter, more at the tip
          float t2 = position.y * position.y;
          float gust = sin(uTime * 1.3 + w.x * 0.21 + w.y * 0.17) * 0.5 + 0.5;
          transformed.x += (gust * 0.22 + sin(uTime * 4.0 + aOff.z * 30.0) * 0.03) * t2 * h;
          transformed.z += (gust * 0.12) * t2 * h;
          transformed += vec3(w.x, m.r, w.y);
          vTip = position.y;
          vTint = mix(vec3(0.17, 0.32, 0.07), vec3(0.26, 0.37, 0.1), aOff.w);       // linear greens (lighting is linear)`)
        .replace('#include <project_vertex>', `vec4 mvPosition = viewMatrix * vec4(transformed, 1.0); gl_Position = projectionMatrix * mvPosition;`)
        .replace('#include <worldpos_vertex>', `vec4 worldPosition = vec4(transformed, 1.0);`);
      sh.fragmentShader = 'varying float vTip; varying vec3 vTint;\n' + sh.fragmentShader.replace('vec4 diffuseColor = vec4( diffuse, opacity );',
        'vec4 diffuseColor = vec4( diffuse * vTint * mix(0.35, 1.0, vTip), opacity );');
    };
    mat.customProgramCacheKey = () => 'gpugrass';
    this.mesh = new THREE.Mesh(blade, mat);
    this.mesh.frustumCulled = false; this.mesh.receiveShadow = true;
    scene.add(this.mesh);
  }
  update(p, underground = false) { this.uni.uPlayer.value.set(p.x, p.z); this.mesh.visible = !underground; }
}
