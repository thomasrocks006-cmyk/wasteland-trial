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

export function newAI(e) {
  return { mode: 'circle', t: 0, cd: rnd(0.8, 2.2), kind: null, token: false, stun: 0, resolved: false, guarding: false, circle: rnd(0, 1) > 0.5 ? 1 : -1, missed: false, tell: null, parry: 0, lastAttack: -9 };
}

/** an attack is over (or was broken): give back the token and cool down */
export function endAttack(mgr, e, cool = rnd(1.1, 2.4)) {
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

  // ---- in an attack
  if (ai.mode === 'tell' || ai.mode === 'strike' || ai.mode === 'recover') {
    if (!ATTACKS[ai.kind]) ai.kind = 'slash';
    const A = ATTACKS[ai.kind]; ai.t += dt; ai.guarding = ai.kind === 'bash' && ai.mode === 'tell';
    const v = e.view;
    if (ai.mode === 'tell') {
      out.speed = ai.kind === 'heavy' ? e.speed * 0.25 : 0;           // a heavy swing walks in as it winds up
      if ((ai.kind === 'heavy' || ai.kind === 'thrust') && dist > A.reach * 0.7) { out.mx = dirX; out.mz = dirZ; }     // walks in, but stops at striking distance
      const k = clamp(ai.t / ai.tellDur, 0, 1);
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
    if (!ai.kind) ai.kind = pickAttack(t, dist);
    ai.guarding = false;
    out.mx = dirX; out.mz = dirZ; out.speed = e.speed * 1.25;
    if (dist <= reach * 0.92 || (ai.t += dt) > 3.0) beginAttack(mgr, e, ai.kind, dirX, dirZ);
    return out;
  }
  ai.guarding = !!t.shield;                                         // a shield stays up while circling
  if (dist > ring + 1.2) { out.mx = dirX; out.mz = dirZ; }
  else {
    const o = Math.atan2(dirZ, dirX) + Math.PI / 2 * ai.circle, k = dist < ring - 0.6 ? -0.45 : 0.1;
    out.mx = Math.cos(o) * 0.55 + dirX * k; out.mz = Math.sin(o) * 0.55 + dirZ * k; out.speed *= 0.6;
    if (Math.random() < dt * 0.15) ai.circle *= -1;
  }
  if (ai.cd <= 0 && dist < ring + 1.4 && mgr.tokens.take(e, false)) {
    ai.token = true; ai.mode = 'close'; ai.t = 0;
    ai.kind = pickAttack(t, dist);
  }
  return out;
}

function pickAttack(t, dist) {
  const list = t.attacks || ['slash'];
  return list[Math.floor(Math.random() * list.length)];
}

function beginAttack(mgr, e, kind, dirX, dirZ) {
  if (!ATTACKS[kind]) kind = 'slash';
  const ai = e.ai, A = ATTACKS[kind];
  ai.kind = kind; ai.mode = 'tell'; ai.t = 0; ai.resolved = false; ai.missed = false;
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
