import * as THREE from 'three';

/* ================================================================ the vale's day
   One full day is DAY_LEN seconds of Wander. tod runs 0..1: 0 dawn, 0.25 noon, 0.5 dusk,
   0.75 midnight. The palette is a ring of keyframes (sky, fog, light colours and strengths,
   exposure, stars) interpolated smoothly; the sun's path is a simple arc, and the moon
   rides opposite it. The look at tod 0.07 is the valley as it has always been drawn. */

export const DAY_LEN = 540;
export const START_TOD = 0.07;

const hex = (h) => new THREE.Color(h);
const raw = [
  // t     sky: zen / mid / hor / gnd           fog        sun light (colour, strength)   hemisphere (sky, ground, strength)    ambient (colour, strength)  bounce        fill          exposure  stars
  { t: 0.00, zen: 0x3b4f8a, mid: 0xc9a9a0, hor: 0xf2b98a, gnd: 0x4a5a44, fog: 0xc4a898, sun: 0xffb070, sunI: 2.2, hs: 0xb8c4e0, hg: 0x4a4a3a, hI: 0.95, amb: 0x4a5070, aI: 0.30, bn: 0x8aa0d8, bI: 0.38, fl: 0xc0b8d8, fI: 0.52, ex: 1.00, st: 0.10 },
  { t: 0.07, zen: 0x3a66a6, mid: 0xa6c3d8, hor: 0xe9e2d2, gnd: 0x56704a, fog: 0xc9d5d6, sun: 0xffe2b2, sunI: 3.4, hs: 0xd4e6ff, hg: 0x5a6a40, hI: 1.25, amb: 0x56657e, aI: 0.34, bn: 0x86b6ff, bI: 0.46, fl: 0xb9cdf0, fI: 0.62, ex: 1.06, st: 0.0 },
  { t: 0.25, zen: 0x2f63b0, mid: 0x9cc4e6, hor: 0xdfe8ea, gnd: 0x5c7a4c, fog: 0xd0dde0, sun: 0xfff1d6, sunI: 3.6, hs: 0xd8ecff, hg: 0x60704a, hI: 1.32, amb: 0x5a6c88, aI: 0.36, bn: 0x90bcff, bI: 0.5, fl: 0xbfd2f2, fI: 0.62, ex: 1.04, st: 0.0 },
  { t: 0.42, zen: 0x3a5f9e, mid: 0xb3b9c2, hor: 0xf2d2a0, gnd: 0x586446, fog: 0xd6c8b0, sun: 0xffc880, sunI: 3.0, hs: 0xd0d8e8, hg: 0x5a5a3a, hI: 1.1, amb: 0x56607a, aI: 0.33, bn: 0x8aa8e8, bI: 0.4, fl: 0xc4c8e0, fI: 0.58, ex: 1.05, st: 0.0 },
  { t: 0.50, zen: 0x23346e, mid: 0x7a6a8a, hor: 0xf08a5a, gnd: 0x3a4538, fog: 0x9a7f80, sun: 0xff8a50, sunI: 1.5, hs: 0x8f9bc8, hg: 0x3a3a30, hI: 0.72, amb: 0x3a3f66, aI: 0.30, bn: 0x6070b8, bI: 0.30, fl: 0x8890c0, fI: 0.46, ex: 1.08, st: 0.30 },
  { t: 0.58, zen: 0x0f1a3e, mid: 0x2e3a6a, hor: 0x6a4f78, gnd: 0x252c30, fog: 0x3a3f5e, sun: 0x7a88d0, sunI: 1.0, hs: 0x6070b0, hg: 0x262c34, hI: 0.78, amb: 0x303a64, aI: 0.50, bn: 0x4a60a0, bI: 0.34, fl: 0x6270a8, fI: 0.50, ex: 1.3, st: 0.85 },
  { t: 0.75, zen: 0x070d24, mid: 0x101a3c, hor: 0x1c2a4c, gnd: 0x141c24, fog: 0x161e34, sun: 0xa6bcf0, sunI: 1.15, hs: 0x50609c, hg: 0x1a2230, hI: 0.8, amb: 0x2c3862, aI: 0.52, bn: 0x3a50a0, bI: 0.36, fl: 0x55669c, fI: 0.5, ex: 1.5, st: 1.0 },
  { t: 0.92, zen: 0x141f4a, mid: 0x3a4a7a, hor: 0x8a6a7a, gnd: 0x242c30, fog: 0x4a5070, sun: 0x8a98d8, sunI: 0.9, hs: 0x5a6ab0, hg: 0x222a32, hI: 0.74, amb: 0x2e3860, aI: 0.46, bn: 0x5068b0, bI: 0.32, fl: 0x6070a8, fI: 0.48, ex: 1.32, st: 0.55 },
];
const COLOR_FIELDS = ['zen', 'mid', 'hor', 'gnd', 'fog', 'sun', 'hs', 'hg', 'amb', 'bn', 'fl'];
const NUM_FIELDS = ['sunI', 'hI', 'aI', 'bI', 'fI', 'ex', 'st'];
const KEYS = raw.map((k) => { const o = { t: k.t }; for (const f of COLOR_FIELDS) o[f] = hex(k[f]); for (const f of NUM_FIELDS) o[f] = k[f]; return o; });
// close the ring: the last key runs on into the first at t = 1
KEYS.push(Object.assign({}, KEYS[0], { t: 1 }));

export function makeState() {
  const o = {};
  for (const f of COLOR_FIELDS) o[f] = new THREE.Color();
  for (const f of NUM_FIELDS) o[f] = 0;
  return o;
}

/** interpolate the palette at tod into out (made by makeState) */
export function sampleTime(tod, out) {
  const t = ((tod % 1) + 1) % 1;
  let i = 0;
  while (i < KEYS.length - 2 && t >= KEYS[i + 1].t) i++;
  const a = KEYS[i], b = KEYS[i + 1];
  let f = (t - a.t) / (b.t - a.t);
  f = f * f * (3 - 2 * f);
  for (const k of COLOR_FIELDS) out[k].copy(a[k]).lerp(b[k], f);
  for (const k of NUM_FIELDS) out[k] = a[k] + (b[k] - a[k]) * f;
  return out;
}

const AZ0 = Math.atan2(0.62, -0.74);       // where the sun stands at START_TOD
/** the sun's direction at tod (below the horizon at night; the moon is its opposite) */
export function sunVector(tod, out) {
  const h = Math.sin(tod * Math.PI * 2);
  const e = h * 1.02;
  const az = AZ0 + (tod - START_TOD) * Math.PI * 2;
  return out.set(Math.cos(e) * Math.cos(az), Math.sin(e), Math.cos(e) * Math.sin(az)).normalize();
}

export const phaseName = (tod) => {
  const t = ((tod % 1) + 1) % 1;
  return t < 0.12 ? 'DAWN' : t < 0.38 ? 'DAY' : t < 0.5 ? 'EVENING' : t < 0.56 ? 'DUSK' : t < 0.9 ? 'NIGHT' : 'PREDAWN';
};
