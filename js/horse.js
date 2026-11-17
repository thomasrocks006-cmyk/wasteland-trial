/* The horse (b37). Model: Quaternius "Ultimate Animated Animals" (CC0), meshopt removed offline
   (scratch/assetpipe/decomp.mjs). Its 8-swatch palette is replaced in the shader by a bay coat: hair
   streaks along the body, dappled shading, and the black points (lower legs, mane, tail) a bay has.

   Riding is built on how a horse actually moves, not a car:
   - four gaits with their real speeds: walk 1.8, trot 4.2, canter 7.5, gallop 13 m/s. Push the stick for
     walk/trot/canter; hold it full (or SPUR) and it opens into the gallop, which tires the horse.
   - momentum: about 3 m/s² to speed up, 4.5 to ease off, 8 when you haul back; a galloping horse does
     not stop or turn on the spot. The turn rate is the sideways grip over speed (≈6.5 m/s² / v), so the
     turning circle widens the faster you go.
   - it reads the ground: front and hind hooves sample the terrain, the body pitches with the slope,
     banks into turns, slows going uphill and refuses a slope too steep; water drags at it.
   - two collision circles (chest and quarters); running into something hard at speed stops it dead.
   - a galloping horse tramples men; JUMP clears low obstacles.
   - riderless it grazes; whistled, it comes at a canter and stops beside you. */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { clamp, damp, lerp, angleTo, rnd, terrainHeight, terrainNormal, waterLevel } from './core.js';

export async function loadHorseAsset(url = 'assets/horse.glb') { return new GLTFLoader().loadAsync(url); }

export const GAITS = { walk: 1.8, trot: 4.2, canter: 7.5, gallop: 13 };
const SCALE = 0.42;          // 1.6 m at the withers
const ACC = 3.6, DEC = 4.5, BRAKE = 8, GRIP = 6.5;
const SEAT_UP = 0.8;                        // model units above the mid-back bone (y 2.75) to the top of the saddle (the back is at 3.42 there)
const _v = new THREE.Vector3(), _n = new THREE.Vector3(), _q = new THREE.Quaternion();

/* Each of the model's eight palette parts gets its own material (by which swatch its UVs sit on). The body is
   painted in the shader from its bind-pose position: local y runs -0.82 (hoof) to 0.85 (ears), z -0.90 (tail) to
   0.97 (nose). */
const SHADE_NOISE = `varying vec3 vBind;
float hh(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
float vn(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hh(i), hh(i + vec3(1,0,0)), f.x), mix(hh(i + vec3(0,1,0)), hh(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hh(i + vec3(0,0,1)), hh(i + vec3(1,0,1)), f.x), mix(hh(i + vec3(0,1,1)), hh(i + vec3(1,1,1)), f.x), f.y), f.z); }`;
const lin = (hex) => { const c = new THREE.Color(hex); return `vec3(${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)})`; };
function partMaterial(idx) {
  const kind = idx === 0 || idx === 1 || idx === 2 ? 'coat' : idx === 4 ? 'hair' : idx === 3 ? 'hoof' : idx === 5 ? 'nose' : idx === 6 ? 'eyeW' : 'eyeB';
  const base = { coat: 0x6b3518, hair: 0x14100d, hoof: 0x2a2520, nose: 0x1c1513, eyeW: 0x2a1a12, eyeB: 0x050403 }[kind];
  const m = new THREE.MeshStandardMaterial({ color: base, roughness: kind === 'eyeB' || kind === 'eyeW' ? 0.15 : kind === 'hoof' ? 0.5 : kind === 'hair' ? 0.75 : 0.58, metalness: 0 });
  if (kind !== 'coat' && kind !== 'hair') return m;
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vBind;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvBind = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + SHADE_NOISE).replace('#include <color_fragment>', `#include <color_fragment>
{
  vec3 p = vBind;
${kind === 'coat' ? `
  // a bay: red-brown, a shade lighter on the barrel and flank, darker along the top line and the face
  vec3 c = mix(${lin(0x46200e)}, ${lin(0x6c381a)}, smoothstep(-0.15, 0.25, p.y) * (1.0 - smoothstep(0.32, 0.5, p.y)));
  c = mix(c, ${lin(0x3a1a0c)}, smoothstep(0.62, 0.9, p.z) * 0.6);
  // hair lies nose to tail: streaks long in z, fine across; a few dapples
  float streak = vn(p * vec3(140.0, 140.0, 9.0)) * 0.6 + vn(p * vec3(320.0, 320.0, 22.0)) * 0.4;
  c *= 0.84 + 0.3 * streak + 0.14 * (vn(p * 9.0) - 0.5);
  // the points: black from the knee down (and a dark muzzle)
  float leg = 1.0 - smoothstep(-0.44, -0.3, p.y);
  c = mix(c, ${lin(0x0d0a09)}, leg * 0.94);
  diffuseColor.rgb = c;` : `
  // mane and tail: long strands, a dull sheen
  diffuseColor.rgb *= 0.7 + 0.6 * vn(p * vec3(260.0, 18.0, 260.0));`}
}`);
  };
  m.customProgramCacheKey = () => 'horse-' + kind;
  return m;
}

export class Horse {
  constructor(scene, gltf, world, ctx = {}) {
    this.scene = scene; this.world = world; this.ctx = ctx;
    this.root = new THREE.Group(); scene.add(this.root);
    const m = gltf.scene; m.scale.setScalar(SCALE); this.root.add(m); this.model = m;
    m.traverse((o) => {
      if (!o.isMesh) return;
      const uv = o.geometry.attributes.uv, idx = uv ? Math.min(7, Math.floor(uv.getX(0) * 8)) : 0;
      o.material = partMaterial(idx); o.castShadow = idx === 0 || idx === 4;      // the small parts add a shadow pass each for nothing o.frustumCulled = false;
      // the model is flat-shaded: weld it and let the normals run smooth over the body
      if (idx === 0 || idx === 4) { const g = o.geometry; g.deleteAttribute('normal'); const w = mergeVertices(g, 1e-4); w.computeVertexNormals(); o.geometry = w; }
    });
    this.bones = {}; m.traverse((o) => { if (o.isBone) this.bones[o.name] = o; });
    this.mixer = new THREE.AnimationMixer(m);
    this.A = {}; for (const c of gltf.animations) { const a = this.mixer.clipAction(c); a.play(); a.setEffectiveWeight(0); this.A[c.name] = a; }
    for (const k of ['Death', 'Gallop_Jump', 'Idle_HitReact1', 'Jump_toIdle', 'Attack_Kick']) if (this.A[k]) { this.A[k].setLoop(THREE.LoopOnce, 1); this.A[k].clampWhenFinished = true; this.A[k].stop(); }
    this.w = { Idle: 1, Walk: 0, Gallop: 0, Eating: 0 };
    this.tack();
    this.pos = new THREE.Vector3(); this.yaw = 0; this.speed = 0; this.vy = 0; this.y = 0;
    this.pitch = 0; this.bank = 0; this.yawRate = 0; this.stam = 100; this.gait = 'idle'; this.rider = null;
    this.mode = 'graze'; this.oneShot = null; this.grazeT = rnd(4, 9); this.spurT = 0; this.stepT = 0;
  }

  /** saddle, saddle-cloth and reins, parented to the back so they ride every stride */
  tack() {
    const back = this.bones.Torso2 || this.bones.Torso;
    const leather = new THREE.MeshStandardMaterial({ color: 0x3b2414, roughness: 0.55 });
    const cloth = new THREE.MeshStandardMaterial({ color: 0x5a1e1a, roughness: 0.9 });
    const iron = new THREE.MeshStandardMaterial({ color: 0x8a8a86, roughness: 0.35, metalness: 0.8 });
    const g = new THREE.Group(); back.add(g); this.tackG = g;
    // undo the bone's own turn and scale, so offsets here are model axes (y up, z to the nose) in model units
    this.model.updateMatrixWorld(true);
    const bq = back.getWorldQuaternion(new THREE.Quaternion()), bs = back.getWorldScale(new THREE.Vector3());
    g.quaternion.copy(bq).invert(); g.scale.setScalar(SCALE / bs.x);
    const inv = 1;
    const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.62 * inv, 0.62 * inv, 1.25 * inv, 16, 1, false, -Math.PI * 0.42, Math.PI * 0.84), leather);
    seat.rotation.z = Math.PI / 2; seat.rotation.y = Math.PI / 2; seat.scale.set(1, 1, 0.55); seat.position.set(0, SEAT_UP - 0.62 * 0.55 * 0.2, 0);
    const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), leather); pommel.position.set(0, SEAT_UP + 0.12, 0.55); pommel.scale.set(1.2, 1, 0.8);
    const cantle = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), leather); cantle.position.set(0, SEAT_UP + 0.1, -0.55); cantle.scale.set(1.6, 0.8, 0.5);
    const blanket = new THREE.Mesh(new THREE.CylinderGeometry(0.66, 0.66, 1.7, 18, 1, true, -Math.PI * 0.48, Math.PI * 0.96), cloth);
    blanket.rotation.z = Math.PI / 2; blanket.rotation.y = Math.PI / 2; blanket.position.set(0, SEAT_UP - 0.42, -0.05); blanket.material.side = THREE.DoubleSide;
    g.add(seat, pommel, cantle, blanket);
    for (const s of [-1, 1]) {      // stirrup leathers and irons
      const strap = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.05, 0.12), leather); strap.position.set(s * 0.78, SEAT_UP - 0.68, 0.05); strap.scale.y = 1.25;
      const ir = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.025, 6, 12), iron); ir.position.set(s * 0.8, SEAT_UP - 1.38, 0.05); ir.rotation.y = Math.PI / 2;
      g.add(strap, ir);
    }
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    // the bit rings at the corners of the mouth, found in model space at the bind pose and carried by the head bone
    const head = this.bones.Head;
    if (head) { this.bitL = head.worldToLocal(this.model.localToWorld(new THREE.Vector3(0.2, 3.85, 2.95))); this.bitR = head.worldToLocal(this.model.localToWorld(new THREE.Vector3(-0.2, 3.85, 2.95))); }
    // reins: a line from the bit to the rider's hands, redrawn every frame
    const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(8 * 3), 3));
    this.reins = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0x2a1a0e })); this.reins.frustumCulled = false; this.reins.visible = false;
    this.scene.add(this.reins);
  }

  place(x, z, yaw = 0) { this.pos.set(x, terrainHeight(x, z), z); this.yaw = yaw; this.speed = 0; this.y = this.pos.y; this.root.position.copy(this.pos); this.root.rotation.y = yaw; }

  /** the top of the saddle, in world space */
  seat(out = new THREE.Vector3()) { this.tackG.updateWorldMatrix(true, false); return this.tackG.localToWorld(out.set(0, SEAT_UP, -0.08)); }
  /** where each stirrup iron hangs */
  stirrup(side, out = new THREE.Vector3()) { this.tackG.updateWorldMatrix(true, false); return this.tackG.localToWorld(out.set(side * 0.8, SEAT_UP - 1.36, 0.1)); }
  /** a point just behind the pommel, where the hands hold the reins */
  reinHold(side, out = new THREE.Vector3()) { this.tackG.updateWorldMatrix(true, false); return this.tackG.localToWorld(out.set(side * 0.24, SEAT_UP + 0.55, 0.85)); }
  get forward() { return _v.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }

  /** a one-shot clip over the gait (jump, hit, rear) */
  playOnce(name, speed = 1) { const a = this.A[name]; if (!a) return; a.reset(); a.timeScale = speed; a.play(); this.oneShot = { name, t: 0, dur: a.getClip().duration / speed }; }

  /**
   * ride: { want: unit vector in world (where the stick points, camera-relative), mag 0..1, spur, brake, jump }
   * Riderless, pass null and the horse grazes or answers a whistle.
   */
  update(dt, ride, time) {
    let wantSpeed = 0, wantYaw = this.yaw;
    if (ride) {
      const mag = ride.mag;
      if (mag > 0.08) wantYaw = Math.atan2(ride.want.x, ride.want.z);
      // the stick sets the gait; full tilt held (or a spur) opens it out into the gallop
      this.fullT = mag > 0.93 ? (this.fullT || 0) + dt : 0;
      if (ride.spur) this.spurT = 2.5;
      this.spurT = Math.max(0, this.spurT - dt);
      const galloping = (this.fullT > 0.9 || this.spurT > 0) && this.stam > 4;
      wantSpeed = mag < 0.08 ? 0 : mag < 0.45 ? GAITS.walk : mag < 0.8 ? GAITS.trot : galloping ? GAITS.gallop : GAITS.canter;
      // asking it to turn hard back on itself is a halt first, as a rider would sit back and pull
      if (mag > 0.08 && Math.abs(angleTo(this.yaw, wantYaw)) > 2.4 && this.speed > 3) { wantSpeed = 0; this.braking = true; } else this.braking = false;
      if (ride.jump && this.speed > 3.5 && this.onGround && !this.oneShot) this.jump();
    } else if (this.mode === 'come' && this.callTo) {
      const dx = this.callTo.x - this.pos.x, dz = this.callTo.z - this.pos.z, d = Math.hypot(dx, dz);
      wantYaw = Math.atan2(dx, dz); wantSpeed = d > 20 ? GAITS.canter : d > 6 ? GAITS.trot : d > 2.6 ? GAITS.walk : 0;
      // feel round what is in the way: look a few strides ahead and bear off to the clearer side
      this.avoidT = Math.max(0, (this.avoidT || 0) - dt);
      if (this.avoidT <= 0 && d > 3) {
        const look = Math.min(6, d), probe = (a) => { const x = this.pos.x + Math.sin(a) * look, z = this.pos.z + Math.cos(a) * look; const [rx, rz] = this.world.resolveCollisions(x, z, 0.9); return Math.hypot(rx - x, rz - z); };
        if (probe(wantYaw) > 0.05) { const l = probe(wantYaw + 0.8), r = probe(wantYaw - 0.8); this.avoid = l <= r ? 1 : -1; this.avoidT = 0.9; } else this.avoid = 0;
      }
      if (this.avoidT > 0) wantYaw += (this.avoid || 0) * 0.8;
      if (d < 2.6) { this.mode = 'graze'; this.grazeT = rnd(5, 10); }
      this.callT = (this.callT || 0) + dt; if (this.callT > 40) this.mode = 'graze';
    } else {
      // grazing: head down a while, then a few steps on
      this.grazeT -= dt;
      if (this.grazeT <= 0) { this.mode = this.mode === 'graze' ? 'amble' : 'graze'; this.grazeT = this.mode === 'amble' ? rnd(2, 4) : rnd(6, 12); this.ambleYaw = this.yaw + rnd(-1.2, 1.2); }
      if (this.mode === 'amble') { wantYaw = this.ambleYaw; wantSpeed = GAITS.walk * 0.7; }
    }

    // ---- the ground: slope and water
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw), half = 0.95;
    const hF = terrainHeight(this.pos.x + fx * half, this.pos.z + fz * half), hB = terrainHeight(this.pos.x - fx * half, this.pos.z - fz * half);
    const slope = (hF - hB) / (half * 2);                        // rise over run along the body
    if (slope > 0.12) wantSpeed *= clamp(1 - (slope - 0.12) * 2.2, 0.25, 1);
    if (slope > 0.62) wantSpeed = Math.min(wantSpeed, 0.8);      // too steep: it will not climb it
    const wl = waterLevel(this.pos.x, this.pos.z), depth = wl > this.pos.y ? wl - this.pos.y : 0;
    if (depth > 0.15) wantSpeed = Math.min(wantSpeed, depth > 0.7 ? GAITS.walk : GAITS.trot);

    // ---- momentum
    const rate = wantSpeed > this.speed ? ACC * (this.speed < 6 ? 1.3 : 1) : this.braking || (ride && ride.mag < 0.08 && this.speed > 6) ? BRAKE : DEC;
    this.speed = this.speed + clamp(wantSpeed - this.speed, -rate * dt, rate * dt);
    // the turn: limited by grip over speed (on the spot it can pivot quickly)
    const maxRate = Math.min(2.4, GRIP / Math.max(this.speed, 1.2));
    const turn = clamp(angleTo(this.yaw, wantYaw) * 3, -maxRate, maxRate);
    this.yawRate = damp(this.yawRate, (ride || this.mode !== 'graze') && (wantSpeed > 0 || this.speed > 0.2 || Math.abs(angleTo(this.yaw, wantYaw)) > 0.3) ? turn : 0, 6, dt);
    this.yaw += this.yawRate * dt;
    // the gallop costs breath; anything slower gives it back
    if (this.speed > 10) this.stam = Math.max(0, this.stam - dt * 9); else this.stam = Math.min(100, this.stam + dt * (this.speed < 5 ? 12 : 4));

    // ---- move, with collision at the chest and the quarters
    const vx = Math.sin(this.yaw) * this.speed, vz = Math.cos(this.yaw) * this.speed;
    let nx = this.pos.x + vx * dt, nz = this.pos.z + vz * dt;
    const footY = this.pos.y + (this.vy > 0 || !this.onGround ? 1.0 : 0);
    let cx = nx + Math.sin(this.yaw) * 0.85, cz = nz + Math.cos(this.yaw) * 0.85;
    const [cx2, cz2] = this.world.resolveCollisions(cx, cz, 0.5, footY, 0.6);
    nx += cx2 - cx; nz += cz2 - cz;
    let bx = nx - Math.sin(this.yaw) * 0.8, bz = nz - Math.cos(this.yaw) * 0.8;
    const [bx2, bz2] = this.world.resolveCollisions(bx, bz, 0.5, footY, 0.6);
    nx += bx2 - bx; nz += bz2 - bz;
    const blocked = Math.hypot(cx2 - cx, cz2 - cz);
    if (blocked > 0.02 && this.speed > 7 && ride) this.crash();
    else if (blocked > 0.02) this.speed *= Math.exp(-dt * 6);
    this.pos.x = nx; this.pos.z = nz;
    // height: the hooves on the ground (or a ledge), a hop when jumping
    const g = Math.max(terrainHeight(nx, nz), this.world.supportAt(nx, nz, 0.5, this.pos.y, 0.6));
    this.vy -= 22 * dt; this.pos.y += this.vy * dt;
    if (this.pos.y <= g) { if (!this.onGround && this.vy < -3 && this.ctx.onLand) this.ctx.onLand(this, -this.vy); this.pos.y = g; this.vy = 0; this.onGround = true; }
    else this.onGround = this.pos.y - g < 0.05;

    // ---- body attitude: pitch with the ground, bank into a turn
    this.pitch = damp(this.pitch, -Math.atan(slope) * 0.9, 8, dt);
    this.bank = damp(this.bank, clamp(-this.yawRate * this.speed * 0.025, -0.22, 0.22), 5, dt);
    this.root.position.copy(this.pos);
    this.root.rotation.set(0, 0, 0); this.root.rotateY(this.yaw); this.root.rotateX(this.pitch); this.root.rotateZ(this.bank);

    this.animate(dt);
    // hoofbeats
    if (this.onGround && this.speed > 0.5) {
      this.stepT -= dt * (this.speed > 9 ? 4 / 0.6 : this.speed > 3 ? 2 / 0.6 * (this.speed / GAITS.canter) + 1.2 : 4 / 1.17 * (this.speed / GAITS.walk));
      if (this.stepT <= 0) { this.stepT = 1; if (this.ctx.onStep) this.ctx.onStep(this, this.speed, depth); }
    }
  }

  animate(dt) {
    const s = this.speed, A = this.A, w = this.w, ease = (k, v, r = 8) => { w[k] = damp(w[k] || 0, v, r, dt); };
    // walk below a trot; between trot and canter the gallop clip runs slowly (a canter); above, the full gallop
    const walkW = s < 0.25 ? 0 : clamp(1 - (s - 3.2) / 1.6, 0, 1), galW = clamp((s - 3.2) / 1.6, 0, 1), idleW = clamp(1 - s / 0.4, 0, 1);
    const grazing = !this.rider && this.mode === 'graze' && s < 0.3;
    ease('Idle', idleW * (grazing ? 0 : 1)); ease('Eating', idleW * (grazing ? 1 : 0), 3);
    ease('Walk', walkW * (1 - idleW)); ease('Gallop', galW * (1 - idleW));
    A.Walk.timeScale = clamp(s / 1.4, 0.6, 2.9);           // the trot is the walk cycle quickened (the clip set has no trot)
    A.Gallop.timeScale = clamp(s / 9.5, 0.7, 1.4);
    let os = 0;
    if (this.oneShot) { this.oneShot.t += dt; os = this.oneShot.t < this.oneShot.dur - 0.15 ? 1 : clamp((this.oneShot.dur - this.oneShot.t) / 0.15, 0, 1); if (this.oneShot.t >= this.oneShot.dur) { A[this.oneShot.name].stop(); this.oneShot = null; os = 0; } }
    let sum = 0;
    for (const k of ['Idle', 'Eating', 'Walk', 'Gallop']) { const v = (w[k] || 0) * (1 - os); A[k].setEffectiveWeight(v); sum += v; }
    if (this.oneShot) A[this.oneShot.name].setEffectiveWeight(os);
    if (sum + os < 0.999) A.Idle.setEffectiveWeight(A.Idle.getEffectiveWeight() + 1 - sum - os);
    this.mixer.update(dt);
    this.model.updateMatrixWorld(true);
  }

  jump() { this.vy = 5.2; this.onGround = false; this.playOnce('Gallop_Jump', 1.35); if (this.ctx.onJump) this.ctx.onJump(this); }
  crash() { const v = this.speed; this.speed = 0; this.playOnce('Idle_HitReact1', 1); if (this.ctx.onCrash) this.ctx.onCrash(this, v); }
  call(x, z) { if (this.rider) return; this.mode = 'come'; this.callTo = { x, z }; this.callT = 0; }

  /** the reins: from the bit to the rider's hands */
  drawReins(hl, hr) {
    const head = this.bones.Head; if (!head) return;
    head.updateWorldMatrix(true, false);
    const bitL = head.localToWorld(this.bitL.clone()), bitR = head.localToWorld(this.bitR.clone());
    const P = this.reins.geometry.attributes.position.array;
    const mid = (a, b) => a.clone().lerp(b, 0.5).add(_n.set(0, -0.12, 0));
    const mL = mid(bitL, hl), mR = mid(bitR, hr);
    [bitL, mL, mL, hl, bitR, mR, mR, hr].forEach((p, i) => { P[i * 3] = p.x; P[i * 3 + 1] = p.y; P[i * 3 + 2] = p.z; });
    this.reins.geometry.attributes.position.needsUpdate = true; this.reins.visible = true;
  }
}
