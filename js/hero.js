import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clamp, damp, lerp } from './core.js';

/* ================================================================ the Warden
   The hero is a real skinned human (Quaternius' CC0 Universal Animation Library
   mannequin, 53 bones) driven by motion-captured clips: idle, walk, jog, sprint, roll,
   jump, a sword attack, hit reactions, death. It is dressed in armour built from smooth
   rigid plates fixed to the bones, with a real sword and shield. The shield arm is posed
   by inverse kinematics, so the shield can rise, take a blow, flare on a parry and bash.

   The old procedural hero (player.js buildHero) is still the fallback if the asset
   cannot be loaded. This object offers the same handles the rest of the game uses:
   root, body, torso, head, hand (weapon socket), back (sheath), cloak. */

let ASSET = null;
export async function loadHeroAsset(url = 'assets/hero.glb') {
  if (ASSET) return ASSET;
  ASSET = await new GLTFLoader().loadAsync(url);
  return ASSET;
}

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v = V(), _v2 = V(), _v3 = V(), _m = new THREE.Matrix4();

/* a hammered-metal normal map made from noise: it breaks the plates' reflections up so steel reads as steel */
function hammeredNormal(size = 128, strength = 2.2) {
  const h = new Float32Array(size * size);
  const noise = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
  for (let k = 0; k < 3; k++) {
    const cell = 4 << k, amp = 1 / (1 + k);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const gx = x / cell, gy = y / cell, ix = Math.floor(gx), iy = Math.floor(gy), fx = gx - ix, fy = gy - iy;
      const w = (a, b) => noise(a % (size / cell), b % (size / cell));
      const v = (w(ix, iy) * (1 - fx) + w(ix + 1, iy) * fx) * (1 - fy) + (w(ix, iy + 1) * (1 - fx) + w(ix + 1, iy + 1) * fx) * fy;
      h[y * size + x] += v * amp;
    }
  }
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const l = h[y * size + (x + size - 1) % size], r = h[y * size + (x + 1) % size], u = h[((y + size - 1) % size) * size + x], d = h[((y + 1) % size) * size + x];
    const nx = (l - r) * strength, ny = (u - d) * strength, nz = 1, len = Math.hypot(nx, ny, nz);
    const o = (y * size + x) * 4;
    data[o] = (nx / len * 0.5 + 0.5) * 255; data[o + 1] = (ny / len * 0.5 + 0.5) * 255; data[o + 2] = (nz / len * 0.5 + 0.5) * 255; data[o + 3] = 255;
  }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.needsUpdate = true; t.repeat.set(3, 3);
  return t;
}

/* the shield's face: boards, a painted field and a boss, drawn once */
function shieldTexture() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 256; const c = cv.getContext('2d');
  c.fillStyle = '#5b2a2e'; c.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 9; i++) { c.fillStyle = `rgba(${i % 2 ? 0 : 255},${i % 2 ? 0 : 230},${i % 2 ? 0 : 200},${i % 2 ? 0.08 : 0.04})`; c.fillRect(i * 28.4, 0, 28.4, 256); }
  for (let i = 0; i < 160; i++) { c.strokeStyle = `rgba(20,10,8,${Math.random() * 0.14})`; c.beginPath(); const x = Math.random() * 256; c.moveTo(x, 0); c.lineTo(x + (Math.random() - 0.5) * 8, 256); c.stroke(); }
  c.strokeStyle = '#d3b36a'; c.lineWidth = 7;                                       // the Wardens' mark: a ring and three strokes
  c.beginPath(); c.arc(128, 128, 62, 0, Math.PI * 2); c.stroke(); c.lineWidth = 6;
  for (const a of [-0.6, 0, 0.6]) { c.beginPath(); c.moveTo(128 + Math.sin(a) * 18, 128 - Math.cos(a) * 18); c.lineTo(128 + Math.sin(a) * 52, 128 - Math.cos(a) * 52); c.stroke(); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

export class Hero {
  constructor(gltf) {
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);
    this.rig = SkeletonUtils.clone(gltf.scene);
    this.rig.scale.setScalar(0.96);                    // 1.83 m mannequin -> a 1.76 m warden
    this.body.add(this.rig);
    this.bones = {};
    this.rig.traverse((o) => {
      if (o.isBone) this.bones[o.name] = o;
      if (o.isSkinnedMesh) { o.frustumCulled = false; o.castShadow = true; o.receiveShadow = true; (this.skinned = this.skinned || []).push(o); }
    });
    const B = (n) => this.bones[n];
    Object.assign(this, {
      hips: B('DEF-hips'), spine1: B('DEF-spine001'), spine2: B('DEF-spine002'), spine3: B('DEF-spine003'), neck: B('DEF-neck'), headBone: B('DEF-head'),
      upperL: B('DEF-upper_armL'), foreL: B('DEF-forearmL'), handL: B('DEF-handL'), upperR: B('DEF-upper_armR'), foreR: B('DEF-forearmR'), handR: B('DEF-handR'),
      thighL: B('DEF-thighL'), shinL: B('DEF-shinL'), footL: B('DEF-footL'), thighR: B('DEF-thighR'), shinR: B('DEF-shinR'), footR: B('DEF-footR'),
    });
    this.torso = this.spine3;                          // the old handle: gear and effects hang from here
    this.head = this.headBone;
    this.tails = new THREE.Object3D();                // (the old hero's headband tails; unused)
    this.gearMats = [];
    this.mats = this.makeMaterials();
    this.recolour();
    // reference pose for fitting armour: arms out, legs apart
    this.mixer = new THREE.AnimationMixer(this.rig);
    this.clips = {};
    for (const c of gltf.animations) this.clips[c.name] = this.stripRootMotion(c);
    this.fitPose();
    this.dress();
    this.bakeRigid();
    this.buildSockets();
    this.buildCloak();
    this.buildActions();
    this.ik = { w: 0, target: V(), kick: 0, bash: 0, bashT: 0, flare: 0, pole: V() };
    this.state = { clip: null };
    this.set = {};
  }

  /* ------------------------------------------------ materials */
  makeMaterials() {
    const nrm = hammeredNormal(128, 2.0);
    const std = (o) => { const m = new THREE.MeshStandardMaterial(o); this.gearMats.push(m); return m; };
    return {
      steel: std({ color: 0x8a9099, metalness: 0.72, roughness: 0.5, normalMap: nrm, normalScale: new THREE.Vector2(0.16, 0.16), envMapIntensity: 1.15 }),
      darkSteel: std({ color: 0x3a4048, metalness: 0.68, roughness: 0.58, normalMap: nrm, normalScale: new THREE.Vector2(0.14, 0.14), envMapIntensity: 0.9 }),
      brass: std({ color: 0xb98a3c, metalness: 0.85, roughness: 0.38, envMapIntensity: 1.0 }),
      leather: std({ color: 0x4a3322, metalness: 0.0, roughness: 0.82 }),
      cloth: std({ color: 0x23262d, metalness: 0.0, roughness: 0.95 }),
      cloak: std({ color: 0x35503d, metalness: 0.0, roughness: 0.92, side: THREE.DoubleSide }),
      blade: std({ color: 0xc7ccd4, metalness: 1.0, roughness: 0.22, envMapIntensity: 1.3 }),
      wood: std({ color: 0x5a3f2a, metalness: 0.0, roughness: 0.75 }),
      glow: new THREE.MeshBasicMaterial({ color: 0x7ff3ff, toneMapped: false }),
    };
  }
  recolour() {
    // the bare mannequin becomes the padded suit under the armour: dark cloth, leather at the joints
    for (const m of this.skinned) {
      const arr = Array.isArray(m.material) ? m.material : [m.material];
      m.material = arr.map((mat) => {
        const n = mat.name === 'M_Joints' ? this.mats.leather.clone() : this.mats.cloth.clone();
        n.skinning = true; this.gearMats.push(n); return n;
      });
      if (m.material.length === 1) m.material = m.material[0];
    }
  }

  /* the clips carry the mannequin's own travel: keep the game in charge of where the hero is */
  /* the root bone is turned -90 degrees about X: in the hips' position track the horizontal axes are x and y, and z is the height */
  stripRootMotion(clip) {
    const c = clip.clone();
    c.tracks = c.tracks.filter((t) => !/^(root|DEF-hips)\.position$/.test(t.name) || /hips/.test(t.name));
    for (const t of c.tracks) if (/^DEF-hips\.position$/.test(t.name)) { const v = t.values; const x0 = v[0], y0 = v[1]; for (let i = 0; i < v.length; i += 3) { v[i] -= x0; v[i + 1] -= y0; } }
    return c;
  }

  /* ------------------------------------------------ armour, fitted in the bind pose */
  fitPose() {
    const a = this.mixer.clipAction(this.clips.A_TPose); a.play(); this.mixer.setTime(0);
    this.root.updateMatrixWorld(true);
    a.stop(); this.mixer.uncacheAction(this.clips.A_TPose);
  }
  P(bone) { return bone.getWorldPosition(V()); }

  /** a tapered tube between two bone positions, fixed to one of them */
  tube(parent, a, b, r0, r1, mat, grow = 1) {
    const A = this.P(a), Bp = this.P(b), d = _v.copy(Bp).sub(A), len = d.length();
    const g = new THREE.CylinderGeometry(r1 * grow, r0 * grow, len, 14, 1); // top = toward b
    const m = new THREE.Mesh(g, mat); m.castShadow = true;
    m.position.copy(A).addScaledVector(d, 0.5); m.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize());
    this.root.add(m); parent.attach(m); (this.rigid = this.rigid || []).push({ mesh: m, bone: parent }); return m;
  }
  piece(parent, geo, mat, pos, quat = null, scale = null) {
    const m = new THREE.Mesh(geo, mat); m.castShadow = true;
    m.position.copy(pos); if (quat) m.quaternion.copy(quat); if (scale) m.scale.copy(scale);
    this.root.add(m); parent.attach(m); (this.rigid = this.rigid || []).push({ mesh: m, bone: parent }); return m;
  }

  dress() {
    const M = this.mats, up = V(0, 1, 0);
    const pS3 = this.P(this.spine3), pS2 = this.P(this.spine2), pS1 = this.P(this.spine1), pN = this.P(this.neck), pH = this.P(this.headBone), pHips = this.P(this.hips);
    // --- breastplate and backplate: a lathe, flattened front to back and widened across the chest
    const prof = [[0.135, -0.15], [0.14, -0.08], [0.155, 0.0], [0.175, 0.08], [0.18, 0.15], [0.165, 0.22], [0.125, 0.27], [0.08, 0.3]].map(([r, y]) => new THREE.Vector2(r, y));
    const chestGeo = new THREE.LatheGeometry(prof, 28);
    const chest = this.piece(this.spine3, chestGeo, M.steel, _v.set(pS2.x, pS2.y + 0.07, pS2.z - 0.005), null, V(1.22, 1, 0.72));
    // a ridge down the front, and a belt of plates over the waist
    this.piece(this.spine3, new THREE.CapsuleGeometry(0.022, 0.3, 4, 8), M.darkSteel, _v.set(pS2.x, pS2.y + 0.14, pS2.z + 0.2), null, V(1, 1, 0.6));
    for (let i = 0; i < 2; i++) this.piece(this.spine1, new THREE.CylinderGeometry(0.152 - i * 0.004, 0.158 - i * 0.004, 0.045, 24, 1, true), i ? M.darkSteel : M.steel, _v.set(pS1.x, pS1.y - 0.075 - i * 0.04, pS1.z), null, V(1.12, 1, 0.8));
    // --- gorget and helm
    this.piece(this.neck, new THREE.TorusGeometry(0.095, 0.03, 10, 22), M.steel, _v.set(pN.x, pN.y - 0.02, pN.z), _q.setFromAxisAngle(V(1, 0, 0), Math.PI / 2), V(1, 1, 1.1));
    const helm = new THREE.Group();
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.135, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.62), M.steel); skull.scale.set(1.0, 1.12, 1.18); skull.position.y = 0.01;
    const face = new THREE.Mesh(new THREE.CylinderGeometry(0.128, 0.115, 0.17, 24, 1, true, -Math.PI * 0.5, Math.PI), M.steel); face.position.set(0, -0.085, 0.0); face.scale.set(1.0, 1.0, 1.18);
    const slit = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.018, 0.02), M.glow); slit.position.set(0, -0.025, 0.152);
    const nasal = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.15, 0.02), M.darkSteel); nasal.position.set(0, -0.075, 0.155);
    const crest = new THREE.Mesh(new THREE.CapsuleGeometry(0.018, 0.25, 4, 8), M.brass); crest.rotation.x = Math.PI / 2; crest.position.set(0, 0.145, -0.01);
    helm.add(skull, face, slit, nasal, crest);
    helm.position.set(pH.x, pH.y + 0.085, pH.z + 0.005); this.root.add(helm); this.headBone.attach(helm); this.helm = helm; for (const c of helm.children) (this.rigid = this.rigid || []).push({ mesh: c, bone: this.headBone });
    // --- pauldrons, three lames each, and the arm harness
    for (const [s, ub, fb, hb] of [[1, this.upperL, this.foreL, this.handL], [-1, this.upperR, this.foreR, this.handR]]) {
      const pU = this.P(ub), pF = this.P(fb), pHd = this.P(hb);
      const out = V(Math.sign(pF.x - pU.x) || s, 0, 0);
      for (let i = 0; i < 3; i++) {
        const g = new THREE.SphereGeometry(0.088 - i * 0.008, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.55);
        this.piece(ub, g, i === 0 ? M.steel : M.darkSteel, _v.set(pU.x + out.x * (0.0 + i * 0.03), pU.y + 0.015 - i * 0.04, pU.z), _q.setFromAxisAngle(V(0, 0, 1), -out.x * (0.2 + i * 0.3)), V(1.15, 0.85, 1.05));
      }
      this.tube(ub, ub, fb, 0.062, 0.05, M.leather);                                  // arm padding
      this.tube(fb, fb, hb, 0.056, 0.042, M.steel, 1.0);                              // vambrace
      this.piece(fb, new THREE.SphereGeometry(0.058, 14, 10), M.darkSteel, pF, null, V(1, 0.8, 1));       // couter (elbow cop)
      const gaunt = this.piece(hb, new THREE.BoxGeometry(0.075, 0.1, 0.045), M.darkSteel, _v.copy(pHd).lerp(pF, -0.12));
      gaunt.quaternion.setFromUnitVectors(up, _v2.copy(pHd).sub(pF).normalize());
    }
    // --- hips, tassets, legs
    this.piece(this.hips, new THREE.CylinderGeometry(0.15, 0.155, 0.05, 24, 1, true), M.leather, _v.set(pHips.x, pHips.y + 0.1, pHips.z), null, V(1.12, 1, 0.8));
    this.piece(this.hips, new THREE.BoxGeometry(0.06, 0.05, 0.02), M.brass, _v.set(pHips.x, pHips.y + 0.1, pHips.z + 0.135));
    for (const th of [this.thighL, this.thighR]) {
      const p = this.P(th);
      for (let i = 0; i < 3; i++) this.piece(th, new THREE.CylinderGeometry(0.098 - i * 0.004, 0.106 - i * 0.004, 0.065, 16, 1, true, 0, Math.PI * 1.4), i % 2 ? M.darkSteel : M.steel, _v.set(p.x, p.y - 0.035 - i * 0.06, p.z), _q.setFromAxisAngle(up, Math.PI * 0.3));
    }
    for (const [th, sh, ft] of [[this.thighL, this.shinL, this.footL], [this.thighR, this.shinR, this.footR]]) {
      const pT = this.P(th), pS = this.P(sh), pF = this.P(ft);
      this.tube(th, th, sh, 0.095, 0.072, M.cloth, 1.04);                                  // padded cuisse
      this.piece(sh, new THREE.SphereGeometry(0.075, 14, 10), M.steel, pS, null, V(1, 0.9, 1.1));          // knee cop
      this.tube(sh, sh, ft, 0.075, 0.056, M.steel, 1.0);                                    // greave
      this.piece(ft, new THREE.BoxGeometry(0.1, 0.07, 0.26), M.darkSteel, _v.set(pF.x, pF.y - 0.01, pF.z + 0.05), _q.identity());   // sabaton
    }
  }

  /**
   * Fold every rigid armour piece into a few skinned meshes (one per material), each vertex bound whole to its bone.
   * It looks the same as parenting the pieces to the bones, at about five draw calls instead of sixty.
   */
  bakeRigid() {
    const base = this.skinned[0], skeleton = base.skeleton, bones = skeleton.bones;
    this.rig.updateMatrixWorld(true);
    const bindInv = base.bindMatrixInverse.clone();
    const groups = new Map();
    const M = new THREE.Matrix4(), L = new THREE.Matrix4(), Bi = new THREE.Matrix4();
    for (const { mesh, bone } of this.rigid) {
      const bi = bones.indexOf(bone); if (bi < 0) continue;
      mesh.updateWorldMatrix(true, false); bone.updateWorldMatrix(true, false);
      L.copy(bone.matrixWorld).invert().multiply(mesh.matrixWorld);                    // piece in the bone's own space
      Bi.copy(skeleton.boneInverses[bi]).invert();                                     // the bone's bind pose
      M.copy(bindInv).multiply(Bi).multiply(L);
      let g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
      for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      g.applyMatrix4(M);
      const n = g.attributes.position.count, si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) { si[i * 4] = bi; sw[i * 4] = 1; }
      g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4)); g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
      const key = mesh.material; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(g);
      mesh.removeFromParent();
    }
    this.armour = [];
    for (const [mat, list] of groups) {
      const merged = mergeGeometries(list, false); if (!merged) continue;
      const sm = new THREE.SkinnedMesh(merged, mat);
      sm.bind(skeleton, base.bindMatrix); sm.castShadow = true; sm.frustumCulled = false;
      sm.position.copy(base.position); sm.quaternion.copy(base.quaternion); sm.scale.copy(base.scale);
      base.parent.add(sm); this.armour.push(sm);
    }
    this.rigid = [];
  }

  /* ------------------------------------------------ sockets: where weapons, the sword on the back and the shield ride */
  buildSockets() {
    // the right hand: a weapon's blade axis (-Y in its own space) runs along the hand's +X
    this.hand = new THREE.Object3D();
    this.hand.rotation.z = Math.PI / 2; this.hand.position.set(0.0, 0.07, 0.0);
    this.handR.add(this.hand);
    // the sheath rides across the back, hilt over the right shoulder
    this.back = new THREE.Object3D();
    { const p = this.P(this.spine3); this.back.position.set(p.x - 0.04, p.y + 0.0, p.z - 0.17); this.back.rotation.set(0.1, 0, 0.62); this.root.add(this.back); this.spine3.attach(this.back); }
    // the shield: a heater of boards faced with paint, rimmed and bossed, strapped to the left forearm
    const sh = new THREE.Group();
    const shape = new THREE.Shape(); const w = 0.27, h = 0.36;
    shape.moveTo(-w, h * 0.92); shape.quadraticCurveTo(0, h * 1.08, w, h * 0.92); shape.lineTo(w * 0.96, 0); shape.quadraticCurveTo(w * 0.7, -h * 0.75, 0, -h * 1.15); shape.quadraticCurveTo(-w * 0.7, -h * 0.75, -w * 0.96, 0); shape.lineTo(-w, h * 0.92);
    const face = new THREE.ExtrudeGeometry(shape, { depth: 0.025, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 2, curveSegments: 18 });
    // uv for the painted face from x/y
    const pos = face.attributes.position, uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) { uv[i * 2] = (pos.getX(i) + w) / (w * 2); uv[i * 2 + 1] = (pos.getY(i) + h * 1.15) / (h * 2.3); }
    face.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    const faceMat = new THREE.MeshStandardMaterial({ map: shieldTexture(), roughness: 0.7, metalness: 0.05 }); this.gearMats.push(faceMat);
    const slab = new THREE.Mesh(face, faceMat); slab.castShadow = true;
    const rim = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.012, bevelEnabled: false, curveSegments: 18 }), this.mats.steel); rim.scale.set(1.045, 1.035, 1); rim.position.z = -0.006; rim.castShadow = true;
    const boss = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), this.mats.steel); boss.rotation.x = Math.PI / 2; boss.position.set(0, 0.02, 0.05);
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.3, 0.02), this.mats.leather); strap.position.set(0, 0.02, -0.02);
    sh.add(rim, slab, boss, strap);
    this.shield = sh;
    this.shieldHolder = new THREE.Object3D(); this.shieldHolder.add(sh); this.foreL.add(this.shieldHolder);   // placed each frame from the hand (placeShield)
  }

  /* ------------------------------------------------ the cloak */
  buildCloak() {
    const g = new THREE.PlaneGeometry(0.5, 0.95, 12, 16); g.translate(0, -0.475, 0);
    { // a cape, not a board: narrow at the collar, flaring toward the hem, curved round the shoulders, with long folds
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), v = clamp(-y / 0.95, 0, 1), nx = x * (0.62 + 0.62 * v);
        p.setX(i, nx); p.setZ(i, 0.9 * nx * nx * (1 - v * 0.4) + Math.sin(nx * 14) * 0.012 * v);
      }
    }
    this.cloak = new THREE.Mesh(g, this.mats.cloak); this.cloak.castShadow = true; this.cloak.frustumCulled = false;
    this.cloak.userData.base = Float32Array.from(g.attributes.position.array);
    { const p = this.P(this.spine3); this.cloak.position.set(p.x, p.y + 0.17, p.z - 0.2); this.root.add(this.cloak); this.spine3.attach(this.cloak); }
    this.cloakSway = 0;
  }
  updateCloak(dt, t, speed, turn, vy) {
    // it hangs under gravity: whatever the spine does (the combat crouch, a lunge), the cloak falls from the collar, trailing back with speed
    this.cloak.parent.updateWorldMatrix(true, false);
    const pq = this.cloak.parent.getWorldQuaternion(_q).invert(), bw = this.root.getWorldQuaternion(_q2);
    const hang = _q2.setFromAxisAngle(V(1, 0, 0), -(0.12 + clamp(speed * 0.045, 0, 0.55))).premultiply(bw);
    this.cloak.quaternion.copy(pq.multiply(hang));
    const ck = this.cloak, base = ck.userData.base, pa = ck.geometry.attributes.position, a = pa.array;
    const lift = clamp(speed * 0.07, 0, 0.7) + (vy > 1 ? -0.12 : vy < -2 ? 0.25 : 0);
    this.cloakSway = damp(this.cloakSway, clamp(turn * 0.5, -0.5, 0.5), 8, dt);
    for (let i = 0; i < a.length; i += 3) {
      const wgt = clamp(-base[i + 1] / 0.95, 0, 1);                      // 0 at the collar, 1 at the hem
      a[i] = base[i] + this.cloakSway * wgt * wgt + Math.sin(t * 2.6 + base[i + 1] * 5 + base[i] * 3) * 0.012 * wgt;
      a[i + 2] = base[i + 2] - (lift * wgt * wgt) + Math.sin(t * 1.9 + base[i + 1] * 4) * 0.02 * wgt - wgt * 0.04;
    }
    pa.needsUpdate = true; ck.geometry.computeVertexNormals();
  }

  /* ------------------------------------------------ animation */
  buildActions() {
    this.A = {};
    const mk = (name, key = name, loop = THREE.LoopRepeat) => { const a = this.mixer.clipAction(this.clips[name]); a.setLoop(loop, Infinity); a.clampWhenFinished = true; this.A[key] = a; return a; };
    for (const n of ['Idle_Loop', 'Sword_Idle', 'Walk_Loop', 'Jog_Fwd_Loop', 'Sprint_Loop', 'Jump_Loop', 'Spell_Simple_Idle_Loop']) mk(n);
    for (const n of ['Roll', 'Jump_Start', 'Jump_Land', 'Sword_Attack', 'Hit_Chest', 'Hit_Head', 'Death01', 'Spell_Simple_Shoot', 'Punch_Cross', 'Punch_Jab', 'Interact']) mk(n, n, THREE.LoopOnce);
    for (const k in this.A) { this.A[k].enabled = true; this.A[k].setEffectiveWeight(0); this.A[k].play(); }
    this.A.Idle_Loop.setEffectiveWeight(1);
    this.w = {};      // current blend weights, eased toward their targets
    for (const k in this.A) this.w[k] = k === 'Idle_Loop' ? 1 : 0;
    this.attack = null;
    this.overlay = { hit: 0 };
  }

  /** start a one-shot clip as a full-body layer (attack, roll, cast, bash...) */
  playOnce(name, { from = 0, speed = 1, hold = false } = {}) {
    const a = this.A[name]; a.reset(); a.time = from; a.timeScale = speed; a.paused = false; a.enabled = true; a.play();
    this.layer = { name, hold, t0: from, speed, age: 0 };
    return a;
  }
  stopLayer() { this.layer = null; }
  get layerTime() { return this.layer ? this.A[this.layer.name].time : 0; }
  holdLayer(on) { if (this.layer) this.A[this.layer.name].paused = on; }
  hitReact(strong = false) { this.overlay.hit = strong ? 1 : 0.7; this.A.Hit_Chest.reset(); this.A.Hit_Chest.timeScale = 1.1; this.A.Hit_Chest.play(); }
  die() { this.dead = true; const a = this.A.Death01; a.reset(); a.timeScale = 1; a.play(); }
  revive() { this.dead = false; this.A.Death01.stop(); this.A.Death01.setEffectiveWeight(0); this.layer = null; }

  /**
   * s: { speed, sprint, grounded, vy, drawn, guard, dodging, casting, moveRel (angle of travel vs facing), turn }
   * Blends locomotion by speed, lays a one-shot layer over it, then the IK arm and extra spine pose over the result.
   */
  update(dt, t, s) {
    const A = this.A, w = this.w, ease = (k, target, rate) => { w[k] = damp(w[k], target, rate, dt); };
    // ---- locomotion weights
    const sp = s.speed, onGround = s.grounded;
    const run = sp > 0.3 && onGround;
    const tWalk = run ? clamp(1 - Math.abs(sp - 2.0) / 2.0, 0, 1) * (sp < 4 ? 1 : 0) : 0;
    const tJog = run ? clamp((sp - 2.6) / 2.2, 0, 1) * (s.sprint ? clamp(1 - (sp - 6.4) / 2, 0, 1) : 1) : 0;
    const tSpr = run && s.sprint ? clamp((sp - 6.0) / 2.0, 0, 1) : 0;
    const tIdleSword = (!run || sp < 0.5) && s.drawn ? 1 : 0, tIdle = (!run || sp < 0.5) && !s.drawn ? 1 : 0;
    const locoBusy = this.layer || this.dead || !onGround;
    const open = locoBusy ? 0 : 1;
    ease('Idle_Loop', tIdle * open, 10); ease('Sword_Idle', tIdleSword * open, 10);
    ease('Walk_Loop', tWalk * open, 10); ease('Jog_Fwd_Loop', Math.max(0, tJog - tSpr * 0.0) * open, 10); ease('Sprint_Loop', tSpr * open, 10);
    const back = s.moveRel !== undefined && Math.abs(s.moveRel) > 2.0;
    A.Walk_Loop.timeScale = (back ? -1 : 1) * clamp(sp / 1.7, 0.6, 1.5);
    A.Jog_Fwd_Loop.timeScale = (back ? -1 : 1) * clamp(sp / 3.7, 0.7, 1.4);
    A.Sprint_Loop.timeScale = clamp(sp / 7.5, 0.8, 1.3);
    A.Sword_Idle.timeScale = 1; A.Idle_Loop.timeScale = 1;
    // ---- air
    if (!onGround && !this.layer && !this.dead) {
      if (!this.air) { this.air = true; this.landing = false; A.Jump_Start.reset(); A.Jump_Start.timeScale = 1.6; A.Jump_Start.play(); }
      const rising = (s.vy || 0) > 1;
      ease('Jump_Start', rising ? 1 : 0, 14); ease('Jump_Loop', rising ? 0 : 1, 10);
    } else {
      if (this.air && onGround) { this.air = false; if (!this.layer && !this.dead) { A.Jump_Land.reset(); A.Jump_Land.timeScale = 2.2; A.Jump_Land.play(); this.landT = 0.3; } }
      ease('Jump_Start', 0, 16); ease('Jump_Loop', 0, 12);
    }
    this.landT = Math.max(0, (this.landT || 0) - dt);
    ease('Jump_Land', this.landT > 0 && !this.layer ? 1 : 0, 14);
    // ---- the one-shot layer (attack, roll, cast, bash, interact)
    for (const n of ['Roll', 'Sword_Attack', 'Spell_Simple_Shoot', 'Punch_Cross', 'Punch_Jab', 'Interact']) {
      const on = this.layer && this.layer.name === n;
      ease(n, on ? 1 : 0, on ? 30 : 12);
    }
    if (this.layer) {
      this.layer.age += dt;
      const a = A[this.layer.name];
      if (!a.isRunning() && !a.paused) this.layer = null;                     // clip finished
    }
    // ---- reactions
    this.overlay.hit = Math.max(0, this.overlay.hit - dt * 3.2);
    ease('Hit_Chest', this.overlay.hit * 0.8, 40);
    ease('Death01', this.dead ? 1 : 0, this.dead ? 20 : 30);
    if (this.dead) for (const k in w) if (k !== 'Death01') w[k] = 0;
    // the mixer blends toward the bind pose when the weights add to less than one: top them up with the base pose
    let sum = 0; for (const k in w) sum += w[k];
    if (sum < 1) { const base = this.dead ? 'Death01' : s.drawn ? 'Sword_Idle' : 'Idle_Loop'; w[base] += 1 - sum; }
    for (const k in A) A[k].setEffectiveWeight(w[k]);
    this.mixer.update(dt);
    // ---- over the clips: the shield arm
    this.updateShield(dt, s);
    this.updateCloak(dt, t, sp, s.turn || 0, s.vy || 0);
  }

  /* ------------------------------------------------ the shield arm (two-bone IK) */
  updateShield(dt, s) {
    const ik = this.ik, tgtW = s.guard ? 1 : 0;
    ik.w = damp(ik.w, tgtW, s.guard ? 16 : 9, dt);
    ik.kick = damp(ik.kick, 0, 14, dt); ik.flare = damp(ik.flare, 0, 5, dt);
    if (ik.bashT > 0) { ik.bashT -= dt; if (ik.bashT <= 0) ik.bash = 0; }
    const wBlend = Math.max(ik.w, ik.bash);
    this.rig.updateMatrixWorld(true);
    const bw = this.root.getWorldQuaternion(_q);
    const fwd = V(0, 0, 1).applyQuaternion(bw);
    if (wBlend > 0.01) {
      const sh = this.P(this.upperL), rgt = V(-1, 0, 0).applyQuaternion(bw);
      const push = 0.34 + ik.bash * 0.5 - ik.kick * 0.14;
      const T = ik.target.copy(sh).addScaledVector(fwd, push).addScaledVector(rgt, -0.04).add(_v3.set(0, -0.1 + ik.bash * 0.04, 0));
      this.solveArm(this.upperL, this.foreL, this.handL, T, fwd, wBlend);
    }
    this.placeShield(fwd, wBlend);
  }

  /** the shield rides the left hand: outward at rest, face to the front on guard */
  placeShield(fwd, g) {
    this.rig.updateMatrixWorld(true);
    const bw = this.root.getWorldQuaternion(_q), left = V(1, 0, 0).applyQuaternion(bw);
    const face = V().copy(left).lerp(fwd, g).normalize();
    const upv = V(0, 1, 0), X = V().crossVectors(upv, face).normalize(), Y = V().crossVectors(face, X).normalize();
    _m.makeBasis(X, Y, face); const wq = new THREE.Quaternion().setFromRotationMatrix(_m);
    wq.premultiply(_q2.setFromAxisAngle(X, -0.12 * g));                       // the top leans a touch toward the enemy's blows
    const hp = this.P(this.handL).addScaledVector(face, 0.08 + this.ik.bash * 0.04 - this.ik.kick * 0.05).add(V(0, 0.02, 0));
    this.foreL.updateWorldMatrix(true, false);
    const pq = this.foreL.getWorldQuaternion(new THREE.Quaternion()).invert();
    this.shieldHolder.quaternion.copy(pq.multiply(wq));
    this.shieldHolder.position.copy(this.foreL.worldToLocal(hp));
    this.shield.scale.setScalar(0.9 * (1 + this.ik.flare * 0.04));
  }

  solveArm(ub, fb, hb, T, fwd, weight) {
    const A = this.P(ub), B = this.P(fb), C = this.P(hb);
    const l1 = A.distanceTo(B), l2 = B.distanceTo(C);
    const toT = _v.copy(T).sub(A); let d = clamp(toT.length(), 0.12, (l1 + l2) * 0.995); toT.normalize();
    // the elbow: out to the side and down
    const pole = _v2.set(0, -0.6, 0).addScaledVector(_v3.set(-1, 0, 0).applyQuaternion(this.root.getWorldQuaternion(_q)), 0.7).addScaledVector(fwd, -0.2).normalize();
    const cosA = clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1), ang = Math.acos(cosA);
    const perp = V().copy(pole).addScaledVector(toT, -pole.dot(toT)).normalize();
    const E = V().copy(A).addScaledVector(toT, Math.cos(ang) * l1).addScaledVector(perp, Math.sin(ang) * l1);
    const setDir = (bone, from, to) => {
      // rotate the bone (in world space) so the segment from 'from' now points to 'to'
      const cur = V().copy(this.P(bone.children.find((c) => c.isBone && !/f_|thumb/.test(c.name)) || bone)).sub(this.P(bone)).normalize();
      const want = V().copy(to).sub(from).normalize();
      const dq = new THREE.Quaternion().setFromUnitVectors(cur, want);
      const wq = bone.getWorldQuaternion(new THREE.Quaternion()); const pq = bone.parent.getWorldQuaternion(new THREE.Quaternion());
      const nq = pq.invert().multiply(dq.multiply(wq));
      bone.quaternion.slerp(nq, weight);
      bone.updateMatrixWorld(true);
    };
    setDir(ub, A, E);
    setDir(fb, this.P(fb), T);
  }

  /** the shield takes a blow: it jolts back and flares */
  shieldHit(parry = false) { this.ik.kick = parry ? 0.4 : 1; this.ik.flare = 1; }
  shieldBash(dur = 0.28) { this.ik.bash = 1; this.ik.bashT = dur; }

  setGear(relics) {
    const has = (k) => relics.includes(k);
    if (!this.gear) {
      const brass = this.mats.brass;
      this.gear = {
        heart: new THREE.Mesh(new THREE.OctahedronGeometry(0.036), this.mats.glow),
        horn: new THREE.Group(), fang: new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.07, 6), new THREE.MeshStandardMaterial({ color: 0xe0d6c2, roughness: 0.6 })),
        clasp: new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), brass),
      };
      const hb = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.05, 0.24, 8), new THREE.MeshStandardMaterial({ color: 0xe0d6c2, roughness: 0.6 })); hb.rotation.z = 1.2; this.gear.horn.add(hb);
      const pS3 = this.P(this.spine3), pH = this.P(this.hips);
      this.gear.heart.position.copy(pS3).add(V(0, 0.02, 0.21)); this.root.add(this.gear.heart); this.spine3.attach(this.gear.heart);
      this.gear.fang.position.copy(pS3).add(V(0.06, 0.1, 0.17)); this.gear.fang.rotation.x = Math.PI + 0.4; this.root.add(this.gear.fang); this.spine3.attach(this.gear.fang);
      this.gear.horn.position.copy(pH).add(V(-0.2, 0.0, 0.1)); this.root.add(this.gear.horn); this.hips.attach(this.gear.horn);
      this.gear.clasp.position.copy(pS3).add(V(-0.0, 0.18, -0.19)); this.gear.clasp.scale.set(1.6, 0.5, 1.2); this.root.add(this.gear.clasp); this.spine3.attach(this.gear.clasp);
    }
    this.gear.heart.visible = has('heart'); this.gear.horn.visible = has('horn'); this.gear.fang.visible = has('fang'); this.gear.clasp.visible = has('clasp');
    this.cloakColor(has('cloak') ? 0x8a2f2f : 0x35503d);
  }
  cloakColor(hex) { this.mats.cloak.color.setHex(hex); }
}
