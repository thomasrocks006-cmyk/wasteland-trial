import * as THREE from 'three';
import { Tokens, newAI, think, stun, endAttack, useCapturedAttacks, observe, fearKill } from './soldier_ai.js';
import {
  TAU, clamp, lerp, damp, dampAngle, smoothstep, rnd, rng, pick,
  terrainHeight, Builder, raySphere, angleTo, ARENA_R, addRim
} from './core.js';

const _d = new THREE.Object3D();
_d.rotation.order = 'YXZ';
const _v = new THREE.Vector3();
const _col = new THREE.Color();
const _tm = new THREE.Matrix4(), _tr = new THREE.Matrix4(), _tt = new THREE.Matrix4();
const DEATH_HOLD = 1.3;   // seconds a body lies there before sinking
const DEATH_T = 2.1;      // seconds until it is gone

/* ------------------------------------------------------------------ palettes */
/* bronze sentinels: mythic constructs of old bronze and marble, furnace-lit eyes */
const SKIN = {
  carapace: 0x5b4a36,
  plate: 0x9c7a44,
  plateDark: 0x3d3226,
  claw: 0xc9ad78,
  bone: 0xe0d6c2,
  eye: 0xff7a1a,
  eyeCold: 0x6fe0ff,
  metal: 0x8d8880,
  metalDark: 0x5b554e,
  rust: 0x8a4a28,
  flesh: 0x6b3f52,
};

/* ------------------------------------------------------------------ geometry
   Bronze constructs: rounded, plated and riveted, built smooth so the bronze
   catches the light. Part names, joints and sizes are unchanged, so the
   animation, hit zones and AI all work as before. */
const sB = () => new Builder({ smooth: true });
const sS = (r, w = 16, h = 12) => new THREE.SphereGeometry(r, w, h);
const sDome = (r) => new THREE.SphereGeometry(r, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2);
const sCap = (r, l) => new THREE.CapsuleGeometry(r, l, 5, 12);
const sTor = (r, t, arc = Math.PI * 2) => new THREE.TorusGeometry(r, t, 6, 18, arc);
const PATINA = 0x5e8a74, BRASS = 0xc9ad78, SLIT = 0x1a120c;

function gruntParts() {
  const body = sB();
  body.add(sS(0.2), SKIN.plateDark, { pos: [0, 0.98, -0.02], scale: [1.2, 0.8, 1] });                       // pelvis
  body.add(sCap(0.23, 0.3), SKIN.carapace, { pos: [0, 1.12, 0.03], rot: [0.45, 0, 0], scale: [1.15, 1, 0.95] }); // hunched torso
  body.add(sS(0.22), SKIN.plate, { pos: [0, 1.2, 0.15], rot: [0.45, 0, 0], scale: [1.15, 1.05, 0.62] });      // chest plate
  for (let k = 0; k < 3; k++) body.add(sTor(0.21 - k * 0.012, 0.02), BRASS, { pos: [0, 0.98 + k * 0.08, 0.02 + k * 0.04], rot: [Math.PI / 2 + 0.45, 0, 0] });
  body.add(sS(0.17), SKIN.plate, { pos: [0, 1.28, 0.16], scale: [1, 0.95, 1.15] });                           // helm
  body.add(sS(0.12), SKIN.carapace, { pos: [0, 1.19, 0.27], scale: [1.1, 0.8, 0.8] });                        // face guard
  body.add(sTor(0.165, 0.026, Math.PI), BRASS, { pos: [0, 1.29, 0.15], rot: [0, Math.PI / 2, 0] });           // crest
  body.add(new THREE.BoxGeometry(0.2, 0.03, 0.03), SLIT, { pos: [0, 1.27, 0.33] });                            // eye slit
  for (const sx of [-1, 1]) {
    body.add(sDome(0.15), SKIN.plate, { pos: [sx * 0.29, 1.33, 0.04], rot: [0, 0, -sx * 0.45] });             // pauldron
    body.add(sTor(0.15, 0.018), BRASS, { pos: [sx * 0.29, 1.33, 0.04], rot: [Math.PI / 2, -sx * 0.45, 0] });
  }
  for (let i = 0; i < 3; i++) body.add(new THREE.ConeGeometry(0.05, 0.18, 6), PATINA, { pos: [0, 1.36 - i * 0.1, -0.12 - i * 0.05], rot: [-0.6, 0, 0] });
  body.add(new THREE.BoxGeometry(0.03, 0.18, 0.02), SKIN.eye, { pos: [0, 1.18, 0.29], rot: [0.45, 0, 0] });   // chest rune

  const leg = () => {
    const b = sB();
    b.add(sCap(0.075, 0.2), SKIN.plateDark, { pos: [0, -0.17, 0] });
    b.add(sS(0.1), SKIN.plate, { pos: [0, -0.14, 0.04], scale: [1, 1.4, 0.85] });
    b.add(sS(0.072), BRASS, { pos: [0, -0.39, 0.03] });
    b.add(sCap(0.062, 0.22), SKIN.carapace, { pos: [0, -0.56, 0.01] });
    b.add(sS(0.09), SKIN.plateDark, { pos: [0, -0.74, 0.07], scale: [0.9, 0.55, 1.6] });
    for (const tx of [-0.05, 0, 0.05]) b.add(new THREE.ConeGeometry(0.022, 0.1, 6), BRASS, { pos: [tx, -0.76, 0.23], rot: [1.45, 0, 0] });
    return b.build();
  };
  const arm = () => {
    const b = sB();
    b.add(sCap(0.064, 0.17), SKIN.plate, { pos: [0, -0.13, 0] });
    b.add(sS(0.068), BRASS, { pos: [0, -0.29, 0.01] });
    b.add(sCap(0.058, 0.17), SKIN.carapace, { pos: [0, -0.44, 0.02] });
    b.add(sS(0.08), SKIN.plate, { pos: [0, -0.57, 0.03], scale: [1, 1.15, 1.1] });
    for (const tx of [-0.035, 0.035]) b.add(new THREE.ConeGeometry(0.025, 0.2, 6), BRASS, { pos: [tx, -0.66, 0.08], rot: [1.9, 0, tx * 4] });
    return b.build();
  };
  return { body: body.build(), legL: leg(), legR: leg(), armL: arm(), armR: arm() };
}

function shooterParts() {
  const body = sB();
  body.add(sS(0.16), SKIN.plateDark, { pos: [0, 1.02, 0], scale: [1.2, 0.8, 1] });
  body.add(sCap(0.19, 0.34), SKIN.plate, { pos: [0, 1.36, 0], scale: [1.15, 1, 0.85] });
  body.add(sS(0.19), SKIN.plate, { pos: [0, 1.43, 0.08], scale: [1.1, 1, 0.55] });                           // breastplate
  body.add(sTor(0.15, 0.016), BRASS, { pos: [0, 1.43, 0.17], scale: [1.1, 1, 1] });                          // its rim
  body.add(sTor(0.2, 0.022), BRASS, { pos: [0, 1.14, 0], rot: [Math.PI / 2, 0, 0], scale: [1.05, 0.85, 1] }); // belt
  body.add(new THREE.BoxGeometry(0.22, 0.36, 0.02), SKIN.carapace, { pos: [0, 0.94, 0.13] });               // tabard plates
  body.add(new THREE.BoxGeometry(0.22, 0.36, 0.02), SKIN.carapace, { pos: [0, 0.94, -0.13] });
  body.add(new THREE.BoxGeometry(0.16, 0.025, 0.025), BRASS, { pos: [0, 1.05, 0.145] });
  body.add(sCap(0.055, 0.08), SKIN.carapace, { pos: [0, 1.69, 0] });
  body.add(sS(0.15), SKIN.plate, { pos: [0, 1.84, 0], scale: [0.95, 1.1, 1.05] });                           // helm
  body.add(sTor(0.15, 0.026, Math.PI), BRASS, { pos: [0, 1.95, -0.02] });                                    // crescent crest
  body.add(new THREE.BoxGeometry(0.16, 0.035, 0.03), SLIT, { pos: [0, 1.85, 0.155] });
  for (const sx of [-1, 1]) body.add(sDome(0.12), SKIN.plate, { pos: [sx * 0.25, 1.6, 0], rot: [0, 0, -sx * 0.4] });
  // the bolt-caster on the right forearm
  body.add(new THREE.CylinderGeometry(0.075, 0.09, 0.46, 12), SKIN.metal, { pos: [0.34, 1.34, 0.16], rot: [Math.PI / 2 - 0.25, 0, 0] });
  body.add(new THREE.CylinderGeometry(0.05, 0.065, 0.16, 12), SKIN.metalDark, { pos: [0.34, 1.26, 0.4], rot: [Math.PI / 2 - 0.25, 0, 0] });
  for (const o of [0.2, 0.3]) body.add(sTor(0.09, 0.016), SKIN.eyeCold, { pos: [0.34, 1.3 - (o - 0.2) * 0.3, o], rot: [Math.PI / 2 - 0.25, 0, 0] });

  const leg = () => {
    const b = sB();
    b.add(sCap(0.07, 0.3), SKIN.plateDark, { pos: [0, -0.24, 0] });
    b.add(sS(0.068), BRASS, { pos: [0, -0.5, 0.02] });
    b.add(sCap(0.058, 0.3), SKIN.carapace, { pos: [0, -0.72, 0.01] });
    b.add(sS(0.08), SKIN.plate, { pos: [0, -0.68, 0.05], scale: [0.9, 1.9, 0.6] });                          // greave
    b.add(sS(0.08), SKIN.metal, { pos: [0, -0.96, 0.06], scale: [0.9, 0.55, 1.6] });
    return b.build();
  };
  const arm = () => {
    const b = sB();
    b.add(sCap(0.055, 0.17), SKIN.plate, { pos: [0, -0.13, 0] });
    b.add(sS(0.058), BRASS, { pos: [0, -0.29, 0.01] });
    b.add(sCap(0.05, 0.17), SKIN.carapace, { pos: [0, -0.43, 0.02] });
    b.add(sS(0.06), BRASS, { pos: [0, -0.56, 0.03] });
    return b.build();
  };
  return { body: body.build(), legL: leg(), legR: leg(), armL: arm(), armR: arm() };
}

function bruteParts() {
  const body = sB();
  body.add(sCap(0.55, 0.8), SKIN.carapace, { pos: [0, 1.12, -0.05], rot: [Math.PI / 2, 0, 0], scale: [1.05, 1, 0.92] }); // barrel
  body.add(sS(0.52), SKIN.plate, { pos: [0, 1.42, 0.32], scale: [1.05, 0.85, 1.1] });                                   // hump
  for (let k = 0; k < 3; k++) body.add(sTor(0.57, 0.035), BRASS, { pos: [0, 1.12, -0.5 + k * 0.42], scale: [1.02, 0.94, 1] }); // flank bands
  body.add(sS(0.34), SKIN.plateDark, { pos: [0, 1.2, 0.98], scale: [0.95, 0.85, 1.15] });                              // head
  body.add(sS(0.2), SKIN.carapace, { pos: [0, 1.05, 1.27], scale: [1.1, 0.85, 1] });                                    // muzzle
  body.add(sTor(0.08, 0.02), BRASS, { pos: [0, 0.96, 1.42], rot: [0.3, 0, 0] });                                        // nose ring
  body.add(new THREE.BoxGeometry(0.4, 0.035, 0.03), SLIT, { pos: [0, 1.31, 1.27] });
  for (const sx of [-1, 1]) {
    // horns: a thick root sweeping out, then a tip curving forward
    body.add(new THREE.CylinderGeometry(0.06, 0.11, 0.45, 10), SKIN.bone, { pos: [sx * 0.36, 1.46, 0.92], rot: [-0.3, 0, -sx * 1.0] });
    body.add(new THREE.ConeGeometry(0.06, 0.4, 10), SKIN.bone, { pos: [sx * 0.6, 1.66, 1.04], rot: [0.5, 0, -sx * 0.25] });
  }
  for (let i = 0; i < 5; i++) body.add(new THREE.ConeGeometry(0.1 - i * 0.012, 0.32, 6), PATINA, { pos: [0, 1.82 - i * 0.05, 0.5 - i * 0.36], rot: [-0.3, 0, 0] });
  body.add(sCap(0.08, 0.6), SKIN.plateDark, { pos: [0, 1.0, -1.15], rot: [-1.9, 0, 0] });                              // tail
  body.add(sS(0.12), BRASS, { pos: [0, 0.75, -1.4] });
  const leg = (front) => {
    const b = sB();
    b.add(sS(0.22), SKIN.plate, { pos: [0, -0.12, 0], scale: [0.9, 1.1, 1] });
    b.add(sCap(0.13, 0.32), SKIN.carapace, { pos: [0, -0.48, front ? 0.04 : -0.02] });
    b.add(sS(0.11), BRASS, { pos: [0, -0.68, 0.02] });
    b.add(new THREE.CylinderGeometry(0.15, 0.19, 0.18, 12), SKIN.plateDark, { pos: [0, -0.86, 0.04] });                // hoof
    return b.build();
  };
  return { body: body.build(), legL: leg(true), legR: leg(true), legL2: leg(false), legR2: leg(false) };
}

/* stonekin: the grunt's body, carved in moss-streaked stone instead of bronze. The grunt's colours are
   remapped by lightness onto a cool grey-green ramp, so every plate, band and joint keeps its shading. */
function stonekinParts() {
  const parts = gruntParts();
  for (const g of Object.values(parts)) {
    const a = g.attributes.color.array;
    for (let i = 0; i < a.length; i += 3) {
      // the grunt's orange rune and eye slit become cold cyan light; everything else is weathered grey-green stone
      if (a[i] > 0.85 && a[i + 1] < 0.6 && a[i + 2] < 0.2) { a[i] = 0.45; a[i + 1] = 0.95; a[i + 2] = 1.0; continue; }
      const l = Math.min(1, (a[i] * 0.3 + a[i + 1] * 0.59 + a[i + 2] * 0.11) * 1.5);
      a[i] = 0.26 + l * 0.3; a[i + 1] = 0.3 + l * 0.34; a[i + 2] = 0.26 + l * 0.24;
    }
    g.attributes.color.needsUpdate = true;
  }
  return parts;
}

/* wolves of the vale: lean grey fur, a long muzzle, a tail held low. Four legs on the
   same pivots the brute uses, so the existing stride animation runs them. */
const FUR = { coat: 0x8a8984, coatDark: 0x5a5953, belly: 0xc8c2b2, ear: 0x403f3b };
function wolfParts() {
  const body = sB();
  body.add(sCap(0.24, 0.62), FUR.coat, { pos: [0, 0.74, -0.02], rot: [Math.PI / 2, 0, 0], scale: [0.95, 1, 1.05] });       // barrel
  body.add(sS(0.22), FUR.belly, { pos: [0, 0.62, 0.04], scale: [0.85, 0.6, 1.9] });                                          // pale belly
  body.add(sS(0.3), FUR.coatDark, { pos: [0, 0.9, 0.34], scale: [0.95, 0.9, 1.0] });                                         // shoulder ruff
  body.add(sCap(0.11, 0.3), FUR.coat, { pos: [0, 0.96, 0.62], rot: [0.9, 0, 0] });                                           // neck
  body.add(sS(0.19), FUR.coat, { pos: [0, 1.02, 0.78], scale: [0.95, 0.9, 1.15] });                                          // head
  body.add(sCap(0.085, 0.18), FUR.coatDark, { pos: [0, 0.97, 0.98], rot: [Math.PI / 2 - 0.15, 0, 0] });                      // muzzle
  body.add(sS(0.04), 0x15110e, { pos: [0, 0.99, 1.1] });                                                                       // nose
  for (const sx of [-1, 1]) {
    body.add(new THREE.ConeGeometry(0.06, 0.17, 6), FUR.ear, { pos: [sx * 0.1, 1.2, 0.72], rot: [-0.15, 0, -sx * 0.18] });     // ears
    body.add(new THREE.ConeGeometry(0.014, 0.05, 5), SKIN.bone, { pos: [sx * 0.045, 0.9, 1.05], rot: [Math.PI, 0, 0] });          // fangs
  }
  body.add(new THREE.BoxGeometry(0.2, 0.025, 0.03), SLIT, { pos: [0, 1.06, 0.93] });                                            // eye slit
  body.add(sCap(0.07, 0.5), FUR.coatDark, { pos: [0, 0.74, -0.62], rot: [-1.15, 0, 0] });                                      // tail
  for (let i = 0; i < 4; i++) body.add(new THREE.ConeGeometry(0.06 - i * 0.008, 0.2, 5), FUR.coatDark, { pos: [0, 1.06 - i * 0.035, 0.52 - i * 0.2], rot: [-0.25, 0, 0] }); // hackles
  const leg = (front) => {
    const b = sB();
    b.add(sS(0.13), FUR.coat, { pos: [0, -0.06, 0], scale: [0.9, 1.15, 1.1] });
    b.add(sCap(0.06, 0.26), FUR.coatDark, { pos: [0, -0.28, front ? 0.03 : -0.04] });
    b.add(sS(0.065), FUR.coatDark, { pos: [0, -0.5, 0.05], scale: [1, 0.7, 1.4] });
    return b.build();
  };
  return { body: body.build(), legL: leg(true), legR: leg(true), legL2: leg(false), legR2: leg(false) };
}

function waspParts() {
  const body = sB();
  body.add(sS(0.16), SKIN.plate, { pos: [0, 0, 0.05], scale: [0.9, 0.85, 1.2] });                // thorax
  body.add(sCap(0.11, 0.3), SKIN.carapace, { pos: [0, -0.05, -0.3], rot: [Math.PI / 2 + 0.25, 0, 0] }); // abdomen
  for (let k = 0; k < 3; k++) body.add(sTor(0.105, 0.015), BRASS, { pos: [0, -0.05 - k * 0.035, -0.2 - k * 0.12], rot: [0.25, 0, 0] });
  body.add(new THREE.ConeGeometry(0.04, 0.2, 8), SKIN.bone, { pos: [0, -0.15, -0.6], rot: [-Math.PI / 2 - 0.25, 0, 0] }); // stinger
  body.add(sS(0.1), SKIN.plateDark, { pos: [0, 0.04, 0.3] });                                     // head
  for (const sx of [-1, 1]) {
    body.add(new THREE.ConeGeometry(0.02, 0.16, 6), BRASS, { pos: [sx * 0.05, 0.13, 0.38], rot: [0.6, 0, -sx * 0.3] }); // feelers
    for (let i = 0; i < 3; i++) body.add(new THREE.CylinderGeometry(0.012, 0.018, 0.26, 6), SKIN.claw, { pos: [sx * 0.1, -0.14, 0.12 - i * 0.1], rot: [0.4, 0, sx * 0.5] });
  }
  const wing = sB();
  // three bronze feather-blades fanned out
  for (let i = 0; i < 3; i++) wing.add(new THREE.BoxGeometry(0.62 - i * 0.12, 0.012, 0.11), i ? 0xd8b870 : 0xe6c888, { pos: [0.31 - i * 0.03, 0, -i * 0.07], rot: [0, i * 0.18, 0] });
  return { body: body.build(), wingL: wing.build(), wingR: wing.build() };
}

function bossParts() {
  const body = sB();
  body.add(sS(0.85), SKIN.carapace, { pos: [0, 1.5, 0], scale: [1.0, 0.75, 1.05] });               // the head segment
  body.add(sS(0.6), SKIN.plateDark, { pos: [0, 1.55, 1.0], scale: [1.05, 0.85, 0.95] });            // skull
  body.add(new THREE.BoxGeometry(0.7, 0.05, 0.05), SLIT, { pos: [0, 1.72, 1.52] });
  for (const sx of [-1, 1]) {
    body.add(new THREE.ConeGeometry(0.13, 0.75, 10), SKIN.claw, { pos: [sx * 0.34, 1.25, 1.75], rot: [1.45, 0, -sx * 0.35] }); // mandibles
    body.add(sDome(0.55), SKIN.plate, { pos: [sx * 0.85, 1.75, 0.45], rot: [0, 0, -sx * 0.5] });                               // shoulder plates
  }
  for (let i = 0; i < 4; i++) body.add(new THREE.ConeGeometry(0.16, 0.6, 8), SKIN.bone, { pos: [0, 2.15 - i * 0.04, 0.9 - i * 0.4], rot: [-0.35, 0, 0] }); // crest
  body.add(sTor(0.86, 0.05), BRASS, { pos: [0, 1.5, 0], rot: [Math.PI / 2, 0, 0], scale: [1, 1.05, 1] });
  const leg = () => {
    const b = sB();
    b.add(sCap(0.22, 0.6), SKIN.carapace, { pos: [0, -0.45, 0] });
    b.add(sS(0.2), BRASS, { pos: [0, -0.82, 0.05] });
    b.add(sCap(0.16, 0.45), SKIN.plateDark, { pos: [0, -1.1, 0.1] });
    b.add(new THREE.ConeGeometry(0.17, 0.4, 8), SKIN.claw, { pos: [0, -1.45, 0.18], rot: [0.3, 0, 0] });
    return b.build();
  };
  return { body: body.build(), legL: leg(), legR: leg(), legL2: leg(), legR2: leg() };
}

/** one trailing boss segment, built at full size and tapered per instance */
function bossSegmentGeo() {
  const b = sB();
  b.add(sS(0.8), SKIN.plate, { pos: [0, 1.5, 0], scale: [1.0, 0.72, 0.92] });
  b.add(sTor(0.78, 0.045), BRASS, { pos: [0, 1.5, 0], rot: [Math.PI / 2, 0, 0], scale: [1, 0.95, 1] });
  b.add(sDome(0.6), SKIN.plateDark, { pos: [0, 1.85, 0], scale: [1.1, 0.5, 0.9] });
  b.add(new THREE.ConeGeometry(0.15, 0.55, 8), SKIN.bone, { pos: [0, 2.3, 0], rot: [-0.25, 0, 0] });
  for (const sx of [-1, 1]) {
    b.add(sCap(0.11, 1.0), SKIN.carapace, { pos: [sx * 0.95, 0.75, 0], rot: [0, 0, sx * 0.5] });
    b.add(new THREE.ConeGeometry(0.1, 0.25, 8), SKIN.claw, { pos: [sx * 1.22, 0.08, 0], rot: [Math.PI, 0, 0] });
  }
  return b.build();
}
const BOSS_SEGS = 6;
const SEG_GAP = 1.32;
const segScale = (i) => 1 - (i + 1) * 0.085;

/* ------------------------------------------------------------------ types */
export const ENEMY_TYPES = {
  /* the vale's armed men. They are skinned soldiers (soldiers.js) fought by soldier_ai.js. */
  footman: {
    key: 'footman', soldier: true, style: 'footman', hp: 85, speed: 3.1, radius: 0.5, height: 1.78, headY: 1.62, headR: 0.15,
    dmg: 12, reach: 2.1, score: 110, hudName: 'FOOTMAN', shield: true, attacks: ['slash', 'slash', 'bash'], parries: 0,
  },
  swordsman: {
    key: 'swordsman', soldier: true, style: 'swordsman', hp: 65, speed: 3.9, radius: 0.48, height: 1.78, headY: 1.62, headR: 0.15,
    dmg: 11, reach: 2.1, score: 100, hudName: 'SWORDSMAN', attacks: ['slash', 'slash'], parries: 0.3,
  },
  spearman: {
    key: 'spearman', soldier: true, style: 'spearman', hp: 75, speed: 3.0, radius: 0.5, height: 1.82, headY: 1.66, headR: 0.15,
    dmg: 13, reach: 3.1, score: 130, hudName: 'SPEARMAN', shield: true, attacks: ['thrust', 'thrust', 'slash'], parries: 0,
  },
  shooter: {
    key: 'shooter', soldier: true, style: 'crossbow', hp: 55, speed: 2.9, radius: 0.46, height: 1.75, headY: 1.6, headR: 0.15,
    dmg: 14, reach: 22, score: 140, hudName: 'CROSSBOWMAN', ranged: true, attacks: ['shoot'],
  },
  captain: {
    key: 'captain', soldier: true, style: 'captain', hp: 210, speed: 2.9, radius: 0.55, height: 1.98, headY: 1.82, headR: 0.17, armor: 0.7,
    dmg: 24, reach: 2.4, score: 420, hudName: 'CAPTAIN', heavy: true, attacks: ['heavy', 'slash', 'slash'], parries: 0.2, feints: 0.3,
  },
  boss: {
    key: 'boss', soldier: true, style: 'warlord', hp: 780, speed: 3.0, radius: 0.62, height: 2.2, headY: 2.0, headR: 0.18, armor: 0.6,
    dmg: 28, reach: 2.7, score: 2500, hudName: 'WARLORD', boss: true, heavy: true, shield: true, attacks: ['heavy', 'slash', 'bash', 'slash'], parries: 0.15, feints: 0.25,
  },
  wolf: {
    key: 'wolf', hp: 58, speed: 6.6, radius: 0.5, height: 1.0, headY: 1.0, headR: 0.2, eye: [0.05, 1.06, 0.94],
    dmg: 9, attackRange: 1.7, attackCd: 1.25, score: 110, hudName: 'WOLF', windup: 0.3, matte: true,
    parts: wolfParts, partList: ['body', 'legL', 'legR', 'legL2', 'legR2'],
    legPivots: { legL: [-0.15, 0.66, 0.42], legR: [0.15, 0.66, 0.42], legL2: [-0.15, 0.66, -0.4], legR2: [0.15, 0.66, -0.4] },
  },
};

/* ------------------------------------------------------------------ instancers */
// generous: an enemy past its type's cap is simulated but never drawn, which reads as being hit by nothing
const MAX_PER_TYPE = { wolf: 40 };
const DRAW_SOLDIERS = 12;
const CLOTH_SOLDIERS = 4;        // tabards simulated at once (the nearest); the rest ride the hips rigidly      // skinned soldiers drawn at once (about 7 draw calls each)

class TypeRender {
  constructor(scene, type) {
    this.type = type;
    this.geos = type.parts();
    this.parts = [];
    // cool violet rim: hostiles read as a silhouette even against bright ground
    // polished bronze: a specular sheen, plus the warm rim that separates them from the forest
    const mat = addRim(new THREE.MeshPhongMaterial({ vertexColors: true, shininess: type.matte ? 8 : 42, specular: type.matte ? 0x2a2a28 : 0x7a5a28 }), type.boss ? 0xff7a40 : (type.matte ? 0xdfe8dc : 0xffd9a0), 0.35, 2.6);
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
    for (const k of Object.keys(ENEMY_TYPES)) if (!ENEMY_TYPES[k].soldier) this.renders[k] = new TypeRender(scene, ENEMY_TYPES[k]);
    this.tokens = new Tokens();      // who may attack right now
    this.factory = null;             // set once the soldier asset is loaded

    // enemy projectiles
    const geo = new THREE.SphereGeometry(0.14, 6, 5);
    this.projMesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false
    }), 64);
    // per-bolt colour: the boss's orange bolts used to render the same blue as everyone's
    this.projMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(64 * 3), 3);
    this.projMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.projMesh.frustumCulled = false;
    this.projMesh.count = 0;
    scene.add(this.projMesh);
    this.projectiles = [];

    // glowing eyes so a threat is readable at range
    const eyeGeo = new THREE.SphereGeometry(0.075, 8, 6);   // small furnace-lit eyes; 0.13 read as white blobs up close
    this.eyeMesh = new THREE.InstancedMesh(eyeGeo, new THREE.MeshBasicMaterial({
      transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false
    }), 160);
    this.eyeMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(160 * 3), 3);
    this.eyeMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.eyeMesh.frustumCulled = false;
    this.eyeMesh.count = 0;
    scene.add(this.eyeMesh);

    // trailing boss body: one instanced mesh for every segment of every boss
    this.segMesh = new THREE.InstancedMesh(bossSegmentGeo(), addRim(new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 42, specular: 0x7a5a28 }), 0xff7a40, 0.4, 2.6), BOSS_SEGS * 2);
    this.segMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.segMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(BOSS_SEGS * 2 * 3), 3);
    this.segMesh.castShadow = true;
    this.segMesh.frustumCulled = false;
    this.segMesh.count = 0;
    scene.add(this.segMesh);

    this.windupMul = 1;        // wander lengthens every melee tell so a parry is catchable on a phone
    this.onKill = null;
    this.onHit = null;         // (enemy, head, killed) for hit markers
    this.onEnrage = null;
  }

  setFactory(f) { this.factory = f; if (f && f.clips) useCapturedAttacks(f.clips); }
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
      chargeCd: rnd(2.5, 5), pendingHit: 0,
    };
    if (t.soldier && this.factory) {
      e.view = this.factory.create(t.style); this.scene.add(e.view.root);
      e.ai = newAI(e); e.state = 'chase'; e.spawnT = 1; e.scale = 1;
      e.yaw = this.player ? Math.atan2(this.player.pos.x - x, this.player.pos.z - z) : e.yaw;
    }
    if (t.boss && !t.soldier) {
      e.speed = t.speed;
      // face the hero from the start, body laid out straight behind
      if (this.player) e.yaw = Math.atan2(this.player.pos.x - x, this.player.pos.z - z);
      e.segs = [];
      for (let i = 0; i < BOSS_SEGS; i++) {
        const sx = x - Math.sin(e.yaw) * SEG_GAP * (i + 1), sz = z - Math.cos(e.yaw) * SEG_GAP * (i + 1);
        e.segs.push({ x: sx, z: sz, y: terrainHeight(sx, sz), yaw: e.yaw });
      }
    }
    this.list.push(e);
    if (this.fx && !e.view) {
      // summoned in a ring of rune light
      this.fx.ring(new THREE.Vector3(x, terrainHeight(x, z) + 0.1, z), 0xd8c8a8, 2.4, 0.7);
      this.fx.ecoBurst(new THREE.Vector3(x, terrainHeight(x, z) + 0.8, z), 0xb8a888, 12, 0.8);
    }
    return e;
  }

  /* ---------------- damage ---------------- */
  /**
   * A blow lands on e. info: { heavy, breaks, riposte, exec }. Returns 'blocked' when a raised shield or a quick blade turned it,
   * otherwise 'hit'. A shield soldier's front is closed to light blows: break it with a heavy blow, a shield bash, or by
   * going round behind.
   */
  hit(e, amount, point, dir, head, weapon, info = null) {
    if (!e.alive) return null;
    const ai = e.ai;
    if (ai && !(info && info.exec)) {
      const contact = info && info.contact, breaks0 = info && (info.heavy || info.breaks);
      // the blade met his shield (it is solid, raised or not): it stops there, unless a heavy blow smashes it aside
      if (contact === 'shield') {
        if (!breaks0 || ai.mode === 'stun') { if (e.view) e.view.kick = 1; if (this.onBlocked) this.onBlocked(e, point); return 'blocked'; }
        stun(this, e, 1.4); if (e.view) { e.view.kick = 1.6; e.view.playReact('Idle_Shield_Break', 1.1, 0.05); }
        e.hp -= amount * 0.3; e.flash = 1; if (e.passive && !e.aggro) this.alert(e);
        if (e.hp <= 0) this.kill(e);
        return 'broke';
      }
      // the blade met his, mid-swing: a clash. Both are thrown back; his attack is broken
      if (contact === 'blade') {
        endAttack(this, e, rnd(0.9, 1.5));
        if (e.view) { e.view.kick = 1; e.view.hitReact(false); }
        e.vel.addScaledVector(new THREE.Vector3(dir ? dir.x : 0, 0, dir ? dir.z : 0), 2.4);
        if (e.passive && !e.aggro) this.alert(e);
        return 'clash';
      }
      const frontal = dir && Math.abs(angleTo(e.yaw, Math.atan2(-dir.x, -dir.z))) < 1.15;
      const guarded = ai.guarding && e.type.shield && ai.mode !== 'stun';
      const quick = !guarded && e.type.parries && (ai.mode === 'circle' || ai.mode === 'close') && Math.random() < e.type.parries * (info && info.riposte ? 0.0 : 1);
      const breaks = info && (info.heavy || info.breaks);
      if (frontal && (guarded || quick) && !breaks) {
        // the blow rings off a shield or a parrying blade
        if (this.fx && point) { this.fx.spark(point, dir ? dir.clone().negate() : new THREE.Vector3(0, 1, 0), 0xffe6a0, 9, 6, 0.1, 0.3); this.fx.ring(point, 0xffd9a0, 0.9, 0.18); }
        if (this.audio && this.audio.clang) this.audio.clang(2, false);
        if (e.view) e.view.kick = 1;
        if (quick && ai.mode !== 'stun') { ai.cd = Math.min(ai.cd, 0.25); if (e.view) e.view.playReact('Sword_Block', 1.6, 0.15); }
        if (this.onBlocked) this.onBlocked(e, point);
        return 'blocked';
      }
      if (guarded && breaks) { stun(this, e, 1.5); if (e.view) e.view.playReact('Idle_Shield_Break', 1.1, 0.05); if (this.fx && point) this.fx.ring(point, 0xffb040, 2.2, 0.3); if (this.audio && this.audio.roar) this.audio.roar(6); }
      if (e.type.armor && !(info && (info.heavy || info.riposte || info.exec))) amount *= e.type.armor;
    }
    e.hp -= amount;
    e.flash = 1;
    e.hurtT = 0.12;
    if (this.fx && point) {
      this.fx.hitSpark(point, dir ? dir.clone().negate() : new THREE.Vector3(0, 1, 0), head);
      this.fx.damageNumber(point, amount, head);
    }
    if (this.audio) this.audio.hitmarker(head);
    if (dir) e.lastDir = dir;
    e.lastAmount = amount;
    if (e.passive && !e.aggro) this.alert(e);         // strike a patrol and it fights back
    if (this.onHit) this.onHit(e, head, e.hp <= 0);
    // a big hit breaks a brute's charge; it waits before trying again
    if ((e.state === 'windup' || e.state === 'charge') && amount > 60) e.chargeCd = rnd(3, 5);
    if (e.ai) {
      // a soldier flinches from a real blow and loses the attack he was winding up
      const need = e.type.heavy ? 45 : 22;
      if (amount >= need && e.ai.mode !== 'stun') this.stagger(e, e.type.heavy ? 0.35 : 0.5);
    } else if (e.type.heavy) {
      if (amount > 60) { e.state = 'stagger'; e.stateT = 0.25; }
    } else if (amount > 24) {
      e.state = 'stagger'; e.stateT = 0.18;
    }
    // knockback
    if (dir && !e.type.boss) {
      const kb = e.type.heavy ? 0.35 : 1.0;
      e.vel.addScaledVector(new THREE.Vector3(dir.x, 0, dir.z).normalize(), amount * 0.05 * kb);
    }
    if (e.view && e.hp > 0) { if (amount >= 45 && !e.kneeled && !(e.ai && e.ai.mode === 'stun')) e.view.playReact('Hit_Knockback', 1.3); else e.view.hitReact(!!head); }
    if (e.hp <= 0) this.kill(e);
    else if (e.ai && !e.type.boss && !e.kneeled && e.hp < e.maxHp * 0.28) {
      // beaten: he goes down on one knee, open to a finishing move, then gets up hurt
      e.kneeled = true; stun(this, e, 2.2); if (e.view) e.view.kneel = 2.2;
      if (this.onBeaten) this.onBeaten(e);
    }
    return 'hit';
  }

  /** knocked off balance for a moment: it cannot act, and a blow it was winding up is lost */
  stagger(e, dur) {
    if (!e.alive || e.state === 'spawn') return;
    if (e.type.boss) dur *= 0.35;
    if (e.ai && e.ai.mode !== 'stun') { endAttack(this, e, 0.7); e.ai.mode = 'circle'; }
    e.pendingHit = 0; e.state = 'stagger'; e.stateT = 0; e.staggerDur = Math.max(e.staggerDur || 0, dur); e.flash = 1;
  }

  stun(e, dur) { if (e.alive && e.ai) stun(this, e, dur); }
  releaseToken(e) { this.tokens.release(e); }

  /** open to a finishing move: stunned, or beaten down and staggered */
  isExecutable(e) { return !!(e.alive && e.ai && (e.ai.mode === 'stun' || (e.state === 'stagger' && e.hp < e.maxHp * 0.35))); }

  /** a parry: whoever struck from (x, z) is thrown off balance and left open */
  parried(x, z, src = null) {
    let best = src && src.alive ? src : null, bd = 7;
    if (!best) for (const e of this.list) {
      if (!e.alive) continue;
      const d = Math.hypot(e.pos.x - x, e.pos.z - z);
      if (d < bd) { bd = d; best = e; }
    }
    if (!best) return null;
    if (best.ai) { stun(this, best, best.type.boss ? 1.1 : 1.9); best.state = 'chase'; if (best.view) best.view.hitReact(true); return best; }
    best.pendingHit = 0;
    best.state = 'stagger'; best.stateT = 0; best.staggerDur = best.type.boss ? 0.7 : 1.3;
    best.flash = 1; best.attackCd = Math.max(best.attackCd, 1.0);
    if (this.fx) this.fx.ring(new THREE.Vector3(best.pos.x, best.pos.y + 1.1, best.pos.z), 0xffd8a0, 2.2, 0.4);
    return best;
  }

  /** a patrol has seen you: it and its group turn to fight */
  alert(e) {
    for (const o of this.list) {
      if (!o.alive || !o.passive || o.aggro) continue;
      if (o !== e && (o.group !== e.group || Math.hypot(o.pos.x - e.pos.x, o.pos.z - e.pos.z) > 28)) continue;
      o.aggro = true;
      o.attackCd = Math.max(o.attackCd, 0.6);
      if (this.fx) this.fx.ring(new THREE.Vector3(o.pos.x, o.pos.y + 0.1, o.pos.z), 0xff9a40, 1.8, 0.5);
    }
    if (this.audio) this.audio.roar(Math.hypot(e.pos.x - this.player.pos.x, e.pos.z - this.player.pos.z) * 0.6);
    if (this.onAlert) this.onAlert(e);
  }

  kill(e) {
    if (!e.alive) return;
    e.alive = false;
    e.dying = 0;
    e.state = 'dead';
    if (e.view) { e.view.die(); this.tokens.release(e); e.ai.mode = 'dead'; e.ai.tell = null; e.view.setLayer(null); }
    // the killing blow throws the body: away from the shot, up, and tumbling over
    if (!e.type.boss && !e.view) {
      const d = e.lastDir || new THREE.Vector3(-Math.sin(e.yaw), 0, -Math.cos(e.yaw));
      const hx = d.x, hz = d.z, hl = Math.hypot(hx, hz) || 1;
      const heavy = e.type.heavy ? 0.35 : 1;
      const push = (3 + Math.min(e.lastAmount || 30, 160) * 0.045) * heavy;
      e.dv = new THREE.Vector3((hx / hl) * push, (3.2 + push * 0.35) * heavy, (hz / hl) * push);
      e.tumbleAxis = new THREE.Vector3(hz / hl, 0, -hx / hl);     // falls away from the shooter
      e.tumbleW = (e.type.heavy ? 3 : 7) * (0.8 + rng() * 0.4);
      e.tumble = 0;
    }
    // a blast (the Storm, a launching blow) throws a soldier's body too: it flies while the death clip plays
    if (e.view && e.blast && !e.type.boss) { e.dv = new THREE.Vector3(e.blast.x, e.blast.y || 4.2, e.blast.z); e.tumble = 0; e.tumbleW = 0; e.tumbleAxis = null; }
    if (this.fx && e.view) { this.fx.puff(new THREE.Vector3(e.pos.x, e.pos.y + 0.8, e.pos.z), null, 0x6a5a48, 0.6, 3, 0.9, 1.4); }
    else if (this.fx) {
      const p = new THREE.Vector3(e.pos.x, e.pos.y + e.type.height * 0.5, e.pos.z);
      this.fx.ecoBurst(p, e.type.boss ? 0xff8040 : (e.key === 'wasp' ? 0xffd060 : 0x37e0c8), e.type.boss ? 40 : 16, e.type.boss ? 2 : 1);
      this.fx.puff(p, null, 0x6a5a48, e.type.boss ? 2.2 : 0.7, e.type.boss ? 8 : 2, 1.1, 1.6);
    }
    if (this.audio) this.audio.enemyDeath(0);
    if (e.ai) fearKill(this, e);
    if (this.onKill) this.onKill(e);
  }

  /* ---------------- explosions ---------------- */
  explode(pos, radius, dmg, falloff = 0.45) {
    let hurt = 0;
    for (const e of this.list) {
      if (!e.alive) continue;
      let dx = e.pos.x - pos.x, dy = (e.pos.y + e.type.height * 0.5) - pos.y, dz = e.pos.z - pos.z;
      let d = Math.hypot(dx, dy, dz);
      if (e.segs) {
        // the boss is long: a blast on its tail still lands
        for (const sg of e.segs) {
          const sd = Math.hypot(sg.x - pos.x, sg.y + 1.4 - pos.y, sg.z - pos.z);
          if (sd < d) { d = sd; dx = sg.x - pos.x; dy = sg.y + 1.4 - pos.y; dz = sg.z - pos.z; }
        }
      }
      if (d > radius + e.type.radius) continue;
      hurt++;
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
    return hurt;
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
      if (e.segs) {
        for (let i = 0; i < e.segs.length; i++) {
          const sg = e.segs[i], k = segScale(i);
          const tt = raySphere(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z,
            sg.x, sg.y + 1.45 * k, sg.z, 1.0 * k, maxDist);
          if (tt >= 0 && (dist < 0 || tt < dist)) { dist = tt; head = false; }
        }
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
    this.lastDt = dt;
    const p = this.player;
    const pp = p.pos;
    observe(this, dt);

    let i = 0;
    while (i < this.list.length) {
      const e = this.list[i];
      if (!e.alive) {
        e.dying += dt;
        if (e.dying > (e.view ? 4.2 : DEATH_T)) { if (e.view) e.view.dispose(); this.list.splice(i, 1); continue; }
        if (e.view) {
          // a soldier falls by the captured death clip, lies a while, then sinks
          if (e.dv && e.dying < 2.5) this.updateCorpse(e, dt);      // a blasted body flies while the death clip plays
          else if (e.dying > 3.0) e.pos.y -= dt * 0.7;
          e.scale = 1;
          e.view.root.position.copy(e.pos); e.view.root.rotation.y = e.yaw;
          e.view.update(dt, { speed: 0, drawn: true, guard: false, dist: e.pos.distanceTo(pp) });
          i++; continue;
        }
        if (e.dv) this.updateCorpse(e, dt);
        else {
          // the boss sinks in place
          e.pos.y -= dt * 1.6;
          if (e.segs) for (const sg of e.segs) sg.y -= dt * 1.6;
        }
        // lie there a moment, then sink and fade
        e.scale = clamp(1 - (e.dying - DEATH_HOLD) / (DEATH_T - DEATH_HOLD), 0, 1);
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
    e.chargeCd -= dt;
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

    // a swing resolves on the game clock: it used to be a setTimeout, which landed
    // while paused and could hit the next run after a restart
    if (e.pendingHit > 0) {
      e.pendingHit -= dt;
      if (e.pendingHit <= 0) this.resolveMelee(e);
    }

    // always face the player unless staggered; a charging brute is committed
    if (e.passive && !e.aggro) { /* a patrol faces where it walks (below) */ }
    else if (e.state === 'charge') e.yaw = Math.atan2(e.chargeX, e.chargeZ);
    else if (e.state !== 'stagger' && !(e.ai && e.ai.noFace)) {
      e.yaw = dampAngle(e.yaw, Math.atan2(dx, dz), e.type.boss ? 3.2 : e.ai ? 9 : 7, dt);
    }

    let moveX = 0, moveZ = 0;
    let speed = e.speed;

    if (e.passive && !e.aggro) {
      // on patrol: amble between points near home, watching for the hero
      if (!e.wp || Math.hypot(e.wp.x - e.pos.x, e.wp.z - e.pos.z) < 1.2 || e.stateT > 10) {
        const hr = e.homeR || 10; e.wp = { x: e.home.x + rnd(-hr, hr), z: e.home.z + rnd(-hr, hr) }; e.stateT = 0;
      }
      const wx = e.wp.x - e.pos.x, wz = e.wp.z - e.pos.z, wl = Math.hypot(wx, wz) || 1;
      e.yaw = dampAngle(e.yaw, Math.atan2(wx, wz), 3, dt);
      moveX = wx / wl; moveZ = wz / wl; speed = e.speed * 0.3;
      if (dist < (t.key === 'shooter' ? 24 : 16)) this.alert(e);
    } else if (e.state === 'stagger') {
      if (e.stateT > (e.staggerDur || 0.22)) { e.state = 'chase'; e.stateT = 0; e.staggerDur = 0; }
    } else if (e.ai) {
      // a soldier: the AI decides where to go and what to do; the integration below moves him
      const o = think(this, e, dt, dist, dirX, dirZ, pp);
      moveX = o.mx; moveZ = o.mz; speed = o.speed; e.ai.noFace = !o.face;
    } else if (t.key === 'colossus') {
      // the Stone Warden: it raises both fists (a long, readable tell), then brings them down. The shock
      // runs out along the ground: jump it, or be somewhere else. Below half health it also rings the room with bolts.
      if (!e.enraged && e.hp < e.maxHp * 0.5) {
        e.enraged = true; e.speed *= 1.25; e.novaCd = 1.5;
        if (this.fx) this.fx.ring(new THREE.Vector3(e.pos.x, e.pos.y + 0.2, e.pos.z), 0x9ff4c0, 10, 0.9);
        if (this.audio) this.audio.roar(dist, true);
        if (this.onEnrage) this.onEnrage(e);
      }
      if (e.enraged) { e.novaCd -= dt; if (e.novaCd <= 0) { this.nova(e); e.novaCd = 6; } }
      e.volleyCd = (e.volleyCd === undefined ? rnd(2, 4) : e.volleyCd) - dt;
      if (e.state === 'windup') {
        if (e.stateT > (e.enraged ? 0.75 : 1.0)) { e.state = 'attack'; e.stateT = 0; this.slam(e, dist); e.attackCd = t.attackCd * (e.enraged ? 0.7 : 1); }
      } else {
        if (dist > t.attackRange * 0.8) { moveX = dirX; moveZ = dirZ; }
        if (dist < t.attackRange * 1.05 && e.attackCd <= 0) {
          e.state = 'windup'; e.stateT = 0;
          if (this.audio) this.audio.roar(dist);
        } else if (dist > 11 && e.volleyCd <= 0) { this.fireProjectile(e, pp, e.enraged ? 4 : 2); e.volleyCd = rnd(4, 6); }
      }
    } else if (t.key === 'wolf') {
      // circle at the edge of reach, crouch (red flash), then one lunge in a straight line: sidestep it
      if (e.state === 'windup') {
        if (e.stateT > 0.4) { e.state = 'charge'; e.stateT = 0; e.lungeHit = false; e.chargeX = dirX; e.chargeZ = dirZ; }
      } else if (e.state === 'charge') {
        moveX = e.chargeX; moveZ = e.chargeZ; speed = e.speed * 2.7;
        if (!e.lungeHit && dist < t.radius + 0.95 && this.player.alive) {
          e.lungeHit = true;
          this.player.damage(e.dmg * 1.2, e.pos.x, e.pos.z);
          if (this.player.onHurt) this.player.onHurt();
          this.player.knock.add(new THREE.Vector3(e.chargeX, 0, e.chargeZ).multiplyScalar(6));
        }
        if (e.stateT > 0.5) { e.state = 'chase'; e.stateT = 0; e.lungeCd = rnd(1.8, 3.2); }
      } else {
        e.lungeCd -= dt;
        if (dist > 11) { moveX = dirX; moveZ = dirZ; }
        else {
          const orbit = Math.atan2(dz, dx) + Math.PI / 2 * e.strafeDir;
          moveX = Math.cos(orbit) * 0.8 + dirX * 0.3; moveZ = Math.sin(orbit) * 0.8 + dirZ * 0.3;
        }
        if (e.lungeCd <= 0 && dist < 10.5 && dist > 2.2 && !this.world.blocked(e.pos.x, e.pos.z, pp.x, pp.z)) {
          e.state = 'windup'; e.stateT = 0;
          if (this.audio) this.audio.roar(dist);
        } else if (dist < t.attackRange && e.attackCd <= 0) {
          e.attackCd = t.attackCd; this.dealMelee(e, dist);
        }
      }
    } else if (t.key === 'brute' && (e.state === 'windup' || e.state === 'charge' ||
      (e.chargeCd <= 0 && dist > 7 && dist < 20 && !this.world.blocked(e.pos.x, e.pos.z, pp.x, pp.z)))) {
      // charge: rear up (tracking you), then commit to a straight line. Dodge through it.
      if (e.state !== 'windup' && e.state !== 'charge') {
        e.state = 'windup'; e.stateT = 0;
        if (this.fx) this.fx.ring(new THREE.Vector3(e.pos.x, e.pos.y + 0.12, e.pos.z), 0xff4a1a, 2.6, 0.8);
        if (this.audio) this.audio.roar(dist);
      }
      if (e.state === 'windup') {
        if (e.stateT > 0.8) {
          e.state = 'charge'; e.stateT = 0; e.chargeHit = false;
          e.chargeX = dirX; e.chargeZ = dirZ;
        }
      } else {
        moveX = e.chargeX; moveZ = e.chargeZ; speed = e.speed * 3.6;
        if (!e.chargeHit && dist < t.radius + 0.9 && this.player.alive) {
          e.chargeHit = true;
          this.player.damage(e.dmg * 1.5, e.pos.x, e.pos.z);
          if (this.player.onHurt) this.player.onHurt();
          this.player.knock.add(new THREE.Vector3(e.chargeX, 0, e.chargeZ).multiplyScalar(16));
        }
        if (e.stateT > 1.15) { e.state = 'chase'; e.stateT = 0; e.chargeCd = rnd(5, 8); }
      }
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
      // below half health it enrages: faster, quicker swings, and a ring of low bolts to jump or roll
      if (!e.enraged && e.hp < e.maxHp * 0.5) {
        e.enraged = true; e.speed *= 1.35; e.novaCd = 1.2;
        if (this.fx) this.fx.ring(new THREE.Vector3(e.pos.x, e.pos.y + 0.2, e.pos.z), 0xff5a18, 9, 0.9);
        if (this.audio) this.audio.roar(dist, true);
        if (this.onEnrage) this.onEnrage(e);
      }
      if (e.enraged) {
        e.novaCd -= dt;
        if (e.novaCd <= 0) { this.nova(e); e.novaCd = 5.5; }
      }
      // it used to stop at 8 m and only "attack" in place, so it never landed a hit
      // it walks where its head points while turning toward you, so the body arcs
      // round instead of the head reversing back through its own segments
      if (dist > t.attackRange * 0.85) {
        const k = 0.35 + 0.65 * clamp(Math.cos(angleTo(e.yaw, Math.atan2(dx, dz))), 0, 1);
        moveX = Math.sin(e.yaw) * k; moveZ = Math.cos(e.yaw) * k;
      }
      if (e.attackCd <= 0) {
        if (dist > 12) this.fireProjectile(e, pp, e.enraged ? 5 : 3);
        else if (dist < t.attackRange * 1.1) {
          e.state = 'attack'; e.stateT = 0; e.attackCd = t.attackCd * (e.enraged ? 0.7 : 1);
          this.dealMelee(e, dist);
        }
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
    const wantX = nx, wantZ = nz;
    // men climb what a man can climb (the dais tiers, low rocks), so a ledge is not a refuge
    const climb = t.flying ? -Infinity : e.pos.y;
    [nx, nz] = this.world.resolveCollisions(nx, nz, t.radius, climb, 0.8);
    // a charging brute that rams a wall stuns itself: your opening
    if (e.state === 'charge' && Math.hypot(nx - wantX, nz - wantZ) > 0.04) {
      e.state = 'stagger'; e.stateT = 0; e.staggerDur = 1.1; e.chargeCd = rnd(5, 8);
      e.vel.set(0, 0, 0);
      if (this.fx) this.fx.puff(new THREE.Vector3(nx, e.pos.y + 1, nz), null, 0xa5835c, 1.2, 4, 0.8, 2);
      if (this.player) this.player.shake = Math.min(2, this.player.shake + 0.4 / (1 + dist * 0.1));
    }
    // bodies do not pass through each other: a man stops at the hero's shoulder, he does not stand inside him
    if (e.ai && this.player && this.player.alive && !this.player.execLock) {
      const pdx = nx - pp.x, pdz = nz - pp.z, pd = Math.hypot(pdx, pdz), minD = t.radius + 0.42;
      if (pd < minD) { const k = pd > 1e-3 ? pd : 1, ux = pd > 1e-3 ? pdx / k : Math.sin(e.yaw + Math.PI), uz = pd > 1e-3 ? pdz / k : Math.cos(e.yaw + Math.PI); nx = pp.x + ux * minD; nz = pp.z + uz * minD; }
    }
    e.pos.x = nx; e.pos.z = nz;
    if (e.segs) this.updateSegments(e, dt);

    const gh = t.flying ? terrainHeight(nx, nz) : Math.max(terrainHeight(nx, nz), this.world.supportAt(nx, nz, t.radius, e.pos.y, 0.8));
    if (t.flying) {
      // stingers dive to head height when they strike, so a blade can reach them
      const targetY = gh + (e.lungeT > 0 ? 1.4 : t.flyH) + Math.sin(time * 2.2 + e.phase) * 0.35;
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

    e.scale = damp(e.scale, 1, 10, dt);
  }

  /** a thrown body: gravity, a bounce, friction, and a tumble that stops lying down */
  updateCorpse(e, dt) {
    const v = e.dv;
    v.y -= 20 * dt;
    let nx = e.pos.x + v.x * dt, nz = e.pos.z + v.z * dt;
    [nx, nz] = this.world.resolveCollisions(nx, nz, e.type.radius * 0.6);
    e.pos.x = nx; e.pos.z = nz; e.pos.y += v.y * dt;
    const g = terrainHeight(nx, nz) - (e.dying > DEATH_HOLD ? (e.dying - DEATH_HOLD) * 1.2 : 0);
    if (e.pos.y < g) {
      e.pos.y = g;
      if (v.y < -2.5 && !e.bounced) {
        e.bounced = true; v.y *= -0.32; v.x *= 0.55; v.z *= 0.55;
        if (this.fx) this.fx.puff(new THREE.Vector3(nx, g + 0.15, nz), null, 0xa5835c, 0.6, 3, 0.7, 1.4);
      } else { v.y = 0; const f = Math.exp(-6 * dt); v.x *= f; v.z *= f; }
    }
    // tumble towards lying flat (about 1.45 rad), slowing as it settles
    if (e.tumble < 1.45) e.tumble = Math.min(1.45, e.tumble + e.tumbleW * dt);
  }

  /** follow-the-leader body: each segment sits a fixed gap behind the one in front */
  updateSegments(e, dt) {
    let px = e.pos.x, pz = e.pos.z;
    const p = this.player;
    for (let i = 0; i < e.segs.length; i++) {
      const sg = e.segs[i];
      let dx = sg.x - px, dz = sg.z - pz;
      const d = Math.hypot(dx, dz) || 1e-3;
      sg.x = px + (dx / d) * SEG_GAP;
      sg.z = pz + (dz / d) * SEG_GAP;
      sg.yaw = Math.atan2(px - sg.x, pz - sg.z);
      sg.y = damp(sg.y, terrainHeight(sg.x, sg.z), 12, dt);
      // the body is solid: shove the hero out rather than let them stand inside it
      if (p && p.alive) {
        const r = 0.95 * segScale(i) + 0.42;
        const ox = p.pos.x - sg.x, oz = p.pos.z - sg.z;
        const od = Math.hypot(ox, oz);
        if (od < r && od > 1e-3) { p.pos.x = sg.x + (ox / od) * r; p.pos.z = sg.z + (oz / od) * r; }
      }
      px = sg.x; pz = sg.z;
    }
  }

  /** the Warden's blow: everything on the ground within reach takes it; a jump clears it */
  slam(e, dist) {
    const p = this.player;
    const at = new THREE.Vector3(e.pos.x + Math.sin(e.yaw) * 2.6, e.pos.y + 0.1, e.pos.z + Math.cos(e.yaw) * 2.6);
    if (this.fx) {
      this.fx.ring(at, 0xc8d4c0, 8.5, 0.55); this.fx.ring(at, 0x9ff4c0, 4.5, 0.4);
      this.fx.puff(at, null, 0x8a8f86, 1.4, 10, 1.1, 3.2);
    }
    p.shake = Math.min(2, p.shake + 1.2);
    if (!p.alive) return;
    const d = Math.hypot(p.pos.x - at.x, p.pos.z - at.z);
    const airborne = p.pos.y - this.world.groundAt(p.pos.x, p.pos.z) > 0.9;
    if (d < 6.2 && !airborne) {
      p.damage(e.dmg, e.pos.x, e.pos.z);
      if (p.onHurt) p.onHurt();
      p.knock.add(new THREE.Vector3(p.pos.x - at.x, 0, p.pos.z - at.z).normalize().multiplyScalar(12));
    }
  }

  /** enraged boss: a ring of low, flat bolts */
  nova(e) {
    const n = 14, y = e.pos.y + 0.55;
    const off = rnd(0, TAU);
    for (let i = 0; i < n; i++) {
      const a = off + (i / n) * TAU;
      this.projectiles.push({
        pos: new THREE.Vector3(e.pos.x + Math.sin(a) * 1.6, y, e.pos.z + Math.cos(a) * 1.6),
        vel: new THREE.Vector3(Math.sin(a) * 13, 0, Math.cos(a) * 13),
        dmg: e.dmg * 0.6, life: 2.6, color: 0xff5a18, radius: 0.26, grav: 0, low: true
      });
    }
    if (this.fx) this.fx.ring(new THREE.Vector3(e.pos.x, e.pos.y + 0.3, e.pos.z), 0xff5a18, 4, 0.5);
    if (this.audio) this.audio.enemyShoot(this.player.pos.distanceTo(e.pos));
  }

  dealMelee(e, dist) {
    const p = this.player;
    if (!p.alive) return;
    if (dist > e.type.attackRange * 1.15) return;
    // telegraph, then the hit resolves 0.18 s of game time later (see updateOne)
    e.pendingHit = (e.type.windup || 0.18) * (this.windupMul || 1);
    if (this.fx) {
      this.fx.spark(new THREE.Vector3(
        e.pos.x + Math.sin(e.yaw) * 0.8, e.pos.y + 1.2, e.pos.z + Math.cos(e.yaw) * 0.8
      ), null, 0xff7a30, 5, 5, 0.1, 0.3);
    }
  }

  resolveMelee(e) {
    const p = this.player;
    if (!e.alive || !p.alive) return;
    const d = p.pos.distanceTo(e.pos);
    if (d < e.type.attackRange * 1.3) {
      p.damage(e.dmg, e.pos.x, e.pos.z);
      if (p.onHurt) p.onHurt();
      p.knock.add(new THREE.Vector3(Math.sin(e.yaw), 0, Math.cos(e.yaw)).multiplyScalar(e.type.heavy ? 9 : 4));
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
      pr.vel.y -= (pr.grav ?? 3.2) * dt;
      let dead = pr.life <= 0;
      // hit player
      if (!dead && p.alive) {
        const dx = pr.pos.x - p.pos.x, dz = pr.pos.z - p.pos.z;
        const dy = pr.pos.y - (p.pos.y + 1.0);
        // low nova bolts pass under a jumping hero
        if (dx * dx + dz * dz < 0.72 && Math.abs(dy) < (pr.low ? 0.75 : 1.0)) {
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
      // pillars, walls and wrecks stop bolts: cover works both ways
      if (!dead && this.world.pointSolid(pr.pos.x, pr.pos.y, pr.pos.z)) {
        if (this.fx) this.fx.spark(pr.pos, null, pr.color, 6, 4, 0.12, 0.3);
        dead = true;
      }
      if (dead) this.projectiles.splice(i, 1);
    }

    const m = this.projMesh;
    const count = Math.min(this.projectiles.length, 64);
    for (let i = 0; i < count; i++) {
      const pr = this.projectiles[i];
      _d.position.copy(pr.pos);
      _d.rotation.set(0, 0, 0);
      _d.scale.setScalar(pr.radius / 0.14 * (1 + Math.sin(performance.now() * 0.03) * 0.12));
      _d.updateMatrix();
      m.setMatrixAt(i, _d.matrix);
      m.setColorAt(i, _col.setHex(pr.color));
    }
    m.count = count;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }

  /* ---------------- instanced render ---------------- */
  render(time) {
    // eye glows
    let ei = 0;
    for (const e of this.list) {
      if (!e.alive || e.view || ei + 2 > 160) continue;
      const t = e.type;
      const cosY = Math.cos(e.yaw), sinY = Math.sin(e.yaw);
      const col = t.boss ? 0xff5a18 : (e.key === 'wasp' ? 0xffb030 : (e.key === 'shooter' ? 0xffc860 : 0xff7a20));
      _col.setHex(col).multiplyScalar(1 + Math.sin(time * 5 + e.phase) * 0.18);
      for (let s = -1; s <= 1; s += 2) {
        // eyes sit in the helm's slit (t.eye: [half spacing, height, forward]), scaled with the body
        const ex = t.eye ? t.eye[0] : t.headR * 0.55, ey = t.eye ? t.eye[1] : t.headY, ez = t.eye ? t.eye[2] : t.headR * 0.95;
        const ox = s * ex * e.scale, oz = ez * e.scale;
        _d.position.set(
          e.pos.x + ox * cosY + oz * sinY,
          e.pos.y + ey * e.scale,
          e.pos.z - ox * sinY + oz * cosY
        );
        _d.rotation.set(0, 0, 0);
        _d.scale.setScalar(e.scale * (t.boss ? 2.6 : 0.7) * (1 + Math.sin(time * 6 + e.phase) * 0.1));
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
          if (!e.alive && e.tumbleAxis) {
            // rotate the whole body about its centre, so limbs fall with it
            const cy = e.pos.y + e.type.height * 0.45;
            _tm.makeTranslation(e.pos.x, cy, e.pos.z)
              .multiply(_tr.makeRotationAxis(e.tumbleAxis, e.tumble))
              .multiply(_tt.makeTranslation(-e.pos.x, -cy, -e.pos.z));
            _d.matrix.premultiply(_tm);
          }
          part.mesh.setMatrixAt(n, _d.matrix);
          // tint: white flash on hit, darken while spawning, fade on death
          const f = e.flash * 0.9;
          let k = 1 - f * 0.55;
          let cr = k + f, cg = k + f * 0.75, cb = k + f * 0.5;
          if (e.state === 'spawn') { const s = e.scale; cr *= s; cg *= s; cb *= s * 1.2; }
          if (e.state === 'windup') { const w = 0.5 + 0.5 * Math.sin(e.stateT * 30); cr += 0.9 * w; cg += 0.15 * w; }
          if (e.enraged) { cr *= 1.25; cg *= 0.85; cb *= 0.8; }
          if (e.type.tint) { cr *= e.type.tint[0]; cg *= e.type.tint[1]; cb *= e.type.tint[2]; }
          if (!e.alive) { const fader = clamp(1 - (e.dying - DEATH_HOLD) / (DEATH_T - DEATH_HOLD), 0, 1); cr *= fader; cg *= fader; cb *= fader; }
          _col.setRGB(cr, cg, cb);
          part.mesh.setColorAt(n, _col);
          n++;
        }
        part.mesh.count = n;
        part.mesh.instanceMatrix.needsUpdate = true;
        if (part.mesh.instanceColor) part.mesh.instanceColor.needsUpdate = true;
      }
    }

    // soldiers: place and animate each skinned view
    // at most DRAW_SOLDIERS are drawn and animated (the nearest); the rest still think and fight, unseen at range
    let drawn = [];
    for (const e of this.list) { if (e.view && e.alive) { e.vd = Math.hypot(e.pos.x - this.player.pos.x, e.pos.z - this.player.pos.z); drawn.push(e); } }
    drawn.sort((a, b) => a.vd - b.vd);
    if (drawn.length > DRAW_SOLDIERS) drawn = drawn.slice(0, DRAW_SOLDIERS);
    drawn.forEach((e, i) => { e.vRank = i; });
    const drawSet = new Set(drawn);
    for (const e of this.list) {
      if (!e.view || !e.alive) continue;
      const v = e.view, dist = e.vd;
      v.root.visible = dist < 120 && drawSet.has(e);
      if (!v.root.visible) continue;
      v.root.position.copy(e.pos); v.root.rotation.y = e.yaw;
      const sp = Math.hypot(e.vel.x, e.vel.z);
      const rel = sp > 0.3 ? angleTo(e.yaw, Math.atan2(e.vel.x, e.vel.z)) : 0;
      v.update(this.lastDt || 0.016, { speed: sp, drawn: !(e.passive && !e.aggro), guard: !!e.ai.guarding && !!e.type.shield, moveBack: Math.abs(rel) > 2.0, dist, hurt: 1 - e.hp / e.maxHp, cloth: e.vRank < (this.clothBudget ?? CLOTH_SOLDIERS) && dist < 20 });
    }
    if (this.factory) { const views = []; for (const e of this.list) if (e.view) views.push(e.view); this.factory.flushWounds(this.scene, views); }

    // boss segments
    let si = 0;
    for (const e of this.list) {
      if (!e.segs) continue;
      const f = e.flash * 0.9, k = 1 - f * 0.55;
      const fade = e.alive ? 1 : clamp(1 - e.dying / 0.9, 0, 1);
      _col.setRGB((k + f) * fade * (e.enraged ? 1.25 : 1), (k + f * 0.75) * fade * (e.enraged ? 0.85 : 1), (k + f * 0.5) * fade * (e.enraged ? 0.8 : 1));
      for (let i = 0; i < e.segs.length && si < this.segMesh.instanceMatrix.count; i++) {
        const sg = e.segs[i];
        _d.position.set(sg.x, sg.y + Math.sin(time * 7 - i * 0.9) * 0.06, sg.z);
        _d.rotation.set(0, sg.yaw, Math.sin(time * 5 - i * 0.8) * 0.05);
        _d.scale.setScalar(segScale(i) * e.scale);
        _d.updateMatrix();
        this.segMesh.setMatrixAt(si, _d.matrix);
        this.segMesh.setColorAt(si, _col);
        si++;
      }
    }
    this.segMesh.count = si;
    this.segMesh.instanceMatrix.needsUpdate = true;
    if (this.segMesh.instanceColor) this.segMesh.instanceColor.needsUpdate = true;
  }

  placePart(e, name, d, time) {
    const t = e.type;
    const yaw = e.yaw;
    const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
    const sc = e.scale * (t.size || 1);

    // helper: local offset -> world
    const Z = t.size || 1;
    const toWorld = (ox, oy, oz) => [_d.position.x, _d.position.y, _d.position.z] =
      [e.pos.x + ox * Z * cosY + oz * Z * sinY, e.pos.y + oy * Z, e.pos.z - ox * Z * sinY + oz * Z * cosY];

    const bob = t.flying ? Math.sin(time * 6 + e.phase) * 0.06 : 0;
    const stride = Math.sin(e.phase) * 0.55;
    const stride2 = Math.sin(e.phase + Math.PI) * 0.55;
    const attackLean = e.state === 'attack' ? Math.sin(clamp(e.stateT / 0.35, 0, 1) * Math.PI) * 0.5
      : e.state === 'windup' ? -0.45 * clamp(e.stateT / 0.3, 0, 1)      // rears back
      : e.state === 'charge' ? 0.3 : 0;
    const staggerLean = e.state === 'stagger' ? -0.35 : 0;

    switch (name) {
      case 'body': {
        toWorld(0, bob, 0);
        d.rotation.set(staggerLean + attackLean * 0.5, yaw, 0);
        // the boss still crumples; everyone else is tumbled as a whole in render()
        if (!e.alive && t.boss) d.rotation.set(1.2, yaw, 0.3);
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
    for (const x of this.list) if (x.view) x.view.dispose();
    this.tokens.clear();
    this.list.length = 0;
    this.projectiles.length = 0;
    for (const key of Object.keys(this.renders)) {
      for (const part of this.renders[key].parts) part.mesh.count = 0;
    }
    this.projMesh.count = 0;
    if (this.eyeMesh) this.eyeMesh.count = 0;
    this.segMesh.count = 0;
  }
}
