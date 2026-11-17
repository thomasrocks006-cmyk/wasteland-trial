import * as THREE from 'three';
import { clamp, rnd, angleTo, damp } from './core.js';

/* ================================================================ how soldiers fight
   The rule that makes a crowd fightable: only one or two soldiers attack at a time. The rest
   circle at a distance behind their shields, waiting for an attack token. An attacker closes,
   WINDS UP (you can read it: a raised blade, a marker over the head), strikes, and recovers,
   during which it is open. Every attack has an answer:

     slash / thrust  yellow marker  parry it (a fresh guard, just before it lands) or dodge
     heavy / bash    red marker     cannot be parried: dodge it, or take it on the shield
     shoot           bolt           dodge, or shield

   A parry or a broken guard leaves the soldier STUNNED and open to an execution. */

export const ATTACKS = {
  slash: { tell: 0.62, strike: 0.2, rec: 0.7, reach: 2.15, dmg: 1.0, parry: true, clip: 'Sword_Attack', c0: 0.0, c1: 0.28, c2: 0.62, c3: 1.0 },
  heavy: { tell: 0.98, strike: 0.26, rec: 1.0, reach: 2.7, dmg: 2.0, parry: false, clip: 'Sword_Attack', c0: 0.0, c1: 0.21, c2: 0.66, c3: 1.1, red: true },
  thrust: { tell: 0.72, strike: 0.16, rec: 0.8, reach: 3.2, dmg: 1.15, parry: true, clip: 'Punch_Cross', c0: 0.0, c1: 0.1, c2: 0.42, c3: 1.0 },
  bash: { tell: 0.52, strike: 0.16, rec: 0.9, reach: 1.9, dmg: 0.5, parry: false, clip: null, red: true },
  shoot: { tell: 1.0, strike: 0.12, rec: 1.2, reach: 22, dmg: 1.0, parry: false, clip: 'Spell_Simple_Shoot', c0: 0.0, c1: 0.1, c2: 0.4, c3: 0.5, ranged: true },
};

/** with the captured set loaded, the slash is a real cut (with a wind-up you can read) and the heavy a real overhead */
export function useCapturedAttacks(clips) {
  if (clips.Sword_Regular_B) Object.assign(ATTACKS.slash, { clip: 'Sword_Regular_B', c0: 0.0, c1: 0.2, c2: 0.36, c3: 0.53 });
  if (clips.Sword_Heavy_Combo) Object.assign(ATTACKS.heavy, { clip: 'Sword_Heavy_Combo', c0: 1.4, c1: 1.66, c2: 1.94, c3: 2.15 });
  if (clips.Shield_OneShot) Object.assign(ATTACKS.bash, { clip: 'Shield_OneShot', c0: 0.0, c1: 0.03, c2: 0.16, c3: 0.6 });
}

const _a = new THREE.Vector3(), _b = new THREE.Vector3();

export class Tokens {
  constructor() { this.melee = new Set(); this.ranged = new Set(); this.maxMelee = 2; this.maxRanged = 1; }
  take(e, ranged) {
    const set = ranged ? this.ranged : this.melee, max = ranged ? this.maxRanged : this.maxMelee;
    for (const o of set) if (!o.alive) set.delete(o);
    if (set.has(e)) return true;
    if (set.size >= max) return false;
    set.add(e); return true;
  }
  release(e) { this.melee.delete(e); this.ranged.delete(e); }
  clear() { this.melee.clear(); this.ranged.clear(); }
}

/* ---------------- reading the hero (b37)
   Every soldier shares one picture of how you fight, fading over about eight seconds: how much you stand behind
   the shield, how often you roll, how often you swing. They answer it: a turtle gets the red blows, a roller the
   long thrust. A winded hero draws a third blade. Men spread round you, and the ones at your back go first. */
export function observe(mgr, dt) {
  const pl = mgr.player, I = mgr.intel || (mgr.intel = { guard: 0, dodge: 0, swing: 0, wasDodge: false, wasSwing: false, swingEdge: false, slotYaw: 0 });
  const k = Math.exp(-dt / 8);
  I.guard = I.guard * k + (pl.guard ? dt : 0);
  const dg = pl.dodging > 0, sw = pl.threat === 'swing' || pl.threat === 'charge';
  I.dodge = I.dodge * k + (dg && !I.wasDodge ? 1 : 0);
  I.swingEdge = sw && !I.wasSwing;
  I.swing = I.swing * k + (I.swingEdge ? 1 : 0);
  I.wasDodge = dg; I.wasSwing = sw;
  mgr.tokens.maxMelee = (mgr.baseTokens || 2) + (pl.exhausted || (pl.hero && pl.hero.overlay && pl.hero.overlay.hit > 0.5) ? 1 : 0);
  // the ring turns slowly with him, so the slots do not whip round every time he looks about
  I.slotYaw = dampAngleTo(I.slotYaw, pl.yaw, 0.8, dt);
  let n = 0;
  for (const e of mgr.list) {
    if (!e.ai || !e.alive) continue;
    if (e.fear) e.fear = Math.max(0, e.fear - dt * 0.04);
    if (!e.type.ranged && !(e.passive && !e.aggro) && e.ai.mode !== 'flee') e.ringIdx = n++;
  }
  mgr.ringN = n;
}
function dampAngleTo(a, b, rate, dt) { return a + angleTo(a, b) * (1 - Math.exp(-rate * dt)); }

/** a man near a death is shaken; the captain's fall shakes them all. Past a point, they break and run. */
export function fearKill(mgr, dead) {
  const big = dead.type.key === 'captain' || dead.type.boss;
  for (const e of mgr.list) {
    if (!e.ai || !e.alive || e === dead) continue;
    const d = Math.hypot(e.pos.x - dead.pos.x, e.pos.z - dead.pos.z);
    if (d > (big ? 26 : 12)) continue;
    e.fear = (e.fear || 0) + (big ? 0.75 : 0.22 * (1 - d / 14));
  }
}

export function newAI(e) {
  return { mode: 'circle', t: 0, cd: rnd(0.8, 2.2), kind: null, token: false, stun: 0, resolved: false, guarding: false, circle: rnd(0, 1) > 0.5 ? 1 : -1, missed: false, tell: null, parry: 0, lastAttack: -9 };
}

/** an attack is over (or was broken): give back the token and cool down */
export function endAttack(mgr, e, cool = rnd(0.8, 1.9)) {
  const ai = e.ai; ai.mode = 'circle'; ai.t = 0; ai.cd = cool; ai.tell = null; ai.kind = null; ai.resolved = false; ai.token = false; ai.countered = false; ai.rebound = false;
  mgr.tokens.release(e);
  if (e.view) { e.view.setLayer(null); e.view.bash = 0; }
}

/** break whatever the soldier was doing: stunned and open */
export function stun(mgr, e, dur) {
  const ai = e.ai; if (!ai) return;
  endAttack(mgr, e, 0.8);
  ai.mode = 'stun'; ai.stun = Math.max(ai.stun, dur); ai.guarding = false;
  e.pendingHit = 0;
  if (e.view) e.view.stunned = true;
}

/**
 * One soldier's thinking for this frame. Returns the wanted movement (mx, mz unit-ish, speed); the caller does the
 * integration, collision and separation.
 */
export function think(mgr, e, dt, dist, dirX, dirZ, pp) {
  const t = e.type, ai = e.ai, pl = mgr.player;
  // a wounded man is slower on his feet (a beaten one more so)
  const hurt = e.hp < e.maxHp * 0.3 ? 0.68 : e.hp < e.maxHp * 0.55 ? 0.82 : 1;
  const out = { mx: 0, mz: 0, speed: e.speed * hurt, face: true };
  e.attackCd = 99;                                           // the old cooldown is not used by soldiers
  ai.cd -= dt;

  // ---- stunned: open, doing nothing
  if (ai.mode === 'stun') {
    ai.stun -= dt; ai.guarding = false; out.speed = 0; out.face = false;
    if (ai.stun <= 0) { ai.mode = 'circle'; ai.cd = rnd(0.4, 1.0); if (e.view) e.view.stunned = false; }
    return out;
  }

  // ---- broken: he runs, looking back, until he is well away or steadies
  if (ai.mode === 'flee') {
    ai.t += dt; ai.guarding = false; out.face = false;
    out.mx = -dirX; out.mz = -dirZ; out.speed = e.speed * 1.2;
    e.yaw = Math.atan2(-dirX, -dirZ);
    if (ai.t > 8 || dist > 32) { ai.mode = 'circle'; ai.cd = rnd(1.5, 3); e.fear = 0.35; }
    return out;
  }
  // ---- a quick step back out of a cut aimed at him
  if (ai.mode === 'evade') {
    ai.t += dt; out.mx = ai.ex; out.mz = ai.ez; out.speed = e.speed * 2.3;
    if (ai.t > 0.36) { ai.mode = 'circle'; ai.cd = Math.min(ai.cd, 0.5); }      // and comes straight back in
    return out;
  }
  if (e.courage === undefined) e.courage = rnd(0.55, 1.05);          // some men hold, some do not
  if ((ai.mode === 'circle' || ai.mode === 'close') && !t.boss && t.key !== 'captain' && (e.fear || 0) > e.courage) {
    endAttack(mgr, e, 2); ai.mode = 'flee'; ai.t = 0; if (mgr.onFlee) mgr.onFlee(e); return out;
  }
  const I = mgr.intel || {}, toE = Math.atan2(-dirX, -dirZ), inFront = Math.abs(angleTo(pl.yaw, toE)) < 0.8;
  if (ai.mode === 'circle' || ai.mode === 'close') {
    // a cut is coming at him: a quick man steps back out of it (not twice running)
    if (I.swingEdge && pl.threatTarget === e && t.parries && dist < 3.4 && (ai.evadeCd || 0) <= 0 && Math.random() < 0.3) {
      if (ai.mode === 'close') endAttack(mgr, e, 0.6);
      const side = Math.random() < 0.5 ? 1 : -1; ai.mode = 'evade'; ai.t = 0; ai.evadeCd = 3;
      ai.ex = -dirX * 0.85 + dirZ * side * 0.5; ai.ez = -dirZ * 0.85 - dirX * side * 0.5; return out;
    }
    // he is winding up something big in front of you: back off out of it, or brace the shield
    if (pl.threat === 'charge' && inFront && dist < 4.8) {
      if (ai.mode === 'close') endAttack(mgr, e, 0.8);
      ai.guarding = !!t.shield;
      if (!t.shield) { out.mx = -dirX; out.mz = -dirZ; out.speed = e.speed * 0.9; }
      return out;
    }
    // lightning: the unshielded get out from in front of the hand; a shield walks into it
    if (pl.casting && inFront && dist < 18) {
      if (t.shield) { ai.guarding = true; if (ai.mode === 'circle') { out.mx = dirX; out.mz = dirZ; out.speed = e.speed * 0.5; return out; } }
      else { const side = angleTo(pl.yaw, toE) > 0 ? 1 : -1; out.mx = dirZ * side; out.mz = -dirX * side; out.speed = e.speed * 1.1; return out; }
    }
  }
  ai.evadeCd = Math.max(0, (ai.evadeCd || 0) - dt);

  // ---- in an attack
  if (ai.mode === 'tell' || ai.mode === 'strike' || ai.mode === 'recover') {
    if (!ATTACKS[ai.kind]) ai.kind = 'slash';
    const A = ATTACKS[ai.kind]; ai.t += dt; ai.guarding = ai.kind === 'bash' && ai.mode === 'tell';
    const v = e.view;
    if (ai.mode === 'tell') {
      out.speed = ai.kind === 'heavy' ? e.speed * 0.25 : 0;           // a heavy swing walks in as it winds up
      if ((ai.kind === 'heavy' || ai.kind === 'thrust') && dist > A.reach * 0.7) { out.mx = dirX; out.mz = dirZ; }     // walks in, but stops at striking distance
      const k = clamp(ai.t / ai.tellDur, 0, 1);
      // a captain's feint: the yellow cut stops halfway and becomes a red overhead (an early parry is punished)
      if (ai.willFeint && k > 0.5) { beginAttack(mgr, e, 'heavy', dirX, dirZ); ai.feinted = true; ai.willFeint = false; return out; }
      if (v && A.clip) v.setLayer(A.clip, A.c0 + (A.c1 - A.c0) * k);
      if (v && ai.kind === 'bash') v.bash = k * 0.6;
      if (ai.t >= ai.tellDur) { ai.mode = 'strike'; ai.t = 0; ai.resolved = false; }
    } else if (ai.mode === 'strike') {
      out.speed = 0; out.face = false;
      const k = clamp(ai.t / A.strike, 0, 1);
      if (v && A.clip) v.setLayer(A.clip, A.c1 + (A.c2 - A.c1) * k);
      if (v && ai.kind === 'bash') v.bash = 0.6 + k * 0.5;
      if (!ai.resolved && ai.t >= A.strike * 0.35) { ai.resolved = true; resolve(mgr, e, dist, pp); }
      if (ai.t >= A.strike) { ai.mode = 'recover'; ai.t = 0; ai.tell = null; }
    } else {
      out.speed = 0; out.face = ai.t < 0.25;
      const recDur = A.rec * (ai.missed ? 1.35 : ai.rebound ? 1.3 : 1);
      const k = clamp(ai.t / recDur, 0, 1);
      // a blow that met your shield springs back up the way it came; otherwise it follows through
      if (v && A.clip) v.setLayer(A.clip, ai.rebound ? A.c1 + (ai.rebT0 - A.c1) * (1 - clamp(ai.t / 0.22, 0, 1)) : A.c2 + (A.c3 - A.c2) * k);
      if (v && ai.kind === 'bash') v.bash = 1.1 * (1 - k);
      if (ai.t >= recDur) endAttack(mgr, e);
    }
    return out;
  }

  // ---- ranged: hold the range, line up, shoot
  if (t.ranged) {
    const pref = 13, band = 4;
    ai.guarding = false;
    if (dist > pref + band) { out.mx = dirX; out.mz = dirZ; }
    else if (dist < pref - band) { out.mx = -dirX; out.mz = -dirZ; out.speed *= 0.8; }
    else { const o = Math.atan2(dirZ, dirX) + Math.PI / 2 * ai.circle; out.mx = Math.cos(o) * 0.5; out.mz = Math.sin(o) * 0.5; }
    if (ai.cd <= 0 && dist < 24 && !mgr.world.blocked(e.pos.x, e.pos.z, pp.x, pp.z) && mgr.tokens.take(e, true)) beginAttack(mgr, e, 'shoot', dirX, dirZ);
    return out;
  }

  // ---- melee: approach to the ring, circle behind the shield, close in when it is your turn
  const reach = t.reach || 2.1, ring = reach + 2.2 + (e.slot || 0) * 0.9;
  if (ai.mode === 'close') {
    if (!ai.kind) ai.kind = pickAttack(mgr, t, dist);
    ai.guarding = false;
    out.mx = dirX; out.mz = dirZ; out.speed = e.speed * 1.25;
    if (dist <= reach * 0.92 || (ai.t += dt) > 3.0) beginAttack(mgr, e, ai.kind, dirX, dirZ);
    return out;
  }
  ai.guarding = !!t.shield;                                         // a shield stays up while circling
  if (dist > ring + 1.2) { out.mx = dirX; out.mz = dirZ; }
  else {
    // each man works round to his own place on the ring; the middle places are at the hero's back
    const n = Math.max(mgr.ringN || 1, 1), idx = e.ringIdx || 0;
    const slot = (I.slotYaw || 0) + Math.PI + (n > 1 ? (idx - (n - 1) / 2) * Math.min(1.1, (Math.PI * 2) / Math.max(n, 3)) : 0);
    const off = angleTo(toE, slot);                                       // how far round he still has to go
    const tang = clamp(off * 1.6, -1, 1), rad = dist < ring - 0.6 ? -0.45 : dist > ring + 0.4 ? 0.35 : 0;
    // tangent to the ring at his angle (turning the ring direction by a quarter)
    const tx = -dirZ, tz = dirX;
    out.mx = tx * tang * 0.8 + dirX * rad; out.mz = tz * tang * 0.8 + dirZ * rad;
    if (Math.abs(off) < 0.15) { out.mx += tx * ai.circle * 0.15; out.mz += tz * ai.circle * 0.15; if (Math.random() < dt * 0.2) ai.circle *= -1; }
    out.speed *= Math.abs(off) > 0.5 ? 0.85 : 0.55;
  }
  // a man at the hero's back gets his turn sooner
  if (!inFront && Math.abs(angleTo(pl.yaw + Math.PI, toE)) < 1.0) ai.cd -= dt * 0.6;
  if (ai.cd <= 0 && dist < ring + 1.4 && mgr.tokens.take(e, false)) {
    ai.token = true; ai.mode = 'close'; ai.t = 0;
    ai.kind = pickAttack(mgr, t, dist);
  }
  return out;
}

/** the attack that answers how he has been fighting (see observe) */
function pickAttack(mgr, t, dist) {
  const list = (t.attacks || ['slash']).slice(), I = mgr.intel || {};
  if ((I.guard || 0) > 3 && !list.includes('heavy') && !t.ranged) list.push('heavy');       // he hides behind the shield: go over it
  const w = list.map((k) => {
    let s = 1;
    if ((I.guard || 0) > 2.5 && ATTACKS[k] && ATTACKS[k].red) s += Math.min(3, I.guard / 2);
    if ((I.dodge || 0) > 2 && k === 'thrust') s += 1.5;
    if ((I.swing || 0) > 5 && k === 'slash') s += 0.6;                       // he trades blows: meet him quick
    return s;
  });
  let r = Math.random() * w.reduce((x, y) => x + y, 0);
  for (let i = 0; i < list.length; i++) { r -= w[i]; if (r <= 0) return list[i]; }
  return list[0];
}

function beginAttack(mgr, e, kind, dirX, dirZ) {
  if (!ATTACKS[kind]) kind = 'slash';
  const ai = e.ai, A = ATTACKS[kind];
  ai.kind = kind; ai.mode = 'tell'; ai.t = 0; ai.resolved = false; ai.missed = false; ai.feinted = false;
  ai.willFeint = kind === 'slash' && !!e.type.feints && Math.random() < e.type.feints;      // decided once, at the start of the blow
  ai.tellDur = A.tell * (e.type.boss ? 0.85 : 1) * (e.tellScale || 1) * (e.hp < e.maxHp * 0.5 ? 1.12 : 1);
  ai.tell = { kind, red: !!A.red, parry: A.parry };
  ai.guarding = kind === 'bash';
  if (mgr.audio && mgr.audio.click) mgr.audio.click(0, 0.12, A.red ? 190 : 640);      // the cue: a short metallic draw
}

/** the moment of the blow */
function resolve(mgr, e, dist, pp) {
  const ai = e.ai, A = ATTACKS[ai.kind], pl = mgr.player, t = e.type;
  if (A.ranged) { e.attackCd = 0; mgr.fireProjectile(e, pp, 1); e.attackCd = 99; return; }
  const dx = pp.x - e.pos.x, dz = pp.z - e.pos.z, d = Math.hypot(dx, dz);
  // a countered blow: the hero turned to meet it and takes it on the blade (no facing or reach check: he came to it)
  if (ai.countered && pl.alive && d < A.reach + 1.6) {
    ai.countered = false; ai.rebound = true; ai.rebT0 = A.c1 + ((A.c2 || 0) - A.c1) * 0.35;
    if (mgr.onCountered) mgr.onCountered(e);
    return;
  }
  const facing = Math.abs(angleTo(e.yaw, Math.atan2(dx, dz))) < 1.0;
  if (!pl.alive || !facing || d > A.reach + 0.4) { ai.missed = true; mgr.whiff && mgr.whiff(e); return; }
  const before = pl.hp;
  pl.lastDefence = null;
  pl.damage(e.dmg * A.dmg, e.pos.x, e.pos.z, e, ai.kind);
  if (pl.lastDefence === 'block' || pl.lastDefence === 'parry') { ai.rebound = true; ai.rebT0 = A.c1 + ((A.c2 || 0) - A.c1) * 0.35; }
  if (pl.hp < before && pl.onHurt) pl.onHurt();
  if (ai.kind === 'bash' || ai.kind === 'heavy') pl.knock.add(_a.set(dx / (d || 1), 0, dz / (d || 1)).multiplyScalar(ai.kind === 'heavy' ? 11 : 7));
  else pl.knock.add(_a.set(dx / (d || 1), 0, dz / (d || 1)).multiplyScalar(3.2));
}
