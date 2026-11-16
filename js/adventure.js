import * as THREE from 'three';
import {
  TAU, rnd, pick, angleTo, terrainHeight, terrainNormal, GAP_A, TRAIL, TRAIL_LEN, RIVER, waterDist, Builder, canvasTex
} from './core.js';

/* ================================================================ the vale's story
   Wander's spine. Thirteen places in the valley, each with a reason to go there:
   runes to light, beacons to kindle, guarded caches, lore stones, and at the end of
   the forest trail a sealed gate with a Warden behind it. Five lights answer the
   gate. Everything found is saved: runes stay lit, relics stay yours, levels stay.

   Pure game logic lives here (state, XP, quest order); main.js owns the HUD. */

export const RUNES_NEEDED = 5;
export const MAX_LEVEL = 20;
export const xpNeed = (lvl) => 60 + (lvl - 1) * 38;

/* relics: small permanent gifts, found in caches and at the ends of fights */
export const RELICS = {
  clasp: { name: "WARDEN'S CLASP", desc: '+15 max health' },
  boots: { name: "WAYFARER'S BOOTS", desc: '+8% move speed' },
  whet: { name: 'WHETSTONE OF ASH', desc: '+12% blade damage' },
  sigil: { name: 'PARRY SIGIL', desc: 'Parry window +0.12 s' },
  ring: { name: 'RING OF SECOND BREATH', desc: '+25 stamina' },
  horn: { name: "HUNTER'S HORN", desc: 'Kills restore 2 health' },
  cloak: { name: "THE WARDEN'S CLOAK", desc: '10% less damage taken; a crimson cloak' },
};

export const LORE = {
  colossi: { title: 'THE COLOSSI', text: 'Two stone wardens stand where the river enters the vale. Cut at their feet: WE HOLD THE WATER. THE WATER HOLDS THE VALLEY. NEITHER MAY BE LEFT UNWATCHED.' },
  cascade: { title: 'THE CASCADE', text: 'Scratched into a smooth stone beside the falls: FIVE LIGHTS KEEP THE PASS SEALED. ONE AT THE SHRINE. THREE ON THE TOWERS. ONE WHERE THE OLD STONES STAND.' },
  overlook: { title: 'THE OVERLOOK', text: 'Below the parapet the lowland runs green to the far mountains. A line is cut into the rail: THE WARDEN KEEPS THE WAY UNTIL FIVE LIGHTS ANSWER. THEN IT IS YOURS TO WALK.' },
  sentinels: { title: "THE WATCHERS' STONE", text: 'The bronze were never built to hunt. Cut into the base: THEY WALK THE VALE TO KEEP IT. STRIKE ONE AND THE REST REMEMBER. WHAT THE STONES GUARD, THE WOLVES GUARD TOO.' },
};

/* what walks where: the nearer a place of power, the more its own kind */
export const REGION_MIX = {
  altar: [['stonekin', 'stonekin'], ['stonekin', 'grunt', 'grunt'], ['stonekin', 'shooter']],
  lair: [['wolf', 'wolf', 'wolf'], ['wolf', 'wolf'], ['wolf', 'wolf', 'wolf', 'wolf']],
  gate: [['brute', 'wasp', 'wasp'], ['shooter', 'shooter', 'grunt'], ['brute', 'shooter']],
};

const defaults = () => ({
  xp: 0, level: 1, picks: 0,
  found: {}, done: {}, cleared: {}, read: {},
  relics: [], perks: [], bestiary: {},
  passOpen: false, deaths: 0, playSecs: 0,
});
export function loadAdv(save) {
  const a = Object.assign(defaults(), save.adv || {});
  for (const k of ['found', 'done', 'cleared', 'read', 'bestiary']) a[k] = Object.assign({}, a[k]);
  a.relics = Array.isArray(a.relics) ? a.relics.slice() : [];
  a.perks = Array.isArray(a.perks) ? a.perks.slice() : [];
  save.adv = a;
  return a;
}

/** nearest open ground to (x, z): spirals out until nothing solid, water or trail is in the way */
const _n = new THREE.Vector3();
function findClear(world, x, z, pad = 1.6, maxR = 14, avoidWater = 3, minNy = 0.8) {
  for (let r = 0; r <= maxR; r += 1.2) {
    const n = r === 0 ? 1 : Math.ceil(r * 2.4);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * TAU;
      const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      if (world.isClear(px, pz, pad) && waterDist(px, pz) > avoidWater && terrainNormal(px, pz, _n).y > minNy) return [px, pz];
    }
  }
  return [x, z];
}

/* ================================================================ places */
function buildPlaces(world) {
  const towers = [1.15, 0.25, -1.45].map((a) => [Math.cos(a) * 76, Math.sin(a) * 76]);
  const inward = (x, z, d) => { const l = Math.hypot(x, z) || 1; return [x - (x / l) * d, z - (z / l) * d]; };

  // the ford: the first point where the trail crosses water
  let ford = TRAIL[Math.floor(TRAIL.length * 0.3)];
  for (let i = 1; i < TRAIL.length; i++) if (waterDist(TRAIL[i].x, TRAIL[i].z) < 0.5) { ford = TRAIL[i]; break; }
  // the old giants' wood: about three quarters of the way along the trail
  const gi = TRAIL.find((q) => q.s / TRAIL_LEN > 0.72) || TRAIL[TRAIL.length - 8];
  const gp = TRAIL[TRAIL.indexOf(gi) + 2] || gi;
  const tx = gp.x - gi.x, tz = gp.z - gi.z, tl = Math.hypot(tx, tz) || 1;
  const lair = findClear(world, gi.x - (tz / tl) * 13, gi.z + (tx / tl) * 13, 3, 12);
  const gate = [Math.cos(GAP_A) * 90.5, Math.sin(GAP_A) * 90.5];
  const cl = world.clearing || { x: -40, z: 60 };
  // the falls: the river drops from the rim along its first stretch. The stone stands on one bank, the cache on the other.
  const bank = (i, side) => {
    const a = RIVER[i], b = RIVER[i + 2], dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
    return findClear(world, a.x - (dz / l) * 7.5 * side, a.z + (dx / l) * 7.5 * side, 1.5, 12, 4.2, 0.7);
  };
  const cascade = bank(41, 1);
  const colossus = inward(-76, 30, 11), overlook = inward(gate[0], gate[1], 11);
  const fordCache = findClear(world, ford.x + 3, ford.z + 3, 1.6, 12, 3.2);
  const southCairn = findClear(world, -28, -60, 2, 14, 3), watchStone = findClear(world, -64, -22, 2, 14, 3.5);

  return [
    { id: 'shrine', name: 'THE SHRINE RING', kind: 'rune', at: [0, 0], reach: 13, req: true, discover: 0, relic: 'clasp', color: 0x7ff3ff, ring: 10.4, xp: 70, glyph: 'rune', text: 'The old rune wakes under your hand.' },
    { id: 'tower1', name: 'THE EASTERN WATCHTOWER', kind: 'beacon', at: inward(...towers[0], 5.8), base: towers[0], reach: 8, req: true, discover: 46, color: 0xffb04a, ring: 2.4, xp: 55, glyph: 'beacon', text: 'The beacon catches. The bronze will have seen it.' },
    { id: 'tower2', name: 'THE NORTHERN WATCHTOWER', kind: 'beacon', at: inward(...towers[1], 5.8), base: towers[1], reach: 8, req: true, discover: 46, relic: 'horn', color: 0xffb04a, ring: 2.4, xp: 55, glyph: 'beacon', text: 'The beacon catches. The bronze will have seen it.' },
    { id: 'tower3', name: 'THE SOUTHERN WATCHTOWER', kind: 'beacon', at: inward(...towers[2], 5.8), base: towers[2], reach: 8, req: true, discover: 46, color: 0xffb04a, ring: 2.4, xp: 55, glyph: 'beacon', text: 'The beacon catches. The bronze will have seen it.' },
    { id: 'altar', name: 'THE STANDING STONES', kind: 'altar', at: [cl.x, cl.z], reach: 5.4, req: true, discover: 40, guard: { kinds: ['stonekin', 'stonekin', 'stonekin'], r: 9.5, homeR: 2.5 }, relic: 'sigil', color: 0x9ff4c0, ring: 2.6, xp: 80, glyph: 'altar', text: 'The altar answers. The stones hum, once.' },
    { id: 'lair', name: 'THE WOLF DEN', kind: 'cache', at: lair, reach: 4, discover: 34, guard: { kinds: ['wolf', 'wolf', 'wolf', 'wolf'], r: 6, homeR: 3 }, relic: 'whet', color: 0xffd060, ring: 1.6, xp: 90, glyph: 'cache', text: 'Under the roots, an old soldier\'s kit.' },
    { id: 'ford', name: 'THE FORD CACHE', kind: 'cache', at: fordCache, reach: 3.4, discover: 26, relic: 'boots', color: 0xffd060, ring: 1.4, xp: 40, glyph: 'cache', text: 'A pack left dry above the water line.' },
    { id: 'southCairn', name: 'THE SOUTHERN CAIRN', kind: 'cache', at: southCairn, reach: 3.4, discover: 28, relic: 'ring', color: 0xffd060, ring: 1.4, xp: 40, glyph: 'cache', text: 'A traveller\'s cairn, and a pack left under it.' },
    { id: 'colossi', name: 'THE COLOSSI', kind: 'lore', at: findClear(world, colossus[0], colossus[1], 1.6, 10), reach: 3.6, discover: 30, lore: 'colossi', color: 0xb8d8ff, ring: 1.3, xp: 30, glyph: 'lore' },
    { id: 'cascade', name: 'THE CASCADE STONE', kind: 'lore', at: cascade, reach: 3.6, discover: 30, lore: 'cascade', color: 0xb8d8ff, ring: 1.3, xp: 30, glyph: 'lore' },
    { id: 'watch', name: "THE WATCHERS' STONE", kind: 'lore', at: watchStone, reach: 3.6, discover: 30, lore: 'sentinels', color: 0xb8d8ff, ring: 1.3, xp: 30, glyph: 'lore' },
    { id: 'overlook', name: 'THE OVERLOOK', kind: 'lore', at: findClear(world, overlook[0], overlook[1], 1.6, 8), reach: 3.6, discover: 34, lore: 'overlook', color: 0xb8d8ff, ring: 1.3, xp: 30, glyph: 'lore' },
    { id: 'gate', name: 'THE PASS GATE', kind: 'gate', at: gate, reach: 9, req: true, discover: 48, relic: 'cloak', color: 0xffe08a, ring: 3.4, xp: 400, glyph: 'gate' },
  ];
}

/* ================================================================ the manager */
export class Adventure {
  constructor(scene, world, ctx) {
    this.scene = scene; this.world = world; this.ctx = ctx;
    this.save = ctx.save;
    this.adv = loadAdv(this.save);
    this.places = buildPlaces(world);
    this.byId = {};
    for (const p of this.places) {
      this.byId[p.id] = p;
      p.y = terrainHeight(p.at[0], p.at[1]);
    }
    this.near = null;
    this.guardSeq = 0;
    this.warden = null;
    this.time = 0;
    this.build();
  }

  /* ---------------- state ---------------- */
  get level() { return this.adv.level; }
  get xp() { return this.adv.xp; }
  get runes() { return this.places.filter((p) => p.req && p.id !== 'gate' && this.adv.done[p.id]).length; }
  isDone(id) { return !!this.adv.done[id]; }
  has(relic) { return this.adv.relics.includes(relic); }
  get placesFound() { return this.places.filter((p) => this.adv.found[p.id] || this.adv.done[p.id]).length; }

  addXp(n, why) {
    if (n <= 0) return;
    const a = this.adv;
    if (a.level >= MAX_LEVEL) { a.xp = 0; return; }
    a.xp += Math.round(n);
    let up = 0;
    while (a.level < MAX_LEVEL && a.xp >= xpNeed(a.level)) {
      a.xp -= xpNeed(a.level); a.level++; a.picks++; up++;
    }
    if (up && this.ctx.onLevelUp) this.ctx.onLevelUp(a.level);
    if (this.ctx.onXp) this.ctx.onXp(n, why);
  }

  giveRelic(id) {
    if (!id || this.has(id)) return false;
    this.adv.relics.push(id);
    if (this.ctx.onRelic) this.ctx.onRelic(id, RELICS[id]);
    return true;
  }

  /* ---------------- visuals ---------------- */
  build() {
    const beamTex = canvasTex(8, 128, (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.55, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'rgba(255,255,255,1)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    });
    const glyphTex = canvasTex(128, 192, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(160,245,255,1)'; ctx.lineWidth = 5; ctx.lineCap = 'round';
      let s = 7;
      const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
      for (let i = 0; i < 6; i++) {
        const y = 26 + i * 26;
        ctx.beginPath(); ctx.moveTo(30 + r() * 20, y); ctx.lineTo(60 + r() * 30, y + (r() - 0.5) * 14); ctx.lineTo(78 + r() * 24, y + (r() - 0.5) * 8); ctx.stroke();
      }
    });
    this.fxItems = [];
    const stone = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    for (const p of this.places) {
      const [x, z] = p.at, y = p.y;
      // the ground ring: dim until the place is done, then it takes the place's colour
      const ringMat = new THREE.MeshBasicMaterial({ color: p.color, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
      const ring = new THREE.Mesh(new THREE.RingGeometry(p.ring * 0.84, p.ring, 48), ringMat);
      ring.rotation.x = -Math.PI / 2; ring.position.set(x, y + 0.18, z);
      this.scene.add(ring);
      p.ringMesh = ring;
      // a beam to the sky once lit: you can see your progress across the valley
      if (p.kind === 'rune' || p.kind === 'beacon' || p.kind === 'altar' || p.kind === 'gate') {
        const bx = p.base ? p.base[0] : x, bz = p.base ? p.base[1] : z;
        const mat = new THREE.MeshBasicMaterial({ map: beamTex, color: p.color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false });
        const beam = new THREE.Mesh(new THREE.CylinderGeometry(p.kind === 'beacon' ? 0.55 : 0.8, p.kind === 'beacon' ? 1.5 : 2.2, 120, 14, 1, true), mat);
        beam.position.set(bx, terrainHeight(bx, bz) + (p.kind === 'beacon' ? 62 : 58), bz);
        beam.visible = false;
        this.scene.add(beam);
        p.beam = beam;
      }
      if (p.kind === 'cache') this.buildChest(p, stone);
      if (p.kind === 'lore') this.buildLoreStone(p, stone, glyphTex);
      if (p.id === 'lair') this.buildDen(p, stone);
      if (p.kind === 'gate') this.buildGate(p, stone);
    }
    this.syncVisuals();
  }

  buildChest(p, mat) {
    const g = new THREE.Group();
    const base = new Builder(), lid = new Builder();
    base.add(new THREE.BoxGeometry(1.2, 0.56, 0.76), 0x6b4a2a, { pos: [0, 0.28, 0], jitter: 0.05 });
    for (const sx of [-0.42, 0.42]) base.add(new THREE.BoxGeometry(0.09, 0.6, 0.8), 0x3a3a3c, { pos: [sx, 0.28, 0] });
    lid.add(new THREE.CylinderGeometry(0.39, 0.39, 1.2, 12, 1, false, 0, Math.PI), 0x7a5532, { pos: [0, 0, 0], rot: [0, 0, Math.PI / 2], jitter: 0.04 });
    for (const sx of [-0.42, 0.42]) lid.add(new THREE.CylinderGeometry(0.4, 0.4, 0.09, 12, 1, false, 0, Math.PI), 0x3a3a3c, { pos: [sx, 0, 0], rot: [0, 0, Math.PI / 2] });
    lid.add(new THREE.BoxGeometry(0.14, 0.18, 0.06), 0xc9ad78, { pos: [0, 0.34, 0.4] });
    const bm = new THREE.Mesh(base.build(), mat); bm.castShadow = true;
    const lm = new THREE.Mesh(lid.build(), mat); lm.castShadow = true;
    const hinge = new THREE.Group(); hinge.position.set(0, 0.56, -0.36);
    lm.position.set(0, 0, 0.36); hinge.add(lm);
    g.add(bm, hinge);
    g.position.set(p.at[0], p.y, p.at[1]);
    g.rotation.y = Math.atan2(-p.at[0], -p.at[1]);       // faces the shrine
    this.scene.add(g);
    p.chest = { group: g, hinge };
    this.world.obstacles.push({ x: p.at[0], z: p.at[1], r: 0.7, h: 0.8 });
  }

  buildLoreStone(p, mat, glyphTex) {
    const b = new Builder();
    b.add(new THREE.BoxGeometry(1.05, 2.1, 0.34), 0x7d8284, { pos: [0, 1.0, 0], rot: [0.05, 0, 0.04], jitter: 0.05 });
    b.add(new THREE.BoxGeometry(1.25, 0.3, 0.55), 0x5f6769, { pos: [0, 0.1, 0], jitter: 0.04 });
    b.add(new THREE.SphereGeometry(0.4, 8, 5), 0x6f8358, { pos: [0.1, 2.1, 0], scale: [1.2, 0.35, 0.6] });         // moss cap
    const g = new THREE.Group();
    const m = new THREE.Mesh(b.build(), mat); m.castShadow = true; g.add(m);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 1.3), new THREE.MeshBasicMaterial({ map: glyphTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, opacity: 0.0 }));
    face.position.set(0, 1.0, 0.19); g.add(face);
    g.position.set(p.at[0], p.y, p.at[1]);
    g.rotation.y = Math.atan2(-p.at[0], -p.at[1]);
    this.scene.add(g);
    p.stone = { group: g, face };
    this.world.obstacles.push({ x: p.at[0], z: p.at[1], r: 0.75, h: 2.1 });
  }

  /** the pass gate: two weathered pillars and a lintel, with a film of rune light across the opening until the Warden falls */
  buildGate(p, mat) {
    const [x, z] = p.at, l = Math.hypot(x, z) || 1, rx = x / l, rz = z / l;      // outward (toward the brink)
    const tx = -rz, tz = rx;                                                    // across the opening
    const yaw = Math.atan2(rx, rz);
    const b = new Builder();
    for (const s of [-1, 1]) {
      const px = x + tx * 5.2 * s, pz = z + tz * 5.2 * s, py = terrainHeight(px, pz);
      b.add(new THREE.BoxGeometry(1.5, 10, 1.5), 0x7d8284, { pos: [px, py + 4.6, pz], rot: [0, yaw, 0], jitter: 0.05 });
      b.add(new THREE.BoxGeometry(2.1, 0.9, 2.1), 0x5f6769, { pos: [px, py + 0.3, pz], rot: [0, yaw, 0], jitter: 0.04 });
      b.add(new THREE.BoxGeometry(1.9, 0.7, 1.9), 0x5f6769, { pos: [px, py + 9.6, pz], rot: [0, yaw, 0], jitter: 0.04 });
      this.world.obstacles.push({ x: px, z: pz, r: 1.2, h: 10 });
    }
    const ly = Math.max(terrainHeight(x + tx * 5.2, z + tz * 5.2), terrainHeight(x - tx * 5.2, z - tz * 5.2));
    b.add(new THREE.BoxGeometry(13.2, 1.3, 1.7), 0x6d7476, { pos: [x, ly + 10.2, z], rot: [0, yaw + Math.PI / 2, 0], jitter: 0.04 });
    const m = new THREE.Mesh(b.build(), mat); m.castShadow = true; m.receiveShadow = true;
    this.scene.add(m);
    const film = canvasTex(128, 128, (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(160,240,255,0.1)'); g.addColorStop(1, 'rgba(160,240,255,0.5)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(210,250,255,0.7)'; ctx.lineWidth = 2;
      for (let i = 1; i < 8; i++) { ctx.beginPath(); ctx.moveTo(0, i * 16); ctx.lineTo(w, i * 16 + (i % 2 ? 6 : -6)); ctx.stroke(); }
    });
    film.wrapT = THREE.RepeatWrapping;
    this.barrier = new THREE.Mesh(new THREE.PlaneGeometry(9.4, 9.2), new THREE.MeshBasicMaterial({ map: film, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    this.barrier.position.set(x, ly + 5.2, z); this.barrier.rotation.y = yaw;
    this.scene.add(this.barrier);
  }

  buildDen(p, mat) {
    const b = new Builder();
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU, r = 2.6 + rnd(-0.4, 0.5), hh = rnd(0.5, 1.0);
      b.add(new THREE.ConeGeometry(0.1, hh, 5), 0xe0d6c2, { pos: [p.at[0] + Math.cos(a) * r, terrainHeight(p.at[0] + Math.cos(a) * r, p.at[1] + Math.sin(a) * r) + hh / 2 - 0.1, p.at[1] + Math.sin(a) * r], rot: [rnd(-0.3, 0.3), 0, rnd(-0.3, 0.3)] });
    }
    b.add(new THREE.CylinderGeometry(2.0, 2.3, 0.1, 12), 0x2d2620, { pos: [p.at[0], p.y + 0.05, p.at[1]] });
    const m = new THREE.Mesh(b.build(), mat); m.receiveShadow = true;
    this.scene.add(m);
  }

  /** match every ring, beam, chest lid and glyph to the saved state */
  syncVisuals() {
    for (const p of this.places) {
      const done = !!this.adv.done[p.id], found = !!this.adv.found[p.id] || done;
      if (p.ringMesh) { p.ringMesh.userData.base = done ? 0.55 : found ? 0.22 : 0; p.ringMesh.material.color.setHex(done ? p.color : 0xd8b070); }
      if (p.id === 'gate' && this.barrier) this.barrier.visible = !this.adv.passOpen;
      if (p.beam) { p.beam.visible = done && !(p.id === 'gate' && !this.adv.passOpen); p.beam.material.opacity = 0.0; }
      if (p.chest) p.chest.hinge.rotation.x = done ? -1.9 : 0;
      if (p.stone) p.stone.face.material.opacity = this.adv.read[p.lore] ? 0.9 : 0.35;
    }
  }

  /* ---------------- guards and encounters ---------------- */
  /** spawn the guards of every place not yet cleared; call after the field is emptied */
  populate() {
    this.warden = null;
    for (const p of this.places) {
      if (!p.guard || this.adv.cleared[p.id]) continue;
      this.guardSeq++;
      const [cx, cz] = p.at, n = p.guard.kinds.length, off = rnd(0, TAU);
      p.guard.kinds.forEach((kind, i) => {
        const a = off + (i / n) * TAU;
        const [x, z] = findClear(this.world, cx + Math.cos(a) * p.guard.r, cz + Math.sin(a) * p.guard.r, 1.6, 6, 1);
        const e = this.ctx.enemies.spawn(kind, x, z, { hpScale: 1 + (this.adv.level - 1) * 0.04, dmgScale: 1 + (this.adv.level - 1) * 0.02 });
        e.passive = true; e.aggro = false; e.home = { x: cx, z: cz }; e.homeR = p.guard.homeR;
        e.group = 'g' + this.guardSeq; e.guard = p.id;
      });
    }
  }

  guardsAlive(id) { return this.ctx.enemies.list.some((e) => e.alive && e.guard === id); }

  /** a bronze answer to a lit beacon: a pack drawn to the flame, already hunting */
  ambush(p) {
    const kinds = pick(REGION_MIX.gate).slice(0, 2 + (this.adv.level > 6 ? 1 : 0));
    const base = Math.atan2(p.at[1], p.at[0]) + rnd(-0.6, 0.6);
    kinds.forEach((kind, i) => {
      const a = base + (i - (kinds.length - 1) / 2) * 0.5, r = rnd(20, 26);
      const [x, z] = findClear(this.world, p.at[0] + Math.cos(a) * r, p.at[1] + Math.sin(a) * r, 1.8, 6, 1.5);
      const e = this.ctx.enemies.spawn(kind, x, z, { hpScale: 1 + (this.adv.level - 1) * 0.05, dmgScale: 1 + (this.adv.level - 1) * 0.03 });
      e.passive = false; e.aggro = true;
    });
  }

  /** which kinds a patrol spawned at (x, z) should be: places of power keep their own */
  patrolFor(x, z, fallback) {
    for (const key of ['altar', 'lair', 'gate']) {
      const p = this.byId[key];
      if (Math.hypot(x - p.at[0], z - p.at[1]) < 46) return pick(REGION_MIX[key]);
    }
    return pick(fallback);
  }

  onKill(e) {
    const a = this.adv;
    a.bestiary[e.key] = (a.bestiary[e.key] || 0) + 1;
    this.addXp(Math.max(4, Math.round(e.type.score / 12)), 'kill');
    if (this.has('horn') && !e.type.boss) this.ctx.player.heal(2);
    if (e.guard && !this.guardsAlive(e.guard)) {
      a.cleared[e.guard] = true;
      const p = this.byId[e.guard];
      this.addXp(p.xp, 'clear');
      this.ctx.callout(p.id === 'altar' ? 'THE STONEKIN FALL' : 'THE DEN IS EMPTY');
      this.ctx.persist();
    }
    if (e.warden) this.wardenDown();
  }

  wardenDown() {
    const a = this.adv, p = this.byId.gate;
    this.warden = null;
    a.passOpen = true; a.done.gate = true;
    this.addXp(p.xp, 'warden');
    this.giveRelic(p.relic);
    this.syncVisuals();
    this.ctx.persist();
    if (this.ctx.victory) this.ctx.victory();
  }

  /* ---------------- per frame ---------------- */
  update(dt, time, player) {
    this.time = time;
    const px = player.pos.x, pz = player.pos.z;
    let best = null, bd = Infinity;
    for (const p of this.places) {
      const d = Math.hypot(px - p.at[0], pz - p.at[1]);
      if (!this.adv.found[p.id] && !this.adv.done[p.id] && p.discover > 0 && d < p.discover) {
        this.adv.found[p.id] = true;
        this.addXp(15, 'found');
        this.syncVisuals();
        this.ctx.banner('DISCOVERED', p.name);
        this.ctx.persist();
      }
      if (d < p.reach && d < bd) { bd = d; best = p; }
    }
    this.near = best ? this.describe(best) : null;

    // rings breathe; lit beams shimmer
    for (const p of this.places) {
      if (p.ringMesh) {
        const b = p.ringMesh.userData.base || 0;
        p.ringMesh.material.opacity = b * (0.75 + 0.25 * Math.sin(time * 2.2 + p.at[0]));
        p.ringMesh.scale.setScalar(1 + 0.03 * Math.sin(time * 1.7 + p.at[1]));
      }
      if (p.beam && p.beam.visible) p.beam.material.opacity = 0.34 + 0.08 * Math.sin(time * 3 + p.at[0] * 0.1);
    }
    if (this.barrier && this.barrier.visible) {
      this.barrier.material.opacity = 0.34 + 0.1 * Math.sin(time * 1.6);
      this.barrier.material.map.offset.y = (time * 0.05) % 1;
    }
  }

  /** what the USE button says and whether it works right now */
  describe(p) {
    const a = this.adv, done = !!a.done[p.id];
    const o = { poi: p, label: 'USE', enabled: true, why: '' };
    switch (p.kind) {
      case 'rune': o.label = done ? 'RUNE LIT' : 'LIGHT THE RUNE'; o.enabled = !done; break;
      case 'beacon': o.label = done ? 'BEACON LIT' : 'KINDLE THE BEACON'; o.enabled = !done; break;
      case 'altar':
        o.label = done ? 'ALTAR AWAKE' : 'WAKE THE ALTAR'; o.enabled = !done;
        if (!done && !a.cleared.altar) { o.enabled = false; o.why = 'THE STONEKIN GUARD IT'; }
        break;
      case 'cache':
        o.label = done ? 'EMPTY' : 'OPEN'; o.enabled = !done;
        if (!done && p.guard && !a.cleared[p.id]) { o.enabled = false; o.why = 'WOLVES HOLD THE DEN'; }
        break;
      case 'lore': o.label = 'READ'; break;
      case 'gate':
        if (a.passOpen) { o.label = 'THE PASS IS OPEN'; o.enabled = false; }
        else if (this.warden && this.warden.alive) { o.label = 'THE WARDEN WAKES'; o.enabled = false; }
        else if (this.runes < RUNES_NEEDED) { o.label = 'SEALED ' + this.runes + '/' + RUNES_NEEDED; o.enabled = false; o.why = 'LIGHT ' + (RUNES_NEEDED - this.runes) + ' MORE'; }
        else o.label = 'BREAK THE SEAL';
        break;
    }
    return o;
  }

  /** the USE button */
  use(player) {
    const n = this.near;
    if (!n) return false;
    const p = n.poi, a = this.adv;
    if (!n.enabled) { if (n.why) this.ctx.toast(n.why); return false; }
    switch (p.kind) {
      case 'rune': case 'beacon': case 'altar': {
        a.done[p.id] = true; a.found[p.id] = true;
        this.addXp(p.xp, 'light');
        this.ctx.audio.pickup('health');
        this.ctx.fx.ring(new THREE.Vector3(p.at[0], p.y + 0.3, p.at[1]), p.color, p.ring * 1.6, 0.9);
        this.ctx.fx.ecoBurst(new THREE.Vector3(p.at[0], p.y + 1.2, p.at[1]), p.color, 26, 1.6);
        this.giveRelic(p.relic);
        if (p.kind === 'beacon') this.ambush(p);
        this.ctx.callout(this.runes + '/' + RUNES_NEEDED + ' LIGHTS');
        this.ctx.toast(p.text);
        break;
      }
      case 'cache': {
        a.done[p.id] = true;
        this.addXp(p.xp, 'cache');
        this.ctx.audio.pickup('ammo');
        this.ctx.fx.ecoBurst(new THREE.Vector3(p.at[0], p.y + 0.8, p.at[1]), 0xffd060, 18, 1.2);
        if (!this.giveRelic(p.relic)) player.heal(30);
        this.ctx.toast(p.text);
        break;
      }
      case 'lore': {
        const first = !a.read[p.lore];
        a.read[p.lore] = true; a.done[p.id] = true;
        if (first) this.addXp(p.xp, 'lore');
        this.ctx.lore(LORE[p.lore].title, LORE[p.lore].text);
        break;
      }
      case 'gate': {
        this.spawnWarden(p);
        break;
      }
    }
    this.syncVisuals();
    this.ctx.persist();
    return true;
  }

  spawnWarden(p) {
    const [gx, gz] = p.at;
    const l = Math.hypot(gx, gz) || 1;
    const [x, z] = findClear(this.world, gx - (gx / l) * 20, gz - (gz / l) * 20, 3, 10, 1);
    const e = this.ctx.enemies.spawn('boss', x, z, { hpScale: 0.8 + (this.adv.level - 1) * 0.03, dmgScale: 0.9 + (this.adv.level - 1) * 0.02 });
    e.warden = true; e.passive = false; e.aggro = true;
    this.warden = e;
    this.ctx.callout('THE PASS WARDEN WAKES');
    this.ctx.audio.roar(10, true);
  }

  /* ---------------- guidance ---------------- */
  /** the quest line, and where it points */
  objective(player) {
    const a = this.adv, B = this.byId;
    const nearest = (list) => {
      let best = null, bd = Infinity;
      for (const p of list) { const d = Math.hypot(player.pos.x - p.at[0], player.pos.z - p.at[1]); if (d < bd) { bd = d; best = p; } }
      return best;
    };
    if (!a.done.shrine) return { text: 'LIGHT THE SHRINE RUNE', poi: B.shrine };
    const towers = ['tower1', 'tower2', 'tower3'].filter((id) => !a.done[id]).map((id) => B[id]);
    if (towers.length) return { text: 'KINDLE THE WATCHTOWER BEACONS · ' + (3 - towers.length) + '/3', poi: nearest(towers) };
    if (!a.done.altar) {
      return a.cleared.altar ? { text: 'WAKE THE ALTAR AT THE STANDING STONES', poi: B.altar } : { text: 'CLEAR THE STANDING STONES', poi: B.altar };
    }
    if (!a.passOpen) return { text: this.warden && this.warden.alive ? 'DEFEAT THE PASS WARDEN' : 'BREAK THE SEAL AT THE PASS GATE', poi: B.gate };
    return { text: 'THE PASS IS OPEN · WANDER AS YOU LIKE', poi: null };
  }

  /** compass entries for the current heading: relative bearing (+ is to the player's left) */
  compass(player, objPoi, out) {
    out.length = 0;
    for (const p of this.places) {
      const found = this.adv.found[p.id] || this.adv.done[p.id];
      const isObj = p === objPoi;
      if (!found && !isObj) continue;
      const dx = p.at[0] - player.pos.x, dz = p.at[1] - player.pos.z;
      out.push({ id: p.id, rel: angleTo(player.camYaw, Math.atan2(dx, dz)), dist: Math.hypot(dx, dz), glyph: p.glyph, obj: isObj, done: !!this.adv.done[p.id], name: p.name });
    }
    return out;
  }
}
