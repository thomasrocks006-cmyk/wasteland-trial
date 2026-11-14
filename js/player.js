import * as THREE from 'three';
import {
  TAU, clamp, lerp, damp, dampAngle, smoothstep, deg,
  terrainHeight, Builder, ARENA_R
} from './core.js';

/* Jak-like hero, built from chunky low-poly volumes. 15 k triangles, one material per part. */
export function buildHero() {
  const C = {
    skin: 0xd9a878,
    skinDark: 0xc08a5c,
    hair: 0xe8c86a,
    hairDark: 0xb99a44,
    cream: 0xefe0c4,
    creamDark: 0xd6c4a2,
    teal: 0x2f7f83,
    tealDark: 0x1e5b60,
    olive: 0x6f6a3e,
    oliveDark: 0x54502c,
    boot: 0x4a3320,
    glove: 0x33251a,
    metal: 0x8a8478,
    lens: 0x37e0c8,
  };

  const torso = new Builder();
  // hips
  torso.add(new THREE.BoxGeometry(0.42, 0.24, 0.28), C.olive, { pos: [0, 0.94, 0], jitter: 0.02 });
  // belt
  torso.add(new THREE.BoxGeometry(0.46, 0.09, 0.31), C.boot, { pos: [0, 1.06, 0], jitter: 0.02 });
  // lower torso (cream shirt)
  torso.add(new THREE.BoxGeometry(0.44, 0.34, 0.29), C.cream, { pos: [0, 1.20, 0], jitter: 0.025 });
  // chest / vest
  torso.add(new THREE.BoxGeometry(0.50, 0.28, 0.32), C.teal, { pos: [0, 1.42, 0], jitter: 0.025 });
  torso.add(new THREE.BoxGeometry(0.30, 0.16, 0.34), C.tealDark, { pos: [0, 1.44, 0.01], jitter: 0.02 });
  // shoulder pads
  torso.add(new THREE.BoxGeometry(0.17, 0.17, 0.30), C.tealDark, { pos: [0.30, 1.50, 0], rot: [0, 0, -0.22], jitter: 0.02 });
  torso.add(new THREE.BoxGeometry(0.17, 0.17, 0.30), C.tealDark, { pos: [-0.30, 1.50, 0], rot: [0, 0, 0.22], jitter: 0.02 });
  // neck
  torso.add(new THREE.CylinderGeometry(0.075, 0.09, 0.10, 6), C.skinDark, { pos: [0, 1.60, 0] });
  // head
  torso.add(new THREE.BoxGeometry(0.26, 0.27, 0.26), C.skin, { pos: [0, 1.76, 0], jitter: 0.02 });
  torso.add(new THREE.BoxGeometry(0.22, 0.10, 0.05), C.skinDark, { pos: [0, 1.70, 0.13], jitter: 0.02 }); // jaw shadow
  // pointed ears
  torso.add(new THREE.ConeGeometry(0.055, 0.24, 4), C.skin, { pos: [0.15, 1.80, -0.04], rot: [0, 0, -1.35], jitter: 0.02 });
  torso.add(new THREE.ConeGeometry(0.055, 0.24, 4), C.skin, { pos: [-0.15, 1.80, -0.04], rot: [0, 0, 1.35], jitter: 0.02 });
  // hair: a low mass with short back-swept spikes (not a hat)
  torso.add(new THREE.BoxGeometry(0.30, 0.14, 0.30), C.hair, { pos: [0, 1.90, -0.01], rot: [-0.06, 0, 0], jitter: 0.03 });
  const spikes = [
    [0, 2.00, 0.00, 0.115, 0.15, 0],
    [0.11, 1.99, -0.01, 0.085, 0.13, 0.5],
    [-0.11, 1.99, -0.01, 0.085, 0.13, -0.5],
    [0.05, 1.97, 0.13, 0.075, 0.12, 1.15],
    [-0.06, 1.97, 0.12, 0.075, 0.11, -1.15],
    [0, 1.97, -0.14, 0.085, 0.14, -0.6],
    [0.13, 1.96, 0.05, 0.065, 0.11, 1.35],
    [-0.13, 1.96, 0.04, 0.065, 0.11, -1.35],
  ];
  for (const [x, y, z, r, h, rz] of spikes) {
    torso.add(new THREE.ConeGeometry(r, h, 5), rngHair(), {
      pos: [x, y, z], rot: [z > 0 ? -0.5 : 0.35, 0, rz], jitter: 0.03
    });
  }
  // goggles on forehead
  torso.add(new THREE.TorusGeometry(0.085, 0.022, 4, 10), C.metal, { pos: [0, 1.90, 0.15], rot: [1.25, 0, 0], jitter: 0.02 });
  torso.add(new THREE.TorusGeometry(0.085, 0.022, 4, 10), C.metal, { pos: [0, 1.90, -0.15], rot: [1.25, 0, 0], jitter: 0.02 });
  torso.add(new THREE.BoxGeometry(0.36, 0.05, 0.05), C.boot, { pos: [0, 1.92, 0.0] });
  // eyes (eco glow)
  torso.add(new THREE.BoxGeometry(0.045, 0.035, 0.02), C.lens, { pos: [0.065, 1.79, 0.132] });
  torso.add(new THREE.BoxGeometry(0.045, 0.035, 0.02), C.lens, { pos: [-0.065, 1.79, 0.132] });
  // back strap
  torso.add(new THREE.BoxGeometry(0.07, 0.46, 0.02), C.boot, { pos: [0.12, 1.32, -0.17], rot: [0, 0, 0.22] });

  const torsoMesh = new THREE.Mesh(torso.build(), new THREE.MeshLambertMaterial({ vertexColors: true }));
  torsoMesh.castShadow = true;

  /* --- limbs built with the joint at the origin --- */
  const armGeo = (side) => {
    const b = new Builder();
    b.add(new THREE.CylinderGeometry(0.062, 0.075, 0.30, 6), C.tealDark, { pos: [0, -0.15, 0], jitter: 0.02 });
    b.add(new THREE.CylinderGeometry(0.055, 0.062, 0.28, 6), C.skin, { pos: [0, -0.43, 0], jitter: 0.02 });
    b.add(new THREE.BoxGeometry(0.10, 0.11, 0.10), C.glove, { pos: [0, -0.58, 0], jitter: 0.02 });
    b.add(new THREE.BoxGeometry(0.115, 0.05, 0.115), C.teal, { pos: [0, -0.315, 0], jitter: 0.02 });
    return b.build();
  };
  const legGeo = () => {
    const b = new Builder();
    b.add(new THREE.CylinderGeometry(0.085, 0.075, 0.40, 6), C.olive, { pos: [0, -0.20, 0], jitter: 0.02 });
    b.add(new THREE.CylinderGeometry(0.068, 0.078, 0.34, 6), C.oliveDark, { pos: [0, -0.55, 0], jitter: 0.02 });
    b.add(new THREE.BoxGeometry(0.14, 0.13, 0.14), C.boot, { pos: [0, -0.74, 0], jitter: 0.02 });
    b.add(new THREE.BoxGeometry(0.145, 0.09, 0.30), C.boot, { pos: [0, -0.79, 0.07], jitter: 0.02 });
    b.add(new THREE.BoxGeometry(0.15, 0.05, 0.16), C.metal, { pos: [0, -0.73, 0.02] });
    return b.build();
  };

  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const mk = (geo) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; return m; };

  const armL = new THREE.Group(); armL.position.set(-0.30, 1.46, 0); armL.add(mk(armGeo(-1)));
  const armR = new THREE.Group(); armR.position.set(0.30, 1.46, 0); armR.add(mk(armGeo(1)));
  const legL = new THREE.Group(); legL.position.set(-0.12, 0.92, 0); legL.add(mk(legGeo()));
  const legR = new THREE.Group(); legR.position.set(0.12, 0.92, 0); legR.add(mk(legGeo()));

  const root = new THREE.Group();
  const body = new THREE.Group();
  body.add(torsoMesh, armL, armR, legL, legR);
  root.add(body);

  // hand mount for the gunstaff
  const hand = new THREE.Group();
  hand.position.set(0, -0.58, 0.02);
  armR.add(hand);

  return { root, body, armL, armR, legL, legR, hand, torsoMesh };
}

function rngHair() { return Math.random() > 0.5 ? 0xe8c86a : 0xd8b656; }

export class Player {
  constructor(scene, world) {
    this.world = world;
    this.model = buildHero();
    scene.add(this.model.root);

    this.pos = new THREE.Vector3(0, 0, 0);
    this.vel = new THREE.Vector3();
    this.vy = 0;
    this.yaw = Math.PI;
    this.grounded = true;

    this.camYaw = Math.PI;
    this.camPitch = -0.06;
    this.aim = false;

    this.maxHp = 100;
    this.hp = 100;
    this.alive = true;
    this.speed = 5.5;
    this.sprintMul = 1.55;

    // recoil / shake state (driven by weapons + damage)
    this.recoilPitch = 0;
    this.recoilYaw = 0;
    this.recoilVelP = 0;
    this.recoilVelY = 0;
    this.shake = 0;
    this.shakeT = 0;
    this.hurtFlash = 0;
    this.knock = new THREE.Vector3();
    this.faceLock = 0;
    this.iframe = 0;

    // ---- eco and the two forms
    this.eco = 0;
    this.maxEco = 100;
    this.mode = 'normal';
    this.modeT = 0;
    this.dmgMul = 1;
    this.dmgTakenMul = 1;
    this.fireRateMul = 1;
    this.onMode = null;

    const auraMat = new THREE.MeshBasicMaterial({
      color: 0x66f0ff, transparent: true, opacity: 0.16,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide
    });
    this.aura = new THREE.Mesh(new THREE.SphereGeometry(1.05, 12, 10), auraMat);
    this.aura.position.y = 1.0;
    this.aura.visible = false;
    this.model.root.add(this.aura);
    this.auraLight = new THREE.PointLight(0x66f0ff, 0, 10, 2);
    this.auraLight.position.y = 1.3;
    this.model.root.add(this.auraLight);
    this.lookVelX = 0;
    this.lookVelY = 0;
    this.dodging = 0;
    this.dodgeCd = 0;
    this.dodgeVX = 0;
    this.dodgeVZ = 0;
    this.recentre = 0;
    this.landSquash = 0;

    this.walkPhase = 0;
    this.stepTimer = 0;
    this.onFootstep = null;

    this.camPos = new THREE.Vector3();
    this.camLook = new THREE.Vector3();
    this._camTarget = new THREE.Vector3();

    this.pos.set(0, 0, 12);          // clear of the central dais, which is solid
    this.pos.y = terrainHeight(0, 12);
    this.model.root.position.copy(this.pos);
  }

  get forward() {
    return new THREE.Vector3(Math.sin(this.camYaw), 0, Math.cos(this.camYaw));
  }
  get eyePos() {
    return new THREE.Vector3(this.pos.x, this.pos.y + 1.55, this.pos.z);
  }

  addRecoil(pitchDeg, yawDeg) {
    this.recoilVelP += deg(pitchDeg) * 16.0;
    this.recoilVelY += deg(yawDeg) * 16.0;
    this.shake = Math.min(1.6, this.shake + pitchDeg * 0.055);
    this.faceLock = 0.9;
  }

  damage(amount, fromX, fromZ) {
    if (!this.alive) return;
    if (this.iframe > 0) return;
    this.iframe = 0.40;
    this.hp = Math.max(0, this.hp - amount * this.dmgTakenMul);
    this.hurtFlash = 1;
    this.shake = Math.min(2.0, this.shake + 0.45);
    if (fromX !== undefined) {
      const a = Math.atan2(fromX - this.pos.x, fromZ - this.pos.z);
      if (this.onDamageDir) this.onDamageDir(a);
    }
    if (this.hp <= 0) this.alive = false;
  }

  heal(n) { this.hp = Math.min(this.maxHp, this.hp + n); }

  addEco(n) { this.eco = Math.min(this.maxEco, this.eco + n); }

  /** Light form: fast, shielded, healing. Dark form: heavy damage, unavoidable. */
  activateMode(mode) {
    if (this.modeT > 0 || this.eco < 45 || !this.alive) return false;
    this.eco -= 45;
    this.mode = mode;
    this.modeT = 9;
    if (mode === 'light') {
      this.dmgMul = 1;
      this.dmgTakenMul = 0.42;
      this.fireRateMul = 1.35;
      this.aura.material.color.setHex(0x6ef0ff);
      this.auraLight.color.setHex(0x6ef0ff);
      this.heal(22);
    } else {
      this.dmgMul = 1.75;
      this.dmgTakenMul = 0.82;
      this.fireRateMul = 1.0;
      this.aura.material.color.setHex(0xc06bff);
      this.auraLight.color.setHex(0xc06bff);
    }
    this.aura.visible = true;
    this.auraLight.intensity = 5;
    if (this.onMode) this.onMode(mode);
    return true;
  }

  endMode() {
    if (this.mode === 'normal') return;
    this.mode = 'normal';
    this.modeT = 0;
    this.dmgMul = 1;
    this.dmgTakenMul = 1;
    this.fireRateMul = 1;
    this.aura.visible = false;
    this.auraLight.intensity = 0;
    if (this.onMode) this.onMode('normal');
  }

  /* input: {mx, my, jump, sprint, lookX, lookY} */
  update(dt, input) {
    if (!this.alive) { this.updateCamera(dt); return; }

    // ---- camera look (smoothed so touch jitter doesn't snap the aim)
    // dragging right must turn the view right, which is +yaw here
    this.lookVelX = damp(this.lookVelX, input.lookX, 34, dt);
    this.lookVelY = damp(this.lookVelY, input.lookY, 34, dt);
    this.camYaw += this.lookVelX;
    this.camPitch = clamp(this.camPitch - this.lookVelY, -0.95, 0.62);

    // ---- recoil spring
    this.recoilVelP += -this.recoilPitch * 46 * dt;
    this.recoilVelP *= Math.exp(-9 * dt);
    this.recoilPitch += this.recoilVelP * dt;
    this.recoilVelY += -this.recoilYaw * 46 * dt;
    this.recoilVelY *= Math.exp(-9 * dt);
    this.recoilYaw += this.recoilVelY * dt;
    this.shake = Math.max(0, this.shake - dt * 2.6);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 1.8);
    this.iframe = Math.max(0, this.iframe - dt);

    // ---- form timer and aura
    if (this.modeT > 0) {
      this.modeT -= dt;
      if (this.mode === 'light') this.heal(7 * dt);
      const p = performance.now();
      this.aura.material.opacity = 0.13 + Math.sin(p * 0.006) * 0.05;
      this.aura.scale.setScalar(1 + Math.sin(p * 0.004) * 0.06);
      this.auraLight.intensity = 4 + Math.sin(p * 0.005) * 1.6;
      if (this.modeT <= 0) this.endMode();
    }

    // ---- movement in camera space
    const mx = input.mx, my = input.my;
    const mag = Math.min(1, Math.hypot(mx, my));
    const spd = this.speed * (input.sprint ? this.sprintMul : 1) * (this.aim ? 0.55 : 1);
    let wishX = 0, wishZ = 0;
    if (mag > 0.06) {
      const cy = this.camYaw;
      // local (mx = strafe right, my = forward)
      const fx = Math.sin(cy), fz = Math.cos(cy);
      const rx = Math.cos(cy), rz = -Math.sin(cy);
      wishX = (fx * my + rx * mx) / Math.max(mag, 1e-3) * mag;
      wishZ = (fz * my + rz * mx) / Math.max(mag, 1e-3) * mag;
      const wl = Math.hypot(wishX, wishZ) || 1;
      wishX = wishX / wl * mag; wishZ = wishZ / wl * mag;
    }

    // ---- dodge roll: a burst of speed with brief invulnerability
    this.dodgeCd = Math.max(0, this.dodgeCd - dt);
    if (input.dodge && this.grounded && this.dodgeCd <= 0 && this.dodging <= 0) {
      let dx = wishX, dz = wishZ;
      if (Math.hypot(dx, dz) < 0.2) { dx = -Math.sin(this.camYaw); dz = -Math.cos(this.camYaw); }
      const l = Math.hypot(dx, dz) || 1;
      this.dodgeVX = (dx / l) * 15;
      this.dodgeVZ = (dz / l) * 15;
      this.dodging = 0.34;
      this.dodgeCd = 0.8;
      this.iframe = Math.max(this.iframe, 0.42);
      this.yaw = Math.atan2(this.dodgeVX, this.dodgeVZ);
      if (this.onDodge) this.onDodge();
    }

    if (this.dodging > 0) {
      this.dodging -= dt;
      const k = clamp(this.dodging / 0.34, 0, 1);
      this.vel.x = this.dodgeVX * k;
      this.vel.z = this.dodgeVZ * k;
    } else {
      const accel = this.grounded ? 22 : 8;
      this.vel.x = damp(this.vel.x, wishX * spd, accel, dt);
      this.vel.z = damp(this.vel.z, wishZ * spd, accel, dt);
    }

    // knockback
    this.vel.x += this.knock.x * dt;
    this.vel.z += this.knock.z * dt;
    this.knock.multiplyScalar(Math.exp(-5 * dt));

    // ---- jump + gravity
    if (input.jump && this.grounded) {
      this.vy = 7.6;
      this.grounded = false;
    }
    this.vy -= 26 * dt;

    let nx = this.pos.x + this.vel.x * dt;
    let nz = this.pos.z + this.vel.z * dt;
    [nx, nz] = this.world.resolveCollisions(nx, nz, 0.42);
    this.pos.x = nx; this.pos.z = nz;
    this.pos.y += this.vy * dt;

    const gh = terrainHeight(this.pos.x, this.pos.z);
    if (this.pos.y <= gh) {
      this.pos.y = gh;
      if (this.vy < -6 && this.onLand) this.onLand(-this.vy);
      if (this.vy < -5) this.landSquash = clamp(-this.vy / 14, 0, 0.55);
      this.vy = 0;
      this.grounded = true;
    } else {
      this.grounded = this.pos.y - gh < 0.12;
      if (this.grounded) this.pos.y = gh;
    }

    // ---- facing
    this.faceLock = Math.max(0, this.faceLock - dt);
    let targetYaw = this.yaw;
    if (this.aim || this.faceLock > 0) targetYaw = this.camYaw;
    else if (mag > 0.08) targetYaw = Math.atan2(wishX, wishZ);
    this.yaw = dampAngle(this.yaw, targetYaw, this.aim ? 22 : 16, dt);

    // ---- model transform
    this.landSquash = damp(this.landSquash, 0, 9, dt);
    const m = this.model;
    m.root.position.copy(this.pos);
    m.root.rotation.y = this.yaw;

    if (this.dodging > 0) {
      const k = 1 - clamp(this.dodging / 0.34, 0, 1);
      m.body.rotation.x = k * TAU;                        // full forward roll
      m.root.position.y += Math.sin(k * Math.PI) * 0.22;  // arc over the ground
    } else {
      if (Math.abs(m.body.rotation.x) > 3) m.body.rotation.x -= Math.sign(m.body.rotation.x) * TAU;
      m.body.rotation.x = damp(m.body.rotation.x, (this.aim ? 0.10 : 0.02) + this.landSquash * 0.45, 9, dt);
    }
    m.body.scale.y = damp(m.body.scale.y, 1 - this.landSquash * 0.26, 14, dt);
    m.body.scale.x = damp(m.body.scale.x, 1 + this.landSquash * 0.14, 14, dt);
    m.body.scale.z = m.body.scale.x;

    // lean into strafe
    const strafe = (this.vel.x * Math.cos(this.camYaw) - this.vel.z * Math.sin(this.camYaw));
    m.body.rotation.z = damp(m.body.rotation.z, clamp(-strafe * 0.035, -0.13, 0.13), 10, dt);

    // ---- limbs
    const horiz = Math.hypot(this.vel.x, this.vel.z);
    const moving = horiz > 0.35;
    if (moving) {
      this.walkPhase += dt * (5.2 + horiz * 0.85);
      this.stepTimer -= dt;
      if (this.stepTimer <= 0) {
        this.stepTimer = clamp(0.42 - horiz * 0.02, 0.16, 0.42);
        if (this.onFootstep && this.grounded) this.onFootstep(horiz);
      }
    } else {
      this.walkPhase = damp(this.walkPhase % TAU, Math.round(this.walkPhase / Math.PI) * Math.PI, 8, dt);
    }

    const sw = Math.sin(this.walkPhase);
    const swAmt = clamp(horiz / 6, 0, 1);
    const legSwing = sw * 0.85 * swAmt;
    if (this.grounded) {
      m.legR.rotation.x = legSwing;
      m.legL.rotation.x = -legSwing;
    } else {
      m.legR.rotation.x = damp(m.legR.rotation.x, -0.55, 8, dt);
      m.legL.rotation.x = damp(m.legL.rotation.x, 0.28, 8, dt);
    }

    // arms: aim pose vs relaxed
    const aimBlend = this.aim ? 1 : 0;
    m.armR.rotation.x = damp(m.armR.rotation.x, -1.42 * aimBlend + (-0.98 - legSwing * 0.35) * (1 - aimBlend), 14, dt);
    m.armR.rotation.z = damp(m.armR.rotation.z, 0.16 * aimBlend - 0.04, 12, dt);
    m.armR.rotation.y = damp(m.armR.rotation.y, -0.10 * aimBlend, 12, dt);
    m.armL.rotation.x = damp(m.armL.rotation.x, -1.30 * aimBlend + (-0.85 + legSwing * 0.30) * (1 - aimBlend), 14, dt);
    m.armL.rotation.z = damp(m.armL.rotation.z, -0.30 * aimBlend, 12, dt);

    // idle bob / breathing
    const bob = Math.sin(this.walkPhase * 2) * 0.045 * swAmt + Math.sin(performance.now() * 0.0018) * 0.012;
    m.body.position.y = damp(m.body.position.y, bob - 0.085, 16, dt);  // 0.085 = sole height, so feet touch

    this.updateCamera(dt);
  }

  updateCamera(dt) {
    const aiming = this.aim;
    const targetDist = aiming ? 2.35 : 4.35;
    const targetHeight = aiming ? 1.66 : 1.78;
    const shoulder = aiming ? 0.60 : 0.86;

    if (this.camDist === undefined) this.camDist = targetDist;
    this.camDist = damp(this.camDist, targetDist, 9, dt);
    this.camShoulder = damp(this.camShoulder || shoulder, shoulder, 9, dt);
    this.camHeight = damp(this.camHeight || targetHeight, targetHeight, 9, dt);

    const cy = this.camYaw + this.recoilYaw;
    const cp = this.camPitch + this.recoilPitch;

    const pivot = this._camTarget.set(
      this.pos.x, this.pos.y + this.camHeight, this.pos.z
    );

    // camera direction
    const dirX = Math.sin(cy) * Math.cos(cp);
    const dirY = Math.sin(cp);
    const dirZ = Math.cos(cy) * Math.cos(cp);

    // right vector for shoulder offset
    const rx = Math.cos(cy), rz = -Math.sin(cy);

    let px = pivot.x + rx * this.camShoulder - dirX * this.camDist;
    let py = pivot.y - dirY * this.camDist + 0.18;
    let pz = pivot.z + rz * this.camShoulder - dirZ * this.camDist;

    // keep camera above ground
    const gh = terrainHeight(px, pz) + 0.55;
    if (py < gh) py = gh;

    // shake
    const sh = this.shake;
    if (sh > 0.001) {
      const t = performance.now() * 0.001;
      px += Math.sin(t * 47.3) * sh * 0.11;
      py += Math.sin(t * 61.7) * sh * 0.09;
      pz += Math.cos(t * 53.1) * sh * 0.11;
    }

    this.camPos.set(px, py, pz);
    // look straight down the pivot's forward axis so the hero sits left of centre
    // and the gun has clear screen space
    this.camLook.set(
      pivot.x + dirX * 30,
      pivot.y + dirY * 30 + (aiming ? 0.02 : 0.10),
      pivot.z + dirZ * 30
    );
  }

  applyToCamera(camera) {
    camera.position.copy(this.camPos);
    camera.lookAt(this.camLook);
    // roll with strafe for weight
    const strafe = (this.vel.x * Math.cos(this.camYaw) - this.vel.z * Math.sin(this.camYaw));
    camera.rotation.z += clamp(-strafe * 0.006, -0.03, 0.03);
  }
}
