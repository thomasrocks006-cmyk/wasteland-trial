import * as THREE from 'three';
import { clamp, lerp, rnd, rng, radialSprite, smokeTexture, TAU, terrainHeight } from './core.js';

const _q = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);
const _m4 = new THREE.Matrix4();
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _col = new THREE.Color();

/* ------------------------------------------------------------------ spawn pool */
class Pool {
  constructor(scene, geo, mat, max) {
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.max = max;
    this.items = [];
    this.dummy = new THREE.Object3D();
    scene.add(this.mesh);
  }
  add(item) {
    if (this.items.length >= this.max) this.items.shift();
    this.items.push(item);
  }
  /** write items to the instance buffers with a callback that fills the dummy */
  flush(fn) {
    const n = this.items.length;
    for (let i = 0; i < n; i++) {
      fn(this.items[i], i, this.dummy);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
      _col.setHex(this.items[i].color);
      this.mesh.setColorAt(i, _col);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

export class FX {
  constructor(scene, camera, quality = 'balanced') {
    this.scene = scene;
    this.camera = camera;
    this.quality = quality;

    this.sparkTex = radialSprite('rgba(255,255,255,1)', 'rgba(255,180,80,0)', 64);
    this.smokeTex = smokeTexture();

    // ---- sparks (additive billboards)
    const quad = new THREE.PlaneGeometry(1, 1);
    this.sparks = new Pool(scene, quad, new THREE.MeshBasicMaterial({
      map: this.sparkTex, transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, fog: true, vertexColors: false
    }), quality === 'fast' ? 260 : 520);

    // ---- smoke / dust (soft, normal blend)
    this.smoke = new Pool(scene, quad, new THREE.MeshBasicMaterial({
      map: this.smokeTex, transparent: true, depthWrite: false, opacity: 0.9,
      vertexColors: false, fog: true
    }), quality === 'fast' ? 120 : 260);

    // ---- tracers (thin additive rods oriented in world space)
    const rod = new THREE.CylinderGeometry(0.5, 0.5, 1, 5, 1, true);
    this.tracers = new Pool(scene, rod, new THREE.MeshBasicMaterial({
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
      vertexColors: false, fog: true, side: THREE.DoubleSide, opacity: 0.9
    }), 90);

    // ---- impact decals
    const disc = new THREE.PlaneGeometry(1, 1);
    this.decals = new Pool(scene, disc, new THREE.MeshBasicMaterial({
      map: this.sparkTex, transparent: true, depthWrite: false, opacity: 0.5,
      blending: THREE.NormalBlending, vertexColors: false, fog: true, opacity: 0.55
    }), 46);

    // ---- blood: droplets that fall and land as stains, and stains that stay a while
    {
      const cv = document.createElement('canvas'); cv.width = cv.height = 64; const c = cv.getContext('2d');
      const g = c.createRadialGradient(32, 32, 4, 32, 32, 30); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.6, 'rgba(255,255,255,0.85)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g; c.fillRect(0, 0, 64, 64);
      const drop = new THREE.CanvasTexture(cv);
      this.blood = new Pool(scene, quad, new THREE.MeshBasicMaterial({ map: drop, transparent: true, depthWrite: false, fog: true }), quality === 'fast' ? 140 : 300);
      // a stain: an irregular splash, drawn once
      const cv2 = document.createElement('canvas'); cv2.width = cv2.height = 128; const c2 = cv2.getContext('2d');
      const r = rng;
      c2.fillStyle = 'rgba(255,255,255,0.95)';
      for (let i = 0; i < 26; i++) { const a = r() * TAU, d = i < 6 ? r() * 14 : 18 + r() * 40, rad = i < 6 ? 16 + r() * 10 : 2 + r() * 7; c2.beginPath(); c2.arc(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, rad, 0, TAU); c2.fill(); }
      const stain = new THREE.CanvasTexture(cv2);
      this.stains = new Pool(scene, new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: stain, transparent: true, depthWrite: false, opacity: 0.82, fog: true, polygonOffset: true, polygonOffsetFactor: -2 }), 90);
    }

    // ---- shockwave rings
    const ringGeo = new THREE.RingGeometry(0.72, 1.0, 20);
    this.rings = new Pool(scene, ringGeo, new THREE.MeshBasicMaterial({
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
      side: THREE.DoubleSide, vertexColors: false
    }), 18);

    // ---- muzzle flash sprite pool
    this.flashTex = radialSprite('rgba(255,250,225,1)', 'rgba(255,120,30,0)', 128);
    this.flashes = [];
    for (let i = 0; i < 8; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.flashTex, transparent: true, blending: THREE.AdditiveBlending,
        depthWrite: false, depthTest: true, opacity: 0
      }));
      s.visible = false;
      s.scale.setScalar(0.001);
      scene.add(s);
      this.flashes.push({ sprite: s, life: 0, max: 1, size: 1 });
    }
    this.flashLight = new THREE.PointLight(0xffa040, 0, 12, 2);
    this.flashLight.visible = true;      // always counted (intensity 0 when idle): a light that appears recompiles every material
    scene.add(this.flashLight);

    // 3D muzzle cone so the flash reads from behind the shoulder too
    const coneGeo = new THREE.ConeGeometry(0.11, 0.6, 6, 1, true);
    coneGeo.translate(0, 0.30, 0);
    this.flashCone = new THREE.Mesh(coneGeo, new THREE.MeshBasicMaterial({
      color: 0xffd0a0, transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide, opacity: 0
    }));
    this.flashCone.visible = false;
    this.flashCone.frustumCulled = false;
    scene.add(this.flashCone);
    this.coneLife = 0;

    // ---- debris: rock and shell chunks that fly, spin, bounce and settle
    this.debrisPool = new Pool(scene, new THREE.DodecahedronGeometry(0.5, 0),
      new THREE.MeshLambertMaterial({ flatShading: true }), quality === 'fast' ? 50 : 110);
    this.debrisPool.mesh.castShadow = true;

    // ---- slash arcs: a crescent of light along the blade's path
    this.slashes = [];
    const arcTex = (() => {
      const cv = document.createElement('canvas'); cv.width = 128; cv.height = 8;
      const c = cv.getContext('2d');
      const g = c.createLinearGradient(0, 0, 128, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.55, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,1)');
      c.fillStyle = g; c.fillRect(0, 0, 128, 8);
      const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
    })();
    for (let i = 0; i < 4; i++) {
      // ring sector; uv.x runs inner to outer edge, so the bright edge is the blade tip
      const geo = new THREE.RingGeometry(0.35, 1.0, 28, 1, -1.15, 2.3);
      const uv = geo.attributes.uv, pa = geo.attributes.position;
      for (let k = 0; k < uv.count; k++) uv.setXY(k, (Math.hypot(pa.getX(k), pa.getY(k)) - 0.35) / 0.65, 0.5);
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        map: arcTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
        depthWrite: false, side: THREE.DoubleSide, toneMapped: false
      }));
      m.rotation.order = 'YXZ';
      m.visible = false;
      scene.add(m);
      this.slashes.push({ m, life: 0 });
    }

    // ---- blade trail: a ribbon between the blade's tip and hilt over the last moments
    this.trail = { samples: [], N: 18 };
    {
      const N = this.trail.N;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 2 * 3), 3));
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(N * 2 * 3), 3));
      const idx = [];
      for (let i = 0; i < N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      g.setIndex(idx);
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
        vertexColors: true, transparent: true, blending: THREE.AdditiveBlending,
        depthWrite: false, side: THREE.DoubleSide, toneMapped: false
      }));
      m.frustumCulled = false; m.visible = false;
      scene.add(m);
      this.trail.mesh = m;
    }
    // ---- spears in flight, and stuck where they landed
    this.spears = [];

    // ---- damage numbers (DOM)
    this.dmgLayer = document.getElementById('dmgLayer');
    this.numbers = [];

    // ---- world-space points for pickup beams etc
    this.tmp = new THREE.Vector3();
  }

  /* ---------------- primitives ---------------- */
  spark(pos, dir, color = 0xffb040, count = 6, speed = 6, size = 0.12, life = 0.4) {
    for (let i = 0; i < count; i++) {
      _v1.set(rnd(-1, 1), rnd(-0.3, 1.2), rnd(-1, 1)).normalize().multiplyScalar(rnd(speed * 0.35, speed));
      if (dir) _v1.addScaledVector(dir, rnd(0.4, 1.4) * speed * 0.5);
      this.sparks.add({
        x: pos.x, y: pos.y, z: pos.z,
        vx: _v1.x, vy: _v1.y, vz: _v1.z,
        life, max: life, size: size * rnd(0.6, 1.4), sizeEnd: size * 0.15,
        color, grav: 9, drag: 3.1, rot: rnd(0, TAU)
      });
    }
  }

  puff(pos, dir, color = 0xb08a62, size = 0.6, count = 1, life = 0.9, speed = 1.2) {
    for (let i = 0; i < count; i++) {
      const d = dir ? dir.clone().multiplyScalar(rnd(0.2, 1) * speed) : new THREE.Vector3(rnd(-1, 1), rnd(0, 1), rnd(-1, 1)).multiplyScalar(speed * 0.5);
      this.smoke.add({
        x: pos.x + rnd(-0.2, 0.2), y: pos.y + rnd(-0.1, 0.2), z: pos.z + rnd(-0.2, 0.2),
        vx: d.x, vy: d.y + rnd(0.2, 0.9), vz: d.z,
        life: life * rnd(0.8, 1.3), max: life, size: size * rnd(0.7, 1.3), sizeEnd: size * rnd(2.2, 3.4),
        color, grav: -0.4, drag: 1.5, rot: rnd(0, TAU), spin: rnd(-1, 1), alpha: 0.55
      });
    }
  }

  tracer(from, to, color = 0xffc070, width = 0.035, life = 0.075) {
    const dir = _v2.subVectors(to, from);
    const len = dir.length();
    if (len < 0.01) return;
    // evenly sample the line so long shots stay bright
    const segs = Math.min(6, Math.max(1, Math.round(len / 14)));
    const stepV = dir.clone().divideScalar(segs);
    for (let i = 0; i < segs; i++) {
      const p0 = from.clone().addScaledVector(stepV, i);
      const p1 = p0.clone().add(stepV);
      this.tracers.add({
        x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2, z: (p0.z + p1.z) / 2,
        dir: stepV.clone().normalize(), len: stepV.length() * 1.02,
        width, life: life * 1.6, max: life * 1.6, color
      });
    }
  }

  beam(from, to, color = 0x66e0ff, width = 0.09, life = 0.22) {
    const dir = _v2.subVectors(to, from);
    const len = dir.length();
    if (len < 0.01) return;
    this.tracers.add({
      x: (from.x + to.x) / 2, y: (from.y + to.y) / 2, z: (from.z + to.z) / 2,
      dir: dir.clone().normalize(), len, width,
      life, max: life, color, beam: true
    });
  }

  decal(pos, normal, size = 0.32, color = 0x2a1a10, life = 5) {
    this.decals.add({
      x: pos.x + normal.x * 0.03, y: pos.y + normal.y * 0.03, z: pos.z + normal.z * 0.03,
      n: normal.clone(), size, life, max: life, color
    });
  }

  /** blood from a cut: a spray along the blade's travel, a fine mist, and drops that stain the ground where they land */
  bleed(pos, dir, amount = 1) {
    const n = Math.round((this.quality === 'fast' ? 9 : 16) * amount);
    for (let i = 0; i < n; i++) {
      _v1.set(rnd(-1, 1), rnd(-0.2, 1), rnd(-1, 1)).normalize().multiplyScalar(rnd(0.6, 2.6));
      if (dir) _v1.addScaledVector(dir, rnd(1.0, 3.0) * Math.min(amount, 1.3));     // a big blow makes more blood, not faster blood
      this.blood.add({ x: pos.x, y: pos.y, z: pos.z, vx: _v1.x, vy: _v1.y + 0.8, vz: _v1.z, life: 1.4, max: 1.4, size: rnd(0.025, 0.07) * (0.8 + amount * 0.4), color: Math.random() < 0.5 ? 0x5a0505 : 0x7a0b08, stain: Math.random() < 0.35 });
    }
    this.puff(pos, dir, 0x4a0806, 0.22 * amount, 2, 0.45, 0.8);
    if (amount > 1.2) this.stain(pos.x, pos.z, 0.5 + amount * 0.25);
  }
  stain(x, z, size = 0.5) {
    const y = terrainHeight(x, z) + 0.025;
    this.stains.add({ x, y, z, size: size * rnd(0.7, 1.3), rot: rnd(0, TAU), life: 40, max: 40, color: Math.random() < 0.5 ? 0x3a0303 : 0x4c0606 });
  }

  ring(pos, color = 0xffa040, radius = 3, life = 0.4, thickness = 1) {
    this.rings.add({ x: pos.x, y: pos.y, z: pos.z, r0: radius * 0.25, r1: radius, life, max: life, color, flat: true });
  }

  muzzleFlash(pos, dir, color = 0xffb060, size = 1) {
    const f = this.flashes.reduce((a, b) => (a.life > b.life ? b : a));
    f.sprite.position.copy(pos);
    f.sprite.material.color.setHex(color);
    f.sprite.material.rotation = rnd(0, TAU);
    f.sprite.visible = true;
    f.life = 0.09;
    f.max = 0.09;
    f.size = size * rnd(0.85, 1.3);
    this.flashLight.position.copy(pos);
    this.flashLight.color.setHex(color);
    this.flashLight.intensity = 12 * size;
    this.flashLight.visible = true;
    this.flashLightLife = 0.06;
    // 3D cone along the shot direction
    if (this.flashCone && dir) {
      this.flashCone.position.copy(pos);
      _q.setFromUnitVectors(_up, dir.clone().normalize());
      this.flashCone.quaternion.copy(_q);
      this.flashCone.scale.setScalar(size * rnd(0.85, 1.15));
      this.flashCone.material.color.setHex(color);
      this.flashCone.material.opacity = 0.9;
      this.flashCone.visible = true;
      this.coneLife = 0.07;
    }
    // sparks from the barrel
    this.spark(pos, dir, color, 3, 7, 0.09, 0.18);
  }

  /** n chunks thrown out of pos; they obey gravity and bounce on the real ground */
  debris(pos, n = 10, power = 1, colors = [0x4a3a2d, 0x2f2620, 0x6a5643, 0x3a2f27]) {
    for (let i = 0; i < n; i++) {
      const a = rnd(0, TAU), up = rnd(0.45, 1);
      const sp = rnd(3, 8) * power;
      this.debrisPool.add({
        x: pos.x, y: pos.y + 0.2, z: pos.z,
        vx: Math.cos(a) * sp * (1 - up * 0.5), vy: sp * up + 2, vz: Math.sin(a) * sp * (1 - up * 0.5),
        rx: rnd(0, TAU), ry: rnd(0, TAU), wx: rnd(-12, 12), wy: rnd(-12, 12),
        size: rnd(0.16, 0.38) * Math.sqrt(power), life: rnd(2.2, 3.2), color: colors[i % colors.length],
      });
    }
  }

  updateDebris(dt) {
    const P = this.debrisPool;
    P.items = P.items.filter((d) => {
      d.life -= dt;
      if (d.life <= 0) return false;
      d.vy -= 22 * dt;
      d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
      d.rx += d.wx * dt; d.ry += d.wy * dt;
      const g = terrainHeight(d.x, d.z) + d.size * 0.5;
      if (d.y < g) {
        d.y = g;
        if (d.vy < -1.5) { d.vy *= -0.38; d.vx *= 0.62; d.vz *= 0.62; d.wx *= 0.5; d.wy *= 0.5; }
        else { d.vy = 0; const f = Math.exp(-7 * dt); d.vx *= f; d.vz *= f; d.wx *= f; d.wy *= f; }
      }
      return true;
    });
    P.flush((d, i, o) => {
      o.position.set(d.x, d.y, d.z);
      o.rotation.set(d.rx, d.ry, 0);
      o.scale.setScalar(d.size * clamp(d.life / 0.5, 0, 1));
    });
  }

  trailSample(tip, base, color) {
    this.trail.samples.unshift({ tip: tip.clone(), base: base.clone(), t: 0, color });
    if (this.trail.samples.length > this.trail.N) this.trail.samples.length = this.trail.N;
  }

  /** a thrown spear: a copy of the hand's spear flies the path and sticks where it lands */
  spearFlight(from, end, dur, model, hitEnemy) {
    window.__perfTag && window.__perfTag('spear');
    let s = this.spears.find((q) => q.life <= 0);
    if (!s) {
      if (this.spears.length >= 4) s = this.spears.reduce((a, b) => (a.life < b.life ? a : b));
      else { s = { obj: model.clone(), life: 0 }; this.scene.add(s.obj); this.spears.push(s); }
    }
    s.from = from.clone(); s.end = end.clone(); s.dur = dur; s.t = 0;
    s.stick = hitEnemy ? 0.15 : 2.5;
    s.life = dur + s.stick;
    s.dir = end.clone().sub(from).normalize();
    s.arc = Math.min(1.2, from.distanceTo(end) * 0.04);
    s.obj.visible = true;
  }

  /** style R/L: a horizontal sweep; O: an overhead arc in the vertical plane */
  slash(pos, yaw, style, color, reach = 2.6) {
    const s = this.slashes.reduce((a, b) => (a.life < b.life ? a : b));
    const m = s.m;
    m.position.copy(pos);
    // a ring sector's local +X is turned to face along the swing (forward = yaw)
    if (style === 'O') m.rotation.set(0, yaw - Math.PI / 2, Math.PI / 2 - 0.25);
    else m.rotation.set(-Math.PI / 2, yaw - Math.PI / 2, 0);
    m.scale.set(reach, style === 'L' ? -reach : reach, reach);
    m.material.color.setHex(color);
    m.visible = true;
    s.life = 0.22; s.max = 0.22;
  }

  explosion(pos, radius = 4, color = 0xff8a30) {
    this.debris(pos, 12, radius / 4.8);
    this.spark(pos, null, 0xffd080, 26, 12, 0.40, 1.0);
    this.spark(pos, null, color, 18, 8, 0.55, 1.1);
    this.puff(pos, null, 0x6b5236, radius * 0.5, 9, 1.5, 3.2);
    this.ring(pos, color, radius * 1.4, 0.42);
    const f = this.flashes.reduce((a, b) => (a.life > b.life ? b : a));
    f.sprite.position.copy(pos);
    f.sprite.material.color.setHex(0xffd0a0);
    f.sprite.visible = true;
    f.life = 0.12; f.max = 0.12; f.size = radius * 1.9;
    this.flashLight.position.copy(pos);
    this.flashLight.color.setHex(0xffa040);
    this.flashLight.intensity = 40;
    this.flashLight.visible = true;
    this.flashLightLife = 0.14;
  }

  ecoBurst(pos, color = 0x37e0c8, count = 14, power = 1) {
    this.spark(pos, null, color, count, 7 * power, 0.2, 0.8);
    this.spark(pos, null, 0xd8fff4, Math.round(count * 0.4), 4 * power, 0.12, 0.6);
  }

  hitSpark(pos, dir, crit = false) {
    this.spark(pos, dir, crit ? 0xffe080 : 0xffa850, crit ? 9 : 5, 7, crit ? 0.16 : 0.1, 0.32);
    if (crit) this.ring(pos, 0xffd060, 1.1, 0.25);
  }

  /* ---------------- damage numbers ---------------- */
  damageNumber(worldPos, amount, crit = false) {
    const el = document.createElement('div');
    el.className = 'dmgNum' + (crit ? ' crit' : '');
    el.textContent = Math.round(amount);
    this.dmgLayer.appendChild(el);
    this.numbers.push({
      el, pos: worldPos.clone().add(new THREE.Vector3(rnd(-0.3, 0.3), rnd(0.1, 0.5), rnd(-0.3, 0.3))),
      life: 0.75, max: 0.75
    });
  }

  /* ---------------- update ---------------- */
  update(dt) {
    const cam = this.camera;
    this.updateDebris(dt);
    // blade trail: newest sample brightest, tip brighter than the hilt
    {
      const T = this.trail, S = T.samples;
      for (const q of S) q.t += dt;
      while (S.length && S[S.length - 1].t > 0.14) S.pop();
      const pa = T.mesh.geometry.attributes.position, ca = T.mesh.geometry.attributes.color;
      if (S.length < 2) T.mesh.visible = false;
      else {
        T.mesh.visible = true;
        for (let i = 0; i < T.N; i++) {
          const q = S[Math.min(i, S.length - 1)];
          const k = i < S.length ? Math.max(0, 1 - q.t / 0.14) * (1 - i / T.N) : 0;
          _col.setHex(q.color);
          pa.setXYZ(i * 2, q.tip.x, q.tip.y, q.tip.z);
          pa.setXYZ(i * 2 + 1, q.base.x + (q.tip.x - q.base.x) * 0.45, q.base.y + (q.tip.y - q.base.y) * 0.45, q.base.z + (q.tip.z - q.base.z) * 0.45);
          ca.setXYZ(i * 2, _col.r * k * 1.4, _col.g * k * 1.4, _col.b * k * 1.4);
          ca.setXYZ(i * 2 + 1, _col.r * k * 0.15, _col.g * k * 0.15, _col.b * k * 0.15);
        }
        pa.needsUpdate = true; ca.needsUpdate = true;
        T.mesh.geometry.computeBoundingSphere();
      }
    }
    // spears: fly along a shallow arc, point first, then stay stuck a moment
    for (const sp of this.spears) {
      if (sp.life <= 0) continue;
      sp.life -= dt; sp.t += dt;
      const k = Math.min(1, sp.t / sp.dur);
      const o = sp.obj;
      o.position.copy(sp.from).lerp(sp.end, k);
      o.position.y += Math.sin(k * Math.PI) * sp.arc;
      // the model points along its local -y; tip lands on the target
      _v1.copy(sp.dir); if (k < 1) _v1.y += Math.cos(k * Math.PI) * sp.arc * Math.PI / Math.max(1, sp.from.distanceTo(sp.end)); _v1.normalize();
      o.quaternion.setFromUnitVectors(_v2.set(0, -1, 0), _v1);
      o.position.addScaledVector(_v1, k >= 1 ? -1.25 : -0.9);
      if (sp.life <= 0) o.visible = false;
    }
    for (const s of this.slashes) {
      if (s.life <= 0) continue;
      s.life -= dt;
      const k = Math.max(0, s.life / s.max);
      s.m.material.opacity = k * 0.9;
      s.m.scale.multiplyScalar(1 + dt * 0.9);
      if (s.life <= 0) s.m.visible = false;
    }

    // sparks
    this.sparks.items = this.sparks.items.filter(p => {
      p.life -= dt;
      if (p.life <= 0) return false;
      p.vy -= p.grav * dt;
      const damp = Math.exp(-p.drag * dt);
      p.vx *= damp; p.vz *= damp; p.vy *= damp;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      return true;
    });
    this.sparks.flush((p, i, d) => {
      const t = 1 - p.life / p.max;
      const s = lerp(p.size, p.sizeEnd, t) * (1 - t * 0.15);
      d.position.set(p.x, p.y, p.z);
      d.quaternion.copy(cam.quaternion);
      d.scale.set(s, s, s);
    });

    // blood
    this.blood.items = this.blood.items.filter(p => {
      p.life -= dt;
      if (p.life <= 0) return false;
      p.vy -= 9.8 * dt;
      const damp = Math.exp(-0.9 * dt);
      p.vx *= damp; p.vz *= damp;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.vy < 0 && p.y < terrainHeight(p.x, p.z) + 0.02) { if (p.stain) this.stain(p.x, p.z, rnd(0.08, 0.22)); return false; }
      return true;
    });
    this.blood.flush((p, i, d) => {
      d.position.set(p.x, p.y, p.z);
      d.quaternion.copy(cam.quaternion);
      const sp = Math.min(1.8, 1 + Math.hypot(p.vx, p.vy, p.vz) * 0.08);     // drops stretch a little as they fly
      d.scale.set(p.size, p.size * sp, p.size);
    });
    this.stains.items = this.stains.items.filter(st => { st.life -= dt; return st.life > 0; });
    this.stains.flush((st, i, d) => {
      d.position.set(st.x, st.y, st.z);
      d.rotation.set(-Math.PI / 2, 0, st.rot);
      const k = Math.min(1, (st.max - st.life) * 6);                     // spreads as it lands
      const s = st.size * (0.4 + 0.6 * k);
      d.scale.set(s, s, s);
    });

    // smoke
    this.smoke.items = this.smoke.items.filter(p => {
      p.life -= dt;
      if (p.life <= 0) return false;
      p.vy -= p.grav * dt;
      const damp = Math.exp(-p.drag * dt);
      p.vx *= damp; p.vz *= damp; p.vy *= damp;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.rot += (p.spin || 0) * dt;
      return true;
    });
    this.smoke.flush((p, i, d) => {
      const t = 1 - p.life / p.max;
      const s = lerp(p.size, p.sizeEnd, Math.pow(t, 0.6));
      d.position.set(p.x, p.y, p.z);
      d.quaternion.copy(cam.quaternion);
      d.rotateZ(p.rot);
      d.scale.set(s, s, s);
    });

    // tracers
    this.tracers.items = this.tracers.items.filter(t => {
      t.life -= dt;
      return t.life > 0;
    });
    this.tracers.flush((t, i, d) => {
      const k = clamp(t.life / t.max, 0, 1);
      const shrink = t.beam ? k : 1;
      d.position.set(t.x, t.y, t.z);
      _q.setFromUnitVectors(_up, t.dir);
      d.quaternion.copy(_q);
      d.scale.set(t.width * (t.beam ? 1.4 : 1) * (0.6 + k * 0.6), t.len * shrink, t.width * (0.6 + k * 0.6));
    });

    // decals
    this.decals.items = this.decals.items.filter(dc => {
      dc.life -= dt;
      return dc.life > 0;
    });
    this.decals.flush((dc, i, d) => {
      const k = clamp(dc.life / dc.max, 0, 1);
      d.position.set(dc.x, dc.y, dc.z);
      _q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dc.n);
      d.quaternion.copy(_q);
      const s = dc.size * (0.8 + 0.2 * k);
      d.scale.set(s, s, s);
    });

    // rings
    this.rings.items = this.rings.items.filter(r => {
      r.life -= dt;
      return r.life > 0;
    });
    this.rings.flush((r, i, d) => {
      const t = 1 - r.life / r.max;
      const rad = lerp(r.r0, r.r1, t);
      d.position.set(r.x, r.y, r.z);
      d.rotation.set(-Math.PI / 2, 0, 0);
      d.scale.set(rad, rad, rad);
    });

    // muzzle flash sprites
    for (const f of this.flashes) {
      if (f.life > 0) {
        f.life -= dt;
        const k = Math.max(0, f.life / f.max);
        f.sprite.material.opacity = k;
        f.sprite.scale.setScalar(f.size * (1.5 - k * 0.6));
        if (f.life <= 0) f.sprite.visible = false;
      }
    }
    if (this.flashLightLife > 0) {
      this.flashLightLife -= dt;
      this.flashLight.intensity *= Math.exp(-22 * dt);
      if (this.flashLightLife <= 0) { this.flashLight.intensity = 0; }
    }
    if (this.coneLife > 0) {
      this.coneLife -= dt;
      this.flashCone.material.opacity = Math.max(0, this.coneLife / 0.07) * 0.9;
      if (this.coneLife <= 0) this.flashCone.visible = false;
    }

    // damage numbers
    const w = window.innerWidth, h = window.innerHeight;
    this.numbers = this.numbers.filter(n => {
      n.life -= dt;
      if (n.life <= 0) { n.el.remove(); return false; }
      _v1.copy(n.pos).project(cam);
      if (_v1.z > 1) { n.el.style.opacity = 0; return true; }
      const x = (_v1.x * 0.5 + 0.5) * w;
      const y = (-_v1.y * 0.5 + 0.5) * h;
      n.el.style.left = x + 'px';
      n.el.style.top = y + 'px';
      return true;
    });
  }
}
