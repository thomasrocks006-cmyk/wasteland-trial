import * as THREE from 'three';
import {
  TAU, clamp, lerp, smoothstep, rnd, rng, fbm, pick,
  terrainHeight, terrainNormal, Builder, ARENA_R, RIM_R,
  grassTexture, smokeTexture, radialSprite, groundTexture, stoneTexture, clothTexture,
  GRID_SEG, GRID_EXT, gridHeight
} from './core.js';

const _v = new THREE.Vector3();
let STONE_MAT = null;
function stoneMat() {
  if (!STONE_MAT) STONE_MAT = new THREE.MeshLambertMaterial({ vertexColors: true, map: stoneTexture() });
  return STONE_MAT;
}
const _c1 = new THREE.Color(), _c2 = new THREE.Color(), _c3 = new THREE.Color();

const PAL = {
  sandLight: 0xc9a273,
  sandDark: 0x9a6f47,
  sandTop: 0xe6c79b,
  sandPale: 0xe3cbab,
  sandCool: 0xa29491,
  copper: 0x9a5a33,
  verdigris: 0x5f8f7c,
  rock: 0x7a4a2e,
  rockDark: 0x53311c,
  ruin: 0xc3ab93,
  ruinDark: 0x7f6d62,
  ruinLight: 0xdcc6a6,
  metal: 0x4a4038,
  metalRust: 0x7d4426,
  scrub: 0x6b7238,
  scrubDry: 0x8a7f3e,
  wood: 0x6b4a2e,
};

export class World {
  constructor(scene, quality = 'balanced') {
    this.scene = scene;
    this.quality = quality;
    this.obstacles = [];       // {x,z,r,h}: h = top above local ground
    this.shadowTarget = new THREE.Vector3();
    this.time = { value: 0 };
    this.sunDir = new THREE.Vector3(0.42, 0.30, -0.86).normalize(); // low sun, long shadows
    this.build();
  }

  build() {
    const scene = this.scene;
    // linear haze reads as depth; exponential just greys everything out
    scene.fog = new THREE.Fog(0xbaaea3, 42, 600);

    this.buildSky();
    this.buildLights();
    this.buildTerrain();
    this.buildDistantRidges();
    this.buildRocks();
    this.buildRuins();
    this.buildMidfield();
    this.buildLandmarks();
    this.buildOrnaments();
    this.buildVegetation();
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
        uZenith: { value: new THREE.Color(0x3d5f86) },
        uMid: { value: new THREE.Color(0xb98455) },
        uHorizon: { value: new THREE.Color(0xf2cf9d) },
        uGround: { value: new THREE.Color(0x8f6039) },
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
        uniform vec3 uSun, uZenith, uMid, uHorizon, uGround;
        uniform float uTime;

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

          // sun
          float sd = max(dot(d, normalize(uSun)), 0.0);
          col += vec3(1.0,0.72,0.42) * pow(sd, 6.0) * 0.42;
          col += vec3(1.0,0.86,0.62) * pow(sd, 90.0) * 1.35;
          col += vec3(1.0,0.95,0.85) * smoothstep(0.9993, 0.99975, sd) * 3.2;

          // dusty cloud bands near horizon
          if (y > -0.02) {
            vec2 pp = d.xz / max(0.06, y + 0.22) * 1.35;
            float t = uTime * 0.006;
            float f = fbm(pp * 0.9 + vec2(t, t*0.4));
            float f2 = fbm(pp * 2.3 - vec2(t*0.7, 0.0));
            float band = smoothstep(0.42, 0.86, f*0.7 + f2*0.45);
            band *= smoothstep(-0.01, 0.20, y) * (1.0 - smoothstep(0.42, 0.95, y));
            vec3 cc = mix(vec3(0.98,0.86,0.70), vec3(1.0,0.95,0.86), f2);
            col = mix(col, cc, band * 0.62);
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
    const hemi = new THREE.HemisphereLight(0xffdcbb, 0x4e4468, 0.82);
    scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xffe0b0, 2.95);
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

    this.ambient = new THREE.AmbientLight(0x3a4463, 0.22);
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
      const rockAmt = smoothstep(0.88, 0.58, ny);
      // three scales: regional patches, drifts, grain
      const patch = fbm(x * 0.021, z * 0.021, 3);
      const drift = fbm(x * 0.085 + 11, z * 0.085 - 7, 3);
      const grain = fbm(x * 0.42 - 5, z * 0.42 + 3, 2);

      _c1.setHex(PAL.sandDark).lerp(_c2.setHex(PAL.sandLight), clamp(drift * 1.7 - 0.25, 0, 1));
      _c1.lerp(_c3.setHex(PAL.sandPale), smoothstep(2, 20, h) * 0.55);
      // regional cool patches — the thing that stops the whole world being orange
      _c1.lerp(_c2.setHex(PAL.sandCool), clamp((patch - 0.52) * 2.2, 0, 1) * 0.42);

      // rock, broken up with copper seams and verdigris staining
      const rk = _c3.setHex(PAL.rock).lerp(_c2.setHex(PAL.rockDark), drift);
      _c1.lerp(rk, rockAmt * 0.92);
      _c1.lerp(_c2.setHex(PAL.copper), clamp((patch - 0.66) * 3.0, 0, 1) * rockAmt * 0.55);
      _c1.lerp(_c2.setHex(PAL.verdigris), clamp((0.44 - patch) * 2.6, 0, 1) * rockAmt * 0.36);

      // dry scrub on flats
      const scrub = clamp((grain - 0.6) * 2.6, 0, 1) * (1 - rockAmt) * smoothstep(0.6, 4, h);
      _c1.lerp(_c2.setHex(0x7d7a4a), scrub * 0.3);

      // hollows sit darker and cooler; crests stay pale
      const dip = 1 - clamp((h - 1) / 9, 0, 1);
      _c1.offsetHSL(0.003 * (patch - 0.5), 0.015 * (drift - 0.5), (grain - 0.5) * 0.05 - dip * 0.035);
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
    const gt = groundTexture();
    gt.repeat.set(TILES, TILES);
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, map: gt });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    this.scene.add(mesh);
    this.terrain = mesh;
  }

  /* -------------------------------------------------- distant mesas */
  buildDistantRidges() {
    // outer plain so the horizon reads as ground, not a void behind the rim
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(96, 660, 40, 1),
      new THREE.MeshLambertMaterial({ color: 0x8d5f3b })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 9;
    this.scene.add(ring);

    const b = new Builder();
    for (let i = 0; i < 46; i++) {
      const a = (i / 46) * TAU + rnd(-0.06, 0.06);
      const dist = 190 + rnd(0, 120);
      const x = Math.cos(a) * dist, z = Math.sin(a) * dist;
      const w = rnd(42, 96), h = rnd(16, 40), d = rnd(38, 80);
      const g = new THREE.CylinderGeometry(w * 0.55, w, h, 5 + Math.floor(rng() * 3), 1);
      b.add(g, pick([0x8a5c3a, 0x9a6a44, 0x764c2e]), {
        pos: [x, 9 + h * 0.46, z],
        rot: [0, rnd(0, TAU), 0], scale: [1, 1, d / w], jitter: 0.07
      });
    }
    const mesh = new THREE.Mesh(b.build(), new THREE.MeshLambertMaterial({ vertexColors: true }));
    mesh.frustumCulled = false;
    this.scene.add(mesh);
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
        col.setHex(pick([0x8b6239, 0x9c7043, 0x74502f, 0xa87c50])).offsetHSL(0, 0, rnd(-0.05, 0.05));
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

    // wrecked metal husks (KG tech debris)
    for (let i = 0; i < 7; i++) {
      const a = rnd(0, TAU), r = rnd(20, ARENA_R - 14);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const y0 = terrainHeight(x, z);
      const rot = rnd(0, TAU);
      b.add(new THREE.BoxGeometry(3.6, 1.5, 5.4), PAL.metal, { pos: [x, y0 + 0.7, z], rot: [rnd(-0.1, 0.1), rot, rnd(-0.12, 0.12)], jitter: 0.06 });
      b.add(new THREE.BoxGeometry(3.0, 1.0, 2.0), PAL.metalRust, { pos: [x, y0 + 1.7, z], rot: [0.1, rot, 0], jitter: 0.08 });
      b.add(new THREE.CylinderGeometry(0.5, 0.5, 1.2, 7), PAL.metal, {
        pos: [x + Math.cos(rot) * 2.6, y0 + 1.0, z + Math.sin(rot) * 2.6], rot: [Math.PI / 2, rot, 0], jitter: 0.05
      });
      this.obstacles.push({ x, z, r: 2.6, h: 2.2 });
    }

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
        if (this.isClear(x, z, pad)) return [x, z];
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
      const y0 = terrainHeight(s[0], s[1]);
      const hh = rnd(2.4, 5.2), r0 = rnd(0.16, 0.3);
      b.add(new THREE.CylinderGeometry(r0 * 0.55, r0, hh, 5), 0x574130, {
        pos: [s[0], y0 + hh / 2 - 0.12, s[1]],
        rot: [rnd(-0.07, 0.07), rnd(0, TAU), rnd(-0.09, 0.09)], jitter: 0.05
      });
      for (let k = 0; k < 2; k++) {
        const a = rnd(0, TAU), bl = rnd(0.8, 1.7), tilt = rnd(0.7, 1.2);
        b.add(new THREE.CylinderGeometry(r0 * 0.28, r0 * 0.5, bl, 4), 0x4d3a2b, {
          pos: [s[0] + Math.cos(a) * bl * 0.35, y0 + hh * rnd(0.6, 0.9) + bl * 0.2, s[1] + Math.sin(a) * bl * 0.35],
          rot: [tilt * Math.sin(a), rnd(0, TAU), -tilt * Math.cos(a)], jitter: 0.05
        });
      }
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
      small.add(new THREE.DodecahedronGeometry(sz, 0), pick([PAL.rock, PAL.rockDark, PAL.sandCool]), {
        pos: [x, terrainHeight(x, z) + sz * 0.28, z],
        rot: [rnd(0, TAU), rnd(0, TAU), rnd(0, TAU)], jitter: 0.06
      });
    }

    // ---- bones: an old ribcage, half sunk
    for (let i = 0; i < 5; i++) {
      const s = spot(14, 48, 2.8);
      if (!s) continue;
      const y0 = terrainHeight(s[0], s[1]);
      const rotY = rnd(0, TAU), rr = rnd(0.7, 1.4);
      for (let k = 0; k < 4; k++) {
        const t = k * 0.55;
        small.add(new THREE.TorusGeometry(rr, 0.07, 3, 7, Math.PI), bone, {
          pos: [s[0] + Math.cos(rotY) * t, y0 - 0.05, s[1] + Math.sin(rotY) * t],
          rot: [0, rotY + Math.PI / 2, 0], jitter: 0.05
        });
      }
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

    // ---- a dead city on the far horizon
    for (let i = 0; i < 34; i++) {
      const a = rnd(-0.55, 0.75);
      const d = rnd(380, 620);
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      const w = rnd(14, 38), h = rnd(38, 104), dep = rnd(14, 38);
      b.add(new THREE.BoxGeometry(w, h, dep), pick([0x6d4a30, 0x7d573a, 0x5c3d26]), {
        pos: [x, PLAIN_Y + h / 2 - 4, z], rot: [0, rnd(0, TAU), 0], jitter: 0.06
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

    const COUNT = this.quality === 'fast' ? 700 : this.quality === 'high' ? 2200 : 1500;
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
      if (nrm.y < 0.86) continue;               // no grass on cliffs
      if (fbm(x * 0.05, z * 0.05, 2) < 0.42) continue; // clumping
      const s = rnd(0.45, 1.05);
      d.position.set(x, h - 0.05, z);
      d.rotation.set(0, rnd(0, TAU), 0);
      d.scale.set(s * rnd(0.8, 1.2), s * rnd(0.75, 1.5), s);
      d.updateMatrix();
      grass.setMatrixAt(n, d.matrix);
      col.setHSL(rnd(0.09, 0.14), rnd(0.35, 0.55), rnd(0.32, 0.5));
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
      if (Math.hypot(x, z) < 15) continue;
      const s = rnd(0.6, 1.5);
      d.position.set(x, terrainHeight(x, z) - s * 0.12, z);
      d.rotation.set(rnd(-0.1, 0.1), rnd(0, TAU), rnd(-0.1, 0.1));
      d.scale.set(s, s * rnd(0.78, 1.15), s);
      d.updateMatrix();
      shrubs.setMatrixAt(sn, d.matrix);
      col.setHex(pick([PAL.scrub, PAL.scrubDry, 0x5d6630, 0x7a6a34])).offsetHSL(0, 0, rnd(-0.04, 0.04));
      shrubs.setColorAt(sn, col);
      sn++;
    }
    shrubs.count = sn;
    shrubs.instanceMatrix.needsUpdate = true;
    shrubs.instanceColor.needsUpdate = true;
    this.scene.add(shrubs);

    // ---- dead trees (merged)
    const b = new Builder();
    for (let i = 0; i < 16; i++) {
      const a = rnd(0, TAU), r = rnd(22, ARENA_R - 12);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      let y = terrainHeight(x, z);
      const th = rnd(4, 8);
      let tx = x, tz = z;
      const lean = rnd(-0.14, 0.14), leanZ = rnd(-0.14, 0.14);
      const segs = 5;
      for (let s = 0; s < segs; s++) {
        const sh = th / segs;
        const rr = lerp(0.34, 0.13, s / segs);
        b.add(new THREE.CylinderGeometry(rr * 0.82, rr, sh * 1.05, 6), PAL.wood, {
          pos: [tx, y + sh / 2, tz], rot: [leanZ, rnd(0, TAU), lean], jitter: 0.05
        });
        y += sh;
        tx += lean * sh * 0.5; tz += leanZ * sh * 0.5;
        // branches
        if (s >= 2 && rng() > 0.35) {
          const bl = rnd(1.2, 2.6);
          const ba = rnd(0, TAU);
          b.add(new THREE.CylinderGeometry(0.06, 0.12, bl, 5), PAL.wood, {
            pos: [tx + Math.cos(ba) * bl * 0.35, y + rnd(0, 0.4), tz + Math.sin(ba) * bl * 0.35],
            rot: [Math.PI / 2 - rnd(0.2, 0.7), ba, 0], jitter: 0.04
          });
        }
      }
      this.obstacles.push({ x, z, r: 0.55, h: 4 });
    }
    const trees = new THREE.Mesh(b.build(), new THREE.MeshLambertMaterial({ vertexColors: true }));
    trees.castShadow = true;
    this.scene.add(trees);
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
      col.setHex(pick([0x9b7648, 0x7d5c38, 0xb08a58, 0x6b4f31])).offsetHSL(0, 0, rnd(-0.05, 0.06));
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
    const m = new THREE.PointsMaterial({
      size: 0.16, map: smokeTexture(), transparent: true, opacity: 0.32,
      depthWrite: false, blending: THREE.NormalBlending, color: 0xffdcae, sizeAttenuation: true
    });
    const pts = new THREE.Points(g, m);
    pts.frustumCulled = false;
    this.scene.add(pts);
    this.dust = pts;
  }

  /* -------------------------------------------------- per frame */
  update(dt, t, playerPos, camera) {
    this.time.value = t;

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
    }

    // shadow frustum follows the player
    const s = this.sun;
    this.shadowTarget.set(playerPos.x, terrainHeight(playerPos.x, playerPos.z), playerPos.z);
    s.position.copy(this.shadowTarget).add(this.sunDir.clone().multiplyScalar(70));
    s.target.position.copy(this.shadowTarget);
    s.target.updateMatrixWorld();

    // fill light rides the camera so the hero reads against the sand
    if (this.fill && camera) {
      this.fill.position.copy(camera.position);
      this.fill.position.y += 4;
      this.fill.target.position.set(playerPos.x, playerPos.y + 1.1, playerPos.z);
      this.fill.target.updateMatrixWorld();
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
