import * as THREE from 'three';
import { clamp, lerp, rnd, TAU, Builder, deg } from './core.js';

/* ============================================================ definitions
   Every gun is deliberately different in weight, cadence and punishment.
   recoilPitch is the real camera climb per shot in degrees.            */
export const WEAPONS = [
  {
    id: 'blaster', name: 'BLASTER', mod: 'ORANGE MOD',
    dmg: 26, pellets: 1, rpm: 225, spread: 0.55, spreadBloom: 0.30, bloomMax: 4.5,
    recoilPitch: 1.45, recoilYaw: 0.42, shake: 0.10, kickVis: 0.055, push: 0,
    mag: 24, reserve: Infinity, reload: 1.45, range: 140,
    tracer: 0xffc070, flash: 0xffb060, flashSize: 0.85, sound: 'blaster',
    color: 0xe2762c, desc: 'Balanced. Fast follow-up, manageable climb.'
  },
  {
    id: 'scatter', name: 'SCATTER', mod: 'YELLOW MOD',
    dmg: 12, pellets: 9, rpm: 72, spread: 6.4, spreadBloom: 2.0, bloomMax: 14,
    recoilPitch: 4.6, recoilYaw: 1.5, shake: 0.52, kickVis: 0.16, push: 3.4,
    mag: 8, reserve: 64, reload: 2.35, range: 46,
    tracer: 0xffd98a, flash: 0xffcb70, flashSize: 1.75, sound: 'scatter',
    color: 0xf0b23c, desc: 'Nine pellets. Shoves you back. Brutal inside 8 metres.'
  },
  {
    id: 'beam', name: 'BEAM', mod: 'BLUE MOD',
    dmg: 105, pellets: 1, rpm: 58, spread: 0.08, spreadBloom: 0.5, bloomMax: 3,
    recoilPitch: 5.4, recoilYaw: 0.9, shake: 0.62, kickVis: 0.20, push: 5.2,
    mag: 10, reserve: 48, reload: 2.6, range: 220, pierce: 3,
    tracer: 0x7ae4ff, flash: 0x9fe8ff, flashSize: 1.3, sound: 'beam',
    color: 0x37e0c8, desc: 'Pierces three bodies. One shot, huge punch.'
  },
  {
    id: 'bomber', name: 'BOMBER', mod: 'RED MOD',
    dmg: 140, pellets: 1, rpm: 46, spread: 0.9, spreadBloom: 0.8, bloomMax: 4,
    recoilPitch: 6.8, recoilYaw: 1.8, shake: 0.75, kickVis: 0.24, push: 6.5,
    mag: 5, reserve: 24, reload: 3.0, range: 90,
    explosive: { radius: 4.8, falloff: 0.45, speed: 46, gravity: 13 },
    tracer: 0xff8a40, flash: 0xff7030, flashSize: 2.1, sound: 'bomber',
    color: 0xc8301f, desc: 'Arcing charge. Clears a whole pack. Kicks like a mule.'
  },
];

/* ============================================================ gun models */
function crystal(color, r = 0.055) {
  return new THREE.OctahedronGeometry(r, 0);
}

export function buildGunModel(id) {
  const b = new Builder();
  const muzzle = new THREE.Object3D();
  const group = new THREE.Group();
  const M = 0x9a9288, MD = 0x5c554c, ACC = [];
  const C = { blaster: 0xe2762c, scatter: 0xf0b23c, beam: 0x37e0c8, bomber: 0xc8301f }[id];

  if (id === 'blaster') {
    b.add(new THREE.BoxGeometry(0.085, 0.16, 0.10), M, { pos: [0, -0.02, 0], jitter: 0.02 });
    b.add(new THREE.BoxGeometry(0.06, 0.09, 0.13), MD, { pos: [0, -0.10, -0.02], jitter: 0.02 });
    b.add(new THREE.CylinderGeometry(0.026, 0.030, 0.30, 8), M, { pos: [0, -0.24, 0.005] });
    b.add(new THREE.CylinderGeometry(0.038, 0.038, 0.03, 8), ACC.length ? 0 : 0xe2762c, { pos: [0, -0.40, 0.005] });
    b.add(new THREE.BoxGeometry(0.05, 0.05, 0.06), MD, { pos: [0, 0.06, -0.05], jitter: 0.02 });
    muzzle.position.set(0, -0.42, 0.005);
  } else if (id === 'scatter') {
    b.add(new THREE.BoxGeometry(0.13, 0.20, 0.13), M, { pos: [0, -0.04, 0], jitter: 0.02 });
    b.add(new THREE.BoxGeometry(0.10, 0.10, 0.20), MD, { pos: [0, -0.12, -0.06], jitter: 0.02 });
    b.add(new THREE.CylinderGeometry(0.033, 0.036, 0.34, 8), M, { pos: [-0.036, -0.26, 0.01] });
    b.add(new THREE.CylinderGeometry(0.033, 0.036, 0.34, 8), M, { pos: [0.036, -0.26, 0.01] });
    // vent ribs
    for (let i = 0; i < 4; i++) {
      b.add(new THREE.BoxGeometry(0.16, 0.014, 0.05), MD, { pos: [0, -0.12 - i * 0.045, 0.06] });
    }
    b.add(new THREE.BoxGeometry(0.10, 0.045, 0.07), 0xf0b23c, { pos: [0, -0.44, 0.01], jitter: 0.03 });
    muzzle.position.set(0, -0.46, 0.01);
  } else if (id === 'beam') {
    b.add(new THREE.BoxGeometry(0.10, 0.17, 0.11), M, { pos: [0, -0.03, 0], jitter: 0.02 });
    b.add(new THREE.BoxGeometry(0.07, 0.11, 0.17), MD, { pos: [0, -0.11, -0.05], jitter: 0.02 });
    b.add(new THREE.CylinderGeometry(0.018, 0.022, 0.62, 7), M, { pos: [0, -0.40, 0.01] });
    for (let i = 0; i < 5; i++) {
      b.add(new THREE.TorusGeometry(0.045, 0.010, 4, 9), 0x37e0c8, { pos: [0, -0.20 - i * 0.085, 0.01], rot: [Math.PI / 2, 0, 0] });
    }
    b.add(new THREE.BoxGeometry(0.045, 0.28, 0.05), MD, { pos: [0, -0.20, -0.10], rot: [0.12, 0, 0], jitter: 0.02 });
    muzzle.position.set(0, -0.72, 0.01);
  } else {
    // bomber: drum + claw
    b.add(new THREE.BoxGeometry(0.13, 0.17, 0.14), M, { pos: [0, -0.02, 0], jitter: 0.02 });
    b.add(new THREE.CylinderGeometry(0.095, 0.095, 0.14, 10), MD, { pos: [0, -0.11, 0], rot: [0, 0, 0], jitter: 0.02 });
    b.add(new THREE.CylinderGeometry(0.062, 0.062, 0.15, 10), 0xc8301f, { pos: [0, -0.11, 0], jitter: 0.03 });
    b.add(new THREE.CylinderGeometry(0.050, 0.058, 0.24, 8), M, { pos: [0, -0.27, 0.01] });
    b.add(new THREE.BoxGeometry(0.09, 0.035, 0.09), MD, { pos: [0, -0.40, 0.01], jitter: 0.02 });
    b.add(new THREE.BoxGeometry(0.10, 0.07, 0.06), 0xc8301f, { pos: [0, 0.02, -0.10], jitter: 0.03 });
    muzzle.position.set(0, -0.42, 0.01);
  }

  const mesh = new THREE.Mesh(b.build(), new THREE.MeshLambertMaterial({ vertexColors: true }));
  mesh.castShadow = true;
  group.add(mesh);
  group.add(muzzle);
  group.scale.setScalar(1.55);
  group.userData.muzzle = muzzle;
  group.userData.color = C;
  return group;
}

/* ============================================================ system */
export class WeaponSystem {
  constructor(scene, player, fx, audio, ctx) {
    this.scene = scene;
    this.player = player;
    this.fx = fx;
    this.audio = audio;
    this.ctx = ctx;                  // { enemies, camera, spawnProjectile, onAmmo }
    this.models = WEAPONS.map(w => buildGunModel(w.id));
    this.models.forEach((m) => { m.visible = false; player.model.hand.add(m); });

    this.index = 0;
    this.state = WEAPONS.map(w => ({ mag: w.mag, reserve: w.reserve }));
    this.cooldown = 0;
    this.reloading = false;
    this.reloadT = 0;
    this.reloadStage = 0;
    this.bloom = 0;
    this.kick = 0;
    this.kickRot = 0;
    this.switchT = 0;
    this.triggerHeld = false;
    this.shotsFired = 0;
    this.shotsHit = 0;
    this._aim = new THREE.Vector3();
    this._dir = new THREE.Vector3();
    this._muzzlePos = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
    this.onFired = null;
    this.visible = true;
    this.syncModel();
  }

  get def() { return WEAPONS[this.index]; }
  get ammo() { return this.state[this.index]; }
  get totalAmmo() {
    const s = this.state[this.index];
    return s.reserve === Infinity ? Infinity : s.reserve;
  }
  get spreadDeg() {
    return this.def.spread + Math.min(this.def.bloomMax, this.bloom);
  }

  syncModel() {
    this.models.forEach((m, i) => { m.visible = i === this.index && this.visible; });
  }

  setVisible(v) { this.visible = v; this.syncModel(); }

  switchTo(i, instant = false) {
    if (i === this.index || i < 0 || i >= WEAPONS.length) return;
    this.index = i;
    this.reloading = false;
    this.reloadT = 0;
    this.bloom = 0;
    this.cooldown = Math.max(this.cooldown, 0.22);
    this.switchT = instant ? 1 : 0;
    this.syncModel();
    if (this.audio) this.audio.click(0, 0.14, 620);
    if (this.ctx.onAmmo) this.ctx.onAmmo();
  }

  next() { this.switchTo((this.index + 1) % WEAPONS.length); }

  tryReload() {
    const s = this.ammo;
    const d = this.def;
    if (this.reloading || s.mag >= d.mag) return false;
    if (s.reserve !== Infinity && s.reserve <= 0) return false;
    this.reloading = true;
    this.reloadT = 0;
    this.reloadStage = 0;
    if (this.audio) this.audio.reload(0);
    return true;
  }

  /* ---------------- firing ---------------- */
  fire(camera) {
    const d = this.def;
    const s = this.ammo;
    if (this.reloading || this.cooldown > 0 || this.switchT < 0.98) return;

    if (s.mag <= 0) {
      this.cooldown = 0.28;
      if (this.audio) this.audio.click(0, 0.22, 320);
      this.tryReload();
      return;
    }

    s.mag--;
    this.shotsFired += d.pellets;
    this.cooldown = 60 / d.rpm;

    // where the player is actually pointing
    camera.getWorldDirection(this._dir);
    const camPos = camera.position;

    // aim-assist: bend toward the closest enemy inside a narrow cone (touch forgiveness)
    const assist = this.player.aim ? 1.2 : 3.2;
    let best = null, bestDot = Math.cos(deg(assist));
    const enemies = this.ctx.enemies() || [];
    for (const e of enemies) {
      if (!e.alive) continue;
      this._tmp.set(e.pos.x, e.pos.y + e.height * 0.6, e.pos.z).sub(camPos);
      const dist = this._tmp.length();
      if (dist > d.range) continue;
      this._tmp.divideScalar(dist);
      const dot = this._tmp.dot(this._dir);
      if (dot > bestDot) { bestDot = dot; best = this._tmp.clone(); }
    }
    const baseDir = best || this._dir.clone();

    this._muzzlePos.setFromMatrixPosition(this.models[this.index].userData.muzzle.matrixWorld);

    const spreadRad = deg(this.spreadDeg);
    const hitsReport = [];

    for (let p = 0; p < d.pellets; p++) {
      // random point in a disc -> cone deviation
      const a = rnd(0, TAU);
      const r = Math.sqrt(Math.random()) * spreadRad;
      const dir = baseDir.clone();
      // build an orthonormal basis around dir
      const up = Math.abs(dir.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
      const right = new THREE.Vector3().crossVectors(dir, up).normalize();
      const up2 = new THREE.Vector3().crossVectors(right, dir).normalize();
      dir.addScaledVector(right, Math.cos(a) * Math.tan(r))
        .addScaledVector(up2, Math.sin(a) * Math.tan(r))
        .normalize();

      if (d.explosive) {
        this.ctx.spawnProjectile(this._muzzlePos.clone(), dir.multiplyScalar(d.explosive.speed), d.explosive, d.dmg);
        continue;
      }

      const hits = this.ctx.raycast(camPos.clone(), dir, d.range, d.pierce || 1);
      if (hits.length) {
        hitsReport.push(hits[0]);
        this.shotsHit++;
        const maxDist = hits[hits.length - 1].dist;
        const end = camPos.clone().addScaledVector(dir, maxDist);
        this.fx.tracer(this._muzzlePos, end, d.tracer, d.id === 'beam' ? 0.10 : 0.035, d.id === 'beam' ? 0.18 : 0.13);
        if (d.id === 'beam') {
          this.fx.beam(this._muzzlePos, end, 0x7ae4ff, 0.11, 0.26);
        }
        for (const h of hits) {
          this.ctx.applyDamage(h.enemy, d.dmg * (h.head ? 1.9 : 1), h.point, dir, h.head, d);
        }
        // impact at the last surface
        const last = hits[hits.length - 1];
        this.fx.spark(last.point, dir.clone().negate(), 0xffc070, 5, 6, 0.09, 0.3);
      } else {
        // hit the world
        const end = camPos.clone().addScaledVector(dir, d.range);
        const hitGround = this.ctx.worldHit(camPos.clone(), dir, d.range);
        const p = hitGround || end;
        this.fx.tracer(this._muzzlePos, p, d.tracer, d.id === 'beam' ? 0.10 : 0.035, d.id === 'beam' ? 0.18 : 0.13);
        if (hitGround) {
          this.fx.spark(hitGround, new THREE.Vector3(0, 1, 0), 0xd8b080, 5, 4.5, 0.10, 0.35);
          this.fx.puff(hitGround, null, 0xa07a52, 0.28, 1, 0.55, 0.7);
        }
      }
    }

    // --- the feel: recoil, shake, bloom, model kick
    this.player.addRecoil(d.recoilPitch * (this.player.aim ? 0.82 : 1), d.recoilYaw * rnd(-1, 1));
    this.player.shake = Math.min(2.0, this.player.shake + d.shake);
    if (d.push) {
      // physical shove backwards along the aim direction
      const f = this.player.forward;
      this.player.knock.addScaledVector(f, -d.push);
    }
    this.bloom = Math.min(d.bloomMax, this.bloom + d.spreadBloom);
    this.kick = 1;
    this.kickRot = 1;

    this.fx.muzzleFlash(this._muzzlePos, this._dir, d.flash, d.flashSize);
    this.audio.shot(d.sound, 0);
    if (this.onFired) this.onFired(d);

    if (s.mag === 0) this.tryReload();
    if (this.ctx.onAmmo) this.ctx.onAmmo();
  }

  update(dt) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.switchT = Math.min(1, this.switchT + dt * 6);

    // bloom recovers when you stop shooting
    this.bloom = Math.max(0, this.bloom - (this.def.bloomMax * 1.4 + 1.2) * dt);

    // reload progression
    if (this.reloading) {
      const d = this.def;
      this.reloadT += dt;
      const k = this.reloadT / d.reload;
      if (k > 0.35 && this.reloadStage === 0) { this.reloadStage = 1; this.audio.reload(1); }
      if (k > 0.8 && this.reloadStage === 1) { this.reloadStage = 2; this.audio.reload(2); }
      if (k >= 1) {
        const s = this.ammo;
        const need = d.mag - s.mag;
        if (s.reserve === Infinity) {
          s.mag = d.mag;
        } else {
          const take = Math.min(need, s.reserve);
          s.mag += take;
          s.reserve -= take;
        }
        this.reloading = false;
        this.reloadT = 0;
        this.reloadStage = 0;
        if (this.ctx.onAmmo) this.ctx.onAmmo();
      }
    }

    // visual recoil settle on the model
    this.kick = Math.max(0, this.kick - dt * 9);
    this.kickRot = Math.max(0, this.kickRot - dt * 7);
    const m = this.models[this.index];
    if (m) {
      const k = this.kick * 0.055 * (this.def.id === 'beam' ? 1.6 : 1);
      m.position.set(0, k, -this.kick * 0.02);
      m.rotation.x = this.kickRot * 0.34;
      // reload dip
      const dip = this.reloading ? Math.sin(clamp(this.reloadT / this.def.reload, 0, 1) * Math.PI) : 0;
      m.position.y -= dip * 0.16;
      m.rotation.z = dip * 0.7;
      // switch wobble
      const sw = (1 - this.switchT) * -0.5;
      m.position.y += sw * 0.2;
      m.rotation.z += sw;
    }
  }
}
