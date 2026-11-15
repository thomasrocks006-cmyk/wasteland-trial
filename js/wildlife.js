import * as THREE from 'three';
import {
  TAU, clamp, damp, dampAngle, rnd, rng, pick, terrainHeight, Builder, ARENA_R, waterDist, addRim
} from './core.js';

/* Wildlife: the valley is lived in. Deer graze in small herds and bolt when you
   come close, rabbits hop about and scatter, birds wheel overhead and a hawk
   circles high. None of it fights; it just makes the place feel alive.
   Every animal kind is drawn with instanced meshes, a handful of draw calls in all. */

const _base = new THREE.Matrix4(), _loc = new THREE.Matrix4(), _out = new THREE.Matrix4();
const _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ'), _v = new THREE.Vector3(), _s = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

function mat(rim = 0xffe8c8) {
  return addRim(new THREE.MeshLambertMaterial({ vertexColors: true }), rim, 0.3, 2.8);
}
function inst(scene, geo, m, n) {
  const im = new THREE.InstancedMesh(geo, m, n);
  im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  im.castShadow = true;
  im.frustumCulled = false;
  im.count = 0;
  scene.add(im);
  return im;
}
/** compose a part: base * T(p) * R(rx, ry, rz) * S(sc) */
function place(base, p, rx = 0, ry = 0, rz = 0, sc = 1) {
  _loc.compose(_v.set(p[0], p[1], p[2]), _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ')), _s.set(sc, sc, sc));
  return _out.multiplyMatrices(base, _loc);
}

/* ------------------------------------------------------------------ models */
function deerGeos() {
  const FUR = 0x8a5a36, FURD = 0x6a4228, BELLY = 0xe2d2b4, DARK = 0x231811, ANT = 0xcdb894;
  const B = () => new Builder({ smooth: true });
  const body = B();
  body.add(new THREE.CapsuleGeometry(0.27, 0.72, 6, 14), FUR, { pos: [0, 1.04, 0], rot: [Math.PI / 2, 0, 0], scale: [0.88, 1, 1.0] });
  body.add(new THREE.SphereGeometry(0.22, 14, 10), BELLY, { pos: [0, 0.92, 0.02], scale: [0.85, 0.62, 2.0] });
  body.add(new THREE.SphereGeometry(0.075, 8, 6), BELLY, { pos: [0, 1.14, -0.58] });                  // tail
  for (const [x, z] of [[-0.15, 0.36], [0.15, 0.36], [-0.15, -0.36], [0.15, -0.36]]) {                // upper legs
    body.add(new THREE.SphereGeometry(0.11, 10, 8), FUR, { pos: [x, 0.98, z], scale: [0.8, 1.4, 1] });
  }
  // head and neck pivot at the base of the neck (local origin)
  const head = B();
  head.add(new THREE.CapsuleGeometry(0.1, 0.36, 6, 10), FUR, { pos: [0, 0.18, 0.09], rot: [0.45, 0, 0] });
  head.add(new THREE.SphereGeometry(0.12, 12, 10), FUR, { pos: [0, 0.42, 0.2], scale: [0.85, 0.85, 1.25] });
  head.add(new THREE.SphereGeometry(0.07, 10, 8), FURD, { pos: [0, 0.38, 0.36], scale: [0.9, 0.8, 1.1] });   // muzzle
  head.add(new THREE.SphereGeometry(0.025, 6, 5), DARK, { pos: [0, 0.39, 0.43] });                         // nose
  for (const sx of [-1, 1]) {
    head.add(new THREE.SphereGeometry(0.022, 6, 5), DARK, { pos: [sx * 0.08, 0.46, 0.27] });               // eyes
    head.add(new THREE.ConeGeometry(0.045, 0.16, 6), FUR, { pos: [sx * 0.11, 0.55, 0.12], rot: [0, 0, -sx * 0.8] }); // ears
    // antlers: a beam and two tines
    head.add(new THREE.CylinderGeometry(0.012, 0.02, 0.32, 5), ANT, { pos: [sx * 0.07, 0.68, 0.16], rot: [-0.25, 0, -sx * 0.35] });
    head.add(new THREE.CylinderGeometry(0.009, 0.014, 0.14, 4), ANT, { pos: [sx * 0.12, 0.72, 0.24], rot: [0.6, 0, -sx * 0.2] });
    head.add(new THREE.CylinderGeometry(0.009, 0.014, 0.14, 4), ANT, { pos: [sx * 0.15, 0.8, 0.13], rot: [-0.3, 0, -sx * 0.9] });
  }
  // a leg, pivoting at the hip: thin shank and a dark hoof
  const leg = B();
  leg.add(new THREE.CapsuleGeometry(0.045, 0.66, 5, 8), FURD, { pos: [0, -0.4, 0] });
  leg.add(new THREE.SphereGeometry(0.05, 8, 6), DARK, { pos: [0, -0.8, 0.01], scale: [0.9, 0.7, 1.2] });
  return { body: body.build(), head: head.build(), leg: leg.build() };
}

function rabbitGeo() {
  const F = 0x9a8268, W = 0xe8e0d0, D = 0x1e1610;
  const b = new Builder({ smooth: true });
  b.add(new THREE.SphereGeometry(0.13, 12, 10), F, { pos: [0, 0.14, 0], scale: [0.85, 0.85, 1.25] });
  b.add(new THREE.SphereGeometry(0.08, 10, 8), F, { pos: [0, 0.24, 0.15] });
  b.add(new THREE.SphereGeometry(0.045, 8, 6), W, { pos: [0, 0.18, -0.17] });                         // tail
  for (const sx of [-1, 1]) {
    b.add(new THREE.CapsuleGeometry(0.022, 0.13, 4, 6), F, { pos: [sx * 0.035, 0.36, 0.12], rot: [-0.3, 0, sx * 0.15] });
    b.add(new THREE.SphereGeometry(0.014, 6, 5), D, { pos: [sx * 0.045, 0.26, 0.21] });
    b.add(new THREE.SphereGeometry(0.05, 8, 6), F, { pos: [sx * 0.07, 0.06, -0.04], scale: [0.8, 0.6, 1.6] }); // haunches
  }
  return b.build();
}

function birdGeos() {
  const b = new Builder({ smooth: true }), w = new Builder({ smooth: true });
  b.add(new THREE.SphereGeometry(0.09, 10, 8), 0x2e2a26, { scale: [0.8, 0.8, 1.9] });
  b.add(new THREE.ConeGeometry(0.035, 0.1, 6), 0xc49a3a, { pos: [0, 0, 0.21], rot: [Math.PI / 2, 0, 0] });
  b.add(new THREE.BoxGeometry(0.16, 0.012, 0.12), 0x2e2a26, { pos: [0, 0, -0.2] });                  // tail
  w.add(new THREE.BoxGeometry(0.42, 0.012, 0.14), 0x3a352f, { pos: [0.21, 0, 0] });
  w.add(new THREE.BoxGeometry(0.16, 0.01, 0.1), 0x24201c, { pos: [0.46, 0, -0.03] });
  return { body: b.build(), wing: w.build() };
}

/* ------------------------------------------------------------------ the system */
export class Wildlife {
  constructor(scene, world) {
    this.world = world;
    const dg = deerGeos(), m = mat();
    this.deerBody = inst(scene, dg.body, m, 16);
    this.deerHead = inst(scene, dg.head, m, 16);
    this.deerLeg = inst(scene, dg.leg, m, 64);
    this.rabbitMesh = inst(scene, rabbitGeo(), mat(), 14);
    const bg = birdGeos();
    const bm = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.birdBody = inst(scene, bg.body, bm, 20);
    this.birdWingL = inst(scene, bg.wing, bm, 20);
    this.birdWingR = inst(scene, bg.wing, bm, 20);
    for (const im of [this.birdBody, this.birdWingL, this.birdWingR]) im.castShadow = false;

    this.deer = []; this.rabbits = []; this.birds = [];
    this.spawnAll();
  }

  /** a dry, open spot away from props */
  spot(minR, maxR, nearX, nearZ, spread) {
    for (let k = 0; k < 60; k++) {
      let x, z;
      if (nearX !== undefined) { x = nearX + rnd(-spread, spread); z = nearZ + rnd(-spread, spread); }
      else { const a = rnd(0, TAU), r = rnd(minR, maxR); x = Math.cos(a) * r; z = Math.sin(a) * r; }
      if (Math.hypot(x, z) > ARENA_R - 8 || Math.hypot(x, z) < 12) continue;
      if (waterDist(x, z) < 2 || !this.world.isClear(x, z, 1.2)) continue;
      return [x, z];
    }
    return null;
  }

  spawnAll() {
    // three herds of four
    for (let h = 0; h < 3; h++) {
      const c = this.spot(22, 80);
      if (!c) continue;
      for (let i = 0; i < 4; i++) {
        const s = this.spot(0, 0, c[0], c[1], 6);
        if (!s) continue;
        this.deer.push({
          x: s[0], z: s[1], y: terrainHeight(s[0], s[1]), yaw: rnd(0, TAU), vx: 0, vz: 0,
          state: 'graze', t: rnd(1, 6), herd: c, phase: rnd(0, TAU), head: 1, scale: rnd(0.85, 1.1),
        });
      }
    }
    for (let i = 0; i < 12; i++) {
      const s = this.spot(15, 85);
      if (s) this.rabbits.push({ x: s[0], z: s[1], y: terrainHeight(s[0], s[1]), yaw: rnd(0, TAU), hop: 0, hopT: rnd(0.5, 3), flee: 0, h: 0 });
    }
    // a flock and a lone hawk
    const fc = [rnd(-40, 40), rnd(-40, 40)];
    for (let i = 0; i < 14; i++) {
      this.birds.push({ cx: fc[0], cz: fc[1], r: rnd(18, 30), a: rnd(0, TAU), w: rnd(0.25, 0.4) * (rng() < 0.5 ? -1 : 1), y: rnd(26, 36), ph: rnd(0, TAU), s: 1, flap: rnd(7, 10) });
    }
    this.birds.push({ cx: 0, cz: 0, r: 55, a: 0, w: 0.09, y: 58, ph: 0, s: 2.6, flap: 1.6, hawk: true });
  }

  update(dt, time, player) {
    const px = player.pos.x, pz = player.pos.z;
    const w = this.world;

    /* ---- deer */
    let n = 0, ln = 0;
    for (const d of this.deer) {
      const dx = d.x - px, dz = d.z - pz, dist = Math.hypot(dx, dz) || 0.01;
      d.t -= dt;
      if (d.state !== 'flee' && dist < 13) { d.state = 'flee'; d.t = 4; }
      let speed = 0, tx = d.vx, tz = d.vz;
      if (d.state === 'flee') {
        // away from you, bending round the arena edge
        let fx = dx / dist, fz = dz / dist;
        if (Math.hypot(d.x, d.z) > ARENA_R - 14) { fx -= d.x * 0.02; fz -= d.z * 0.02; }
        const l = Math.hypot(fx, fz) || 1;
        tx = fx / l; tz = fz / l; speed = 8.5;
        if (dist > 32 && d.t <= 0) { d.state = 'walk'; d.t = rnd(2, 4); d.herd = [d.x, d.z]; d.target = null; }
      } else if (d.state === 'walk') {
        if (!d.target) { const s = this.spot(0, 0, d.herd[0], d.herd[1], 9); d.target = s || [d.x, d.z]; }
        const gx = d.target[0] - d.x, gz = d.target[1] - d.z, gl = Math.hypot(gx, gz);
        if (gl < 0.8 || d.t <= 0) { d.state = 'graze'; d.t = rnd(4, 10); }
        else { tx = gx / gl; tz = gz / gl; speed = 1.3; }
      } else if (d.t <= 0) { d.state = 'walk'; d.t = rnd(5, 9); d.target = null; }

      d.vx = damp(d.vx, tx * speed, 5, dt); d.vz = damp(d.vz, tz * speed, 5, dt);
      const sp = Math.hypot(d.vx, d.vz);
      let nx = d.x + d.vx * dt, nz = d.z + d.vz * dt;
      [nx, nz] = w.resolveCollisions(nx, nz, 0.5);
      d.x = nx; d.z = nz;
      d.y = damp(d.y, terrainHeight(nx, nz), 14, dt);
      if (sp > 0.2) d.yaw = dampAngle(d.yaw, Math.atan2(d.vx, d.vz), 6, dt);
      d.head = damp(d.head, d.state === 'graze' ? 1 : 0, 3, dt);
      d.phase += dt * (sp > 3 ? 11 : 5.5) * Math.min(1, sp);

      // body: bounding run pitches the body; walking just bobs
      const run = clamp((sp - 2) / 5, 0, 1);
      const bob = Math.sin(d.phase * 2) * 0.03 * Math.min(1, sp) + run * Math.abs(Math.sin(d.phase)) * 0.25;
      const pitch = run * Math.sin(d.phase) * 0.18;
      _base.compose(_v.set(d.x, d.y + bob, d.z), _q.setFromEuler(_e.set(pitch, d.yaw, 0, 'YXZ')), _s.setScalar(d.scale));
      this.deerBody.setMatrixAt(n, _base);
      // neck: up and alert, or down to graze
      this.deerHead.setMatrixAt(n, place(_base, [0, 1.18, 0.42], 1.35 * d.head - 0.1 * (1 - d.head)));
      // legs: diagonal pairs when walking, front and back pairs together when bounding
      const walkA = Math.sin(d.phase) * 0.45 * Math.min(1, sp) * (1 - run);
      const runF = Math.sin(d.phase) * 0.8 * run, runB = Math.sin(d.phase + Math.PI) * 0.8 * run;
      const legs = [[-0.15, 0.36, walkA + runF], [0.15, 0.36, -walkA + runF], [-0.15, -0.36, -walkA + runB], [0.15, -0.36, walkA + runB]];
      for (const [lx, lz, sw] of legs) this.deerLeg.setMatrixAt(ln++, place(_base, [lx, 1.0, lz], sw));
      n++;
    }
    this.deerBody.count = n; this.deerHead.count = n; this.deerLeg.count = ln;
    for (const im of [this.deerBody, this.deerHead, this.deerLeg]) im.instanceMatrix.needsUpdate = true;

    /* ---- rabbits: hop, pause, scatter */
    let rn = 0;
    for (const r of this.rabbits) {
      const dx = r.x - px, dz = r.z - pz, dist = Math.hypot(dx, dz) || 0.01;
      if (dist < 8) r.flee = 2.5;
      r.flee -= dt;
      r.hopT -= dt;
      if (r.hop <= 0 && (r.hopT <= 0 || r.flee > 0)) {
        r.hop = r.flee > 0 ? 0.32 : 0.42;
        r.hopLen = r.flee > 0 ? 1.6 : 0.5;
        r.yaw = r.flee > 0 ? Math.atan2(dx, dz) + rnd(-0.5, 0.5) : r.yaw + rnd(-1.2, 1.2);
        r.hopT = r.flee > 0 ? 0 : rnd(0.6, 3.5);
        r.dur = r.hop;
      }
      if (r.hop > 0) {
        r.hop -= dt;
        const k = 1 - r.hop / r.dur;
        let nx = r.x + Math.sin(r.yaw) * (r.hopLen / r.dur) * dt, nz = r.z + Math.cos(r.yaw) * (r.hopLen / r.dur) * dt;
        if (waterDist(nx, nz) < 0.5 || Math.hypot(nx, nz) > ARENA_R - 6) { r.yaw += Math.PI; nx = r.x; nz = r.z; }
        [nx, nz] = w.resolveCollisions(nx, nz, 0.2);
        r.x = nx; r.z = nz;
        r.h = Math.sin(k * Math.PI) * (r.flee > 0 ? 0.35 : 0.18);
      } else r.h = 0;
      r.y = terrainHeight(r.x, r.z);
      _base.compose(_v.set(r.x, r.y + r.h, r.z), _q.setFromEuler(_e.set(-r.h * 0.8, r.yaw, 0, 'YXZ')), _s.setScalar(1));
      this.rabbitMesh.setMatrixAt(rn++, _base);
    }
    this.rabbitMesh.count = rn;
    this.rabbitMesh.instanceMatrix.needsUpdate = true;

    /* ---- birds: a wheeling flock that drifts, and the hawk */
    let bn = 0;
    for (const b of this.birds) {
      b.a += b.w * dt;
      if (!b.hawk) { b.cx += Math.sin(time * 0.05) * dt * 2; b.cz += Math.cos(time * 0.04) * dt * 2; }
      const x = b.cx + Math.cos(b.a) * b.r, z = b.cz + Math.sin(b.a) * b.r;
      const y = b.y + Math.sin(time * 0.7 + b.ph) * 1.5;
      const yaw = Math.atan2(-Math.sin(b.a) * Math.sign(b.w), Math.cos(b.a) * Math.sign(b.w));
      const bank = -Math.sign(b.w) * 0.35;
      _base.compose(_v.set(x, y, z), _q.setFromEuler(_e.set(0, yaw, bank, 'YXZ')), _s.setScalar(b.s));
      this.birdBody.setMatrixAt(bn, _base);
      // flap, with a glide now and then
      const glide = Math.sin(time * 0.6 + b.ph) > 0.4 ? 0.15 : 1;
      const f = Math.sin(time * b.flap + b.ph) * 0.7 * glide + 0.1;
      this.birdWingR.setMatrixAt(bn, place(_base, [0.05, 0, 0], 0, 0, f));
      this.birdWingL.setMatrixAt(bn, place(_base, [-0.05, 0, 0], 0, Math.PI, f));
      bn++;
    }
    for (const im of [this.birdBody, this.birdWingL, this.birdWingR]) { im.count = bn; im.instanceMatrix.needsUpdate = true; }
  }
}
