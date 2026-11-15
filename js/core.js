import * as THREE from 'three';

export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
/** frame-rate independent exponential approach */
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const deg = (d) => d * Math.PI / 180;

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const rng = mulberry32(1337);
export const rnd = (a = 0, b = 1) => a + (b - a) * rng();
export const rndInt = (a, b) => Math.floor(rnd(a, b + 1));
export const pick = (arr) => arr[Math.floor(rng() * arr.length)];

/* ---------------- value noise ---------------- */
function hash2(x, y) {
  let h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return h - Math.floor(h);
}
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}
export function fbm(x, y, oct = 4) {
  let v = 0, amp = 0.5, f = 1;
  for (let i = 0; i < oct; i++) {
    v += vnoise(x * f, y * f) * amp;
    f *= 2.03; amp *= 0.5;
  }
  return v;
}

/* ---------------- the shared terrain field ---------------- */
export const ARENA_R = 96;       // playable radius
export const RIM_R = 104;

/* One terrain grid, shared by the mesh and by everything that walks on it.
   Sampling the analytic function directly made entities float above the drawn
   triangles on slopes, so physics now interpolates the exact same grid. */
export const GRID_SEG = 140;
export const GRID_EXT = 118;
const GRID_STEP = (GRID_EXT * 2) / GRID_SEG;

/** Wind-blown dunes. These are part of the height field, not props, so the mesh
 *  and the collision agree and you never stand inside one. */
const DUNES = (() => {
  const r = mulberry32(90210);
  const out = [];
  for (let i = 0; i < 34; i++) {
    const a = r() * TAU, d = 17 + r() * 45;
    const rad = 4.5 + r() * 8.5;
    if (d - rad < 13) continue;        // keep the monument plinth clear
    out.push({
      x: Math.cos(a) * d, z: Math.sin(a) * d,
      rad,
      h: 0.55 + r() * 1.65,
      ax: 0.72 + r() * 0.55,   // squashed on one axis: a ridge, not a bubble
      rot: r() * TAU
    });
  }
  return out;
})();

function duneHeight(x, z) {
  let h = 0;
  for (let i = 0; i < DUNES.length; i++) {
    const d = DUNES[i];
    const dx = x - d.x, dz = z - d.z;
    const c = Math.cos(d.rot), s = Math.sin(d.rot);
    const lx = (dx * c - dz * s) * d.ax;
    const lz = dx * s + dz * c;
    const q = Math.sqrt(lx * lx + lz * lz) / d.rad;
    if (q < 1) { const t = 1 - q * q; h += d.h * t * t; }
  }
  return h;
}

/** Neutral limestone: hue still comes from vertex colour, this only adds the
 *  surface. Kept close to white so multiplying it never muddies the palette. */
export function stoneTexture() {
  const S = 512;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(S, S);
  const r = mulberry32(7788);

  const grid = (per) => {
    const g = new Float32Array(per * per);
    for (let i = 0; i < g.length; i++) g[i] = r();
    return g;
  };
  const sample = (g, per, x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const fx = x - xi, fy = y - yi;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const at = (a, b) => g[((b % per) + per) % per * per + ((a % per) + per) % per];
    return lerp(lerp(at(xi, yi), at(xi + 1, yi), u), lerp(at(xi, yi + 1), at(xi + 1, yi + 1), u), v);
  };
  const g1 = grid(12), g2 = grid(48);

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S, v = y / S;
      const n = sample(g1, 12, u * 12, v * 12) * 0.55 + sample(g2, 48, u * 48, v * 48) * 0.45;
      // faint bedding planes, like cut limestone
      const strata = Math.sin(v * Math.PI * 9 + n * 2.2) * 0.045;
      const grain = (r() - 0.5) * 0.05;
      const l = 0.9 + (n - 0.5) * 0.22 + strata + grain;
      const c = clamp(Math.round(l * 255), 0, 255);
      const i = (y * S + x) * 4;
      img.data[i] = c; img.data[i + 1] = c; img.data[i + 2] = c; img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  // pitting and chips
  for (let i = 0; i < 1400; i++) {
    const x = r() * S, y = r() * S, rad = 1.4 + r() * 5.0;
    ctx.beginPath();
    ctx.ellipse(x, y, rad, rad * (0.6 + r() * 0.6), r() * Math.PI, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(84,74,64,${0.28 + r() * 0.4})`;
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x + rad * 0.3, y - rad * 0.3, rad * 0.7, rad * 0.5, 0, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,250,240,${0.14 + r() * 0.2})`;
    ctx.fill();
  }
  // hairline cracks
  for (let i = 0; i < 110; i++) {
    let x = r() * S, y = r() * S;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let k = 0; k < 5; k++) {
      x += (r() - 0.5) * 40; y += (r() - 0.3) * 30;
      ctx.lineTo(x, y);
    }
    ctx.strokeStyle = `rgba(70,60,52,${0.35 + r() * 0.3})`;
    ctx.lineWidth = 1.8;
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** Hanging cloth for banners: a woven panel with a sun disc and wear. */
export function clothTexture() {
  const W = 128, H = 256;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  const r = mulberry32(3311);
  ctx.fillStyle = '#8d3f2e'; ctx.fillRect(0, 0, W, H);
  // weave
  for (let y = 0; y < H; y += 2) {
    ctx.fillStyle = `rgba(0,0,0,${0.04 + r() * 0.05})`;
    ctx.fillRect(0, y, W, 1);
  }
  // borders
  ctx.fillStyle = '#c9a24a'; ctx.fillRect(0, 0, W, 10); ctx.fillRect(0, H - 12, W, 12);
  ctx.fillRect(0, 0, 8, H); ctx.fillRect(W - 8, 0, 8, H);
  // sun disc
  ctx.beginPath(); ctx.arc(W / 2, H * 0.34, 34, 0, Math.PI * 2);
  ctx.fillStyle = '#d8b05a'; ctx.fill();
  ctx.beginPath(); ctx.arc(W / 2, H * 0.34, 24, 0, Math.PI * 2);
  ctx.fillStyle = '#8d3f2e'; ctx.fill();
  // wear and holes
  for (let i = 0; i < 90; i++) {
    const x = r() * W, y = r() * H;
    ctx.fillStyle = `rgba(0,0,0,${0.05 + r() * 0.12})`;
    ctx.fillRect(x, y, 2 + r() * 5, 1 + r() * 3);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/* The pass: the rim is broken on one side, past the lake, and outside it the land
   falls away to a vast lowland far below. LOWLAND_Y is that floor. */
export const GAP_A = -0.55;          // direction of the pass (radians, atan2(z, x))
export const LOWLAND_Y = -42;
export function gapAmount(x, z) {
  let d = Math.atan2(z, x) - GAP_A;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  return Math.exp(-(d / 0.42) * (d / 0.42));
}

/** The raw noise field — only ever evaluated at grid corners. */
export function terrainRaw(x, z) {
  const r = Math.hypot(x, z);
  let h = (fbm(x * 0.011, z * 0.011, 4) - 0.5) * 13.0;
  h += (fbm(x * 0.048, z * 0.048, 3) - 0.5) * 2.2;
  h += (fbm(x * 0.19, z * 0.19, 2) - 0.5) * 0.55;   // grit
  const flat = smoothstep(6, 46, r);
  h *= 0.16 + 0.84 * flat;
  const g = gapAmount(x, z);
  const rim = smoothstep(66, RIM_R, r);
  h += rim * (26 + (fbm(x * 0.028, z * 0.028, 3) - 0.5) * 22) * (1 - 0.93 * g);
  h += duneHeight(x, z);
  // beyond the brink of the pass the ground drops to the lowland
  // (and everywhere, past the outer foot of the rim, so the grid's edge never shows as a shelf;
  //  it starts beyond the cascade's source at r 112 so the river's level is untouched)
  h = lerp(h, LOWLAND_Y + 6, Math.max(g * smoothstep(97, 117, r), smoothstep(113, 130, r)));
  return h;
}

/* ---------------- the river ----------------
   It drops off the valley rim as a cascade, winds round the shrine and ends in a
   lake. It is carved into the height field itself, so what you wade through is
   what you see. The water surface level falls monotonically along the course. */
export const RIVER_W = 3.4;           // half-width of the channel
export const LAKE = { x: 50, z: -26, r: 11 };
const RIVER_CTRL = [
  [-96, 58], [-80, 49], [-63, 41], [-46, 35], [-29, 37], [-12, 39], [5, 35],
  [20, 28], [33, 16], [42, 1], [47, -12], [LAKE.x, LAKE.z],
];
export const RIVER = (() => {
  // Catmull-Rom through the control points, about one sample per metre
  const pts = [];
  const P = RIVER_CTRL;
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
    const segLen = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const n = Math.max(2, Math.ceil(segLen));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      pts.push({ x: f(p0[0], p1[0], p2[0], p3[0]), z: f(p0[1], p1[1], p2[1], p3[1]) });
    }
  }
  pts.push({ x: P[P.length - 1][0], z: P[P.length - 1][1] });
  let len = 0;
  for (let i = 0; i < pts.length; i++) {
    if (i) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
    pts[i].s = len;
  }
  // water level: the running minimum of the ground along the course, eased, so
  // water never has to climb; then a little below it
  let m = Infinity;
  for (const q of pts) { m = Math.min(m, terrainRaw(q.x, q.z)); q.wy = m; }
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 1; i < pts.length - 1; i++) pts[i].wy = Math.min(pts[i - 1].wy, (pts[i - 1].wy + pts[i].wy + pts[i + 1].wy) / 3);
  }
  for (const q of pts) q.wy -= 0.35;
  return pts;
})();
export const LAKE_Y = RIVER[RIVER.length - 1].wy;

/** nearest point on the river: {d, wy, i}; d is horizontal distance to the centre line */
export function riverNearest(x, z) {
  let best = Infinity, bi = 0;
  for (let i = 0; i < RIVER.length; i++) {
    const q = RIVER[i];
    const dx = x - q.x, dz = z - q.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < best) { best = d2; bi = i; }
  }
  return { d: Math.sqrt(best), wy: RIVER[bi].wy, i: bi };
}

let LAST_WD = Infinity;
/** carve channel, banks and lake bed into a raw height */
function carve(x, z, h) {
  const L = Math.hypot(x - LAKE.x, z - LAKE.z);
  const rn = riverNearest(x, z);
  // pick whichever water body is closer, measured against its own edge
  const useLake = L - LAKE.r < rn.d - RIVER_W;
  const d = useLake ? L : rn.d, W = useLake ? LAKE.r : RIVER_W, wy = useLake ? LAKE_Y : rn.wy;
  LAST_WD = d - W;
  const depth = useLake ? 1.7 : 0.9;
  if (d > W + 14) return h;
  const bank = Math.max(h, wy + 0.4);
  if (d < W) return wy - 0.12 - depth * (1 - (d / W) * (d / W));
  if (d < W + 5) return lerp(wy - 0.12, bank, smoothstep(W, W + 5, d));
  return lerp(bank, h, smoothstep(W + 5, W + 14, d));
}

/** distance from a point to the nearest water edge (negative inside the water), from the cached grid */
export function waterDist(x, z) {
  heightTable();
  const n = GRID_SEG + 1;
  const i = clamp(Math.round((x + GRID_EXT) / GRID_STEP), 0, GRID_SEG);
  const j = clamp(Math.round((z + GRID_EXT) / GRID_STEP), 0, GRID_SEG);
  return WD[j * n + i];
}

/** water surface height at a point, or -Infinity on dry land */
export function waterLevel(x, z) {
  if (Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r + 1.2) return LAKE_Y;
  const rn = riverNearest(x, z);
  return rn.d < RIVER_W + 1.2 ? rn.wy : -Infinity;
}

let HEIGHTS = null, WD = null;
function heightTable() {
  if (HEIGHTS) return HEIGHTS;
  const n = GRID_SEG + 1;
  HEIGHTS = new Float32Array(n * n);
  WD = new Float32Array(n * n);
  for (let j = 0; j < n; j++) {
    const z = -GRID_EXT + j * GRID_STEP;
    for (let i = 0; i < n; i++) {
      const x = -GRID_EXT + i * GRID_STEP;
      HEIGHTS[j * n + i] = carve(x, z, terrainRaw(x, z));
      WD[j * n + i] = LAST_WD;
    }
  }
  return HEIGHTS;
}
/** height of grid corner (i,j) — the mesh uses these exact numbers */
export function gridHeight(i, j) {
  const t = heightTable(), n = GRID_SEG + 1;
  const ci = i < 0 ? 0 : i > GRID_SEG ? GRID_SEG : i;
  const cj = j < 0 ? 0 : j > GRID_SEG ? GRID_SEG : j;
  return t[cj * n + ci];
}

/** Height of the wasteland floor, exact to the rendered triangles. */
export function terrainHeight(x, z) {
  const gx = (x + GRID_EXT) / GRID_STEP;
  const gz = (z + GRID_EXT) / GRID_STEP;
  let i = Math.floor(gx), j = Math.floor(gz);
  i = i < 0 ? 0 : i > GRID_SEG - 1 ? GRID_SEG - 1 : i;
  j = j < 0 ? 0 : j > GRID_SEG - 1 ? GRID_SEG - 1 : j;
  const u = clamp(gx - i, 0, 1), v = clamp(gz - j, 0, 1);
  const n = GRID_SEG + 1, t = heightTable();
  const hA = t[j * n + i], hB = t[j * n + i + 1];
  const hD = t[(j + 1) * n + i], hC = t[(j + 1) * n + i + 1];
  // the mesh splits each cell along the a-c diagonal
  if (u >= v) return hA * (1 - u) + hB * (u - v) + hC * v;
  return hA * (1 - v) + hD * (v - u) + hC * u;
}

export function terrainNormal(x, z, out = new THREE.Vector3()) {
  const e = 0.9;
  const hL = terrainHeight(x - e, z), hR = terrainHeight(x + e, z);
  const hD = terrainHeight(x, z - e), hU = terrainHeight(x, z + e);
  return out.set(hL - hR, 2 * e, hD - hU).normalize();
}

/* ---------------- geometry builder (flat-shaded, vertex coloured) ---------------- */
const _m = new THREE.Matrix4();
const _c = new THREE.Color();

export class Builder {
  /** smooth: keep each primitive's own normals (rounded shapes stay round).
   *  Default is flat: normals are recomputed per face, the chiselled look. */
  constructor(opts = {}) { this.pos = []; this.col = []; this.smooth = !!opts.smooth; this.nor = []; }
  /** add geometry with optional transform + colour (hex or THREE.Color) */
  add(geo, color = 0xffffff, opt = {}) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const m = opt.matrix || _m.identity();
    if (!opt.matrix && (opt.pos || opt.rot || opt.scale)) {
      const q = new THREE.Quaternion();
      if (opt.rot) q.setFromEuler(new THREE.Euler(opt.rot[0] || 0, opt.rot[1] || 0, opt.rot[2] || 0));
      const s = opt.scale
        ? (Array.isArray(opt.scale) ? new THREE.Vector3(...opt.scale) : new THREE.Vector3(opt.scale, opt.scale, opt.scale))
        : new THREE.Vector3(1, 1, 1);
      m.compose(new THREE.Vector3(...(opt.pos || [0, 0, 0])), q, s);
    }
    const p = g.attributes.position.array;
    const n = p.length / 3;
    if (this.smooth) {
      const na = g.attributes.normal.array;
      const nm = new THREE.Matrix3().getNormalMatrix(m);
      const v = new THREE.Vector3();
      for (let i = 0; i < n; i++) {
        v.set(na[i * 3], na[i * 3 + 1], na[i * 3 + 2]).applyMatrix3(nm).normalize();
        this.nor.push(v.x, v.y, v.z);
      }
    }
    _c.set(color);
    const jitter = opt.jitter || 0;
    for (let i = 0; i < n; i++) {
      const x = p[i * 3], y = p[i * 3 + 1], z = p[i * 3 + 2];
      const w = new THREE.Vector3(x, y, z).applyMatrix4(m);
      this.pos.push(w.x, w.y, w.z);
      const j = jitter ? (rng() - 0.5) * jitter : 0;
      this.col.push(clamp(_c.r + j, 0, 1), clamp(_c.g + j, 0, 1), clamp(_c.b + j, 0, 1));
    }
    if (g !== geo) g.dispose();
    return this;
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    if (this.smooth) g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    else g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }

  /** Box-projected UVs so a stone map lands on every face without stretching.
   *  Each triangle is projected along whichever axis its normal points at. */
  buildUV(scale = 0.35) {
    const g = this.build();
    const p = g.attributes.position.array;
    const n = p.length / 3;
    const uv = new Float32Array(n * 2);
    for (let t = 0; t < n; t += 3) {
      const i0 = t * 3, i1 = (t + 1) * 3, i2 = (t + 2) * 3;
      const ax = p[i1] - p[i0], ay = p[i1 + 1] - p[i0 + 1], az = p[i1 + 2] - p[i0 + 2];
      const bx = p[i2] - p[i0], by = p[i2 + 1] - p[i0 + 1], bz = p[i2 + 2] - p[i0 + 2];
      let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
      nx = Math.abs(nx); ny = Math.abs(ny); nz = Math.abs(nz);
      let axis = 1;
      if (nx > ny && nx > nz) axis = 0; else if (nz > ny && nz > nx) axis = 2;
      for (let q = 0; q < 3; q++) {
        const o = (t + q) * 3, uvo = (t + q) * 2;
        const x = p[o], y = p[o + 1], z = p[o + 2];
        if (axis === 1) { uv[uvo] = x * scale; uv[uvo + 1] = z * scale; }
        else if (axis === 0) { uv[uvo] = z * scale; uv[uvo + 1] = y * scale; }
        else { uv[uvo] = x * scale; uv[uvo + 1] = y * scale; }
      }
    }
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    return g;
  }
}

/* ---------------- canvas textures ---------------- */
export function canvasTex(w, h, draw, opts = {}) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d');
  draw(ctx, w, h);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  if (opts.repeat) { tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(opts.repeat[0], opts.repeat[1]); }
  tex.anisotropy = 2;
  return tex;
}

export function radialSprite(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)', size = 64) {
  return canvasTex(size, size, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, inner);
    g.addColorStop(0.45, inner.replace(/[\d.]+\)$/, '0.55)'));
    g.addColorStop(1, outer);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
}

export function grassTexture() {
  return canvasTex(64, 64, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    const r = mulberry32(7);
    for (let i = 0; i < 26; i++) {
      const x = 6 + r() * (w - 12);
      const hh = 18 + r() * 40;
      const bend = (r() - 0.5) * 16;
      const g = ctx.createLinearGradient(0, h, 0, h - hh);
      const l = 150 + Math.floor(r() * 70);
      // neutral, light at the tip: hue comes from each tuft's instance colour
      g.addColorStop(0, `rgba(${Math.floor(l * 0.62)},${Math.floor(l * 0.7)},${Math.floor(l * 0.55)},1)`);
      g.addColorStop(1, `rgba(${Math.min(255, l + 50)},${Math.min(255, l + 60)},${l},1)`);
      ctx.strokeStyle = g;
      ctx.lineWidth = 1 + r() * 1.6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x, h);
      ctx.quadraticCurveTo(x + bend * 0.4, h - hh * 0.55, x + bend, h - hh);
      ctx.stroke();
    }
  });
}

export function smokeTexture() {
  return canvasTex(64, 64, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,.85)');
    g.addColorStop(0.5, 'rgba(255,255,255,.28)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  });
}

export function flashTexture() {
  return canvasTex(128, 128, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, w * 0.5);
    g.addColorStop(0, 'rgba(255,255,240,1)');
    g.addColorStop(0.18, 'rgba(255,215,140,.95)');
    g.addColorStop(0.45, 'rgba(255,140,40,.45)');
    g.addColorStop(1, 'rgba(255,90,20,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, w * 0.5, 0, TAU); ctx.fill();
    // star spikes
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 5; i++) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate((i / 5) * Math.PI + 0.3);
      const lg = ctx.createLinearGradient(0, 0, w * 0.5, 0);
      lg.addColorStop(0, 'rgba(255,240,200,.9)');
      lg.addColorStop(1, 'rgba(255,140,40,0)');
      ctx.fillStyle = lg;
      ctx.beginPath(); ctx.moveTo(0, -3); ctx.lineTo(w * 0.5, 0); ctx.lineTo(0, 3); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  });
}

export function groundTexture() {
  // Detail only. Anything large-scale and repeating reads as a checkerboard once
  // the tile is mirrored dozens of times, so the macro variation lives in the
  // terrain's vertex colours instead — that can never tile.
  const S = 512;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(S, S);
  const r = mulberry32(4242);

  const grid = (per) => {
    const g = new Float32Array(per * per);
    for (let i = 0; i < g.length; i++) g[i] = r();
    return g;
  };
  const sample = (g, per, x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const fx = x - xi, fy = y - yi;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const at = (a, b) => g[((b % per) + per) % per * per + ((a % per) + per) % per];
    return lerp(lerp(at(xi, yi), at(xi + 1, yi), u), lerp(at(xi, yi + 1), at(xi + 1, yi + 1), u), v);
  };
  const g1 = grid(16), g2 = grid(64);

  // base: fine grain over a near-neutral bed, very low amplitude
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S, v = y / S;
      const n = sample(g1, 16, u * 16, v * 16) * 0.6
        + sample(g2, 64, u * 64, v * 64) * 0.4;
      const grain = (r() - 0.5) * 0.055;
      const l = 0.95 + (n - 0.5) * 0.045 + grain;
      const c = clamp(Math.round(l * 255), 0, 255);
      const i = (y * S + x) * 4;
      img.data[i] = c;
      img.data[i + 1] = c * 0.992;
      img.data[i + 2] = c * 0.972;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  // pebbles: the size cue. Sparse, varied, never aligned to a grid.
  const pebble = (x, y, rad, dark) => {
    ctx.beginPath();
    ctx.ellipse(x, y, rad, rad * (0.62 + r() * 0.5), r() * Math.PI, 0, Math.PI * 2);
    ctx.fillStyle = dark
      ? `rgba(70,56,44,${0.35 + r() * 0.4})`
      : `rgba(255,248,232,${0.3 + r() * 0.45})`;
    ctx.fill();
    if (dark) {  // a lit edge sells the relief
      ctx.beginPath();
      ctx.ellipse(x + rad * 0.25, y - rad * 0.25, rad * 0.62, rad * 0.42, 0, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,244,220,${0.16 + r() * 0.2})`;
      ctx.fill();
    }
  };
  for (let i = 0; i < 3200; i++) pebble(r() * S, r() * S, 2.0 + r() * 2.6, r() > 0.34);
  for (let i = 0; i < 240; i++) pebble(r() * S, r() * S, 5.5 + r() * 6.5, r() > 0.45);

  // cracks and wind ripples, short and broken
  ctx.lineWidth = 1;
  for (let i = 0; i < 45; i++) {
    const x = r() * S, y = r() * S, len = 40 + r() * 130, a = r() * Math.PI;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    ctx.strokeStyle = `rgba(58,44,34,${0.09 + r() * 0.1})`;
    ctx.stroke();
  }
  for (let i = 0; i < 40; i++) {
    const y = r() * S, x = r() * S, len = 90 + r() * 190;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(x + len * 0.35, y - 6, x + len * 0.7, y + 6, x + len, y);
    ctx.strokeStyle = `rgba(255,246,228,${0.08 + r() * 0.1})`;
    ctx.lineWidth = 3.2;
    ctx.stroke();
    ctx.lineWidth = 1;
  }

  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/* ---------------- ray / sphere ---------------- */
/** returns distance along dir to sphere hit, or -1 */
export function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, radius, maxDist = Infinity) {
  const lx = cx - ox, ly = cy - oy, lz = cz - oz;
  const tca = lx * dx + ly * dy + lz * dz;
  if (tca < 0) return -1;
  const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
  const r2 = radius * radius;
  if (d2 > r2) return -1;
  const thc = Math.sqrt(r2 - d2);
  let t = tca - thc;
  if (t < 0) t = tca + thc;
  if (t < 0 || t > maxDist) return -1;
  return t;
}

/* ---------------- misc helpers ---------------- */
export function angleTo(a, b) { // shortest signed delta
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}
export function dampAngle(a, b, lambda, dt) {
  return a + angleTo(a, b) * (1 - Math.exp(-lambda * dt));
}
export const vec3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

export function disposeTree(obj) {
  obj.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach(m => { if (m.map) m.map.dispose(); m.dispose(); });
    }
  });
}

/* ---------------- character surfacing ---------------- */
/** Rim light: a thin bright edge where a surface turns away from the camera, so
 *  characters separate from the busy ground. Works on Lambert materials. */
export function addRim(mat, color, strength = 0.4, power = 3.0) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.rimColor = { value: new THREE.Color(color) };
    sh.uniforms.rimStrength = { value: strength };
    sh.fragmentShader = 'uniform vec3 rimColor;\nuniform float rimStrength;\n' + sh.fragmentShader.replace(
      '#include <opaque_fragment>',
      `outgoingLight += rimColor * rimStrength * pow(1.0 - saturate(dot(geometryNormal, geometryViewDir)), ${power.toFixed(1)});
#include <opaque_fragment>`);
  };
  mat.customProgramCacheKey = () => 'rim' + power.toFixed(1);
  return mat;
}

/** Woven cloth with seams and grime, kept near white: hue comes from vertex colour. */
export function fabricTexture() {
  const S = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(S, S);
  const r = mulberry32(5150);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      // twill: diagonal ribs plus a fine cross thread
      const twill = Math.sin((x + y) * 0.9) * 0.035 + Math.sin(x * 2.6) * Math.sin(y * 2.6) * 0.02;
      const blot = Math.sin(x * 0.045 + Math.sin(y * 0.06) * 2) * Math.sin(y * 0.038) * 0.05;
      const l = 0.9 + twill + blot + (r() - 0.5) * 0.05;
      const c = clamp(Math.round(l * 255), 0, 255);
      const i = (y * S + x) * 4;
      img.data[i] = c; img.data[i + 1] = c * 0.99; img.data[i + 2] = c * 0.97; img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  // (no drawn seams: box-projected UVs scatter them across a rounded body as dots)
  // scuffs and dust
  for (let i = 0; i < 160; i++) {
    ctx.fillStyle = r() > 0.5 ? `rgba(60,44,30,${0.05 + r() * 0.1})` : `rgba(255,240,215,${0.05 + r() * 0.08})`;
    ctx.beginPath(); ctx.ellipse(r() * S, r() * S, 1 + r() * 6, 1 + r() * 3, r() * 3, 0, Math.PI * 2); ctx.fill();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Pine needles: short dark strokes on a light ground, near white on average so
 *  the vertex green carries the hue. Box-projected onto the cone tiers. */
export function needleTexture() {
  const S = 128;
  const cv = document.createElement('canvas'); cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = 'rgb(220,228,214)'; ctx.fillRect(0, 0, S, S);
  const r = mulberry32(6060);
  for (let i = 0; i < 900; i++) {
    const x = r() * S, y = r() * S, l = 4 + r() * 7, a = Math.PI / 2 + (r() - 0.5) * 1.1;
    const dark = r() < 0.7;
    ctx.strokeStyle = dark ? `rgba(40,60,40,${0.35 + r() * 0.35})` : `rgba(255,255,240,${0.25 + r() * 0.3})`;
    ctx.lineWidth = 0.8 + r() * 0.8;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  return tex;
}

/** Meadow ground: fine blades, clover and soil specks over soft noise. Detail
 *  only (greyscale, light): the terrain's vertex colours carry the hue. */
export function meadowTexture() {
  const S = 512;
  const cv = document.createElement('canvas'); cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  const r = mulberry32(8181);
  const img = ctx.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const n = vnoise(x / 23, y / 23) * 0.5 + vnoise(x / 7, y / 7) * 0.3 + r() * 0.2;
    const c = clamp(Math.round((0.8 + (n - 0.5) * 0.22) * 255), 0, 255);
    const i = (y * S + x) * 4;
    img.data[i] = c; img.data[i + 1] = c; img.data[i + 2] = c * 0.96; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  // blades: short upright strokes, light tips and dark roots, wrapped at the edges
  for (let i = 0; i < 5200; i++) {
    const x = r() * S, y = r() * S, l = 3 + r() * 8, a = -Math.PI / 2 + (r() - 0.5) * 0.9;
    ctx.strokeStyle = r() < 0.55 ? `rgba(255,255,245,${0.18 + r() * 0.25})` : `rgba(40,50,30,${0.15 + r() * 0.2})`;
    ctx.lineWidth = 0.7 + r() * 0.9;
    for (const ox of [0, x > S - 10 ? -S : 0]) {
      ctx.beginPath(); ctx.moveTo(x + ox, y); ctx.lineTo(x + ox + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke();
    }
  }
  // clover and soil
  for (let i = 0; i < 260; i++) {
    const x = r() * S, y = r() * S;
    ctx.fillStyle = r() < 0.6 ? `rgba(60,70,40,${0.18 + r() * 0.15})` : `rgba(90,70,50,${0.15 + r() * 0.15})`;
    for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(x + Math.cos(k * 2.1) * 2, y + Math.sin(k * 2.1) * 2, 1.6 + r(), 0, Math.PI * 2); ctx.fill(); }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  return tex;
}

/** Worn leather: fine grain, creases and scuffs, near white so vertex colour carries the hue. */
export function leatherTexture() {
  const S = 256;
  const cv = document.createElement('canvas'); cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(S, S);
  const r = mulberry32(2727);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const n = vnoise(x / 3.1, y / 3.1) * 0.5 + vnoise(x / 11, y / 11) * 0.35 + r() * 0.15;
    const c = clamp(Math.round((0.84 + (n - 0.5) * 0.2) * 255), 0, 255);
    const i = (y * S + x) * 4;
    img.data[i] = c; img.data[i + 1] = c * 0.97; img.data[i + 2] = c * 0.93; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  for (let i = 0; i < 70; i++) {                         // creases
    let x = r() * S, y = r() * S;
    ctx.strokeStyle = `rgba(40,28,18,${0.18 + r() * 0.2})`; ctx.lineWidth = 0.8 + r();
    ctx.beginPath(); ctx.moveTo(x, y);
    for (let k = 0; k < 4; k++) { x += (r() - 0.5) * 26; y += (r() - 0.5) * 8; ctx.lineTo(x, y); }
    ctx.stroke();
  }
  for (let i = 0; i < 90; i++) {                         // scuffs
    ctx.fillStyle = `rgba(255,245,230,${0.06 + r() * 0.1})`;
    ctx.beginPath(); ctx.ellipse(r() * S, r() * S, 2 + r() * 7, 1 + r() * 3, r() * 3, 0, Math.PI * 2); ctx.fill();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  return tex;
}
