import { terrainHeight, waterLevel, trailDist, roadDist, ARENA_R, LOW_R, GAP_A } from './core.js';

/* ================================================================ the map
   A top-down chart of the vale drawn once from the real terrain (hillshade, water,
   the forest trail), then marked with what you have found. x runs right and z runs
   down, so what the player faces is (sin yaw, cos yaw) on the page too. */

const SPAN = 190;           // half-width of the chart in metres
const RES = 380;            // terrain samples across
let base = null;            // the terrain, painted once

function paintTerrain() {
  const cv = document.createElement('canvas'); cv.width = cv.height = RES;
  const c = cv.getContext('2d'), img = c.createImageData(RES, RES);
  const H = new Float32Array(RES * RES), step = (SPAN * 2) / RES;
  for (let j = 0; j < RES; j++) for (let i = 0; i < RES; i++) H[j * RES + i] = terrainHeight(-SPAN + i * step, -SPAN + j * step);
  for (let j = 0; j < RES; j++) for (let i = 0; i < RES; i++) {
    const x = -SPAN + i * step, z = -SPAN + j * step, h = H[j * RES + i];
    const hx = H[j * RES + Math.min(RES - 1, i + 1)] - H[j * RES + Math.max(0, i - 1)];
    const hz = H[Math.min(RES - 1, j + 1) * RES + i] - H[Math.max(0, j - 1) * RES + i];
    // light from the north-west: slopes facing it brighten, the far side darkens
    const shade = Math.max(0.55, Math.min(1.45, 1 + (-hx - hz) * 0.07));
    const r = Math.hypot(x, z);
    let R, G, B;
    if (r > LOW_R + 8) { R = 38; G = 52; B = 46; }                                     // beyond the lowland's brink
    else if (h < -40) { R = 30; G = 44; B = 38; }                                      // the far dark
    else if (h < -12) { R = 64; G = 94; B = 60; }                                      // the lowland basin
    else if (h > 14) { R = 150; G = 146; B = 136; }                                    // the rim: bare stone
    else if (h > 6) { R = 118; G = 126; B = 92; }
    else { R = 82; G = 112; B = 70; }                                                  // the valley floor
    if (waterLevel(x, z) > h) { R = 58; G = 116; B = 138; }
    else if (roadDist(x, z) < 1.3) { R = 156; G = 132; B = 94; }
    else if (trailDist(x, z) < 1.1 && r < ARENA_R) { R = 150; G = 122; B = 84; }
    const o = (j * RES + i) * 4;
    img.data[o] = Math.min(255, R * shade); img.data[o + 1] = Math.min(255, G * shade); img.data[o + 2] = Math.min(255, B * shade); img.data[o + 3] = 255;
  }
  c.putImageData(img, 0, 0);
  return cv;
}

const GLYPH = { rune: '◆', beacon: '▲', altar: '◈', cache: '■', lore: '✦', gate: '▣', door: '◖', talk: '●' };

/** draw the chart into canvas; places is Adventure.places, adv its saved state, player the hero */
export function drawMap(canvas, adv, player, objectivePoi) {
  if (!base) base = paintTerrain();
  const c = canvas.getContext('2d'), W = canvas.width, S = W / (SPAN * 2);
  const px = (x) => (x + SPAN) * S, pz = (z) => (z + SPAN) * S;
  c.clearRect(0, 0, W, W);
  c.imageSmoothingEnabled = true;
  c.drawImage(base, 0, 0, W, W);
  // the rim of the playable vale
  c.strokeStyle = 'rgba(255,220,160,0.22)'; c.lineWidth = 1; c.setLineDash([4, 5]);
  c.beginPath(); c.arc(px(0), pz(0), ARENA_R * S, 0, Math.PI * 2); c.stroke(); c.setLineDash([]);
  // the pass, and the lowland's own brink
  c.strokeStyle = 'rgba(255,230,160,0.5)'; c.lineWidth = 3;
  c.beginPath(); c.arc(px(0), pz(0), (ARENA_R - 2) * S, GAP_A - 0.36, GAP_A + 0.36); c.stroke();
  c.strokeStyle = 'rgba(255,230,160,0.18)'; c.lineWidth = 1; c.setLineDash([3, 6]);
  c.beginPath(); c.arc(px(0), pz(0), LOW_R * S, GAP_A - 0.62, GAP_A + 0.62); c.stroke(); c.setLineDash([]);

  c.font = `${Math.max(9, W * 0.026)}px Archivo, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
  for (const p of adv.places) {
    const found = adv.adv.found[p.id] || adv.adv.done[p.id];
    if (!found && p !== objectivePoi) continue;
    const done = !!adv.adv.done[p.id], x = px(p.at[0]), y = pz(p.at[1]), obj = p === objectivePoi;
    c.fillStyle = 'rgba(8,5,3,0.7)'; c.beginPath(); c.arc(x, y, W * 0.022, 0, Math.PI * 2); c.fill();
    c.fillStyle = obj ? '#ffe08a' : done ? 'rgba(255,255,255,0.5)' : '#ffd9a0';
    c.fillText(GLYPH[p.glyph] || '◆', x, y + 0.5);
    if (obj) { c.strokeStyle = '#ffe08a'; c.lineWidth = 1.5; c.beginPath(); c.arc(x, y, W * 0.036 + Math.sin(performance.now() * 0.004) * 1.5, 0, Math.PI * 2); c.stroke(); }
    c.fillStyle = 'rgba(8,5,3,0.75)'; const label = p.name.replace(/^THE /, '');
    c.fillStyle = done ? 'rgba(244,231,210,0.55)' : 'rgba(255,240,215,0.95)';
    c.shadowColor = 'rgba(0,0,0,0.9)'; c.shadowBlur = 3;
    c.fillText(label, x, y + W * 0.045);
    c.shadowBlur = 0;
  }
  // the hero: an arrow along the heading
  const hx = px(player.pos.x), hz = pz(player.pos.z), a = player.camYaw;
  c.save(); c.translate(hx, hz); c.rotate(Math.atan2(Math.sin(a), Math.cos(a)) * -1 + Math.PI);   // heading (sin, cos) on the page
  c.fillStyle = '#7ff3ff'; c.strokeStyle = '#04141a'; c.lineWidth = 1.5;
  c.beginPath(); c.moveTo(0, -W * 0.03); c.lineTo(W * 0.02, W * 0.02); c.lineTo(0, W * 0.008); c.lineTo(-W * 0.02, W * 0.02); c.closePath(); c.fill(); c.stroke();
  c.restore();
}
