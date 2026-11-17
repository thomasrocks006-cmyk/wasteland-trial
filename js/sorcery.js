/* The Storm: lightning from the open hand, held to channel.
   Bolts are fractal (midpoint displacement) with forks, drawn as camera-facing ribbons in one
   additive mesh (white-hot core, blue glow, violet haze), regrown ~22 times a second so they crawl.
   Up to three men in front take it and it leaps on to whoever stands close by; a raised shield
   soaks most of it until the arm gives. One light, made at load, so nothing compiles on first use. */
import * as THREE from 'three';
import { clamp, rnd, terrainHeight, angleTo } from './core.js';

const MAXQ = 2400;                       // ribbon quads per frame
const RANGE = 17, CONE = 0.6, CHAIN = 6;  // metres, half-angle (rad), leap distance
const DPS = 80, TICK = 0.14;
export const MANA_MAX = 100;
const DRAIN = 30, REGEN = 11, START_MIN = 14;

const VS = `attribute float side; attribute vec4 tint; varying float vS; varying vec4 vT;
void main(){ vS = side; vT = tint; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FS = `varying float vS; varying vec4 vT;
void main(){ float k = 1.0 - abs(vS); k = k * k * (3.0 - 2.0 * k); gl_FragColor = vec4(vT.rgb * vT.a * k, 1.0); }`;

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

function perp(d, out) {
  // a random unit vector at right angles to d
  out.set(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)); out.crossVectors(d, out);
  if (out.lengthSq() < 1e-6) out.crossVectors(d, UP);
  return out.normalize();
}
/** a jagged path from a to b: each level halves the segments' length and the sideways throw */
function jag(a, b, levels, rough) {
  let pts = [a.clone(), b.clone()];
  let off = a.distanceTo(b) * rough;
  for (let l = 0; l < levels; l++) {
    const np = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const p = pts[i], q = pts[i + 1];
      _d.subVectors(q, p).normalize();
      const m = p.clone().add(q).multiplyScalar(0.5).addScaledVector(perp(_d, _s), rnd(-off, off));
      np.push(m, q);
    }
    pts = np; off *= 0.52;
  }
  return pts;
}

export class Storm {
  constructor(scene, camera, ctx) {
    this.scene = scene; this.camera = camera; this.ctx = ctx;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(MAXQ * 4 * 3); this.side = new Float32Array(MAXQ * 4); this.tint = new Float32Array(MAXQ * 4 * 4);
    const idx = new Uint16Array(MAXQ * 6);
    for (let q = 0; q < MAXQ; q++) { const v = q * 4, i = q * 6; idx[i] = v; idx[i + 1] = v + 1; idx[i + 2] = v + 2; idx[i + 3] = v; idx[i + 4] = v + 2; idx[i + 5] = v + 3; this.side.set([-1, 1, 1, -1], v); }
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('side', new THREE.BufferAttribute(this.side, 1));
    g.setAttribute('tint', new THREE.BufferAttribute(this.tint, 4).setUsage(THREE.DynamicDrawUsage));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.setDrawRange(0, 0);
    this.geo = g;
    this.mesh = new THREE.Mesh(g, new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 5;
    scene.add(this.mesh);
    // the palm's glare
    const cv = document.createElement('canvas'); cv.width = cv.height = 64; const x = cv.getContext('2d');
    const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(170,190,255,.8)'); gr.addColorStop(1, 'rgba(90,80,255,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
    this.glare = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
    this.glare.visible = false; this.glare.renderOrder = 6; scene.add(this.glare);
    // one light for the whole storm, in the scene from the start (a light added later recompiles every material)
    this.light = new THREE.PointLight(0x9fb4ff, 0, 16, 2); scene.add(this.light);
    this.bolts = [];        // { pts, w, a }
    this.regrow = 0; this.tick = 0; this.on = 0; this.casting = false; this.hits = []; this.scorch = 0; this.ground = null;
  }

  /** start or continue channelling; false if there is not enough spirit to begin */
  canStart(pl) { return pl.mana >= START_MIN; }

  /**
   * want: the button is held. hand: the palm in world space. aim: unit vector the camera looks along.
   * Returns true while lightning is flowing.
   */
  update(dt, want, pl, hand, aim) {
    if (want && !this.casting && this.canStart(pl)) { this.casting = true; this.regrow = 0; this.tick = 0; if (this.ctx.onStart) this.ctx.onStart(); }
    if (this.casting && (!want || pl.mana <= 0)) { this.casting = false; if (this.ctx.onStop) this.ctx.onStop(); }
    if (this.casting) pl.mana = Math.max(0, pl.mana - DRAIN * dt), pl.manaWait = 1.1;
    else { pl.manaWait = Math.max(0, (pl.manaWait || 0) - dt); if (pl.manaWait <= 0) pl.mana = Math.min(MANA_MAX, pl.mana + REGEN * dt); }
    this.on = clamp(this.on + (this.casting ? dt * 14 : -dt * 9), 0, 1);
    if (this.on <= 0) { this.geo.setDrawRange(0, 0); this.glare.visible = false; this.light.intensity = 0; this.hits.length = 0; return false; }

    // ---- who it finds
    if (this.casting) {
      this.regrow -= dt; this.tick -= dt;
      if (this.regrow <= 0) { this.regrow = rnd(0.035, 0.06); this.pickTargets(pl, hand, aim); this.grow(hand, aim); }
      if (this.tick <= 0) { this.tick = TICK; this.strike(pl, hand); }
    }
    // ---- draw
    this.draw(hand);
    const fl = 0.55 + Math.random() * 0.45;
    this.glare.visible = true; this.glare.position.copy(hand);
    this.glare.scale.setScalar((0.55 + Math.random() * 0.35) * this.on);
    this.glare.material.opacity = this.on;
    const far = this.hits.length ? this.hits[0].at : (this.ground || hand);
    this.light.position.lerpVectors(hand, far, 0.35);
    this.light.intensity = 7 * fl * this.on;
    return this.casting;
  }

  pickTargets(pl, hand, aim) {
    const list = this.ctx.enemies(), yaw = Math.atan2(aim.x, aim.z);
    const cand = [];
    for (const e of list) {
      if (!e.alive || e.state === 'spawn' || e.dying) continue;
      const dx = e.pos.x - pl.pos.x, dz = e.pos.z - pl.pos.z, d = Math.hypot(dx, dz);
      if (d > RANGE || d < 0.3) continue;
      const off = Math.abs(angleTo(yaw, Math.atan2(dx, dz)));
      if (off > CONE + 0.5 / Math.max(d, 1)) continue;
      cand.push({ e, s: d + off * 9 });
    }
    cand.sort((p, q) => p.s - q.s);
    const hits = [];
    for (const c of cand.slice(0, 3)) hits.push({ e: c.e, from: null, k: 1 });
    // it leaps on: each man struck passes it to the nearest other man within reach
    for (let i = 0, n = hits.length; i < n; i++) {
      const src = hits[i].e; let best = null, bd = CHAIN;
      for (const e of list) {
        if (!e.alive || e.dying || hits.some((h) => h.e === e)) continue;
        const d = Math.hypot(e.pos.x - src.pos.x, e.pos.z - src.pos.z);
        if (d < bd) { bd = d; best = e; }
      }
      if (best) hits.push({ e: best, from: src, k: 0.6 });
    }
    for (const h of hits) {
      const e = h.e, ht = (e.type.height || 1.8);
      h.at = new THREE.Vector3(e.pos.x + rnd(-0.18, 0.18), e.pos.y + ht * rnd(0.45, 0.8), e.pos.z + rnd(-0.18, 0.18));
      // a shield raised toward the caster takes it
      const toMe = Math.atan2(pl.pos.x - e.pos.x, pl.pos.z - e.pos.z);
      h.shield = !h.from && e.type.shield && e.ai && e.ai.mode !== 'stun' && Math.abs(angleTo(e.yaw, toMe)) < 0.9;
      if (h.shield) h.at.set(e.pos.x + Math.sin(toMe) * 0.55, e.pos.y + ht * 0.55, e.pos.z + Math.cos(toMe) * 0.55);
    }
    this.hits = hits;
    // nothing in front: it crawls to the ground ahead
    if (!hits.length) {
      const d = rnd(5, 9), x = pl.pos.x + aim.x * d + rnd(-1, 1), z = pl.pos.z + aim.z * d + rnd(-1, 1);
      this.ground = new THREE.Vector3(x, terrainHeight(x, z) + 0.05, z);
    } else this.ground = null;
  }

  grow(hand, aim) {
    const B = this.bolts; B.length = 0;
    const main = (a, b, w, al, forks) => {
      const len = a.distanceTo(b), pts = jag(a, b, 5, 0.16);
      B.push({ pts, w, a: al });
      for (let f = 0; f < forks; f++) {
        const i = Math.floor(rnd(0.15, 0.8) * (pts.length - 2)), p = pts[i];
        _d.subVectors(pts[Math.min(pts.length - 1, i + 4)], p).normalize();
        _c.copy(_d).addScaledVector(perp(_d, _s), rnd(0.5, 1.1)).normalize();
        const fl = len * rnd(0.12, 0.32), end = p.clone().addScaledVector(_c, fl);
        const fp = jag(p, end, 4, 0.22); B.push({ pts: fp, w: w * 0.55, a: al * 0.6 });
        if (Math.random() < 0.4) { const j = Math.floor(fp.length * rnd(0.3, 0.7)); const e2 = fp[j].clone().addScaledVector(perp(_c, _s), fl * 0.4).addScaledVector(_c, fl * 0.3); B.push({ pts: jag(fp[j], e2, 3, 0.25), w: w * 0.35, a: al * 0.4 }); }
      }
    };
    if (this.hits.length) {
      for (const h of this.hits) {
        const src = h.from ? _a.set(h.from.pos.x, h.from.pos.y + (h.from.type.height || 1.8) * 0.6, h.from.pos.z) : hand;
        const strands = h.from ? 1 : 2;
        for (let k = 0; k < strands; k++) main(src.clone(), h.at.clone().add(_b.set(rnd(-0.12, 0.12), rnd(-0.15, 0.15), rnd(-0.12, 0.12))), h.from ? 0.7 : 1, h.from ? 0.75 : 1, h.from ? 2 : 4);
        // it runs over the body
        for (let k = 0; k < 2; k++) { const e = h.e, q = new THREE.Vector3(e.pos.x + rnd(-0.35, 0.35), e.pos.y + rnd(0.2, (e.type.height || 1.8)), e.pos.z + rnd(-0.35, 0.35)); B.push({ pts: jag(h.at.clone(), q, 3, 0.3), w: 0.5, a: 0.6 }); }
      }
    } else if (this.ground) {
      main(hand.clone(), this.ground.clone(), 0.85, 0.9, 5);
      // and spreads over the earth where it lands
      for (let k = 0; k < 3; k++) { const q = this.ground.clone().add(_b.set(rnd(-1.6, 1.6), 0, rnd(-1.6, 1.6))); q.y = terrainHeight(q.x, q.z) + 0.04; B.push({ pts: jag(this.ground.clone(), q, 3, 0.25), w: 0.5, a: 0.55 }); }
    }
    // a few short arcs crawling over the hand itself
    for (let k = 0; k < 3; k++) { const q = hand.clone().add(_b.set(rnd(-0.28, 0.28), rnd(-0.2, 0.25), rnd(-0.28, 0.28))); B.push({ pts: jag(hand.clone(), q, 2, 0.3), w: 0.35, a: 0.7 }); }
  }

  /** damage on a steady beat, so numbers and reactions do not fire every frame */
  strike(pl, hand) {
    for (const h of this.hits) {
      const e = h.e; if (!e.alive) continue;
      let dmg = DPS * TICK * h.k * (this.ctx.power ? this.ctx.power() : 1);
      _d.set(e.pos.x - pl.pos.x, 0, e.pos.z - pl.pos.z).normalize();
      if (h.shield) {
        // the shield drinks most of it, and the arm tires: hold it on him and the guard breaks
        e.stormShield = (e.stormShield || 0) + TICK;
        dmg *= 0.22;
        if (e.view) e.view.kick = 1.2;
        if (e.stormShield > 1.3) { e.stormShield = 0; if (this.ctx.stun) this.ctx.stun(e, 1.6); if (e.view) e.view.playReact('Idle_Shield_Break', 1.1, 0.05); }
        e.pos.addScaledVector(_d, 0.06);
      } else {
        // the body locks and shakes, and is driven back
        if (this.ctx.stun && e.ai) this.ctx.stun(e, 0.35);
        if (e.view && Math.random() < 0.7) e.view.playReact('Hit_Chest', rnd(1.6, 2.4), rnd(0, 0.15));
        e.pos.addScaledVector(_d, 0.12 * h.k);
      }
      const lethal = e.hp - dmg <= 0;
      if (lethal) e.blast = new THREE.Vector3(_d.x * 8.5, 4.6, _d.z * 8.5);
      // the last jolt throws him: a big number makes the corpse fly
      this.ctx.applyDamage(e, lethal ? Math.max(dmg, 130) : dmg, h.at, _d.clone(), false, null, { exec: true, storm: true });
      if (this.ctx.onTick) this.ctx.onTick(h, lethal);
    }
    if (!this.hits.length && this.ground && this.ctx.onGround) this.ctx.onGround(this.ground);
  }

  draw(hand) {
    const cam = this.camera.position, P = this.pos, T = this.tint;
    let q = 0;
    const quad = (a, b, w, r, g, bl, al) => {
      if (q >= MAXQ) return;
      _d.subVectors(b, a); _c.subVectors(cam, a);
      _s.crossVectors(_d, _c).normalize().multiplyScalar(w);
      const v = q * 12;
      P[v] = a.x - _s.x; P[v + 1] = a.y - _s.y; P[v + 2] = a.z - _s.z;
      P[v + 3] = a.x + _s.x; P[v + 4] = a.y + _s.y; P[v + 5] = a.z + _s.z;
      P[v + 6] = b.x + _s.x; P[v + 7] = b.y + _s.y; P[v + 8] = b.z + _s.z;
      P[v + 9] = b.x - _s.x; P[v + 10] = b.y - _s.y; P[v + 11] = b.z - _s.z;
      const t = q * 16;
      for (let k = 0; k < 4; k++) { T[t + k * 4] = r; T[t + k * 4 + 1] = g; T[t + k * 4 + 2] = bl; T[t + k * 4 + 3] = al; }
      q++;
    };
    const on = this.on, flick = 0.75 + Math.random() * 0.5;
    for (const bo of this.bolts) {
      const pts = bo.pts, a = bo.a * on * flick, w = bo.w;
      for (let i = 0; i < pts.length - 1; i++) {
        quad(pts[i], pts[i + 1], 0.55 * w, 0.38, 0.28, 1.0, 0.13 * a);     // violet haze
        quad(pts[i], pts[i + 1], 0.17 * w, 0.42, 0.58, 1.0, 0.6 * a);      // blue glow
        quad(pts[i], pts[i + 1], 0.03 * w + 0.01, 0.92, 0.95, 1.0, 1.3 * a); // white-hot core
      }
    }
    this.geo.attributes.position.needsUpdate = true; this.geo.attributes.tint.needsUpdate = true;
    this.geo.attributes.position.updateRange && (this.geo.attributes.position.updateRange.count = q * 12);
    this.geo.attributes.tint.updateRange && (this.geo.attributes.tint.updateRange.count = q * 16);
    this.geo.setDrawRange(0, q * 6);
  }

  /** draw it once at load (behind the title), so the first real cast costs nothing new */
  warm(at) { this.on = 1; this.hits = []; this.ground = at.clone(); this.grow(at.clone().add(new THREE.Vector3(0, 1.5, 0)), new THREE.Vector3(0, 0, 1)); this.draw(at); this.glare.visible = true; this.glare.position.copy(at); this.light.intensity = 0.0001; }
  coolDown() { this.on = 0; this.geo.setDrawRange(0, 0); this.glare.visible = false; this.light.intensity = 0; this.bolts.length = 0; }
}
