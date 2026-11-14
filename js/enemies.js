import * as THREE from 'three';
import {
  TAU, clamp, lerp, damp, dampAngle, smoothstep, rnd, rng, pick,
  terrainHeight, Builder, raySphere, angleTo, ARENA_R
} from './core.js';

const _d = new THREE.Object3D();
_d.rotation.order = 'YXZ';
const _v = new THREE.Vector3();
const _col = new THREE.Color();

/* ------------------------------------------------------------------ palettes */
const SKIN = {
  carapace: 0x4b3d68,
  plate: 0x6b5891,
  plateDark: 0x352b49,
  claw: 0xa296b8,
  bone: 0xd6c6a4,
  eye: 0xff7a1a,
  eyeCold: 0x6fe0ff,
  metal: 0x8d8880,
  metalDark: 0x5b554e,
  rust: 0x8a4a28,
  flesh: 0x6b3f52,
};

/* ------------------------------------------------------------------ geometry */
function gruntParts() {
  const body = new Builder();
  body.add(new THREE.BoxGeometry(0.56, 0.46, 0.40), SKIN.carapace, { pos: [0, 1.02, 0], rot: [0.16, 0, 0], jitter: 0.03 });
  body.add(new THREE.BoxGeometry(0.62, 0.20, 0.46), SKIN.plate, { pos: [0, 1.26, -0.01], rot: [-0.05, 0, 0], jitter: 0.03 });
  body.add(new THREE.BoxGeometry(0.34, 0.28, 0.34), SKIN.plateDark, { pos: [0, 1.22, 0.24], rot: [0.2, 0, 0], jitter: 0.03 });
  body.add(new THREE.BoxGeometry(0.30, 0.14, 0.24), SKIN.carapace, { pos: [0, 0.96, 0.12], jitter: 0.03 });
  // jaw
  body.add(new THREE.BoxGeometry(0.22, 0.08, 0.10), SKIN.bone, { pos: [0, 1.10, 0.40], jitter: 0.02 });
  // eyes
  body.add(new THREE.BoxGeometry(0.13, 0.085, 0.04), SKIN.eye, { pos: [0.10, 1.27, 0.405] });
  body.add(new THREE.BoxGeometry(0.13, 0.085, 0.04), SKIN.eye, { pos: [-0.10, 1.27, 0.405] });
  body.add(new THREE.BoxGeometry(0.30, 0.045, 0.05), 0x0e0912, { pos: [0, 1.335, 0.40] });
  // shoulder spikes
  for (let s = 0; s < 2; s++) {
    const sx = s ? -0.34 : 0.34;
    body.add(new THREE.ConeGeometry(0.10, 0.30, 4), SKIN.plate, { pos: [sx, 1.40, -0.02], rot: [0, 0, s ? 0.5 : -0.5], jitter: 0.03 });
    body.add(new THREE.ConeGeometry(0.09, 0.26, 4), SKIN.claw, { pos: [sx, 1.46, -0.16], rot: [-0.6, 0, s ? 0.4 : -0.4], jitter: 0.03 });
  }
  // back spikes
  for (let i = 0; i < 3; i++) {
    body.add(new THREE.ConeGeometry(0.07, 0.22 + i * 0.03, 4), SKIN.bone, { pos: [0, 1.40 - i * 0.10, -0.20 - i * 0.03], rot: [-0.5, 0, 0], jitter: 0.02 });
  }

  const leg = () => {
    const b = new Builder();
    b.add(new THREE.BoxGeometry(0.15, 0.36, 0.17), SKIN.plateDark, { pos: [0, -0.18, 0], jitter: 0.03 });
    b.add(new THREE.BoxGeometry(0.13, 0.34, 0.15), SKIN.carapace, { pos: [0, -0.52, 0.02], jitter: 0.03 });
    b.add(new THREE.BoxGeometry(0.17, 0.10, 0.30), SKIN.claw, { pos: [0, -0.72, 0.07], jitter: 0.03 });
    b.add(new THREE.ConeGeometry(0.05, 0.14, 4), SKIN.bone, { pos: [0, -0.76, 0.24], rot: [1.4, 0, 0] });
    return b.build();
  };

  const arm = () => {
    const b = new Builder();
    b.add(new THREE.BoxGeometry(0.13, 0.28, 0.14), SKIN.plate, { pos: [0, -0.14, 0], jitter: 0.03 });
    b.add(new THREE.BoxGeometry(0.11, 0.26, 0.12), SKIN.carapace, { pos: [0, -0.40, 0.02], jitter: 0.03 });
    b.add(new THREE.ConeGeometry(0.045, 0.22, 4), SKIN.bone, { pos: [0.03, -0.56, 0.06], rot: [1.9, 0, 0.2] });
    b.add(new THREE.ConeGeometry(0.045, 0.20, 4), SKIN.bone, { pos: [-0.03, -0.55, 0.04], rot: [1.9, 0, -0.2] });
    return b.build();
  };

  return { body: body.build(), legL: leg(), legR: leg(), armL: arm(), armR: arm() };
}

function shooterParts() {
  const body = new Builder();
  body.add(new THREE.BoxGeometry(0.46, 0.56, 0.34), SKIN.plate, { pos: [0, 1.30, 0], jitter: 0.03 });
  body.add(new THREE.BoxGeometry(0.52, 0.16, 0.38), SKIN.plateDark, { pos: [0, 1.60, 0], jitter: 0.03 });
  body.add(new THREE.BoxGeometry(0.28, 0.26, 0.30), SKIN.carapace, { pos: [0, 1.82, 0.02], jitter: 0.03 });
  // single visor eye
  body.add(new THREE.BoxGeometry(0.20, 0.06, 0.04), SKIN.eyeCold, { pos: [0, 1.84, 0.17] });
  body.add(new THREE.ConeGeometry(0.06, 0.20, 3), SKIN.bone, { pos: [0.12, 2.00, -0.02], rot: [0, 0, -0.3] });
  body.add(new THREE.ConeGeometry(0.06, 0.20, 3), SKIN.bone, { pos: [-0.12, 2.00, -0.02], rot: [0, 0, 0.3] });
  // hip
  body.add(new THREE.BoxGeometry(0.34, 0.20, 0.28), SKIN.plateDark, { pos: [0, 1.02, 0], jitter: 0.03 });
  // cannon arm (right)
  body.add(new THREE.CylinderGeometry(0.09, 0.11, 0.46, 7), SKIN.metal, { pos: [0.34, 1.34, 0.16], rot: [Math.PI / 2 - 0.25, 0, 0], jitter: 0.02 });
  body.add(new THREE.CylinderGeometry(0.055, 0.07, 0.16, 7), SKIN.metalDark, { pos: [0.34, 1.26, 0.40], rot: [Math.PI / 2 - 0.25, 0, 0] });
  body.add(new THREE.TorusGeometry(0.10, 0.02, 4, 8), SKIN.eyeCold, { pos: [0.34, 1.28, 0.30], rot: [Math.PI / 2 - 0.25, 0, 0] });

  const leg = () => {
    const b = new Builder();
    b.add(new THREE.BoxGeometry(0.13, 0.46, 0.15), SKIN.plateDark, { pos: [0, -0.23, 0], jitter: 0.03 });
    b.add(new THREE.BoxGeometry(0.11, 0.44, 0.13), SKIN.carapace, { pos: [0, -0.66, 0.01], jitter: 0.03 });
    b.add(new THREE.BoxGeometry(0.15, 0.10, 0.26), SKIN.metal, { pos: [0, -0.90, 0.06], jitter: 0.03 });
    return b.build();
  };
  const arm = () => {
    const b = new Builder();
    b.add(new THREE.BoxGeometry(0.11, 0.28, 0.12), SKIN.plate, { pos: [0, -0.14, 0], jitter: 0.03 });
    b.add(new THREE.BoxGeometry(0.10, 0.26, 0.11), SKIN.carapace, { pos: [0, -0.40, 0.02], jitter: 0.03 });
    b.add(new THREE.BoxGeometry(0.09, 0.08, 0.09), SKIN.claw, { pos: [0, -0.55, 0.03] });
    return b.build();
  };
  return { body: body.build(), legL: leg(), legR: leg(), armL: arm(), armR: arm() };
}

function bruteParts() {
  const body = new Builder();
  body.add(new THREE.BoxGeometry(1.20, 0.86, 1.70), SKIN.carapace, { pos: [0, 1.10, 0], jitter: 0.04 });
  body.add(new THREE.BoxGeometry(1.05, 0.34, 1.30), SKIN.plate, { pos: [0, 1.56, -0.05], jitter: 0.04 });
  // head
  body.add(new THREE.BoxGeometry(0.70, 0.52, 0.62), SKIN.plateDark, { pos: [0, 1.20, 0.98], jitter: 0.04 });
  body.add(new THREE.BoxGeometry(0.50, 0.18, 0.30), SKIN.bone, { pos: [0, 1.00, 1.24], jitter: 0.03 });
  body.add(new THREE.BoxGeometry(0.12, 0.07, 0.04), SKIN.eye, { pos: [0.17, 1.34, 1.29] });
  body.add(new THREE.BoxGeometry(0.12, 0.07, 0.04), SKIN.eye, { pos: [-0.17, 1.34, 1.29] });
  // horns
  body.add(new THREE.ConeGeometry(0.10, 0.52, 5), SKIN.bone, { pos: [0.28, 1.62, 0.86], rot: [-0.6, 0, -0.35], jitter: 0.03 });
  body.add(new THREE.ConeGeometry(0.10, 0.52, 5), SKIN.bone, { pos: [-0.28, 1.62, 0.86], rot: [-0.6, 0, 0.35], jitter: 0.03 });
  // spine ridge
  for (let i = 0; i < 4; i++) {
    body.add(new THREE.ConeGeometry(0.10 - i * 0.012, 0.34, 4), SKIN.plate, { pos: [0, 1.78, 0.42 - i * 0.42], rot: [-0.25, 0, 0], jitter: 0.03 });
  }
  // tail
  body.add(new THREE.CylinderGeometry(0.10, 0.24, 0.80, 6), SKIN.plateDark, { pos: [0, 1.02, -1.15], rot: [-1.9, 0, 0], jitter: 0.03 });

  const leg = (front) => {
    const b = new Builder();
    b.add(new THREE.BoxGeometry(0.24, 0.44, 0.28), SKIN.plateDark, { pos: [0, -0.22, 0], jitter: 0.04 });
    b.add(new THREE.BoxGeometry(0.20, 0.40, 0.22), SKIN.carapace, { pos: [0, -0.62, front ? 0.06 : -0.02], jitter: 0.04 });
    b.add(new THREE.BoxGeometry(0.26, 0.14, 0.36), SKIN.claw, { pos: [0, -0.86, 0.06], jitter: 0.04 });
    return b.build();
  };
  return {
    body: body.build(),
    legL: leg(true), legR: leg(true), legL2: leg(false), legR2: leg(false)
  };
}

function waspParts() {
  const body = new Builder();
  b0(body);
  function b0(b) {
    b.add(new THREE.CylinderGeometry(0.16, 0.30, 0.46, 7), SKIN.plate, { pos: [0, 0, 0.10], rot: [1.35, 0, 0], jitter: 0.03 });
    b.add(new THREE.BoxGeometry(0.26, 0.20, 0.24), SKIN.carapace, { pos: [0, 0.04, 0.36], jitter: 0.03 });
    b.add(new THREE.BoxGeometry(0.18, 0.08, 0.06), SKIN.eye, { pos: [0, 0.06, 0.48] });
    b.add(new THREE.ConeGeometry(0.06, 0.30, 4), SKIN.bone, { pos: [0, 0, -0.22], rot: [-1.4, 0, 0] });
    for (let i = 0; i < 3; i++) {
      b.add(new THREE.CylinderGeometry(0.02, 0.03, 0.24, 4), SKIN.claw, {
        pos: [0, -0.14, 0.06 + i * 0.12], rot: [0.9, 0, 0.5 * (i - 1)]
      });
    }
  }
  const wing = new Builder();
  wing.add(new THREE.BoxGeometry(0.62, 0.02, 0.26), 0x9fd8e8, { pos: [0.34, 0, 0], jitter: 0.02 });
  wing.add(new THREE.BoxGeometry(0.20, 0.02, 0.18), 0x7fb8c8, { pos: [0.72, 0, 0.04] });
  return { body: body.build(), wingL: wing.build(), wingR: wing.build() };
}

function bossParts() {
  const body = new Builder();
  // segmented carapace body
  for (let i = 0; i < 5; i++) {
    const s = 1 - i * 0.10;
    body.add(new THREE.BoxGeometry(1.5 * s, 1.1 * s, 1.5 * s), i % 2 ? SKIN.plate : SKIN.carapace, {
      pos: [0, 1.5 * s, -i * 1.35], rot: [i * 0.05, 0, 0], jitter: 0.05
    });
    body.add(new THREE.ConeGeometry(0.18 * s, 0.55 * s, 4), SKIN.bone, { pos: [0, 2.05 * s, -i * 1.35], rot: [-0.2, 0, 0], jitter: 0.04 });
  }
  body.add(new THREE.BoxGeometry(1.1, 0.9, 0.9), SKIN.plateDark, { pos: [0, 1.55, 1.35], jitter: 0.05 });
  body.add(new THREE.BoxGeometry(0.9, 0.20, 0.3), SKIN.bone, { pos: [0, 1.32, 1.78], jitter: 0.04 });
  body.add(new THREE.BoxGeometry(0.20, 0.10, 0.06), SKIN.eye, { pos: [0.26, 1.72, 1.80] });
  body.add(new THREE.BoxGeometry(0.20, 0.10, 0.06), SKIN.eye, { pos: [-0.26, 1.72, 1.80] });
  // mandibles
  body.add(new THREE.ConeGeometry(0.12, 0.60, 4), SKIN.claw, { pos: [0.34, 1.30, 2.10], rot: [1.5, 0, -0.3] });
  body.add(new THREE.ConeGeometry(0.12, 0.60, 4), SKIN.claw, { pos: [-0.34, 1.30, 2.10], rot: [1.5, 0, 0.3] });
  // shoulder plating
  body.add(new THREE.BoxGeometry(0.9, 0.5, 1.2), SKIN.plate, { pos: [0.95, 1.75, 0.5], rot: [0, 0, -0.25], jitter: 0.05 });
  body.add(new THREE.BoxGeometry(0.9, 0.5, 1.2), SKIN.plate, { pos: [-0.95, 1.75, 0.5], rot: [0, 0, 0.25], jitter: 0.05 });

  const leg = () => {
    const b = new Builder();
    b.add(new THREE.CylinderGeometry(0.20, 0.26, 0.9, 6), SKIN.carapace, { pos: [0, -0.45, 0], jitter: 0.04 });
    b.add(new THREE.CylinderGeometry(0.14, 0.18, 0.7, 6), SKIN.plateDark, { pos: [0, -1.1, 0.1], jitter: 0.04 });
    b.add(new THREE.BoxGeometry(0.3, 0.16, 0.5), SKIN.claw, { pos: [0, -1.45, 0.15], jitter: 0.04 });
    return b.build();
  };
  return { body: body.build(), legL: leg(), legR: leg(), legL2: leg(), legR2: leg() };
}

/* ------------------------------------------------------------------ types */
export const ENEMY_TYPES = {
  grunt: {
    key: 'grunt', hp: 70, speed: 3.9, radius: 0.52, height: 1.75, headY: 1.26, headR: 0.30,
    dmg: 9, attackRange: 1.75, attackCd: 1.35, score: 100, hudName: 'GRUNT',
    parts: gruntParts, partList: ['body', 'legL', 'legR', 'armL', 'armR'],
    legPivots: { legL: [-0.16, 0.98, 0], legR: [0.16, 0.98, 0] },
    armPivots: { armL: [-0.34, 1.28, 0], armR: [0.34, 1.28, 0] },
  },
  shooter: {
    key: 'shooter', hp: 95, speed: 2.9, radius: 0.50, height: 2.05, headY: 1.84, headR: 0.26,
    dmg: 9, attackRange: 30, preferred: 15, attackCd: 2.1, score: 150, hudName: 'SHARPSHOOTER',
    parts: shooterParts, partList: ['body', 'legL', 'legR', 'armL', 'armR'],
    legPivots: { legL: [-0.15, 1.02, 0], legR: [0.15, 1.02, 0] },
    armPivots: { armL: [-0.30, 1.56, 0], armR: [0.34, 1.34, 0.16] },
  },
  brute: {
    key: 'brute', hp: 330, speed: 2.5, radius: 1.05, height: 2.0, headY: 1.24, headR: 0.44,
    dmg: 20, attackRange: 3.3, attackCd: 1.7, score: 400, hudName: 'BRUTE', heavy: true,
    parts: bruteParts, partList: ['body', 'legL', 'legR', 'legL2', 'legR2'],
    legPivots: { legL: [-0.55, 1.02, 0.62], legR: [0.55, 1.02, 0.62], legL2: [-0.55, 1.02, -0.62], legR2: [0.55, 1.02, -0.62] },
  },
  wasp: {
    key: 'wasp', hp: 48, speed: 6.4, radius: 0.46, height: 0.9, headY: 0.5, headR: 0.26,
    dmg: 7, attackRange: 2.2, attackCd: 1.2, score: 120, hudName: 'STINGER', flying: true, flyH: 3.1,
    parts: waspParts, partList: ['body', 'wingL', 'wingR'],
  },
  boss: {
    key: 'boss', hp: 1500, speed: 2.2, radius: 1.9, height: 2.4, headY: 1.7, headR: 0.75,
    dmg: 26, attackRange: 4.2, attackCd: 1.9, score: 2500, hudName: 'METALPEDE', boss: true, heavy: true,
    parts: bossParts, partList: ['body', 'legL', 'legR', 'legL2', 'legR2'],
    legPivots: { legL: [-0.9, 1.2, 0.9], legR: [0.9, 1.2, 0.9], legL2: [-0.9, 1.2, -1.5], legR2: [0.9, 1.2, -1.5] },
  },
};

/* ------------------------------------------------------------------ instancers */
const MAX_PER_TYPE = { grunt: 26, shooter: 14, brute: 8, wasp: 12, boss: 2 };

class TypeRender {
  constructor(scene, type) {
    this.type = type;
    this.geos = type.parts();
    this.parts = [];
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    for (const name of type.partList) {
      const geo = this.geos[name];
      if (!geo) continue;
      const max = MAX_PER_TYPE[type.key] || 10;
      const m = new THREE.InstancedMesh(geo, mat, max);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
      m.instanceColor.setUsage(THREE.DynamicDrawUsage);
      m.castShadow = true;
      m.receiveShadow = false;
      m.frustumCulled = false;
      m.count = 0;
      scene.add(m);
      this.parts.push({ name, mesh: m });
    }
  }
}

/* ------------------------------------------------------------------ manager */
export class Enemies {
  constructor(scene, world, fx, audio, player) {
    this.scene = scene;
    this.world = world;
    this.fx = fx;
    this.audio = audio;
    this.player = player;
    this.list = [];
    this.renders = {};
    for (const k of Object.keys(ENEMY_TYPES)) this.renders[k] = new TypeRender(scene, ENEMY_TYPES[k]);

    // enemy projectiles
    const geo = new THREE.SphereGeometry(0.14, 6, 5);
    this.projMesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({
      color: 0x9fd8ff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false
    }), 48);
    this.projMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.projMesh.frustumCulled = false;
    this.projMesh.count = 0;
    scene.add(this.projMesh);
    this.projectiles = [];

    // glowing eyes so a threat is readable at range
    const eyeGeo = new THREE.SphereGeometry(0.13, 6, 5);
    this.eyeMesh = new THREE.InstancedMesh(eyeGeo, new THREE.MeshBasicMaterial({
      transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false
    }), 72);
    this.eyeMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(72 * 3), 3);
    this.eyeMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.eyeMesh.frustumCulled = false;
    this.eyeMesh.count = 0;
    scene.add(this.eyeMesh);

    this.onKill = null;
    this.onPlayerHit = null;
  }

  get alive() { return this.list.filter(e => e.alive); }
  get count() { return this.list.reduce((n, e) => n + (e.alive ? 1 : 0), 0); }

  spawn(typeKey, x, z, opts = {}) {
    const t = ENEMY_TYPES[typeKey];
    const hpScale = opts.hpScale || 1;
    const e = {
      type: t, key: typeKey,
      pos: new THREE.Vector3(x, terrainHeight(x, z), z),
      vel: new THREE.Vector3(),
      yaw: Math.atan2(-x, -z),
      hp: t.hp * hpScale, maxHp: t.hp * hpScale,
      alive: true, state: 'spawn', stateT: 0,
      attackCd: rnd(0.3, 1.2), phase: rnd(0, TAU),
      flash: 0, limbL: 0, limbR: 0, scale: 0.01,
      dying: 0, hurtT: 0, dead: false,
      speed: t.speed * (opts.speedScale || 1),
      dmg: t.dmg * (opts.dmgScale || 1),
      spawnT: 0,
      strafeDir: rng() > 0.5 ? 1 : -1,
      lungeT: 0, lungeCd: rnd(1, 2),
      targetHeight: t.flying ? t.flyH : 0,
    };
    if (t.boss) e.speed = t.speed;
    this.list.push(e);
    if (this.fx) {
      this.fx.ring(new THREE.Vector3(x, terrainHeight(x, z) + 0.1, z), 0x9a5cff, 2.4, 0.7);
      this.fx.ecoBurst(new THREE.Vector3(x, terrainHeight(x, z) + 0.8, z), 0xb878ff, 12, 0.8);
    }
    return e;
  }

  /* ---------------- damage ---------------- */
  hit(e, amount, point, dir, head, weapon) {
    if (!e.alive) return;
    e.hp -= amount;
    e.flash = 1;
    e.hurtT = 0.12;
    if (this.fx && point) {
      this.fx.hitSpark(point, dir ? dir.clone().negate() : new THREE.Vector3(0, 1, 0), head);
      this.fx.damageNumber(point, amount, head);
    }
    if (this.audio) this.audio.hitmarker(head);
    if (e.type.heavy) {
      // heavy enemies only stagger on big hits
      if (amount > 60) { e.state = 'stagger'; e.stateT = 0.25; }
    } else if (amount > 24) {
      e.state = 'stagger'; e.stateT = 0.18;
    }
    // knockback
    if (dir && !e.type.boss) {
      const kb = e.type.heavy ? 0.35 : 1.0;
      e.vel.addScaledVector(new THREE.Vector3(dir.x, 0, dir.z).normalize(), amount * 0.05 * kb);
    }
    if (e.hp <= 0) this.kill(e);
  }

  kill(e) {
    if (!e.alive) return;
    e.alive = false;
    e.dying = 0;
    e.state = 'dead';
    if (this.fx) {
      const p = new THREE.Vector3(e.pos.x, e.pos.y + e.type.height * 0.5, e.pos.z);
      this.fx.ecoBurst(p, e.type.boss ? 0xff8040 : (e.key === 'wasp' ? 0xffd060 : 0x37e0c8), e.type.boss ? 40 : 16, e.type.boss ? 2 : 1);
      this.fx.puff(p, null, 0x4a3a58, e.type.boss ? 2.2 : 0.7, e.type.boss ? 8 : 2, 1.1, 1.6);
    }
    if (this.audio) this.audio.enemyDeath(0);
    if (this.onKill) this.onKill(e);
  }

  /* ---------------- explosions ---------------- */
  explode(pos, radius, dmg, falloff = 0.45) {
    for (const e of this.list) {
      if (!e.alive) continue;
      const dx = e.pos.x - pos.x, dy = (e.pos.y + e.type.height * 0.5) - pos.y, dz = e.pos.z - pos.z;
      const d = Math.hypot(dx, dy, dz);
      if (d > radius + e.type.radius) continue;
      const k = clamp(1 - (d - e.type.radius) / (radius * (1 + falloff)), 0.25, 1);
      const dir = new THREE.Vector3(dx, dy, dz).normalize();
      this.hit(e, dmg * k, new THREE.Vector3(e.pos.x, e.pos.y + e.type.height * 0.5, e.pos.z), dir, false, null);
    }
    if (this.fx) this.fx.explosion(pos, radius, 0xff8a30);
    if (this.audio) this.audio.explosion(0);
    // push the player a bit too
    if (this.player && this.player.alive) {
      const d = this.player.pos.distanceTo(pos);
      if (d < radius * 1.4) {
        const f = 1 - d / (radius * 1.4);
        const dir = new THREE.Vector3().subVectors(this.player.pos, pos).normalize();
        this.player.knock.addScaledVector(new THREE.Vector3(dir.x, 0, dir.z), 16 * f);
        this.player.damage(dmg * 0.28 * f, pos.x, pos.z);
      }
    }
  }

  /* ---------------- raycast ---------------- */
  raycast(origin, dir, maxDist, pierce = 1) {
    const hits = [];
    for (const e of this.list) {
      if (!e.alive) continue;
      const t = e.type;
      // three stacked spheres: legs, torso, head. Matches the silhouette far
      // better than one small body sphere, which made on-target shots miss.
      const secs = [
        [e.pos.y + t.height * 0.26, t.radius * 1.02, false],
        [e.pos.y + t.height * 0.60, t.radius * 1.12, false],
        [e.pos.y + t.headY, t.headR * 1.55, true],
      ];
      let dist = -1, head = false;
      for (let s = 0; s < 3; s++) {
        const tt = raySphere(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z,
          e.pos.x, secs[s][0], e.pos.z, secs[s][1], maxDist);
        if (tt >= 0 && (dist < 0 || tt < dist)) { dist = tt; head = secs[s][2]; }
      }
      if (dist < 0) continue;
      hits.push({
        enemy: e, dist, head,
        point: new THREE.Vector3(origin.x + dir.x * dist, origin.y + dir.y * dist, origin.z + dir.z * dist)
      });
    }
    hits.sort((a, b) => a.dist - b.dist);
    return hits.slice(0, Math.max(1, pierce));
  }

  /* ---------------- main update ---------------- */
  update(dt, time) {
    const p = this.player;
    const pp = p.pos;

    let i = 0;
    while (i < this.list.length) {
      const e = this.list[i];
      if (!e.alive) {
        e.dying += dt;
        if (e.dying > 1.1) { this.list.splice(i, 1); continue; }
        // sink + shrink
        e.scale = Math.max(0, 1 - e.dying / 0.9);
        e.pos.y -= dt * 1.6;
        i++;
        continue;
      }
      this.updateOne(e, dt, time, pp);
      i++;
    }

    this.updateProjectiles(dt);
    this.render(time);
  }

  updateOne(e, dt, time, pp) {
    const t = e.type;
    e.stateT += dt;
    e.attackCd = Math.max(0, e.attackCd - dt);
    e.flash = Math.max(0, e.flash - dt * 6);
    e.hurtT = Math.max(0, e.hurtT - dt);
    e.spawnT += dt;

    if (e.state === 'spawn') {
      e.scale = clamp(e.spawnT / 0.55, 0.01, 1);
      e.yaw = dampAngle(e.yaw, Math.atan2(pp.x - e.pos.x, pp.z - e.pos.z), 6, dt);
      if (e.spawnT > 0.6) { e.state = 'chase'; e.stateT = 0; }
      return;
    }

    const dx = pp.x - e.pos.x;
    const dz = pp.z - e.pos.z;
    const dist = Math.hypot(dx, dz);
    const dirX = dx / (dist || 1), dirZ = dz / (dist || 1);

    // always face the player unless staggered
    if (e.state !== 'stagger') {
      e.yaw = dampAngle(e.yaw, Math.atan2(dx, dz), e.type.boss ? 3.2 : 7, dt);
    }

    let moveX = 0, moveZ = 0;
    let speed = e.speed;

    if (e.state === 'stagger') {
      if (e.stateT > 0.22) { e.state = 'chase'; e.stateT = 0; }
    } else if (t.flying) {
      // hover, then dive
      e.lungeCd -= dt;
      if (e.lungeT > 0) {
        e.lungeT -= dt;
        moveX = dirX; moveZ = dirZ; speed = e.speed * 1.8;
      } else if (dist < 14 && e.lungeCd <= 0) {
        e.lungeT = 0.55; e.lungeCd = rnd(1.8, 3.2);
      } else {
        const orbit = Math.atan2(dz, dx) + Math.PI / 2 * e.strafeDir;
        moveX = Math.cos(orbit) * 0.7 + dirX * 0.35;
        moveZ = Math.sin(orbit) * 0.7 + dirZ * 0.35;
      }
    } else if (t.key === 'shooter') {
      const pref = t.preferred;
      if (dist > pref + 3) { moveX = dirX; moveZ = dirZ; }
      else if (dist < pref - 4) { moveX = -dirX; moveZ = -dirZ; speed *= 0.85; }
      else {
        const orbit = Math.atan2(dz, dx) + Math.PI / 2 * e.strafeDir;
        moveX = Math.cos(orbit) * 0.85; moveZ = Math.sin(orbit) * 0.85;
      }
      if (e.attackCd <= 0 && dist < t.attackRange && !this.world.blocked(e.pos.x, e.pos.z, pp.x, pp.z)) {
        this.fireProjectile(e, pp);
      }
    } else if (t.boss) {
      if (dist > 8) { moveX = dirX; moveZ = dirZ; }
      if (e.attackCd <= 0) {
        if (dist > 12) this.fireProjectile(e, pp, 3);
        else { e.state = 'attack'; e.stateT = 0; e.attackCd = t.attackCd; }
      }
    } else {
      // melee chasers
      if (dist > t.attackRange * 0.92) {
        moveX = dirX; moveZ = dirZ;
      } else if (e.attackCd <= 0) {
        e.state = 'attack';
        e.stateT = 0;
        e.attackCd = t.attackCd;
        this.dealMelee(e, dist);
      }
    }

    if (e.state === 'attack') {
      if (e.stateT > 0.35) e.state = 'chase';
    }

    // separation from other enemies
    let sepX = 0, sepZ = 0;
    const list = this.list;
    for (let k = 0; k < list.length; k++) {
      const o = list[k];
      if (o === e || !o.alive) continue;
      const ox = e.pos.x - o.pos.x, oz = e.pos.z - o.pos.z;
      const d2 = ox * ox + oz * oz;
      const rr = (t.radius + o.type.radius) * 1.15;
      if (d2 < rr * rr && d2 > 1e-4) {
        const d = Math.sqrt(d2);
        sepX += (ox / d) * (1 - d / rr);
        sepZ += (oz / d) * (1 - d / rr);
      }
    }
    moveX += sepX * 1.4;
    moveZ += sepZ * 1.4;

    // integrate
    const accel = e.state === 'attack' ? 2 : 14;
    const desiredX = moveX * speed, desiredZ = moveZ * speed;
    e.vel.x = damp(e.vel.x, desiredX, accel, dt);
    e.vel.z = damp(e.vel.z, desiredZ, accel, dt);

    let nx = e.pos.x + e.vel.x * dt;
    let nz = e.pos.z + e.vel.z * dt;
    [nx, nz] = this.world.resolveCollisions(nx, nz, t.radius);
    // keep out of the dais
    e.pos.x = nx; e.pos.z = nz;

    const gh = terrainHeight(nx, nz);
    if (t.flying) {
      const targetY = gh + t.flyH + Math.sin(time * 2.2 + e.phase) * 0.35;
      e.pos.y = damp(e.pos.y, targetY, 5, dt);
    } else {
      e.pos.y = damp(e.pos.y, gh, 14, dt);
    }

    // limb animation
    const spd = Math.hypot(e.vel.x, e.vel.z);
    e.phase += dt * (2.2 + spd * 1.5);
    const swing = Math.sin(e.phase) * clamp(spd * 0.22, 0, 0.9);
    e.limbL = swing;
    e.limbR = -swing;

    // flee/heal not needed; keep simple
    e.scale = damp(e.scale, 1, 10, dt);
  }

  dealMelee(e, dist) {
    const p = this.player;
    if (!p.alive) return;
    if (dist > e.type.attackRange * 1.15) return;
    // telegraph then hit
    setTimeout(() => {
      if (!e.alive || !p.alive) return;
      const d = p.pos.distanceTo(e.pos);
      if (d < e.type.attackRange * 1.3) {
        p.damage(e.dmg, e.pos.x, e.pos.z);
        if (p.onHurt) p.onHurt();
        p.knock.add(new THREE.Vector3(Math.sin(e.yaw), 0, Math.cos(e.yaw)).multiplyScalar(e.type.heavy ? 9 : 4));
      }
    }, 180);
    if (this.fx) {
      this.fx.spark(new THREE.Vector3(
        e.pos.x + Math.sin(e.yaw) * 0.8, e.pos.y + 1.2, e.pos.z + Math.cos(e.yaw) * 0.8
      ), null, 0xff7a30, 5, 5, 0.1, 0.3);
    }
  }

  fireProjectile(e, pp, burst = 1) {
    const t = e.type;
    if (e.attackCd > 0) return;
    e.attackCd = t.attackCd * rnd(0.85, 1.2);
    const origin = new THREE.Vector3(e.pos.x, e.pos.y + t.height * 0.75, e.pos.z);
    origin.x += Math.sin(e.yaw) * 0.5;
    origin.z += Math.cos(e.yaw) * 0.5;
    for (let i = 0; i < burst; i++) {
      const target = new THREE.Vector3(pp.x, pp.y + 1.1, pp.z);
      // lead the player slightly
      target.x += this.player.vel.x * 0.18 * (1 + i * 0.4);
      target.z += this.player.vel.z * 0.18 * (1 + i * 0.4);
      const dir = target.sub(origin).normalize();
      const spreadA = rnd(0, TAU), spreadR = rnd(0, t.boss ? 0.04 : 0.055);
      const up = Math.abs(dir.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
      const right = new THREE.Vector3().crossVectors(dir, up).normalize();
      const up2 = new THREE.Vector3().crossVectors(right, dir).normalize();
      dir.addScaledVector(right, Math.cos(spreadA) * spreadR).addScaledVector(up2, Math.sin(spreadA) * spreadR).normalize();
      const speed = t.boss ? 26 : 22;
      this.projectiles.push({
        pos: origin.clone(), vel: dir.multiplyScalar(speed),
        dmg: t.dmg, life: 3.2, color: t.boss ? 0xff7030 : 0x9fd8ff, radius: t.boss ? 0.28 : 0.14
      });
    }
    if (this.audio) this.audio.enemyShoot(this.player.pos.distanceTo(e.pos));
    if (this.fx) this.fx.spark(origin, null, t.boss ? 0xff7030 : 0x9fd8ff, 4, 3, 0.1, 0.25);
  }

  updateProjectiles(dt) {
    const p = this.player;
    let n = 0;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      pr.life -= dt;
      pr.pos.addScaledVector(pr.vel, dt);
      pr.vel.y -= 3.2 * dt;
      let dead = pr.life <= 0;
      // hit player
      if (!dead && p.alive) {
        const dx = pr.pos.x - p.pos.x, dz = pr.pos.z - p.pos.z;
        const dy = pr.pos.y - (p.pos.y + 1.0);
        if (dx * dx + dz * dz < 0.72 && Math.abs(dy) < 1.0) {
          p.damage(pr.dmg, pr.pos.x, pr.pos.z);
          if (p.onHurt) p.onHurt();
          if (this.fx) this.fx.spark(pr.pos, null, pr.color, 8, 5, 0.12, 0.3);
          dead = true;
        }
      }
      // hit ground
      if (!dead && pr.pos.y < terrainHeight(pr.pos.x, pr.pos.z) + 0.1) {
        if (this.fx) {
          this.fx.spark(pr.pos, new THREE.Vector3(0, 1, 0), pr.color, 7, 4, 0.12, 0.3);
          this.fx.puff(pr.pos, null, 0x8a6a4a, 0.4, 1, 0.6, 1);
        }
        dead = true;
      }
      if (dead) this.projectiles.splice(i, 1);
    }

    const m = this.projMesh;
    const count = Math.min(this.projectiles.length, 48);
    for (let i = 0; i < count; i++) {
      const pr = this.projectiles[i];
      _d.position.copy(pr.pos);
      _d.rotation.set(0, 0, 0);
      _d.scale.setScalar(pr.radius / 0.14 * (1 + Math.sin(performance.now() * 0.03) * 0.12));
      _d.updateMatrix();
      m.setMatrixAt(i, _d.matrix);
    }
    m.count = count;
    m.instanceMatrix.needsUpdate = true;
  }

  /* ---------------- instanced render ---------------- */
  render(time) {
    // eye glows
    let ei = 0;
    for (const e of this.list) {
      if (!e.alive || ei + 2 > 72) continue;
      const t = e.type;
      const cosY = Math.cos(e.yaw), sinY = Math.sin(e.yaw);
      const col = t.boss ? 0xff5a18 : (e.key === 'wasp' ? 0xffc040 : (e.key === 'shooter' ? 0x6fe0ff : 0xff8a2a));
      _col.setHex(col).multiplyScalar(1 + Math.sin(time * 5 + e.phase) * 0.18);
      for (let s = -1; s <= 1; s += 2) {
        const ox = s * t.headR * 0.55, oz = t.headR * 0.95;
        _d.position.set(
          e.pos.x + ox * cosY + oz * sinY,
          e.pos.y + t.headY,
          e.pos.z - ox * sinY + oz * cosY
        );
        _d.rotation.set(0, 0, 0);
        _d.scale.setScalar(e.scale * (t.boss ? 2.2 : 1) * (1 + Math.sin(time * 6 + e.phase) * 0.1));
        _d.updateMatrix();
        this.eyeMesh.setMatrixAt(ei, _d.matrix);
        this.eyeMesh.setColorAt(ei, _col);
        ei++;
      }
    }
    this.eyeMesh.count = ei;
    this.eyeMesh.instanceMatrix.needsUpdate = true;
    if (this.eyeMesh.instanceColor) this.eyeMesh.instanceColor.needsUpdate = true;

    for (const key of Object.keys(this.renders)) {
      const r = this.renders[key];
      const t = r.type;
      // gather enemies of this type
      const arr = this.list.filter(e => e.key === key);
      if (!arr.length) {
        for (const part of r.parts) part.mesh.count = 0;
        continue;
      }
      for (const part of r.parts) {
        let n = 0;
        for (const e of arr) {
          if (n >= part.mesh.instanceMatrix.count) break;
          this.placePart(e, part.name, _d, time);
          _d.updateMatrix();
          part.mesh.setMatrixAt(n, _d.matrix);
          // tint: white flash on hit, darken while spawning, fade on death
          const f = e.flash * 0.9;
          let k = 1 - f * 0.55;
          let cr = k + f, cg = k + f * 0.75, cb = k + f * 0.5;
          if (e.state === 'spawn') { const s = e.scale; cr *= s; cg *= s; cb *= s * 1.2; }
          if (!e.alive) { const fader = clamp(1 - e.dying / 0.9, 0, 1); cr *= fader; cg *= fader; cb *= fader; }
          _col.setRGB(cr, cg, cb);
          part.mesh.setColorAt(n, _col);
          n++;
        }
        part.mesh.count = n;
        part.mesh.instanceMatrix.needsUpdate = true;
        if (part.mesh.instanceColor) part.mesh.instanceColor.needsUpdate = true;
      }
    }
  }

  placePart(e, name, d, time) {
    const t = e.type;
    const yaw = e.yaw;
    const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
    const sc = e.scale * (t.boss ? 1.0 : 1.0);

    // helper: local offset -> world
    const toWorld = (ox, oy, oz) => [_d.position.x, _d.position.y, _d.position.z] =
      [e.pos.x + ox * cosY + oz * sinY, e.pos.y + oy, e.pos.z - ox * sinY + oz * cosY];

    const bob = t.flying ? Math.sin(time * 6 + e.phase) * 0.06 : 0;
    const stride = Math.sin(e.phase) * 0.55;
    const stride2 = Math.sin(e.phase + Math.PI) * 0.55;
    const attackLean = e.state === 'attack' ? Math.sin(clamp(e.stateT / 0.35, 0, 1) * Math.PI) * 0.5 : 0;
    const staggerLean = e.state === 'stagger' ? -0.35 : 0;

    switch (name) {
      case 'body': {
        toWorld(0, bob, 0);
        d.rotation.set(staggerLean + attackLean * 0.5, yaw, 0);
        // death crumple
        if (!e.alive) d.rotation.set(1.2, yaw, 0.3);
        d.scale.setScalar(sc);
        break;
      }
      case 'wingL':
      case 'wingR': {
        const s = name === 'wingL' ? -1 : 1;
        toWorld(0, bob + 0.28, 0);
        d.rotation.set(0, yaw, Math.sin(time * 34 + e.phase) * 0.75 * s);
        d.scale.setScalar(sc);
        break;
      }
      default: {
        const pv = (t.legPivots && t.legPivots[name]) || (t.armPivots && t.armPivots[name]);
        if (!pv) { toWorld(0, bob, 0); d.rotation.set(0, yaw, 0); d.scale.setScalar(sc); break; }
        const [ox, oy, oz] = pv;
        const front = oy > 1.1 && oz > 0;
        let swing;
        if (name === 'legL') swing = stride;
        else if (name === 'legR') swing = stride2;
        else if (name === 'legL2') swing = stride2 * 0.9;
        else if (name === 'legR2') swing = stride * 0.9;
        else if (name === 'armL') swing = stride2 * 0.6 - attackLean * 1.6;
        else swing = stride * 0.6 - attackLean * 1.6;

        toWorld(ox, oy + bob, oz);
        d.rotation.set(swing, yaw, 0);
        d.scale.setScalar(sc);
      }
    }
  }

  clear() {
    this.list.length = 0;
    this.projectiles.length = 0;
    for (const key of Object.keys(this.renders)) {
      for (const part of this.renders[key].parts) part.mesh.count = 0;
    }
    this.projMesh.count = 0;
    if (this.eyeMesh) this.eyeMesh.count = 0;
  }
}
