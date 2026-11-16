import * as THREE from 'three';
import { clamp, angleTo, terrainHeight } from './core.js';

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
   - Freeflow: steer toward someone and attack, and you close the gap and strike them; the next press
     can be a different man. Hits build FLOW; a full flow, or a stunned or beaten soldier, offers a
     finishing move: four executions, each with a kill-cam, that heal you.
   - A shield soldier's front is closed to light blows (they ring off): break it with a heavy blow,
     a shield bash, or by going round behind him.
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
    this.exec = null;          // a finishing move in progress
    this.flow = 0; this.flowT = 0;
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
    if (this.exec) return;
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
    const t = this.target(7, 2.6);
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
    this.atk = null; this.hero.holdLayer(false); this.hero.stopLayer(); this.pl.moveMul = 1; this.ws.swingT = 0;
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
    if (this.exec) { this.runExec(dt); return; }
    if (this.flow > 0) { this.flowT -= dt; if (this.flowT <= 0) this.breakFlow(); }
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
    if (a.truncate && t > S.s0 + 0.12) { this.finish(); return; }
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
    const dmg = S.dmg * ws.mods.dmg * (S.heavy ? ws.mods.heavy : 1) * (pl.dmgMul || 1) * rip * (head ? 1.25 : 1);
    const res = ws.ctx.applyDamage(e, dmg, point.clone(), dir, !!S.finisher || head, ws.def, { heavy: !!S.heavy, breaks: !!S.heavy, riposte: rip > 1 });
    if (res === 'blocked') {
      // the blow rings off a shield or a blade: the swing is checked and you are thrown back a step
      pl.knock.addScaledVector(dir, -4.2); pl.shake = Math.min(2, pl.shake + 0.25);
      a.truncate = true; this.flow = Math.max(0, this.flow - 1);
      if (ws.ctx.onMeleeHit) ws.ctx.onMeleeHit(1, false, false, 0.07);
      if (ws.ctx.onBlockedByFoe) ws.ctx.onBlockedByFoe(e);
      return;
    }
    if (rip > 1) { pl.riposteT = 0; if (ws.ctx.onRiposte) ws.ctx.onRiposte(); }
    if (!e.type.boss && e.alive && !e.ai) {
      const heavyFoe = e.type.heavy ? 0.4 : 1;
      e.vel.addScaledVector(dir, S.kb * heavyFoe);
      if (ws.ctx.stagger) ws.ctx.stagger(e, S.stag * (e.type.heavy ? 0.5 : 1));
    } else if (e.ai && e.alive) e.vel.addScaledVector(dir, S.kb * (e.type.heavy ? 0.3 : 0.8));
    pl.shake = Math.min(2.2, pl.shake + S.shake);
    ws.shotsHit++;
    if (ws.audio.clang) ws.audio.clang(1, !!S.finisher);
    if (ws.ctx.onMeleeHit) ws.ctx.onMeleeHit(1, !!S.finisher, !!S.heavy, S.stop);
    if (S.slam && ws.fx.ring) ws.fx.ring(new THREE.Vector3(point.x, point.y - 0.6, point.z), ws.def.color, 2.4 + (S.heavy ? 1.2 : 0), 0.35);
    if (ws.ctx.onShot) ws.ctx.onShot(true, false);
    this.addFlow(1);
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
  canExecute() { return !this.exec && !this.atk && this.pl.alive ? this.execTarget() : null; }

  execute() {
    const t = this.canExecute();
    if (!t) return false;
    this.startExec(t);
    return true;
  }

  startExec(e) {
    const pl = this.pl, ws = this.ws, h = this.hero;
    const bearing = Math.atan2(pl.pos.x - e.pos.x, pl.pos.z - e.pos.z), behind = Math.abs(angleTo(e.yaw, bearing)) > 2.2;
    const list = behind ? ['thrust', 'overhead'] : ['overhead', 'thrust', 'roll', 'slam'];
    this.execIdx = (this.execIdx || 0) + 1;
    const v = list[this.execIdx % list.length];
    const usedFlow = this.flowReady && !(ws.ctx.isExecutable && ws.ctx.isExecutable(e));
    this.atk = null; h.stopLayer(); h.holdLayer(false);
    pl.execLock = true; pl.iframe = Math.max(pl.iframe, 5); pl.moveMul = 0; pl.guard = false;
    if (e.ai) { e.ai.mode = 'stun'; e.ai.stun = 9; e.ai.guarding = false; if (e.view) e.view.stunned = true; this.ws.ctx.releaseToken && this.ws.ctx.releaseToken(e); }
    const from = pl.pos.clone();
    const away = _a.set(from.x - e.pos.x, 0, from.z - e.pos.z); const dl = away.length() || 1; away.multiplyScalar(1 / dl);
    this.exec = { e, v, t: 0, killed: false, from, away: away.clone(), stage: 0, usedFlow };
    pl.camCue = { dist: v === 'roll' ? 0.7 : 0.58, shoulder: v === 'overhead' ? -1.0 : 0.9, height: -0.2, fov: 0.78, t: 2.0 };
    if (ws.audio.roar) ws.audio.roar(5);
    if (ws.ctx.onExecStart) ws.ctx.onExecStart(v, e);
  }

  runExec(dt) {
    const x = this.exec, pl = this.pl, h = this.hero, ws = this.ws, e = x.e;
    if (!pl.alive || (!e.alive && !x.killed)) return this.endExec(false);
    x.t += dt;
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

  /** a new run: drop any swing, finishing move, flow or bash still in flight */
  reset() {
    if (this.exec) this.endExec(false);
    this.atk = null; this.bashT = 0; this.breakFlow(); this.hero.stopLayer(); this.pl.moveMul = 1;
  }

  endExec(ok) {
    const pl = this.pl, h = this.hero;
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
