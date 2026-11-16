import * as THREE from 'three';

/* ================================================================ real surfaces
   Photographic CC0 textures (ambientCG: slate, rock, mossy ground, two barks) with their
   normal maps, loaded before the world is built. Each colour map is levelled and partly
   desaturated here, because the world's vertex colours still carry the hue: the photo
   contributes the grain, cracks and relief that flat colour and procedural noise cannot.
   If a file cannot be loaded the world keeps its procedural texture. */

const IMG = {};
const SETS = {
  rock: { keep: 0.55, level: 0.95 },
  slate: { keep: 0.6, level: 0.95 },
  ground: { keep: 0.3, level: 0.95 },
  bark: { keep: 0.35, level: 1.0 },
  birch: { keep: 0.5, level: 1.0 },
};

function loadImage(url) {
  return new Promise((res, rej) => { const i = new Image(); i.decoding = 'async'; i.onload = () => res(i); i.onerror = () => rej(new Error('texture ' + url)); i.src = url; });
}
function level(img, { keep, level }) {
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const x = c.getContext('2d'); x.drawImage(img, 0, 0);
  const d = x.getImageData(0, 0, c.width, c.height), a = d.data;
  let sum = 0; for (let i = 0; i < a.length; i += 4) sum += a[i] * 0.299 + a[i + 1] * 0.587 + a[i + 2] * 0.114;
  const gain = (level * 255) / Math.max(1, sum / (a.length / 4));
  for (let i = 0; i < a.length; i += 4) {
    const l = a[i] * 0.299 + a[i + 1] * 0.587 + a[i + 2] * 0.114;
    for (let k = 0; k < 3; k++) a[i + k] = Math.min(255, (l + (a[i + k] - l) * keep) * gain);
  }
  x.putImageData(d, 0, 0);
  return c;
}

export async function preloadTextures(base = 'assets/tex/') {
  await Promise.all(Object.keys(SETS).flatMap((k) => ['c', 'n'].map(async (kind) => {
    try { const img = await loadImage(base + k + '_' + kind + '.jpg'); IMG[k + kind] = kind === 'c' ? level(img, SETS[k]) : img; }
    catch (e) { /* the procedural texture stands in */ }
  })));
}

/** a colour map and its normal map (sharing one repeat, so the two always line up), or null if not loaded */
export function pbr(name, { repeat = 1, anisotropy = 8 } = {}) {
  const c = IMG[name + 'c'], n = IMG[name + 'n'];
  if (!c) return null;
  const map = new THREE.Texture(c); map.wrapS = map.wrapT = THREE.RepeatWrapping; map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = anisotropy; map.needsUpdate = true;
  map.repeat.set(repeat, repeat);
  if (n) {
    const nm = new THREE.Texture(n); nm.wrapS = nm.wrapT = THREE.RepeatWrapping; nm.anisotropy = anisotropy; nm.needsUpdate = true;
    nm.repeat = map.repeat;                      // one Vector2: change one and the other follows
    map.userData.normal = nm;
  }
  return map;
}
