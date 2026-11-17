import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clamp, damp } from './core.js';
import { Cloth } from './cloth.js';

/* ================================================================ soldiers
   The vale's armed men: footmen with sword and shield, swordsmen, spearmen, crossbowmen,
   plate-armoured captains and a warlord. They share the hero's captured rig and clips.

   - Armour is built once per style as two merged, vertex-coloured, skinned geometries (metal and
     cloth) bound whole to the bones; each soldier then costs a rig clone, two armour meshes, a
     weapon and (sometimes) a shield: about seven draw calls.
   - The AI owns the timers; this view maps them to the clip's own time (tell -> strike -> recover),
     so a swing is always exactly as long as the AI says, including through hit-stop and slow motion.
   - A guard is the same inverse-kinematics shield arm the hero uses. */

const S0 = 0.96;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _v = V(), _v2 = V();
/* wounds: one wet dark mark per cut, stuck to the bone it landed on (shared geometry and material) */
const WOUND_GEO = new THREE.SphereGeometry(1, 9, 6);
const WOUND_MAT = new THREE.MeshStandardMaterial({ color: 0x4e0505, roughness: 0.28, metalness: 0.05 });
// where a cut can land: bone, its child (the far end), how far out from the bone the surface is
const WOUND_BONES = [['DEF-spine001', 'DEF-spine002', 0.15], ['DEF-spine002', 'DEF-spine003', 0.16], ['DEF-spine003', 'DEF-neck', 0.16], ['DEF-head', null, 0.12],
  ['DEF-upper_armL', 'DEF-forearmL', 0.07], ['DEF-upper_armR', 'DEF-forearmR', 0.07], ['DEF-forearmR', 'DEF-handR', 0.055], ['DEF-thighL', 'DEF-shinL', 0.09], ['DEF-thighR', 'DEF-shinR', 0.09]];

/* b41: the vale's enemy is a horde, not men: orcs (hunched, broad, tusked, grey-green), goblins (small, quick, sallow)
   and trolls (huge, stone-grey, a club). Same rig and captured clips as before; race sets skin, face, build and hunch. */
export const RACE = {
  orc: { skin: 0x3f4a2e, eye: 0xffb020, build: [1.12, 1.0, 1.1], hunch: 0.26, face: 'orc' },
  goblin: { skin: 0x5e6038, eye: 0xffe040, build: [0.95, 1.0, 0.95], hunch: 0.34, face: 'goblin' },
  troll: { skin: 0x55544a, eye: 0xff6a20, build: [1.25, 1.0, 1.2], hunch: 0.3, face: 'troll' },
};
export const SOLDIER_STYLES = {
  footman: { race: 'orc', scale: 1.0, tunic: 0x3a2a20, helm: 'kettle', chest: 'brigandine', arms: true, shield: 'round', weapon: 'cleaver', shieldColor: 0x3a2418 },
  swordsman: { race: 'orc', scale: 1.0, tunic: 0x2b2420, helm: null, chest: 'jerkin', arms: false, shield: null, weapon: 'cleaver' },
  spearman: { race: 'orc', scale: 1.02, tunic: 0x40301e, helm: 'nasal', chest: 'brigandine', arms: false, shield: 'buckler', weapon: 'spear', shieldColor: 0x4a3420 },
  crossbow: { race: 'goblin', scale: 0.74, tunic: 0x2e2a1e, helm: 'hood', chest: 'jerkin', arms: false, shield: null, weapon: 'crossbow' },
  goblin: { race: 'goblin', scale: 0.72, tunic: 0x33291c, helm: null, chest: 'jerkin', arms: false, shield: null, weapon: 'dagger', tabard: false },
  captain: { race: 'orc', scale: 1.14, tunic: 0x1c1c20, helm: 'great', chest: 'plate', arms: true, shield: null, weapon: 'greatsword', legs: true },
  warlord: { race: 'orc', scale: 1.26, tunic: 0x3a1010, helm: 'great', chest: 'plate', arms: true, shield: 'kite', weapon: 'greatsword', legs: true, shieldColor: 0x2a0c0c, plume: 0x8a1a1a },
  troll: { race: 'troll', scale: 1.75, tunic: 0x3a2e22, helm: null, chest: 'jerkin', arms: false, shield: null, weapon: 'club', tabard: false },
};

/* shared materials: every soldier of every style uses these */
export const SOLDIER_MATS = {
  metal: new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.75, roughness: 0.62, envMapIntensity: 0.8 }),
  cloth: new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.0, roughness: 0.9 }),
  skin: new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.0, roughness: 0.72 }),
  eyes: new THREE.MeshBasicMaterial({ vertexColors: true }),
};

/* ------------------------------------------------ geometry helpers */
function paint(geo, hex) {
  const c = new THREE.Color(hex), n = geo.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geo;
}
function plain(geo) {
  let g = geo.index ? geo.toNonIndexed() : geo.clone();
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'color') g.deleteAttribute(k);
  return g;
}
/** one coloured, transformed piece of a weapon or shield */
function part(list, geo, hex, pos, rot = [0, 0, 0], scale = [1, 1, 1]) {
  const g = plain(geo);
  _m.compose(_v.set(...pos), _q.setFromEuler(new THREE.Euler(...rot)), _v2.set(...scale));
  g.applyMatrix4(_m);
  list.push(paint(g, hex));
}
const merged = (list) => { const g = mergeGeometries(list, false); return g; };

/* ------------------------------------------------ weapons (blade axis is -Y from the grip, like the hero's) */
export function swordGeometry(len = 0.95, wide = 0.05) {
  const L = [];
  part(L, new THREE.BoxGeometry(wide, len, 0.012), 0xc9ced6, [0, -(0.12 + len / 2), 0]);
  part(L, new THREE.ConeGeometry(wide * 0.5, 0.09, 4), 0xc9ced6, [0, -(0.12 + len + 0.045), 0], [Math.PI, Math.PI / 4, 0], [1, 1, 0.25]);
  part(L, new THREE.BoxGeometry(0.22, 0.03, 0.05), 0x8a6a30, [0, -0.1, 0]);
  part(L, new THREE.CylinderGeometry(0.017, 0.017, 0.2, 8), 0x3a2a1e, [0, 0.0, 0]);
  part(L, new THREE.SphereGeometry(0.03, 8, 6), 0x8a6a30, [0, 0.11, 0]);
  return merged(L);
}
function spearGeometry() {
  const L = [];
  part(L, new THREE.CylinderGeometry(0.018, 0.02, 2.0, 8), 0x5a4330, [0, -0.7, 0]);
  part(L, new THREE.ConeGeometry(0.04, 0.26, 6), 0xc9ced6, [0, -1.8, 0], [Math.PI, 0, 0]);
  part(L, new THREE.TorusGeometry(0.03, 0.008, 6, 10), 0x8a6a30, [0, -1.66, 0], [Math.PI / 2, 0, 0]);
  return merged(L);
}
function crossbowGeometry() {
  const L = [];
  part(L, new THREE.BoxGeometry(0.06, 0.6, 0.08), 0x5a4330, [0, -0.2, 0]);                 // stock
  part(L, new THREE.BoxGeometry(0.6, 0.035, 0.05), 0x3a2a1e, [0, -0.46, 0]);               // prod
  part(L, new THREE.CylinderGeometry(0.004, 0.004, 0.58, 4), 0xd8d0b8, [0, -0.46, 0], [0, 0, Math.PI / 2]);   // string
  return merged(L);
}
export function weaponGeometry(kind) {
  if (kind === 'spear') return spearGeometry();
  if (kind === 'crossbow') return crossbowGeometry();
  if (kind === 'greatsword') return swordGeometry(1.35, 0.07);
  if (kind === 'cleaver') return swordGeometry(0.8, 0.11);           // a broad, heavy, chopping blade
  if (kind === 'dagger') return swordGeometry(0.42, 0.04);
  if (kind === 'club') { const L = []; part(L, new THREE.CylinderGeometry(0.05, 0.13, 1.5, 9), 0x4a3524, [0, -0.75, 0]); for (let k = 0; k < 5; k++) part(L, new THREE.ConeGeometry(0.035, 0.12, 5), 0x3a3a3c, [Math.cos(k * 1.26) * 0.12, -1.2 - (k % 2) * 0.15, Math.sin(k * 1.26) * 0.12], [Math.PI / 2, 0, -k * 1.26 + Math.PI / 2]); return merged(L); }
  return swordGeometry(0.95, 0.05);
}
function shieldGeometry(kind, hex) {
  const L = [];
  if (kind === 'kite') {
    const shape = new THREE.Shape(); const w = 0.25, h = 0.34;
    shape.moveTo(-w, h * 0.92); shape.quadraticCurveTo(0, h * 1.08, w, h * 0.92); shape.lineTo(w * 0.96, 0); shape.quadraticCurveTo(w * 0.7, -h * 0.75, 0, -h * 1.15); shape.quadraticCurveTo(-w * 0.7, -h * 0.75, -w * 0.96, 0); shape.lineTo(-w, h * 0.92);
    part(L, new THREE.ExtrudeGeometry(shape, { depth: 0.025, bevelEnabled: false, curveSegments: 12 }), hex, [0, 0, 0]);
    part(L, new THREE.ExtrudeGeometry(shape, { depth: 0.012, bevelEnabled: false, curveSegments: 12 }), 0x8a8f96, [0, 0, -0.006], [0, 0, 0], [1.05, 1.04, 1]);
    part(L, new THREE.SphereGeometry(0.06, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0xb0b5bc, [0, 0.02, 0.04], [Math.PI / 2, 0, 0]);
  } else {
    const r = kind === 'buckler' ? 0.17 : 0.28;
    part(L, new THREE.CylinderGeometry(r, r, 0.03, 20), hex, [0, 0, 0.02], [Math.PI / 2, 0, 0]);
    part(L, new THREE.TorusGeometry(r, 0.014, 6, 24), 0x8a8f96, [0, 0, 0.02]);
    part(L, new THREE.SphereGeometry(r * 0.28, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0xb0b5bc, [0, 0, 0.04], [Math.PI / 2, 0, 0]);
  }
  return merged(L);
}

/* ------------------------------------------------ the factory */
export class SoldierFactory {
  constructor(gltf) {
    this.gltf = gltf;
    this.styles = {};
    this.clips = {};
    for (const c of gltf.animations) this.clips[c.name] = stripRoot(c);
    // a reference rig in the bind pose, where armour is fitted
    this.ref = SkeletonUtils.clone(gltf.scene); this.ref.scale.setScalar(S0);
    const m = new THREE.AnimationMixer(this.ref); const a = m.clipAction(this.clips.A_TPose); a.play(); m.setTime(0);
    this.ref.updateMatrixWorld(true);
    this.refBones = {}; this.ref.traverse((o) => { if (o.isBone) this.refBones[o.name] = o; });
    this.refSkinned = null; this.ref.traverse((o) => { if (o.isSkinnedMesh && !this.refSkinned) this.refSkinned = o; });
    this.geo = { weapons: {}, shields: {} };
  }

  P(name) { return this.refBones[name].getWorldPosition(V()); }

  /** the style's armour: { metal, cloth } skinned-space geometries (built once, shared by every soldier of the style) */
  armour(style) {
    if (this.styles[style]) return this.styles[style];
    const st = SOLDIER_STYLES[style], metal = [], cloth = [];
    const skel = this.refSkinned.skeleton, bones = skel.bones, bindInv = this.refSkinned.bindMatrixInverse;
    const skin = [], eyes = [];
    const add = (bone, geo, hex, isMetal, pos, rot = [0, 0, 0], scale = [1, 1, 1]) => {
      const b = this.refBones[bone], bi = bones.indexOf(b); if (bi < 0) return;
      const g = plain(geo);
      _m.compose(_v.set(...pos), _q.setFromEuler(new THREE.Euler(...rot)), _v2.set(...scale)); g.applyMatrix4(_m);     // world, at the fit pose
      const L = b.matrixWorld.clone().invert();
      const M = bindInv.clone().multiply(skel.boneInverses[bi].clone().invert()).multiply(L);
      g.applyMatrix4(M);
      const n = g.attributes.position.count, si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) { si[i * 4] = bi; sw[i * 4] = 1; }
      g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4)); g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
      paint(g, hex); (isMetal === 'skin' ? skin : isMetal === 'eyes' ? eyes : isMetal ? metal : cloth).push(g);
    };
    const pH = this.P('DEF-head'), pN = this.P('DEF-neck'), pS3 = this.P('DEF-spine003'), pS2 = this.P('DEF-spine002'), pS1 = this.P('DEF-spine001'), pHip = this.P('DEF-hips');
    const STEEL = 0x4c4e50, DARK = 0x232527, LEATHER = 0x3a281a, BRASS = 0x6a4a22;      // black iron and old leather: horde gear
    const c = (x, y, z) => [x, y, z];
    // ---- helm
    const hs = 0.115;
    if (st.helm === 'kettle') { add('DEF-head', new THREE.SphereGeometry(hs, 16, 10, 0, 6.283, 0, 1.45), STEEL, true, c(pH.x, pH.y + 0.09, pH.z), [0, 0, 0], [1, 1.05, 1.15]); add('DEF-head', new THREE.CylinderGeometry(0.17, 0.17, 0.012, 20), STEEL, true, c(pH.x, pH.y + 0.085, pH.z + 0.01), [0, 0, 0], [1, 1, 1.15]); }
    if (st.helm === 'sallet') { add('DEF-head', new THREE.SphereGeometry(hs, 16, 10, 0, 6.283, 0, 1.5), DARK, true, c(pH.x, pH.y + 0.09, pH.z), [0, 0, 0], [1, 1, 1.1]); add('DEF-head', new THREE.SphereGeometry(0.13, 14, 10, 0, 6.283, 1.2, 1.0), LEATHER, false, c(pH.x, pH.y + 0.03, pH.z - 0.01)); }
    if (st.helm === 'nasal') { add('DEF-head', new THREE.SphereGeometry(hs, 16, 10, 0, 6.283, 0, 1.4), STEEL, true, c(pH.x, pH.y + 0.09, pH.z), [0, 0, 0], [1, 1.1, 1.15]); add('DEF-head', new THREE.BoxGeometry(0.022, 0.12, 0.016), STEEL, true, c(pH.x, pH.y + 0.03, pH.z + 0.14)); }
    if (st.helm === 'hood') { add('DEF-head', new THREE.SphereGeometry(0.125, 14, 10, 0, 6.283, 0, 1.9), st.tunic, false, c(pH.x, pH.y + 0.07, pH.z - 0.01), [0, 0, 0], [1, 1.1, 1.2]); add('DEF-neck', new THREE.CylinderGeometry(0.13, 0.17, 0.12, 14, 1, true), st.tunic, false, c(pN.x, pN.y - 0.03, pN.z)); }
    if (st.helm === 'great') {
      add('DEF-head', new THREE.CylinderGeometry(0.125, 0.128, 0.26, 20), STEEL, true, c(pH.x, pH.y + 0.07, pH.z), [0, 0, 0], [1, 1, 1.15]);
      add('DEF-head', new THREE.SphereGeometry(0.126, 18, 8, 0, 6.283, 0, 1.2), STEEL, true, c(pH.x, pH.y + 0.2, pH.z), [0, 0, 0], [1, 0.7, 1.15]);
      add('DEF-head', new THREE.BoxGeometry(0.16, 0.014, 0.02), 0x0c0c10, true, c(pH.x, pH.y + 0.09, pH.z + 0.152));
      add('DEF-head', new THREE.BoxGeometry(0.02, 0.18, 0.02), DARK, true, c(pH.x, pH.y + 0.05, pH.z + 0.155));
      add('DEF-head', new THREE.CapsuleGeometry(0.02, 0.26, 4, 8), st.plume || 0x8a1f1f, false, c(pH.x, pH.y + 0.25, pH.z - 0.02), [Math.PI / 2, 0, 0]);
    }
    // ---- the face of the race: brow, jaw, tusks, ears (skin goes in 'skin', eyes in 'eyes')
    const R = RACE[st.race] || RACE.orc, SK = R.skin;
    add('DEF-head', new THREE.SphereGeometry(0.1, 14, 10), SK, 'skin', c(pH.x, pH.y + 0.065, pH.z + 0.005), [0, 0, 0], [1.0, 0.86, 1.08]);             // the skull: low and flat-topped
    add('DEF-head', new THREE.BoxGeometry(0.18, 0.045, 0.07), SK, 'skin', c(pH.x, pH.y + 0.1, pH.z + 0.095), [-0.35, 0, 0]);                          // heavy brow, low over the eyes
    add('DEF-head', new THREE.BoxGeometry(R.face === 'goblin' ? 0.1 : 0.15, 0.06, 0.1), SK, 'skin', c(pH.x, pH.y - 0.005, pH.z + 0.08), [0.15, 0, 0]);  // jutting jaw
    add('DEF-head', new THREE.SphereGeometry(0.035, 8, 6), SK, 'skin', c(pH.x, pH.y + 0.06, pH.z + 0.135), [0, 0, 0], [1, 0.8, 1.1]);                  // a broad flat nose
    for (const sx of [-1, 1]) {
      if (R.face !== 'goblin') add('DEF-head', new THREE.ConeGeometry(0.012, 0.055, 6), 0xd8cfa8, 'skin', c(pH.x + sx * 0.045, pH.y + 0.035, pH.z + 0.12), [0.25, 0, sx * 0.15]);   // tusks
      const ear = R.face === 'goblin' ? [0.035, 0.16] : [0.028, 0.08];
      add('DEF-head', new THREE.ConeGeometry(ear[0], ear[1], 6), SK, 'skin', c(pH.x + sx * 0.12, pH.y + 0.08, pH.z - 0.01), [0, 0, -sx * 1.25], [1, 1, 0.45]);     // pointed ears
      add('DEF-head', new THREE.SphereGeometry(0.014, 6, 4), R.eye, 'eyes', c(pH.x + sx * 0.04, pH.y + 0.075, pH.z + 0.118));                          // eyes that catch the light
    }
    // ---- torso
    const lathe = (pts) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 22);
    const body = lathe([[0.135, -0.15], [0.14, -0.08], [0.155, 0.0], [0.175, 0.08], [0.18, 0.15], [0.165, 0.22], [0.125, 0.27], [0.08, 0.3]]);
    if (st.chest === 'plate') { add('DEF-spine003', body, STEEL, true, c(pS2.x, pS2.y + 0.07, pS2.z - 0.005), [0, 0, 0], [1.22, 1, 0.72]); add('DEF-spine003', new THREE.TorusGeometry(0.15, 0.03, 8, 20), DARK, true, c(pN.x, pN.y - 0.02, pN.z), [1.5708, 0, 0], [1, 1, 1.1]); }
    else if (st.chest === 'brigandine') { add('DEF-spine003', body, st.tunic, false, c(pS2.x, pS2.y + 0.07, pS2.z - 0.005), [0, 0, 0], [1.2, 1, 0.74]); for (let i = 0; i < 6; i++) add('DEF-spine003', new THREE.SphereGeometry(0.014, 6, 4), BRASS, true, c(pS2.x - 0.075 + (i % 3) * 0.075, pS2.y + 0.1 + Math.floor(i / 3) * 0.07, pS2.z + 0.135)); }
    else add('DEF-spine003', body, LEATHER, false, c(pS2.x, pS2.y + 0.07, pS2.z - 0.005), [0, 0, 0], [1.17, 1, 0.72]);
    add('DEF-hips', new THREE.CylinderGeometry(0.15, 0.155, 0.06, 20, 1, true), LEATHER, false, c(pHip.x, pHip.y + 0.1, pHip.z), [0, 0, 0], [1.12, 1, 0.8]);
    // ---- shoulders, arms
    for (const [ub, fb, hb] of [['DEF-upper_armL', 'DEF-forearmL', 'DEF-handL'], ['DEF-upper_armR', 'DEF-forearmR', 'DEF-handR']]) {
      const pU = this.P(ub), pF = this.P(fb), pHd = this.P(hb), out = Math.sign(pF.x - pU.x) || 1;
      if (st.chest === 'plate' || st.arms) add(ub, new THREE.SphereGeometry(0.09, 14, 10, 0, 6.283, 0, 1.6), st.chest === 'plate' ? STEEL : DARK, true, c(pU.x, pU.y + 0.015, pU.z), [0, 0, -out * 0.25], [1.15, 0.85, 1.05]);
      if (st.arms) { const d = pHd.clone().sub(pF), len = d.length(); _q.setFromUnitVectors(V(0, 1, 0), d.clone().normalize()); const mid = pF.clone().addScaledVector(d, 0.5); const e = new THREE.Euler().setFromQuaternion(_q); add(fb, new THREE.CylinderGeometry(0.045, 0.055, len, 10), STEEL, true, [mid.x, mid.y, mid.z], [e.x, e.y, e.z]); }
      if (!st.arms) { const d = pHd.clone().sub(pF), len = d.length(); _q.setFromUnitVectors(V(0, 1, 0), d.clone().normalize()); const mid = pF.clone().addScaledVector(d, 0.5); const e = new THREE.Euler().setFromQuaternion(_q); add(fb, new THREE.CylinderGeometry(0.043, 0.05, len, 8), LEATHER, false, [mid.x, mid.y, mid.z], [e.x, e.y, e.z]); }
    }
    // ---- legs
    for (const [th, sh, ft] of [['DEF-thighL', 'DEF-shinL', 'DEF-footL'], ['DEF-thighR', 'DEF-shinR', 'DEF-footR']]) {
      const pT = this.P(th), pS = this.P(sh), pF = this.P(ft);
      const seg = (bone, a, b, r0, r1, hex, isMetal) => { const d = b.clone().sub(a), len = d.length(); _q.setFromUnitVectors(V(0, 1, 0), d.clone().normalize()); const mid = a.clone().addScaledVector(d, 0.5); const e = new THREE.Euler().setFromQuaternion(_q); add(bone, new THREE.CylinderGeometry(r1, r0, len, 10), hex, isMetal, [mid.x, mid.y, mid.z], [e.x, e.y, e.z]); };
      seg(sh, pS, pF, 0.07, 0.052, st.legs ? STEEL : LEATHER, !!st.legs);             // greave or boot-top
      seg(th, pT, pS, 0.092, 0.072, st.chest === 'plate' ? DARK : st.tunic, false);    // hose / cuisse padding
      if (st.legs) add(sh, new THREE.SphereGeometry(0.072, 12, 8), STEEL, true, [pS.x, pS.y, pS.z], [0, 0, 0], [1, 0.9, 1.1]);
      add(ft, new THREE.BoxGeometry(0.1, 0.07, 0.26), LEATHER, false, [pF.x, pF.y - 0.01, pF.z + 0.05]);
    }
    const out = { metal: metal.length ? merged(metal) : null, cloth: cloth.length ? merged(cloth) : null, skin: skin.length ? merged(skin) : null, eyes: eyes.length ? merged(eyes) : null };
    this.styles[style] = out;
    return out;
  }

  weaponGeo(kind) { return this.geo.weapons[kind] || (this.geo.weapons[kind] = weaponGeometry(kind)); }
  shieldGeo(kind, hex) { const k = kind + hex; return this.geo.shields[k] || (this.geo.shields[k] = shieldGeometry(kind, hex)); }

  create(style) { return new Soldier(this, style); }
  /** the tabard cloth, one material per colour */
  tabardMat(hex) { const m = this.tabardMats || (this.tabardMats = {}); return m[hex] || (m[hex] = new THREE.MeshStandardMaterial({ color: hex, roughness: 0.92, metalness: 0, side: THREE.DoubleSide })); }

  /** every wound on every drawn soldier, in one draw call: each follows its bone */
  flushWounds(scene, views) {
    if (!this.woundMesh) {
      this.woundMesh = new THREE.InstancedMesh(WOUND_GEO, WOUND_MAT, 120);
      this.woundMesh.frustumCulled = false; this.woundMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scene.add(this.woundMesh);
    }
    if (this.woundMesh.parent !== scene) scene.add(this.woundMesh);
    let n = 0;
    for (const v of views) {
      if (!v.wounds.length || !v.root.visible) continue;
      for (const w of v.wounds) { if (n >= 120) break; _m.multiplyMatrices(w.bone.matrixWorld, w.local); this.woundMesh.setMatrixAt(n++, _m); }
    }
    this.woundMesh.count = n; this.woundMesh.instanceMatrix.needsUpdate = true;
  }
}

/* the clips carry the mannequin's own travel; the game owns where a soldier stands */
function stripRoot(clip) {
  const c = clip.clone();
  c.tracks = c.tracks.filter((t) => t.name !== 'root.position');
  for (const t of c.tracks) if (t.name === 'DEF-hips.position') { const v = t.values, x0 = v[0], y0 = v[1]; for (let i = 0; i < v.length; i += 3) { v[i] -= x0; v[i + 1] -= y0; } }
  return c;
}

/* ================================================================ one soldier */
export class Soldier {
  constructor(factory, style) {
    this.f = factory; this.style = style; const st = this.st = SOLDIER_STYLES[style];
    this.root = new THREE.Group(); this.body = new THREE.Group(); this.root.add(this.body);
    this.rig = SkeletonUtils.clone(factory.gltf.scene); this.race = RACE[st.race] || RACE.orc;
    const bd = this.race.build; this.rig.scale.set(S0 * st.scale * bd[0], S0 * st.scale * bd[1], S0 * st.scale * bd[2]); this.body.add(this.rig);
    this.bones = {}; this.skinned = [];
    this.rig.traverse((o) => { if (o.isBone) this.bones[o.name] = o; if (o.isSkinnedMesh) { this.skinned.push(o); o.frustumCulled = false; o.castShadow = true; } });
    const B = (n) => this.bones[n];
    Object.assign(this, { handR: B('DEF-handR'), handL: B('DEF-handL'), foreL: B('DEF-forearmL'), upperL: B('DEF-upper_armL'), spine3: B('DEF-spine003'), headBone: B('DEF-head') });
    // the mannequin's own surface becomes the clothing under the armour
    // the mannequin's surface is his hide now (arms, legs and neck show between the armour); joints are the darker creases
    const cloth = new THREE.MeshStandardMaterial({ color: this.race.skin, roughness: 0.74 }), joints = new THREE.MeshStandardMaterial({ color: new THREE.Color(this.race.skin).multiplyScalar(0.55), roughness: 0.8 });
    this.ownMats = [cloth, joints];
    for (const m of this.skinned) m.material = m.material && m.material.name === 'M_Joints' ? joints : cloth;
    // armour
    const arm = factory.armour(style), base = this.skinned[0];
    this.armourMeshes = [];
    for (const [key, mat] of [['metal', SOLDIER_MATS.metal], ['cloth', SOLDIER_MATS.cloth], ['skin', SOLDIER_MATS.skin], ['eyes', SOLDIER_MATS.eyes]]) {
      if (!arm[key]) continue;
      const sm = new THREE.SkinnedMesh(arm[key], mat); sm.bind(base.skeleton, base.bindMatrix); sm.frustumCulled = false; sm.castShadow = true;
      sm.position.copy(base.position); sm.quaternion.copy(base.quaternion); sm.scale.copy(base.scale);
      base.parent.add(sm); this.armourMeshes.push(sm);
    }
    // the weapon rides the right hand (blade axis -Y -> hand +X for blades; spears and bolts point along the arm)
    this.hand = new THREE.Object3D(); this.hand.position.set(0, 0.07, 0);
    this.hand.rotation.z = st.weapon === 'spear' || st.weapon === 'crossbow' ? Math.PI : Math.PI / 2;
    this.handR.add(this.hand);
    this.weapon = new THREE.Mesh(factory.weaponGeo(st.weapon), SOLDIER_MATS.metal); this.weapon.castShadow = true; this.hand.add(this.weapon);
    this.muzzle = new THREE.Object3D();
    this.muzzle.position.set(0, st.weapon === 'greatsword' ? -1.5 : st.weapon === 'spear' ? -1.9 : st.weapon === 'crossbow' ? -0.45 : st.weapon === 'club' ? -1.45 : st.weapon === 'dagger' ? -0.5 : st.weapon === 'cleaver' ? -0.9 : -1.07, 0);
    this.hand.add(this.muzzle);
    this.thrustRot = Math.PI;                         // blade along the forearm for a thrust
    this.bladeRot = this.hand.rotation.z;
    // the shield
    if (st.shield) {
      this.shield = new THREE.Mesh(factory.shieldGeo(st.shield, st.shieldColor || 0x6a3030), SOLDIER_MATS.metal); this.shield.castShadow = true;
      this.shieldHolder = new THREE.Object3D(); this.shieldHolder.add(this.shield); this.foreL.add(this.shieldHolder);
    }
    // animation
    this.mixer = new THREE.AnimationMixer(this.rig);
    this.A = {};
    const mk = (n, key = n, loop = THREE.LoopRepeat) => { const a = this.mixer.clipAction(factory.clips[n]); a.setLoop(loop, Infinity); a.clampWhenFinished = true; a.enabled = true; a.play(); a.setEffectiveWeight(0); this.A[key] = a; return a; };
    mk('Idle_Loop'); mk('Sword_Idle'); mk('Walk_Loop'); mk('Jog_Fwd_Loop');
    mk('Sword_Attack', 'Sword_Attack', THREE.LoopOnce); mk('Punch_Cross', 'Punch_Cross', THREE.LoopOnce); mk('Spell_Simple_Shoot', 'Spell_Simple_Shoot', THREE.LoopOnce);
    mk('Hit_Chest', 'Hit_Chest', THREE.LoopOnce); mk('Hit_Head', 'Hit_Head', THREE.LoopOnce); mk('Death01', 'Death01', THREE.LoopOnce); mk('Roll', 'Roll', THREE.LoopOnce);
    if (factory.clips.Crouch_Idle_Loop) mk('Crouch_Idle_Loop');
    // the captured sword-and-shield set, when it loaded (assets/ual2.bin)
    this.layerClips = ['Sword_Attack', 'Punch_Cross', 'Spell_Simple_Shoot', 'Roll'];
    for (const n of ['Sword_Regular_B', 'Sword_Heavy_Combo', 'Sword_Block', 'Idle_Shield_Break', 'Hit_Knockback', 'Shield_OneShot']) if (factory.clips[n]) { mk(n, n, THREE.LoopOnce); this.A[n].paused = true; this.layerClips.push(n); }
    if (factory.clips.Idle_Shield_Loop) mk('Idle_Shield_Loop');
    for (const k of ['Sword_Attack', 'Punch_Cross', 'Spell_Simple_Shoot', 'Hit_Chest', 'Hit_Head', 'Death01', 'Roll']) this.A[k].paused = true;
    this.w = {}; for (const k in this.A) this.w[k] = 0; this.w.Idle_Loop = 1;
    this.layer = null;        // { name, t } : a clip whose time the AI sets directly
    this.hitW = 0; this.dead = false; this.guardW = 0; this.kick = 0; this.thrustBlend = 0; this.bash = 0; this.stunned = false;
    this.far = false; this.acc = 0;
    this.react = null;        // a reaction clip that plays by itself: { name, t, speed }
    this.buildTabards(factory);
    this.kneel = 0; this.hurt = 0; this.wounds = []; this.phase = Math.random() * 6;
  }

  /**
   * A tabard: a front and a back panel of cloth hanging from the belt over the thighs (js/cloth.js, the cape's
   * simulation at a smaller size). They swing as he walks and part round his legs; the enemy manager lets only the
   * nearest few simulate, the rest ride the hips rigidly.
   */
  buildTabards(factory) {
    const st = this.st, sc = st.scale, B = this.bones;
    const hips = B['DEF-hips'], spine = B['DEF-spine003'];
    if (!hips || !spine || st.tabard === false) { this.tabards = []; return; }
    this.root.updateMatrixWorld(true);
    const hp = hips.getWorldPosition(V());
    const legs = [[B['DEF-thighL'], B['DEF-shinL'], 0.1 * sc], [B['DEF-thighR'], B['DEF-shinR'], 0.1 * sc], [B['DEF-shinL'], B['DEF-footL'], 0.075 * sc], [B['DEF-shinR'], B['DEF-footR'], 0.075 * sc], [hips, null, 0.15 * sc]];
    const mat = factory.tabardMat(st.tabard || st.tunic);
    const panel = (side) => new Cloth({
      root: this.root, rig: this.rig, pin: hips, C: 5, R: 6, W: 0.3 * sc, H: 0.5 * sc,
      origin: V(hp.x, hp.y + 0.07 * sc, hp.z + side * 0.15 * sc),
      shape: (x, v) => [x * (1 + 0.15 * v), -side * 0.9 * x * x],          // curved round the hips
      material: mat, body: legs, backstop: { hips, spine, side: -side, offset: 0.05 * sc },
      steps: 1, iters: 4, drag: 0.985, worldScale: 0.5, air: 0, wind: 0,
    });
    this.tabards = [panel(1), panel(-1)];
    this.clothClock = Math.random() * 10;
  }

  /** a cut that landed at world point p: a dark wet mark on the nearest bone's surface, facing out */
  addWound(p, amt = 1) {
    if (this.far) return;
    this.rig.updateMatrixWorld(true);
    let best = null, bd = 1e9, bp = V(), cp = V();
    for (const [bn, cn, r] of WOUND_BONES) {
      const b = this.bones[bn]; if (!b) continue;
      const a = b.getWorldPosition(V()), c = cn && this.bones[cn] ? this.bones[cn].getWorldPosition(V()) : a.clone().add(V(0, 0.18 * this.st.scale, 0));
      const ab = c.clone().sub(a), t = clamp(p.clone().sub(a).dot(ab) / Math.max(1e-6, ab.lengthSq()), 0, 1);
      const q = a.addScaledVector(ab, t), d = q.distanceTo(p);
      if (d < bd) { bd = d; best = { b, r }; bp.copy(q); }
    }
    if (!best) return;
    const n = p.clone().sub(bp); if (n.lengthSq() < 1e-6) n.set(0, 0, 1).applyQuaternion(this.root.quaternion); n.normalize();
    cp.copy(bp).addScaledVector(n, best.r * this.st.scale);
    // flat against the body, a little longer than wide, sized in world metres whatever the bone's own scale
    const o = new THREE.Object3D();
    o.position.copy(best.b.worldToLocal(cp.clone()));
    const ws = best.b.getWorldScale(V()), size = (0.045 + Math.random() * 0.03) * Math.min(1.8, amt);
    const wq = best.b.getWorldQuaternion(new THREE.Quaternion()).invert();
    o.quaternion.setFromUnitVectors(V(0, 0, 1), n.clone().applyQuaternion(wq));
    o.rotateZ(Math.random() * Math.PI);
    o.scale.set(size / ws.x, size * 1.7 / ws.y, 0.012 / ws.z);
    o.updateMatrix();
    this.wounds.push({ bone: best.b, local: o.matrix.clone() });
    if (this.wounds.length > 7) this.wounds.shift();
  }

  dispose(scene) {
    this.wounds.length = 0;
    for (const c of this.tabards || []) c.dispose();
    this.root.removeFromParent();
    this.mixer.stopAllAction(); this.mixer.uncacheRoot(this.rig);
    for (const m of this.ownMats) m.dispose();
  }

  /** pose a one-shot clip at a time (seconds into the clip); null returns to locomotion */
  setLayer(name, t) { this.layer = name ? { name, t } : null; }
  /** play a captured reaction through once (a parry, a guard beaten down, a knockback); false if he has no such clip */
  playReact(name, speed = 1.2, from = 0) { if (!this.A[name] || this.dead) return false; this.react = { name, t: from, speed, dur: this.A[name].getClip().duration }; return true; }
  hitReact(head = false) { this.hitW = 1; const a = head ? this.A.Hit_Head : this.A.Hit_Chest; a.time = 0; a.paused = false; a.timeScale = 1.2; a.play(); this.hitHead = head; }
  die() { this.dead = true; const a = this.A.Death01; a.paused = false; a.time = 0; a.timeScale = 1.1; a.play(); }
  /** the weapon's point in the world (for clash sparks) */
  tip(out) { return this.muzzle.getWorldPosition(out); }
  grip(out) { return this.hand.getWorldPosition(out); }

  /**
   * o: { speed, drawn, guard (shield up), moveBack, near (distance to the player: far soldiers animate less) }
   */
  update(dt, o) {
    // distant soldiers: a coarse step (no IK), a third of the cost
    if (o.dist > 38 && !this.dead) { this.acc += dt; this.far = true; if (this.acc < 0.09) return; dt = this.acc; this.acc = 0; } else { this.far = false; this.acc = 0; }
    const A = this.A, w = this.w, ease = (k, tg, r) => { w[k] = damp(w[k], tg, r, dt); };
    if (this.react) { this.react.t += dt * this.react.speed; if (this.react.t >= this.react.dur * 0.92) this.react = null; }
    const sp = o.speed, busy = !!this.layer || this.dead || this.kneel > 0 || !!this.react;
    this.kneel = Math.max(0, this.kneel - dt); this.hurt = o.hurt || 0;
    const run = sp > 0.25;
    const gs = o.guard && A.Idle_Shield_Loop ? 1 : 0;               // behind his shield: the captured guard stance
    ease('Idle_Loop', !busy && !run && !o.drawn ? 1 : 0, 10); ease('Sword_Idle', !busy && !run && o.drawn ? 1 - gs : 0, 10);
    if (A.Idle_Shield_Loop) ease('Idle_Shield_Loop', !busy && !run && o.drawn ? gs : 0, 10);
    ease('Walk_Loop', !busy && run && sp < 3.6 ? 1 : 0, 10); ease('Jog_Fwd_Loop', !busy && run && sp >= 3.6 ? 1 : 0, 10);
    A.Walk_Loop.timeScale = (o.moveBack ? -1 : 1) * clamp(sp / 1.7, 0.6, 1.5);
    A.Jog_Fwd_Loop.timeScale = (o.moveBack ? -1 : 1) * clamp(sp / 3.7, 0.7, 1.4);
    for (const n of this.layerClips) {
      const on = (this.layer && this.layer.name === n) || (this.react && this.react.name === n && !this.layer);
      ease(n, on ? 1 : 0, on ? 26 : 14);
      if (on) { A[n].paused = true; A[n].time = this.layer && this.layer.name === n ? this.layer.t : this.react.t; }
    }
    if (A.Crouch_Idle_Loop) ease('Crouch_Idle_Loop', this.kneel > 0 && !this.dead ? 1 : 0, this.kneel > 0 ? 9 : 5);
    if (this.stunned && !this.dead && this.kneel <= 0 && !this.react) { this.hitHead = true; this.hitW = 1; A.Hit_Head.paused = true; A.Hit_Head.time = 0.22; }     // reeling, head down
    else this.hitW = Math.max(0, this.hitW - dt * 3);
    ease('Hit_Chest', !this.hitHead ? this.hitW * 0.9 : 0, 40); ease('Hit_Head', this.hitHead ? this.hitW * 0.9 : 0, 40);
    ease('Death01', this.dead ? 1 : 0, this.dead ? 18 : 30);
    if (this.dead) for (const k in w) if (k !== 'Death01') w[k] = 0;
    let sum = 0; for (const k in w) sum += w[k];
    if (sum < 1) { const base = this.dead ? 'Death01' : o.drawn ? 'Sword_Idle' : 'Idle_Loop'; w[base] += 1 - sum; }
    for (const k in A) A[k].setEffectiveWeight(w[k]);
    this.mixer.update(dt);
    // the horde's stoop: the back bowed forward, the head pulled up to look at you
    if (!this.dead && this.race.hunch) {
      const hq = this.hunchQ || (this.hunchQ = [new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), this.race.hunch), new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), -this.race.hunch * 0.8)]);
      const b1 = this.bones['DEF-spine002'], b2 = this.bones['DEF-neck'];
      if (b1) b1.quaternion.multiply(hq[0]); if (b2) b2.quaternion.multiply(hq[1]);
    }
    // hurt: a hunch, and a hitch in the step on the wounded side
    this.phase += dt * Math.max(1, sp * 2.2);
    const hk = this.dead ? 0 : clamp((this.hurt - 0.35) / 0.5, 0, 1);
    this.body.rotation.x = damp(this.body.rotation.x, hk * 0.14, 6, dt);
    this.body.rotation.z = damp(this.body.rotation.z, sp > 0.25 ? Math.sin(this.phase) * 0.07 * hk : hk * 0.04, 10, dt);
    // the tabard: simulated when he is near (o.cloth, the manager's budget), carried rigidly otherwise
    if (this.tabards && this.tabards.length) {
      this.clothClock += dt; this.clothTick = (this.clothTick || 0) + 1;
      const show = !(o.dist > 35), sim = !!o.cloth;
      if (show && (sim || this.clothTick % 4 === 0)) {
        this.body.updateWorldMatrix(true, false); this.rig.updateMatrixWorld(true);       // once, for both panels
        for (const c of this.tabards) { if (sim) c.update(dt, this.clothClock, true); else c.kinematic(true); }
      }
      for (const c of this.tabards) c.mesh.visible = show;
    }
    // the blade turns along the arm for a thrust (spears and bolts always are)
    const thrust = this.layer && this.layer.name === 'Punch_Cross' ? 1 : 0;
    this.thrustBlend = damp(this.thrustBlend, thrust, 24, dt);
    if (this.st.weapon !== 'spear' && this.st.weapon !== 'crossbow') this.hand.rotation.z = THREE.MathUtils.lerp(this.bladeRot, this.thrustRot, this.thrustBlend);
    // the shield: IK to the front when guarding, at the side otherwise
    this.guardW = damp(this.guardW, (o.guard || this.bash > 0.05) && !this.stunned ? 1 : 0, o.guard ? 16 : 9, dt);
    this.kick = damp(this.kick, 0, 12, dt);
    if (this.shield && !this.far) this.updateShield(o);
  }

  updateShield(o) {
    this.rig.updateMatrixWorld(true);
    const bw = this.root.getWorldQuaternion(_q), fwd = V(0, 0, 1).applyQuaternion(bw), left = V(1, 0, 0).applyQuaternion(bw);
    if (this.guardW > 0.02) {
      const sh = this.upperL.getWorldPosition(V()), sc = this.st.scale;
      const T = sh.clone().addScaledVector(fwd, (0.34 + this.bash * 0.5) * sc - this.kick * 0.1).addScaledVector(left, 0.0).add(V(0, -0.2 * sc, 0));
      solveArm(this, this.upperL, this.foreL, this.handL, T, fwd, left, this.guardW);
    }
    // place the shield on the hand
    this.rig.updateMatrixWorld(true);
    const face = V().copy(left).lerp(fwd, this.guardW).normalize();
    const upv = V(0, 1, 0), X = V().crossVectors(upv, face).normalize(), Y = V().crossVectors(face, X).normalize();
    _m.makeBasis(X, Y, face); const wq = new THREE.Quaternion().setFromRotationMatrix(_m);
    const hp = this.handL.getWorldPosition(V()).addScaledVector(face, 0.07 - this.kick * 0.04).add(V(0, 0.02, 0));
    this.foreL.updateWorldMatrix(true, false);
    const pq = this.foreL.getWorldQuaternion(new THREE.Quaternion()).invert();
    this.shieldHolder.quaternion.copy(pq.multiply(wq));
    this.shieldHolder.position.copy(this.foreL.worldToLocal(hp));
    this.shield.scale.setScalar(0.85 * this.st.scale);
  }
}

/** two-bone IK: bring the hand to T, with the elbow toward pole (down and out) */
export function solveArm(owner, ub, fb, hb, T, fwd, side, weight, poleSide = 1) {
  const wp = (b) => b.getWorldPosition(V());
  const A = wp(ub), Bp = wp(fb), C = wp(hb);
  const l1 = A.distanceTo(Bp), l2 = Bp.distanceTo(C);
  const toT = T.clone().sub(A); const d = clamp(toT.length(), 0.12, (l1 + l2) * 0.995); toT.normalize();
  const pole = V(0, -0.6, 0).addScaledVector(side, 0.7 * poleSide).addScaledVector(fwd, -0.2).normalize();
  const ang = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
  const perp = pole.clone().addScaledVector(toT, -pole.dot(toT)).normalize();
  const E = A.clone().addScaledVector(toT, Math.cos(ang) * l1).addScaledVector(perp, Math.sin(ang) * l1);
  const setDir = (bone, from, to) => {
    const child = bone.children.find((c) => c.isBone && !/f_|thumb/.test(c.name)) || bone;
    const cur = wp(child).sub(wp(bone)).normalize(), want = to.clone().sub(from).normalize();
    const dq = new THREE.Quaternion().setFromUnitVectors(cur, want);
    const wq = bone.getWorldQuaternion(new THREE.Quaternion()), pq = bone.parent.getWorldQuaternion(new THREE.Quaternion());
    bone.quaternion.slerp(pq.invert().multiply(dq.multiply(wq)), weight);
    bone.updateMatrixWorld(true);
  };
  setDir(ub, A, E);
  setDir(fb, wp(fb), T);
}
