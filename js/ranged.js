/* Thrown spears and arrows (b40): real projectiles, not hit-scan.
   - Tap: loose at the nearest man in front (leading him a little). Hold: the camera comes in over the shoulder, a
     crosshair shows, and release looses along it (a narrow assist cone). The bow's draw builds power over 0.7 s.
   - Each missile flies with gravity, is swept against every man's body spheres (legs, chest, head) and the ground and
     what stands on it. A raised shield turns an arrow from the front; a spear breaks the guard. They stick where they
     strike: in a man (and ride with him), in the ground, in a tree.
   - The hero's arms are placed by IK (hero.setArm): the spear cocked back over the shoulder then whipped forward; the
     bow held out in the left hand with the right drawing the string to the cheek. */
import * as THREE from 'three';
import { clamp, rnd, terrainHeight, angleTo } from './core.js';

const G = 9.8;
const KIND = {
  spear: { speed: 30, grav: 1.0, dmg: 90, head: 1.6, breaks: true, life: 9, quick: 0.18, drawFull: 0.3 },
  bow: { speed: 34, speedFull: 68, grav: 0.55, dmg: 28, dmgFull: 78, head: 2.4, breaks: false, life: 9, quick: 0.18, drawFull: 0.7 },
};
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _q = new THREE.Quaternion(), DOWN = new THREE.Vector3(0, -1, 0);

function arrowMesh() {
  const g = new THREE.Group(), wood = new THREE.MeshStandardMaterial({ color: 0x6b4f33, roughness: 0.8 }), iron = new THREE.MeshStandardMaterial({ color: 0x5b5b5e, roughness: 0.4, metalness: 0.7 });
  const feather = new THREE.MeshStandardMaterial({ color: 0xe8e2d4, roughness: 0.9, side: THREE.DoubleSide });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.78, 5), wood); shaft.position.y = -0.2;
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.07, 4), iron); head.rotation.x = Math.PI; head.position.y = -0.62;
  g.add(shaft, head);
  for (let k = 0; k < 3; k++) { const f = new THREE.Mesh(new THREE.PlaneGeometry(0.03, 0.11), feather); f.position.y = 0.13; f.rotation.y = k * Math.PI * 2 / 3; f.translateX(0.015); g.add(f); }
  return g;     // like the weapon models: -y is the point
}

function bowMesh() {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x4a3322, roughness: 0.6 }), leather = new THREE.MeshStandardMaterial({ color: 0x2a1c12, roughness: 0.9 });
  // the stave: a flat recurved arc in the bow's own x/y plane, grip at the origin, x toward the target
  const curve = new THREE.CatmullRomCurve3([[-0.06, -0.72], [0.02, -0.55], [0.07, -0.3], [0.06, 0], [0.07, 0.3], [0.02, 0.55], [-0.06, 0.72]].map(([x, y]) => new THREE.Vector3(x, y, 0)));
  const stave = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.016, 6), wood);
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.14, 8), leather); grip.position.x = 0.06;
  g.add(stave, grip);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
  const string = new THREE.Line(sg, new THREE.LineBasicMaterial({ color: 0xd9d2c0 })); string.frustumCulled = false;
  return { g, string, tipTop: new THREE.Vector3(-0.06, 0.72, 0), tipBot: new THREE.Vector3(-0.06, -0.72, 0) };
}

export class Ranged {
  constructor(ws, scene) {
    this.ws = ws; this.scene = scene;
    this.list = [];
    this.held = false; this.t = 0; this.whip = 0;
    this.arrowProto = arrowMesh();
    const bow = bowMesh(); this.bow = bow; scene.add(bow.g, bow.string); bow.g.visible = bow.string.visible = false;
    this.nocked = arrowMesh(); scene.add(this.nocked); this.nocked.visible = false;
  }
  get pl() { return this.ws.player; }
  get hero() { return this.ws.player.hero; }
  get kind() { return this.ws.def.ranged; }
  get aiming() { return this.held && this.t > KIND[this.kind].quick; }
  get draw() { return this.held ? clamp(this.t / KIND[this.kind].drawFull, 0, 1) : 0; }

  input(held, dt, camera) {
    const ws = this.ws;
    if (!this.kind) return;
    if (held && !this.held) {
      if (!ws.drawn || ws.drawT > 0) { ws.draw(); return; }
      if (ws.reloading || ws.ammo.mag <= 0 || this.whip > 0) { if (ws.ammo.mag <= 0) ws.tryReload(); return; }
      this.held = true; this.t = 0; ws.idleT = 0;
      if (ws.audio.click) ws.audio.click(0, 0.12, this.kind === 'bow' ? 900 : 300);
    } else if (held && this.held) { this.t += dt; ws.idleT = 0; }
    else if (!held && this.held) { this.held = false; this.loose(camera); }
  }

  /** where the shot should go: the crosshair (with a narrow assist) when aimed, the nearest man in front on a tap */
  aimPoint(camera, from, speed) {
    const pl = this.pl, list = this.ws.ctx.enemies() || [], aimed = this.t > KIND[this.kind].quick;
    camera.getWorldDirection(_a);
    let best = null, bs = aimed ? Math.cos(0.07) : -1;
    for (const e of list) {
      if (!e.alive || e.state === 'spawn') continue;
      const c = _b.set(e.pos.x, e.pos.y + e.type.height * 0.62, e.pos.z);
      const d = c.distanceTo(pl.pos); if (d > (aimed ? 90 : 38)) continue;
      if (aimed) { const dot = _c.copy(c).sub(camera.position).normalize().dot(_a); if (dot > bs) { bs = dot; best = e; } }
      else { const off = Math.abs(angleTo(pl.camYaw, Math.atan2(e.pos.x - pl.pos.x, e.pos.z - pl.pos.z))); const sc = -(d * 0.05 + off * 2); if (off < 0.7 && sc > bs) { bs = sc; best = e; } }
    }
    if (best) {
      const c = new THREE.Vector3(best.pos.x, best.pos.y + best.type.height * 0.62, best.pos.z), t = c.distanceTo(from) / speed;
      if (best.vel) c.addScaledVector(best.vel, t * 0.8);          // lead a running man
      return c;
    }
    // nothing to help with: along the crosshair, out to the first hill or 70 m
    const hit = this.ws.ctx.worldHit ? this.ws.ctx.worldHit(camera.position, _a, 70) : null;
    return hit ? hit.clone() : camera.position.clone().addScaledVector(_a, 70);
  }

  loose(camera) {
    const ws = this.ws, K = KIND[this.kind], pl = this.pl, h = this.hero;
    if (ws.ammo.mag <= 0) { ws.tryReload(); return; }
    const draw = this.kind === 'bow' ? clamp(this.t / K.drawFull, 0.25, 1) : 1;
    const speed = this.kind === 'bow' ? K.speed + (K.speedFull - K.speed) * draw : K.speed;
    const from = this.launchPoint(new THREE.Vector3());
    const target = this.aimPoint(camera, from, speed);
    // a ballistic shot: straight at the target, raised by the drop over the flight time
    const dir = target.clone().sub(from), dist = dir.length(); dir.normalize();
    const tFlight = dist / speed, vel = dir.multiplyScalar(speed); vel.y += 0.5 * G * K.grav * tFlight;
    const mesh = this.kind === 'spear' ? ws.models[ws.index].clone() : this.arrowProto.clone();
    mesh.visible = true; this.scene.add(mesh);
    const dmg = (this.kind === 'bow' ? K.dmg + (K.dmgFull - K.dmg) * draw : K.dmg) * ws.mods.dmg * (pl.dmgMul || 1);
    this.list.push({ kind: this.kind, mesh, pos: from.clone(), vel, life: K.life, dmg, stuck: null, done: false, hit: new Set() });
    ws.ammo.mag--; ws.shotsFired++;
    pl.faceOverride = { yaw: Math.atan2(target.x - pl.pos.x, target.z - pl.pos.z), t: 0.35 };
    if (this.kind === 'spear') { this.whip = 0.22; pl.knock.addScaledVector(_a.set(Math.sin(pl.yaw), 0, Math.cos(pl.yaw)), 2.5); ws.handHidden = 0.55; ws.syncModel(); }
    else this.whip = 0.12;
    if (ws.audio.shot) ws.audio.shot(this.kind === 'spear' ? 'spear' : 'draw', 0);
    if (ws.audio.impact) ws.audio.impact('whoosh', this.kind === 'spear' ? 0.7 : 0.4);
    if (ws.onFired) ws.onFired(ws.def);
    if (ws.ammo.mag <= 0) ws.tryReload();
    if (ws.ctx.onAmmo) ws.ctx.onAmmo();
  }

  /** the spear leaves the right hand; the arrow leaves the bow at the grip */
  launchPoint(out) {
    const h = this.hero;
    if (!h) return out.copy(this.pl.pos).add(_a.set(0, 1.5, 0));
    if (this.kind === 'bow') { h.handL.updateWorldMatrix(true, false); return h.handL.getWorldPosition(out).add(_a.set(0, 0.05, 0)); }
    h.handR.updateWorldMatrix(true, false); return h.handR.getWorldPosition(out).add(_a.set(0, 0.1, 0));
  }

  update(dt, camera) {
    this.whip = Math.max(0, this.whip - dt);
    this.pose(dt, camera);
    for (const m of this.list) this.step(m, dt);
    if (this.list.some((m) => m.done)) this.list = this.list.filter((m) => { if (m.done) { m.mesh.removeFromParent(); } return !m.done; });
  }

  step(m, dt) {
    m.life -= dt;
    if (m.life <= 0) { m.done = true; return; }
    if (m.stuck) {      // riding in a man (or lying where it fell)
      const s = m.stuck;
      if (s.e) { if (s.e.dying > 3.6) { m.done = true; return; } const c = Math.cos(s.e.yaw - s.yaw0), sn = Math.sin(s.e.yaw - s.yaw0); m.mesh.position.set(s.e.pos.x + s.off.x * c + s.off.z * sn, s.e.pos.y + s.off.y, s.e.pos.z - s.off.x * sn + s.off.z * c); }
      if (m.life < 1) m.mesh.scale.setScalar(m.life);
      return;
    }
    const K = KIND[m.kind], p0 = _a.copy(m.pos);
    m.vel.y -= G * K.grav * dt;
    const p1 = _b.copy(p0).addScaledVector(m.vel, dt);
    // men: the first body sphere along the step
    const ws = this.ws, melee = ws.melee;
    let hit = null, ht = 2;
    for (const e of (ws.ctx.enemies() || [])) {
      if (!e.alive || e.state === 'spawn' || m.hit.has(e)) continue;
      if (Math.hypot(e.pos.x - p0.x, e.pos.z - p0.z) > 4 + m.vel.length() * dt) continue;
      for (const sp of melee.spheres(e)) {
        const t = segSphere(p0, p1, sp.c, sp.r + 0.05);
        if (t !== null && t < ht) { ht = t; hit = { e, head: sp.head }; }
      }
    }
    if (hit) {
      const at = p0.clone().lerp(p1, ht), dir = m.vel.clone().normalize();
      m.hit.add(hit.e);
      const lethal = hit.e.hp - m.dmg * (hit.head ? K.head : 1) <= 0;
      if (lethal && m.kind === 'spear') hit.e.blast = new THREE.Vector3(dir.x * 7, 3.5, dir.z * 7);       // a spear carries him back
      const res = ws.ctx.applyDamage(hit.e, m.dmg * (hit.head ? K.head : 1), at.clone(), dir, hit.head, ws.def, { breaks: K.breaks, heavy: K.breaks });
      if (res === 'blocked') {   // off the shield: it drops
        m.vel.set(-dir.x * 1.5 + rnd(-1.5, 1.5), 2.5, -dir.z * 1.5 + rnd(-1.5, 1.5)); m.pos.copy(at); this.orient(m); if (ws.audio.impact) ws.audio.impact('shield', 0.6); if (ws.fx.spark) ws.fx.spark(at, dir.clone().negate(), 0xffe0a0, 6, 4, 0.06, 0.2); return;
      }
      if (ws.fx.bleed && hit.e.type.blood !== false) ws.fx.bleed(at, dir, m.kind === 'spear' ? 1.2 : 0.6);
      if (ws.audio.impact) ws.audio.impact('flesh', m.kind === 'spear' ? 1.2 : 0.7);
      if (ws.ctx.onShot) ws.ctx.onShot(true, hit.head);
      ws.shotsHit++;
      if (hit.e.alive && m.kind === 'spear' && ws.ctx.stun) ws.ctx.stun(hit.e, 1.1);
      if (hit.head && ws.ctx.onMeleeHit) ws.ctx.onMeleeHit(1, true, false, 0.06);
      // it stays in him, riding with him
      m.pos.copy(at); this.orient(m);
      m.mesh.position.addScaledVector(dir, 0.18);
      const off = m.mesh.position.clone().sub(hit.e.pos);
      m.stuck = { e: hit.e, off, yaw0: hit.e.yaw }; m.life = Math.min(m.life, 8);
      return;
    }
    // the ground, or a rock or trunk standing on it
    const g = terrainHeight(p1.x, p1.z);
    let wall = false;
    for (const o of ws.ctx.obstacles ? ws.ctx.obstacles() : []) { const dx = p1.x - o.x, dz = p1.z - o.z; if (dx * dx + dz * dz < o.r * o.r && (o.h === undefined || p1.y < terrainHeight(o.x, o.z) + o.h)) { wall = true; break; } }
    if (p1.y <= g || wall) {
      m.pos.copy(p1); if (p1.y < g) m.pos.y = g + 0.02;
      this.orient(m); m.mesh.position.addScaledVector(m.vel.clone().normalize(), 0.12);
      m.stuck = { e: null }; m.life = 10;
      if (ws.fx.puff) ws.fx.puff(m.pos.clone(), null, 0xa5835c, 0.25, 2, 0.5, 0.8);
      if (ws.audio.impact) ws.audio.impact(wall ? 'shield' : 'whoosh', 0.3);
      return;
    }
    m.pos.copy(p1); this.orient(m);
  }
  orient(m) { m.mesh.position.copy(m.pos); m.mesh.quaternion.setFromUnitVectors(DOWN, _c.copy(m.vel).normalize()); }

  /** the arms: a spear cocked over the shoulder (and whipped through on release), a bow held out and drawn */
  pose(dt, camera) {
    const h = this.hero, ws = this.ws, kind = this.kind, inHand = ws.drawn && kind;
    const bowOut = inHand && kind === 'bow';
    this.bow.g.visible = this.bow.string.visible = !!bowOut;
    if (h) { h.shield.visible = !bowOut; }
    if (!h) return;
    if (!inHand) { h.setArm('L', null); h.setArm('R', null); this.nocked.visible = false; return; }
    camera.getWorldDirection(_a); _a.y = clamp(_a.y, -0.4, 0.5); _a.normalize();
    const bq = h.root.getWorldQuaternion(_q), up = _b.set(0, 1, 0), side = _c.set(-1, 0, 0).applyQuaternion(bq);      // the hero's right
    const shR = h.P(h.upperR), shL = h.P(h.upperL);
    if (kind === 'spear') {
      h.setArm('L', null);
      if (this.held) {
        const k = clamp(this.t / 0.18, 0, 1);         // cocked: hand back and up past the shoulder, point to the target
        h.setArm('R', shR.clone().addScaledVector(_a, -0.32 * k).addScaledVector(up, 0.12 + 0.12 * k).addScaledVector(side, 0.08), 22, _a.clone().addScaledVector(up, 0.12));
      } else if (this.whip > 0) {
        h.setArm('R', shR.clone().addScaledVector(_a, 0.62).addScaledVector(up, 0.05), 40, _a.clone());    // thrown through
      } else h.setArm('R', null);
      this.nocked.visible = false;
      return;
    }
    // the bow: left arm out toward the aim, the right hand drawing to the cheek
    const draw = this.held ? clamp(this.t / KIND.bow.drawFull, 0, 1) : 0, holding = this.held || this.whip > 0;
    h.setArm('L', holding ? shL.clone().addScaledVector(_a, 0.6).addScaledVector(up, 0.04) : null, 18);
    const grip = h.P(h.handL);
    h.setArm('R', this.held ? grip.clone().lerp(h.P(h.headBone).addScaledVector(side, 0.06).addScaledVector(up, -0.05), 0.15 + 0.85 * draw) : null, 20);
    // the bow itself in world space: stave upright, its belly toward the target
    const fwd = holding ? _a.clone() : new THREE.Vector3(0, 0, 1).applyQuaternion(bq), X = fwd.clone().setY(holding ? fwd.y : 0).normalize(), Y = up.clone().addScaledVector(X, -X.dot(up)).normalize(), Z = new THREE.Vector3().crossVectors(X, Y);
    const B = this.bow.g; B.position.copy(grip); B.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z));
    if (!holding) B.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -1.2));     // carried low at the side
    B.updateMatrixWorld(true);
    const top = B.localToWorld(this.bow.tipTop.clone()), bot = B.localToWorld(this.bow.tipBot.clone());
    const nock = this.held ? h.P(h.handR) : top.clone().lerp(bot, 0.5);
    const P = this.bow.string.geometry.attributes.position.array;
    [top, nock, bot].forEach((v, i) => { P[i * 3] = v.x; P[i * 3 + 1] = v.y; P[i * 3 + 2] = v.z; });
    this.bow.string.geometry.attributes.position.needsUpdate = true;
    // the arrow on the string while drawing
    this.nocked.visible = this.held;
    if (this.held) { this.nocked.position.copy(nock); this.nocked.quaternion.setFromUnitVectors(DOWN, grip.clone().sub(nock).normalize()); this.nocked.translateY(-0.2); }
  }
}

/** first t in [0,1] where segment a->b enters a sphere (c, r), or null */
function segSphere(a, b, c, r) {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, fx = a.x - c.x, fy = a.y - c.y, fz = a.z - c.z;
  const A = dx * dx + dy * dy + dz * dz, B = 2 * (fx * dx + fy * dy + fz * dz), C = fx * fx + fy * fy + fz * fz - r * r;
  if (C <= 0) return 0;
  const disc = B * B - 4 * A * C; if (disc < 0 || A < 1e-9) return null;
  const t = (-B - Math.sqrt(disc)) / (2 * A);
  return t >= 0 && t <= 1 ? t : null;
}
