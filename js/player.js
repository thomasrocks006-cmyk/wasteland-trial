import * as THREE from 'three';
import { Hero } from './hero.js';
import {
  TAU, clamp, lerp, damp, dampAngle, smoothstep, deg, angleTo,
  terrainHeight, Builder, ARENA_R, addRim, fabricTexture, leatherTexture, waterLevel
} from './core.js';

/* ---- the head, sculpted rather than assembled. Every function below takes a unit
   direction from the head centre (y up, z forward) and works in that one space, so
   the shape, the painted skin, the hairline and the eyes all agree. */
const HR = 0.118;                                      // head radius, metres
const gs = (d, w) => Math.exp(-(d * d) / (w * w));
const ER = 0.0145;                                      // eyeball radius
const EYE_DIR = [0.31, 0.12];                           // socket centre (x, y) on the unit sphere

/** unit direction in, a point on the skin out (head space, metres) */
function sculptHead(x, y, z) {
  const ax = Math.abs(x);
  const front = smoothstep(0.15, 0.6, z);
  const jaw = smoothstep(0.05, -0.9, y);               // 0 above the cheeks, 1 at the chin
  let px = x * 0.85 * (1 - 0.22 * jaw);
  const py = y * (y > 0 ? 1.08 : 0.95);
  let pz = z < 0 ? z * (1 - 0.34 * jaw) * (y > -0.35 ? 1.06 : 1) : z * 0.93;
  let f = 0;
  f += 0.036 * gs(y - 0.31, 0.075) * gs(x, 0.42);                                   // brow ridge
  f -= 0.075 * gs(ax - EYE_DIR[0], 0.13) * gs(y - EYE_DIR[1], 0.1);                  // eye sockets
  const ny = clamp((0.24 - y) / 0.46, 0, 1);
  f += (0.025 + 0.17 * Math.pow(ny, 1.7)) * smoothstep(-0.37, -0.24, y) * gs(x, 0.055 + 0.06 * ny); // nose
  f += 0.04 * gs(ax - 0.1, 0.05) * gs(y + 0.25, 0.05);                               // nostril wings
  f += 0.034 * gs(y + 0.42, 0.045) * gs(x, 0.2);                                     // upper lip
  f -= 0.022 * gs(y + 0.475, 0.016) * gs(x, 0.17);                                   // mouth line
  f += 0.03 * gs(y + 0.53, 0.04) * gs(x, 0.15);                                      // lower lip
  f -= 0.02 * gs(y + 0.62, 0.04) * gs(x, 0.2);                                       // under the lip
  f += 0.05 * gs(y + 0.84, 0.14) * gs(x, 0.3);                                       // a square chin
  f += 0.03 * gs(ax - 0.47, 0.13) * gs(y + 0.05, 0.1);                               // cheekbones
  f -= 0.02 * gs(ax - 0.5, 0.14) * gs(y + 0.42, 0.14);                               // under the cheekbone
  pz += f * front;
  px *= 1 - 0.05 * gs(ax - 0.78, 0.15) * gs(y - 0.3, 0.2);                           // temples
  return [px * HR, py * HR, pz * HR];
}

/** the hairline: how far down hair reaches at this direction (unit-sphere y) */
function hairLine(x, y, z) {
  const ang = Math.atan2(x, z), aa = Math.abs(ang);                    // 0 = forehead, pi = nape
  let yh = 0.46 - 0.88 * smoothstep(0.4, 2.7, aa) + 0.1 * x * smoothstep(1.2, 0.2, aa);  // parted high on his left
  yh -= 0.1 * gs(aa - 1.22, 0.2);                                      // sideburns
  yh += 0.17 * gs(aa - 1.66, 0.3);                                       // clear of the ears
  // locks of uneven length, sheared so they sweep across the brow to his left
  const sw = ang - 0.9 * Math.max(0, 0.5 - y) * smoothstep(1.1, 0.3, aa);
  const f = sw * 2.9 + 20.4, k = Math.floor(f), lock = 1 - Math.abs((f - k) - 0.5) * 2;
  yh -= (0.07 + 0.09 * hash2(k, 5)) * smoothstep(0.75, 0.45, aa) * Math.pow(lock, 1.4);   // fringe only: clean temples
  return yh;
}
/** hair thickness above the skin at this direction (0 where there is no hair) */
function hairDepth(x, y, z) {
  const over = y - hairLine(x, y, z);
  if (over <= 0) return 0;
  const ang = Math.atan2(x, z);
  const clump = Math.pow(Math.abs(Math.sin(ang * 9 + y * 5)), 0.6);
  return smoothstep(0, 0.2, over) * (0.004 + 0.008 * smoothstep(-0.2, 0.8, y) + 0.003 * clump) * (1 - 0.35 * Math.abs(x)) + 0.0018 * smoothstep(0, 0.025, over);
}

/** one canvas, painted texel by texel through the same directions as the sculpt */
function paintSphere(w, h, fn) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d'), img = ctx.createImageData(w, h), d = img.data, out = [0, 0, 0];
  for (let py = 0; py < h; py++) {
    const th = Math.PI * (py + 0.5) / h, st = Math.sin(th), y = Math.cos(th);
    for (let px = 0; px < w; px++) {
      const ph = TAU * (px + 0.5) / w;
      fn(-Math.cos(ph) * st, y, Math.sin(ph) * st, out, px, py);
      const o = (py * w + px) * 4;
      d[o] = out[0] * 255; d[o + 1] = out[1] * 255; d[o + 2] = out[2] * 255; d[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
const hash2 = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
const vnoise = (x, y) => { const i = Math.floor(x), j = Math.floor(y), u = x - i, v = y - j, a = hash2(i, j), b = hash2(i + 1, j), c = hash2(i, j + 1), d = hash2(i + 1, j + 1); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; };
const mixc = (c, r, g, b, t) => { c[0] += (r - c[0]) * t; c[1] += (g - c[1]) * t; c[2] += (b - c[2]) * t; };

function faceTexture() {
  return paintSphere(1024, 512, (x, y, z, c, px, py) => {
    const ax = Math.abs(x), n = hash2(px, py), over = y - hairLine(x, y, z);
    if (over > 0.08) { c[0] = 0.2; c[1] = 0.14; c[2] = 0.1; return; }                // deep under the hair: scalp only
    c[0] = 0.78; c[1] = 0.55; c[2] = 0.41;                                           // skin
    const mott = (vnoise(px / 9, py / 9) - 0.5) * 0.05 + (n - 0.5) * 0.02;
    c[0] += mott; c[1] += mott * 0.9; c[2] += mott * 0.8;
    const warm = 0.35 * gs(ax - 0.45, 0.16) * gs(y + 0.15, 0.14) + 0.4 * gs(x, 0.09) * gs(y + 0.2, 0.09) + 0.3 * smoothstep(0.85, 1, ax);
    mixc(c, 0.78, 0.43, 0.36, warm * (z > -0.3 ? 1 : 0.3));                        // cheeks, nose, ears
    if (z > 0) {
      const sock = gs(ax - EYE_DIR[0], 0.17) * gs(y - EYE_DIR[1], 0.13);
      mixc(c, 0.5, 0.33, 0.3, sock * 0.5);                                           // shadowed sockets
      const lip = Math.min(1, gs(y + 0.425, 0.035) * gs(x, 0.16) + gs(y + 0.53, 0.04) * gs(x, 0.13));
      mixc(c, 0.64, 0.36, 0.31, lip * 0.85);
      mixc(c, 0.3, 0.15, 0.12, gs(y + 0.475, 0.011) * gs(x, 0.15) * 0.8);            // the mouth line
      // stubble: jaw, chin, upper lip, along the cheeks; never on the lips
      const beard = smoothstep(-0.18, -0.42, y) + 0.7 * gs(y + 0.36, 0.04) * gs(x, 0.2);
      if (n > 0.38) mixc(c, 0.3, 0.22, 0.17, Math.min(1, beard) * (1 - lip) * 0.42 * smoothstep(-0.5, 0.2, z));
      // brows: heavy at the root, tapering out and down
      const sx = x * Math.sign(x), xr = (sx - 0.06) / 0.42;
      if (xr > 0 && xr < 1.05) {
        const yb = 0.285 + 0.06 * Math.sin(Math.min(1, xr) * 2.6) - 0.05 * xr * xr;
        const th = 0.052 * (1 - 0.55 * xr);
        const dd = Math.abs(y - yb) / th, strand = 0.6 + 0.4 * hash2(px >> 1, py);
        mixc(c, 0.16, 0.11, 0.08, smoothstep(1.1, 0.45, dd) * smoothstep(1.05, 0.8, xr) * strand);
      }
    } else if (y < -0.2) {
      if (n > 0.38) mixc(c, 0.3, 0.22, 0.17, 0.35 * smoothstep(-0.2, -0.5, y));      // stubble round the jaw
    }
    mixc(c, 0.2, 0.14, 0.1, smoothstep(0.0, 0.08, over));            // scalp under the hair
  });
}

function eyeTexture() {
  // painted round the sphere's pole: rows are angle from the pupil, columns go round it
  return paintSphere(256, 128, (x, y, z, c, px, py) => {
    const a = Math.PI * (py + 0.5) / 128, n = hash2(px, 7) * 0.5 + hash2(px >> 1, 3) * 0.5;
    c[0] = 0.93; c[1] = 0.9; c[2] = 0.86;                                             // sclera
    mixc(c, 0.86, 0.62, 0.58, smoothstep(1.0, 1.8, a) * 0.5);
    if (a < 0.54) {
      const t = a / 0.54;
      c[0] = 0.62 - 0.36 * t; c[1] = 0.48 - 0.16 * t; c[2] = 0.2 - 0.02 * t;         // hazel: gold at the pupil, green-brown out
      const fib = 0.8 + 0.4 * n;
      c[0] *= fib; c[1] *= fib; c[2] *= fib;
      mixc(c, 0.08, 0.06, 0.04, smoothstep(0.82, 1.0, t));                            // the limbal ring
      if (a < 0.2) { c[0] = 0.02; c[1] = 0.02; c[2] = 0.02; }                          // pupil
    }
  });
}

/** an eyelid: a curved patch over the eyeball; the edge is an almond, lashes dark */
function lidGeometry(upper, C) {
  const rows = 7, cols = 18, pos = [], col = [], idx = [], rl = ER * 1.1;
  const skin = new THREE.Color(C.skin), lash = new THREE.Color(upper ? 0x140e0b : C.skinShade), crease = new THREE.Color(C.skinShade);
  for (let j = 0; j <= rows; j++) {
    const t = j / rows;
    for (let i = 0; i <= cols; i++) {
      const s = i / cols * 2 - 1, a = s * 1.2;
      const edge = (upper ? 0.36 : -0.42) * Math.pow(1 - s * s, 0.75) + 0.06 * s;   // outer corner a touch higher
      const e = edge + t * ((upper ? 1.35 : -1.25) - edge);
      const r = rl * (1 + 0.05 * Math.pow(1 - t, 3));
      pos.push(r * Math.cos(e) * Math.sin(a), r * Math.sin(e), r * Math.cos(e) * Math.cos(a));
      const cc = t < 0.13 ? lash : (Math.abs(t - 0.45) < 0.08 && upper ? crease : skin);
      col.push(cc.r, cc.g, cc.b);
    }
  }
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const a = j * (cols + 1) + i, b = a + 1, c = a + cols + 1, d = c + 1;
    if (upper) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function buildFace(C, std) {
  const grp = new THREE.Group();
  const g = new THREE.SphereGeometry(1, 72, 48);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setXYZ(i, ...sculptHead(p.getX(i), p.getY(i), p.getZ(i)));
  g.computeVertexNormals();
  const skin = addRim(new THREE.MeshStandardMaterial({ map: faceTexture(), roughness: 0.58, metalness: 0, envMapIntensity: 0.55 }), 0xffe4d0, 0.07, 3.2);
  const face = new THREE.Mesh(g, skin);
  face.castShadow = true;
  grp.add(face);
  const eyeMat = new THREE.MeshStandardMaterial({ map: eyeTexture(), roughness: 0.08, metalness: 0, envMapIntensity: 1.2 });
  const lidMat = std({ roughness: 0.6, side: THREE.DoubleSide }, 0.04);
  const glint = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
  const eyeGeo = new THREE.SphereGeometry(ER, 24, 16).rotateX(Math.PI / 2);
  for (const sx of [-1, 1]) {
    const dx = sx * EYE_DIR[0], dy = EYE_DIR[1], dz = Math.sqrt(1 - dx * dx - dy * dy);
    const [sxp, syp, szp] = sculptHead(dx, dy, dz);
    const at = new THREE.Group();
    at.position.set(sxp, syp, szp - ER + 0.0032);
    at.rotation.y = sx * 0.06;                                   // a hair of outward splay
    at.add(new THREE.Mesh(eyeGeo, eyeMat));
    at.add(new THREE.Mesh(lidGeometry(true, C), lidMat), new THREE.Mesh(lidGeometry(false, C), lidMat));
    const gl = new THREE.Mesh(new THREE.SphereGeometry(0.0017, 8, 6), glint);
    gl.position.set(-0.0032, 0.0034, 0).setZ(Math.sqrt(ER * ER - 0.0032 ** 2 - 0.0034 ** 2) + 0.0004);
    at.add(gl);
    grp.add(at);
  }
  return grp;
}

function hairTexture() {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 256;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#7a7a7a'; ctx.fillRect(0, 0, 256, 256);
  for (let k = 0; k < 900; k++) {
    const x = hash2(k, 1) * 256, v = 60 + hash2(k, 2) * 160 | 0;
    ctx.strokeStyle = `rgb(${v},${v},${v})`; ctx.lineWidth = 0.6 + hash2(k, 3) * 1.6;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.bezierCurveTo(x + 6, 90, x - 6, 170, x + 3, 256); ctx.stroke();
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(5, 1);
  return t;
}

/** a lock of hair: a flattened tube along points, thick at the root, pointed at the tip */
function lockGeometry(pts, r0) {
  const curve = new THREE.CatmullRomCurve3(pts), segs = 10, sides = 6;
  const fr = curve.computeFrenetFrames(segs, false), pos = [], uv = [], idx = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, c = curve.getPointAt(t), r = r0 * Math.pow(1 - t, 0.75) + 0.0018;
    for (let j = 0; j <= sides; j++) {
      const a = j / sides * TAU, n = fr.normals[i], b = fr.binormals[i];
      pos.push(c.x + (n.x * Math.cos(a) * 0.45 + b.x * Math.sin(a)) * r, c.y + (n.y * Math.cos(a) * 0.45 + b.y * Math.sin(a)) * r, c.z + (n.z * Math.cos(a) * 0.45 + b.z * Math.sin(a)) * r);
      uv.push(j / sides * 0.2, t);
    }
  }
  for (let i = 0; i < segs; i++) for (let j = 0; j < sides; j++) {
    const a = i * (sides + 1) + j, b = a + sides + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
/** join indexed geometries that carry position, normal and uv */
function mergeLocks(list) {
  const pos = [], nor = [], uv = [], idx = [];
  let base = 0;
  for (const g of list) {
    pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array); uv.push(...g.attributes.uv.array);
    for (const i of g.index.array) idx.push(i + base);
    base += g.attributes.position.count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** swept hair: a shell over the skull, thick at the crown, locks over the brow */
function buildHair(C) {
  const g = new THREE.SphereGeometry(1, 96, 56);
  const p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.set(p.getX(i), p.getY(i), p.getZ(i));
    const s = sculptHead(v.x, v.y, v.z), over = v.y - hairLine(v.x, v.y, v.z);
    // past the hairline the shell dips under the skin: a smooth edge, not a stepped one
    const h = over > 0 ? hairDepth(v.x, v.y, v.z) : Math.max(-0.006, over * 0.3), k = 1;
    // the locks lift a touch off the brow and sweep to his left
    const lift = h > 0 && v.z > 0.3 && v.y < 0.6 ? 0.004 : 0;
    p.setXYZ(i, s[0] * k + v.x * (h + lift) + (v.z > 0.3 ? h * 0.25 : 0), s[1] * k + v.y * h, s[2] * k + v.z * (h + lift));
  }
  g.computeVertexNormals();
  // locks laid over the shell, crown outwards: they break up the helmet outline
  const locks = [];
  const onHair = (x, y, z, up) => { const d = new THREE.Vector3(x, y, z).normalize(); return new THREE.Vector3(...sculptHead(d.x, d.y, d.z)).addScaledVector(d, hairDepth(d.x, d.y, d.z) + up); };
  for (let i = 0; i < 15; i++) {
    const a = i / 15 * TAU + 0.3 * hash2(i, 9), down = 0.35 + 0.35 * hash2(i, 4);
    const sweep = 0.5 + 0.4 * hash2(i, 2);
    const pts = [];
    for (let k = 0; k <= 4; k++) {
      const t = k / 4, el = 1.15 - t * (1.15 - (Math.abs(Math.cos(a)) > 0.7 && Math.cos(a) > 0 ? 0.62 : down));
      const az = a + t * sweep * 0.5;
      pts.push(onHair(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el), 0.002 + 0.003 * Math.sin(t * Math.PI)));
    }
    locks.push(lockGeometry(pts, 0.012 + 0.006 * hash2(i, 7)));
  }
  const merged = mergeLocks([g, ...locks]);
  const tex = hairTexture();
  const mat = addRim(new THREE.MeshStandardMaterial({ color: 0x3a2618, map: tex, bumpMap: tex, bumpScale: 1.5, roughness: 0.48, metalness: 0, envMapIntensity: 0.9 }), 0xd8c0a0, 0.12, 2.6);
  const m = new THREE.Mesh(merged, mat);
  m.castShadow = true;
  return m;
}

/* The runner, sculpted. An original wasteland scout: red headwrap with streaming
   tails, navy coat with a flared skirt, sand scarf, brass-trimmed leather, cloak.
   Bodies are lathed profiles (chest, waist, shoulders, bicep, forearm, thigh,
   calf), adult proportions (about 7.5 heads), a shaped face, PBR materials.
   The rig (joint names and positions) is unchanged: animation, weapons and camera
   all depend on it. Faces +z; right is -x. */
export function buildHero() {
  const C = {
    skin: 0xc28a62, skinShade: 0xa87050, stubble: 0x9a6a4c, lip: 0x9a5a48, hair: 0x241811,
    wrap: 0xa83a26, wrapDark: 0x6e2416, cream: 0xd8c49a, creamDark: 0xbfa77a,
    coat: 0x2b3a6c, coatDark: 0x1c2750, trousers: 0x3b3631, trousersDark: 0x2b2723,
    boot: 0x3a2818, sole: 0x1c140e, glove: 0x2e2117, brass: 0xc0903c, fur: 0x6b5440,
    eye: 0xf2ece2, iris: 0x4a3018, cyan: 0x37e0c8,
  };
  const V2 = (r, y) => new THREE.Vector2(r, y);
  const LATHE = (pts, seg = 22, a0 = 0, al = Math.PI * 2) => new THREE.LatheGeometry(pts.map(([r, y]) => V2(r, y)), seg, a0, al);
  const S = (r, w = 20, h = 14) => new THREE.SphereGeometry(r, w, h);
  const CAP = (r, l) => new THREE.CapsuleGeometry(r, l, 6, 14);
  const CYL = (r0, r1, h, s = 18) => new THREE.CylinderGeometry(r0, r1, h, s);
  const TOR = (r, t) => new THREE.TorusGeometry(r, t, 8, 24);

  const cloth = fabricTexture(), leather = leatherTexture();
  // physically based: cloth is rough and dull, leather has a little sheen, skin is soft
  const std = (o, rim = 0.1) => addRim(new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0, envMapIntensity: 0.7, ...o }), 0xdfe8ff, rim, 3.2);
  const clothMat = std({ map: cloth, bumpMap: cloth, bumpScale: 1.4, roughness: 0.92 });
  const leatherMat = std({ map: leather, bumpMap: leather, bumpScale: 2.0, roughness: 0.58 });
  const skinMat = std({ roughness: 0.55 }, 0.06);
  const B = () => new Builder({ smooth: true });
  const mesh = (b, m = clothMat) => { const o = new THREE.Mesh(b.buildUV(3.2), m); o.castShadow = true; return o; };
  const G = (x = 0, y = 0, z = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); return g; };

  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body);

  // ---- pelvis (body space)
  const hips = B();
  hips.add(S(0.155), C.trousers, { pos: [0, 0.95, 0], scale: [1.08, 0.72, 0.8] });
  body.add(mesh(hips));

  // ---- torso: a lathed coat with chest, waist and a shoulder slope; a flared coat skirt
  const torso = G(0, 1.0, 0);
  body.add(torso);
  const t = B();
  t.add(LATHE([[0.155, -0.06], [0.15, 0.02], [0.145, 0.09], [0.158, 0.2], [0.18, 0.31], [0.192, 0.41], [0.188, 0.48], [0.168, 0.54], [0.115, 0.6], [0.07, 0.64], [0.062, 0.68]]), C.coat, { scale: [1.18, 1, 0.78] });
  // coat skirt: open at the front so the legs move freely
  t.add(LATHE([[0.162, 0.04], [0.172, -0.06], [0.19, -0.18], [0.215, -0.3]], 22, Math.PI * 0.62, Math.PI * 1.76), C.coatDark, { scale: [1.12, 1, 0.82], rot: [0, Math.PI, 0] });
  for (const sx of [-1, 1]) t.add(S(0.075), C.coat, { pos: [sx * 0.17, 0.52, -0.005], scale: [1.25, 0.8, 1.0] });   // trapezius into the shoulder
  t.add(new THREE.BoxGeometry(0.05, 0.4, 0.02), C.cream, { pos: [0, 0.34, 0.15], rot: [0.06, 0, 0] });           // shirt at the open front
  for (const sx of [-1, 1]) t.add(new THREE.BoxGeometry(0.07, 0.36, 0.022), C.coatDark, { pos: [sx * 0.05, 0.35, 0.152], rot: [0.06, 0, sx * 0.08] }); // lapels
  t.add(TOR(0.148, 0.022), C.boot, { pos: [0, 0.03, 0], rot: [Math.PI / 2, 0, 0], scale: [1.16, 0.78, 1] });   // belt
  t.add(new THREE.BoxGeometry(0.06, 0.045, 0.02), C.brass, { pos: [0, 0.03, 0.125] });
  t.add(CAP(0.05, 0.05), C.boot, { pos: [0.14, -0.02, 0.09], rot: [0, 0, Math.PI / 2], scale: [1, 1, 0.8] });     // pouch
  t.add(new THREE.BoxGeometry(0.045, 0.035, 0.02), C.brass, { pos: [0.14, 0.0, 0.13] });
  t.add(new THREE.BoxGeometry(0.05, 0.62, 0.022), C.boot, { pos: [0.02, 0.32, 0.15], rot: [0, 0, -0.6] });       // baldric
  t.add(TOR(0.028, 0.007), C.brass, { pos: [0.02, 0.32, 0.162] });
  t.add(TOR(0.1, 0.034), C.cream, { pos: [0, 0.62, 0.0], rot: [Math.PI / 2 - 0.2, 0, 0], scale: [1.1, 1, 0.95] });  // scarf
  t.add(TOR(0.125, 0.042), C.fur, { pos: [0, 0.585, -0.035], rot: [Math.PI / 2 + 0.15, 0, 0], scale: [1.18, 1, 0.9] }); // fur collar
  t.add(CAP(0.03, 0.2), C.creamDark, { pos: [0.05, 0.47, -0.15], rot: [0.25, 0, 0.1] });                         // scarf end
  t.add(S(0.09), 0x8a6a34, { pos: [-0.22, 0.555, 0], scale: [1.2, 0.5, 1.1] });                                    // brass pauldron
  const torsoMesh = mesh(t);
  torso.add(torsoMesh);

  // ---- the sheath: weapons ride diagonally across the back, hilt over the right shoulder
  const back = G(-0.17, 0.6, -0.27);
  back.rotation.set(0.12, 0, 0.62);
  torso.add(back);

  // ---- the cloak
  const cg = new THREE.PlaneGeometry(0.62, 1.05, 14, 14);
  cg.translate(0, -0.525, 0);
  {
    // gathered at the collar, wrapping the shoulders, pleats deepening to a ragged hem
    const p = cg.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), v = -y / 1.05, u = x / 0.31;
      const fold = Math.sin(u * Math.PI * 3.5 + 0.6) * 0.02 * (0.25 + v);
      p.setXYZ(i, x * (0.72 + 0.28 * Math.sqrt(v)), y * (1 + 0.035 * Math.sin(u * 9 + 1) * v), (1 - Math.cos(u * 1.1)) * 0.2 * (1 - 0.6 * v) + fold);
    }
  }
  const cloak = new THREE.Mesh(cg, new THREE.MeshStandardMaterial({ color: 0x35503d, map: cloth, bumpMap: cloth, bumpScale: 1.2, roughness: 0.95, side: THREE.DoubleSide, envMapIntensity: 0.6 }));
  cloak.position.set(0, 0.6, -0.19);
  cloak.castShadow = true;
  cloak.userData.base = Float32Array.from(cg.attributes.position.array);
  torso.add(cloak);

  // ---- head: one sculpted surface (brow, sockets, nose, lips, jaw) with painted skin,
  // eyes set under real lids, swept hair, and the red band whose tails stream back
  const head = G(0, 0.69, 0);
  torso.add(head);
  const neck = B();
  neck.add(LATHE([[0.07, -0.06], [0.062, 0.0], [0.056, 0.05], [0.052, 0.1]], 16), 0x8e5c40, {});
  head.add(mesh(neck, skinMat));
  const hg = G(0, 0.14, 0.014);             // head centre
  hg.scale.setScalar(1.1);                  // a touch larger than life: it reads, and it looks animated
  head.add(hg);
  hg.add(buildFace(C, std));
  const ears = B();
  for (const sx of [-1, 1]) {
    const [ex, ey, ez] = sculptHead(sx * 0.975, 0.0, -0.2);
    ears.add(S(0.024, 12, 10), 0x9a6448, { pos: [ex + sx * 0.002, ey, ez], scale: [0.32, 1.15, 0.72], rot: [0, sx * 0.3, 0] });
    ears.add(new THREE.TorusGeometry(0.016, 0.004, 6, 14, Math.PI * 1.3), 0xa86c4e, { pos: [ex + sx * 0.006, ey + 0.002, ez - 0.002], rot: [0, sx * (Math.PI / 2 + 0.3), Math.PI * 0.35] });
  }
  hg.add(mesh(ears, skinMat));
  const kit = B();
  // the red band, tied round the hair, knotted at the back
  const ring = [];
  for (let k = 0; k < 40; k++) {
    const a = k / 40 * TAU, y = 0.5 - 0.24 * (1 - Math.cos(a)) / 2;
    const d = new THREE.Vector3(Math.sin(a), y, Math.cos(a)).normalize();
    const p = new THREE.Vector3(...sculptHead(d.x, d.y, d.z));
    ring.push(p.addScaledVector(d, hairDepth(d.x, d.y, d.z) + 0.004));
  }
  kit.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(ring, true), 64, 0.0072, 8, true), C.wrap, {});
  const knot = new THREE.Vector3(...sculptHead(0, 0.27, -0.96)).addScaledVector(new THREE.Vector3(0, 0.27, -0.96), 0.02);
  kit.add(S(0.017), C.wrapDark, { pos: [knot.x, knot.y, knot.z], scale: [1.3, 0.9, 0.8] });
  const earR = sculptHead(-0.975, 0, -0.2);
  kit.add(CYL(0.011, 0.011, 0.012, 12), C.cyan, { pos: [earR[0] - 0.012, earR[1], earR[2]], rot: [0, 0, Math.PI / 2] });   // earpiece
  hg.add(mesh(kit));
  hg.add(buildHair(C));
  const tails = G(knot.x, knot.y, knot.z - 0.005);
  const tl = B();
  tl.add(CAP(0.012, 0.17), C.wrap, { pos: [0.015, -0.1, -0.012], rot: [0.12, 0, 0.12], scale: [1.5, 1, 0.45] });
  tl.add(CAP(0.011, 0.13), C.wrapDark, { pos: [-0.018, -0.08, -0.008], rot: [0.08, 0, -0.18], scale: [1.5, 1, 0.45] });
  tails.add(mesh(tl));
  hg.add(tails);

  // ---- arms: lathed deltoid, bicep and forearm; a gloved hand with fingers
  const arm = (side) => {
    const sh = G(side * 0.245, 0.53, 0);
    sh.rotation.order = 'YXZ';      // pitch the arm first, then sweep it round: what a slash needs
    const u = B();
    u.add(S(0.074), C.coat, { pos: [0, -0.005, 0], scale: [1.05, 0.95, 1] });
    u.add(LATHE([[0.072, 0.0], [0.074, -0.05], [0.068, -0.12], [0.064, -0.18], [0.056, -0.25], [0.05, -0.3]], 18), C.coat, {});
    sh.add(mesh(u));
    const elbow = G(0, -0.29, 0);
    const f = B();
    f.add(S(0.052), C.coat, {});
    f.add(LATHE([[0.05, 0.0], [0.056, -0.05], [0.052, -0.12], [0.044, -0.22], [0.039, -0.28]], 18), C.coat, {});
    f.add(TOR(0.056, 0.016), C.coatDark, { pos: [0, -0.08, 0], rot: [Math.PI / 2, 0, 0] });                       // cuff
    elbow.add(mesh(f));
    const br = B();
    br.add(LATHE([[0.052, -0.13], [0.054, -0.18], [0.048, -0.27]], 18), C.boot, {});                              // bracer
    br.add(TOR(0.054, 0.008), C.brass, { pos: [0, -0.15, 0], rot: [Math.PI / 2, 0, 0] });
    elbow.add(mesh(br, leatherMat));
    sh.add(elbow);
    const hand = G(0, -0.29, 0.02);
    const hd = B();
    hd.add(new THREE.BoxGeometry(0.075, 0.08, 0.035), C.glove, { pos: [0, -0.035, 0] });                         // palm
    for (let k = 0; k < 4; k++) hd.add(CAP(0.0115, 0.04), C.glove, { pos: [(k - 1.5) * 0.019, -0.09, 0.012], rot: [0.5, 0, 0] }); // fingers, curled
    hd.add(CAP(0.012, 0.035), C.glove, { pos: [-side * 0.04, -0.035, 0.02], rot: [0.4, 0, -side * 0.8] });      // thumb
    hd.add(TOR(0.042, 0.01), C.boot, { pos: [0, 0.005, 0], rot: [Math.PI / 2, 0, 0] });                           // cuff strap
    hand.add(mesh(hd, leatherMat));
    elbow.add(hand);
    return { sh, elbow, hand };
  };
  const R = arm(-1), Lf = arm(1);
  torso.add(R.sh, Lf.sh);

  // ---- legs: lathed thigh and calf, tall boots; the sole lands at body y 0.085
  const leg = (side) => {
    const hip = G(side * 0.1, 0.92, 0);
    const th = B();
    th.add(LATHE([[0.088, 0.05], [0.095, -0.04], [0.09, -0.16], [0.077, -0.3], [0.064, -0.4], [0.062, -0.44]], 18), C.trousers, {});
    hip.add(mesh(th));
    const knee = G(0, -0.42, 0);
    const sn = B();
    sn.add(S(0.064), C.trousersDark, { pos: [0, 0.0, 0.01], scale: [1, 1, 1.05] });                                // knee
    sn.add(S(0.06), C.trousersDark, { pos: [0, -0.01, 0.04], scale: [0.95, 0.8, 0.6] });                          // knee pad
    knee.add(mesh(sn));
    const bt = B();
    bt.add(LATHE([[0.068, -0.03], [0.072, -0.1], [0.066, -0.18], [0.055, -0.27], [0.052, -0.31]], 18), C.boot, {}); // boot shaft over the calf
    bt.add(TOR(0.07, 0.012), C.boot, { pos: [0, -0.035, 0], rot: [Math.PI / 2, 0, 0] });                            // boot cuff
    bt.add(TOR(0.058, 0.007), C.brass, { pos: [0, -0.24, 0], rot: [Math.PI / 2, 0, 0] });                           // buckle band
    knee.add(mesh(bt, leatherMat));
    hip.add(knee);
    const foot = G(0, -0.3, 0);
    const ft = B();
    ft.add(S(0.075, 16, 12), C.boot, { pos: [0, -0.04, 0.05], scale: [0.92, 0.75, 1.5] });
    ft.add(S(0.055, 12, 10), C.boot, { pos: [0, -0.06, 0.145], scale: [1.0, 0.68, 1.1] });
    ft.add(CAP(0.064, 0.15), C.sole, { pos: [0, -0.098, 0.05], rot: [Math.PI / 2, 0, 0], scale: [1.08, 1, 0.4] });
    ft.add(S(0.048, 10, 8), C.sole, { pos: [0, -0.09, -0.045], scale: [1.05, 0.55, 0.9] });
    foot.add(mesh(ft, leatherMat));
    knee.add(foot);
    return { hip, knee, foot };
  };
  const LR = leg(-1), LL = leg(1);
  body.add(LR.hip, LL.hip);

  return {
    root, body, torso, head, tails, torsoMesh, cloak, back,
    armR: R.sh, armL: Lf.sh, elbowR: R.elbow, elbowL: Lf.elbow, hand: R.hand, handL: Lf.hand,
    legR: LR.hip, legL: LL.hip, kneeR: LR.knee, kneeL: LL.knee, footR: LR.foot, footL: LL.foot,
  };
}

export class Player {
  constructor(scene, world, heroAsset = null) {
    this.world = world;
    this.hero = heroAsset ? new Hero(heroAsset) : null;    // the skinned, armoured Warden; the procedural hero below is the fallback
    this.model = this.hero || buildHero();
    scene.add(this.model.root);

    this.pos = new THREE.Vector3(0, 0, 0);
    this.vel = new THREE.Vector3();
    this.vy = 0;
    this.yaw = Math.PI;
    this.grounded = true;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.landDip = 0;

    this.camYaw = Math.PI;
    this.camPitch = -0.06;
    this.aim = false;

    this.maxHp = 100;
    this.hp = 100;
    this.alive = true;
    this.speed = 5.5;
    this.sprintMul = 1.55;

    // recoil / shake state (driven by weapons + damage)
    this.recoilPitch = 0;
    this.recoilYaw = 0;
    this.recoilVelP = 0;
    this.recoilVelY = 0;
    this.shake = 0;
    this.shakeT = 0;
    this.hurtFlash = 0;
    this.knock = new THREE.Vector3();
    this.faceLock = 0;
    this.iframe = 0;

    // ---- charge (internally 'eco') and the two forms
    this.eco = 0;
    this.maxEco = 100;
    this.mode = 'normal';
    this.modeT = 0;
    this.dmgMul = 1;
    this.dmgTakenMul = 1;
    this.fireRateMul = 1;
    this.onMode = null;
    this.formDur = 9;          // perks can lengthen it
    this.dodgeCdBase = 0.8;
    this.dodgeIframe = 0.42;
    this.regen = 0;            // health per second from perks
    this.weaponKind = 'melee';  // melee | thrown | spell, set by the weapon system
    this.swingAnim = null;
    this._swingTwist = 0;
    this.inWater = 0;          // wading depth in metres

    // ---- stamina, guard and lock-on (Wander only: staminaOn is set by the game)
    this.staminaOn = false;
    this.stam = 100; this.maxStam = 100;
    this.stamDelay = 0;        // seconds before it refills after being spent
    this.exhausted = false;    // emptied: no sprint, guard or swing until it recovers
    this.guard = false;        // guard held
    this.guardT = 0;           // seconds since the guard went up: the opening window is a parry
    this.parryWindow = 0.32;
    this.guardDmgTaken = 0.2;  // share of a blocked hit that still lands
    this.guardCostMul = 1;     // perks: blocked blows cost less stamina
    this.sprintCostMul = 1;    // relics
    this.parryRefund = 14;
    this.guardIdle = 9;        // seconds since the guard last dropped: a parry needs a fresh raise, so tapping it is not a shield
    this.parryReady = false;
    this.lockBreak = 0;
    this.lockTarget = null;
    this.onParry = null; this.onBlock = null; this.onGuardBreak = null;
    this.sprinting = false;
    this.moveMul = 1;          // attacks slow you; eased back by the melee system
    this.riposteT = 0;         // after a parry: the next blow hits much harder
    this.faceOverride = null;  // { yaw, t }: turn the body to a foe for a blow
    this.cancelAttack = null;
    this.armorMul = 1;         // relics: a share of every blow absorbed (separate from the forms' own multiplier)

    const auraMat = new THREE.MeshBasicMaterial({
      color: 0x66f0ff, transparent: true, opacity: 0.26,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide
    });
    this.aura = new THREE.Mesh(new THREE.SphereGeometry(1.05, 12, 10), auraMat);
    this.aura.position.y = 1.0;
    this.aura.visible = false;
    this.model.root.add(this.aura);
    // a ring at the feet reads the form far better than a shell alone
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x66f0ff, transparent: true, opacity: 0.75,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
    });
    this.auraRing = new THREE.Mesh(new THREE.RingGeometry(0.75, 1.15, 24), ringMat);
    this.auraRing.rotation.x = -Math.PI / 2;
    this.auraRing.position.y = 0.06;
    this.auraRing.visible = false;
    this.model.root.add(this.auraRing);
    this.auraLight = new THREE.PointLight(0x66f0ff, 0, 14, 2);
    this.auraLight.position.y = 1.3;
    this.model.root.add(this.auraLight);
    // the guard: a pale dome of light held in front, flaring white when a blow is turned
    this.shieldMat = new THREE.MeshBasicMaterial({
      color: 0x8fe9ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
    });
    this.shield = new THREE.Mesh(new THREE.SphereGeometry(1.2, 18, 10, -1.0, 2.0, 0.55, 1.5), this.shieldMat);
    this.shield.position.set(0, 1.0, 0.25);
    this.shield.visible = false;
    this.model.root.add(this.shield);
    this.lookVelX = 0;
    this.lookVelY = 0;
    this.dodging = 0;
    this.dodgeCd = 0;
    this.dodgeVX = 0;
    this.dodgeVZ = 0;
    this.recentre = 0;
    this.landSquash = 0;

    this.walkPhase = 0;
    this.stepTimer = 0;
    this.onFootstep = null;

    this.camPos = new THREE.Vector3();
    this.camLook = new THREE.Vector3();
    this._camTarget = new THREE.Vector3();

    this.pos.set(0, 0, 12);          // clear of the central dais, which is solid
    this.pos.y = terrainHeight(0, 12);
    this.model.root.position.copy(this.pos);
  }

  get forward() {
    return new THREE.Vector3(Math.sin(this.camYaw), 0, Math.cos(this.camYaw));
  }
  get eyePos() {
    return new THREE.Vector3(this.pos.x, this.pos.y + 1.55, this.pos.z);
  }

  addRecoil(pitchDeg, yawDeg) {
    this.recoilVelP += deg(pitchDeg) * 16.0;
    this.recoilVelY += deg(yawDeg) * 16.0;
    this.shake = Math.min(1.6, this.shake + pitchDeg * 0.055);
    this.faceLock = 0.9;
  }

  /** spend stamina on an action; false (and nothing spent) if winded */
  spend(n) {
    if (!this.staminaOn) return true;
    if (this.exhausted || this.stam <= 0) return false;
    this.stam = Math.max(0, this.stam - n);
    this.stamDelay = 0.75;
    if (this.stam <= 0) this.exhausted = true;
    return true;
  }

  damage(amount, fromX, fromZ) {
    if (!this.alive) return;
    if (this.iframe > 0) return;
    amount *= this.armorMul;
    // the guard turns blows from the front: the first instant turns them completely (a parry)
    if (this.guard && fromX !== undefined && Math.abs(angleTo(this.camYaw, Math.atan2(fromX - this.pos.x, fromZ - this.pos.z))) < 1.9) {
      this.iframe = 0.25;
      if (this.parryReady && this.guardT <= this.parryWindow) {
        this.stam = Math.min(this.maxStam, this.stam + this.parryRefund);
        this.shieldMat.opacity = 1;
        if (this.hero) this.hero.shieldHit(true);
        this.riposteT = 1.1;
        if (this.onParry) this.onParry(fromX, fromZ);
        return;
      }
      const cost = amount * 1.1 * this.guardCostMul;
      if (this.stam < cost) {                       // guard broken: it holds, but costs you
        this.stam = 0; this.exhausted = true; this.guard = false; this.stamDelay = 1.2;
        this.hp = Math.max(0, this.hp - amount * 0.6 * this.dmgTakenMul);
        this.hurtFlash = 1; this.shake = Math.min(2.0, this.shake + 0.6);
        if (this.onGuardBreak) this.onGuardBreak();
        if (this.hp <= 0) this.alive = false;
        return;
      }
      this.stam -= cost; this.stamDelay = 0.9;
      this.hp = Math.max(0, this.hp - amount * this.guardDmgTaken * this.dmgTakenMul);
      this.shieldMat.opacity = 0.9;
      this.shake = Math.min(2.0, this.shake + 0.25);
      if (this.hero) this.hero.shieldHit(false);
      if (this.onBlock) this.onBlock(fromX, fromZ);
      if (this.hp <= 0) this.alive = false;
      return;
    }
    this.iframe = 0.40;
    this.hp = Math.max(0, this.hp - amount * this.dmgTakenMul);
    this.hurtFlash = 1;
    if (this.hero) { this.hero.hitReact(amount > 20); if (this.cancelAttack) this.cancelAttack(); }
    this.shake = Math.min(2.0, this.shake + 0.45);
    if (fromX !== undefined) {
      const a = Math.atan2(fromX - this.pos.x, fromZ - this.pos.z);
      if (this.onDamageDir) this.onDamageDir(a);
    }
    if (this.hp <= 0) this.alive = false;
  }

  heal(n) { this.hp = Math.min(this.maxHp, this.hp + n); }

  /** R / L horizontal slashes, O overhead chop, T spear throw, C rune cast */
  startSwing(style, dur) {
    if (this.hero) {                       // the clips do the work; melee swings are the melee system's
      if (style === 'T') this.hero.playOnce('Punch_Cross', { from: 0.0, speed: 1.9 });
      else if (style === 'C') this.hero.playOnce('Spell_Simple_Shoot', { from: 0.0, speed: 1.4 });
      return;
    }
    this.swingAnim = { style, dur, t: 0 };
  }

  addEco(n) { this.eco = Math.min(this.maxEco, this.eco + n); }

  /** Light form: fast, shielded, healing. Dark form: heavy damage, unavoidable. */
  activateMode(mode) {
    if (this.modeT > 0 || this.eco < 45 || !this.alive) return false;
    this.eco -= 45;
    this.mode = mode;
    this.modeT = this.formDur;
    if (mode === 'light') {
      this.dmgMul = 1;
      this.dmgTakenMul = 0.42;
      this.fireRateMul = 1.35;
      this.aura.material.color.setHex(0x6ef0ff);
      this.auraLight.color.setHex(0x6ef0ff);
      this.heal(22);
    } else {
      this.dmgMul = 1.75;
      this.dmgTakenMul = 0.82;
      this.fireRateMul = 1.0;
      this.aura.material.color.setHex(0xc06bff);
      this.auraLight.color.setHex(0xc06bff);
    }
    this.aura.visible = true;
    this.auraRing.visible = true;
    this.auraRing.material.color.copy(this.aura.material.color);
    this.auraLight.intensity = 7;
    if (this.onMode) this.onMode(mode);
    return true;
  }

  endMode() {
    if (this.mode === 'normal') return;
    this.mode = 'normal';
    this.modeT = 0;
    this.dmgMul = 1;
    this.dmgTakenMul = 1;
    this.fireRateMul = 1;
    this.aura.visible = false;
    this.auraRing.visible = false;
    this.auraLight.intensity = 0;
    if (this.onMode) this.onMode('normal');
  }

  /* input: {mx, my, jump, sprint, lookX, lookY} */
  update(dt, input) {
    if (!this.alive) { this.updateCamera(dt); return; }

    // ---- camera look (smoothed so touch jitter doesn't snap the aim)
    // dragging right must turn the view right, which is +yaw here
    this.lookVelX = damp(this.lookVelX, input.lookX, 34, dt);
    this.lookVelY = damp(this.lookVelY, input.lookY, 34, dt);
    // +yaw swings the view to screen-LEFT here, so a rightward drag must lower it
    this.camYaw -= this.lookVelX;
    this.camPitch = clamp(this.camPitch - this.lookVelY, -0.95, 0.62);

    // ---- recoil spring
    this.recoilVelP += -this.recoilPitch * 46 * dt;
    this.recoilVelP *= Math.exp(-9 * dt);
    this.recoilPitch += this.recoilVelP * dt;
    this.recoilVelY += -this.recoilYaw * 46 * dt;
    this.recoilVelY *= Math.exp(-9 * dt);
    this.recoilYaw += this.recoilVelY * dt;
    this.shake = Math.max(0, this.shake - dt * 2.6);
    this.landDip = damp(this.landDip || 0, 0, 11, dt);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 1.8);
    this.iframe = Math.max(0, this.iframe - dt);
    this.riposteT = Math.max(0, this.riposteT - dt);
    if (this.faceOverride) { this.faceOverride.t -= dt; if (this.faceOverride.t <= 0) this.faceOverride = null; }

    // ---- stamina: guard up, sprint drain, refill
    if (this.staminaOn) {
      const wasGuard = this.guard;
      this.guard = !!input.guard && !this.exhausted && this.dodging <= 0 && this.grounded;
      if (this.guard && !wasGuard) this.parryReady = this.guardIdle >= 0.55;     // a raise soon after a drop is a plain block
      this.guardIdle = this.guard ? 0 : this.guardIdle + dt;
      this.guardT = this.guard ? this.guardT + dt : 0;
      this.stamDelay = Math.max(0, this.stamDelay - dt);
      if (this.stamDelay <= 0 && !this.guard) this.stam = Math.min(this.maxStam, this.stam + (this.exhausted ? 20 : 34) * dt);
      if (this.exhausted && this.stam >= 25) this.exhausted = false;
      if (this.lockTarget) {
        const lt = this.lockTarget, dx = lt.pos.x - this.pos.x, dz = lt.pos.z - this.pos.z;
        // a deliberate swipe of the look stick lets go; small drift does not
        this.lockBreak = Math.max(0, this.lockBreak - dt * 0.5) + Math.abs(input.lookX);
        if (!lt.alive || Math.hypot(dx, dz) > 34 || this.lockBreak > 0.4) { this.lockTarget = null; this.lockBreak = 0; }
        else this.camYaw = dampAngle(this.camYaw, Math.atan2(dx, dz), 6, dt);
      }
    } else { this.guard = false; this.guardT = 0; this.lockTarget = null; }
    const steady = this.hero ? 0 : 0.28 + Math.sin(performance.now() * 0.01) * 0.05;
    this.shieldMat.opacity = this.guard ? Math.max(steady, this.shieldMat.opacity - dt * 3) : Math.max(0, this.shieldMat.opacity - dt * 4);
    this.shield.visible = this.shieldMat.opacity > 0.02;
    if (this.guard) this.faceLock = Math.max(this.faceLock, 0.2);

    if (this.regen > 0) this.heal(this.regen * dt);

    // ---- form timer and aura
    if (this.modeT > 0) {
      this.modeT -= dt;
      if (this.mode === 'light') this.heal(7 * dt);
      const p = performance.now();
      this.aura.material.opacity = 0.22 + Math.sin(p * 0.006) * 0.08;
      this.aura.scale.setScalar(1 + Math.sin(p * 0.004) * 0.06);
      this.auraLight.intensity = 6 + Math.sin(p * 0.005) * 2.5;
      this.auraRing.rotation.z = p * 0.0009;
      this.auraRing.scale.setScalar(1 + Math.sin(p * 0.007) * 0.12);
      if (this.modeT <= 0) this.endMode();
    }

    // ---- movement in camera space
    const mx = input.mx, my = input.my;
    const mag = Math.min(1, Math.hypot(mx, my));
    const canSprint = input.sprint && (!this.staminaOn || (this.stam > 0 && !this.exhausted));
    this.sprinting = canSprint && mag > 0.5;
    if (this.staminaOn && this.sprinting) { this.stam = Math.max(0, this.stam - 11 * this.sprintCostMul * dt); this.stamDelay = 0.8; if (this.stam <= 0) this.exhausted = true; }
    const spd = this.speed * (canSprint ? this.sprintMul : 1) * (this.aim ? 0.55 : 1) * (this.guard ? 0.55 : 1) * this.moveMul
      * (1 - Math.min(0.4, this.inWater * 0.45));      // wading through the river is slower
    let wishX = 0, wishZ = 0;
    if (mag > 0.06) {
      const cy = this.camYaw;
      // local (mx = strafe right, my = forward)
      const fx = Math.sin(cy), fz = Math.cos(cy);
      // screen-right for a camera looking along (sin cy, cos cy); it was the mirror
      // of this, so every sideways push of the stick went the opposite way
      const rx = -Math.cos(cy), rz = Math.sin(cy);
      wishX = (fx * my + rx * mx) / Math.max(mag, 1e-3) * mag;
      wishZ = (fz * my + rz * mx) / Math.max(mag, 1e-3) * mag;
      const wl = Math.hypot(wishX, wishZ) || 1;
      wishX = wishX / wl * mag; wishZ = wishZ / wl * mag;
    }

    // ---- dodge roll: a burst of speed with brief invulnerability
    this.dodgeCd = Math.max(0, this.dodgeCd - dt);
    if (input.dodge && this.grounded && this.dodgeCd <= 0 && this.dodging <= 0 && (!this.staminaOn || (this.stam >= 14 && this.spend(14)))) {
      let dx = wishX, dz = wishZ;
      if (Math.hypot(dx, dz) < 0.2) { dx = -Math.sin(this.camYaw); dz = -Math.cos(this.camYaw); }
      const l = Math.hypot(dx, dz) || 1;
      this.dodgeVX = (dx / l) * 15;
      this.dodgeVZ = (dz / l) * 15;
      this.dodging = 0.34;
      this.dodgeCd = this.dodgeCdBase;
      this.iframe = Math.max(this.iframe, this.dodgeIframe);
      this.yaw = Math.atan2(this.dodgeVX, this.dodgeVZ);
      if (this.hero) { if (this.cancelAttack) this.cancelAttack(); this.hero.playOnce('Roll', { from: 0.04, speed: 4.2 }); }
      if (this.onDodge) this.onDodge();
    }

    if (this.dodging > 0) {
      this.dodging -= dt;
      const k = clamp(this.dodging / 0.34, 0, 1);
      this.vel.x = this.dodgeVX * k;
      this.vel.z = this.dodgeVZ * k;
    } else {
      const accel = this.grounded ? 22 : 8;
      this.vel.x = damp(this.vel.x, wishX * spd, accel, dt);
      this.vel.z = damp(this.vel.z, wishZ * spd, accel, dt);
    }

    // knockback
    this.vel.x += this.knock.x * dt;
    this.vel.z += this.knock.z * dt;
    this.knock.multiplyScalar(Math.exp(-5 * dt));

    // ---- jump + gravity
    // ---- jump: buffered input + coyote time, height cut on release
    this.coyote = this.grounded ? 0.12 : Math.max(0, this.coyote - dt);
    if (input.jump) this.jumpBuffer = 0.15;
    else this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
    if (this.jumpBuffer > 0 && this.coyote > 0 && this.vy <= 0.01) {
      this.vy = 8.4;
      this.grounded = false;
      this.coyote = 0;
      this.jumpBuffer = 0;
      if (this.onJump) this.onJump();
    }
    // holding the button carries you up; letting go cuts the arc short. Falling
    // is heavier than rising, which is what stops it feeling floaty.
    const grav = this.vy > 0 ? (input.jumpHeld ? 27 : 44) : 34;
    this.vy -= grav * dt;

    let nx = this.pos.x + this.vel.x * dt;
    let nz = this.pos.z + this.vel.z * dt;
    [nx, nz] = this.world.resolveCollisions(nx, nz, 0.42);
    this.pos.x = nx; this.pos.z = nz;
    this.pos.y += this.vy * dt;

    const gh = terrainHeight(this.pos.x, this.pos.z);
    if (this.pos.y <= gh) {
      this.pos.y = gh;
      if (this.vy < -6 && this.onLand) this.onLand(-this.vy);
      if (this.vy < -5) this.landSquash = clamp(-this.vy / 14, 0, 0.55);
      if (this.vy < -4) this.landDip = clamp(-this.vy / 20, 0, 0.42);
      this.vy = 0;
      this.grounded = true;
    } else {
      this.grounded = this.pos.y - gh < 0.12;
      if (this.grounded) this.pos.y = gh;
    }

    const wl = waterLevel(this.pos.x, this.pos.z);
    this.inWater = wl > this.pos.y ? Math.min(1.2, wl - this.pos.y) : 0;

    // ---- facing
    this.faceLock = Math.max(0, this.faceLock - dt);
    let targetYaw = this.yaw;
    if (this.aim || this.faceLock > 0) targetYaw = this.faceOverride ? this.faceOverride.yaw : this.camYaw;
    else if (mag > 0.08) targetYaw = Math.atan2(wishX, wishZ);
    this.yaw = dampAngle(this.yaw, targetYaw, this.aim ? 22 : 16, dt);

    if (this.hero) this.poseHero(dt, mag, wishX, wishZ); else this.poseOld(dt);
    this.updateCamera(dt);
  }

  /* the skinned hero: place it, decide its animation state, and let hero.js blend the clips */
  poseHero(dt, mag, wishX, wishZ) {
    const h = this.hero, horiz = Math.hypot(this.vel.x, this.vel.z), moving = horiz > 0.35;
    this.landSquash = damp(this.landSquash, 0, 9, dt);
    // footsteps keep their own beat, from the same stride clock the old hero used
    if (moving && this.grounded) {
      this.walkPhase += dt * (5.2 + horiz * 0.85);
      this.stepTimer -= dt;
      if (this.stepTimer <= 0) { this.stepTimer = clamp(0.42 - horiz * 0.02, 0.16, 0.42); if (this.onFootstep) this.onFootstep(horiz); }
    }
    // facing: the body follows the stick; when the camera owns the facing (guard, aim, lock, a blow) it opens toward where you travel
    const locked = this.aim || this.faceLock > 0 || this.guard || !!this.lockTarget;
    let rel = 0, yawOff = 0;
    if (moving) {
      rel = angleTo(this.yaw, Math.atan2(this.vel.x, this.vel.z));
      if (locked && Math.abs(rel) < 2.0) yawOff = clamp(rel * 0.5, -0.8, 0.8);
    }
    this._yawOff = damp(this._yawOff || 0, yawOff, 10, dt);
    h.root.position.copy(this.pos);
    h.root.rotation.y = this.yaw + this._yawOff;
    const turn = angleTo(this._lastYaw === undefined ? this.yaw : this._lastYaw, this.yaw) / Math.max(dt, 1e-3);
    this._lastYaw = this.yaw;
    h.update(dt, performance.now() * 0.001, {
      speed: horiz, sprint: this.sprinting, grounded: this.grounded, vy: this.vy,
      drawn: this.weaponKind !== 'none', guard: this.guard, moveRel: locked ? rel : 0, turn: clamp(turn, -6, 6) * 0.2,
    });
  }

  /* the procedural fallback hero */
  poseOld(dt) {
    this.landSquash = damp(this.landSquash, 0, 9, dt);
    const m = this.model;
    m.root.position.copy(this.pos);
    m.root.rotation.y = this.yaw;

    if (this.dodging > 0) {
      const k = 1 - clamp(this.dodging / 0.34, 0, 1);
      m.body.rotation.x = k * TAU;                        // full forward roll
      m.root.position.y += Math.sin(k * Math.PI) * 0.22;  // arc over the ground
    } else {
      if (Math.abs(m.body.rotation.x) > 3) m.body.rotation.x -= Math.sign(m.body.rotation.x) * TAU;
      m.body.rotation.x = damp(m.body.rotation.x, (this.aim ? 0.10 : 0.02) + this.landSquash * 0.45, 9, dt);
    }
    m.body.scale.y = damp(m.body.scale.y, 1 - this.landSquash * 0.26, 14, dt);
    m.body.scale.x = damp(m.body.scale.x, 1 + this.landSquash * 0.14, 14, dt);
    m.body.scale.z = m.body.scale.x;

    // lean into strafe
    const strafe = (this.vel.x * Math.cos(this.camYaw) - this.vel.z * Math.sin(this.camYaw));
    m.body.rotation.z = damp(m.body.rotation.z, clamp(-strafe * 0.035, -0.13, 0.13), 10, dt);

    // ---- limbs
    const horiz = Math.hypot(this.vel.x, this.vel.z);
    const moving = horiz > 0.35;
    if (moving) {
      this.walkPhase += dt * (5.2 + horiz * 0.85);
      this.stepTimer -= dt;
      if (this.stepTimer <= 0) {
        this.stepTimer = clamp(0.42 - horiz * 0.02, 0.16, 0.42);
        if (this.onFootstep && this.grounded) this.onFootstep(horiz);
      }
    } else {
      this.walkPhase = damp(this.walkPhase % TAU, Math.round(this.walkPhase / Math.PI) * Math.PI, 8, dt);
    }

    const sw = Math.sin(this.walkPhase);
    const swAmt = clamp(horiz / 6, 0, 1);
    const legSwing = sw * 0.85 * swAmt;
    // knees fold while a leg swings forward; ankles keep the sole close to flat
    const kneeOf = (ph) => (0.12 + Math.max(0, -Math.cos(ph)) * 1.05) * swAmt + 0.06;
    if (this.grounded) {
      m.legR.rotation.x = legSwing;
      m.legL.rotation.x = -legSwing;
      m.kneeR.rotation.x = damp(m.kneeR.rotation.x, kneeOf(this.walkPhase), 20, dt);
      m.kneeL.rotation.x = damp(m.kneeL.rotation.x, kneeOf(this.walkPhase + Math.PI), 20, dt);
    } else {
      // tucked in the air: one knee up, the other trailing
      m.legR.rotation.x = damp(m.legR.rotation.x, -0.75, 8, dt);
      m.legL.rotation.x = damp(m.legL.rotation.x, 0.2, 8, dt);
      m.kneeR.rotation.x = damp(m.kneeR.rotation.x, 1.15, 8, dt);
      m.kneeL.rotation.x = damp(m.kneeL.rotation.x, 0.55, 8, dt);
    }
    m.footR.rotation.x = -(m.legR.rotation.x + m.kneeR.rotation.x) * 0.8;
    m.footL.rotation.x = -(m.legL.rotation.x + m.kneeL.rotation.x) * 0.8;

    // arms: a two-handed hold. Low ready while running (gun forward and down, never
    // hanging like a walking stick); shouldered and following the camera's pitch
    // while aiming or firing, so the barrel points where the crosshair is.
    const ready = (this.aim || this.faceLock > 0) ? 1 : 0;
    this.readyBlend = damp(this.readyBlend || 0, ready, 12, dt);
    const r = this.readyBlend;
    const aimX = -(Math.PI / 2 + clamp(this.camPitch + this.recoilPitch, -0.7, 0.7));
    // stance by weapon: the spear two-handed and levelled, a blade up in guard with
    // the off hand free for balance, the rune staff one-handed toward the aim
    const kind = this.weaponKind || 'thrown';
    let tRx, tRz, tLx, tLz, tER, tEL, handX = null;
    if (kind === 'thrown') {
      tRx = lerp(-1.12 - legSwing * 0.12, aimX, r); tRz = lerp(0.30, 0.20, r);
      tLx = lerp(-1.02 - legSwing * 0.10, aimX + 0.22, r); tLz = lerp(-0.62, -0.72, r);
      tER = lerp(-0.45, -0.28, r); tEL = lerp(-0.55, -0.85, r);
    } else if (kind === 'none') {
      // sheathed: arms swing free and opposite to the legs
      tRx = -legSwing * 0.55 - 0.05; tRz = -0.08;
      tLx = legSwing * 0.55 - 0.05; tLz = 0.08;
      tER = -0.25 - Math.abs(legSwing) * 0.25; tEL = tER;
    } else if (kind === 'melee') {
      tRx = lerp(-0.7 - legSwing * 0.2, -1.1, r); tRz = lerp(0.14, 0.26, r);
      tLx = lerp(-0.2 + legSwing * 0.5, -0.7, r); tLz = 0.16;
      tER = lerp(-0.75, -1.05, r); tEL = lerp(-0.4, -0.6, r);
      handX = 0.3;
    } else {
      tRx = lerp(-0.9 - legSwing * 0.15, aimX + 0.1, r); tRz = 0.2;
      tLx = lerp(-0.2 + legSwing * 0.5, -0.6, r); tLz = 0.16;
      tER = lerp(-0.5, -0.2, r); tEL = -0.45;
    }
    m.armR.rotation.x = damp(m.armR.rotation.x, tRx, 16, dt);
    m.armR.rotation.z = damp(m.armR.rotation.z, tRz, 12, dt);
    m.armR.rotation.y = damp(m.armR.rotation.y, 0, 14, dt);
    m.armL.rotation.x = damp(m.armL.rotation.x, tLx, 16, dt);
    m.armL.rotation.z = damp(m.armL.rotation.z, tLz, 12, dt);
    // elbows: relaxed bend at low ready, tighter support hand when shouldered.
    // The gun hand counter-rotates, so the barrel stays on the upper arm's aim line.
    m.elbowR.rotation.x = damp(m.elbowR.rotation.x, tER, 16, dt);
    m.elbowL.rotation.x = damp(m.elbowL.rotation.x, tEL, 16, dt);
    m.hand.rotation.x = handX !== null ? handX : -m.elbowR.rotation.x;

    // a swing, throw, cast, draw or sheathe plays over the stance:
    // a held wind-up, a fast strike with a wrist snap, then recovery
    this._swingTwist = 0;
    m.hand.rotation.z = damp(m.hand.rotation.z, 0, 14, dt);
    const sa = this.swingAnim;
    if (sa && sa.t < sa.dur) {
      sa.t += dt;
      const k = clamp(sa.t / sa.dur, 0, 1);
      const w = smoothstep(0, 0.1, k) * (1 - smoothstep(0.78, 1, k));
      const e = smoothstep(0.18, 0.5, k);
      const reach = smoothstep(0, 0.5, k) * (1 - smoothstep(0.5, 1, k));
      let ax = m.armR.rotation.x, ay = 0, az = m.armR.rotation.z, er = m.elbowR.rotation.x;
      let tw = 0, hx = m.hand.rotation.x, hz = 0, dip = 0, lean = 0, lx = null;
      switch (sa.style) {
        case 'R': ax = lerp(-2.4, -0.85, e); ay = lerp(-1.35, 1.15, e); er = lerp(-1.3, -0.12, e); hz = lerp(0.7, -0.5, e); tw = lerp(-0.6, 0.55, e); dip = 0.07; lx = -0.9; break;
        case 'L': ax = lerp(-0.85, -2.2, e); ay = lerp(1.2, -1.3, e); er = lerp(-0.5, -0.15, e); hz = lerp(-0.6, 0.6, e); tw = lerp(0.55, -0.6, e); dip = 0.05; lx = -0.9; break;
        case 'O': ax = lerp(-3.1, -0.45, e); ay = 0.05; er = lerp(-1.5, -0.05, e); hx = lerp(0.6, 0.1, e); lean = 0.2 * e; dip = 0.12; lx = -1.2; break;
        case 'T': ax = lerp(-2.95, -1.15, e); ay = lerp(-0.45, 0.1, e); er = lerp(-1.6, -0.1, e); tw = lerp(-0.55, 0.45, e); lean = 0.1 * e; lx = -1.55; break;
        case 'C': ax = lerp(-1.0, -1.8, e); er = lerp(-0.9, -0.05, e); lx = -1.4; break;
        case 'D': case 'S':
          // the hand goes up over the right shoulder to the hilt and comes back
          ax = lerp(ax, -2.85, reach); ay = -0.35 * reach; az = lerp(az, 0.55, reach); er = lerp(er, -2.0, reach); tw = -0.25 * reach; break;
      }
      const W = (sa.style === 'D' || sa.style === 'S') ? 1 : w;
      m.armR.rotation.x = lerp(m.armR.rotation.x, ax, W);
      m.armR.rotation.y = lerp(m.armR.rotation.y, ay, W);
      m.armR.rotation.z = lerp(m.armR.rotation.z, az, W);
      m.elbowR.rotation.x = lerp(m.elbowR.rotation.x, er, W);
      m.hand.rotation.x = lerp(m.hand.rotation.x, hx, W);
      m.hand.rotation.z = lerp(m.hand.rotation.z, hz, W);
      if (lx !== null) m.armL.rotation.x = lerp(m.armL.rotation.x, lx, w * 0.8);   // off hand up: balance, or pointing the throw
      this._swingTwist = tw * W;
      m.body.rotation.x += lean * w;
      m.body.position.y -= dip * w;
    }

    // spine counter-twists with the stride (not while aiming), head follows the aim,
    // breathing, and the headwrap tails stream back with speed
    const now = performance.now();
    m.torso.rotation.y = damp(m.torso.rotation.y, sw * 0.14 * swAmt * (1 - r) + this._swingTwist, 18, dt);
    m.torso.scale.y = 1 + Math.sin(now * 0.0018) * 0.012;
    m.head.rotation.x = damp(m.head.rotation.x, -clamp(this.camPitch, -0.5, 0.5) * 0.55 * r + Math.sin(this.walkPhase * 2) * 0.03 * swAmt, 10, dt);
    m.head.rotation.y = damp(m.head.rotation.y, -m.torso.rotation.y * 0.8, 10, dt);
    m.tails.rotation.x = damp(m.tails.rotation.x, 0.25 + horiz * 0.09 + Math.sin(now * 0.009) * 0.08 * (0.3 + swAmt), 6, dt);
    m.tails.rotation.z = Math.sin(now * 0.006) * 0.12;

    // cloak: hangs and sways at rest, streams back with speed, lifts in the air
    const ck = m.cloak;
    if (ck) {
      const pa = ck.geometry.attributes.position, base = ck.userData.base;
      const flow = clamp(horiz / 8, 0, 1), lift = flow * 0.5 + (this.grounded ? 0 : 0.3), ts = now * 0.001;
      for (let i = 0; i < pa.count; i++) {
        const x = base[i * 3], y = base[i * 3 + 1], v = -y / 1.05;
        const sway = Math.sin(ts * 2.2 + v * 2.5 + x * 3) * 0.04 * (0.4 + flow);
        pa.setXYZ(i, x * (1 + v * 0.25), y * (1 - lift * 0.35 * v), base[i * 3 + 2] - (v * v * (0.12 + lift) + sway));
      }
      pa.needsUpdate = true;
      ck.geometry.computeVertexNormals();
    }

    // idle bob / breathing
    const bob = Math.sin(this.walkPhase * 2) * 0.045 * swAmt + Math.sin(performance.now() * 0.0018) * 0.012;
    m.body.position.y = damp(m.body.position.y, bob - 0.085, 16, dt);  // 0.085 = sole height, so feet touch

  }

  updateCamera(dt) {
    const aiming = this.aim;
    const targetDist = aiming ? 2.35 : 4.35;
    const targetHeight = (aiming ? 1.66 : 1.78) - (this.landDip || 0);
    const shoulder = aiming ? 0.60 : 0.86;

    if (this.camDist === undefined) this.camDist = targetDist;
    this.camDist = damp(this.camDist, targetDist, 9, dt);
    this.camShoulder = damp(this.camShoulder || shoulder, shoulder, 9, dt);
    this.camHeight = damp(this.camHeight || targetHeight, targetHeight, 9, dt);

    const cy = this.camYaw + this.recoilYaw;
    const cp = this.camPitch + this.recoilPitch;

    // the camera follows with a little weight: quick sideways, softer up and down
    if (!this._follow) this._follow = this.pos.clone();
    const f = this._follow;
    f.x = damp(f.x, this.pos.x, 18, dt); f.z = damp(f.z, this.pos.z, 18, dt); f.y = damp(f.y, this.pos.y, 9, dt);
    if (f.distanceToSquared(this.pos) > 16) f.copy(this.pos);      // teleports (spawn, respawn) snap
    const pivot = this._camTarget.set(
      f.x, f.y + this.camHeight, f.z
    );

    // camera direction
    const dirX = Math.sin(cy) * Math.cos(cp);
    const dirY = Math.sin(cp);
    const dirZ = Math.cos(cy) * Math.cos(cp);

    // right vector for the shoulder offset: camera over the right shoulder
    const rx = -Math.cos(cy), rz = Math.sin(cy);

    let px = pivot.x + rx * this.camShoulder - dirX * this.camDist;
    let py = pivot.y - dirY * this.camDist + 0.18;
    let pz = pivot.z + rz * this.camShoulder - dirZ * this.camDist;

    // keep camera above ground
    const gh = terrainHeight(px, pz) + 0.55;
    if (py < gh) py = gh;

    // shake
    const sh = this.shake;
    if (sh > 0.001) {
      const t = performance.now() * 0.001;
      px += Math.sin(t * 47.3) * sh * 0.11;
      py += Math.sin(t * 61.7) * sh * 0.09;
      pz += Math.cos(t * 53.1) * sh * 0.11;
    }

    this.camPos.set(px, py, pz);
    // look straight down the pivot's forward axis so the hero sits left of centre
    // and the gun has clear screen space
    this.camLook.set(
      pivot.x + dirX * 30,
      pivot.y + dirY * 30 + (aiming ? 0.02 : 0.10),
      pivot.z + dirZ * 30
    );
  }

  applyToCamera(camera) {
    camera.position.copy(this.camPos);
    camera.lookAt(this.camLook);
    // roll with strafe for weight
    const strafe = (this.vel.x * Math.cos(this.camYaw) - this.vel.z * Math.sin(this.camYaw));
    camera.rotation.z += clamp(-strafe * 0.006, -0.03, 0.03);
  }
}
