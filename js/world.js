import * as THREE from 'three';
import {
  TAU, clamp, lerp, smoothstep, rnd, rng, fbm, pick,
  terrainHeight, terrainNormal, Builder, ARENA_R, RIM_R,
  grassTexture, smokeTexture, radialSprite, groundTexture, GRID_SEG, GRID_EXT, gridHeight
} from './core.js';

const _v = new THREE.Vector3();
const _c1 = new THREE.Color(), _c2 = new THREE.Color(), _c3 = new THREE.Color();

const PAL = {
  sandLight: 0xc9a273,
  sandDark: 0x9a6f47,
  sandTop: 0xe6c79b,
  rock: 0x7a4a2e,
  rockDark: 0x53311c,
  ruin: 0xbda181,
  ruinDark: 0x8b7154,
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
    this.obstacles = [];       // {x,z,r,h}
    this.shadowTarget = new THREE.Vector3();
    this.time = { value: 0 };
    this.sunDir = new THREE.Vector3(0.42, 0.30, -0.86).normalize(); // low sun, long shadows
    this.build();
  }

  build() {
    const scene = this.scene;
    scene.fog = new THREE.FogExp2(0xd7a878, 0.0062);

    this.buildSky();
    this.buildLights();
    this.buildTerrain();
    this.buildDistantRidges();
    this.buildRocks();
    this.buildRuins();
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
    const hemi = new THREE.HemisphereLight(0xffd3a3, 0x6b4526, 0.98);
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

    this.ambient = new THREE.AmbientLight(0xffc9a0, 0.14);
    scene.add(this.ambient);

    // camera-side fill so the hero and enemies never fall into silhouette
    const fill = new THREE.DirectionalLight(0xffe2c0, 0.85);
    fill.castShadow = false;
    scene.add(fill);
    scene.add(fill.target);
    this.fill = fill;
  }

  /* -------------------------------------------------- terrain */
  buildTerrain() {
    const SEG = GRID_SEG;
    const EXT = GRID_EXT;
    const TILES = 72;
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
      const n1 = fbm(x * 0.038, z * 0.038, 3);
      const n2 = fbm(x * 0.14 + 11, z * 0.14 - 7, 2);
      _c1.setHex(PAL.sandDark).lerp(_c2.setHex(PAL.sandLight), clamp(n1 * 1.9 - 0.35, 0, 1));
      _c1.lerp(_c3.setHex(PAL.sandTop), smoothstep(3, 22, h) * 0.5);
      const rk = _c3.setHex(PAL.rock).lerp(_c2.setHex(PAL.rockDark), n1);
      _c1.lerp(rk, rockAmt * 0.92);
      // dry scrub tint on flats
      const scrub = clamp((n2 - 0.58) * 2.4, 0, 1) * (1 - rockAmt) * smoothstep(0.6, 4, h);
      _c1.lerp(_c2.setHex(0x7d7a4a), scrub * 0.35);
      _c1.offsetHSL(0, 0, (n2 - 0.5) * 0.055);
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
        if (s > 1.5) this.obstacles.push({ x, z, r: s * 0.75 });
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
      let y = y0;
      let cx = x, cz = z;
      for (let s = 0; s < segs; s++) {
        const sh = h / segs;
        const g = new THREE.CylinderGeometry(r * (1 - s * 0.03), r * (1.04 - s * 0.03), sh * 1.01, 8, 1);
        b.add(g, pick([PAL.ruin, PAL.ruinDark, PAL.ruinLight]), {
          pos: [cx, y + sh / 2, cz],
          rot: [tilt * (s / segs) * 0.5, rnd(0, TAU), tilt * (s / segs)],
          jitter: 0.05
        });
        y += sh;
        cx += Math.sin(tilt * (s / segs)) * sh * 0.4;
      }
      // broken cap
      if (rng() > 0.4) {
        b.add(new THREE.BoxGeometry(r * 2.5, r * 0.5, r * 2.5), PAL.ruinDark,
          { pos: [x, y0 + h + r * 0.2, z], rot: [rnd(-0.2, 0.2), rnd(0, TAU), rnd(-0.25, 0.25)], jitter: 0.06 });
      }
      this.obstacles.push({ x, z, r: r * 1.05 });
    };

    const wall = (x, z, len, h, rotY) => {
      const y0 = terrainHeight(x, z);
      const n = Math.max(2, Math.floor(len / 3.2));
      for (let i = 0; i < n; i++) {
        const t = (i / (n - 1) - 0.5) * len;
        const wx = x + Math.cos(rotY) * t, wz = z + Math.sin(rotY) * t;
        const hh = h * rnd(0.55, 1.0);
        b.add(new THREE.BoxGeometry(3.1, hh, 0.85), pick([PAL.ruin, PAL.ruinDark, PAL.ruinLight]), {
          pos: [wx, terrainHeight(wx, wz) + hh / 2 - 0.2, wz],
          rot: [0, rotY, rnd(-0.03, 0.03)], jitter: 0.055
        });
        this.obstacles.push({ x: wx, z: wz, r: 1.5 });
      }
    };

    // --- central dais
    const daisY = terrainHeight(0, 0);
    // the dais is solid: without this the player could stand inside it
    this.obstacles.push({ x: 0, z: 0, r: 9.3 });
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
        this.obstacles.push({ x, z, r: 3 });
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
      this.obstacles.push({ x, z, r: 2.6 });
    }

    const geo = b.build();
    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
    mesh.castShadow = true; mesh.receiveShadow = true;
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
      this.obstacles.push({ x, z, r: 0.55 });
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
