import * as THREE from 'three';
import { clamp, angleTo, terrainHeight } from './core.js';

/* ================================================================ sword and shield
   Melee for the hero rig (hero.js). The motion is a real captured strike plus authored cuts; the rules around it are
   what make it feel like fighting:

   - Three different cuts in a row: a forehand (the captured clip), a rising backhand and an overhead (authored paths in
     hero.js, on the same timing). Hold attack and the blade stops at the top of the wind-up and CHARGES into a heavy blow.
     Strike while running and it is a lunging thrust.
   - The blade is a solid thing. Each frame of the strike it is swept against what is in front of you, and what it meets
     first decides the blow: a SHIELD stops it (it bounces back, you are checked and open a moment), a BLADE raised in an
     attack meets yours (a clash: both of you are thrown back, his attack is broken), a BODY takes the cut (it drags a
     moment in the flesh, blood, a wound that stays on him). A held heavy blow smashes a shield aside instead.
   - COUNTER (Arkham / Mordor): a yellow marker over a man means his blow can be countered. Press GUARD while it shows and
     you turn to him, take the blow on the blade, and cut back. Red markers cannot be countered: roll.
   - FLOW: unbroken hits build it; being hit, or bouncing off steel, costs it. The SPECIAL button spends it: a finishing
     move on a stunned or beaten man (or anyone, at full flow), or a wide sweeping cut when you are surrounded.
   - The shield is a weapon too: guard and attack to bash (a stun and a shove). */

const SPECS = {
  sword: {
    light: [
      { from: 0.10, speed: 1.55, s0: 0.28, s1: 0.60, end: 0.96, dmg: 34, stam: 7, lunge: 3.4, stop: 0.06, shake: 0.22, stag: 0.2, kb: 4.2 },
      { path: 'backhand', from: 0.12, speed: 1.65, s0: 0.30, s1: 0.60, end: 0.96, dmg: 37, stam: 7, lunge: 3.4, stop: 0.06, shake: 0.22, stag: 0.2, kb: 4.2 },
      { path: 'overhead', from: 0.0, speed: 1.12, s0: 0.30, s1: 0.64, end: 1.22, dmg: 76, stam: 13, lunge: 5.2, stop: 0.12, shake: 0.55, stag: 0.55, kb: 8, finisher: true, slam: true, pitch: 0.2 },
    ],
    heavy: { chargeAt: 0.21, from: 0.21, speed: 1.2, s0: 0.28, s1: 0.64, end: 1.26, dmg: 118, stam: 26, lunge: 5.6, stop: 0.17, shake: 0.9, stag: 0.9, kb: 11, finisher: true, slam: true, heavy: true, pitch: 0.25 },
    thrust: { clip: 'Punch_Cross', thrust: true, from: 0.0, speed: 1.3, s0: 0.1, s1: 0.36, end: 0.8, dmg: 52, stam: 10, lunge: 7, stop: 0.08, shake: 0.35, stag: 0.4, kb: 5.5 },
    sweep: { path: 'sweep', from: 0.12, speed: 1.05, s0: 0.28, s1: 0.64, end: 1.2, dmg: 46, stam: 0, lunge: 1.5, stop: 0.1, shake: 0.7, stag: 0.8, kb: 7, aoe: true, special: true },
  },
  axe: {
    light: [{ from: 0.0, speed: 0.95, s0: 0.28, s1: 0.64, end: 1.28, dmg: 95, stam: 15, lunge: 4.2, stop: 0.12, shake: 0.6, stag: 0.6, kb: 8, finisher: true, slam: true, pitch: 0.15 }],
    heavy: { chargeAt: 0.21, from: 0.21, speed: 0.9, s0: 0.28, s1: 0.66, end: 1.32, dmg: 170, stam: 30, lunge: 5, stop: 0.2, shake: 1.1, stag: 1.1, kb: 13, finisher: true, slam: true, heavy: true, pitch: 0.3 },
  },
};

/* The motion-captured set (the second animation library, assets/ual2.bin): three real cuts that each flow into a
   recovery unless the next press comes, a heavy overhead out of the heavy combo, a running dash-cut. Windows are the
   measured stretches where the blade tip moves fast (tools/hero_view.html ?profile=). */
const MOCAP = {
  light: [
    { clip: 'Sword_Regular_A', from: 0.0, speed: 1.1, s0: 0.08, s1: 0.33, end: 0.43, rec: 'Sword_Regular_A_Rec', dmg: 34, stam: 7, lunge: 3.4, stop: 0.06, shake: 0.22, stag: 0.2, kb: 4.2 },
    { clip: 'Sword_Regular_B', from: 0.02, speed: 1.15, s0: 0.19, s1: 0.35, end: 0.53, rec: 'Sword_Regular_B_Rec', dmg: 37, stam: 7, lunge: 3.4, stop: 0.06, shake: 0.22, stag: 0.2, kb: 4.2 },
    { clip: 'Sword_Regular_C', from: 0.0, speed: 1.05, windows: [[0.06, 0.31], [0.56, 0.76]], s0: 0.06, s1: 0.76, end: 1.05, dmg: 52, stam: 13, lunge: 5.2, stop: 0.12, shake: 0.55, stag: 0.55, kb: 8, finisher: true },
  ],
  heavy: { clip: 'Sword_Heavy_Combo', chargeAt: 1.6, from: 1.4, speed: 1.0, s0: 1.68, s1: 1.94, end: 2.12, dmg: 118, stam: 26, lunge: 5.6, stop: 0.17, shake: 0.9, stag: 0.9, kb: 11, finisher: true, slam: true, heavy: true },
  thrust: { clip: 'Sword_Dash', from: 0.14, speed: 1.1, s0: 0.21, s1: 0.42, end: 0.8, dmg: 52, stam: 10, lunge: 7, stop: 0.08, shake: 0.35, stag: 0.4, kb: 5.5 },
  sweep: SPECS.sword.sweep,
};

/* Finishing moves as short staged sequences (Ryse-style). Between stages the action holds for a beat and a prompt
   shows over the man: ATTACK (gold) or GUARD (steel). The right button in time is PERFECT (more health and flow);
   all of them is FLAWLESS. A miss does not stop the kill. Stage keys: clip from..to at speed, standing dist from him;
   at hitAt a non-lethal blow (cut / bash / pommel), at killAt the killing one; roll: round to his back. */
const EXEC = {
  overhead: [
    { clip: 'Sword_Heavy_Combo', from: 1.4, to: 1.64, speed: 0.75, stand: 1.45 },
    { prompt: 'attack' },
    { clip: 'Sword_Heavy_Combo', from: 1.64, to: 2.05, speed: 0.85, stand: 1.45, killAt: 1.8, heavy: true },
  ],
  combo: [
    { clip: 'Sword_Regular_B', from: 0.0, to: 0.42, speed: 1.05, stand: 1.4, hitAt: 0.27, cut: true },
    { prompt: 'attack' },
    { clip: 'Sword_Regular_C', from: 0.45, to: 0.86, speed: 0.95, stand: 1.4, killAt: 0.64 },
  ],
  bash: [
    { clip: 'Shield_OneShot', from: 0.0, to: 0.24, speed: 1.0, stand: 1.1, hitAt: 0.1, bash: true },
    { prompt: 'guard' },
    { clip: 'Melee_Hook', from: 0.0, to: 0.36, speed: 1.0, stand: 1.05, hitAt: 0.27, pommel: true },
    { prompt: 'attack' },
    { clip: 'Sword_Regular_A', from: 0.0, to: 0.43, speed: 0.95, stand: 1.3, killAt: 0.27 },
  ],
  thrust: [
    { clip: 'Punch_Cross', from: 0.0, to: 0.1, speed: 0.6, stand: 1.25, thrust: true },
    { prompt: 'attack' },
    { clip: 'Punch_Cross', from: 0.1, to: 0.62, speed: 0.9, stand: 1.2, killAt: 0.22, thrust: true },
  ],
  roll: [
    { roll: true },
    { prompt: 'attack' },
    { clip: 'Sword_Regular_A', from: 0.0, to: 0.43, speed: 1.0, stand: 1.3, killAt: 0.27 },
  ],
};
const PROMPT_WINDOW = 0.8;

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _tip = new THREE.Vector3(), _base = new THREE.Vector3();
const _sc = new THREE.Vector3(), _sn = new THREE.Vector3(), _p0 = new THREE.Vector3(), _p1 = new THREE.Vector3(), _g0 = new THREE.Vector3(), _g1 = new THREE.Vector3(), _sq = new THREE.Quaternion(), _ws = new THREE.Vector3();
const _r1 = new THREE.Vector3(), _r2 = new THREE.Vector3(), _r3 = new THREE.Vector3();
const FRACS = [0.3, 0.45, 0.6, 0.75, 0.9, 1.0];          // where along the blade the contact tests sample (hilt to tip)

/** closest distance between segments p1-q1 and p2-q2; the meeting point is written to out */
function segSeg(p1, q1, p2, q2, out) {
  const d1 = _r1.copy(q1).sub(p1), d2 = _r2.copy(q2).sub(p2), r = _r3.copy(p1).sub(p2);
  const a = d1.dot(d1), e = d2.dot(d2), f = d2.dot(r);
  let s = 0, t = 0;
  if (a <= 1e-9 && e <= 1e-9) { out.copy(p1); return p1.distanceTo(p2); }
  if (a <= 1e-9) { t = clamp(f / e, 0, 1); }
  else {
    const c = d1.dot(r);
    if (e <= 1e-9) s = clamp(-c / a, 0, 1);
    else {
      const b = d1.dot(d2), den = a * e - b * b;
      s = den > 1e-9 ? clamp((b * f - c * e) / den, 0, 1) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = clamp(-c / a, 0, 1); } else if (t > 1) { t = 1; s = clamp((b - c) / a, 0, 1); }
    }
  }
  const c1 = _a.copy(p1).addScaledVector(d1, s), c2 = _b.copy(p2).addScaledVector(d2, t);
  out.copy(c1).add(c2).multiplyScalar(0.5);
  return c1.distanceTo(c2);
}

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
    this.prevTip = new THREE.Vector3(); this.prevBase = new THREE.Vector3(); this.havePrev = false;
    this.recoverT = 0;         // thrown back off steel: a moment before the next swing
    this.counter = null;       // a counter in progress: { t, list, first }
    this.riposteQ = null;      // the cut that answers a counter
    this.blood = 0;            // blood on the blade, 0..1
    this.counterLock = 0;      // a counter pressed at nothing: a short beat before the next one
    this.exec = null;          // a finishing move in progress
    this.flow = 0; this.flowT = 0;
  }

  get pl() { return this.ws.player; }
  get hero() { return this.ws.player.hero; }
  get specs() { return this.ws.def.id === 'sword' && this.hero.A.Sword_Regular_A && this.hero.A.Sword_Heavy_Combo ? MOCAP : SPECS[this.ws.def.id] || SPECS.sword; }
  get mocap() { return this.specs === MOCAP; }
  get busy() { return !!this.atk; }
  /** 0..1 while holding at the top of the wind-up */
  get charge() { return this.atk && this.atk.charging ? clamp(this.holdT / 0.6, 0, 1) : 0; }

  /* ---------------- input */
  press() {
    const ws = this.ws, pl = this.pl;
    ws.idleT = 0;
    if (this.exec) { this.execInput('attack'); return; }
    if (pl.guard) return this.shieldBash();
    // sheathed: draw and cut in one move, so the first press is always a blow
    if (!ws.drawn || ws.drawT > 0) { ws.ready(); ws.drawT = 0; if (ws.audio.shot) ws.audio.shot('draw', 0); }
    if (this.atk) { if (!this.atk.rebound) this.atk.buffered = true; return; }          // chains once the blow has landed
    if (this.recoverT > 0) return;                                 // still checked from bouncing off steel
    this.holdT = 0;
    // on the run: a lunging thrust
    if (this.specs.thrust && (pl.sprinting || Math.hypot(pl.vel.x, pl.vel.z) > 5.2) && this.clock - this.lastEnd > 0.4) { this.combo = 0; this.begin(this.specs.thrust, false); return; }
    // the captured set decides on release: a tap is a cut, a hold of a fifth of a second winds up the heavy blow
    if (this.mocap) { this.pending = true; return; }
    this.begin(this.nextLight(), true);
  }
  hold(dt) {
    this.holdT += dt;
    if (this.pending && this.holdT >= 0.18) { this.pending = false; this.combo = 0; this.begin(this.specs.heavy, true); }
    const a = this.atk;
    if (a && a.holdable && !a.released && !a.pausedOnce && this.hero.layerTime >= this.specs.heavy.chargeAt) {
      a.charging = true; a.pausedOnce = true; this.hero.holdLayer(true);        // the blade stays up: a visible charge
      if (this.ws.audio.impact) this.ws.audio.impact('whoosh', 0.3);
    }
    if (a && a.charging && !a.cued && this.holdT >= 0.6) { a.cued = true; if (this.ws.audio.impact) this.ws.audio.impact('steel', 0.35); if (this.ws.ctx.haptic) this.ws.ctx.haptic(15); }   // full: a ring of steel
  }
  release() {
    if (this.pending) { this.pending = false; this.begin(this.nextLight(), false); return; }
    const a = this.atk;
    if (!a) return;
    a.released = true;
    if (a.charging && this.mocap) {             // the heavy was wound from the start: release lets it fall, harder the longer it was held
      a.charging = false; this.hero.holdLayer(false); a.chargeK = clamp((this.holdT - 0.18) / 0.5, 0, 1);
      if (this.ws.audio.roar && a.chargeK > 0.6) this.ws.audio.roar(8);
      return;
    }
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
  begin(spec, holdable = false, forced = null) {
    const pl = this.pl, ws = this.ws;
    if (!pl.spend(spec.stam)) { if (ws.onWinded) ws.onWinded(); return false; }
    this.atk = { spec, holdable: holdable && (spec === this.specs.light[0] || !!spec.chargeAt), hit: new Set(), buffered: false, charging: false, released: !holdable, pausedOnce: false, started: false, assist: false, rebound: 0, drag: 0 };
    this.havePrev = false;
    this.hero.playOnce(spec.clip || 'Sword_Attack', { from: spec.from, speed: spec.speed, bodyW: spec.path ? 0.3 : 1 });
    this.hero.setSwing(spec.path || null, spec.from); this.hero.setThrust(spec.thrust ? 1 : 0);
    pl.moveMul = 0.35; pl.faceLock = Math.max(pl.faceLock, 0.9);
    // turn the body toward the nearest threat in front before the blow, so a nudge of the stick or camera is enough
    const t = forced && forced.alive ? forced : this.target(7, 2.6);
    if (t) {
      const dx = t.pos.x - pl.pos.x, dz = t.pos.z - pl.pos.z, dd = Math.hypot(dx, dz) || 1, gap = dd - t.type.radius - 1.15;
      pl.faceOverride = { yaw: Math.atan2(dx, dz), t: 0.8 };
      // the dash: close the distance as the blade goes up (a long, quick lunge, not a stroll)
      if (gap > 0.35) { const run = Math.min(6.5, gap), dur = clamp(run / 15, 0.12, 0.4); pl.dashT = dur; pl.dashV.set(dx / dd, 0, dz / dd).multiplyScalar(run / dur); }
      this.atk.target = t;
    }
    ws.swingT = 0.2;
    return true;
  }
  cancel() {
    if (this.exec) return;
    if (!this.atk) return;
    this.atk = null; this.hero.holdLayer(false); this.hero.stopLayer(); this.hero.setSwing(null); this.hero.setThrust(0); this.pl.moveMul = 1; this.ws.swingT = 0;
  }

  /**
   * Freeflow: whoever the stick points at (within a wide cone), else whoever the camera faces. Stunned soldiers are favoured
   * a little, so a follow-up finds the open man.
   */
  target(range, arc) {
    const pl = this.pl, w = pl.wish;
    const aimYaw = w.mag > 0.4 ? Math.atan2(w.x, w.z) : pl.camYaw, half = w.mag > 0.4 ? 1.15 : arc / 2;
    let best = null, bs = 1e9;
    for (const e of (this.ws.ctx.enemies() || [])) {
      if (!e.alive || e.state === 'spawn') continue;
      const dx = e.pos.x - pl.pos.x, dz = e.pos.z - pl.pos.z, d = Math.hypot(dx, dz);
      if (d > range + e.type.radius) continue;
      const off = Math.abs(angleTo(aimYaw, Math.atan2(dx, dz)));
      if (off > half) continue;
      const sc = off * 3 + d * 0.35 - (e.ai && e.ai.mode === 'stun' ? 0.8 : 0);
      if (sc < bs) { bs = sc; best = e; }
    }
    return best;
  }

  update(dt) {
    this.clock += dt;
    this.recoverT = Math.max(0, this.recoverT - dt); this.counterLock = Math.max(0, this.counterLock - dt);
    this.blood = Math.max(0, this.blood - dt * 0.012);            // it dries and flakes off over a minute or so
    const bm = this.ws.models[this.ws.index] && this.ws.models[this.ws.index].userData.blood;
    if (bm) bm.material.opacity = Math.min(0.85, this.blood * 0.9);
    if (this.exec) { this.runExec(dt); return; }
    if (this.flow > 0) { this.flowT -= dt; if (this.flowT <= 0) this.breakFlow(); }
    this.bashCd = Math.max(0, this.bashCd - dt);
    if (this.bashT > 0) { this.bashT -= dt; if (this.bashT <= 0) this.bashHit(); }
    if (this.counter) this.counterUpdate(dt);
    if (this.riposteQ) { this.riposteQ.t -= dt; if (this.riposteQ.t <= 0) { const q = this.riposteQ; this.riposteQ = null; if (!this.atk && q.e.alive) { this.combo = 1; this.pl.riposteT = Math.max(this.pl.riposteT, 0.6); this.begin(this.specs.light[1], false, q.e); } } }
    const a = this.atk, pl = this.pl, ws = this.ws;
    if (!a) { pl.moveMul = damp1(pl.moveMul, 1, dt); return; }
    const hero = this.hero, S = a.spec;
    hero.root.updateMatrixWorld(true);
    const t = hero.layerTime;
    if (S.path) hero.setSwing(S.path, t);
    // thrown back off a shield or a blade: the cut runs backward a moment, then you are open
    if (a.rebound > 0) {
      a.rebound -= dt; pl.moveMul = 0.2;
      if (a.rebound <= 0 || !hero.layer) { this.finish(); this.recoverT = a.reboundKind === 'blade' ? 0.22 : 0.3; }
      return;
    }
    // a cut into a body drags a moment
    if (a.drag > 0) { a.drag -= dt; const A = hero.A[hero.layer ? hero.layer.name : 'Sword_Attack']; A.timeScale = a.drag > 0 ? a.speed0 * 0.38 : a.speed0; }
    ws.swingT = 0.2; ws.idleT = 0;
    // the movement penalty eases off through the recovery
    pl.moveMul = t < S.s1 ? 0.3 : clamp(0.3 + (t - S.s1) / (S.end - S.s1) * 0.7, 0.3, 1);
    // the recovery clip after a captured cut: the next press goes straight into the next cut; moving off ends it early
    if (a.inRec) {
      pl.moveMul = clamp(0.5 + t * 1.2, 0.5, 1);
      if (a.buffered) { const next = this.nextLight(true); this.atk = null; this.begin(next, false); return; }
      if ((pl.wish && pl.wish.mag > 0.5 && t > 0.22) || t >= a.recEnd || !hero.layer) this.finish();
      return;
    }
    if (!a.started && t >= S.s0 - 0.02) this.strikeStart(a);
    let active = t >= S.s0 && t <= S.s1;
    if (S.windows) {
      const w = S.windows.findIndex(([w0, w1]) => t >= w0 && t <= w1);
      active = w >= 0;
      if (w >= 0 && a.win !== undefined && w !== a.win) { a.hit = new Set(); a.assist = false; this.havePrev = false; }     // the second blow of the cut can strike again
      if (w >= 0) a.win = w;
    }
    if (active) this.sweep(a, t);
    const wnd = S.windows && a.win !== undefined ? S.windows[a.win] : [S.s0, S.s1];
    if (!a.assist && active && t >= (wnd[0] + wnd[1]) * 0.5) { a.assist = true; this.assist(a); }
    // a buffered press chains the moment the blow is through
    if (t > S.s1 && a.buffered && !a.charging) { const next = this.nextLight(true); this.atk = null; this.begin(next, false); return; }
    if (a.truncate && t > S.s0 + 0.12) { this.finish(); return; }
    if (t >= S.end || !hero.layer) {
      if (S.rec && hero.A[S.rec] && hero.layer) { a.inRec = true; hero.playOnce(S.rec, { from: 0, speed: 1.15 }); a.recEnd = hero.A[S.rec].getClip().duration * 0.9; return; }
      this.finish();
    }
  }
  finish() {
    this.atk = null; this.lastEnd = this.clock; this.pl.moveMul = 1; this.ws.swingT = 0;
    this.hero.stopLayer(); this.hero.setSwing(null); this.hero.setThrust(0);
  }

  strikeStart(a) {
    a.started = true;
    const S = a.spec, pl = this.pl, ws = this.ws;
    if (ws.audio.shot) ws.audio.shot(ws.def.sound, 0);
    if (ws.onFired) ws.onFired(ws.def);
    // step into the blow
    const tgt = a.target && a.target.alive ? a.target : this.target(4.6, 2.6), yaw = pl.faceOverride ? pl.faceOverride.yaw : pl.camYaw;
    if (tgt) {
      const dx = tgt.pos.x - pl.pos.x, dz = tgt.pos.z - pl.pos.z, dd = Math.hypot(dx, dz) || 1, gap = dd - tgt.type.radius - 1.0;
      if (gap > 0.2) { const run = Math.min(2.2, gap), dur = clamp(run / 9, 0.08, 0.25); pl.dashT = dur; pl.dashV.set(dx / dd, 0, dz / dd).multiplyScalar(run / dur); }
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
      // steel first: a shield or a raised blade in the way stops the cut before it reaches him
      const c = this.havePrev ? this.contact(e, base, tip) : null;
      if (c) { this.land(a, e, c.at, false, c.kind); if (a.rebound > 0) break; continue; }
      const spheres = this.spheres(e);
      let hit = null;
      for (const sp of spheres) {
        const pad = sp.r + 0.14;
        closestOnSeg(base, tip, sp.c, _a);
        let d = _a.distanceTo(sp.c);
        if (d > pad && this.havePrev) { closestOnSeg(this.prevTip, tip, sp.c, _b); const d2 = _b.distanceTo(sp.c); if (d2 < d) { d = d2; _a.copy(_b); } }
        if (d <= pad) { hit = { sp, at: _a.clone() }; break; }
      }
      if (hit) { this.land(a, e, hit.at, hit.sp.head); hits++; if (a.rebound > 0) break; }
    }
    this.prevTip.copy(tip); this.prevBase.copy(base); this.havePrev = true;
  }

  /**
   * Does the blade (this frame, and the band it swept since the last) meet his shield or his blade?
   * The shield is a disc on its face; the blade a thin rod from grip to point, live only when he is swinging it.
   */
  contact(e, base, tip) {
    const v = e.view;
    if (!v || v.far || v.dead) return null;
    if (v.shield) {
      v.shield.getWorldPosition(_sc); _sn.set(0, 0, 1).applyQuaternion(v.shield.getWorldQuaternion(_sq));
      if (!v.shieldR) { const g = v.shield.geometry; if (!g.boundingSphere) g.computeBoundingSphere(); v.shieldR = g.boundingSphere.radius * 0.82; }
      const R = v.shieldR * v.shield.getWorldScale(_ws).x;
      for (const f of FRACS) {
        _p1.copy(base).lerp(tip, f); _p0.copy(this.prevBase).lerp(this.prevTip, f);
        const d1 = _c.copy(_p1).sub(_sc).dot(_sn), d0 = _c.copy(_p0).sub(_sc).dot(_sn);
        let X = null;
        if (d0 * d1 <= 0 && Math.abs(d0 - d1) > 1e-5) X = _p0.lerp(_p1, d0 / (d0 - d1));
        else if (Math.abs(d1) < 0.05) X = _p1;
        if (!X) continue;
        _c.copy(X).sub(_sc); _c.addScaledVector(_sn, -_c.dot(_sn));
        if (_c.length() < R) return { kind: 'shield', at: X.clone() };
      }
    }
    const ai = e.ai;
    if (ai && (ai.mode === 'tell' || ai.mode === 'strike') && v.grip && e.type.weapon !== 'crossbow') {
      v.grip(_g0); v.tip(_g1);
      let d = segSeg(base, tip, _g0, _g1, _d);
      if (d > 0.09) { const d2 = segSeg(this.prevTip, tip, _g0, _g1, _p0); if (d2 < d) { d = d2; _d.copy(_p0); } }
      if (d <= 0.09) return { kind: 'blade', at: _d.clone() };
    }
    return null;
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
      if (!S.aoe && Math.abs(angleTo(yaw, Math.atan2(dx, dz))) > 1.05 && dist > e.type.radius + 0.9) continue;
      if (S.aoe && dist > 3.0 + e.type.radius) continue;
      this.land(a, e, _a.set(ex - dx / dist * e.type.radius * 0.6, e.pos.y + e.type.height * 0.55, ez - dz / dist * e.type.radius * 0.6), false);
    }
  }

  land(a, e, point, head, contact = null) {
    const S = a.spec, pl = this.pl, ws = this.ws;
    a.hit.add(e);
    const dx = e.pos.x - pl.pos.x, dz = e.pos.z - pl.pos.z, dl = Math.hypot(dx, dz) || 1;
    const dir = new THREE.Vector3(dx / dl, 0, dz / dl);
    const rip = pl.riposteT > 0 ? 1.8 : 1;
    const dmg = S.dmg * ws.mods.dmg * (S.heavy ? ws.mods.heavy * (a.chargeK !== undefined ? 0.75 + 0.5 * a.chargeK : 1) : 1) * (pl.dmgMul || 1) * rip * (head ? 1.25 : 1);
    const res = ws.ctx.applyDamage(e, dmg, point.clone(), dir, !!S.finisher || head, ws.def, { heavy: !!S.heavy, breaks: !!S.heavy, riposte: rip > 1, contact, aoe: !!S.aoe });
    if (res === 'blocked' || res === 'clash') {
      if (res === 'blocked' && contact !== 'shield' && e.view && e.view.shield) e.view.shield.getWorldPosition(point);
      return this.rebound(a, e, point, dir, res === 'clash' ? 'blade' : (e.view && e.view.shield ? 'shield' : 'blade'));
    }
    if (res === 'broke') {            // a heavy blow smashes the shield aside: the blade goes on, he reels
      if (ws.audio.impact) ws.audio.impact('shield', 1.6);
      if (ws.fx.spark) ws.fx.spark(point, dir.clone().negate(), 0xffd890, 14, 6, 0.09, 0.3);
      if (ws.fx.puff) ws.fx.puff(point, dir, 0x6a4a30, 0.3, 3, 0.5, 1.5);
      pl.shake = Math.min(2.2, pl.shake + 0.8);
      if (ws.ctx.onMeleeHit) ws.ctx.onMeleeHit(1, true, true, 0.12);
      if (ws.ctx.haptic) ws.ctx.haptic(45);
      this.addFlow(1);
      return;
    }
    if (rip > 1) { pl.riposteT = 0; if (ws.ctx.onRiposte) ws.ctx.onRiposte(); }
    if (!e.type.boss && e.alive && !e.ai) {
      const heavyFoe = e.type.heavy ? 0.4 : 1;
      e.vel.addScaledVector(dir, S.kb * heavyFoe);
      if (ws.ctx.stagger) ws.ctx.stagger(e, S.stag * (e.type.heavy ? 0.5 : 1));
    } else if (e.ai && e.alive) e.vel.addScaledVector(dir, S.kb * (e.type.heavy ? 0.3 : 0.8));
    // the cut: the edge drags in the body a moment, blood follows the blade, the wound stays
    const swing = _c.copy(this.prevTip).sub(this.blade()[1]).negate(); if (swing.lengthSq() < 1e-4) swing.copy(dir); swing.normalize();
    const amt = S.heavy ? 1.9 : S.finisher ? 1.5 : 1.0;
    if (ws.fx.bleed && e.type.blood !== false) ws.fx.bleed(point, swing.clone().multiplyScalar(0.8).addScaledVector(dir, 0.4), amt);
    if (e.view && e.view.addWound) e.view.addWound(point, amt);
    this.blood = Math.min(1, this.blood + 0.18 * amt);
    const A = this.hero.layer ? this.hero.A[this.hero.layer.name] : null;
    if (A && !a.drag) { a.speed0 = A.timeScale; a.drag = S.heavy ? 0.09 : 0.06; }
    pl.shake = Math.min(2.2, pl.shake + S.shake);
    ws.shotsHit++;
    if (ws.audio.impact) { ws.audio.impact('flesh', S.heavy ? 1.5 : S.finisher ? 1.2 : 0.9); if (head || e.type.armor) ws.audio.impact('armour', 0.6); }
    else if (ws.audio.clang) ws.audio.clang(1, !!S.finisher);
    if (ws.ctx.onMeleeHit) ws.ctx.onMeleeHit(1, !!S.finisher, !!S.heavy, S.stop);
    if (ws.ctx.haptic) ws.ctx.haptic(S.heavy ? 40 : 18);
    if (ws.ctx.onShot) ws.ctx.onShot(true, false);
    if (S.aoe && e.alive && ws.ctx.stun) ws.ctx.stun(e, e.type.boss ? 0.5 : 1.0);
    this.addFlow(1);
  }

  /** the blade met steel: it springs back along its path, you are pushed off and open for a moment */
  rebound(a, e, point, dir, kind) {
    const pl = this.pl, ws = this.ws, h = this.hero;
    a.rebound = kind === 'blade' ? 0.15 : 0.18; a.reboundKind = kind; a.drag = 0;
    const A = h.layer ? h.A[h.layer.name] : null;
    if (A) { A.paused = false; A.timeScale = -1.5; }
    pl.knock.addScaledVector(dir, kind === 'blade' ? -3.6 : -3.0); pl.shake = Math.min(2, pl.shake + 0.35);
    if (h.hitReact) h.overlay.hit = Math.max(h.overlay.hit, 0.35);
    this.flow = Math.max(0, this.flow - 1); if (ws.ctx.onFlow) ws.ctx.onFlow(this.flow);
    if (ws.audio.impact) ws.audio.impact(kind === 'blade' ? 'steel' : 'shield', 1.1); else if (ws.audio.clang) ws.audio.clang(2, false);
    if (ws.fx.spark) {
      if (kind === 'blade') { ws.fx.spark(point, dir.clone().negate().setY(0.4), 0xfff2c8, 20, 7.5, 0.08, 0.35); ws.fx.ring(point, 0xfff4d8, 0.8, 0.14); }
      else { ws.fx.spark(point, dir.clone().negate().setY(0.3), 0xffd690, 8, 5, 0.07, 0.25); if (ws.fx.puff) ws.fx.puff(point, dir.clone().negate(), 0x5a4532, 0.18, 3, 0.4, 1.2); }
    }
    if (e.view) e.view.kick = 1;
    if (e.alive) e.vel.addScaledVector(dir, 1.6);
    if (ws.ctx.onMeleeHit) ws.ctx.onMeleeHit(1, false, false, kind === 'blade' ? 0.09 : 0.07);
    if (ws.ctx.onBlockedByFoe) ws.ctx.onBlockedByFoe(e, kind);
    if (ws.ctx.haptic) ws.ctx.haptic(kind === 'blade' ? 32 : 26);
  }

  /* ---------------- counter: a yellow marker is a man you can answer */
  counterable(range = 4.2) {
    const pl = this.pl, out = [];
    let red = false;
    for (const e of (this.ws.ctx.enemies() || [])) {
      const ai = e.ai;
      if (!e.alive || !ai || !ai.tell) continue;
      if (!(ai.mode === 'tell' || (ai.mode === 'strike' && !ai.resolved))) continue;
      const d = Math.hypot(e.pos.x - pl.pos.x, e.pos.z - pl.pos.z);
      const reach = (e.type.ranged ? 0 : (ai.kind === 'thrust' ? 3.3 : 2.4)) + 1.6;
      if (d > Math.min(range, reach) + e.type.radius) continue;
      if (ai.tell.red || !ai.tell.parry) { red = true; continue; }
      out.push({ e, d });
    }
    out.sort((x, y) => x.d - y.d);
    return { list: out.map((o) => o.e), red };
  }
  /** GUARD pressed: if a yellow blow is coming, commit to answering it */
  tryCounter() {
    if (this.exec) { this.execInput('guard'); return false; }
    if (!this.pl.alive || this.counter) return false;
    const { list, red } = this.counterable();
    if (!list.length) {
      if (red && this.ws.ctx.onCounterRed) this.ws.ctx.onCounterRed();
      return false;
    }
    if (this.atk) this.cancel();
    for (const e of list) e.ai.countered = true;
    const first = list[0], pl = this.pl;
    this.counter = { t: 0, list, first };
    pl.faceOverride = { yaw: Math.atan2(first.pos.x - pl.pos.x, first.pos.z - pl.pos.z), t: 0.9 };
    pl.counterT = 1.1;
    this.hero.swordParry(1.0);
    if (this.ws.ctx.onCounterStart) this.ws.ctx.onCounterStart(first, list.length);
    return true;
  }
  counterUpdate(dt) {
    const c = this.counter; c.t += dt;
    const pl = this.pl;
    if (c.first.alive) pl.faceOverride = { yaw: Math.atan2(c.first.pos.x - pl.pos.x, c.first.pos.z - pl.pos.z), t: 0.2 };
    const waiting = c.list.some((e) => e.alive && e.ai && e.ai.countered);
    if (!waiting || c.t > 1.4) { for (const e of c.list) if (e.ai) e.ai.countered = false; this.counter = null; pl.counterT = 0; }
  }
  /** a countered blow has landed on the blade (soldier_ai calls this through the player): sparks, he reels, we cut back */
  countered(e) {
    if (!this.riposteQ && e.alive) this.riposteQ = { e, t: 0.12 };
    this.hero.swordParry(0.35);
    this.addFlow(1);
  }

  /* ---------------- the SPECIAL button */
  sweepTargets() {
    const pl = this.pl; let n = 0;
    for (const e of (this.ws.ctx.enemies() || [])) if (e.alive && e.ai && Math.hypot(e.pos.x - pl.pos.x, e.pos.z - pl.pos.z) < 3.2 + e.type.radius) n++;
    return n;
  }
  canSweep() { return !this.exec && this.openForSpecial && this.specs.sweep && this.flow >= 3 && this.sweepTargets() >= 1; }
  /** what SPECIAL would do now: 'finish', 'sweep' or null */
  specialKind() { return this.canExecute() ? 'finish' : this.canSweep() ? 'sweep' : null; }
  special() {
    const k = this.specialKind();
    if (k === 'finish') return this.execute();
    if (k === 'sweep') {
      if (this.atk) this.finish();
      this.flow -= 3; if (this.ws.ctx.onFlow) this.ws.ctx.onFlow(this.flow);
      this.begin(this.specs.sweep, false);
      if (this.ws.audio.roar) this.ws.audio.roar(6);
      if (this.ws.ctx.onSpecial) this.ws.ctx.onSpecial('sweep');
      return true;
    }
    return false;
  }

  /* ---------------- flow: unbroken hitting builds toward a finishing move */
  addFlow(n) { this.flow += n; this.flowT = 4.5; if (this.ws.ctx.onFlow) this.ws.ctx.onFlow(this.flow); }
  breakFlow() { if (this.flow > 0) { this.flow = 0; if (this.ws.ctx.onFlow) this.ws.ctx.onFlow(0); } }
  get flowReady() { return this.flow >= 6; }


  /* ---------------- finishing moves
     Offered on a stunned or beaten-down soldier, or on anyone once the flow is full. Four executions (an overhead cut,
     a thrust, a roll behind, a shield slam and stab), each with a kill-cam and a slow beat at the moment of the kill.
     You are untouchable while one plays, and it heals you. */
  execTarget() {
    const pl = this.pl, ws = this.ws; let best = null, bs = 1e9;
    const w = pl.wish, aim = w.mag > 0.4 ? Math.atan2(w.x, w.z) : pl.camYaw;
    for (const e of (ws.ctx.enemies() || [])) {
      if (!e.alive || !e.ai || e.state === 'spawn') continue;
      const open = ws.ctx.isExecutable ? ws.ctx.isExecutable(e) : false;
      const flowOpen = this.flowReady;
      if (!open && !flowOpen) continue;
      if (e.type.boss && !(open && e.hp < e.maxHp * 0.25)) continue;
      const dx = e.pos.x - pl.pos.x, dz = e.pos.z - pl.pos.z, d = Math.hypot(dx, dz);
      if (d > (open ? 4.6 : 5.5) + e.type.radius) continue;
      const sc = d * 0.5 + Math.abs(angleTo(aim, Math.atan2(dx, dz))) * 1.2 - (open ? 2 : 0);
      if (sc < bs) { bs = sc; best = e; }
    }
    return best;
  }
  /** a finisher can cut in whenever the blade is not mid-strike (the wind-up or the recovery of a cut is fine) */
  get openForSpecial() { const a = this.atk; if (!a) return true; if (a.inRec || a.rebound) return true; const t = this.hero.layerTime, S = a.spec; return !a.charging && (t < S.s0 - 0.02 || t > S.s1); }
  canExecute() { return !this.exec && this.openForSpecial && this.pl.alive ? this.execTarget() : null; }

  execute() {
    const t = this.canExecute();
    if (!t) return false;
    this.startExec(t);
    return true;
  }

  startExec(e) {
    const pl = this.pl, ws = this.ws, h = this.hero;
    const bearing = Math.atan2(pl.pos.x - e.pos.x, pl.pos.z - e.pos.z), behind = Math.abs(angleTo(e.yaw, bearing)) > 2.2;
    const staged = this.mocap;
    const list = staged ? (behind ? ['thrust', 'overhead'] : ['overhead', 'combo', 'bash', 'roll', 'thrust']) : behind ? ['thrust', 'overhead'] : ['overhead', 'thrust', 'roll', 'slam'];
    this.execIdx = (this.execIdx || 0) + 1;
    const v = list[this.execIdx % list.length];
    const usedFlow = this.flowReady && !(ws.ctx.isExecutable && ws.ctx.isExecutable(e));
    this.atk = null; h.stopLayer(); h.holdLayer(false);
    pl.execLock = true; pl.iframe = Math.max(pl.iframe, 5); pl.moveMul = 0; pl.guard = false;
    if (e.ai) { e.ai.mode = 'stun'; e.ai.stun = 9; e.ai.guarding = false; if (e.view) e.view.stunned = true; this.ws.ctx.releaseToken && this.ws.ctx.releaseToken(e); }
    const from = pl.pos.clone();
    const away = _a.set(from.x - e.pos.x, 0, from.z - e.pos.z); const dl = away.length() || 1; away.multiplyScalar(1 / dl);
    this.exec = { e, v, t: 0, killed: false, from, away: away.clone(), stage: 0, usedFlow };
    // the finisher is framed from the side of the pair, on whichever side is open (not through a pillar or a shield)
    {
      const mx = (pl.pos.x + e.pos.x) / 2, mz = (pl.pos.z + e.pos.z) / 2, px = -away.z, pz = away.x;
      const open = (sd, d) => !(ws.ctx.blocked && ws.ctx.blocked(mx, mz, mx + px * sd * d, mz + pz * sd * d));
      const side = open(1, 3.0) ? 1 : open(-1, 3.0) ? -1 : 1, dist = open(side, 3.0) ? 2.9 : 1.9;
      pl.execView = { e, side, dist };
    }
    if (staged) Object.assign(this.exec, { stages: EXEC[v], si: -1, st: 0, perfect: 0, prompts: 0, prompt: null });
    pl.camCue = { dist: v === 'roll' ? 0.7 : 0.58, shoulder: v === 'overhead' ? -1.0 : 0.9, height: -0.2, fov: 0.78, t: staged ? 4.0 : 2.0 };
    if (ws.audio.roar) ws.audio.roar(5);
    if (ws.ctx.onExecStart) ws.ctx.onExecStart(v, e);
  }

  runExec(dt) {
    const x = this.exec, pl = this.pl, h = this.hero, ws = this.ws, e = x.e;
    if (!pl.alive || (!e.alive && !x.killed)) return this.endExec(false);
    x.t += dt;
    if (x.stages) return this.runStages(dt, x);
    pl.moveMul = 0; pl.iframe = Math.max(pl.iframe, 0.5); pl.faceLock = Math.max(pl.faceLock, 0.3);
    h.root.updateMatrixWorld(true);
    const stand = (dist, k) => {                                  // glide the hero to a spot at dist from the target, on his own side
      const tx = e.pos.x + x.away.x * dist, tz = e.pos.z + x.away.z * dist;
      pl.pos.x += (tx - pl.pos.x) * clamp(k, 0, 1); pl.pos.z += (tz - pl.pos.z) * clamp(k, 0, 1);
      pl.pos.y = terrainHeight(pl.pos.x, pl.pos.z); pl.vel.set(0, 0, 0); pl.knock.set(0, 0, 0);
    };
    const face = () => { pl.faceOverride = { yaw: Math.atan2(e.pos.x - pl.pos.x, e.pos.z - pl.pos.z), t: 0.2 }; pl.yaw = pl.faceOverride.yaw; };
    const kill = (heavy) => {
      if (x.killed) return; x.killed = true;
      const dir = new THREE.Vector3(-x.away.x, 0, -x.away.z), at = new THREE.Vector3(e.pos.x, e.pos.y + 1.2, e.pos.z);
      ws.ctx.applyDamage(e, e.hp + 999, at, dir, true, ws.def, { exec: true });
      pl.shake = Math.min(2.4, pl.shake + 1.0);
      if (ws.fx.spark) { ws.fx.spark(at, dir.clone().negate(), 0xfff0c0, 26, 8, 0.1, 0.4); ws.fx.ring(at, 0xffffff, 2.0, 0.3); }
      if (ws.audio.clang) ws.audio.clang(3, true);
      if (ws.ctx.timeWarp) ws.ctx.timeWarp(0.16, heavy ? 0.6 : 0.45);
      pl.heal(14);
      if (x.usedFlow) { this.flow = 0; if (ws.ctx.onFlow) ws.ctx.onFlow(0); } else this.addFlow(2);
      if (ws.ctx.onExecuted) ws.ctx.onExecuted(e, x.v);
    };
    const L = () => h.layer ? h.layerTime : 0;
    if (x.v === 'overhead') {
      if (x.stage === 0) { h.playOnce('Sword_Attack', { from: 0.0, speed: 0.62 }); x.stage = 1; }
      stand(1.45, dt * 9); face();
      if (!x.killed && L() >= 0.3) { kill(true); if (h.layer) h.A.Sword_Attack.timeScale = 0.9; }
      if (x.killed && L() >= 0.85) return this.endExec(true);
    } else if (x.v === 'thrust') {
      if (x.stage === 0) { h.playOnce('Punch_Cross', { from: 0.0, speed: 0.9 }); h.setThrust(1); x.stage = 1; }
      stand(1.2, dt * 10); face();
      if (!x.killed && L() >= 0.22) kill(false);
      if (x.killed && L() >= 0.75) return this.endExec(true);
    } else if (x.v === 'roll') {
      if (x.stage === 0) { h.playOnce('Roll', { from: 0.05, speed: 2.5 }); x.stage = 1; x.sx = pl.pos.x; x.sz = pl.pos.z; }
      if (x.stage === 1) {
        // round to his back: the arc runs through his flank
        const k = clamp(x.t / 0.5, 0, 1), side = x.side || (x.side = Math.sign(angleTo(Math.atan2(x.away.x, x.away.z), e.yaw) || 1));
        const bx = e.pos.x - Math.sin(e.yaw) * 1.25, bz = e.pos.z - Math.cos(e.yaw) * 1.25;
        const mx = (x.sx + bx) / 2 + Math.cos(e.yaw) * 1.6 * side, mz = (x.sz + bz) / 2 - Math.sin(e.yaw) * 1.6 * side;
        const u = 1 - k;
        pl.pos.x = u * u * x.sx + 2 * u * k * mx + k * k * bx; pl.pos.z = u * u * x.sz + 2 * u * k * mz + k * k * bz;
        pl.pos.y = terrainHeight(pl.pos.x, pl.pos.z); pl.vel.set(0, 0, 0);
        pl.faceOverride = { yaw: Math.atan2(bx - x.sx, bz - x.sz), t: 0.2 }; pl.yaw = pl.faceOverride.yaw;
        if (k >= 1) { x.stage = 2; h.stopLayer(); x.away.set(-Math.sin(e.yaw), 0, -Math.cos(e.yaw)); h.playOnce('Sword_Attack', { from: 0.1, speed: 1.5 }); }
      } else {
        stand(1.3, dt * 12); face();
        if (!x.killed && L() >= 0.3) kill(false);
        if (x.killed && L() >= 0.85) return this.endExec(true);
      }
    } else {           // 'slam': the shield, then the point
      stand(1.25, dt * 10); face();
      if (x.stage === 0) { h.shieldBash(0.34); x.stage = 1; if (ws.audio.clang) ws.audio.clang(2, true); pl.shake = Math.min(2, pl.shake + 0.5); }
      if (x.stage === 1 && x.t > 0.3) { h.playOnce('Punch_Cross', { from: 0.0, speed: 1.15 }); h.setThrust(1); x.stage = 2; }
      if (x.stage === 2 && !x.killed && L() >= 0.21) kill(false);
      if (x.killed && L() >= 0.75) return this.endExec(true);
    }
    if (x.t > 3.2) return this.endExec(x.killed);
  }

  /** the staged (Ryse-style) finishers */
  runStages(dt, x) {
    const pl = this.pl, h = this.hero, ws = this.ws, e = x.e;
    pl.moveMul = 0; pl.iframe = Math.max(pl.iframe, 0.5); pl.faceLock = Math.max(pl.faceLock, 0.3);
    h.root.updateMatrixWorld(true);
    const stand = (dist, k) => {
      const tx = e.pos.x + x.away.x * dist, tz = e.pos.z + x.away.z * dist;
      pl.pos.x += (tx - pl.pos.x) * clamp(k, 0, 1); pl.pos.z += (tz - pl.pos.z) * clamp(k, 0, 1);
      pl.pos.y = terrainHeight(pl.pos.x, pl.pos.z); pl.vel.set(0, 0, 0); pl.knock.set(0, 0, 0);
    };
    const face = () => { pl.faceOverride = { yaw: Math.atan2(e.pos.x - pl.pos.x, e.pos.z - pl.pos.z), t: 0.2 }; pl.yaw = pl.faceOverride.yaw; };
    const at = new THREE.Vector3(e.pos.x, e.pos.y + 1.2, e.pos.z), dir = new THREE.Vector3(-x.away.x, 0, -x.away.z);
    const next = () => {
      x.si++; x.st = 0; x.hitDone = false;
      const S = x.stages[x.si];
      if (!S) return this.endExec(x.killed);
      if (S.prompt) {
        x.prompt = { kind: S.prompt, t: 0, result: null };
        if (h.layer) h.holdLayer(true);                                   // the action holds for the beat of the prompt
        x.prompts++; if (ws.ctx.onExecPrompt) ws.ctx.onExecPrompt(S.prompt, e);
      } else if (S.roll) { x.sx = pl.pos.x; x.sz = pl.pos.z; h.playOnce('Roll', { from: 0.05, speed: 2.5 }); }
      else { h.playOnce(S.clip, { from: S.from, speed: S.speed }); h.setThrust(S.thrust ? 1 : 0); }
    };
    if (x.si < 0) next();
    if (!this.exec) return;
    const S = x.stages[x.si];
    x.st += dt;
    face();
    if (S.prompt) {
      const P = x.prompt; P.t += dt;
      if (P.result || P.t >= PROMPT_WINDOW) {
        const ok = P.result === 'perfect';
        if (ok) { x.perfect++; pl.heal(5); this.addFlow(1); if (ws.audio.impact) ws.audio.impact('steel', 0.5); }
        if (ws.ctx.onExecPromptEnd) ws.ctx.onExecPromptEnd(P.result || 'late');
        x.prompt = null; h.holdLayer(false); next();
      }
      return;
    }
    if (S.roll) {
      const k = clamp(x.st / 0.5, 0, 1), side = x.side || (x.side = Math.sign(angleTo(Math.atan2(x.away.x, x.away.z), e.yaw) || 1));
      const bx = e.pos.x - Math.sin(e.yaw) * 1.25, bz = e.pos.z - Math.cos(e.yaw) * 1.25;
      const mx = (x.sx + bx) / 2 + Math.cos(e.yaw) * 1.6 * side, mz = (x.sz + bz) / 2 - Math.sin(e.yaw) * 1.6 * side, u = 1 - k;
      pl.pos.x = u * u * x.sx + 2 * u * k * mx + k * k * bx; pl.pos.z = u * u * x.sz + 2 * u * k * mz + k * k * bz;
      pl.pos.y = terrainHeight(pl.pos.x, pl.pos.z); pl.vel.set(0, 0, 0);
      if (k >= 1) { h.stopLayer(); x.away.set(-Math.sin(e.yaw), 0, -Math.cos(e.yaw)); next(); }
      return;
    }
    stand(S.stand || 1.3, dt * 10);
    const L = h.layer ? h.layerTime : S.to;
    if (S.hitAt !== undefined && !x.hitDone && L >= S.hitAt) {
      x.hitDone = true;
      if (S.bash) { if (ws.audio.impact) ws.audio.impact('shield', 1.4); h.shieldBash(0.3); if (e.view) { e.view.kick = 1.6; e.view.playReact('Idle_Shield_Break', 1.2, 0.05); } }
      else if (S.pommel) { if (ws.audio.impact) ws.audio.impact('armour', 1.3); if (e.view) e.view.playReact('Hit_Knockback', 1.4); if (ws.fx.spark) ws.fx.spark(at, dir.clone().negate(), 0xffe0b0, 8, 4, 0.06, 0.2); }
      else { if (ws.audio.impact) ws.audio.impact('flesh', 1.1); if (ws.fx.bleed) ws.fx.bleed(at, dir.clone().setY(0.2), 1.3); if (e.view) { e.view.addWound(at, 1.2); e.view.playReact('Hit_Knockback', 1.3); } this.blood = Math.min(1, this.blood + 0.2); }
      pl.shake = Math.min(2, pl.shake + 0.45); if (ws.ctx.haptic) ws.ctx.haptic(30);
      if (ws.ctx.timeWarp) ws.ctx.timeWarp(0.25, 0.08);
    }
    if (S.killAt !== undefined && !x.killed && L >= S.killAt) this.execKill(x, !!S.heavy);
    if (L >= S.to - 1e-3 || !h.layer || x.st > 2.5) next();
    if (this.exec && x.t > 9) this.endExec(x.killed);
  }
  /** the killing blow of a staged finisher */
  execKill(x, heavy) {
    const pl = this.pl, ws = this.ws, e = x.e;
    x.killed = true;
    const dir = new THREE.Vector3(-x.away.x, 0, -x.away.z), at = new THREE.Vector3(e.pos.x, e.pos.y + 1.2, e.pos.z);
    ws.ctx.applyDamage(e, e.hp + 999, at, dir, true, ws.def, { exec: true });
    pl.shake = Math.min(2.4, pl.shake + 1.0);
    if (ws.fx.bleed) ws.fx.bleed(at, dir.clone().setY(0.3), 2.2);
    if (ws.fx.ring) ws.fx.ring(at, 0xffffff, 1.6, 0.25);
    if (ws.audio.impact) { ws.audio.impact('flesh', 1.6); ws.audio.impact('armour', 0.8); }
    if (ws.ctx.haptic) ws.ctx.haptic(70);
    if (ws.ctx.timeWarp) ws.ctx.timeWarp(0.16, heavy ? 0.6 : 0.45);
    this.blood = Math.min(1, this.blood + 0.35);
    const flawless = x.prompts > 0 && x.perfect === x.prompts;
    pl.heal(14 + (flawless ? 12 : 0));
    if (flawless) { pl.stam = pl.maxStam; this.addFlow(1); }
    if (x.usedFlow) { this.flow = 0; if (ws.ctx.onFlow) ws.ctx.onFlow(0); } else this.addFlow(2);
    if (ws.ctx.onExecuted) ws.ctx.onExecuted(e, x.v, { perfect: x.perfect, prompts: x.prompts, flawless });
  }
  /** a button pressed during a finisher: the right one in the prompt's beat is PERFECT, the wrong one a miss */
  execInput(kind) {
    const x = this.exec; if (!x || !x.prompt || x.prompt.result) return;
    x.prompt.result = kind === x.prompt.kind ? 'perfect' : 'miss';
  }

  /** a new run: drop any swing, finishing move, flow or bash still in flight */
  reset() {
    if (this.exec) this.endExec(false);
    this.atk = null; this.pending = false; this.bashT = 0; this.breakFlow(); this.hero.stopLayer(); this.pl.moveMul = 1;
  }

  endExec(ok) {
    const pl = this.pl, h = this.hero;
    if (this.exec && this.exec.prompt && this.ws.ctx.onExecPromptEnd) this.ws.ctx.onExecPromptEnd(null);
    pl.execView = null;
    if (pl.camCue) pl.camCue.t = Math.min(pl.camCue.t, 0.35);          // ease the kill-cam back once it is over
    this.exec = null; pl.execLock = false; pl.moveMul = 1; pl.faceOverride = null; pl.iframe = Math.max(pl.iframe, 0.3);
    h.stopLayer(); h.holdLayer(false); h.setThrust(0);
    this.lastEnd = this.clock;
  }

  /* ---------------- the shield as a weapon */
  shieldBash() {
    const pl = this.pl;
    if (this.bashCd > 0 || this.bashT > 0) return;
    if (!pl.spend(13)) { if (this.ws.onWinded) this.ws.onWinded(); return; }
    this.hero.shieldBash(0.32);
    if (this.hero.A.Shield_OneShot && !this.atk) this.hero.playOnce('Shield_OneShot', { from: 0.0, speed: 1.15 });
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
      ws.ctx.applyDamage(e, 13 * ws.mods.dmg, point, dir, false, ws.def, { breaks: true });
      if (e.ai && e.alive) { e.vel.addScaledVector(dir, e.type.heavy ? 2.5 : 6); if (ws.ctx.stun) ws.ctx.stun(e, e.type.boss ? 0.9 : 1.6); }
      else if (!e.type.boss) { e.vel.addScaledVector(dir, e.type.heavy ? 3 : 9); if (ws.ctx.stagger) ws.ctx.stagger(e, e.type.heavy ? 0.7 : 1.3); }
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
