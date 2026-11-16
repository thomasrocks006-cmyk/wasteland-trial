import * as THREE from 'three';
import { clamp, angleTo } from './core.js';

/* ================================================================ sword and shield
   Melee for the hero rig (hero.js). The motion is a real captured strike; the rules around
   it are what make it feel like fighting:

   - A press starts the attack at once (no wait to see if it is a tap). The blade goes up into
     its wind-up; if you are still holding when it reaches the top it stops there and CHARGES.
     Let go early and it is a quick light cut; let go after charging and it is a heavy overhead.
   - The blow lands where the blade actually is: each frame of the strike the blade (and the path
     its tip travelled) is swept against what is in front of you. Close targets are never missed.
   - Contact has weight: a freeze, a shove, a stagger, a shake, a bright clang.
   - Attacks are commitments: you slow down while swinging, the next link comes on the
     next press once the blow has landed, and a dodge cuts the recovery short.
   - The shield is a weapon too: guard and press attack to bash (a stagger and a shove). A parry
     opens a riposte: the next blow within a second hits much harder. */

const SPECS = {
  sword: {
    light: [
      { from: 0.10, speed: 1.55, s0: 0.28, s1: 0.60, end: 0.96, dmg: 34, stam: 7, lunge: 3.4, stop: 0.06, shake: 0.22, stag: 0.2, kb: 4.2 },
      { from: 0.10, speed: 1.75, s0: 0.28, s1: 0.60, end: 0.92, dmg: 37, stam: 7, lunge: 3.4, stop: 0.06, shake: 0.22, stag: 0.2, kb: 4.2, twist: -0.55 },
      { from: 0.0, speed: 1.12, s0: 0.28, s1: 0.64, end: 1.22, dmg: 76, stam: 13, lunge: 5.2, stop: 0.12, shake: 0.55, stag: 0.55, kb: 8, finisher: true, slam: true, pitch: 0.2 },
    ],
    heavy: { chargeAt: 0.21, from: 0.21, speed: 1.2, s0: 0.28, s1: 0.64, end: 1.26, dmg: 118, stam: 26, lunge: 5.6, stop: 0.17, shake: 0.9, stag: 0.9, kb: 11, finisher: true, slam: true, heavy: true, pitch: 0.25 },
  },
  axe: {
    light: [{ from: 0.0, speed: 0.95, s0: 0.28, s1: 0.64, end: 1.28, dmg: 95, stam: 15, lunge: 4.2, stop: 0.12, shake: 0.6, stag: 0.6, kb: 8, finisher: true, slam: true, pitch: 0.15 }],
    heavy: { chargeAt: 0.21, from: 0.21, speed: 0.9, s0: 0.28, s1: 0.66, end: 1.32, dmg: 170, stam: 30, lunge: 5, stop: 0.2, shake: 1.1, stag: 1.1, kb: 13, finisher: true, slam: true, heavy: true, pitch: 0.3 },
  },
};

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _tip = new THREE.Vector3(), _base = new THREE.Vector3();

/** closest point on segment p0-p1 to c, written to out */
function closestOnSeg(p0, p1, c, out) {
  _d.copy(p1).sub(p0); const l2 = _d.lengthSq();
  const t = l2 < 1e-9 ? 0 : clamp(_c.copy(c).sub(p0).dot(_d) / l2, 0, 1);
  return out.copy(p0).addScaledVector(_d, t);
}

export class Melee {
  constructor(ws) {
    this.ws = ws;
    this.atk = null;
    this.combo = 0;
    this.lastEnd = -9; this.clock = 0;       // game-time, so a combo window is the same on a slow phone
    this.holdT = 0;
    this.bashCd = 0; this.bashT = 0;
    this.prevTip = new THREE.Vector3(); this.havePrev = false;
  }

  get pl() { return this.ws.player; }
  get hero() { return this.ws.player.hero; }
  get specs() { return SPECS[this.ws.def.id] || SPECS.sword; }
  get busy() { return !!this.atk; }
  /** 0..1 while holding at the top of the wind-up */
  get charge() { return this.atk && this.atk.charging ? clamp(this.holdT / 0.6, 0, 1) : 0; }

  /* ---------------- input */
  press() {
    const ws = this.ws, pl = this.pl;
    ws.idleT = 0;
    if (pl.guard) return this.shieldBash();
    if (!ws.drawn || ws.drawT > 0) { ws.draw(); return; }
    if (this.atk) { this.atk.buffered = true; return; }          // chains once the blow has landed
    this.holdT = 0;
    this.begin(this.nextLight(), true);
  }
  hold(dt) {
    this.holdT += dt;
    const a = this.atk;
    if (a && a.holdable && !a.released && !a.pausedOnce && this.hero.layerTime >= this.specs.heavy.chargeAt) {
      a.charging = true; a.pausedOnce = true; this.hero.holdLayer(true);        // the blade stays up: a visible charge
    }
  }
  release() {
    const a = this.atk;
    if (!a) return;
    a.released = true;
    if (a.charging) {
      a.charging = false; this.hero.holdLayer(false);
      if (this.holdT >= 0.6 && this.pl.spend(this.specs.heavy.stam - a.spec.stam)) { a.spec = this.specs.heavy; this.hero.A.Sword_Attack.timeScale = a.spec.speed; if (this.ws.audio.roar) this.ws.audio.roar(8); }
    }
  }
  nextLight(chain = false) {
    const L = this.specs.light;
    if (!chain && this.clock - this.lastEnd > 0.65) this.combo = 0;      // a chained link never resets; a fresh start after a pause does
    const s = L[this.combo % L.length];
    this.combo++;
    return s;
  }

  /* ---------------- an attack */
  begin(spec, holdable = false) {
    const pl = this.pl, ws = this.ws;
    if (!pl.spend(spec.stam)) { if (ws.onWinded) ws.onWinded(); return false; }
    this.atk = { spec, holdable: holdable && spec === this.specs.light[0], hit: new Set(), buffered: false, charging: false, released: !holdable, pausedOnce: false, started: false, assist: false };
    this.havePrev = false;
    this.hero.playOnce('Sword_Attack', { from: spec.from, speed: spec.speed });
    pl.moveMul = 0.35; pl.faceLock = Math.max(pl.faceLock, 0.9);
    // turn the body toward the nearest threat in front before the blow, so a nudge of the stick or camera is enough
    const t = this.target(4.2, 2.4);
    if (t) pl.faceOverride = { yaw: Math.atan2(t.pos.x - pl.pos.x, t.pos.z - pl.pos.z), t: 0.7 };
    ws.swingT = 0.2;
    return true;
  }
  cancel() {
    if (!this.atk) return;
    this.atk = null; this.hero.holdLayer(false); this.hero.stopLayer(); this.pl.moveMul = 1; this.ws.swingT = 0;
  }

  /** nearest living foe within range and in front of the hero's facing */
  target(range, arc) {
    const pl = this.pl; let best = null, bd = 1e9;
    for (const e of (this.ws.ctx.enemies() || [])) {
      if (!e.alive || e.state === 'spawn') continue;
      const dx = e.pos.x - pl.pos.x, dz = e.pos.z - pl.pos.z, d = Math.hypot(dx, dz);
      if (d > range + e.type.radius || d >= bd) continue;
      if (Math.abs(angleTo(pl.camYaw, Math.atan2(dx, dz))) > arc / 2) continue;
      best = e; bd = d;
    }
    return best;
  }

  update(dt) {
    this.clock += dt;
    this.bashCd = Math.max(0, this.bashCd - dt);
    if (this.bashT > 0) { this.bashT -= dt; if (this.bashT <= 0) this.bashHit(); }
    const a = this.atk, pl = this.pl, ws = this.ws;
    if (!a) { pl.moveMul = damp1(pl.moveMul, 1, dt); return; }
    const hero = this.hero, S = a.spec;
    hero.root.updateMatrixWorld(true);
    const t = hero.layerTime;
    ws.swingT = 0.2; ws.idleT = 0;
    // the movement penalty eases off through the recovery
    pl.moveMul = t < S.s1 ? 0.3 : clamp(0.3 + (t - S.s1) / (S.end - S.s1) * 0.7, 0.3, 1);
    if (!a.started && t >= S.s0 - 0.02) this.strikeStart(a);
    const active = t >= S.s0 && t <= S.s1;
    if (active) this.sweep(a, t);
    if (!a.assist && t >= (S.s0 + S.s1) * 0.5) { a.assist = true; this.assist(a); }
    // a buffered press chains the moment the blow is through
    if (t > S.s1 && a.buffered && !a.charging) { const next = this.nextLight(true); this.atk = null; this.begin(next, false); return; }
    if (t >= S.end || !hero.layer) this.finish();
  }
  finish() {
    this.atk = null; this.lastEnd = this.clock; this.pl.moveMul = 1; this.ws.swingT = 0;
    this.hero.stopLayer();
  }

  strikeStart(a) {
    a.started = true;
    const S = a.spec, pl = this.pl, ws = this.ws;
    if (ws.audio.shot) ws.audio.shot(ws.def.sound, 0);
    if (ws.onFired) ws.onFired(ws.def);
    // step into the blow
    const tgt = this.target(4.6, 2.6), yaw = pl.faceOverride ? pl.faceOverride.yaw : pl.camYaw;
    if (tgt) {
      const dx = tgt.pos.x - pl.pos.x, dz = tgt.pos.z - pl.pos.z, dd = Math.hypot(dx, dz) || 1, gap = dd - tgt.type.radius - 1.0;
      if (gap > 0) pl.knock.addScaledVector(_a.set(dx / dd, 0, dz / dd), Math.min(S.lunge * 2.4, gap * 7));
    } else pl.knock.addScaledVector(_a.set(Math.sin(yaw), 0, Math.cos(yaw)), S.lunge);
    ws.shotsFired++;
  }

  /** the blade this frame: base at the hand, tip at the weapon's point */
  blade() {
    const m = this.ws.models[this.ws.index];
    _base.setFromMatrixPosition(this.hero.hand.matrixWorld);
    _tip.setFromMatrixPosition(m.userData.muzzle.matrixWorld);
    return [_base, _tip];
  }

  sweep(a, t) {
    const [base, tip] = this.blade();
    if (this.ws.fx.trailSample) this.ws.fx.trailSample(tip, base, this.ws.def.color);
    const S = a.spec, pl = this.pl, ws = this.ws;
    let hits = 0;
    for (const e of (ws.ctx.enemies() || [])) {
      if (!e.alive || a.hit.has(e) || e.state === 'spawn') continue;
      const spheres = this.spheres(e);
      let hit = null;
      for (const sp of spheres) {
        const pad = sp.r + 0.14;
        closestOnSeg(base, tip, sp.c, _a);
        let d = _a.distanceTo(sp.c);
        if (d > pad && this.havePrev) { closestOnSeg(this.prevTip, tip, sp.c, _b); const d2 = _b.distanceTo(sp.c); if (d2 < d) { d = d2; _a.copy(_b); } }
        if (d <= pad) { hit = { sp, at: _a.clone() }; break; }
      }
      if (hit) { this.land(a, e, hit.at, hit.sp.head); hits++; }
    }
    this.prevTip.copy(tip); this.havePrev = true;
  }
  /** the body parts a blade can strike: legs, torso, head (and every segment of the long boss) */
  spheres(e) {
    const t = e.type, out = [];
    out.push({ c: new THREE.Vector3(e.pos.x, e.pos.y + t.height * 0.26, e.pos.z), r: t.radius * 1.02, head: false });
    out.push({ c: new THREE.Vector3(e.pos.x, e.pos.y + t.height * 0.6, e.pos.z), r: t.radius * 1.12, head: false });
    out.push({ c: new THREE.Vector3(e.pos.x, e.pos.y + t.headY, e.pos.z), r: t.headR * 1.55, head: true });
    if (e.segs) e.segs.forEach((sg, i) => out.push({ c: new THREE.Vector3(sg.x, sg.y + 1.0, sg.z), r: 1.0 * (1 - (i + 1) * 0.085), head: false }));
    return out;
  }
  /** the safety net: whoever is plainly in front and in reach when the blow peaks is struck, so a close fight never whiffs */
  assist(a) {
    const S = a.spec, pl = this.pl, ws = this.ws, reach = 2.7 * (ws.mods.reach || 1);
    const yaw = pl.faceOverride ? pl.faceOverride.yaw : pl.camYaw;
    for (const e of (ws.ctx.enemies() || [])) {
      if (!e.alive || a.hit.has(e) || e.state === 'spawn') continue;
      let ex = e.pos.x, ez = e.pos.z;
      const dx = ex - pl.pos.x, dz = ez - pl.pos.z, dist = Math.hypot(dx, dz) || 0.01;
      if (dist > reach + e.type.radius || Math.abs(e.pos.y - pl.pos.y) > 3) continue;
      if (Math.abs(angleTo(yaw, Math.atan2(dx, dz))) > 1.05 && dist > e.type.radius + 0.9) continue;
      this.land(a, e, _a.set(ex - dx / dist * e.type.radius * 0.6, e.pos.y + e.type.height * 0.55, ez - dz / dist * e.type.radius * 0.6), false);
    }
  }

  land(a, e, point, head) {
    const S = a.spec, pl = this.pl, ws = this.ws;
    a.hit.add(e);
    const dx = e.pos.x - pl.pos.x, dz = e.pos.z - pl.pos.z, dl = Math.hypot(dx, dz) || 1;
    const dir = new THREE.Vector3(dx / dl, 0, dz / dl);
    const rip = pl.riposteT > 0 ? 1.8 : 1;
    if (rip > 1) { pl.riposteT = 0; if (ws.ctx.onRiposte) ws.ctx.onRiposte(); }
    const dmg = S.dmg * ws.mods.dmg * (S.heavy ? ws.mods.heavy : 1) * (pl.dmgMul || 1) * rip * (head ? 1.25 : 1);
    ws.ctx.applyDamage(e, dmg, point.clone(), dir, !!S.finisher || head, ws.def);
    if (!e.type.boss && e.alive) {
      const heavyFoe = e.type.heavy ? 0.4 : 1;
      e.vel.addScaledVector(dir, S.kb * heavyFoe);
      if (ws.ctx.stagger) ws.ctx.stagger(e, S.stag * (e.type.heavy ? 0.5 : 1));
    }
    pl.shake = Math.min(2.2, pl.shake + S.shake);
    ws.shotsHit++;
    if (ws.audio.clang) ws.audio.clang(1, !!S.finisher);
    if (ws.ctx.onMeleeHit) ws.ctx.onMeleeHit(1, !!S.finisher, !!S.heavy, S.stop);
    if (S.slam && ws.fx.ring) {
      ws.fx.ring(new THREE.Vector3(point.x, point.y - 0.6, point.z), ws.def.color, 2.4 + (S.heavy ? 1.2 : 0), 0.35);
    }
    if (ws.ctx.onShot) ws.ctx.onShot(true, false);
  }

  /* ---------------- the shield as a weapon */
  shieldBash() {
    const pl = this.pl;
    if (this.bashCd > 0 || this.bashT > 0) return;
    if (!pl.spend(13)) { if (this.ws.onWinded) this.ws.onWinded(); return; }
    this.hero.shieldBash(0.32);
    this.bashT = 0.13; this.bashCd = 0.75;
    pl.faceLock = Math.max(pl.faceLock, 0.5);
    pl.knock.addScaledVector(_a.set(Math.sin(pl.camYaw), 0, Math.cos(pl.camYaw)), 2.2);
    if (this.ws.audio.click) this.ws.audio.click(0, 0.24, 240);
  }
  bashHit() {
    const pl = this.pl, ws = this.ws;
    let any = false;
    for (const e of (ws.ctx.enemies() || [])) {
      if (!e.alive || e.state === 'spawn') continue;
      const dx = e.pos.x - pl.pos.x, dz = e.pos.z - pl.pos.z, d = Math.hypot(dx, dz);
      if (d > 2.2 + e.type.radius || Math.abs(angleTo(pl.camYaw, Math.atan2(dx, dz))) > 0.95) continue;
      const dir = new THREE.Vector3(dx / (d || 1), 0, dz / (d || 1)), point = new THREE.Vector3(e.pos.x - dir.x * e.type.radius, e.pos.y + e.type.height * 0.55, e.pos.z - dir.z * e.type.radius);
      ws.ctx.applyDamage(e, 13 * ws.mods.dmg, point, dir, false, ws.def);
      if (!e.type.boss) { e.vel.addScaledVector(dir, e.type.heavy ? 3 : 9); if (ws.ctx.stagger) ws.ctx.stagger(e, e.type.heavy ? 0.7 : 1.3); }
      any = true;
    }
    if (any) {
      pl.shake = Math.min(2, pl.shake + 0.5);
      if (ws.audio.clang) ws.audio.clang(2, true);
      if (ws.ctx.onMeleeHit) ws.ctx.onMeleeHit(1, true, false, 0.09);
      this.hero.shieldHit(true);
    }
  }
}

const damp1 = (a, b, dt) => a + (b - a) * (1 - Math.exp(-6 * dt));
