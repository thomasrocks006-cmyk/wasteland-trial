import * as THREE from 'three';
import {
  TAU, clamp, lerp, smoothstep, rnd, rng, fbm, pick,
  terrainHeight, terrainNormal, Builder, ARENA_R, RIM_R,
  grassTexture, smokeTexture, radialSprite, groundTexture, stoneTexture, clothTexture,
  GRID_SEG, GRID_EXT, gridHeight, RIVER, RIVER_W, LAKE, LAKE_Y, waterDist, needleTexture, meadowTexture,
  GAP_A, LOWLAND_Y, gapAmount, TRAIL, TRAIL_LEN, trailDist, MeshBuilder, leafTexture, needleSprayTexture, fernTexture, barkTexture, birchTexture
} from './core.js';
import { sampleTime, sunVector, makeState, START_TOD } from './daynight.js';

const _v = new THREE.Vector3();
let STONE_MAT = null;
export function stoneMat() {
  if (!STONE_MAT) { const t = stoneTexture(); STONE_MAT = new THREE.MeshLambertMaterial({ vertexColors: true, map: t, bumpMap: t, bumpScale: 3 }); }
  return STONE_MAT;
}
const _c1 = new THREE.Color(), _c2 = new THREE.Color(), _c3 = new THREE.Color();

/* A green valley of old stone. The keys kept their desert-era names so every
   builder below picks up the new world without being rewritten. */
const PAL = {
  sandLight: 0x6f9445,   // meadow
  sandDark: 0x456a2f,    // deep grass
  sandTop: 0x9ab25e,     // sunlit grass
  sandPale: 0xa9b073,    // dry meadow on crests
  sandCool: 0x5b7d68,    // cool blue-green patches
  copper: 0xa47e4c,      // lichen
  verdigris: 0x5e7f3a,   // moss
  rock: 0x7d8284,        // granite
  rockDark: 0x52585c,
  ruin: 0xa9aca7,        // weathered grey stone
  ruinDark: 0x6c7270,
  ruinLight: 0xc9cbc3,
  metal: 0x4a4b50,
  metalRust: 0x8a6a3a,   // old bronze
  scrub: 0x4b7a32,
  scrubDry: 0x6b8b3a,
  wood: 0x5a4330,
  snow: 0xeef3f6,
  mud: 0x4a3f30,
  path: 0x8c7d5c,
  pine: 0x2f4f2a,
  pineDark: 0x223b22,
  slate: 0x3d4a5c,
  rune: 0x7ff3ff,
};

export class World {
  constructor(scene, quality = 'balanced') {
    this.scene = scene;
    this.quality = quality;
    this.obstacles = [];       // {x,z,r,h}: h = top above local ground
    this.shadowTarget = new THREE.Vector3();
    this.time = { value: 0 };
    // a low golden sun behind the overlook (over the cascade), so the view out through
    // the pass is lit from the front, not a backlit silhouette
    this.sunDir = new THREE.Vector3(-0.74, 0.26, 0.62).normalize();
    this.lightDir = this.sunDir.clone();     // what the directional light and its shadows follow: the sun by day, the moon by night
    this.exposure = 1.06; this.night = 0; this.shaftK = 1; this.tod = START_TOD;
    this._tod = makeState();
    this.build();
    this.applyTime(START_TOD);
  }

  build() {
    const scene = this.scene;
    // linear haze reads as depth; exponential just greys everything out
    scene.fog = new THREE.Fog(0xc9d5d6, 70, 1150);  // haze matched to the horizon: distance reads as distance

    this.buildSky();
    this.buildLights();
    this.buildTerrain();
    this.buildDistantRidges();
    this.buildRocks();
    this.buildRuins();
    this.buildMidfield();
    this.buildLandmarks();
    this.buildOrnaments();
    this.buildTowers();
    this.buildColossi();
    this.buildWater();
    this.buildVegetation();
    this.buildForest();
    this.buildIvy();
    this.buildGroundDetail();
    this.buildDust();
  }

  /* -------------------------------------------------- sky */
  buildSky() {
    const scene = this.scene;
    const geo = new THREE.SphereGeometry(700, 32, 20);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        uSun: { value: this.sunDir.clone() },
        uTime: this.time,
        uZenith: { value: new THREE.Color(0x3a66a6) },
        uMid: { value: new THREE.Color(0xa6c3d8) },
        uHorizon: { value: new THREE.Color(0xe9e2d2) },
        uGround: { value: new THREE.Color(0x56704a) },
        uMoon: { value: new THREE.Vector3(0, -1, 0) }, uStars: { value: 0 }, uDay: { value: 1 },
      },
      vertexShader: /* glsl */`
        varying vec3 vDir;
        void main(){
          vDir = normalize(position);
          vec4 mv = modelViewMatrix * vec4(position,1.0);
          gl_Position = projectionMatrix * mv;
          gl_Position.z = gl_Position.w; // pin to far plane
        }`,
      fragmentShader: /* glsl */`
        precision highp float;
        varying vec3 vDir;
        uniform vec3 uSun, uZenith, uMid, uHorizon, uGround, uMoon;
        uniform float uTime, uStars, uDay;
        float h3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }

        float h2(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123); }
        float vn(vec2 p){
          vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
          return mix(mix(h2(i),h2(i+vec2(1,0)),f.x),mix(h2(i+vec2(0,1)),h2(i+vec2(1,1)),f.x),f.y);
        }
        float fbm(vec2 p){
          float v=0.0,a=0.5;
          for(int i=0;i<5;i++){ v+=vn(p)*a; p*=2.03; a*=0.5; }
          return v;
        }

        void main(){
          vec3 d = normalize(vDir);
          float y = d.y;

          vec3 col = mix(uHorizon, uMid, smoothstep(-0.02, 0.30, y));
          col = mix(col, uZenith, smoothstep(0.16, 0.85, y));
          col = mix(uGround, col, smoothstep(-0.14, 0.02, y));

          // sun (only while it is above the horizon)
          float sd = max(dot(d, normalize(uSun)), 0.0);
          float aboveH = smoothstep(-0.06, 0.04, y);
          col += (vec3(1.0,0.72,0.42) * pow(sd, 6.0) * 0.42
                + vec3(1.0,0.86,0.62) * pow(sd, 90.0) * 1.35
                + vec3(1.0,0.95,0.85) * smoothstep(0.9993, 0.99975, sd) * 3.2) * aboveH;

          // night: stars that twinkle, and the moon opposite the sun
          if (uStars > 0.01 && y > -0.03) {
            vec3 q = d * 150.0;
            float r = h3(floor(q));
            float star = step(0.982, r) * smoothstep(0.55, 0.0, length(fract(q) - 0.5)) * (0.6 + 0.4 * sin(uTime * 2.1 + r * 80.0));
            col += vec3(0.82, 0.9, 1.0) * star * uStars * smoothstep(0.0, 0.2, y) * 1.6;
            float md = dot(d, normalize(uMoon));
            col += vec3(0.85, 0.92, 1.0) * smoothstep(0.9987, 0.9992, md) * 2.4 * uStars;
            col += vec3(0.35, 0.45, 0.75) * pow(max(md, 0.0), 70.0) * 0.3 * uStars;
          }

          // dusty cloud bands near horizon
          if (y > -0.02) {
            vec2 pp = d.xz / max(0.06, y + 0.22) * 1.35;
            float t = uTime * 0.006;
            float f = fbm(pp * 0.9 + vec2(t, t*0.4));
            float f2 = fbm(pp * 2.3 - vec2(t*0.7, 0.0));
            float band = smoothstep(0.42, 0.86, f*0.7 + f2*0.45);
            band *= smoothstep(-0.01, 0.20, y) * (1.0 - smoothstep(0.42, 0.95, y));
            vec3 cc = mix(vec3(0.93,0.90,0.88), vec3(1.0,0.98,0.95), f2);
            col = mix(col, cc * (0.12 + 0.88 * uDay), band * 0.7);
          }

          // slight dither to kill banding
          float dither = (h2(gl_FragCoord.xy) - 0.5) * 0.006;
          gl_FragColor = vec4(col + dither, 1.0);
        }`
    });
    const sky = new THREE.Mesh(geo, mat);
    sky.frustumCulled = false;
    sky.renderOrder = -1000;
    scene.add(sky);
    this.sky = sky;

    // sun disc sprite for bloom-ish glow
    const g = radialSprite('rgba(255,240,205,1)', 'rgba(255,150,60,0)', 128);
    const sm = new THREE.SpriteMaterial({ map: g, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, opacity: 0.55 });
    const sp = new THREE.Sprite(sm);
    sp.scale.setScalar(190);
    sp.position.copy(this.sunDir).multiplyScalar(560);
    scene.add(sp);
    this.sunSprite = sp;
  }

  /* -------------------------------------------------- lights */
  buildLights() {
    const scene = this.scene;
    const hemi = new THREE.HemisphereLight(0xd4e6ff, 0x5a6a40, 1.25);
    scene.add(hemi);
    this.hemi = hemi;

    const sun = new THREE.DirectionalLight(0xffe2b2, 3.4);
    sun.position.copy(this.sunDir).multiplyScalar(90);
    sun.castShadow = true;
    const size = this.quality === 'high' ? 2048 : 1024;
    sun.shadow.mapSize.set(size, size);
    const d = 42;
    sun.shadow.camera.left = -d; sun.shadow.camera.right = d;
    sun.shadow.camera.top = d; sun.shadow.camera.bottom = -d;
    sun.shadow.camera.near = 1; sun.shadow.camera.far = 240;
    sun.shadow.bias = -0.0008;
    sun.shadow.normalBias = 0.05;
    sun.shadow.camera.updateProjectionMatrix();
    scene.add(sun);
    scene.add(sun.target);
    this.sun = sun;

    // cool sky fill from the shadow side: warm light, cold shadow
    const bounce = new THREE.DirectionalLight(0x86b6ff, 0.46);
    bounce.position.set(-0.5, 0.45, 0.7);
    scene.add(bounce);
    this.bounce = bounce;

    this.ambient = new THREE.AmbientLight(0x56657e, 0.34);
    scene.add(this.ambient);

    // camera-side fill so the hero and enemies never fall into silhouette
    const fill = new THREE.DirectionalLight(0xb9cdf0, 0.62);
    fill.castShadow = false;
    scene.add(fill);
    scene.add(fill.target);
    this.fill = fill;
  }

  /* -------------------------------------------------- terrain */
  buildTerrain() {
    const SEG = GRID_SEG;
    const EXT = GRID_EXT;
    const TILES = 30;
    const step = (EXT * 2) / SEG;
    const pos = new Float32Array(SEG * SEG * 18);
    const col = new Float32Array(SEG * SEG * 18);
    const uvs = new Float32Array(SEG * SEG * 12);
    let p = 0, up = 0;

    const hAt = (i, j) => {
      const x = -EXT + i * step, z = -EXT + j * step;
      return [x, z, gridHeight(i, j)];
    };
    const cc = new THREE.Color();

    const colorFor = (h, ny, x, z) => {
      const rockAmt = smoothstep(0.86, 0.6, ny);
      const patch = fbm(x * 0.021, z * 0.021, 3);
      const drift = fbm(x * 0.085 + 11, z * 0.085 - 7, 3);
      const grain = fbm(x * 0.42 - 5, z * 0.42 + 3, 2);

      // meadow: deep and sunlit grass in drifts, dry on the crests, cool patches
      _c1.setHex(PAL.sandDark).lerp(_c2.setHex(PAL.sandLight), clamp(drift * 1.7 - 0.25, 0, 1));
      _c1.lerp(_c3.setHex(PAL.sandTop), clamp((grain - 0.55) * 2.2, 0, 1) * 0.5);
      _c1.lerp(_c3.setHex(PAL.sandPale), smoothstep(4, 16, h) * 0.35);
      _c1.lerp(_c2.setHex(PAL.sandCool), clamp((patch - 0.55) * 2.2, 0, 1) * 0.4);

      // the trodden ring round the shrine
      const r = Math.hypot(x, z);
      _c1.lerp(_c2.setHex(PAL.path), (1 - smoothstep(10.5, 15.5, r)) * smoothstep(8.5, 10, r) * 0.75);

      // granite on slopes, with moss and lichen
      const rk = _c3.setHex(PAL.rock).lerp(_c2.setHex(PAL.rockDark), drift);
      _c1.lerp(rk, rockAmt * 0.95);
      _c1.lerp(_c2.setHex(PAL.verdigris), clamp((0.46 - patch) * 2.6, 0, 1) * rockAmt * 0.5);
      _c1.lerp(_c2.setHex(PAL.copper), clamp((patch - 0.7) * 3.0, 0, 1) * rockAmt * 0.35);

      // snow on the high rim
      _c1.lerp(_c2.setHex(PAL.snow), smoothstep(27, 35, h + (patch - 0.5) * 6) * (0.55 + 0.45 * (1 - rockAmt)));

      // the forest trail worn to dirt, and a darker floor of moss and litter under the trees
      const td = trailDist(x, z);
      _c1.lerp(_c2.setHex(0x3e4a2a).lerp(_c3.setHex(0x5a4a34), clamp(grain * 1.4 - 0.3, 0, 1)), (1 - smoothstep(5, 17, td)) * 0.55 * (1 - rockAmt));
      _c1.lerp(_c2.setHex(0x7a6446).lerp(_c3.setHex(0x8f7a58), drift), 1 - smoothstep(1.1, 2.6, td));

      // wet dark earth and stone along the water
      const wd = waterDist(x, z);
      _c1.lerp(_c2.setHex(PAL.mud), (1 - smoothstep(-0.5, 3.5, wd)) * 0.85);

      _c1.offsetHSL(0.004 * (patch - 0.5), 0.02 * (drift - 0.5), (grain - 0.5) * 0.05);
      return cc.copy(_c1);
    };

    for (let j = 0; j < SEG; j++) {
      for (let i = 0; i < SEG; i++) {
        const a = hAt(i, j), b = hAt(i + 1, j), c = hAt(i + 1, j + 1), d = hAt(i, j + 1);
        // wound so the face normals point UP (they were inverted, which lit the
        // ground from below and broke shadows landing on it)
        const tris = [a, c, b, a, d, c];
        // face normal for shading variation
        for (let k = 0; k < 6; k += 3) {
          const v0 = tris[k], v1 = tris[k + 1], v2 = tris[k + 2];
          _v.set(v1[0] - v0[0], v1[2] - v0[2], v1[1] - v0[1]);
          const e1x = v1[0] - v0[0], e1y = v1[2] - v0[2], e1z = v1[1] - v0[1];
          const e2x = v2[0] - v0[0], e2y = v2[2] - v0[2], e2z = v2[1] - v0[1];
          let nx = e1y * e2z - e1z * e2y;
          let ny = e1z * e2x - e1x * e2z;
          let nz = e1x * e2y - e1y * e2x;
          const nl = Math.hypot(nx, ny, nz) || 1;
          ny /= nl;
          const hAvg = (v0[2] + v1[2] + v2[2]) / 3;
          const cx = (v0[0] + v1[0] + v2[0]) / 3;
          const cz = (v0[1] + v1[1] + v2[1]) / 3;
          const cl = colorFor(hAvg, Math.abs(ny), cx, cz);
          for (let q = 0; q < 3; q++) {
            const v = tris[k + q];
            pos[p] = v[0]; pos[p + 1] = v[2]; pos[p + 2] = v[1];
            col[p] = cl.r + (rng() - 0.5) * 0.035;
            col[p + 1] = cl.g + (rng() - 0.5) * 0.035;
            col[p + 2] = cl.b + (rng() - 0.5) * 0.035;
            p += 3;
            const uu = (v[0] + EXT) / (EXT * 2), vv = (v[1] + EXT) / (EXT * 2);
            uvs[up++] = uu; uvs[up++] = vv;
          }
        }
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    const gt = meadowTexture();      // blades, clover and soil; hue still from the vertex colours
    gt.repeat.set(TILES * 1.6, TILES * 1.6);
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, map: gt, bumpMap: gt, bumpScale: 1.6 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    this.scene.add(mesh);
    this.terrain = mesh;
  }

  /* -------------------------------------------------- distant mesas */
  buildDistantRidges() {
    // ---- the lowland: a huge rolling disc far below, seen through the pass
    const R0 = 95, R1 = 2600, RS = 40, AS = 112;
    const pos = [], col = [], idx = [];
    for (let i = 0; i <= RS; i++) {
      const rr = R0 * Math.pow(R1 / R0, i / RS);
      for (let j = 0; j < AS; j++) {
        const a = (j / AS) * TAU, x = Math.cos(a) * rr, z = Math.sin(a) * rr;
        const n = fbm(x * 0.004 + 50, z * 0.004, 4), n2 = fbm(x * 0.02, z * 0.02, 2);
        pos.push(x, LOWLAND_Y + (n - 0.5) * 80 * smoothstep(260, 900, rr) + (n2 - 0.5) * 5, z);
        _c1.setHex(0x46703a).lerp(_c2.setHex(0x27441f), clamp((n2 - 0.42) * 3, 0, 1));
        _c1.lerp(_c3.setHex(0x9aa465), clamp((n - 0.6) * 4, 0, 1) * 0.55);
        col.push(_c1.r, _c1.g, _c1.b);
      }
    }
    for (let i = 0; i < RS; i++) for (let j = 0; j < AS; j++) {
      const a = i * AS + j, b = i * AS + (j + 1) % AS, c = (i + 1) * AS + j, d = (i + 1) * AS + (j + 1) % AS;
      idx.push(a, b, c, b, d, c);
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    lg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    lg.setIndex(idx); lg.computeVertexNormals();
    const low = new THREE.Mesh(lg, new THREE.MeshLambertMaterial({ vertexColors: true }));
    low.frustumCulled = false;
    this.scene.add(low);

    const b = new Builder(), far = new Builder(), glow = new Builder();
    // ---- mountains ringing the world, snow on the tops
    for (let i = 0; i < 46; i++) {
      const a = (i / 46) * TAU + rnd(-0.06, 0.06), dist = 520 + rnd(0, 420);
      const x = Math.cos(a) * dist, z = Math.sin(a) * dist;
      const r0 = rnd(110, 240), h = rnd(240, 540), seg = 6 + Math.floor(rng() * 3), rot = rnd(0, TAU);
      b.add(new THREE.ConeGeometry(r0, h, seg, 1), pick([0x5d666c, 0x6b7378, 0x535b62]), { pos: [x, LOWLAND_Y - 10 + h / 2, z], rot: [0, rot, 0], jitter: 0.05 });
      const cap = rnd(0.3, 0.45);
      b.add(new THREE.ConeGeometry(r0 * cap * 1.04, h * cap, seg, 1), PAL.snow, { pos: [x, LOWLAND_Y - 10 + h - (h * cap) / 2 + 0.6, z], rot: [0, rot, 0], jitter: 0.03 });
    }
    // ---- forest across the lowland, in stands
    for (let k = 0; k < 2600 && far.pos.length < 0.55e6; k++) {     // capped: far trees are cheap only in number
      const a = rnd(0, TAU), rr = rnd(125, 760);
      const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
      if (fbm(x * 0.012 + 9, z * 0.012, 2) < 0.52) continue;
      const n = fbm(x * 0.004 + 50, z * 0.004, 4);
      pineInto(far, x, LOWLAND_Y + (n - 0.5) * 80 * smoothstep(260, 900, rr) - 0.5, z, rnd(2.6, 4.2));
    }
    // ---- a colossus far out in the lowland: a hooded warden over a sword, 140 m tall
    {
      const M = new THREE.Matrix4(), L = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
      const a = GAP_A + 0.14, d = 340, cx = Math.cos(a) * d, cz = Math.sin(a) * d, S = 7.4;
      M.compose(new THREE.Vector3(cx, LOWLAND_Y - 2, cz), q.setFromEuler(e.set(0, Math.atan2(-cx, -cz), 0)), new THREE.Vector3(S, S, S));
      const part = (bld, geo, c, p, r = [0, 0, 0], sc = [1, 1, 1]) => {
        L.compose(new THREE.Vector3(...p), q.setFromEuler(e.set(...r)), new THREE.Vector3(...sc));
        bld.add(geo, c, { matrix: new THREE.Matrix4().multiplyMatrices(M, L), jitter: 0.03 });
      };
      part(b, new THREE.BoxGeometry(9, 4, 9), PAL.ruinDark, [0, 2, 0]);
      part(b, new THREE.CylinderGeometry(1.9, 3.4, 8.5, 12), PAL.ruin, [0, 8.2, 0]);
      part(b, new THREE.CapsuleGeometry(1.9, 2.4, 4, 10), PAL.ruin, [0, 13.8, 0], [0, 0, 0], [1.25, 1, 0.9]);
      for (const sx of [-1, 1]) {
        part(b, new THREE.SphereGeometry(1.35, 10, 8), PAL.ruinLight, [sx * 2.3, 15.5, 0]);
        part(b, new THREE.CapsuleGeometry(0.75, 2.6, 4, 8), PAL.ruin, [sx * 2.0, 13.5, 1.0], [-0.5, 0, sx * 0.35]);
      }
      part(b, new THREE.SphereGeometry(1.6, 12, 10), PAL.ruinDark, [0, 17.7, -0.2], [0, 0, 0], [1, 1.12, 1]);
      part(b, new THREE.BoxGeometry(0.8, 11, 0.25), PAL.ruinLight, [0, 7.0, 2.4]);
      part(b, new THREE.BoxGeometry(3.8, 0.5, 0.5), PAL.ruinDark, [0, 12.6, 2.4]);
      for (const sx of [-1, 1]) part(glow, new THREE.SphereGeometry(0.2, 8, 6), PAL.rune, [sx * 0.42, 17.6, 1.35]);
    }
    // ---- a citadel on a far mesa
    {
      const a = GAP_A - 0.32, d = 560, cx = Math.cos(a) * d, cz = Math.sin(a) * d, top = LOWLAND_Y + 70;
      b.add(new THREE.CylinderGeometry(58, 80, 80, 9), 0x6c6a62, { pos: [cx, LOWLAND_Y + 30, cz], jitter: 0.05 });
      for (let k = 0; k < 7; k++) {
        const ta = (k / 7) * TAU, tr = k ? rnd(18, 40) : 0, tx = cx + Math.cos(ta) * tr, tz = cz + Math.sin(ta) * tr;
        const th = k ? rnd(40, 75) : 120, rad = k ? rnd(5, 8) : 11;
        b.add(new THREE.CylinderGeometry(rad * 0.9, rad, th, 10), PAL.ruin, { pos: [tx, top + th / 2, tz], jitter: 0.04 });
        b.add(new THREE.ConeGeometry(rad * 1.2, th * 0.4, 10), PAL.slate, { pos: [tx, top + th + th * 0.2, tz] });
        glow.add(new THREE.BoxGeometry(1.4, 2.6, 1.4), 0xffc070, { pos: [tx + rad * 0.9, top + th * 0.7, tz] });
      }
      b.add(new THREE.CylinderGeometry(46, 46, 14, 18, 1, true), PAL.ruinDark, { pos: [cx, top + 7, cz] });
    }
    const mesh = new THREE.Mesh(b.build(), new THREE.MeshLambertMaterial({ vertexColors: true }));
    mesh.frustumCulled = false;
    const farTrees = new THREE.Mesh(far.build(), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    farTrees.frustumCulled = false;
    const g = new THREE.Mesh(glow.build(), new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, fog: true }));
    this.scene.add(mesh, farTrees, g);

    // ---- a lake and its river at the foot of the pass, catching the sky
    const wm = new THREE.MeshLambertMaterial({ color: 0x6f9db4, transparent: true, opacity: 0.88 });
    const la = GAP_A + 0.05, lakeD = 215;
    const lake = new THREE.Mesh(new THREE.CircleGeometry(48, 40), wm);
    lake.rotation.x = -Math.PI / 2;
    lake.position.set(Math.cos(la) * lakeD, LOWLAND_Y + 0.6, Math.sin(la) * lakeD);
    lake.scale.set(1.6, 1, 1);
    this.scene.add(lake);
    const rv = new THREE.Mesh(new THREE.PlaneGeometry(9, lakeD - 120), wm);
    rv.rotation.set(-Math.PI / 2, 0, -la + Math.PI / 2);
    rv.position.set(Math.cos(la) * (lakeD + 120) / 2, LOWLAND_Y + 0.55, Math.sin(la) * (lakeD + 120) / 2);
    this.scene.add(rv);

    // ---- clouds: soft billboards drifting high over everything
    const cv = document.createElement('canvas'); cv.width = cv.height = 128;
    const cx2 = cv.getContext('2d');
    for (let k = 0; k < 14; k++) {
      const x = 30 + Math.random() * 68, y = 50 + Math.random() * 30, r = 16 + Math.random() * 22;
      const gr = cx2.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      cx2.fillStyle = gr; cx2.beginPath(); cx2.arc(x, y, r, 0, TAU); cx2.fill();
    }
    const ct = new THREE.CanvasTexture(cv); ct.colorSpace = THREE.SRGBColorSpace;
    this.clouds = [];
    for (let k = 0; k < 22; k++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: ct, color: 0xfff6ec, transparent: true, depthWrite: false, fog: false, opacity: rnd(0.55, 0.85) }));
      const a = rnd(0, TAU), d = rnd(320, 1100);
      sp.position.set(Math.cos(a) * d, rnd(150, 330), Math.sin(a) * d);
      const sc = rnd(260, 560); sp.scale.set(sc, sc * 0.45, 1);
      this.scene.add(sp);
      this.clouds.push({ sp, a, d, w: rnd(0.002, 0.005) });
    }
  }

  /* -------------------------------------------------- rocks */
  buildRocks() {
    const variants = [];
    for (let v = 0; v < 3; v++) {
      const g = new THREE.IcosahedronGeometry(1, 1).toNonIndexed();
      const pa = g.attributes.position;
      for (let i = 0; i < pa.count; i++) {
        const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i);
        const n = fbm(x * 1.7 + v * 9, z * 1.7 + y * 1.3, 3);
        const s = 0.72 + n * 0.75;
        pa.setXYZ(i, x * s, y * s * 0.72, z * s);
      }
      g.computeVertexNormals();
      variants.push(g);
    }
    const mat = new THREE.MeshLambertMaterial({ vertexColors: false, flatShading: true });

    const COUNT = this.quality === 'fast' ? 60 : 110;
    const dummy = new THREE.Object3D();
    const col = new THREE.Color();

    for (let v = 0; v < 3; v++) {
      const per = Math.floor(COUNT / 3);
      const mesh = new THREE.InstancedMesh(variants[v], mat.clone(), per);
      mesh.castShadow = true; mesh.receiveShadow = true;
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(per * 3), 3);
      let n = 0;
      let guard = 0;
      while (n < per && guard++ < per * 40) {
        const a = rnd(0, TAU);
        const r = Math.sqrt(rng()) * (ARENA_R - 8) + 6;
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        if (Math.hypot(x, z) < 14) continue;                       // keep the dais clear
        const s = rnd(0.7, 3.4) * (1 + smoothstep(40, 90, r) * 0.8);
        const hx = x, hz = z;
        if (terrainNormal(hx, hz, _v).y < 0.82) continue;   // no boulders on cliffs
        if (waterDist(hx, hz) < s) continue;                  // nor in the river
        if (trailDist(hx, hz) < s * 0.9 + 2.4) continue;     // nor across the forest trail
        const selfR = s * 0.55;
        // seat the boulder on the lowest ground it covers so it never floats
        let ground = terrainHeight(hx, hz);
        for (let a = 0; a < 6; a++) {
          const ang = (a / 6) * Math.PI * 2;
          ground = Math.min(ground, terrainHeight(hx + Math.cos(ang) * selfR, hz + Math.sin(ang) * selfR));
        }
        dummy.position.set(hx, ground - s * 0.10, hz);
        dummy.rotation.set(rnd(-0.2, 0.2), rnd(0, TAU), rnd(-0.2, 0.2));
        dummy.scale.set(s * rnd(0.85, 1.5), s * rnd(0.6, 1.05), s * rnd(0.85, 1.5));
        dummy.updateMatrix();
        mesh.setMatrixAt(n, dummy.matrix);
        col.setHex(pick([0x7d8284, 0x6c7274, 0x8e8f8a, 0x66705c])).offsetHSL(0, 0, rnd(-0.05, 0.05));
        mesh.setColorAt(n, col);
        if (s > 1.5) this.obstacles.push({ x, z, r: s * 0.75, h: s * 0.7 });
        n++;
      }
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      this.scene.add(mesh);
    }
  }

  /* -------------------------------------------------- ruins */
  buildRuins() {
    const b = new Builder();
    const pillar = (x, z, h, r, tilt = 0) => {
      const y0 = terrainHeight(x, z);
      const segs = 6;
      const leanDir = rnd(0, TAU);
      const lean = tilt;
      for (let s = 0; s < segs; s++) {
        const t0 = s / segs, t1 = (s + 1) / segs;
        const tm = (t0 + t1) * 0.5;
        // centre each segment on the lean line so the stack stays continuous
        const off = Math.sin(lean * tm) * h * tm;
        const ox = Math.cos(leanDir) * off, oz = Math.sin(leanDir) * off;
        const sh = h / segs;
        const g = new THREE.CylinderGeometry(r * (1 - s * 0.03), r * (1.04 - s * 0.03), sh * 1.02, 8, 1);
        b.add(g, pick([PAL.ruin, PAL.ruinDark, PAL.ruinLight]), {
          pos: [x + ox, y0 + Math.cos(lean * tm) * h * tm + sh * 0.5, z + oz],
          rot: [lean * Math.cos(leanDir) * tm, rnd(0, TAU), lean * Math.sin(leanDir) * tm],
          jitter: 0.05
        });
      }
      // broken cap, seated on the real top of the leaning stack
      if (rng() > 0.4) {
        const off = Math.sin(lean) * h;
        b.add(new THREE.BoxGeometry(r * 2.5, r * 0.55, r * 2.5), PAL.ruinDark, {
          pos: [x + Math.cos(leanDir) * off, y0 + Math.cos(lean) * h + r * 0.12, z + Math.sin(leanDir) * off],
          rot: [lean * Math.cos(leanDir), rnd(0, TAU), lean * Math.sin(leanDir)], jitter: 0.06
        });
      }
      this.obstacles.push({ x, z, r: r * 1.05, h });
    };

    const wall = (x, z, len, h, rotY) => {
      const y0 = terrainHeight(x, z);
      const n = Math.max(2, Math.floor(len / 3.2));
      for (let i = 0; i < n; i++) {
        const t = (i / (n - 1) - 0.5) * len;
        const wx = x + Math.cos(rotY) * t, wz = z + Math.sin(rotY) * t;
        const hh = h * rnd(0.55, 1.0);
        b.add(new THREE.BoxGeometry(3.1, hh, 0.85), pick([PAL.ruin, PAL.ruinDark, PAL.ruinLight]), {
          pos: [wx, terrainHeight(wx, wz) + hh / 2 - 0.45, wz],
          rot: [0, rotY, 0], jitter: 0.055
        });
        this.obstacles.push({ x: wx, z: wz, r: 1.5, h: hh - 0.45 });
      }
    };

    // --- central dais
    const daisY = terrainHeight(0, 0);
    // the dais is solid: without this the player could stand inside it
    this.obstacles.push({ x: 0, z: 0, r: 9.3, h: 1.4 });
    for (let ring = 0; ring < 3; ring++) {
      const rr = 9 - ring * 1.9;
      b.add(new THREE.CylinderGeometry(rr, rr + 0.5, 0.55, 22, 1, true), ring === 0 ? PAL.ruinDark : PAL.ruin, {
        pos: [0, daisY + 0.1 + ring * 0.34, 0], jitter: 0.05
      });
      b.add(new THREE.CylinderGeometry(rr - 0.4, rr - 0.4, 0.6, 22, 1, false), PAL.ruinDark, {
        pos: [0, daisY + 0.42 + ring * 0.34, 0], jitter: 0.04
      });
    }

    // four great pillars around the dais
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + Math.PI / 4;
      pillar(Math.cos(a) * 12.5, Math.sin(a) * 12.5, rnd(9, 14), 1.15, rnd(-0.05, 0.05));
    }

    // outer ruin clusters
    for (let i = 0; i < 16; i++) {
      const a = rnd(0, TAU);
      const r = rnd(26, ARENA_R - 10);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (trailDist(x, z) < 7) continue;                     // ruins stand back from the trail
      const kind = rng();
      if (kind < 0.4) {
        wall(x, z, rnd(9, 22), rnd(3.5, 7), a + Math.PI / 2 + rnd(-0.4, 0.4));
      } else if (kind < 0.75) {
        const n = 2 + Math.floor(rng() * 3);
        for (let k = 0; k < n; k++) pillar(x + rnd(-4, 4), z + rnd(-4, 4), rnd(4, 11), rnd(0.6, 1.2), rnd(-0.12, 0.12));
      } else {
        // stair block
        const y0 = terrainHeight(x, z);
        for (let s = 0; s < 4; s++) {
          b.add(new THREE.BoxGeometry(6 - s * 1.1, 0.65, 4 - s * 0.7), PAL.ruinDark, {
            pos: [x, y0 + 0.3 + s * 0.62, z], rot: [0, a, 0], jitter: 0.05
          });
        }
        this.obstacles.push({ x, z, r: 3, h: 2.6 });
      }
    }

    // standing rune-stones: tall slabs with carved, faintly glowing runes
    const glow = new Builder();
    for (let i = 0; i < 9; i++) {
      const a = rnd(0, TAU), r = rnd(20, ARENA_R - 16);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (waterDist(x, z) < 3 || !this.isClear(x, z, 2) || trailDist(x, z) < 4) continue;
      const y0 = terrainHeight(x, z), rot = rnd(0, TAU), hh = rnd(3.2, 5.4);
      b.add(new THREE.BoxGeometry(1.5, hh, 0.55), pick([PAL.ruinDark, PAL.rockDark]), {
        pos: [x, y0 + hh / 2 - 0.3, z], rot: [rnd(-0.05, 0.05), rot, rnd(-0.06, 0.06)], jitter: 0.05
      });
      for (let k = 0; k < 4; k++) {
        const yy = y0 + 0.9 + k * (hh - 1.4) / 3.2;
        glow.add(new THREE.BoxGeometry(0.62 - (k % 2) * 0.22, 0.09, 0.6), PAL.rune, {
          pos: [x, yy, z], rot: [0, rot, (k % 2 ? 0.5 : -0.3)]
        });
      }
      this.obstacles.push({ x, z, r: 0.95, h: hh });
    }
    // the overlook: a parapet along the brink of the pass
    {
      const R = 94.6, a0 = GAP_A - 0.36, a1 = GAP_A + 0.36, n = 26;
      let prev = null;
      for (let k = 0; k <= n; k++) {
        const a = a0 + (a1 - a0) * (k / n), x = Math.cos(a) * R, z = Math.sin(a) * R, y = terrainHeight(x, z);
        b.add(new THREE.BoxGeometry(0.45, 1.15, 0.45), PAL.ruinDark, { pos: [x, y + 0.5, z], rot: [0, -a, 0], jitter: 0.04 });
        if (prev) {
          const mx = (x + prev[0]) / 2, mz = (z + prev[1]) / 2, my = (y + prev[2]) / 2;
          b.add(new THREE.BoxGeometry(0.42, 0.22, Math.hypot(x - prev[0], z - prev[1]) + 0.2), PAL.ruinLight, { pos: [mx, my + 1.12, mz], rot: [0, Math.atan2(x - prev[0], z - prev[1]), 0], jitter: 0.04 });
        }
        prev = [x, z, y];
      }
    }

    // rune bands round the four great pillars
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + Math.PI / 4;
      const x = Math.cos(a) * 12.5, z = Math.sin(a) * 12.5, y0 = terrainHeight(x, z);
      for (const yy of [2.2, 5.6]) {
        glow.add(new THREE.TorusGeometry(1.2, 0.05, 4, 20), PAL.rune, { pos: [x, y0 + yy, z], rot: [Math.PI / 2, 0, 0] });
      }
    }
    const runeMesh = new THREE.Mesh(glow.build(), new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, fog: true }));
    this.scene.add(runeMesh);
    this.runes = runeMesh;

    const geo = b.buildUV(0.4);
    const mesh = new THREE.Mesh(geo, stoneMat());
    mesh.castShadow = true; mesh.receiveShadow = true;
    this.scene.add(mesh);
  }

  /* -------------------------------------------------- mid-field
     The band between the player and the hills used to be bare ground, which read
     as a diorama. These props give the eye something to travel across, and the
     big ones double as cover. Everything merges into one mesh. */
  buildMidfield() {
    const b = new Builder();   // big props: cast shadows
    const small = new Builder(); // debris: shadow pass stays cheap
    const sand = [PAL.sandLight, PAL.sandPale, PAL.sandCool];
    const stone = [PAL.ruin, PAL.ruinDark, PAL.ruinLight];
    const bone = 0xd9ccb3;

    const spot = (minR, maxR, pad) => {
      for (let k = 0; k < 40; k++) {
        const a = rnd(0, TAU), d = minR + rnd(0, maxR - minR);
        const x = Math.cos(a) * d, z = Math.sin(a) * d;
        if (this.isClear(x, z, pad) && trailDist(x, z) > pad + 1.8) return [x, z];
      }
      return null;
    };

    // ---- dune ridges are part of the height field now (see core.js), so the
    //      floor undulates without any prop the player can stand inside.

    // ---- broken wall stubs: cover with a silhouette
    for (let i = 0; i < 9; i++) {
      const s = spot(12, 46, 3.6);
      if (!s) continue;
      const rotY = rnd(0, TAU), n = 2 + Math.floor(rnd(0, 3.99));
      for (let k = 0; k < n; k++) {
        const t = (k - (n - 1) / 2) * 2.5;
        const wx = s[0] + Math.cos(rotY) * t, wz = s[1] + Math.sin(rotY) * t;
        const hh = rnd(0.7, 2.1);
        b.add(new THREE.BoxGeometry(2.4, hh, 0.8), pick(stone), {
          pos: [wx, terrainHeight(wx, wz) + hh / 2 - 0.32, wz],
          rot: [0, rotY, 0], jitter: 0.05
        });
        this.obstacles.push({ x: wx, z: wz, r: 1.2 });
      }
    }

    // ---- dead trunks
    for (let i = 0; i < 10; i++) {
      const s = spot(12, 44, 2.6);
      if (!s) continue;
      continue;   // young trees now come from the forest system (buildForest)
      this.obstacles.push({ x: s[0], z: s[1], r: 0.55 });
    }

    // ---- fallen columns
    for (let i = 0; i < 7; i++) {
      const s = spot(12, 42, 3.2);
      if (!s) continue;
      const rotY = rnd(0, TAU), segsN = 3 + Math.floor(rnd(0, 2.99));
      for (let k = 0; k < segsN; k++) {
        const t = (k - (segsN - 1) / 2) * 1.9;
        const wx = s[0] + Math.cos(rotY) * t, wz = s[1] + Math.sin(rotY) * t;
        b.add(new THREE.CylinderGeometry(0.62, 0.66, 1.85, 7), pick(stone), {
          pos: [wx, terrainHeight(wx, wz) + 0.46, wz],
          rot: [Math.PI / 2, rotY, 0], jitter: 0.05
        });
        this.obstacles.push({ x: wx, z: wz, r: 0.8 });
      }
    }

    // ---- rock clusters
    for (let i = 0; i < 14; i++) {
      const s = spot(11, 50, 2.2);
      if (!s) continue;
      const n = 3 + Math.floor(rnd(0, 3.99));
      for (let k = 0; k < n; k++) {
        const a = rnd(0, TAU), d = rnd(0, 1.9), sz = rnd(0.3, 0.95);
        const wx = s[0] + Math.cos(a) * d, wz = s[1] + Math.sin(a) * d;
        b.add(new THREE.DodecahedronGeometry(sz, 0), pick([PAL.rock, PAL.rockDark, 0x8a5a3a]), {
          pos: [wx, terrainHeight(wx, wz) + sz * 0.32, wz],
          rot: [rnd(0, TAU), rnd(0, TAU), rnd(0, TAU)], jitter: 0.06
        });
      }
      this.obstacles.push({ x: s[0], z: s[1], r: 1.0 });
    }

    // ---- near-field debris: small stones are how the eye judges distance
    for (let i = 0; i < 520; i++) {
      const a = rnd(0, TAU), d = 3.5 + rnd(0, 31);
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (!this.isClear(x, z, 0.35)) continue;
      const sz = rnd(0.1, 0.33);
      small.add(new THREE.DodecahedronGeometry(sz, 0), pick([PAL.rock, PAL.rockDark, 0x8a8d84]), {
        pos: [x, terrainHeight(x, z) + sz * 0.28, z],
        rot: [rnd(0, TAU), rnd(0, TAU), rnd(0, TAU)], jitter: 0.06
      });
    }

    // ---- broken slabs, half buried
    for (let i = 0; i < 8; i++) {
      const s = spot(12, 44, 2.6);
      if (!s) continue;
      small.add(new THREE.BoxGeometry(rnd(1.4, 3.4), rnd(0.18, 0.34), rnd(1.0, 2.4)), pick(stone), {
        pos: [s[0], terrainHeight(s[0], s[1]) + 0.06, s[1]],
        rot: [rnd(-0.12, 0.12), rnd(0, TAU), rnd(-0.12, 0.12)], jitter: 0.05
      });
    }

    const mat = stoneMat();
    const mesh = new THREE.Mesh(b.buildUV(0.4), mat);
    mesh.receiveShadow = true;
    // without a cast shadow these props read as stickers on the sand
    mesh.castShadow = true;
    mesh.frustumCulled = false;
    this.scene.add(mesh);

    const deb = new THREE.Mesh(small.buildUV(0.4), mat);
    deb.receiveShadow = true;
    deb.castShadow = false;
    deb.frustumCulled = false;
    this.scene.add(deb);
  }

  /* -------------------------------------------------- ornaments
     Things that make it look inhabited rather than abstract: fire, cloth, and
     figures watching you. */
  buildOrnaments() {
    const b = new Builder();
    this.flames = [];
    this.banners = [];

    const brazier = (x, z, withLight) => {
      const y0 = terrainHeight(x, z);
      b.add(new THREE.CylinderGeometry(0.26, 0.44, 1.0, 6), PAL.ruinDark, { pos: [x, y0 + 0.5, z], jitter: 0.05 });
      b.add(new THREE.CylinderGeometry(0.64, 0.32, 0.32, 8), PAL.metalRust, { pos: [x, y0 + 1.16, z], jitter: 0.05 });
      b.add(new THREE.CylinderGeometry(0.52, 0.52, 0.06, 8), 0x241710, { pos: [x, y0 + 1.31, z] });
      const mat = new THREE.SpriteMaterial({
        map: radialSprite('rgba(255,226,150,1)', 'rgba(255,80,10,0)', 64),
        blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.95
      });
      const sp = new THREE.Sprite(mat);
      sp.position.set(x, y0 + 1.6, z);
      sp.scale.set(1.5, 2.2, 1);
      this.scene.add(sp);
      const f = { sp, base: y0 + 1.6, seed: rng() * 10 };
      if (withLight) {
        const L = new THREE.PointLight(0xff8b3a, 2.6, 18, 2);
        L.position.set(x, y0 + 1.8, z);
        this.scene.add(L);
        f.light = L;
      }
      this.flames.push(f);
      this.obstacles.push({ x, z, r: 0.7 });
    };

    // a ring of fire around the monument, and two out at the arch
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + 0.4;
      brazier(Math.cos(a) * 11.5, Math.sin(a) * 11.5, i < 2);
    }
    brazier(-36.9 + 4.5, -59.2 - 3.2, true);
    brazier(-71.1 - 3.5, -34.8 + 2.5, false);

    // ---- banners hanging from the inner arch
    const cloth = new THREE.MeshLambertMaterial({ map: clothTexture(), side: THREE.DoubleSide });
    const banner = (x, z, yTop, rotY, w = 1.7, h = 3.4) => {
      const g = new THREE.PlaneGeometry(w, h, 1, 3);
      const m = new THREE.Mesh(g, cloth);
      m.position.set(x, yTop - h / 2, z);
      m.rotation.y = rotY;
      this.scene.add(m);
      this.banners.push({ m, seed: rng() * 10, rotY });
    };
    // two on each inner leg of the close arch
    for (const [lx, lz] of [[-36.9, -59.2], [-71.1, -34.8]]) {
      const dy = terrainHeight(lx, lz);
      banner(lx + 3.0, lz + 3.0, dy + 8.5, Math.atan2(-3.0, -3.0));
      banner(lx - 2.6, lz - 2.6, dy + 15.5, Math.atan2(2.6, 2.6), 1.4, 4.2);
    }

    // ---- carved relief band along the arch legs: small blocks breaking the face
    for (const [lx, lz] of [[-36.9, -59.2], [-71.1, -34.8]]) {
      const dy = terrainHeight(lx, lz);
      for (let k = 0; k < 7; k++) {
        const yy = dy + 4 + k * 2.4;
        const out = 4.2;
        b.add(new THREE.BoxGeometry(1.5, 1.1, 0.7), PAL.ruinLight, {
          pos: [lx + Math.cos(0.62) * out, yy, lz - Math.sin(0.62) * out],
          rot: [0, 0.62, 0], jitter: 0.07
        });
      }
    }

    // ---- guardian figures flanking the monument steps
    const guardian = (x, z, rotY) => {
      const y0 = terrainHeight(x, z);
      b.add(new THREE.BoxGeometry(1.5, 0.5, 1.5), PAL.ruinDark, { pos: [x, y0 + 0.25, z], rot: [0, rotY, 0] });
      b.add(new THREE.BoxGeometry(0.95, 2.1, 0.7), PAL.ruin, { pos: [x, y0 + 1.55, z], rot: [0, rotY, 0], jitter: 0.05 });
      b.add(new THREE.BoxGeometry(0.72, 0.78, 0.66), PAL.ruinLight, { pos: [x, y0 + 3.0, z], rot: [0, rotY, 0], jitter: 0.05 });
      // helmet crest and spear
      b.add(new THREE.BoxGeometry(0.26, 0.34, 0.9), PAL.metalRust, { pos: [x, y0 + 3.5, z], rot: [0, rotY, 0] });
      b.add(new THREE.CylinderGeometry(0.09, 0.09, 4.6, 5), PAL.metal, {
        pos: [x + Math.cos(rotY + 1.4) * 0.75, y0 + 2.4, z + Math.sin(rotY + 1.4) * 0.75], jitter: 0.04
      });
      this.obstacles.push({ x, z, r: 0.85 });
    };
    guardian(-8.4, 8.4, Math.atan2(-1, 1));
    guardian(8.4, -8.4, Math.atan2(1, -1));

    const mesh = new THREE.Mesh(b.buildUV(0.45), stoneMat());
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    this.scene.add(mesh);
  }

  /* -------------------------------------------------- horizon landmarks
     Big silhouettes do more for a sense of scale than any amount of detail on
     things you can reach. Everything here sits on the outer plain at y = 9. */
  buildLandmarks() {
    const b = new Builder();
    const PLAIN_Y = 9;

    // ---- a colossal arch
    const arch = (cx, cz, rot, h, w, solid = false) => {
      const bw = w * 0.34;
      for (const s of [-1, 1]) {
        // a Y rotation maps local +X to (cosθ, -sinθ), so the legs must match that
        const lx = cx + Math.cos(rot) * s * w, lz = cz - Math.sin(rot) * s * w;
        const gy = solid ? terrainHeight(lx, lz) : PLAIN_Y;
        b.add(new THREE.BoxGeometry(bw, h, bw * 1.5), PAL.ruinDark, {
          pos: [lx, gy + h / 2, lz], rot: [0, rot, 0], jitter: 0.05
        });
        b.add(new THREE.BoxGeometry(bw * 1.7, h * 0.12, bw * 2.1), PAL.ruinDark, {
          pos: [lx, gy + h * 0.06, lz], rot: [0, rot, 0], jitter: 0.05
        });
        if (solid) this.obstacles.push({ x: lx, z: lz, r: bw * 0.95, h });
      }
      const baseY = solid ? terrainHeight(cx, cz) : PLAIN_Y;
      // the span: a half torus is continuous, where a chain of boxes left gaps
      b.add(new THREE.TorusGeometry(w, bw * 0.63, 6, 16, Math.PI), PAL.ruin, {
        pos: [cx, baseY + h, cz], rot: [0, rot, 0], jitter: 0.05
      });
    };
    // one arch stands inside the bowl so it is planted, lit and unmistakably close
    arch(-54, -47, 0.62, 24, 21, true);
    arch(142, -96, 0.55, 40, 30);
    arch(118, 62, -1.1, 30, 22);

    // ---- a half-buried colossus
    const statue = (cx, cz, rot, scale) => {
      const H = 34 * scale;
      b.add(new THREE.BoxGeometry(16 * scale, H * 0.62, 11 * scale), PAL.ruinDark, {
        pos: [cx, PLAIN_Y + H * 0.31, cz], rot: [0, rot, 0], jitter: 0.06
      });
      b.add(new THREE.BoxGeometry(10 * scale, 9 * scale, 9 * scale), PAL.ruin, {
        pos: [cx, PLAIN_Y + H * 0.72, cz], rot: [0, rot, 0], jitter: 0.06
      });
      // brow and nose so it reads as a face
      b.add(new THREE.BoxGeometry(9 * scale, 1.6 * scale, 2.4 * scale), PAL.ruinDark, {
        pos: [cx + Math.cos(rot) * 4.7 * scale, PLAIN_Y + H * 0.76, cz + Math.sin(rot) * 4.7 * scale], rot: [0, rot, 0]
      });
      b.add(new THREE.BoxGeometry(2.2 * scale, 3.4 * scale, 2.2 * scale), PAL.ruin, {
        pos: [cx + Math.cos(rot) * 5.0 * scale, PLAIN_Y + H * 0.70, cz + Math.sin(rot) * 5.0 * scale], rot: [0, rot, 0]
      });
      // one arm breaking out of the sand
      b.add(new THREE.BoxGeometry(5 * scale, H * 0.5, 5 * scale), PAL.ruin, {
        pos: [cx + Math.cos(rot + 1.2) * 11 * scale, PLAIN_Y + H * 0.2, cz + Math.sin(rot + 1.2) * 11 * scale],
        rot: [0, rot, 0.35], jitter: 0.05
      });
    };
    statue(66, -150, 1.9, 2.1);
    statue(-150, 44, -0.4, 1.7);

    // ---- spires on the skyline
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU + rnd(-0.2, 0.2);
      const d = rnd(126, 268);
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      const h = rnd(46, 112);
      b.add(new THREE.CylinderGeometry(rnd(2, 5), rnd(7, 13), h, 5), PAL.rockDark, {
        pos: [x, PLAIN_Y + h / 2, z], rot: [rnd(-0.04, 0.04), rnd(0, TAU), rnd(-0.04, 0.04)], jitter: 0.05
      });
    }

    const mesh = new THREE.Mesh(b.buildUV(0.35), stoneMat());
    mesh.name = 'landmarks';
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false;
    this.scene.add(mesh);
  }

  /* -------------------------------------------------- vegetation */
  buildVegetation() {
    // ---- grass tufts (instanced crossed quads, wind sway)
    const quad = (() => {
      const g1 = new THREE.PlaneGeometry(1, 1, 1, 1);
      g1.translate(0, 0.5, 0);
      const g2 = g1.clone(); g2.rotateY(Math.PI / 2);
      const g3 = g1.clone(); g3.rotateY(Math.PI / 4);
      const merged = mergeSimple([g1, g2, g3]);
      return merged;
    })();

    const tex = grassTexture();
    const mat = new THREE.MeshLambertMaterial({
      map: tex, transparent: true, alphaTest: 0.42, side: THREE.DoubleSide,
      depthWrite: true, color: 0xffffff
    });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.time;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader;
      sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', `
        #include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 iPos = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
        #else
          vec3 iPos = vec3(0.0);
        #endif
        float sway = sin(uTime * 1.5 + iPos.x * 0.55 + iPos.z * 0.35);
        float sway2 = cos(uTime * 1.05 + iPos.z * 0.45);
        transformed.x += sway * 0.14 * transformed.y;
        transformed.z += sway2 * 0.09 * transformed.y;
      `);
    };

    const COUNT = this.quality === 'fast' ? 1100 : this.quality === 'high' ? 3600 : 2600;
    const grass = new THREE.InstancedMesh(quad, mat, COUNT);
    const d = new THREE.Object3D();
    const col = new THREE.Color();
    grass.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(COUNT * 3), 3);
    let n = 0, guard = 0;
    while (n < COUNT && guard++ < COUNT * 8) {
      const a = rnd(0, TAU), r = Math.sqrt(rng()) * (ARENA_R - 4);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const h = terrainHeight(x, z);
      const nrm = terrainNormal(x, z, _v);
      if (nrm.y < 0.84) continue;               // no grass on cliffs
      if (waterDist(x, z) < 0.6) continue;      // nor in the water
      if (trailDist(x, z) < 1.3) continue;      // nor on the trail
      if (Math.hypot(x, z) < 15 && Math.hypot(x, z) > 9) continue; // the trodden ring
      if (fbm(x * 0.05, z * 0.05, 2) < 0.3) continue; // clumping
      const s = rnd(0.45, 1.05);
      d.position.set(x, h - 0.05, z);
      d.rotation.set(0, rnd(0, TAU), 0);
      d.scale.set(s * rnd(0.8, 1.2), s * rnd(0.75, 1.5), s);
      d.updateMatrix();
      grass.setMatrixAt(n, d.matrix);
      // greens, with the odd tuft of late-summer gold and a few flower heads
      const f = rng();
      if (f < 0.05) col.setHSL(pick([0.75, 0.13, 0.0, 0.58]), 0.55, 0.62);
      else if (f < 0.18) col.setHSL(rnd(0.12, 0.16), rnd(0.4, 0.55), rnd(0.42, 0.55));
      else col.setHSL(rnd(0.22, 0.31), rnd(0.38, 0.6), rnd(0.28, 0.44));
      grass.setColorAt(n, col);
      n++;
    }
    grass.count = n;
    grass.instanceMatrix.needsUpdate = true;
    grass.instanceColor.needsUpdate = true;
    grass.receiveShadow = false;
    this.scene.add(grass);

    // ---- shrubs
    const shrubGeo = (() => {
      const g = new THREE.IcosahedronGeometry(1, 1).toNonIndexed();
      const pa = g.attributes.position;
      for (let i = 0; i < pa.count; i++) {
        const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i);
        const s = 0.75 + fbm(x * 2.1, z * 2.1 + y, 2) * 0.6;
        pa.setXYZ(i, x * s, Math.max(-0.15, y * s * 0.7), z * s);
      }
      g.computeVertexNormals();
      return g;
    })();
    const SHRUBS = this.quality === 'fast' ? 70 : 150;
    const shrubs = new THREE.InstancedMesh(shrubGeo,
      new THREE.MeshLambertMaterial({ flatShading: true }), SHRUBS);
    shrubs.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(SHRUBS * 3), 3);
    shrubs.castShadow = true;
    let sn = 0; guard = 0;
    while (sn < SHRUBS && guard++ < SHRUBS * 10) {
      const a = rnd(0, TAU), r = Math.sqrt(rng()) * (ARENA_R - 6) + 4;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (Math.hypot(x, z) < 15 || waterDist(x, z) < 1.5 || trailDist(x, z) < 2.5) continue;
      const s = rnd(0.6, 1.5);
      d.position.set(x, terrainHeight(x, z) - s * 0.12, z);
      d.rotation.set(rnd(-0.1, 0.1), rnd(0, TAU), rnd(-0.1, 0.1));
      d.scale.set(s, s * rnd(0.78, 1.15), s);
      d.updateMatrix();
      shrubs.setMatrixAt(sn, d.matrix);
      col.setHex(pick([PAL.scrub, PAL.scrubDry, 0x3d6a2c, 0x56803a])).offsetHSL(0, 0, rnd(-0.04, 0.04));
      shrubs.setColorAt(sn, col);
      sn++;
    }
    shrubs.count = sn;
    shrubs.instanceMatrix.needsUpdate = true;
    shrubs.instanceColor.needsUpdate = true;
    this.scene.add(shrubs);

    // ---- pine forest: scattered stands in the valley, thick on the rim slopes,
    //      and a forest ring on the plain outside (no shadows out there)
    const b = new Builder(), far = new Builder();
    let placed = 0;
    for (let k = 0; k < 900 && placed < 150; k++) {
      const a = rnd(0, TAU), r = rnd(20, ARENA_R + 6);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      // stands, not a lawn of single trees
      if (fbm(x * 0.03 + 40, z * 0.03, 2) < (r > 66 ? 0.42 : 0.55)) continue;
      if (waterDist(x, z) < 2.5 || terrainNormal(x, z, _v).y < 0.7 || !this.isClear(x, z, 1.4)) continue;
      if (gapAmount(x, z) > 0.2 && r > 74) continue;           // keep the view through the pass open
      (this.firSpots || (this.firSpots = [])).push([x, terrainHeight(x, z), z, rnd(0.8, 1.3)]);
      if (r < ARENA_R) this.obstacles.push({ x, z, r: 0.55, h: 8 });
      placed++;
    }
    for (let k = 0; k < 320; k++) {
      const a = rnd(0, TAU), r = rnd(106, 175);
      pineInto(far, Math.cos(a) * r, 9, Math.sin(a) * r, rnd(1.2, 2.2));
    }
    const pineMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, map: needleTexture() });
    const trees = new THREE.Mesh(b.buildUV(1.3), pineMat);
    trees.castShadow = true; trees.receiveShadow = true;
    this.scene.add(trees);
    const farTrees = new THREE.Mesh(far.buildUV(1.3), pineMat);
    farTrees.frustumCulled = false;
    this.scene.add(farTrees);
  }

  /* -------------------------------------------------- ground scatter */
  buildGroundDetail() {
    const COUNT = this.quality === 'fast' ? 260 : 620;
    const geo = new THREE.IcosahedronGeometry(1, 0);
    const mat = new THREE.MeshLambertMaterial({ flatShading: true });
    const mesh = new THREE.InstancedMesh(geo, mat, COUNT);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(COUNT * 3), 3);
    mesh.receiveShadow = true;
    const d = new THREE.Object3D();
    const col = new THREE.Color();
    let n = 0, guard = 0;
    while (n < COUNT && guard++ < COUNT * 6) {
      const a = rnd(0, TAU), r = Math.sqrt(rng()) * (ARENA_R - 2);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (terrainNormal(x, z, _v).y < 0.9) continue;
      const s = rnd(0.06, 0.32);
      d.position.set(x, terrainHeight(x, z) - s * 0.25, z);
      d.rotation.set(rnd(0, TAU), rnd(0, TAU), rnd(0, TAU));
      d.scale.set(s * rnd(0.8, 1.5), s * rnd(0.5, 1.0), s * rnd(0.8, 1.5));
      d.updateMatrix();
      mesh.setMatrixAt(n, d.matrix);
      col.setHex(pick([0x7d8284, 0x6a6f6c, 0x8f8c80, 0x5d6650])).offsetHSL(0, 0, rnd(-0.05, 0.06));
      mesh.setColorAt(n, col);
      n++;
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    this.scene.add(mesh);
  }

  /* -------------------------------------------------- dust motes */
  buildDust() {
    const N = this.quality === 'fast' ? 240 : 520;
    const pos = new Float32Array(N * 3);
    this.dustData = [];
    for (let i = 0; i < N; i++) {
      const a = rnd(0, TAU), r = Math.sqrt(rng()) * 55;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      pos[i * 3] = x;
      pos[i * 3 + 1] = terrainHeight(x, z) + rnd(0.4, 14);
      pos[i * 3 + 2] = z;
      this.dustData.push({ vy: rnd(-0.05, 0.05), ph: rnd(0, TAU), sp: rnd(0.4, 1.3) });
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    // spirit motes: faint glowing seeds drifting over the valley
    const m = new THREE.PointsMaterial({
      size: 0.13, map: radialSprite('rgba(255,255,255,1)', 'rgba(140,240,255,0)', 32), transparent: true, opacity: 0.75,
      depthWrite: false, blending: THREE.AdditiveBlending, color: 0xc9f6ff, sizeAttenuation: true
    });
    const pts = new THREE.Points(g, m);
    pts.frustumCulled = false;
    this.scene.add(pts);
    this.dust = pts;
  }

  /* -------------------------------------------------- watchtowers
     Round stone towers with slate roofs and lit windows: three inside the valley
     on the rim slopes, three more on the horizon for scale. */
  buildTowers() {
    const b = new Builder(), roof = new Builder(), lit = new Builder();
    const tower = (x, z, H, R, inside) => {
      let y0 = terrainHeight(x, z);
      for (let a = 0; a < 8; a++) y0 = Math.min(y0, terrainHeight(x + Math.cos(a) * R, z + Math.sin(a) * R));
      y0 -= 0.6;
      b.add(new THREE.CylinderGeometry(R * 1.2, R * 1.32, 2.2, 16), PAL.ruinDark, { pos: [x, y0 + 1.1, z], jitter: 0.04 });
      b.add(new THREE.CylinderGeometry(R * 0.9, R, H, 16), PAL.ruin, { pos: [x, y0 + 2.2 + H / 2, z], jitter: 0.05 });
      for (const f of [0.42, 1.0]) b.add(new THREE.CylinderGeometry(R * (1.12 - f * 0.1), R * (1.06 - f * 0.1), 0.7, 16), PAL.ruinDark, { pos: [x, y0 + 2.2 + H * f, z], jitter: 0.04 });
      const top = y0 + 2.2 + H, Rt = R * 1.02;
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * TAU;
        b.add(new THREE.BoxGeometry(R * 0.38, 1.1, 0.6), PAL.ruinLight, { pos: [x + Math.cos(a) * Rt, top + 0.9, z + Math.sin(a) * Rt], rot: [0, -a, 0], jitter: 0.05 });
      }
      roof.add(new THREE.ConeGeometry(R * 1.12, H * 0.55, 16), PAL.slate, { pos: [x, top + 0.35 + H * 0.275, z], jitter: 0.03 });
      roof.add(new THREE.CylinderGeometry(0.08, 0.12, 3.2, 6), PAL.metalRust, { pos: [x, top + 0.35 + H * 0.55 + 1.4, z] });
      // windows: dark frames, warm light inside, spiralling up the tower
      for (let k = 0; k < 6; k++) {
        const a = k * 2.1, yy = y0 + 4 + k * (H - 6) / 5;
        const wx = x + Math.cos(a) * (R * 0.93), wz = z + Math.sin(a) * (R * 0.93);
        b.add(new THREE.BoxGeometry(0.9, 1.7, 0.5), 0x2a2622, { pos: [wx, yy, wz], rot: [0, -a + Math.PI / 2, 0] });
        lit.add(new THREE.BoxGeometry(0.55, 1.25, 0.56), 0xffc070, { pos: [wx, yy, wz], rot: [0, -a + Math.PI / 2, 0] });
      }
      // door facing the valley
      const ad = Math.atan2(-z, -x);
      b.add(new THREE.BoxGeometry(1.8, 3.0, 0.6), 0x3b2a1c, { pos: [x + Math.cos(ad) * R * 1.02, y0 + 2.2 + 1.5, z + Math.sin(ad) * R * 1.02], rot: [0, -ad + Math.PI / 2, 0] });
      if (inside) this.obstacles.push({ x, z, r: R * 1.32, h: H + 2 });
    };
    for (const a of [1.15, 0.25, -1.45]) tower(Math.cos(a) * 76, Math.sin(a) * 76, rnd(15, 19), 3.4, true);
    for (const [a, d] of [[2.0, 190], [-0.7, 230], [3.5, 210]]) tower(Math.cos(a) * d, Math.sin(a) * d, rnd(34, 46), 7, false);

    const m1 = new THREE.Mesh(b.buildUV(0.45), stoneMat());
    m1.castShadow = true; m1.receiveShadow = true; m1.frustumCulled = false;
    const m2 = new THREE.Mesh(roof.build(), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    m2.castShadow = true; m2.frustumCulled = false;
    const m3 = new THREE.Mesh(lit.build(), new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, fog: true }));
    m3.frustumCulled = false;
    this.scene.add(m1, m2, m3);
  }

  /* -------------------------------------------------- the guardian colossi
     Two hooded stone giants leaning on greatswords, flanking the river where it
     falls into the valley. Built from rounded volumes, eyes faintly lit. */
  buildColossi() {
    const b = new Builder({ smooth: true }), glow = new Builder({ smooth: true });
    const M = new THREE.Matrix4(), L = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    const giant = (cx, cz, scale) => {
      const yaw = Math.atan2(-cx, -cz);              // faces the shrine
      let y0 = terrainHeight(cx, cz);
      for (let a = 0; a < 8; a++) y0 = Math.min(y0, terrainHeight(cx + Math.cos(a) * 5 * scale, cz + Math.sin(a) * 5 * scale));
      M.compose(new THREE.Vector3(cx, y0 - 0.5, cz), q.setFromEuler(e.set(0, yaw, 0)), new THREE.Vector3(scale, scale, scale));
      const part = (bld, geo, col, p, r = [0, 0, 0], sc = [1, 1, 1]) => {
        L.compose(new THREE.Vector3(...p), q.setFromEuler(e.set(...r)), new THREE.Vector3(...sc));
        bld.add(geo, col, { matrix: new THREE.Matrix4().multiplyMatrices(M, L), jitter: 0.03 });
      };
      const S = PAL.ruin, SD = PAL.ruinDark, SL = PAL.ruinLight, MOSS = 0x6f8358;
      part(b, new THREE.BoxGeometry(8, 3, 8), SD, [0, 1.5, 0]);                                           // plinth
      part(b, new THREE.BoxGeometry(7, 0.6, 7), SL, [0, 3.2, 0]);
      part(b, new THREE.CylinderGeometry(1.9, 3.3, 8.5, 20), S, [0, 7.6, 0]);                             // robe
      part(b, new THREE.CylinderGeometry(3.32, 3.45, 0.9, 20), MOSS, [0, 3.9, 0]);                        // mossy hem
      part(b, new THREE.CapsuleGeometry(1.9, 2.4, 6, 16), S, [0, 13.2, 0], [0, 0, 0], [1.25, 1, 0.9]);     // torso
      for (const sx of [-1, 1]) {
        part(b, new THREE.SphereGeometry(1.35, 16, 12), SL, [sx * 2.3, 14.9, 0]);                          // shoulders
        part(b, new THREE.CapsuleGeometry(0.75, 2.6, 6, 12), S, [sx * 2.0, 12.9, 1.0], [-0.5, 0, sx * 0.35]); // arms to the hilt
        part(b, new THREE.SphereGeometry(0.75, 12, 10), SL, [sx * 0.65, 11.6, 2.15]);                       // hands
      }
      part(b, new THREE.SphereGeometry(1.25, 18, 14), SL, [0, 16.9, 0.2]);                               // face
      part(b, new THREE.SphereGeometry(1.55, 18, 14), SD, [0, 17.15, -0.25], [0, 0, 0], [1, 1.12, 1]);     // hood
      part(b, new THREE.ConeGeometry(1.2, 1.6, 14), SD, [0, 18.6, -0.6], [-0.5, 0, 0]);                    // hood peak
      // the greatsword, point down on the plinth
      part(b, new THREE.BoxGeometry(0.75, 9.2, 0.22), SL, [0, 7.1, 2.4]);
      part(b, new THREE.ConeGeometry(0.53, 1.1, 4), SL, [0, 2.0, 2.4], [Math.PI, Math.PI / 4, 0], [1, 1, 0.3]);
      part(b, new THREE.BoxGeometry(3.6, 0.45, 0.5), SD, [0, 11.9, 2.4]);                                // crossguard
      part(b, new THREE.CylinderGeometry(0.28, 0.28, 1.5, 10), SD, [0, 12.9, 2.4]);
      part(b, new THREE.SphereGeometry(0.42, 12, 10), PAL.metalRust, [0, 13.8, 2.4]);                     // pommel
      for (const sx of [-1, 1]) part(glow, new THREE.SphereGeometry(0.17, 10, 8), PAL.rune, [sx * 0.42, 17.0, 1.33]);
      part(glow, new THREE.BoxGeometry(0.12, 7.6, 0.24), PAL.rune, [0, 7.4, 2.4]);                        // fuller glow
      this.obstacles.push({ x: cx, z: cz, r: 5.4 * scale, h: 18 * scale });
    };
    giant(-76, 30, 1.0);
    giant(-61, 60, 1.0);
    const m = new THREE.Mesh(b.buildUV(0.3), stoneMat());
    m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false;
    const g = new THREE.Mesh(glow.build(), new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, fog: true }));
    this.scene.add(m, g);
    this.colossusGlow = g;
  }

  /* -------------------------------------------------- water
     One shader for river and lake: depth colour, flowing ripples on world
     coordinates, sky reflection at grazing angles, sun glints, foam at the banks
     and on the cascade. */
  buildWater() {
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: true, side: THREE.DoubleSide,   // ribbon winding varies along the bends
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
        uTime: { value: 0 }, uSun: { value: this.sunDir.clone() },
        uDeep: { value: new THREE.Color(0x174a55) }, uShallow: { value: new THREE.Color(0x3f8f86) },
        uSky: { value: new THREE.Color(0xbcd8ec) },
      }]),
      vertexShader: /* glsl */`
        attribute vec2 flow; attribute float edge; attribute float foam;
        varying vec3 vW; varying vec2 vFlow; varying float vEdge; varying float vFoam;
        #include <fog_pars_vertex>
        void main(){
          vec4 w = modelMatrix * vec4(position, 1.0);
          vW = w.xyz; vFlow = flow; vEdge = edge; vFoam = foam;
          vec4 mvPosition = viewMatrix * w;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */`
        uniform float uTime; uniform vec3 uSun, uDeep, uShallow, uSky;
        varying vec3 vW; varying vec2 vFlow; varying float vEdge; varying float vFoam;
        #include <fog_pars_fragment>
        float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y); }
        float rip(vec2 p){ return vn(p) * 0.6 + vn(p * 2.3 + 7.1) * 0.4; }
        void main(){
          vec2 q = vW.xz * 0.45 - vFlow * uTime * 1.3;
          float n = rip(q), nx = rip(q + vec2(0.06, 0.0)), nz = rip(q + vec2(0.0, 0.06));
          vec3 N = normalize(vec3((n - nx) * 5.0, 1.0, (n - nz) * 5.0));
          vec3 V = normalize(cameraPosition - vW);
          float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
          vec3 col = mix(uDeep, uShallow, smoothstep(0.2, 1.0, vEdge) * 0.8 + n * 0.15);
          col = mix(col, uSky, clamp(fres * 0.75, 0.0, 0.75));
          vec3 Hh = normalize(normalize(uSun) + V);
          col += vec3(1.0, 0.93, 0.8) * pow(max(dot(N, Hh), 0.0), 120.0) * 1.6;
          float fm = smoothstep(0.78, 1.0, vEdge) * (0.55 + 0.45 * rip(q * 2.0))
                   + vFoam * smoothstep(0.35, 0.75, rip(q * 1.6 - uTime * 0.4));
          col = mix(col, vec3(0.93, 0.97, 0.97), clamp(fm, 0.0, 1.0) * 0.8);
          gl_FragColor = vec4(col, clamp(mix(0.86, 0.6, vEdge) + fm * 0.3, 0.0, 0.95));
          #include <fog_fragment>
        }`,
    });
    this.waterMat = mat;

    // river ribbon
    const P = RIVER, W = RIVER_W + 1.3;
    const pos = [], flow = [], edge = [], foam = [], idx = [];
    for (let i = 0; i < P.length; i++) {
      const a = P[Math.max(0, i - 1)], c = P[Math.min(P.length - 1, i + 1)];
      let tx = c.x - a.x, tz = c.z - a.z; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
      const nx = -tz, nz = tx;
      const slope = clamp((a.wy - c.wy) / Math.max(0.5, c.s - a.s) * 3, 0, 1);
      for (const side of [-1, 0, 1]) {
        pos.push(P[i].x + nx * W * side, P[i].wy, P[i].z + nz * W * side);
        flow.push(tx * (1 + slope * 3), tz * (1 + slope * 3));
        edge.push(Math.abs(side)); foam.push(slope);
      }
      if (i) for (let k = 0; k < 2; k++) {
        const o = (i - 1) * 3 + k, o2 = i * 3 + k;
        idx.push(o, o2, o + 1, o + 1, o2, o2 + 1);
      }
    }
    // lake: a disc, edge rising to the rim
    const base = pos.length / 3, SEGS = 40;
    pos.push(LAKE.x, LAKE_Y, LAKE.z); flow.push(0, 0); edge.push(0); foam.push(0);
    for (let k = 0; k <= SEGS; k++) {
      const a = (k / SEGS) * TAU;
      for (const f of [0.6, 1.0]) {
        pos.push(LAKE.x + Math.cos(a) * (LAKE.r + 1.6) * f, LAKE_Y, LAKE.z + Math.sin(a) * (LAKE.r + 1.6) * f);
        flow.push(0.08, 0.03); edge.push(f === 1 ? 1 : 0.35); foam.push(0);
      }
    }
    for (let k = 0; k < SEGS; k++) {
      const i0 = base + 1 + k * 2, i1 = base + 1 + (k + 1) * 2;
      idx.push(base, i1, i0, i0, i1, i1 + 1, i0, i1 + 1, i0 + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('flow', new THREE.Float32BufferAttribute(flow, 2));
    g.setAttribute('edge', new THREE.Float32BufferAttribute(edge, 1));
    g.setAttribute('foam', new THREE.Float32BufferAttribute(foam, 1));
    g.setIndex(idx);
    g.computeBoundingSphere();
    const water = new THREE.Mesh(g, mat);
    water.renderOrder = 2;
    water.frustumCulled = false;
    this.scene.add(water);
    this.water = water;

    // reeds along the banks: tall thin blades in clumps where the water meets the bank
    const reed = new Builder();
    for (let k = 0; k < 900; k++) {
      const q = RIVER[Math.floor(rng() * RIVER.length)];
      const a = rnd(0, TAU), d = RIVER_W + rnd(-0.6, 1.4);
      const x = q.x + Math.cos(a) * d, z = q.z + Math.sin(a) * d;
      const wd = waterDist(x, z);
      if (wd < -0.8 || wd > 1.2 || terrainNormal(x, z, _v).y < 0.75) continue;
      const y0 = terrainHeight(x, z), n = 3 + Math.floor(rng() * 4);
      for (let i = 0; i < n; i++) {
        const h = rnd(0.7, 1.5), ox = rnd(-0.25, 0.25), oz = rnd(-0.25, 0.25);
        reed.add(new THREE.ConeGeometry(0.025, h, 3), pick([0x5d7a34, 0x6f8a3c, 0x8a8a48]), {
          pos: [x + ox, y0 + h / 2 - 0.05, z + oz], rot: [rnd(-0.2, 0.2), rnd(0, TAU), rnd(-0.2, 0.2)]
        });
        if (rng() < 0.3) reed.add(new THREE.CapsuleGeometry(0.03, 0.12, 3, 5), 0x5a3a22, { pos: [x + ox, y0 + h - 0.02, z + oz] }); // cat-tail head
      }
    }
    // lily pads and a few flowers drifting on the lake
    for (let k = 0; k < 26; k++) {
      const a = rnd(0, TAU), d = Math.sqrt(rng()) * (LAKE.r - 1);
      const x = LAKE.x + Math.cos(a) * d, z = LAKE.z + Math.sin(a) * d, s = rnd(0.35, 0.7);
      reed.add(new THREE.CylinderGeometry(s, s, 0.02, 10, 1, false, 0.3, TAU - 0.6), pick([0x3f6a2c, 0x4f7a34]), { pos: [x, LAKE_Y + 0.02, z], rot: [0, rnd(0, TAU), 0] });
      if (rng() < 0.3) reed.add(new THREE.SphereGeometry(0.11, 8, 6), pick([0xf2e4ea, 0xf0c8d8]), { pos: [x, LAKE_Y + 0.08, z], scale: [1, 0.6, 1] });
    }
    const reeds = new THREE.Mesh(reed.build(), new THREE.MeshLambertMaterial({ vertexColors: true }));
    reeds.receiveShadow = true;
    this.scene.add(reeds);

    // spray where the cascade meets the valley floor
    this.mist = [];
    const tex = smokeTexture();
    let steepEnd = 0;
    for (let i = 1; i < P.length - 1; i++) if (P[i - 1].wy - P[i + 1].wy > 0.8) steepEnd = i;
    for (let k = 0; k < 5; k++) {
      const q = P[Math.min(P.length - 1, steepEnd + k * 2)];
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xeaf6f8, transparent: true, depthWrite: false, opacity: 0.4 }));
      sp.position.set(q.x + rnd(-1.5, 1.5), q.wy + 1.2, q.z + rnd(-1.5, 1.5));
      sp.scale.setScalar(rnd(4, 7));
      this.scene.add(sp);
      this.mist.push({ sp, base: q.wy + 1.2, seed: rng() * 10 });
    }
  }

  /* -------------------------------------------------- the forest
     A long trail from the shrine round the valley to the overlook, planted in
     sections of different character:
       young wood -> dark firs -> the ford -> birch grove -> a clearing of
       standing stones -> the old giants -> thinning to the view.
     Foliage is textured cards (crown-shaped normals, alpha cut, swaying, casting
     leaf-shaped shadows); bark has relief. The forest is built in chunks along
     the trail so the camera and the shadow pass skip what is out of view. */
  buildForest() {
    const UP = new THREE.Vector3(0, 1, 0);
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3(), E = new THREE.Euler();
    const X = new THREE.Vector3(), Y = new THREE.Vector3(), Z = new THREE.Vector3();
    const PLANE = new THREE.PlaneGeometry(1, 1);
    const LEAF_TINTS = [0xffffff, 0xe6f5d6, 0xd2e8bc, 0xf2f0c8, 0xdfeeb4];
    const BIRCH_TINTS = [0xf4ffc0, 0xe8ffb0, 0xfff4b0, 0xe0f8b8];
    this.forestCount = { broadleaf: 0, fir: 0, birch: 0, giant: 0 };

    // chunks along the trail: each holds its own builders, so whole chunks cull
    const CHUNK = 40;
    const chunks = [];
    const chunkFor = (s) => {
      const k = Math.min(Math.floor(s / CHUNK), 64);
      if (!chunks[k]) chunks[k] = { bark: new MeshBuilder(), birch: new MeshBuilder(), leaves: new MeshBuilder(), needles: new MeshBuilder(), ferns: new MeshBuilder() };
      return chunks[k];
    };
    const valley = { bark: new MeshBuilder(), birch: new MeshBuilder(), leaves: new MeshBuilder(), needles: new MeshBuilder(), ferns: new MeshBuilder() };
    let C = valley;                       // the builders the helpers below write into
    const stones = new Builder(), shrooms = new Builder({ smooth: true }), glow = new Builder();

    const cyl = (mb, a, b, r0, r1, col, seg = 8) => {
      const dir = new THREE.Vector3().subVectors(b, a), len = dir.length(); dir.normalize();
      M.compose(P.copy(a).addScaledVector(dir, len / 2), Q.setFromUnitVectors(UP, dir), S.set(1, 1, 1));
      mb.add(new THREE.CylinderGeometry(r1, r0, len, seg, 1), col, M);
    };
    const crownNormal = (crown) => (v, out) => out.subVectors(v, crown).normalize().addScaledVector(UP, 0.45).normalize();
    const cards = (mb, center, crown, n, size, spread, tints = LEAF_TINTS) => {
      for (let k = 0; k < n; k++) {
        P.set(center.x + rnd(-1, 1) * spread, center.y + rnd(-0.6, 1) * spread * 0.8, center.z + rnd(-1, 1) * spread);
        const sc = size * rnd(0.75, 1.15);
        M.compose(P, Q.setFromEuler(E.set(rnd(0, TAU), rnd(0, TAU), rnd(0, TAU))), S.set(sc, sc, sc));
        mb.add(PLANE, pick(tints), M, crownNormal(crown));
      }
    };

    const broadleaf = (x, y, z, s, tx, tz, mossy = false) => {
      const H = rnd(9, 13) * s;
      const top = new THREE.Vector3(x + tx * 0.07 * H, y + H, z + tz * 0.07 * H);
      const col = pick([0x6b5a48, 0x5e5040, 0x77654f]);
      cyl(C.bark, new THREE.Vector3(x, y - 0.3, z), top, 0.48 * s, 0.2 * s, col, 10);
      cyl(C.bark, new THREE.Vector3(x, y - 0.3, z), new THREE.Vector3(x, y + 1.0 * s, z), 0.85 * s, 0.5 * s, mossy ? 0x55603e : col, 10);
      if (mossy) cyl(C.bark, new THREE.Vector3(x, y + 0.6 * s, z), new THREE.Vector3(x, y + 3.2 * s, z), 0.53 * s, 0.44 * s, 0x5d6a42, 10);
      const crown = new THREE.Vector3(top.x, y + H * 0.85, top.z);
      const toward = Math.atan2(tz, tx);
      for (let k = 0; k < 6; k++) {
        const h = rnd(0.5, 0.86), start = new THREE.Vector3(x + (top.x - x) * h, y + H * h, z + (top.z - z) * h);
        const az = rng() < 0.6 ? toward + rnd(-0.8, 0.8) : rnd(0, TAU), el = rnd(0.45, 0.95), len = rnd(3, 5.6) * s;
        const end = start.clone().add(new THREE.Vector3(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)).multiplyScalar(len));
        cyl(C.bark, start, end, 0.17 * s, 0.05 * s, col, 6);
        cards(C.leaves, end, crown, 9, 2.8 * s, 1.5 * s);
      }
      cards(C.leaves, top.clone().addScaledVector(UP, 0.6), crown, 13, 3.1 * s, 2.0 * s);
      this.obstacles.push({ x, z, r: 0.6 * s, h: H });
      this.forestCount[s > 1.5 ? 'giant' : 'broadleaf']++;
    };

    const birch = (x, y, z, s) => {
      const H = rnd(9, 13) * s, lean = rnd(-0.06, 0.06), lz = rnd(-0.06, 0.06);
      const top = new THREE.Vector3(x + lean * H, y + H, z + lz * H);
      cyl(C.birch, new THREE.Vector3(x, y - 0.2, z), top, 0.2 * s, 0.08 * s, 0xffffff, 9);
      const crown = new THREE.Vector3(top.x, y + H * 0.8, top.z);
      for (let k = 0; k < 4; k++) {
        const h = rnd(0.55, 0.9), start = new THREE.Vector3(x + (top.x - x) * h, y + H * h, z + (top.z - z) * h);
        const az = rnd(0, TAU), el = rnd(0.6, 1.1), len = rnd(1.8, 3.2) * s;
        const end = start.clone().add(new THREE.Vector3(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)).multiplyScalar(len));
        cyl(C.birch, start, end, 0.06 * s, 0.025 * s, 0xd8d0c4, 5);
        cards(C.leaves, end, crown, 7, 1.9 * s, 1.1 * s, BIRCH_TINTS);
      }
      cards(C.leaves, top, crown, 9, 2.2 * s, 1.3 * s, BIRCH_TINTS);
      this.obstacles.push({ x, z, r: 0.3 * s, h: H });
      this.forestCount.birch++;
    };

    const fir = (x, y, z, s) => {
      const H = rnd(10, 16) * s;
      cyl(C.bark, new THREE.Vector3(x, y - 0.2, z), new THREE.Vector3(x, y + H, z), 0.32 * s, 0.05 * s, 0x4e3c2c, 7);
      const axisNormal = (v, out) => out.set(v.x - x, 0.35, v.z - z).normalize();
      for (let h = 1.7 * s; h < H - 0.4; h += 0.75 * s) {
        const t = h / H, R = (1 - t) * 2.9 * s + 0.4 * s, off = rnd(0, TAU);
        for (let k = 0; k < 6; k++) {
          const az = off + (k / 6) * TAU + rnd(-0.2, 0.2), droop = rnd(0.25, 0.55), roll = rnd(0.35, 0.8);
          X.set(Math.cos(az) * Math.cos(droop), -Math.sin(droop), Math.sin(az) * Math.cos(droop));
          Y.crossVectors(UP, X).normalize();
          Z.crossVectors(X, Y);
          Y.multiplyScalar(Math.cos(roll)).addScaledVector(Z, Math.sin(roll)).normalize();
          Z.crossVectors(X, Y);
          M.makeBasis(X, Y, Z); M.scale(S.set(R, R * 0.5, 1));
          M.setPosition(P.set(x, y + h, z).addScaledVector(X, R * 0.5));
          C.needles.add(PLANE, pick([0xffffff, 0xe8f4e0, 0xd6e8cc]), M, axisNormal);
        }
      }
      this.obstacles.push({ x, z, r: 0.45 * s, h: H });
      this.forestCount.fir++;
    };

    const fern = (x, y, z, s) => {
      for (let k = 0; k < 7; k++) {
        const az = (k / 7) * TAU + rnd(-0.3, 0.3), tilt = rnd(0.75, 1.1), L = rnd(0.7, 1.15) * s;
        Y.set(Math.cos(az) * Math.sin(tilt), Math.cos(tilt), Math.sin(az) * Math.sin(tilt));
        X.crossVectors(Y, UP).normalize(); Z.crossVectors(X, Y);
        M.makeBasis(X, Y, Z); M.scale(S.set(L * 0.5, L, 1));
        M.setPosition(P.set(x, y + 0.02, z).addScaledVector(Y, L * 0.5));
        C.ferns.add(PLANE, pick([0xffffff, 0xe0f0c8, 0xf4f0c0]), M, (v, out) => out.set(v.x - x, 1.2, v.z - z).normalize());
      }
    };
    const mushrooms = (x, y0, z) => {
      for (let m = 0; m < 3; m++) {
        const mx = x + rnd(-0.3, 0.3), mz = z + rnd(-0.3, 0.3), hh = rnd(0.08, 0.16);
        shrooms.add(new THREE.CylinderGeometry(0.025, 0.03, hh, 6), 0xe8e0cc, { pos: [mx, y0 + hh / 2, mz] });
        shrooms.add(new THREE.SphereGeometry(0.075, 10, 6, 0, TAU, 0, Math.PI / 2), pick([0xa8442a, 0xc89a5a, 0x8a6a48]), { pos: [mx, y0 + hh, mz], scale: [1, 0.7, 1] });
      }
    };
    const mossStone = (x, y0, z, sz) => stones.add(new THREE.DodecahedronGeometry(sz, 0), pick([0x6f7a5c, 0x5e6a50, 0x7d8270]), { pos: [x, y0 + sz * 0.3, z], rot: [rnd(0, TAU), rnd(0, TAU), rnd(0, TAU)], jitter: 0.05 });

    const ok = (x, z, pad) => Math.hypot(x, z) < ARENA_R - 3 && Math.hypot(x, z) > 16 && waterDist(x, z) > 2 && this.isClear(x, z, pad) && terrainNormal(x, z, _v).y > 0.72
      && (!clearing || Math.hypot(x - clearing.x, z - clearing.z) > 7.6);   // the altar's ring stays open

    /* the sections, by distance along the trail (fraction of its length) */
    const L = TRAIL_LEN;
    const section = (s) => {
      const f = s / L;
      if (f < 0.12) return 'young';
      if (f < 0.27) return 'firs';
      if (f < 0.34) return 'ford';
      if (f < 0.52) return 'birch';
      if (f < 0.6) return 'clearing';
      if (f < 0.86) return 'giants';
      return 'edge';
    };
    // the clearing's centre, off to one side of the path
    let clearing = null;
    // found up front, so no tree is planted on it before the loop reaches it
    for (let i = 2; i < TRAIL.length - 1; i++) {
      if (section(TRAIL[i].s) !== 'clearing') continue;
      const a = TRAIL[i - 1], c = TRAIL[i + 1], q = TRAIL[i];
      let tx = c.x - a.x, tz = c.z - a.z; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
      clearing = { x: q.x - tz * 12, z: q.z + tx * 12 };
      break;
    }

    for (let i = 2; i < TRAIL.length - 1; i++) {
      const q = TRAIL[i], a = TRAIL[i - 1], c = TRAIL[i + 1], sec = section(q.s);
      C = chunkFor(q.s);
      let tx = c.x - a.x, tz = c.z - a.z; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
      // the last stretch thins out so the view opens up
      const thin = sec === 'edge' ? 1 - (q.s / L - 0.86) / 0.14 : 1;
      if (sec === 'clearing' && !clearing) clearing = { x: q.x - tz * 12, z: q.z + tx * 12 };
      for (const side of [-1, 1]) {
        const nx = -tz * side, nz = tx * side;
        const at = (d, j = 0.6) => [q.x + nx * d + rnd(-j, j), q.z + nz * d + rnd(-j, j)];
        const plant = (p, kind, s) => {
          const [x, z] = p;
          if (kind === 'broad') { if (ok(x, z, 1.1) && trailDist(x, z) > 3.0) broadleaf(x, terrainHeight(x, z), z, s, -nx, -nz); }
          else if (kind === 'giant') { if (ok(x, z, 2.4) && trailDist(x, z) > 4.2) broadleaf(x, terrainHeight(x, z), z, s, -nx, -nz, true); }
          else if (kind === 'birch') { if (ok(x, z, 0.7) && trailDist(x, z) > 2.4) birch(x, terrainHeight(x, z), z, s); }
          // firs' low boughs spread about 3 m: stand them back so the path stays clear at head height
          else if (ok(x, z, 1.1) && trailDist(x, z) > 4.2) fir(x, terrainHeight(x, z), z, s);
        };
        if (sec === 'young' || sec === 'edge') {
          if (rng() < 0.85 * thin) plant(at(rnd(3.3, 6), 0.5), 'broad', rnd(0.9, 1.25));
          if (rng() < 0.7 * thin) plant(at(rnd(6, 10), 0.8), rng() < 0.5 ? 'broad' : 'fir', rnd(0.85, 1.2));
          if (rng() < 0.6 * thin) plant(at(rnd(10, 16), 1), 'fir', rnd(0.9, 1.3));
          if (rng() < 0.4 * thin) plant(at(rnd(16, 24), 1.5), 'fir', rnd(1.0, 1.4));
        } else if (sec === 'firs') {
          // dense and dark: firs right to the path edge, rank on rank
          for (const [d, p0] of [[[4.3, 6.5], 0.95], [[6.5, 10], 0.9], [[10, 15], 0.8], [[15, 22], 0.6]]) if (rng() < p0) plant(at(rnd(d[0], d[1]), 0.8), 'fir', rnd(0.95, 1.4));
        } else if (sec === 'ford') {
          if (rng() < 0.5) plant(at(rnd(5, 9), 0.8), rng() < 0.5 ? 'broad' : 'fir', rnd(0.9, 1.2));
          if (rng() < 0.4) plant(at(rnd(9, 16), 1), 'fir', rnd(1.0, 1.3));
        } else if (sec === 'birch') {
          // a pale, bright grove: many slender birches, a few firs behind
          for (const [d, p0] of [[[2.6, 5], 0.95], [[4.5, 8], 0.9], [[8, 13], 0.8], [[13, 20], 0.5]]) if (rng() < p0) plant(at(rnd(d[0], d[1]), 0.8), 'birch', rnd(0.85, 1.2));
          if (rng() < 0.3) plant(at(rnd(12, 20), 1), 'fir', rnd(1.0, 1.3));
        } else if (sec === 'clearing') {
          if (rng() < 0.6) plant(at(rnd(16, 24), 1), rng() < 0.5 ? 'broad' : 'fir', rnd(1.0, 1.3));
        } else if (sec === 'giants') {
          // old giants: huge, mossy and wide-spaced, with firs in the gaps
          if (rng() < 0.35) plant(at(rnd(5, 9), 1), 'giant', rnd(1.7, 2.2));
          if (rng() < 0.3) plant(at(rnd(10, 18), 1.5), 'giant', rnd(1.6, 2.1));
          if (rng() < 0.4) plant(at(rnd(7, 15), 1), 'fir', rnd(1.0, 1.4));
        }
        // the floor
        const floorN = sec === 'firs' ? 1 : sec === 'clearing' ? 0 : 2;
        for (let k = 0; k < floorN; k++) {
          const [x, z] = at(rnd(1.8, 7), 0.5);
          if (!ok(x, z, 0.3) || trailDist(x, z) < 1.7) continue;
          const y0 = terrainHeight(x, z), roll = rng();
          if (sec === 'giants' && roll < 0.75) fern(x, y0, z, rnd(1.1, 1.6));
          else if (sec === 'birch' && roll < 0.55) cards(C.leaves, new THREE.Vector3(x, y0 + 0.45, z), new THREE.Vector3(x, y0 - 0.2, z), 6, 1.0, 0.45, BIRCH_TINTS);
          else if (roll < 0.55) fern(x, y0, z, rnd(0.8, 1.3));
          else if (roll < 0.78) cards(C.leaves, new THREE.Vector3(x, y0 + 0.55, z), new THREE.Vector3(x, y0 - 0.2, z), 8, 1.25, 0.55);
          else if (roll < 0.9) mushrooms(x, y0, z);
          else mossStone(x, y0, z, rnd(0.35, 0.8));
        }
        if (rng() < (sec === 'giants' ? 0.12 : 0.05)) {                         // a fallen log
          const [x, z] = at(rnd(3, 6), 0.5);
          if (ok(x, z, 1)) {
            const ang = Math.atan2(tz, tx) + rnd(-0.4, 0.4), Ll = rnd(3, 6), y0 = terrainHeight(x, z) + 0.3;
            cyl(C.bark, new THREE.Vector3(x - Math.cos(ang) * Ll / 2, y0, z - Math.sin(ang) * Ll / 2), new THREE.Vector3(x + Math.cos(ang) * Ll / 2, y0, z + Math.sin(ang) * Ll / 2), 0.36, 0.3, 0x5f5a40, 9);
          }
        }
      }
    }

    // the ford: stepping stones across the shallows
    for (let i = 1; i < TRAIL.length; i++) {
      const q = TRAIL[i];
      if (waterDist(q.x, q.z) > 0.5) continue;
      const y0 = terrainHeight(q.x, q.z);
      stones.add(new THREE.CylinderGeometry(0.42, 0.5, 0.5, 7), pick([0x7d8284, 0x6c7274]), { pos: [q.x + rnd(-0.3, 0.3), y0 + 0.12, q.z + rnd(-0.3, 0.3)], rot: [0, rnd(0, TAU), 0], scale: [1, 0.7, 1], jitter: 0.05 });
    }
    this.clearing = clearing;                 // the adventure puts its altar here
    // the clearing: a ring of standing stones round a low rune-lit altar, and a broken arch
    if (clearing) {
      const { x: cx, z: cz } = clearing, y0 = terrainHeight(cx, cz);
      for (let k = 0; k < 9; k++) {
        const a = (k / 9) * TAU, x = cx + Math.cos(a) * 6.5, z = cz + Math.sin(a) * 6.5, hh = rnd(2.2, 3.6);
        if (trailDist(x, z) < 2.5) continue;
        stones.add(new THREE.BoxGeometry(1.0, hh, 0.6), pick([PAL.ruinDark, PAL.rockDark, 0x6f7a5c]), { pos: [x, terrainHeight(x, z) + hh / 2 - 0.25, z], rot: [rnd(-0.06, 0.06), -a, rnd(-0.06, 0.06)], jitter: 0.05 });
        this.obstacles.push({ x, z, r: 0.7, h: hh });
      }
      stones.add(new THREE.CylinderGeometry(1.3, 1.5, 0.8, 9), PAL.ruinDark, { pos: [cx, y0 + 0.3, cz], jitter: 0.04 });
      glow.add(new THREE.TorusGeometry(1.05, 0.05, 4, 24), PAL.rune, { pos: [cx, y0 + 0.73, cz], rot: [Math.PI / 2, 0, 0] });
      this.obstacles.push({ x: cx, z: cz, r: 1.5, h: 0.8 });
    }
    // the valley's fir stands go into the valley builders
    C = valley;
    for (const [x, y, z, s] of (this.firSpots || [])) fir(x, y, z, s);

    /* materials, shared by every chunk */
    const sway = (mat, amp) => {
      mat.onBeforeCompile = (sh) => {
        sh.uniforms.uTime = this.time;
        sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
          float sw = sin(uTime * 1.5 + transformed.x * 0.35 + transformed.z * 0.27);
          transformed.x += sw * ${amp.toFixed(3)};
          transformed.z += cos(uTime * 1.2 + transformed.z * 0.31) * ${(amp * 0.8).toFixed(3)};`);
      };
      mat.customProgramCacheKey = () => 'sway' + amp;
      return mat;
    };
    const cardMat = (tex, amp) => ({
      mat: sway(new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.45, side: THREE.DoubleSide, vertexColors: true }), amp),
      depth: new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: tex, alphaTest: 0.45 }),
    });
    const bt = barkTexture(); bt.repeat.set(2, 3);
    const brt = birchTexture(); brt.repeat.set(1, 2);
    const MATS = {
      bark: { mat: new THREE.MeshLambertMaterial({ vertexColors: true, map: bt, bumpMap: bt, bumpScale: 4 }) },
      birch: { mat: new THREE.MeshLambertMaterial({ vertexColors: true, map: brt, bumpMap: brt, bumpScale: 1.5 }) },
      leaves: cardMat(leafTexture(), 0.06),
      needles: cardMat(needleSprayTexture(), 0.04),
      ferns: cardMat(fernTexture(), 0.03),
    };
    const emit = (set, cull) => {
      for (const key of Object.keys(MATS)) {
        const mb = set[key];
        if (!mb || mb.p.length === 0) continue;
        const m = new THREE.Mesh(mb.build(), MATS[key].mat);
        if (MATS[key].depth) m.customDepthMaterial = MATS[key].depth;
        m.castShadow = true; m.receiveShadow = true;
        m.frustumCulled = cull;                 // chunks cull; bounding spheres come from the geometry
        this.scene.add(m);
      }
    };
    for (const ch of chunks) if (ch) emit(ch, true);
    emit(valley, false);
    const st = new THREE.Mesh(stones.buildUV(0.6), stoneMat()); st.castShadow = true; st.receiveShadow = true; this.scene.add(st);
    this.scene.add(new THREE.Mesh(shrooms.build(), new THREE.MeshLambertMaterial({ vertexColors: true })));
    if (glow.pos.length) this.scene.add(new THREE.Mesh(glow.build(), new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, fog: true })));

    // shafts of light: thickest in the dark firs and among the giants
    const sh = document.createElement('canvas'); sh.width = 16; sh.height = 128;
    const sx = sh.getContext('2d'), gr = sx.createLinearGradient(0, 0, 0, 128);
    gr.addColorStop(0, 'rgba(255,240,200,0.9)'); gr.addColorStop(1, 'rgba(255,240,200,0)');
    sx.fillStyle = gr; sx.fillRect(0, 0, 16, 128);
    const shTex = new THREE.CanvasTexture(sh);
    this.shafts = [];
    Y.copy(this.sunDir); X.crossVectors(UP, Y).normalize(); Z.crossVectors(X, Y);
    for (let i = 6; i < TRAIL.length - 4; i += 5) {
      const q = TRAIL[i], sec = section(q.s);
      if (!(sec === 'firs' || sec === 'giants' || (sec === 'young' && i % 10 === 6))) continue;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 20), new THREE.MeshBasicMaterial({
        map: shTex, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: true
      }));
      M.makeBasis(X, Y, Z); m.quaternion.setFromRotationMatrix(M);
      m.position.set(q.x + rnd(-2.5, 2.5), terrainHeight(q.x, q.z), q.z + rnd(-2.5, 2.5)).addScaledVector(Y, 10);
      this.scene.add(m);
      this.shafts.push({ m, seed: rng() * 10 });
    }
    // low mist drifting among the giants
    if (!this.mist) this.mist = [];
    const mt = smokeTexture();
    for (let i = 0; i < TRAIL.length; i += 7) {
      const q = TRAIL[i];
      if (section(q.s) !== 'giants') continue;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: mt, color: 0xe8f0ec, transparent: true, depthWrite: false, opacity: 0.22 }));
      const y0 = terrainHeight(q.x, q.z) + 1.2;
      sp.position.set(q.x + rnd(-5, 5), y0, q.z + rnd(-5, 5)); sp.scale.set(rnd(8, 13), rnd(3, 4.5), 1);
      this.scene.add(sp);
      this.mist.push({ sp, base: y0, seed: rng() * 10 });
    }
  }

  /* -------------------------------------------------- ivy
     Leaf cards laid flat on old stone, thick near the ground and thinning upward:
     the shrine's great pillars, the three watchtowers and the arch's legs. */
  buildIvy() {
    const mb = new MeshBuilder(), PLANE = new THREE.PlaneGeometry(1, 1);
    const M = new THREE.Matrix4(), X = new THREE.Vector3(), Y = new THREE.Vector3(), Z = new THREE.Vector3(), P = new THREE.Vector3(), S = new THREE.Vector3();
    const TINTS = [0x9fbf80, 0x8fb070, 0xb0c890, 0x7f9f68, 0xc8c080];
    // a column of ivy round a cylinder of radius R from the ground up to H, on an arc of the surface
    const climb = (cx, cz, R, H, n, a0 = 0, a1 = TAU) => {
      const y0 = terrainHeight(cx, cz);
      for (let k = 0; k < n; k++) {
        const a = a0 + (a1 - a0) * rng(), h = H * Math.pow(rng(), 1.7), sz = rnd(0.4, 0.8) * (1 - h / H * 0.4);
        Z.set(Math.cos(a), 0, Math.sin(a));                       // out from the stone
        X.set(-Z.z, 0, Z.x);
        Y.crossVectors(Z, X);
        const roll = rnd(0, TAU);
        X.applyAxisAngle(Z, roll); Y.applyAxisAngle(Z, roll);
        M.makeBasis(X, Y, Z); M.scale(S.set(sz, sz, 1));
        M.setPosition(P.set(cx + Z.x * (R + 0.04), y0 + h + 0.2, cz + Z.z * (R + 0.04)));
        const nrm = Z.clone();
        mb.add(PLANE, pick(TINTS), M, (v, out) => out.copy(nrm).addScaledVector(Y.set(0, 1, 0), 0.3).normalize());
      }
    };
    for (let i = 0; i < 4; i++) {                                 // the shrine's great pillars
      const a = (i / 4) * TAU + Math.PI / 4;
      climb(Math.cos(a) * 12.5, Math.sin(a) * 12.5, 1.18, 6.5, 110);
    }
    for (const a of [1.15, 0.25, -1.45]) climb(Math.cos(a) * 76, Math.sin(a) * 76, 3.35, 9, 260, a + Math.PI - 1.4, a + Math.PI + 1.4);   // tower faces toward the valley
    for (const [lx, lz] of [[-37.0, -59.2], [-71.0, -34.8]]) climb(lx, lz, 3.4, 8, 150);   // the arch legs
    const tex = leafTexture();
    const m = new THREE.Mesh(mb.build(), new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.45, side: THREE.DoubleSide, vertexColors: true }));
    m.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: tex, alphaTest: 0.45 });
    m.castShadow = true; m.receiveShadow = true;
    this.scene.add(m);
  }

  /* -------------------------------------------------- per frame */
  update(dt, t, playerPos, camera) {
    this.time.value = t;
    if (this.runes) this.runes.material.color.setScalar(0.75 + Math.sin(t * 1.3) * 0.25);
    if (this.mist) for (const m of this.mist) {
      m.sp.material.opacity = 0.38 + Math.sin(t * 1.7 + m.seed) * 0.12;
      m.sp.position.y = m.base + Math.sin(t * 0.9 + m.seed) * 0.4;
    }

    // firelight: flicker the flames and their lights
    if (this.flames) {
      for (let i = 0; i < this.flames.length; i++) {
        const f = this.flames[i];
        const w = Math.sin(t * 9 + f.seed) * 0.5 + Math.sin(t * 23.7 + f.seed * 2) * 0.25;
        f.sp.scale.set(1.35 + w * 0.22, 2.0 + w * 0.5, 1);
        f.sp.position.y = f.base + w * 0.06;
        if (f.light) f.light.intensity = 2.4 + w * 0.9;
      }
    }
    // banners stir in the wind
    if (this.banners) {
      for (let i = 0; i < this.banners.length; i++) {
        const bn = this.banners[i];
        bn.m.rotation.z = Math.sin(t * 1.6 + bn.seed) * 0.045;
        bn.m.rotation.y = bn.rotY + Math.sin(t * 0.9 + bn.seed * 1.7) * 0.07;
      }
    }

    // sun sprite follows the camera a little so it never leaves the dome
    if (this.sunSprite) {
      this.sunSprite.position.copy(this.sunDir).multiplyScalar(560).add(this.scene.position);
      this.sunSprite.visible = this.sunDir.y > -0.05;
    }

    // shadow frustum follows the player
    const s = this.sun;
    this.shadowTarget.set(playerPos.x, terrainHeight(playerPos.x, playerPos.z), playerPos.z);
    s.position.copy(this.shadowTarget).addScaledVector(this.lightDir, 70);
    s.target.position.copy(this.shadowTarget);
    s.target.updateMatrixWorld();

    // fill light rides the camera so the hero reads against the sand
    if (this.fill && camera) {
      this.fill.position.copy(camera.position);
      this.fill.position.y += 4;
      this.fill.target.position.set(playerPos.x, playerPos.y + 1.1, playerPos.z);
      this.fill.target.updateMatrixWorld();
    }

    if (this.waterMat) this.waterMat.uniforms.uTime.value = t;
    if (this.shafts) for (const s of this.shafts) s.m.material.opacity = (0.05 + Math.sin(t * 0.4 + s.seed) * 0.025) * this.shaftK;
    this.updateFireflies(dt, t, playerPos);
    if (this.clouds) for (const c of this.clouds) {
      c.a += c.w * dt;
      c.sp.position.x = Math.cos(c.a) * c.d; c.sp.position.z = Math.sin(c.a) * c.d;
    }

    // drifting dust, wrapped around the player
    if (this.dust && this.dustData) {
      const pa = this.dust.geometry.attributes.position;
      const arr = pa.array;
      const d = this.dustData;
      for (let i = 0; i < d.length; i++) {
        const o = d[i];
        arr[i * 3 + 1] += o.vy * dt;
        arr[i * 3] += Math.sin(t * 0.5 + o.ph) * 0.12 * dt * o.sp;
        arr[i * 3 + 2] += Math.cos(t * 0.4 + o.ph) * 0.12 * dt * o.sp;
        // wrap
        const dx = arr[i * 3] - playerPos.x, dz = arr[i * 3 + 2] - playerPos.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 58) {
          const a = Math.atan2(dz, dx) + Math.PI;
          arr[i * 3] = playerPos.x + Math.cos(a) * 52;
          arr[i * 3 + 2] = playerPos.z + Math.sin(a) * 52;
          arr[i * 3 + 1] = playerPos.y + rnd(0.2, 13);
        }
        if (arr[i * 3 + 1] > playerPos.y + 18) arr[i * 3 + 1] = playerPos.y + 0.2;
        if (arr[i * 3 + 1] < playerPos.y - 3) arr[i * 3 + 1] = playerPos.y + 15;
      }
      pa.needsUpdate = true;
    }
  }

  /** set the whole valley's light for a time of day: sky, fog, sun or moon, fills, water, haze, stars */
  applyTime(tod) {
    const S = this._tod; this.tod = tod;
    sampleTime(tod, S);
    sunVector(tod, this.sunDir);
    const day = this.sunDir.y > -0.03;
    // by night the one directional light becomes the moon; it never lies flatter than 0.2 so shadows stay sane
    this.lightDir.copy(this.sunDir); if (!day) this.lightDir.negate();
    this.lightDir.y = Math.max(0.2, this.lightDir.y); this.lightDir.normalize();
    const u = this.sky.material.uniforms;
    u.uSun.value.copy(this.sunDir); u.uMoon.value.copy(this.sunDir).negate();
    u.uZenith.value.copy(S.zen); u.uMid.value.copy(S.mid); u.uHorizon.value.copy(S.hor); u.uGround.value.copy(S.gnd);
    const night = Math.min(1, Math.max(0, (S.st - 0.1) / 0.8));
    this.night = night;
    u.uStars.value = S.st; u.uDay.value = 1 - night;
    this.scene.fog.color.copy(S.fog);
    this.sun.color.copy(S.sun); this.sun.intensity = S.sunI;
    this.hemi.color.copy(S.hs); this.hemi.groundColor.copy(S.hg); this.hemi.intensity = S.hI;
    this.ambient.color.copy(S.amb); this.ambient.intensity = S.aI;
    this.bounce.color.copy(S.bn); this.bounce.intensity = S.bI;
    this.fill.color.copy(S.fl); this.fill.intensity = S.fI;
    this.exposure = S.ex;
    if (this.cave) {           // underground: no sun, no sky; a cool dim fill and the dark
      this.night = 0; this.shaftK = 0;
      this.sun.intensity = 0;
      // the rooms are lit by baked torchlight; these lights are for the hero and the enemies, who must read against them
      this.hemi.color.setHex(0xa8aac0); this.hemi.groundColor.setHex(0x44424c); this.hemi.intensity = 1.2;
      this.ambient.color.setHex(0x626478); this.ambient.intensity = 0.8;
      this.bounce.intensity = 0.25; this.bounce.color.setHex(0x6a7ab8); this.fill.color.setHex(0xa8b0d0); this.fill.intensity = 0.55;
      this.scene.fog.color.setHex(0x05060a); this.scene.fog.near = 5; this.scene.fog.far = 62;
      this.exposure = 1.25;
    }
    if (this.sunSprite) { this.sunSprite.material.opacity = 0.55 * (1 - night); this.sunSprite.material.color.copy(S.sun); }
    if (this.waterMat) { this.waterMat.uniforms.uSun.value.copy(this.lightDir); this.waterMat.uniforms.uSky.value.copy(S.hor).lerp(S.zen, 0.35); }
    if (this.clouds) for (const c of this.clouds) c.sp.material.color.copy(S.hor).lerp(S.sun, 0.25).multiplyScalar(0.25 + 0.75 * (1 - night));
    this.shaftK = Math.max(0, 1 - night * 1.6) * Math.max(0, Math.min(1, (this.sunDir.y + 0.05) / 0.25));
    if (this.mist) for (const m of this.mist) m.sp.material.color.copy(S.fog).multiplyScalar(1.05);
  }

  groundAt(x, z) { return terrainHeight(x, z); }

  /** go underground into a vault: its floor, its rooms' walls, its pillars and its dark */
  enterUnderground(vault) {
    this.valleyObstacles = this.obstacles;
    this.obstacles = vault.obstacles;
    this.bounds = vault.clamp;
    this.cave = true;
    this.scene.fog.near = 5; this.scene.fog.far = 62;
    this.applyTime(this.tod);
  }
  leaveUnderground() {
    if (!this.cave) return;
    this.cave = false;
    this.obstacles = this.valleyObstacles; this.valleyObstacles = null;
    this.bounds = null;
    this.scene.fog.near = 70; this.scene.fog.far = 1150;
    this.applyTime(this.tod);
  }

  /** fireflies: a few dozen warm sparks that drift near the player after dark */
  buildFireflies() {
    const n = 70, pos = new Float32Array(n * 3);
    this.fireData = [];
    for (let i = 0; i < n; i++) this.fireData.push({ ph: rnd(0, TAU), sp: rnd(0.5, 1.4), r: rnd(4, 30), a: rnd(0, TAU), h: rnd(0.4, 3.2) });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.PointsMaterial({ size: 0.28, map: radialSprite('rgba(255,244,170,1)', 'rgba(255,200,60,0)', 32), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffe890, sizeAttenuation: true });
    this.fire = new THREE.Points(g, m); this.fire.frustumCulled = false; this.fire.visible = false;
    this.scene.add(this.fire);
  }
  updateFireflies(dt, t, p) {
    if (!this.fire) this.buildFireflies();
    const on = this.night > 0.15;
    this.fire.visible = on;
    if (!on) return;
    this.fire.material.opacity = Math.min(1, (this.night - 0.15) * 1.4) * (0.75 + 0.25 * Math.sin(t * 3));
    const arr = this.fire.geometry.attributes.position.array;
    for (let i = 0; i < this.fireData.length; i++) {
      const o = this.fireData[i], a = o.a + t * 0.05 * o.sp + Math.sin(t * 0.7 + o.ph) * 0.4;
      const x = p.x + Math.cos(a) * o.r, z = p.z + Math.sin(a) * o.r;
      arr[i * 3] = x; arr[i * 3 + 2] = z;
      arr[i * 3 + 1] = terrainHeight(x, z) + o.h + Math.sin(t * o.sp + o.ph) * 0.6;
    }
    this.fire.geometry.attributes.position.needsUpdate = true;
  }

  /** is this spot clear of every obstacle? */
  isClear(x, z, pad = 1.0) {
    for (let i = 0; i < this.obstacles.length; i++) {
      const o = this.obstacles[i];
      if (Math.hypot(x - o.x, z - o.z) < o.r + pad) return false;
    }
    return true;
  }

  /** find somewhere genuinely open to put the player: clear of props, on flat ground */
  pickSpawn() {
    let best = null, bestScore = -1e9;
    for (let r = 13; r <= 30; r += 1.5) {
      for (let a = 0; a < 32; a++) {
        const ang = (a / 32) * TAU;
        const x = Math.cos(ang) * r, z = Math.sin(ang) * r;
        if (!this.isClear(x, z, 1.8)) continue;
        const n = terrainNormal(x, z, _v);
        if (n.y < 0.93) continue;                       // flat-ish only
        // prefer standing back from the dais, with it in view
        const score = (r > 14 ? 2 : 0) + n.y * 3 - Math.abs(r - 17) * 0.1;
        if (score > bestScore) { bestScore = score; best = [x, z]; }
      }
    }
    return best || [0, 18];
  }

  /** push a circle out of world obstacles; returns corrected x,z */
  resolveCollisions(x, z, radius) {
    if (this.bounds) [x, z] = this.bounds(x, z, radius);      // underground: the walls of the rooms
    for (let i = 0; i < this.obstacles.length; i++) {
      const o = this.obstacles[i];
      const dx = x - o.x, dz = z - o.z;
      const d2 = dx * dx + dz * dz;
      const rr = o.r + radius;
      if (d2 < rr * rr && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        x = o.x + (dx / d) * rr;
        z = o.z + (dz / d) * rr;
      }
    }
    if (this.bounds) return [x, z];
    // arena wall
    const r = Math.hypot(x, z);
    const maxR = ARENA_R - radius - 2;
    if (r > maxR) { x = (x / r) * maxR; z = (z / r) * maxR; }
    return [x, z];
  }

  /** Distance along a ray (dir normalised) to the first solid obstacle, or Infinity.
      Obstacles are upright cylinders; thin ones (trees) let shots through.
      Hits nearer than minT are ignored (the stretch between camera and hero),
      as is any obstacle the ray starts inside (a camera clipped into a pillar). */
  rayObstacle(o, d, maxDist, minT = 0) {
    let best = Infinity;
    const a = d.x * d.x + d.z * d.z;
    if (a < 1e-8) return best;
    for (let i = 0; i < this.obstacles.length; i++) {
      const ob = this.obstacles[i];
      if (ob.r < 0.8) continue;
      const fx = o.x - ob.x, fz = o.z - ob.z;
      const c = fx * fx + fz * fz - ob.r * ob.r;
      if (c < 0) continue;
      const b = fx * d.x + fz * d.z;
      const disc = b * b - a * c;
      if (disc < 0) continue;
      const t = (-b - Math.sqrt(disc)) / a;
      if (t < minT || t > maxDist || t >= best) continue;
      if (o.y + d.y * t > (ob.base ?? (ob.base = terrainHeight(ob.x, ob.z))) + (ob.h ?? 3)) continue; // passes over it
      best = t;
    }
    return best;
  }

  /** is this point inside a solid obstacle? (enemy bolts) */
  pointSolid(x, y, z) {
    for (let i = 0; i < this.obstacles.length; i++) {
      const ob = this.obstacles[i];
      if (ob.r < 0.8) continue;
      const dx = x - ob.x, dz = z - ob.z;
      if (dx * dx + dz * dz > ob.r * ob.r) continue;
      if (y <= (ob.base ?? (ob.base = terrainHeight(ob.x, ob.z))) + (ob.h ?? 3)) return true;
    }
    return false;
  }

  /** raycast against obstacles for line of sight (cheap) */
  blocked(x0, z0, x1, z1, y = 1.4) {
    for (let i = 0; i < this.obstacles.length; i++) {
      const o = this.obstacles[i];
      if (o.r < 1.2) continue;
      // distance from segment to circle centre
      const dx = x1 - x0, dz = z1 - z0;
      const len2 = dx * dx + dz * dz;
      if (len2 < 1e-6) continue;
      let t = ((o.x - x0) * dx + (o.z - z0) * dz) / len2;
      t = clamp(t, 0, 1);
      const px = x0 + dx * t, pz = z0 + dz * t;
      const d = Math.hypot(px - o.x, pz - o.z);
      if (d < o.r * 0.85) {
        const oh = terrainHeight(o.x, o.z);
        if (oh + 2.2 > terrainHeight(x0, z0) + y) return true;
      }
    }
    return false;
  }
}

/** a pine: trunk and stacked tiers, added into a Builder at (x, y, z) */
function pineInto(b, x, y, z, s) {
  const lean = rnd(-0.04, 0.04);
  b.add(new THREE.CylinderGeometry(0.16 * s, 0.26 * s, 2.2 * s, 6), PAL.wood, { pos: [x, y + 1.0 * s, z], rot: [lean, 0, lean], jitter: 0.04 });
  const tiers = 4;
  for (let t = 0; t < tiers; t++) {
    const r = (2.3 - t * 0.48) * s, h = (3.0 - t * 0.3) * s;
    b.add(new THREE.ConeGeometry(r, h, 7, 1), t % 2 ? PAL.pine : PAL.pineDark, {
      pos: [x + lean * t, y + (2.2 + t * 1.55) * s + h * 0.35, z + lean * t], rot: [0, rnd(0, TAU), 0], jitter: 0.06
    });
  }
}

/* merge non-indexed positions/normals/uvs of simple geometries */
function mergeSimple(geos) {
  let total = 0;
  const prepared = geos.map(g => {
    const ng = g.index ? g.toNonIndexed() : g;
    total += ng.attributes.position.count;
    return ng;
  });
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  const uv = new Float32Array(total * 2);
  let o = 0;
  for (const g of prepared) {
    const p = g.attributes.position.array;
    const n = g.attributes.normal ? g.attributes.normal.array : null;
    const u = g.attributes.uv ? g.attributes.uv.array : null;
    pos.set(p, o * 3);
    if (n) nor.set(n, o * 3);
    if (u) uv.set(u, o * 2);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return out;
}
