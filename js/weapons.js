import * as THREE from 'three';
import { clamp, lerp, rnd, TAU, Builder, deg, addRim, angleTo } from './core.js';

/* ============================================================ definitions
   A mythic arsenal: two blades up close, a spear and a fire rune at range.
   Melee weapons carry a combo; each step has its damage, length, the moment
   in the swing that it lands (hit), and a style the hero's arm plays out. */
export const WEAPONS = [
  {
    id: 'sword', name: 'SWORD', mod: 'SPIRIT BLADE',
    melee: {
      range: 2.7, arc: 2.1,
      combo: [
        { dmg: 32, dur: 0.34, hit: 0.1, style: 'R' },
        { dmg: 32, dur: 0.34, hit: 0.1, style: 'L' },
        { dmg: 68, dur: 0.52, hit: 0.2, style: 'O', finisher: true },
      ],
    },
    dmg: 32, pellets: 1, rpm: 600, spread: 0, spreadBloom: 0, bloomMax: 0,
    recoilPitch: 0, recoilYaw: 0, shake: 0.1, kickVis: 0, push: 0,
    mag: 1, reserve: Infinity, reload: 0.1, range: 3,
    tracer: 0x9ff4ff, flash: 0x9ff4ff, flashSize: 0, sound: 'sword',
    color: 0x7ff3ff, desc: 'Three strikes; the third is a heavy overhead.'
  },
  {
    id: 'axe', name: 'AXE', mod: 'WAR AXE',
    melee: {
      range: 3.1, arc: 2.7,
      combo: [{ dmg: 90, dur: 0.78, hit: 0.34, style: 'O', finisher: true, slam: true }],
    },
    dmg: 90, pellets: 1, rpm: 600, spread: 0, spreadBloom: 0, bloomMax: 0,
    recoilPitch: 0, recoilYaw: 0, shake: 0.5, kickVis: 0, push: 0,
    mag: 1, reserve: Infinity, reload: 0.1, range: 3.2,
    tracer: 0xffb347, flash: 0xffb347, flashSize: 0, sound: 'axe',
    color: 0xffb347, desc: 'One slow, wide chop that breaks a pack.'
  },
  {
    id: 'spear', name: 'SPEAR', mod: 'THROWN',
    dmg: 95, pellets: 1, rpm: 75, spread: 0.15, spreadBloom: 0.4, bloomMax: 2,
    recoilPitch: 1.2, recoilYaw: 0.3, shake: 0.25, kickVis: 0.1, push: 0,
    mag: 5, reserve: 30, reload: 1.5, range: 150, pierce: 3, anim: 'T',
    tracer: 0xffd27a, flash: 0xffe0a0, flashSize: 0.5, sound: 'spear',
    color: 0xffd27a, desc: 'Thrown hard and straight; passes through three.'
  },
  {
    id: 'rune', name: 'FIRE RUNE', mod: 'SPELL',
    dmg: 130, pellets: 1, rpm: 52, spread: 0.5, spreadBloom: 0.6, bloomMax: 3,
    recoilPitch: 1.6, recoilYaw: 0.4, shake: 0.3, kickVis: 0.1, push: 1.5,
    mag: 4, reserve: 20, reload: 2.0, range: 90, anim: 'C',
    explosive: { radius: 4.8, falloff: 0.45, speed: 34, gravity: 5, bounce: false },
    tracer: 0xff9a40, flash: 0xffb060, flashSize: 1.4, sound: 'rune',
    color: 0xff8a3c, desc: 'An arcing flame that bursts on contact.'
  },
];

/* ============================================================ weapon models
   Local axes: -y runs along the forearm (blade or shaft forward), +z is up when
   the arm is raised, the grip sits at the origin in the hand. Lit body plus
   glowing accents in the weapon's colour. */
export function buildGunModel(id) {
  const b = new Builder(), gl = new Builder();
  const muzzle = new THREE.Object3D();
  const group = new THREE.Group();
  const STEEL = 0xc9d2d8, STEELD = 0x7f8a92, BRONZE = 0xb08a40, LEATHER = 0x3a2a1c, WOOD = 0x5a4330;
  const C = WEAPONS.find((w) => w.id === id).color;
  const cyl = (r0, r1, l, seg = 10) => new THREE.CylinderGeometry(r0, r1, l, seg);
  const box = (x, y, z) => new THREE.BoxGeometry(x, y, z);

  if (id === 'sword') {
    b.add(cyl(0.022, 0.024, 0.18), LEATHER, { pos: [0, 0, 0] });                              // grip
    b.add(new THREE.SphereGeometry(0.036, 10, 8), BRONZE, { pos: [0, 0.11, 0] });               // pommel
    b.add(box(0.24, 0.035, 0.045), BRONZE, { pos: [0, -0.1, 0] });                              // crossguard
    for (const sx of [-1, 1]) b.add(new THREE.SphereGeometry(0.022, 8, 6), BRONZE, { pos: [sx * 0.125, -0.1, 0] });
    b.add(box(0.058, 0.84, 0.012), STEEL, { pos: [0, -0.54, 0] });                              // blade
    b.add(box(0.06, 0.84, 0.006), STEELD, { pos: [0, -0.54, 0.0] });                            // bevel shade
    b.add(new THREE.ConeGeometry(0.041, 0.13, 4), STEEL, { pos: [0, -1.02, 0], rot: [Math.PI, Math.PI / 4, 0], scale: [1, 1, 0.3] });
    gl.add(box(0.012, 0.72, 0.016), C, { pos: [0, -0.52, 0] });                                 // fuller glow
    muzzle.position.set(0, -1.08, 0);
  } else if (id === 'axe') {
    b.add(cyl(0.024, 0.028, 1.02), WOOD, { pos: [0, -0.34, 0] });                              // haft
    b.add(new THREE.TorusGeometry(0.03, 0.01, 5, 10), LEATHER, { pos: [0, 0.03, 0], rot: [Math.PI / 2, 0, 0] });
    b.add(new THREE.TorusGeometry(0.03, 0.01, 5, 10), LEATHER, { pos: [0, -0.06, 0], rot: [Math.PI / 2, 0, 0] });
    b.add(box(0.06, 0.13, 0.08), STEELD, { pos: [0, -0.8, 0] });                                // socket
    b.add(box(0.026, 0.3, 0.24), STEEL, { pos: [0, -0.8, -0.14] });                             // bearded blade
    b.add(box(0.03, 0.12, 0.08), STEEL, { pos: [0, -0.68, -0.22], rot: [0.5, 0, 0] });          // beard
    b.add(new THREE.ConeGeometry(0.035, 0.14, 4), STEELD, { pos: [0, -0.8, 0.1], rot: [Math.PI / 2, 0, 0] }); // back spike
    gl.add(box(0.03, 0.2, 0.02), C, { pos: [0, -0.8, -0.2] });                                 // rune on the blade
    muzzle.position.set(0, -0.8, -0.26);
  } else if (id === 'spear') {
    b.add(cyl(0.02, 0.022, 1.95, 8), WOOD, { pos: [0, -0.5, 0] });                        // shaft
    b.add(new THREE.TorusGeometry(0.026, 0.009, 5, 10), BRONZE, { pos: [0, -1.44, 0], rot: [Math.PI / 2, 0, 0] });
    b.add(new THREE.OctahedronGeometry(0.12, 0), STEEL, { pos: [0, -1.62, 0], scale: [0.5, 1.7, 0.16] });  // leaf blade
    b.add(new THREE.SphereGeometry(0.03, 8, 6), BRONZE, { pos: [0, 0.48, 0] });                  // butt cap
    gl.add(box(0.01, 0.26, 0.022), C, { pos: [0, -1.62, 0] });
    muzzle.position.set(0, -1.8, 0);
  } else {
    b.add(cyl(0.021, 0.026, 1.3), 0x3f2e20, { pos: [0, -0.32, 0] });                          // staff
    for (const y of [0.15, -0.5, -0.86]) b.add(new THREE.TorusGeometry(0.03, 0.008, 5, 10), BRONZE, { pos: [0, y, 0], rot: [Math.PI / 2, 0, 0] });
    b.add(new THREE.TorusGeometry(0.085, 0.012, 6, 16), BRONZE, { pos: [0, -1.04, 0] });       // crystal cradle
    gl.add(new THREE.OctahedronGeometry(0.07, 0), C, { pos: [0, -1.04, 0], scale: [0.8, 1.3, 0.8] });
    muzzle.position.set(0, -1.1, 0);
  }

  const mesh = new THREE.Mesh(b.build(), addRim(new THREE.MeshLambertMaterial({ vertexColors: true }), 0xffe2b8, 0.3, 3.0));
  mesh.castShadow = true;
  const glow = new THREE.Mesh(gl.build(), new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }));
  group.add(mesh, glow, muzzle);
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
    // run upgrades (perks) scale these; reset at the start of every run
    this.mods = { dmg: 1, reload: 1, mag: 1, spread: 1, blast: 1, pierce: 0, reach: 1 };
    // melee state
    this.swingT = 0; this.swingCur = null; this.swingDone = true; this.comboIdx = 0; this.lastSwingEnd = 0;
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
    return (this.def.spread + Math.min(this.def.bloomMax, this.bloom)) * this.mods.spread;
  }
  magSize(i = this.index) { return Math.max(1, Math.round(WEAPONS[i].mag * this.mods.mag)); }
  get reloadTime() { return this.def.reload * this.mods.reload; }

  syncModel() {
    this.models.forEach((m, i) => { m.visible = i === this.index && this.visible; });
    const d = this.def;
    // the hero holds a blade, a two-handed spear or a one-handed staff differently
    this.player.weaponKind = d.melee ? 'melee' : d.explosive ? 'spell' : 'thrown';
  }

  setVisible(v) { this.visible = v; this.syncModel(); }

  switchTo(i, instant = false) {
    if (i === this.index || i < 0 || i >= WEAPONS.length) return;
    this.index = i;
    this.swingT = 0; this.swingDone = true; this.comboIdx = 0;
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

  /** an ammo crate: every limited weapon gets 40% of its starting reserve (capped at 2x) */
  refill() {
    let gained = 0;
    WEAPONS.forEach((w, i) => {
      const s = this.state[i];
      if (s.reserve === Infinity) return;
      const before = s.reserve;
      s.reserve = Math.min(w.reserve * 2, s.reserve + Math.ceil(w.reserve * 0.4));
      gained += s.reserve - before;
    });
    if (this.ammo.mag === 0) this.tryReload();
    if (this.ctx.onAmmo) this.ctx.onAmmo();
    return gained;
  }

  tryReload() {
    const s = this.ammo;
    const d = this.def;
    if (this.reloading || s.mag >= this.magSize()) return false;
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
    if (d.melee) return this.swing();
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
    this.cooldown = 60 / (d.rpm * (this.player.fireRateMul || 1));

    // where the player is actually pointing
    camera.getWorldDirection(this._dir);
    const camPos = camera.position;

    // aim-assist: bend toward the closest enemy inside a narrow cone (touch forgiveness)
    // shots start at the camera, so ignore anything between the camera and the hero
    const pp = this.player.pos;
    const minT = Math.max(0, (pp.x - camPos.x) * this._dir.x + (pp.y + 1.2 - camPos.y) * this._dir.y + (pp.z - camPos.z) * this._dir.z - 0.6);
    const assist = this.player.aim ? 1.2 : 3.2;
    let best = null, bestDot = Math.cos(deg(assist));
    const enemies = this.ctx.enemies() || [];
    for (const e of enemies) {
      if (!e.alive) continue;
      // e.height was never set, so assist used to aim at the feet
      this._tmp.set(e.pos.x, e.pos.y + e.type.height * 0.6, e.pos.z).sub(camPos);
      const dist = this._tmp.length();
      if (dist > d.range) continue;
      this._tmp.divideScalar(dist);
      const dot = this._tmp.dot(this._dir);
      if (dot <= bestDot) continue;
      if (this.ctx.wallDist(camPos, this._tmp, dist, minT) < dist - 0.5) continue; // no locking through walls
      bestDot = dot; best = this._tmp.clone();
    }
    const baseDir = best || this._dir.clone();

    this._muzzlePos.setFromMatrixPosition(this.models[this.index].userData.muzzle.matrixWorld);

    const spreadRad = deg(this.spreadDeg);
    let anyHit = false, anyHead = false;
    const dmg = d.dmg * this.mods.dmg * (this.player.dmgMul || 1);
    const pierce = (d.pierce || 1) + (d.pierce ? this.mods.pierce : 0);

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
        const ex = { ...d.explosive, radius: d.explosive.radius * this.mods.blast };
        this.ctx.spawnProjectile(this._muzzlePos.clone(), dir.multiplyScalar(d.explosive.speed), ex, dmg);
        continue;
      }

      // the first wall or hill along the shot ends it: cover is real
      const wall = this.ctx.wallDist(camPos, dir, d.range, minT);
      const hits = this.ctx.raycast(camPos.clone(), dir, Math.min(d.range, wall), pierce);
      if (hits.length) {
        anyHit = true;
        this.shotsHit++;
        const maxDist = hits[hits.length - 1].dist;
        const end = camPos.clone().addScaledVector(dir, maxDist);
        this.fx.tracer(this._muzzlePos, end, d.tracer, d.pierce ? 0.07 : 0.035, d.pierce ? 0.2 : 0.13);
        if (d.pierce) {
          this.fx.beam(this._muzzlePos, end, 0x7ae4ff, 0.11, 0.26);
        }
        for (const h of hits) {
          if (h.head) anyHead = true;
          this.ctx.applyDamage(h.enemy, dmg * (h.head ? 1.9 : 1), h.point, dir, h.head, d);
        }
        // impact at the last surface
        const last = hits[hits.length - 1];
        this.fx.spark(last.point, dir.clone().negate(), 0xffc070, 5, 6, 0.09, 0.3);
      } else {
        // hit the world (ground, wall or pillar) or nothing at all
        const hitWorld = wall < d.range;
        const p = camPos.clone().addScaledVector(dir, hitWorld ? wall : d.range);
        this.fx.tracer(this._muzzlePos, p, d.tracer, d.pierce ? 0.07 : 0.035, d.pierce ? 0.2 : 0.13);
        if (hitWorld) {
          this.fx.spark(p, dir.clone().negate(), 0xd8b080, 5, 4.5, 0.10, 0.35);
          this.fx.puff(p, null, 0xa07a52, 0.28, 1, 0.55, 0.7);
        }
      }
    }

    if (this.ctx.onShot) this.ctx.onShot(anyHit, anyHead);
    if (d.anim && this.player.startSwing) this.player.startSwing(d.anim, 0.36);

    // --- the feel: recoil, shake, bloom, model kick
    const steady = 0.5 + this.mods.spread * 0.5;
    this.player.addRecoil(d.recoilPitch * (this.player.aim ? 0.82 : 1) * steady, d.recoilYaw * rnd(-1, 1) * steady);
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

  /* ---------------- melee ---------------- */
  /** nearest living foe within range and in front of the camera's facing */
  meleeTarget(range, arc) {
    const p = this.player.pos, yaw = this.player.camYaw;
    let best = null, bd = Infinity;
    for (const e of (this.ctx.enemies() || [])) {
      if (!e.alive || e.state === 'spawn') continue;
      const dx = e.pos.x - p.x, dz = e.pos.z - p.z, d = Math.hypot(dx, dz);
      if (d > range + e.type.radius || d >= bd) continue;
      if (Math.abs(angleTo(yaw, Math.atan2(dx, dz))) > arc / 2) continue;
      best = e; bd = d;
    }
    return best;
  }

  swing() {
    const d = this.def, M = d.melee;
    if (this.cooldown > 0 || this.switchT < 0.98 || this.swingT > 0) return;
    if (performance.now() - this.lastSwingEnd > 550) this.comboIdx = 0;
    const c = M.combo[this.comboIdx % M.combo.length];
    this.comboIdx++;
    this.swingCur = c; this.swingT = c.dur; this.swingDone = false;
    this.cooldown = c.dur;
    this.shotsFired++;
    const pl = this.player;
    pl.faceLock = Math.max(pl.faceLock, c.dur + 0.3);
    if (pl.startSwing) pl.startSwing(c.style, c.dur);
    // step into the strike: toward the nearest foe in front, or a short lunge
    const yaw = pl.camYaw, t = this.meleeTarget(M.range * this.mods.reach + 2.2, M.arc + 0.6);
    if (t) {
      const dx = t.pos.x - pl.pos.x, dz = t.pos.z - pl.pos.z, dd = Math.hypot(dx, dz) || 1;
      const gap = dd - t.type.radius - 1.0;
      if (gap > 0) pl.knock.add(new THREE.Vector3(dx / dd, 0, dz / dd).multiplyScalar(Math.min(9, gap * 6)));
    } else pl.knock.add(new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)).multiplyScalar(2.5));
    this.audio.shot(d.sound, 0);
    if (this.onFired) this.onFired(d);
  }

  /** the blade crosses: everything in reach and in the arc is struck */
  strike() {
    const d = this.def, M = d.melee, c = this.swingCur, pl = this.player;
    const p = pl.pos, yaw = pl.camYaw;
    const reach = M.range * this.mods.reach, arc = M.arc * Math.min(1.5, this.mods.reach);
    const dmg = c.dmg * this.mods.dmg * (pl.dmgMul || 1);
    let hits = 0;
    for (const e of (this.ctx.enemies() || [])) {
      if (!e.alive) continue;
      // the long boss is struck wherever you reach it: head or any body segment
      let ex = e.pos.x, ez = e.pos.z, ey = e.pos.y;
      if (e.segs) for (const sg of e.segs) {
        if (Math.hypot(sg.x - p.x, sg.z - p.z) < Math.hypot(ex - p.x, ez - p.z)) { ex = sg.x; ez = sg.z; ey = sg.y; }
      }
      const dx = ex - p.x, dz = ez - p.z, dist = Math.hypot(dx, dz) || 0.01;
      const dy = ey - p.y;
      if (dist > reach + e.type.radius || dy > 3.4 || dy < -1.8) continue;
      if (Math.abs(angleTo(yaw, Math.atan2(dx, dz))) > arc / 2 && dist > e.type.radius + 0.9) continue;
      const dir = new THREE.Vector3(dx / dist, 0, dz / dist);
      const point = new THREE.Vector3(ex - dir.x * e.type.radius * 0.6, ey + e.type.height * 0.55, ez - dir.z * e.type.radius * 0.6);
      this.ctx.applyDamage(e, dmg, point, dir, !!c.finisher, d);
      hits++;
    }
    if (this.fx.slash) this.fx.slash(new THREE.Vector3(p.x, p.y + (c.style === 'O' ? 1.3 : 1.15), p.z), yaw, c.style, d.color, reach);
    if (c.slam) {
      const at = new THREE.Vector3(p.x + Math.sin(yaw) * 1.8, p.y + 0.1, p.z + Math.cos(yaw) * 1.8);
      this.fx.ring(at, d.color, 3.2, 0.4);
      this.fx.puff(at, null, 0x8a7d62, 0.8, 4, 0.7, 2.2);
      pl.shake = Math.min(2, pl.shake + 0.5);
    }
    if (hits) {
      this.shotsHit++;
      pl.shake = Math.min(2, pl.shake + 0.18 + (c.finisher ? 0.25 : 0));
      if (this.audio.clang) this.audio.clang(hits, !!c.finisher);
      if (this.ctx.onMeleeHit) this.ctx.onMeleeHit(hits, !!c.finisher);
    }
    if (this.ctx.onShot) this.ctx.onShot(hits > 0, false);
  }

  update(dt) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.swingT > 0) {
      this.swingT -= dt;
      const el = this.swingCur.dur - this.swingT;
      if (!this.swingDone && el >= this.swingCur.hit) { this.swingDone = true; this.strike(); }
      if (this.swingT <= 0) { this.swingT = 0; this.lastSwingEnd = performance.now(); }
    }
    this.switchT = Math.min(1, this.switchT + dt * 6);

    // bloom recovers when you stop shooting
    this.bloom = Math.max(0, this.bloom - (this.def.bloomMax * 1.4 + 1.2) * dt);

    // reload progression
    if (this.reloading) {
      const d = this.def;
      this.reloadT += dt;
      const k = this.reloadT / this.reloadTime;
      if (k > 0.35 && this.reloadStage === 0) { this.reloadStage = 1; this.audio.reload(1); }
      if (k > 0.8 && this.reloadStage === 1) { this.reloadStage = 2; this.audio.reload(2); }
      if (k >= 1) {
        const s = this.ammo;
        const need = this.magSize() - s.mag;
        if (s.reserve === Infinity) {
          s.mag = this.magSize();
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
      const k = this.kick * 0.055;
      m.position.set(0, k, -this.kick * 0.02);
      m.rotation.x = this.kickRot * 0.34;
      // reload dip
      const dip = this.reloading ? Math.sin(clamp(this.reloadT / this.reloadTime, 0, 1) * Math.PI) : 0;
      m.position.y -= dip * 0.16;
      m.rotation.z = dip * 0.7;
      // switch wobble
      const sw = (1 - this.switchT) * -0.5;
      m.position.y += sw * 0.2;
      m.rotation.z += sw;
    }
  }
}
