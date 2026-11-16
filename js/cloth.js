import * as THREE from 'three';

/* ================================================================ cloth
   A cape or a tabard, simulated the way engine cloth is (Unreal Chaos Cloth, Unity Cloth, PhysX): a grid of points
   joined by stretch, shear and bend springs (Verlet integration, position-based constraints), the top row pinned to a
   bone, the rest falling under gravity and still-air drag, pushed out of capsules round the body without being thrown
   (inelastic), kept on its side of the body by a backstop plane along the spine, resting on the ground. Only part of
   the wearer's own travel reaches it as inertia (the world velocity scale engines use), so a run does not fling it.

   Lessons kept in the numbers (b33): a pin inside a collider pumps energy into the cloth; damping must be against the
   still air, not the body, or nothing trails; the backstop pushes level, never along its tilted normal (that lifted
   the cloth until it bunched); bend springs resist folding as well as stretching, or the cloth accordions. */

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();

export class Cloth {
  /**
   * o: { root, rig, pin (bone), C, R, W, H, origin (top centre, in root space at build), shape(x, v) -> [x, z],
   *      material, body: [[boneA, boneB|null, radius]], backstop: { hips, spine, side: +1 behind / -1 in front, offset },
   *      steps, iters, drag, worldScale, air, wind }
   */
  constructor(o) {
    Object.assign(this, { steps: 2, iters: 6, drag: 0.985, worldScale: 0.5, air: 0, wind: 1, off: null, ceiling: 0 }, o);
    const { C, R, W, H } = this;
    const g = new THREE.PlaneGeometry(W, H, C - 1, R - 1); g.translate(0, -H / 2, 0);
    const p = g.attributes.position, n = p.count;
    for (let i = 0; i < n; i++) {
      const v = Math.min(1, Math.max(0, -p.getY(i) / H)), [x, z] = this.shape(p.getX(i), v);
      p.setX(i, x); p.setZ(i, z);
    }
    this.mesh = new THREE.Mesh(g, this.material); this.mesh.castShadow = true; this.mesh.frustumCulled = false;
    this.root.add(this.mesh);
    this.n = n; this.pos = new Float32Array(n * 3); this.prev = new Float32Array(n * 3); this.rest = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { this.rest[i * 3] = this.origin.x + p.getX(i); this.rest[i * 3 + 1] = this.origin.y + p.getY(i); this.rest[i * 3 + 2] = this.origin.z + p.getZ(i); }
    // every point in the pin bone's own frame too: the cheap rigid pose for far-off wearers
    this.root.updateMatrixWorld(true);
    this.local = [];
    for (let i = 0; i < n; i++) this.local.push(this.pin.worldToLocal(new THREE.Vector3(this.rest[i * 3], this.rest[i * 3 + 1], this.rest[i * 3 + 2]).applyMatrix4(this.root.matrixWorld)));
    this.pins = []; for (let c = 0; c < C; c++) this.pins.push({ i: c, local: this.local[c].clone() });
    const cons = [], add = (a, b, k) => { const R3 = this.rest; cons.push(a, b, Math.hypot(R3[a * 3] - R3[b * 3], R3[a * 3 + 1] - R3[b * 3 + 1], R3[a * 3 + 2] - R3[b * 3 + 2]), k); };
    const id = (r, c) => r * C + c;
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
      if (c < C - 1) add(id(r, c), id(r, c + 1), 1);
      if (r < R - 1) add(id(r, c), id(r + 1, c), 1);
      if (r < R - 1 && c < C - 1) { add(id(r, c), id(r + 1, c + 1), 0.45); add(id(r, c + 1), id(r + 1, c), 0.45); }
      if (r < R - 2) add(id(r, c), id(r + 2, c), 0.5);
      if (c < C - 2) add(id(r, c), id(r, c + 2), 0.5);
    }
    this.cons = Float32Array.from(cons);
    this.body = (this.body || []).filter((k) => k[0]);
    this.capA = this.body.map(() => new THREE.Vector3()); this.capB = this.body.map(() => new THREE.Vector3());
    this.ready = false; this.last = null; this.windT = 0;
  }

  /** at rest where it hangs (first frame, after a teleport, a revive) */
  reset() {
    this.root.updateMatrixWorld(true);
    const m = this.root.matrixWorld;
    for (let i = 0; i < this.n; i++) {
      _v.set(this.rest[i * 3], this.rest[i * 3 + 1], this.rest[i * 3 + 2]).applyMatrix4(m);
      this.pos[i * 3] = this.prev[i * 3] = _v.x; this.pos[i * 3 + 1] = this.prev[i * 3 + 1] = _v.y; this.pos[i * 3 + 2] = this.prev[i * 3 + 2] = _v.z;
    }
    this.ready = true; this.last = null;
  }

  /** no simulation: every point rides the pin bone rigidly (wearers far away, or over budget) */
  kinematic(fresh = false) {
    if (!fresh) this.rig.updateMatrixWorld(true);
    const M = this.pin.matrixWorld, P = this.pos, Q = this.prev;
    for (let i = 0; i < this.n; i++) { _v.copy(this.local[i]).applyMatrix4(M); P[i * 3] = Q[i * 3] = _v.x; P[i * 3 + 1] = Q[i * 3 + 1] = _v.y; P[i * 3 + 2] = Q[i * 3 + 2] = _v.z; }
    this.ready = true; this.last = null;
    this.toMesh();
  }

  /** fresh: the caller has already brought the skeleton's world matrices up to date this frame */
  update(dt, t, fresh = false) {
    const P = this.pos, Q = this.prev, off = this.off || {}, C = this.C;
    if (!fresh) this.rig.updateMatrixWorld(true);
    if (!this.ready) this.reset();
    const p0 = this.pins[Math.floor(C / 2)], pw = _v2.copy(p0.local).applyMatrix4(this.pin.matrixWorld);
    if (pw.distanceToSquared(_v3.set(P[p0.i * 3], P[p0.i * 3 + 1], P[p0.i * 3 + 2])) > 1.5 * 1.5) this.reset();
    for (let k = 0; k < this.body.length; k++) {
      const [a, b] = this.body[k];
      a.getWorldPosition(this.capA[k]);
      if (b) b.getWorldPosition(this.capB[k]); else this.capB[k].copy(this.capA[k]).y -= 0.12;
    }
    const rootW = this.root.getWorldPosition(_v), ground = rootW.y + 0.03;
    const mvx = this.last ? rootW.x - this.last.x : 0, mvy = this.last ? rootW.y - this.last.y : 0, mvz = this.last ? rootW.z - this.last.z : 0;
    (this.last || (this.last = new THREE.Vector3())).copy(rootW);
    const carry = off.carry ? 0 : 1 - this.worldScale;
    if (Math.abs(mvx) + Math.abs(mvz) < 1.5) for (let i = C; i < this.n; i++) { const o = i * 3; P[o] += mvx * carry; P[o + 1] += mvy * carry; P[o + 2] += mvz * carry; Q[o] += mvx * carry; Q[o + 1] += mvy * carry; Q[o + 2] += mvz * carry; }
    const fdt = Math.max(1e-4, Math.min(dt, 0.05)), vcx = mvx / fdt, vcz = mvz / fdt;
    // the backstop: a plane along the spine (it leans when he leans) that the cloth may not cross; pushed out level
    let bsx = 0, bsy = 0, bsz = 0, bsd = 0, fhx = 0, fhz = 0, fdn = 1, bs = this.backstop && !off.back ? this.backstop : null;
    if (bs) {
      const rq = this.root.getWorldQuaternion(_q), side = new THREE.Vector3(-1, 0, 0).applyQuaternion(rq), hp = bs.hips.getWorldPosition(new THREE.Vector3());
      const ax = bs.spine.getWorldPosition(new THREE.Vector3()).sub(hp).normalize();
      const bn = new THREE.Vector3().crossVectors(side, ax).normalize(), fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(rq);
      if (bn.dot(fwd) < 0) bn.negate();
      if (bs.side < 0) bn.negate();                                  // a front panel keeps in front instead
      bsx = bn.x; bsy = bn.y; bsz = bn.z; bsd = hp.x * bsx + hp.y * bsy + hp.z * bsz - bs.offset;
      const fh = fwd.setY(0).normalize().multiplyScalar(bs.side < 0 ? -1 : 1);
      fhx = fh.x; fhz = fh.z; fdn = Math.max(0.3, fhx * bsx + fhz * bsz);
    }
    const steps = this.steps, h = Math.min(dt, 0.05) / steps;
    const wind = this.wind ? 0.6 + Math.sin(t * 0.7) * 0.4 + Math.sin(t * 2.3) * 0.2 : 0;
    const air = off.air ? 0 : this.air, wx = -vcx * air + 0.25 * wind, wz = -vcz * air + 0.15 * wind;
    for (let s = 0; s < steps; s++) {
      // damping is against the still air (world frame): that is what makes cloth stream back from a running man
      const drag = this.drag, gy = -9.8 * h * h, wxh = wx * h * h, wzh = wz * h * h;
      for (let i = 0; i < this.n; i++) {
        const o = i * 3, x = P[o], y = P[o + 1], z = P[o + 2];
        P[o] += (x - Q[o]) * drag + wxh; P[o + 1] += (y - Q[o + 1]) * drag + gy; P[o + 2] += (z - Q[o + 2]) * drag + wzh;
        Q[o] = x; Q[o + 1] = y; Q[o + 2] = z;
      }
      for (let it = 0; it < this.iters; it++) {
        const K = this.cons;
        for (let c = 0; c < K.length; c += 4) {
          const a = K[c] * 3, b = K[c + 1] * 3, rest = K[c + 2], k = K[c + 3];
          const dx = P[b] - P[a], dy = P[b + 1] - P[a + 1], dz = P[b + 2] - P[a + 2], d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
          if (k < 0.5 && d < rest) continue;                      // shear springs only resist stretching; bend springs resist folding too
          const f = (d - rest) / d * 0.5 * k;
          P[a] += dx * f; P[a + 1] += dy * f; P[a + 2] += dz * f; P[b] -= dx * f; P[b + 1] -= dy * f; P[b + 2] -= dz * f;
        }
        for (const pin of this.pins) { _v2.copy(pin.local).applyMatrix4(this.pin.matrixWorld); const o = pin.i * 3; P[o] = _v2.x; P[o + 1] = _v2.y; P[o + 2] = _v2.z; }
        // heavy cloth does not flip over the wearer: each row stays a little below the collar line (ceiling), lower rows
        // more. Applied before the body, so the body always has the last word
        if (this.ceiling) { const ceil = P[p0.i * 3 + 1]; for (let i = C; i < this.n; i++) { const lim = ceil - this.ceiling * Math.floor(i / C) / (this.R - 1); if (P[i * 3 + 1] > lim) { Q[i * 3 + 1] += lim - P[i * 3 + 1]; P[i * 3 + 1] = lim; } } }
        for (let k = 0; k < (off.cap ? 0 : this.body.length); k++) {
          const A = this.capA[k], Bc = this.capB[k], r = this.body[k][2];
          const abx = Bc.x - A.x, aby = Bc.y - A.y, abz = Bc.z - A.z, l2 = abx * abx + aby * aby + abz * abz || 1e-6;
          for (let i = C; i < this.n; i++) {
            const o = i * 3, px = P[o] - A.x, py = P[o + 1] - A.y, pz = P[o + 2] - A.z;
            const u = Math.max(0, Math.min(1, (px * abx + py * aby + pz * abz) / l2));
            const qx = px - abx * u, qy = py - aby * u, qz = pz - abz * u, d2 = qx * qx + qy * qy + qz * qz;
            if (d2 < r * r) { const d = Math.sqrt(d2) || 1e-4, push = (r - d) / d; P[o] += qx * push; P[o + 1] += qy * push; P[o + 2] += qz * push; Q[o] += qx * push; Q[o + 1] += qy * push; Q[o + 2] += qz * push; }     // pushed aside, not thrown
          }
        }
        for (let i = C; i < this.n; i++) {
          if (P[i * 3 + 1] < ground) { Q[i * 3 + 1] += ground - P[i * 3 + 1]; P[i * 3 + 1] = ground; }
          if (bs) {
            const over = P[i * 3] * bsx + P[i * 3 + 1] * bsy + P[i * 3 + 2] * bsz - bsd;
            if (over > 0) { const tt = over / fdn; P[i * 3] -= fhx * tt; P[i * 3 + 2] -= fhz * tt; Q[i * 3] -= fhx * tt; Q[i * 3 + 2] -= fhz * tt; }
          }
        }
      }
    }
    this.toMesh();
  }

  /** the points to the mesh, in the wearer's own frame */
  toMesh() {
    const inv = _m.copy(this.root.matrixWorld).invert(), pa = this.mesh.geometry.attributes.position, arr = pa.array, P = this.pos;
    for (let i = 0; i < this.n; i++) { _v.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]).applyMatrix4(inv); arr[i * 3] = _v.x; arr[i * 3 + 1] = _v.y; arr[i * 3 + 2] = _v.z; }
    pa.needsUpdate = true; this.mesh.geometry.computeVertexNormals(); this.mesh.geometry.computeBoundingSphere();
  }

  dispose() { this.mesh.removeFromParent(); this.mesh.geometry.dispose(); }
}
