import * as THREE from 'three';
import {
  TAU, clamp, lerp, damp, dampAngle, smoothstep, deg,
  terrainHeight, Builder, ARENA_R, addRim, fabricTexture, waterLevel
} from './core.js';

/* The runner: an original wasteland scout. Rounded, smooth-shaded volumes in an
   animated-film style (not blocks): a red headwrap with streaming tails, navy
   jacket, sand scarf, brass shoulder plate, cyan earpiece. Jointed rig: spine,
   neck, shoulders, elbows, wrists, hips, knees, ankles. Faces +z; right is -x. */
export function buildHero() {
  const C = {
    skin: 0xb97b52, skinDark: 0x9a6340, hair: 0x241811,
    wrap: 0xb0412a, wrapDark: 0x7c2a19,
    cream: 0xd8c49a, creamDark: 0xbfa77a,
    jacket: 0x2d3d73, jacketDark: 0x1e2952,
    trousers: 0x3d3833, trousersDark: 0x2b2723,
    boot: 0x3a2818, sole: 0x1c140e, glove: 0x2a1f16,
    brass: 0xc0903c, eye: 0xf4efe6, iris: 0x2a1a10, cyan: 0x37e0c8,
  };
  const S = (r, w = 20, h = 14) => new THREE.SphereGeometry(r, w, h);
  const CAP = (r, l) => new THREE.CapsuleGeometry(r, l, 6, 14);
  const CYL = (r0, r1, h, s = 18) => new THREE.CylinderGeometry(r0, r1, h, s);
  const cloth = fabricTexture();
  const mat = addRim(new THREE.MeshLambertMaterial({ vertexColors: true, map: cloth }), 0xffe2b8, 0.42, 2.6);
  // skin gets its own clean material: cloth weave on a face reads as a print
  const skinMat = addRim(new THREE.MeshLambertMaterial({ vertexColors: true }), 0xffd2a8, 0.22, 3.0);
  const mesh = (b, m = mat) => { const o = new THREE.Mesh(b.buildUV(3.2), m); o.castShadow = true; return o; };
  const B = () => new Builder({ smooth: true });
  const G = (x = 0, y = 0, z = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); return g; };

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  // ---- hips (body space), the torso pivots above them
  const hips = B();
  hips.add(CAP(0.14, 0.13), C.trousers, { pos: [0, 0.97, 0], rot: [0, 0, Math.PI / 2], scale: [1, 1, 0.78] });
  body.add(mesh(hips));

  const torso = G(0, 1.0, 0);
  body.add(torso);
  const t = B();
  t.add(CYL(0.165, 0.17, 0.07), C.boot, { pos: [0, 0.04, 0], scale: [1, 1, 0.78] });                // belt
  t.add(new THREE.BoxGeometry(0.07, 0.05, 0.02), C.brass, { pos: [0, 0.04, 0.135] });                // buckle
  t.add(CYL(0.15, 0.165, 0.2), C.cream, { pos: [0, 0.17, 0], scale: [1, 1, 0.76] });                // shirt
  t.add(CAP(0.18, 0.2), C.jacket, { pos: [0, 0.39, 0], scale: [1.18, 1, 0.8] });                    // chest
  t.add(CYL(0.2, 0.19, 0.16), C.jacket, { pos: [0, 0.16, -0.012], scale: [1, 1, 0.8] });            // jacket hem
  t.add(new THREE.BoxGeometry(0.07, 0.3, 0.03), C.cream, { pos: [0, 0.3, 0.145], rot: [0.05, 0, 0] }); // open front
  t.add(new THREE.TorusGeometry(0.105, 0.05, 10, 20), C.cream, { pos: [0, 0.6, 0], rot: [Math.PI / 2, 0, 0] }); // scarf
  t.add(CAP(0.035, 0.22), C.creamDark, { pos: [0.05, 0.47, -0.16], rot: [0.25, 0, 0.1] });          // scarf end
  t.add(S(0.11), C.brass, { pos: [-0.235, 0.555, 0], scale: [1.15, 0.55, 1.05] });                  // shoulder plate
  t.add(CAP(0.03, 0.4), C.boot, { pos: [-0.08, 0.35, -0.16], rot: [0, 0, -0.45] });                 // back strap
  t.add(new THREE.TorusGeometry(0.15, 0.068, 10, 22), 0x6b5440, { pos: [0, 0.585, -0.035], rot: [Math.PI / 2, 0, 0], scale: [1.18, 1, 0.92] }); // fur collar
  const torsoMesh = mesh(t);
  torso.add(torsoMesh);

  // the cloak: a cloth panel hung from the shoulders, shaped every frame (see update)
  const cg = new THREE.PlaneGeometry(0.62, 1.05, 4, 10);
  cg.translate(0, -0.525, 0);
  // no rim light here: a thin cloth seen edge-on is all 'edge' and washed out pale
  const cloak = new THREE.Mesh(cg, new THREE.MeshLambertMaterial({ color: 0x35503d, map: cloth, side: THREE.DoubleSide }));
  cloak.position.set(0, 0.6, -0.2);
  cloak.castShadow = true;
  cloak.userData.base = Float32Array.from(cg.attributes.position.array);
  torso.add(cloak);
  const nk = B();
  nk.add(CYL(0.058, 0.065, 0.1), C.skinDark, { pos: [0, 0.68, 0] });                                 // neck
  torso.add(mesh(nk, skinMat));

  // ---- head
  const head = G(0, 0.72, 0);
  torso.add(head);
  // face: skin pieces on the clean material, features kept small and close-set
  const f = B();
  f.add(S(0.15, 24, 18), C.skin, { pos: [0, 0.16, 0], scale: [0.94, 1.12, 1.02] });                  // skull
  f.add(S(0.105, 18, 14), C.skin, { pos: [0, 0.07, 0.04], scale: [0.95, 0.95, 1] });                 // jaw and chin
  f.add(S(0.019, 10, 8), C.skinDark, { pos: [0, 0.135, 0.152], scale: [0.85, 1.3, 1.1] });           // nose
  f.add(CAP(0.007, 0.04), C.skinDark, { pos: [0, 0.088, 0.135], rot: [0, 0, Math.PI / 2] });          // mouth
  for (const sx of [-1, 1]) {
    f.add(S(0.035, 10, 8), C.skin, { pos: [sx * 0.143, 0.15, -0.01], scale: [0.42, 1, 0.75] });     // round ear
  }
  head.add(mesh(f, skinMat));
  const h = B();
  for (const sx of [-1, 1]) {
    h.add(S(0.024, 12, 10), C.eye, { pos: [sx * 0.05, 0.172, 0.126], scale: [1.15, 0.95, 0.55] });
    h.add(S(0.015, 10, 8), C.iris, { pos: [sx * 0.05, 0.172, 0.139], scale: [1, 1.05, 0.5] });
    h.add(CAP(0.0095, 0.05), C.hair, { pos: [sx * 0.052, 0.208, 0.132], rot: [0.1, 0, Math.PI / 2 + sx * 0.22] }); // brow
  }
  h.add(S(0.156, 20, 14), C.hair, { pos: [0, 0.155, -0.035], scale: [0.96, 1.08, 1] });              // hair under the wrap
  h.add(CAP(0.05, 0.08), C.hair, { pos: [0, 0.06, -0.12], rot: [0.5, 0, 0] });                       // nape
  // headwrap, tilted back with a rolled lower edge, so it reads as cloth not a hat band
  h.add(CYL(0.158, 0.166, 0.085), C.wrap, { pos: [0, 0.26, -0.008], rot: [-0.18, 0, 0] });
  h.add(new THREE.TorusGeometry(0.16, 0.017, 8, 28), C.wrapDark, { pos: [0, 0.222, 0.0], rot: [Math.PI / 2 - 0.18, 0, 0] });
  h.add(S(0.162, 20, 12), C.wrap, { pos: [0, 0.275, -0.015], rot: [-0.18, 0, 0], scale: [1, 0.6, 1.03] });
  h.add(S(0.045), C.wrapDark, { pos: [0, 0.25, -0.17] });                                            // knot
  h.add(CYL(0.022, 0.022, 0.02), C.cyan, { pos: [0.152, 0.15, 0], rot: [0, 0, Math.PI / 2] });       // earpiece
  head.add(mesh(h));
  const tails = G(0, 0.255, -0.175);
  const tl = B();
  tl.add(CAP(0.026, 0.2), C.wrap, { pos: [0.025, -0.11, -0.02], rot: [0.15, 0, 0.15] });
  tl.add(CAP(0.022, 0.16), C.wrapDark, { pos: [-0.03, -0.09, -0.01], rot: [0.1, 0, -0.2] });
  tails.add(mesh(tl));
  head.add(tails);

  // ---- arms: shoulder -> elbow -> wrist. Total reach 0.58 to the hand mount.
  const arm = (side) => {
    const sh = G(side * 0.245, 0.53, 0);
    sh.rotation.order = 'YXZ';      // pitch the arm first, then sweep it round: what a slash needs
    const u = B();
    u.add(S(0.078), C.jacket, { pos: [0, -0.01, 0] });
    u.add(CAP(0.064, 0.18), C.jacket, { pos: [0, -0.15, 0] });
    sh.add(mesh(u));
    const elbow = G(0, -0.29, 0);
    const f = B();
    f.add(new THREE.TorusGeometry(0.058, 0.02, 8, 14), C.jacketDark, { pos: [0, -0.015, 0], rot: [Math.PI / 2, 0, 0] }); // cuff
    f.add(CAP(0.052, 0.17), C.jacket, { pos: [0, -0.13, 0] });                                        // sleeve down to the glove
    elbow.add(mesh(f));
    sh.add(elbow);
    const hand = G(0, -0.29, 0.02);
    const hd = B();
    hd.add(S(0.055, 14, 10), C.glove, { pos: [0, -0.02, 0], scale: [0.9, 1.1, 0.85] });
    hand.add(mesh(hd));
    elbow.add(hand);
    return { sh, elbow, hand };
  };
  const R = arm(-1), L = arm(1);
  torso.add(R.sh, L.sh);

  // ---- legs: hip -> knee -> ankle; the sole lands at body y 0.085 when straight
  const leg = (side) => {
    const hip = G(side * 0.1, 0.92, 0);
    const th = B();
    th.add(CAP(0.092, 0.22), C.trousers, { pos: [0, -0.2, 0] });
    th.add(S(0.07), C.trousersDark, { pos: [0, -0.4, 0.03], scale: [1, 0.9, 0.8] });                  // knee pad
    hip.add(mesh(th));
    const knee = G(0, -0.42, 0);
    const sn = B();
    sn.add(CAP(0.074, 0.19), C.trousersDark, { pos: [0, -0.15, 0] });
    sn.add(CYL(0.075, 0.07, 0.1), C.boot, { pos: [0, -0.26, 0] });                                   // boot shaft
    knee.add(mesh(sn));
    hip.add(knee);
    const foot = G(0, -0.3, 0);
    const ft = B();
    ft.add(S(0.085, 16, 12), C.boot, { pos: [0, -0.04, 0.045], scale: [0.95, 0.75, 1.55] });
    ft.add(new THREE.BoxGeometry(0.15, 0.04, 0.29), C.sole, { pos: [0, -0.1, 0.045] });
    foot.add(mesh(ft));
    knee.add(foot);
    return { hip, knee, foot };
  };
  const LR = leg(-1), LL = leg(1);
  body.add(LR.hip, LL.hip);

  return {
    root, body, torso, head, tails, torsoMesh, cloak,
    armR: R.sh, armL: L.sh, elbowR: R.elbow, elbowL: L.elbow, hand: R.hand, handL: L.hand,
    legR: LR.hip, legL: LL.hip, kneeR: LR.knee, kneeL: LL.knee, footR: LR.foot, footL: LL.foot,
  };
}

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
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.landDip = 0;

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

    // ---- charge (internally 'eco') and the two forms
    this.eco = 0;
    this.maxEco = 100;
    this.mode = 'normal';
    this.modeT = 0;
    this.dmgMul = 1;
    this.dmgTakenMul = 1;
    this.fireRateMul = 1;
    this.onMode = null;
    this.formDur = 9;          // perks can lengthen it
    this.dodgeCdBase = 0.8;
    this.dodgeIframe = 0.42;
    this.regen = 0;            // health per second from perks
    this.weaponKind = 'melee';  // melee | thrown | spell, set by the weapon system
    this.swingAnim = null;
    this._swingTwist = 0;
    this.inWater = 0;          // wading depth in metres

    const auraMat = new THREE.MeshBasicMaterial({
      color: 0x66f0ff, transparent: true, opacity: 0.26,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide
    });
    this.aura = new THREE.Mesh(new THREE.SphereGeometry(1.05, 12, 10), auraMat);
    this.aura.position.y = 1.0;
    this.aura.visible = false;
    this.model.root.add(this.aura);
    // a ring at the feet reads the form far better than a shell alone
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x66f0ff, transparent: true, opacity: 0.75,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
    });
    this.auraRing = new THREE.Mesh(new THREE.RingGeometry(0.75, 1.15, 24), ringMat);
    this.auraRing.rotation.x = -Math.PI / 2;
    this.auraRing.position.y = 0.06;
    this.auraRing.visible = false;
    this.model.root.add(this.auraRing);
    this.auraLight = new THREE.PointLight(0x66f0ff, 0, 14, 2);
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

  /** R / L horizontal slashes, O overhead chop, T spear throw, C rune cast */
  startSwing(style, dur) { this.swingAnim = { style, dur, t: 0 }; }

  addEco(n) { this.eco = Math.min(this.maxEco, this.eco + n); }

  /** Light form: fast, shielded, healing. Dark form: heavy damage, unavoidable. */
  activateMode(mode) {
    if (this.modeT > 0 || this.eco < 45 || !this.alive) return false;
    this.eco -= 45;
    this.mode = mode;
    this.modeT = this.formDur;
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
    this.auraRing.visible = true;
    this.auraRing.material.color.copy(this.aura.material.color);
    this.auraLight.intensity = 7;
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
    this.auraRing.visible = false;
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
    // +yaw swings the view to screen-LEFT here, so a rightward drag must lower it
    this.camYaw -= this.lookVelX;
    this.camPitch = clamp(this.camPitch - this.lookVelY, -0.95, 0.62);

    // ---- recoil spring
    this.recoilVelP += -this.recoilPitch * 46 * dt;
    this.recoilVelP *= Math.exp(-9 * dt);
    this.recoilPitch += this.recoilVelP * dt;
    this.recoilVelY += -this.recoilYaw * 46 * dt;
    this.recoilVelY *= Math.exp(-9 * dt);
    this.recoilYaw += this.recoilVelY * dt;
    this.shake = Math.max(0, this.shake - dt * 2.6);
    this.landDip = damp(this.landDip || 0, 0, 11, dt);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 1.8);
    this.iframe = Math.max(0, this.iframe - dt);

    if (this.regen > 0) this.heal(this.regen * dt);

    // ---- form timer and aura
    if (this.modeT > 0) {
      this.modeT -= dt;
      if (this.mode === 'light') this.heal(7 * dt);
      const p = performance.now();
      this.aura.material.opacity = 0.22 + Math.sin(p * 0.006) * 0.08;
      this.aura.scale.setScalar(1 + Math.sin(p * 0.004) * 0.06);
      this.auraLight.intensity = 6 + Math.sin(p * 0.005) * 2.5;
      this.auraRing.rotation.z = p * 0.0009;
      this.auraRing.scale.setScalar(1 + Math.sin(p * 0.007) * 0.12);
      if (this.modeT <= 0) this.endMode();
    }

    // ---- movement in camera space
    const mx = input.mx, my = input.my;
    const mag = Math.min(1, Math.hypot(mx, my));
    const spd = this.speed * (input.sprint ? this.sprintMul : 1) * (this.aim ? 0.55 : 1)
      * (1 - Math.min(0.4, this.inWater * 0.45));      // wading through the river is slower
    let wishX = 0, wishZ = 0;
    if (mag > 0.06) {
      const cy = this.camYaw;
      // local (mx = strafe right, my = forward)
      const fx = Math.sin(cy), fz = Math.cos(cy);
      // screen-right for a camera looking along (sin cy, cos cy); it was the mirror
      // of this, so every sideways push of the stick went the opposite way
      const rx = -Math.cos(cy), rz = Math.sin(cy);
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
      this.dodgeCd = this.dodgeCdBase;
      this.iframe = Math.max(this.iframe, this.dodgeIframe);
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
    // ---- jump: buffered input + coyote time, height cut on release
    this.coyote = this.grounded ? 0.12 : Math.max(0, this.coyote - dt);
    if (input.jump) this.jumpBuffer = 0.15;
    else this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
    if (this.jumpBuffer > 0 && this.coyote > 0 && this.vy <= 0.01) {
      this.vy = 8.4;
      this.grounded = false;
      this.coyote = 0;
      this.jumpBuffer = 0;
      if (this.onJump) this.onJump();
    }
    // holding the button carries you up; letting go cuts the arc short. Falling
    // is heavier than rising, which is what stops it feeling floaty.
    const grav = this.vy > 0 ? (input.jumpHeld ? 27 : 44) : 34;
    this.vy -= grav * dt;

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
      if (this.vy < -4) this.landDip = clamp(-this.vy / 20, 0, 0.42);
      this.vy = 0;
      this.grounded = true;
    } else {
      this.grounded = this.pos.y - gh < 0.12;
      if (this.grounded) this.pos.y = gh;
    }

    const wl = waterLevel(this.pos.x, this.pos.z);
    this.inWater = wl > this.pos.y ? Math.min(1.2, wl - this.pos.y) : 0;

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
    // knees fold while a leg swings forward; ankles keep the sole close to flat
    const kneeOf = (ph) => (0.12 + Math.max(0, -Math.cos(ph)) * 1.05) * swAmt + 0.06;
    if (this.grounded) {
      m.legR.rotation.x = legSwing;
      m.legL.rotation.x = -legSwing;
      m.kneeR.rotation.x = damp(m.kneeR.rotation.x, kneeOf(this.walkPhase), 20, dt);
      m.kneeL.rotation.x = damp(m.kneeL.rotation.x, kneeOf(this.walkPhase + Math.PI), 20, dt);
    } else {
      // tucked in the air: one knee up, the other trailing
      m.legR.rotation.x = damp(m.legR.rotation.x, -0.75, 8, dt);
      m.legL.rotation.x = damp(m.legL.rotation.x, 0.2, 8, dt);
      m.kneeR.rotation.x = damp(m.kneeR.rotation.x, 1.15, 8, dt);
      m.kneeL.rotation.x = damp(m.kneeL.rotation.x, 0.55, 8, dt);
    }
    m.footR.rotation.x = -(m.legR.rotation.x + m.kneeR.rotation.x) * 0.8;
    m.footL.rotation.x = -(m.legL.rotation.x + m.kneeL.rotation.x) * 0.8;

    // arms: a two-handed hold. Low ready while running (gun forward and down, never
    // hanging like a walking stick); shouldered and following the camera's pitch
    // while aiming or firing, so the barrel points where the crosshair is.
    const ready = (this.aim || this.faceLock > 0) ? 1 : 0;
    this.readyBlend = damp(this.readyBlend || 0, ready, 12, dt);
    const r = this.readyBlend;
    const aimX = -(Math.PI / 2 + clamp(this.camPitch + this.recoilPitch, -0.7, 0.7));
    // stance by weapon: the spear two-handed and levelled, a blade up in guard with
    // the off hand free for balance, the rune staff one-handed toward the aim
    const kind = this.weaponKind || 'thrown';
    let tRx, tRz, tLx, tLz, tER, tEL, handX = null;
    if (kind === 'thrown') {
      tRx = lerp(-1.12 - legSwing * 0.12, aimX, r); tRz = lerp(0.30, 0.20, r);
      tLx = lerp(-1.02 - legSwing * 0.10, aimX + 0.22, r); tLz = lerp(-0.62, -0.72, r);
      tER = lerp(-0.45, -0.28, r); tEL = lerp(-0.55, -0.85, r);
    } else if (kind === 'melee') {
      tRx = lerp(-0.7 - legSwing * 0.2, -1.1, r); tRz = lerp(0.14, 0.26, r);
      tLx = lerp(-0.2 + legSwing * 0.5, -0.7, r); tLz = 0.16;
      tER = lerp(-0.75, -1.05, r); tEL = lerp(-0.4, -0.6, r);
      handX = 0.3;
    } else {
      tRx = lerp(-0.9 - legSwing * 0.15, aimX + 0.1, r); tRz = 0.2;
      tLx = lerp(-0.2 + legSwing * 0.5, -0.6, r); tLz = 0.16;
      tER = lerp(-0.5, -0.2, r); tEL = -0.45;
    }
    m.armR.rotation.x = damp(m.armR.rotation.x, tRx, 16, dt);
    m.armR.rotation.z = damp(m.armR.rotation.z, tRz, 12, dt);
    m.armR.rotation.y = damp(m.armR.rotation.y, 0, 14, dt);
    m.armL.rotation.x = damp(m.armL.rotation.x, tLx, 16, dt);
    m.armL.rotation.z = damp(m.armL.rotation.z, tLz, 12, dt);
    // elbows: relaxed bend at low ready, tighter support hand when shouldered.
    // The gun hand counter-rotates, so the barrel stays on the upper arm's aim line.
    m.elbowR.rotation.x = damp(m.elbowR.rotation.x, tER, 16, dt);
    m.elbowL.rotation.x = damp(m.elbowL.rotation.x, tEL, 16, dt);
    m.hand.rotation.x = handX !== null ? handX : -m.elbowR.rotation.x;

    // a swing, throw or cast plays over the stance: wind-up, fast strike, recovery
    this._swingTwist = 0;
    const sa = this.swingAnim;
    if (sa && sa.t < sa.dur) {
      sa.t += dt;
      const k = clamp(sa.t / sa.dur, 0, 1);
      const w = smoothstep(0, 0.12, k) * (1 - smoothstep(0.7, 1, k));
      const e = smoothstep(0.08, 0.5, k);
      let ax = m.armR.rotation.x, ay = 0, er = m.elbowR.rotation.x, tw = 0, hx = m.hand.rotation.x;
      if (sa.style === 'R') { ax = -1.45; ay = lerp(-1.3, 1.1, e); er = -0.2; tw = lerp(-0.5, 0.45, e); hx = 0.1; }
      else if (sa.style === 'L') { ax = -1.45; ay = lerp(1.1, -1.3, e); er = -0.2; tw = lerp(0.45, -0.5, e); hx = 0.1; }
      else if (sa.style === 'O') { ax = lerp(-3.0, -0.5, e); ay = 0.1; er = lerp(-0.7, -0.05, e); hx = 0.15; }
      else if (sa.style === 'T') { ax = lerp(-2.8, -1.25, e); ay = -0.15; er = lerp(-1.2, -0.1, e); }
      else if (sa.style === 'C') { ax = lerp(-1.0, -1.75, e); er = lerp(-0.8, -0.05, e); }
      m.armR.rotation.x = lerp(m.armR.rotation.x, ax, w);
      m.armR.rotation.y = lerp(m.armR.rotation.y, ay, w);
      m.elbowR.rotation.x = lerp(m.elbowR.rotation.x, er, w);
      m.hand.rotation.x = lerp(m.hand.rotation.x, hx, w);
      this._swingTwist = tw * w;
      if (sa.style === 'O' || sa.style === 'T') m.body.rotation.x += 0.1 * e * w;
    }

    // spine counter-twists with the stride (not while aiming), head follows the aim,
    // breathing, and the headwrap tails stream back with speed
    const now = performance.now();
    m.torso.rotation.y = damp(m.torso.rotation.y, sw * 0.14 * swAmt * (1 - r) + this._swingTwist, 18, dt);
    m.torso.scale.y = 1 + Math.sin(now * 0.0018) * 0.012;
    m.head.rotation.x = damp(m.head.rotation.x, -clamp(this.camPitch, -0.5, 0.5) * 0.55 * r + Math.sin(this.walkPhase * 2) * 0.03 * swAmt, 10, dt);
    m.head.rotation.y = damp(m.head.rotation.y, -m.torso.rotation.y * 0.8, 10, dt);
    m.tails.rotation.x = damp(m.tails.rotation.x, 0.25 + horiz * 0.09 + Math.sin(now * 0.009) * 0.08 * (0.3 + swAmt), 6, dt);
    m.tails.rotation.z = Math.sin(now * 0.006) * 0.12;

    // cloak: hangs and sways at rest, streams back with speed, lifts in the air
    const ck = m.cloak;
    if (ck) {
      const pa = ck.geometry.attributes.position, base = ck.userData.base;
      const flow = clamp(horiz / 8, 0, 1), lift = flow * 0.5 + (this.grounded ? 0 : 0.3), ts = now * 0.001;
      for (let i = 0; i < pa.count; i++) {
        const x = base[i * 3], y = base[i * 3 + 1], v = -y / 1.05;
        const sway = Math.sin(ts * 2.2 + v * 2.5 + x * 3) * 0.04 * (0.4 + flow);
        pa.setXYZ(i, x * (1 + v * 0.25), y * (1 - lift * 0.35 * v), -(v * v * (0.12 + lift) + sway));
      }
      pa.needsUpdate = true;
      ck.geometry.computeVertexNormals();
    }

    // idle bob / breathing
    const bob = Math.sin(this.walkPhase * 2) * 0.045 * swAmt + Math.sin(performance.now() * 0.0018) * 0.012;
    m.body.position.y = damp(m.body.position.y, bob - 0.085, 16, dt);  // 0.085 = sole height, so feet touch

    this.updateCamera(dt);
  }

  updateCamera(dt) {
    const aiming = this.aim;
    const targetDist = aiming ? 2.35 : 4.35;
    const targetHeight = (aiming ? 1.66 : 1.78) - (this.landDip || 0);
    const shoulder = aiming ? 0.60 : 0.86;

    if (this.camDist === undefined) this.camDist = targetDist;
    this.camDist = damp(this.camDist, targetDist, 9, dt);
    this.camShoulder = damp(this.camShoulder || shoulder, shoulder, 9, dt);
    this.camHeight = damp(this.camHeight || targetHeight, targetHeight, 9, dt);

    const cy = this.camYaw + this.recoilYaw;
    const cp = this.camPitch + this.recoilPitch;

    // the camera follows with a little weight: quick sideways, softer up and down
    if (!this._follow) this._follow = this.pos.clone();
    const f = this._follow;
    f.x = damp(f.x, this.pos.x, 18, dt); f.z = damp(f.z, this.pos.z, 18, dt); f.y = damp(f.y, this.pos.y, 9, dt);
    if (f.distanceToSquared(this.pos) > 16) f.copy(this.pos);      // teleports (spawn, respawn) snap
    const pivot = this._camTarget.set(
      f.x, f.y + this.camHeight, f.z
    );

    // camera direction
    const dirX = Math.sin(cy) * Math.cos(cp);
    const dirY = Math.sin(cp);
    const dirZ = Math.cos(cy) * Math.cos(cp);

    // right vector for the shoulder offset: camera over the right shoulder
    const rx = -Math.cos(cy), rz = Math.sin(cy);

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
