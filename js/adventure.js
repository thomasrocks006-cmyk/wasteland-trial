import * as THREE from 'three';
import { envPiece } from './envassets.js';
import {
  TAU, rnd, pick, angleTo, terrainHeight, terrainNormal, GAP_A, TRAIL, TRAIL_LEN, RIVER, waterDist, Builder, canvasTex,
  ROAD, ROAD_LEN, KEEP
} from './core.js';
import { START_TOD } from './daynight.js';
import { FLOOR_Y } from './vault.js';

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
  clasp: { name: "GAOLER'S CLASP", desc: '+15 max health' },
  boots: { name: "WAYFARER'S BOOTS", desc: '+8% move speed' },
  whet: { name: 'WHETSTONE OF ASH', desc: '+12% blade damage' },
  sigil: { name: "DUELLIST'S SIGNET", desc: 'Parry window +0.12 s' },
  ring: { name: "RUNNER'S BELT", desc: '+25 stamina' },
  horn: { name: "HUNTER'S HORN", desc: 'Kills restore 2 health' },
  cloak: { name: "THE GAOLER'S CLOAK", desc: '10% less damage taken; a crimson cloak' },
  fang: { name: 'WOLF-FANG CHARM', desc: 'Sprinting costs 25% less stamina' },
  talisman: { name: "HERMIT'S TOKEN", desc: 'Parry window +0.08 s; a parry returns more stamina' },
  heart: { name: "THE GAOLER'S KEYS", desc: '+25 max health; heavy strikes hit 20% harder' },
};

export const LORE = {
  vault: { title: 'THE UNDERCROFT PLAQUE', text: 'WHERE THE OLD ORDER KEPT ITS PRISONERS AND ITS ARMOURY. THE GAOLER HOLDS THE LAST KEYS. THE PORTCULLIS RISES ONLY WHEN HIS GARRISON IS DEAD.' },
  colossi: { title: 'THE KNIGHTS OF THE VALE', text: 'Two stone knights stand where the river enters the vale. Cut at their feet: WE HOLD THE WATER. THE WATER HOLDS THE VALLEY. NEITHER MAY BE LEFT UNWATCHED.' },
  cascade: { title: 'THE CASCADE', text: 'Scratched into a smooth stone beside the falls: FIVE FIRES CALL THE RELIEF. ONE AT THE WATCH-FIRE. THREE ON THE TOWERS. ONE AT THE WAR CAMP.' },
  overlook: { title: 'THE OVERLOOK', text: 'Below the parapet the lowland runs green to the far mountains. A line is cut into the rail: THE WARLORD HOLDS THE GATE UNTIL FIVE FIRES ANSWER. THEN IT IS YOURS TO WALK.' },
  sentinels: { title: 'A SLAVE\'S SCRATCHINGS', text: 'The Ashen Horde walks in bands and keeps its own watch. Strike one orc and the rest come. Cut into the wall: THE SHIELD-ORCS HOLD THE FRONT. GO ROUND, OR BREAK THEM. WHERE THE TROLL WALKS, RUN.' },
  lowroad: { title: 'THE LOW ROAD', text: 'A stone at the foot of the serpentine, cut by the men who built it: ELEVEN TURNS FROM THE GATE TO THE FLOOR. THE KEEP BELOW KEPT THE ROAD, AND THE ROAD KEPT THE VALE. NO ONE HAS KEPT IT SINCE THE HORDE CAME.' },
  keep: { title: 'THE KEEPER\'S LAST WORD', text: 'Scratched deep into the keep\'s gatepost: WE HELD THE ROAD FORTY YEARS AND THE HORDE CAME AT NIGHT. IF YOU READ THIS, THE PASS IS OPEN AND WE ARE NOT. TAKE WHAT IS LEFT AND KEEP THE ROAD BETTER THAN WE DID.' },
};

/* the hermit's bounties: counted from the day you first speak to him */
export const QUESTS = [
  { id: 'b1', name: 'WOLFSBANE', desc: 'Slay 8 wolves', key: 'wolf', need: 8, xp: 110, relic: 'fang' },
  { id: 'b2', name: 'SHIELD-BREAKER', desc: 'Defeat 6 footmen', key: 'footman', need: 6, xp: 170, picks: 1 },
  { id: 'b3', name: 'STEADY HAND', desc: 'Turn aside 12 blows with a parry', key: 'parry', need: 12, xp: 120, relic: 'talisman' },
];

/* groups of guards: what clearing one earns, and what it does */
export const GROUPS = {
  altar: { xp: 80, msg: 'THE CAMP FALLS' },
  lair: { xp: 90, msg: 'THE DEN IS EMPTY' },
  vaultA: { xp: 60, msg: 'THE GUARDROOM IS QUIET' },
  vaultB: { xp: 110, msg: 'THE PORTCULLIS RISES', onClear: 'seal' },
  vaultBoss: { xp: 500, msg: 'THE GAOLER FALLS', onClear: 'warden' },
};
/* who stands in the vault: [kind, x, z] per group */
export const VAULT_GROUPS = {
  vaultA: [['footman', -4, 31], ['swordsman', 4, 31]],
  vaultB: [['spearman', -6, -8], ['footman', 7, -10], ['shooter', -13, -18], ['shooter', 13, -20]],
  vaultBoss: [['boss', 0, -63]],
};

/* what walks where: the nearer a place of power, the more its own kind */
/* after dark the vale hunts: wolves in packs, and the stone walks */
export const NIGHT_MIX = [['wolf', 'wolf', 'wolf'], ['wolf', 'wolf', 'wolf', 'wolf'], ['goblin', 'goblin', 'goblin', 'shooter'], ['footman', 'spearman', 'swordsman'], ['troll', 'goblin']];
export const REGION_MIX = {
  altar: [['footman', 'spearman', 'goblin'], ['footman', 'footman', 'swordsman'], ['spearman', 'shooter', 'goblin']],
  lair: [['wolf', 'wolf', 'wolf'], ['wolf', 'wolf'], ['wolf', 'wolf', 'wolf', 'wolf']],
  gate: [['captain', 'swordsman', 'swordsman'], ['shooter', 'shooter', 'footman'], ['captain', 'shooter']],
};

const defaults = () => ({
  xp: 0, level: 1, picks: 0,
  found: {}, done: {}, cleared: {}, read: {},
  relics: [], perks: [], bestiary: {},
  passOpen: false, deaths: 0, playSecs: 0, tod: START_TOD,
  quests: { started: false, wolf: 0, footman: 0, parry: 0, claimed: {} },
});
const KNOWN_KINDS = ['footman', 'swordsman', 'spearman', 'shooter', 'captain', 'wolf', 'boss'];
const clampInt = (v, lo, hi, dflt) => (Number.isFinite(+v) && v !== null && v !== '' ? Math.min(hi, Math.max(lo, Math.floor(+v))) : dflt);
/** a save is data from outside: a hand-edited, truncated or older file must never reach the game as NaN or markup */
export function loadAdv(save, knownPlaces = null, knownPerks = null) {
  const raw = save.adv && typeof save.adv === 'object' ? save.adv : {};
  const a = defaults();
  a.level = clampInt(raw.level, 1, MAX_LEVEL, 1);
  a.xp = clampInt(raw.xp, 0, 1e6, 0);
  a.picks = clampInt(raw.picks, 0, 99, 0);
  a.deaths = clampInt(raw.deaths, 0, 1e6, 0);
  a.playSecs = clampInt(raw.playSecs, 0, 1e9, 0);
  a.tod = Number.isFinite(+raw.tod) && raw.tod !== null ? ((+raw.tod % 1) + 1) % 1 : START_TOD;
  a.passOpen = raw.passOpen === true;
  const flags = (src, ok) => { const o = {}; if (src && typeof src === 'object') for (const k of Object.keys(src)) if (src[k] === true && (!ok || ok.includes(k))) o[k] = true; return o; };
  a.found = flags(raw.found, knownPlaces); a.done = flags(raw.done, knownPlaces); a.cleared = flags(raw.cleared, knownPlaces && knownPlaces.concat(Object.keys(GROUPS)));
  a.read = flags(raw.read, Object.keys(LORE));
  if (raw.done && typeof raw.done === 'object') for (const k of Object.keys(raw.done)) if (raw.done[k] && (!knownPlaces || knownPlaces.includes(k))) a.done[k] = true;
  a.relics = (Array.isArray(raw.relics) ? raw.relics : []).filter((id, i, arr) => RELICS[id] && arr.indexOf(id) === i);
  a.perks = (Array.isArray(raw.perks) ? raw.perks : []).filter((id) => typeof id === 'string' && (!knownPerks || knownPerks.includes(id))).slice(0, 99);
  if (raw.bestiary && typeof raw.bestiary === 'object') for (const k of KNOWN_KINDS) if (k in raw.bestiary) a.bestiary[k] = clampInt(raw.bestiary[k], 0, 1e7, 0);
  if (raw.quests && typeof raw.quests === 'object') {
    a.quests.started = raw.quests.started === true;
    for (const k of ['wolf', 'footman', 'parry']) a.quests[k] = clampInt(raw.quests[k], 0, 99999, 0);
    for (const q of QUESTS) if (raw.quests.claimed && raw.quests.claimed[q.id] === true) a.quests.claimed[q.id] = true;
  }
  while (a.level < MAX_LEVEL && a.xp >= xpNeed(a.level)) { a.xp -= xpNeed(a.level); a.level++; a.picks++; }
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
  // the lowland: a stone at the foot of the road, and the keep's strongbox in its yard
  const foot = ROAD[ROAD.length - 1], fa = Math.atan2(foot.z, foot.x);
  const lowStone = findClear(world, foot.x - Math.sin(fa) * 7.5, foot.z + Math.cos(fa) * 7.5, 1.4, 10, 3);
  const keepAt = findClear(world, KEEP.x - Math.cos(KEEP.a) * 7.5, KEEP.z - Math.sin(KEEP.a) * 7.5, 1.6, 8, 3);
  const hermitAt = findClear(world, 20, -10, 2.6, 14, 3.5, 0.9);
  const vaultDoor = findClear(world, -56, 6, 2.5, 18, 3.5, 0.85);
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
    { id: 'shrine', name: 'THE OLD WATCH-FIRE', kind: 'rune', at: [0, 0], reach: 13, req: true, discover: 0, relic: 'clasp', color: 0xffa850, ring: 10.4, xp: 70, glyph: 'rune', text: 'The old fire-pit catches. Smoke climbs over the vale.' },
    { id: 'tower1', name: 'THE EASTERN WATCHTOWER', kind: 'beacon', at: inward(...towers[0], 5.8), base: towers[0], reach: 8, req: true, discover: 46, color: 0xffb04a, ring: 2.4, xp: 55, glyph: 'beacon', text: 'The beacon catches. Every man in the vale will have seen it.' },
    { id: 'tower2', name: 'THE NORTHERN WATCHTOWER', kind: 'beacon', at: inward(...towers[1], 5.8), base: towers[1], reach: 8, req: true, discover: 46, relic: 'horn', color: 0xffb04a, ring: 2.4, xp: 55, glyph: 'beacon', text: 'The beacon catches. Every man in the vale will have seen it.' },
    { id: 'tower3', name: 'THE SOUTHERN WATCHTOWER', kind: 'beacon', at: inward(...towers[2], 5.8), base: towers[2], reach: 8, req: true, discover: 46, color: 0xffb04a, ring: 2.4, xp: 55, glyph: 'beacon', text: 'The beacon catches. Every man in the vale will have seen it.' },
    { id: 'altar', name: 'THE WAR CAMP', kind: 'altar', at: [cl.x, cl.z], reach: 5.4, req: true, discover: 40, guard: { kinds: ['footman', 'spearman', 'footman'], r: 9.5, homeR: 2.5 }, relic: 'sigil', color: 0xffd080, ring: 2.6, xp: 80, glyph: 'altar', text: 'The banner goes up over the camp. The company will not forget it.' },
    { id: 'lair', name: 'THE WOLF DEN', kind: 'cache', at: lair, reach: 4, discover: 34, guard: { kinds: ['wolf', 'wolf', 'wolf', 'wolf'], r: 6, homeR: 3 }, relic: 'whet', color: 0xffd060, ring: 1.6, xp: 90, glyph: 'cache', text: 'Under the roots, an old soldier\'s kit.' },
    { id: 'ford', name: 'THE FORD CACHE', kind: 'cache', at: fordCache, reach: 3.4, discover: 26, relic: 'boots', color: 0xffd060, ring: 1.4, xp: 40, glyph: 'cache', text: 'A pack left dry above the water line.' },
    { id: 'southCairn', name: 'THE SOUTHERN CAIRN', kind: 'cache', at: southCairn, reach: 3.4, discover: 28, relic: 'ring', color: 0xffd060, ring: 1.4, xp: 40, glyph: 'cache', text: 'A traveller\'s cairn, and a pack left under it.' },
    { id: 'colossi', name: 'THE STONE KNIGHTS', kind: 'lore', at: findClear(world, colossus[0], colossus[1], 1.6, 10), reach: 3.6, discover: 30, lore: 'colossi', color: 0xb8d8ff, ring: 1.3, xp: 30, glyph: 'lore' },
    { id: 'cascade', name: 'THE CASCADE STONE', kind: 'lore', at: cascade, reach: 3.6, discover: 30, lore: 'cascade', color: 0xb8d8ff, ring: 1.3, xp: 30, glyph: 'lore' },
    { id: 'watch', name: "THE SOLDIER'S STONE", kind: 'lore', at: watchStone, reach: 3.6, discover: 30, lore: 'sentinels', color: 0xb8d8ff, ring: 1.3, xp: 30, glyph: 'lore' },
    { id: 'overlook', name: 'THE OVERLOOK', kind: 'lore', at: findClear(world, overlook[0], overlook[1], 1.6, 8), reach: 3.6, discover: 34, lore: 'overlook', color: 0xb8d8ff, ring: 1.3, xp: 30, glyph: 'lore' },
    { id: 'vaultDoor', name: 'THE SEALED DOOR', kind: 'door', at: vaultDoor, reach: 4.6, req: false, discover: 34, color: 0x9ff4ff, ring: 3.0, xp: 0, glyph: 'door', needs: 'altar', needsWhy: 'THE STONES MUST WAKE FIRST' },
    { id: 'vaultUp', name: 'THE ASCENT', kind: 'door', zone: 'vault', at: [0, 37.4], reach: 3.6, discover: 0, color: 0xffd9a0, ring: 2.2, xp: 0, glyph: 'door', up: true },
    { id: 'vaultLore', name: 'THE UNDERCROFT PLAQUE', kind: 'lore', zone: 'vault', at: [0, 28.5], reach: 3.6, discover: 14, lore: 'vault', color: 0xb8d8ff, ring: 1.3, xp: 30, glyph: 'lore' },
    { id: 'vaultChest', name: "THE GAOLER'S CACHE", kind: 'cache', zone: 'vault', at: [0, -79], reach: 3.6, discover: 22, needs: 'vaultBoss', needsWhy: 'THE GAOLER STILL STANDS', relic: 'heart', color: 0xffd060, ring: 1.6, xp: 150, glyph: 'cache', text: 'The last of the wardens\' keys, and a stone that beats.' },
    { id: 'hermit', name: "THE HERMIT'S FIRE", kind: 'talk', at: hermitAt, reach: 4.4, discover: 30, color: 0xffc070, ring: 2.2, xp: 0, glyph: 'talk' },
    { id: 'gate', name: 'THE PASS GATE', kind: 'gate', at: gate, reach: 9, req: true, discover: 48, relic: 'cloak', color: 0xffe08a, ring: 3.4, xp: 400, glyph: 'gate' },
    { id: 'lowroad', name: 'THE LOW ROAD', kind: 'lore', at: lowStone, reach: 3.6, discover: 42, lore: 'lowroad', color: 0xb8d8ff, ring: 1.3, xp: 50, glyph: 'lore' },
    { id: 'lowkeep', name: 'THE OLD KEEP', kind: 'cache', at: keepAt, reach: 4.2, discover: 48, guard: { kinds: ['captain', 'swordsman', 'shooter'], r: 13, homeR: 5 }, guardWhy: 'THE HORDE HOLDS THE KEEP', color: 0xffd060, ring: 2.2, xp: 320, glyph: 'cache', text: 'The keep\'s strongbox: coin, a dry cloak, and the last of the garrison\'s store.' },
    { id: 'keepLore', name: 'THE KEEPER\'S GATE', kind: 'lore', at: [KEEP.x - Math.cos(KEEP.a) * 13.2 + Math.sin(KEEP.a) * 3.4, KEEP.z - Math.sin(KEEP.a) * 13.2 - Math.cos(KEEP.a) * 3.4], reach: 4.0, discover: 40, lore: 'keep', color: 0xb8d8ff, ring: 1.3, xp: 50, glyph: 'lore' },
  ];
}

/* ================================================================ the manager */
export class Adventure {
  constructor(scene, world, ctx) {
    this.scene = scene; this.world = world; this.ctx = ctx;
    this.save = ctx.save;
    this.places = buildPlaces(world);
    this.adv = loadAdv(this.save, this.places.map((p) => p.id), ctx.perkIds || null);
    this.byId = {};
    for (const p of this.places) {
      p.zone = p.zone || 'valley';
      this.byId[p.id] = p;
      p.y = p.zone === 'vault' ? FLOOR_Y : terrainHeight(p.at[0], p.at[1]);
    }
    this.vault = ctx.vault || null;
    this.inVault = false;
    // while the pass is barred the vale is a closed bowl: the lowland's open boundary only
    // applies once the Warden has fallen (world.resolveCollisions reads this)
    this.world.passClosed = !this.adv.passOpen;
    this.zonePlaces = this.places.filter((p) => p.zone === 'valley');
    // way-points that are not places: where a vault objective points before a place does
    this.wp = { hall: { id: 'wpHall', at: [0, -10], glyph: 'rune', name: 'THE HALL', zone: 'vault' }, throne: { id: 'wpThrone', at: [0, -64], glyph: 'rune', name: 'THE THRONE', zone: 'vault' } };
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
      // the ring is laid on the ground itself: every vertex follows the terrain, so it never cuts into a slope
      const rg = new THREE.RingGeometry(p.ring * 0.84, p.ring, Math.max(40, Math.round(p.ring * 7)), 1);
      rg.rotateX(-Math.PI / 2);
      const rp = rg.attributes.position;
      for (let i = 0; i < rp.count; i++) rp.setY(i, (p.zone === 'vault' ? FLOOR_Y : terrainHeight(x + rp.getX(i), z + rp.getZ(i))) + 0.16);
      const ring = new THREE.Mesh(rg, ringMat);
      ring.position.set(x, 0, z);
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
      if (p.id === 'vaultDoor') this.buildDoorway(p, stone);
      if (p.kind === 'talk') this.buildHermit(p, stone);
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
    (p.zone === 'vault' && this.vault ? this.vault.obstacles : this.world.obstacles).push({ x: p.at[0], z: p.at[1], r: 0.7, h: 0.8 });
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
    (p.zone === 'vault' && this.vault ? this.vault.obstacles : this.world.obstacles).push({ x: p.at[0], z: p.at[1], r: 0.75, h: 2.1 });
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
    // while the pass is shut the opening is solid: no walking round the Warden
    this.gateBlock = [];
    if (!this.adv.passOpen) {
      for (const s of [-1, 0, 1]) {
        const o = { x: x + tx * 3.1 * s, z: z + tz * 3.1 * s, r: 1.9, h: 9.2 };
        this.world.obstacles.push(o); this.gateBlock.push(o);
      }
    }
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
    // the scanned iron gate (Poly Haven) fills the opening; its leaves swing outward when the pass is won
    const gate = envPiece('large_iron_gate');
    if (gate) {
      const S = 3.0, hold = new THREE.Group(); hold.position.set(x, ly - 0.1, z); hold.rotation.y = yaw; hold.scale.setScalar(S);
      const leaves = [];
      for (const [name, side] of [['large_iron_gate_left_door', -1], ['large_iron_gate_right_door', 1]]) {
        const leaf = gate.getObjectByName(name); if (!leaf) continue;
        const pivot = new THREE.Group(); pivot.position.set(side * 1.45, 0, 0); hold.add(pivot);
        leaf.position.set(-side * 1.45, 0, 0); pivot.add(leaf);
        leaves.push({ pivot, side });
      }
      for (const name of ['large_iron_gate', 'large_iron_gate_bolt']) { const o = gate.getObjectByName(name); if (o) { hold.add(o); o.userData.gateBolt = name.endsWith('bolt'); } }
      this.scene.add(hold);
      this.gate = { hold, leaves, open: 0, bolt: hold.children.find((o) => o.userData && o.userData.gateBolt) };
      this.barrier.visible = false; this.barrier.userData.replaced = true;
    }
  }

  /** the door in the hillside: two worn pillars, a lintel, and a dark doorway that wakes when the altar does */
  buildDoorway(p, mat) {
    const [x, z] = p.at, l = Math.hypot(x, z) || 1, ux = -x / l, uz = -z / l;     // faces the valley's centre
    const tx = -uz, tz = ux, yaw = Math.atan2(ux, uz), y0 = terrainHeight(x, z);
    const b = new Builder();
    for (const s of [-1, 1]) {
      const px = x + tx * 2.3 * s, pz = z + tz * 2.3 * s;
      b.add(new THREE.BoxGeometry(1.1, 5.6, 1.1), 0x7d8284, { pos: [px, y0 + 2.6, pz], rot: [0, yaw, 0], jitter: 0.05 });
      b.add(new THREE.BoxGeometry(1.5, 0.6, 1.5), 0x5f6769, { pos: [px, y0 + 0.2, pz], rot: [0, yaw, 0] });
    }
    b.add(new THREE.BoxGeometry(6.0, 0.9, 1.4), 0x6d7476, { pos: [x, y0 + 5.7, z], rot: [0, yaw + Math.PI / 2, 0], jitter: 0.04 });
    b.add(new THREE.BoxGeometry(5.4, 5.4, 0.6), 0x3a3f42, { pos: [x - ux * 0.6, y0 + 2.7, z - uz * 0.6], rot: [0, yaw + Math.PI / 2, 0] });   // the slab the doorway is cut into
    const m = new THREE.Mesh(b.build(), mat); m.castShadow = true; m.receiveShadow = true; this.scene.add(m);
    this.world.obstacles.push({ x: x + tx * 2.3, z: z + tz * 2.3, r: 0.8, h: 5.6 }, { x: x - tx * 2.3, z: z - tz * 2.3, r: 0.8, h: 5.6 }, { x: x - ux * 0.8, z: z - uz * 0.8, r: 1.6, h: 5 });
    this.doorway = new THREE.Mesh(new THREE.PlaneGeometry(3.3, 4.6), new THREE.MeshBasicMaterial({ color: 0x02030a, transparent: true, opacity: 0.96, side: THREE.DoubleSide }));
    this.doorway.position.set(x - ux * 0.25, y0 + 2.4, z - uz * 0.25); this.doorway.rotation.y = yaw;
    this.scene.add(this.doorway);
    // the scanned castle door (Poly Haven) in front of the dark: its two leaves open when the war camp's banner is raised
    const door = envPiece('large_castle_door');
    if (door) {
      door.position.set(x + ux * 0.05, y0 - 0.05, z + uz * 0.05); door.rotation.y = yaw; door.scale.set(1.62, 1.55, 1.4);
      this.scene.add(door);
      this.doorway.position.set(x - ux * 0.9, y0 + 2.4, z - uz * 0.9);
      this.door = { leaves: [['large_castle_door_left', 1], ['large_castle_door_right', -1]].map(([n, side]) => ({ o: door.getObjectByName(n), side, base: door.getObjectByName(n) ? door.getObjectByName(n).rotation.y : 0 })).filter((l) => l.o), open: 0 };
    }
  }

  /** a campfire among stones, and an old man leaning on a staff beside it */
  buildHermit(p, mat) {
    const [x, z] = p.at, y0 = p.y, face = Math.atan2(-x, -z);
    const b = new Builder();
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU;
      b.add(new THREE.SphereGeometry(0.2, 6, 5), 0x6f7478, { pos: [x + Math.cos(a) * 0.9, terrainHeight(x + Math.cos(a) * 0.9, z + Math.sin(a) * 0.9) + 0.1, z + Math.sin(a) * 0.9], scale: [1, 0.7, 1], jitter: 0.06 });
    }
    for (const r of [0.4, 1.3, 2.2]) b.add(new THREE.CylinderGeometry(0.09, 0.1, 1.2, 6), 0x5a4330, { pos: [x, y0 + 0.14, z], rot: [Math.PI / 2, r, 0.1] });   // logs
    b.add(new THREE.CylinderGeometry(0.9, 1.0, 0.04, 14), 0x2a221c, { pos: [x, y0 + 0.02, z] });
    const hx = x + Math.cos(face + 1.4) * 2.3, hz = z + Math.sin(face + 1.4) * 2.3, hy = terrainHeight(hx, hz);
    const man = new Builder({ smooth: true });
    man.add(new THREE.CylinderGeometry(0.26, 0.52, 1.35, 12), 0x5b4a36, { pos: [0, 0.72, 0] });                                  // robe
    man.add(new THREE.SphereGeometry(0.3, 10, 8), 0x6a5740, { pos: [0, 1.38, 0], scale: [1.15, 0.7, 0.9] });                     // shoulders
    man.add(new THREE.SphereGeometry(0.17, 10, 8), 0xc9a27a, { pos: [0, 1.62, 0.03] });                                           // face
    man.add(new THREE.SphereGeometry(0.22, 10, 8), 0x3f3a30, { pos: [0, 1.68, -0.04], scale: [1, 1.05, 1] });                    // hood
    man.add(new THREE.ConeGeometry(0.11, 0.38, 8), 0xb9b2a4, { pos: [0, 1.42, 0.14], rot: [Math.PI + 0.3, 0, 0] });               // beard
    man.add(new THREE.CylinderGeometry(0.03, 0.035, 2.2, 6), 0x5a4330, { pos: [0.4, 1.1, 0.12] });                                // staff
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 6), new THREE.MeshBasicMaterial({ color: 0x7ff3ff, toneMapped: false }));
    glow.position.set(0.4, 2.25, 0.12);
    const g = new THREE.Group();
    g.add(new THREE.Mesh(man.build(), new THREE.MeshLambertMaterial({ vertexColors: true })), glow);
    g.position.set(hx, hy, hz); g.rotation.y = Math.atan2(x - hx, z - hz);
    this.scene.add(g);
    const m = new THREE.Mesh(b.build(), mat); m.receiveShadow = true; this.scene.add(m);
    const fl = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTex(64, 64, (c, w, h) => { const gr = c.createRadialGradient(w / 2, h * 0.6, 2, w / 2, h * 0.6, w / 2); gr.addColorStop(0, 'rgba(255,230,140,1)'); gr.addColorStop(0.5, 'rgba(255,130,30,0.7)'); gr.addColorStop(1, 'rgba(255,60,0,0)'); c.fillStyle = gr; c.fillRect(0, 0, w, h); }), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    fl.position.set(x, y0 + 0.85, z); fl.scale.set(1.3, 1.9, 1);
    this.scene.add(fl);
    this.hermitFire = { sp: fl, base: y0 + 0.85, man: g, glow };
    this.world.obstacles.push({ x, z, r: 1.0, h: 0.5 }, { x: hx, z: hz, r: 0.5, h: 2 });
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
      if (p.id === 'gate' && this.barrier) this.barrier.visible = !this.adv.passOpen && !this.barrier.userData.replaced;
      if (p.beam) { p.beam.visible = done && !(p.id === 'gate' && !this.adv.passOpen); p.beam.material.opacity = 0.0; }
      if (p.chest) p.chest.hinge.rotation.x = done ? -1.9 : 0;
      if (p.stone) p.stone.face.material.opacity = this.adv.read[p.lore] ? 0.9 : 0.35;
    }
  }

  setZone(inVault) {
    this.inVault = inVault;
    this.zonePlaces = this.places.filter((p) => p.zone === (inVault ? 'vault' : 'valley'));
    for (const p of this.places) {                      // a place is only drawn in its own zone
      const show = p.zone === (inVault ? 'vault' : 'valley');
      if (p.ringMesh) p.ringMesh.visible = show;
      if (p.chest) p.chest.group.visible = show;
      if (p.stone) p.stone.group.visible = show;
    }
    this.near = null;
  }

  /** the vault's guards, by group; the seal stands until the hall's group is gone */
  populateVault() {
    this.warden = null;
    for (const gid of Object.keys(VAULT_GROUPS)) {
      if (this.adv.cleared[gid]) continue;
      this.guardSeq++;
      for (const [kind, gx, gz] of VAULT_GROUPS[gid]) {
        const [x, z] = findClear(this.world, gx, gz, 1.6, 5, 0, 0);
        const L = this.adv.level - 1;
        const e = this.ctx.enemies.spawn(kind, x, z, { hpScale: (kind === 'boss' ? 0.9 : 1) + L * 0.04, dmgScale: (kind === 'boss' ? 0.9 : 1) + L * 0.02 });
        e.passive = true; e.aggro = false; e.home = { x, z }; e.homeR = kind === 'boss' ? 0.5 : 2.5;
        e.group = 'g' + this.guardSeq; e.guard = gid;
        if (kind === 'boss') e.vaultBoss = true;
      }
    }
    if (this.vault) { if (this.adv.cleared.vaultB) this.vault.openSeal(); else this.vault.closeSeal(); }
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

  /** a garrison's answer to a lit beacon: a pack drawn to the flame, already hunting */
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
    if (this.world.night > 0.5 && Math.random() < 0.65) return pick(NIGHT_MIX);
    return pick(fallback);
  }

  onKill(e) {
    const a = this.adv;
    a.bestiary[e.key] = (a.bestiary[e.key] || 0) + 1;
    this.addXp(Math.max(4, Math.round(e.type.score / 12)), 'kill');
    if (a.quests.started && (e.key === 'wolf' || e.key === 'footman')) a.quests[e.key]++;
    if (this.has('horn') && !e.type.boss) this.ctx.player.heal(2);
    if (e.guard && !this.guardsAlive(e.guard)) {
      a.cleared[e.guard] = true;
      const g = GROUPS[e.guard] || { xp: 40, msg: '' };
      this.addXp(g.xp, 'clear');
      if (g.msg) this.ctx.callout(g.msg);
      if (g.onClear === 'seal' && this.vault) { this.vault.openSeal(); setTimeout(() => this.ctx.banner('THE PORTCULLIS RISES', 'THE THRONE LIES BEYOND'), 900); }
      if (g.onClear === 'warden') { a.done.vaultBoss = true; this.syncVisuals(); if (this.ctx.onVaultBoss) this.ctx.onVaultBoss(); }
      this.ctx.persist();
    }
    if (e.warden) this.wardenDown();
  }

  /** a parry counts toward the hermit's third bounty */
  addParry() { if (this.adv.quests.started) this.adv.quests.parry++; }
  questProgress(q) { return Math.min(q.need, this.adv.quests[q.key] || 0); }
  questReady(q) { return this.adv.quests.started && !this.adv.quests.claimed[q.id] && this.questProgress(q) >= q.need; }
  questLines() {
    const a = this.adv;
    return QUESTS.map((q) => (a.quests.claimed[q.id] ? '✓ ' : '') + q.name + ' · ' + (a.quests.claimed[q.id] ? 'DONE' : a.quests.started ? this.questProgress(q) + '/' + q.need : q.desc.toUpperCase()));
  }

  wardenDown() {
    const a = this.adv, p = this.byId.gate;
    this.warden = null;
    a.passOpen = true; a.done.gate = true;
    // the way through opens: the posts in the gateway go
    if (this.gateBlock) {
      const gone = new Set(this.gateBlock);
      this.world.obstacles = this.world.obstacles.filter((o) => !gone.has(o));
      this.gateBlock = null;
    }
    this.world.passClosed = false;
    this.addXp(p.xp, 'warden');
    this.giveRelic(p.relic);
    this.syncVisuals();
    this.ctx.persist();
    if (this.ctx.banner) this.ctx.banner('THE PASS IS OPEN', 'FOLLOW THE LOW ROAD DOWN');
    if (this.ctx.victory) this.ctx.victory();
  }

  /* ---------------- per frame ---------------- */
  update(dt, time, player) {
    this.time = time;
    const px = player.pos.x, pz = player.pos.z;
    let best = null, bd = Infinity, ap = null;
    for (const p of this.zonePlaces) {
      const d = Math.hypot(px - p.at[0], pz - p.at[1]);
      if (!this.adv.found[p.id] && !this.adv.done[p.id] && p.discover > 0 && d < p.discover) {
        this.adv.found[p.id] = true;
        this.addXp(15, 'found');
        this.syncVisuals();
        this.ctx.banner('DISCOVERED', p.name);
        this.ctx.persist();
      }
      if (d < p.reach && d < bd) { bd = d; best = p; }
      if (!best && !this.adv.done[p.id] && d < 30 && (!ap || d < ap.d)) ap = { p, d };
    }
    this.near = best ? this.describe(best) : null;
    // something to do a little way off: the USE button shows it greyed, so you know where it will be and what it will do
    this.approach = !best && ap ? { label: this.describe(ap.p).label, d: ap.d - ap.p.reach } : null;

    // rings breathe; lit beams shimmer
    for (const p of this.places) {
      if (p.ringMesh) {
        const b = p.ringMesh.userData.base || 0;
        p.ringMesh.material.opacity = b * (0.75 + 0.25 * Math.sin(time * 2.2 + p.at[0])) * (1 + 0.6 * this.world.night);
      }
      if (p.beam && p.beam.visible) p.beam.material.opacity = (0.34 + 0.08 * Math.sin(time * 3 + p.at[0] * 0.1)) * (1 + 0.8 * this.world.night);
    }
    if (this.hermitFire) {
      const f = this.hermitFire, w = Math.sin(time * 9) * 0.5 + Math.sin(time * 23.7) * 0.25;
      f.sp.scale.set(1.25 + w * 0.2, 1.85 + w * 0.45, 1); f.sp.position.y = f.base + w * 0.05;
      f.glow.material.color.setScalar(0.8 + 0.2 * Math.sin(time * 2.1)); f.glow.material.color.b = 1;
    }
    // the gate and the door swing on their hinges
    if (this.gate) {
      const want = this.adv.passOpen ? 1 : 0; this.gate.open += (want - this.gate.open) * Math.min(1, dt * 0.8);
      for (const l of this.gate.leaves) l.pivot.rotation.y = l.side * this.gate.open * 1.75;
      if (this.gate.bolt) this.gate.bolt.visible = this.gate.open < 0.05;
    }
    if (this.door) {
      const want = this.adv.done.altar ? 1 : 0; this.door.open += (want - this.door.open) * Math.min(1, dt * 0.7);
      for (const l of this.door.leaves) l.o.rotation.y = l.base + l.side * this.door.open * 1.5;
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
      case 'rune': o.label = done ? 'FIRE LIT' : 'LIGHT THE FIRE'; o.enabled = !done; break;
      case 'beacon': o.label = done ? 'BEACON LIT' : 'KINDLE THE BEACON'; o.enabled = !done; break;
      case 'altar':
        o.label = done ? 'BANNER RAISED' : 'RAISE THE BANNER'; o.enabled = !done;
        if (!done && !a.cleared.altar) { o.enabled = false; o.why = 'SOLDIERS GUARD THE CAMP'; }
        break;
      case 'cache':
        o.label = done ? 'EMPTY' : 'OPEN'; o.enabled = !done;
        if (!done && p.guard && !a.cleared[p.id]) { o.enabled = false; o.why = p.guardWhy || 'WOLVES HOLD THE DEN'; }
        if (!done && p.needs && !a.cleared[p.needs] && !a.done[p.needs]) { o.enabled = false; o.why = p.needsWhy || 'NOT YET'; }
        break;
      case 'lore': o.label = 'READ'; break;
      case 'talk':
        o.label = QUESTS.some((q) => this.questReady(q)) ? 'CLAIM BOUNTY' : 'TALK TO THE HERMIT';
        break;
      case 'door':
        o.label = p.up ? 'ASCEND TO THE VALE' : 'DESCEND INTO THE UNDERCROFT';
        break;
      case 'gate':
        if (a.passOpen) { o.label = 'THE GATE STANDS OPEN'; o.enabled = false; }
        else if (this.warden && this.warden.alive) { o.label = 'THE GAOLER HOLDS THE DOOR'; o.enabled = false; }
        else if (this.runes < RUNES_NEEDED) { o.label = 'BARRED ' + this.runes + '/' + RUNES_NEEDED; o.enabled = false; o.why = 'LIGHT ' + (RUNES_NEEDED - this.runes) + ' MORE'; }
        else o.label = 'FORCE THE GATE';
        break;
    }
    if (p.kind === 'door' && p.needs && !a.done[p.needs]) { o.enabled = false; o.label = 'SEALED DOOR'; o.why = p.needsWhy || 'NOT YET'; }
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
        if (p.id === 'altar') setTimeout(() => this.ctx.banner('A DOOR STIRS', 'BENEATH THE STONE KNIGHTS'), 1600);
        this.ctx.callout(this.runes + '/' + RUNES_NEEDED + ' FIRES');
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
      case 'talk': {
        const q = a.quests, first = !q.started;
        q.started = true;
        const paid = [];
        for (const b of QUESTS) if (this.questReady(b)) {
          q.claimed[b.id] = true; this.addXp(b.xp, 'bounty');
          if (b.relic) this.giveRelic(b.relic);
          if (b.picks) a.picks += b.picks;
          paid.push(b.name);
        }
        let text;
        if (first) text = 'Mind the fire. I was a warden once, before the vale forgot its wardens. The Ashen Horde holds it now, orc and goblin, out of the burning land past the pass; the wargs come when the fires burn low. Do me a service, and I will pay: ' + QUESTS.map((b) => b.desc.toLowerCase()).join('; ') + '. I will count from now.';
        else if (paid.length) text = 'Well struck. That is ' + paid.join(' and ') + ' settled, and what I promised is yours. ' + (QUESTS.every((b) => q.claimed[b.id]) ? 'There is nothing more I can give you but my thanks. Keep the fire in mind when the vale gets dark.' : 'The rest still stands: ' + this.questLines().filter((l) => !l.startsWith('✓')).join(', ') + '.');
        else text = QUESTS.every((b) => q.claimed[b.id]) ? 'You have cleared every debt I knew of. Sit if you like. The nights are long and the fire is warm.' : 'Still counting. ' + this.questLines().join(', ') + '.';
        this.ctx.lore("THE HERMIT'S FIRE", text);
        break;
      }
      case 'door': {
        if (p.up) this.ctx.leaveVault(); else this.ctx.enterVault();
        return true;
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
    this.ctx.callout('THE WARLORD DRAWS HIS BLADE');
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
    if (this.inVault) {
      if (!a.cleared.vaultA) return { text: 'CLEAR THE GUARDROOM', poi: this.wp.hall };
      if (!a.cleared.vaultB) return { text: 'BREAK THE GARRISON OF THE HALL', poi: this.wp.hall };
      if (!a.cleared.vaultBoss) return { text: 'DEFEAT THE GAOLER', poi: this.wp.throne };
      if (!a.done.vaultChest) return { text: "OPEN THE GAOLER'S CACHE", poi: B.vaultChest };
      return { text: 'RETURN TO THE VALE', poi: B.vaultUp };
    }
    if (!a.done.shrine) return { text: 'LIGHT THE OLD WATCH-FIRE', poi: B.shrine };
    const towers = ['tower1', 'tower2', 'tower3'].filter((id) => !a.done[id]).map((id) => B[id]);
    if (towers.length) return { text: 'KINDLE THE WATCHTOWER BEACONS · ' + (3 - towers.length) + '/3', poi: nearest(towers) };
    if (!a.done.altar) {
      return a.cleared.altar ? { text: 'RAISE THE BANNER AT THE WAR CAMP', poi: B.altar } : { text: 'TAKE THE WAR CAMP', poi: B.altar };
    }
    if (!a.passOpen) return { text: this.warden && this.warden.alive ? 'DEFEAT THE WARLORD' : 'FORCE THE PASS GATE', poi: B.gate };
    if (!a.done.lowkeep) return a.done.lowroad
      ? { text: 'THE OLD KEEP ON THE BASIN FLOOR', poi: B.lowkeep }
      : { text: 'WALK THE LOW ROAD DOWN', poi: B.lowroad };
    if (!a.done.vaultBoss) return { text: 'THE BARRED DOOR BENEATH THE KNIGHTS', poi: B.vaultDoor };
    return { text: 'THE VALE IS YOURS · WANDER AS YOU LIKE', poi: null };
  }

  /** compass entries for the current heading: relative bearing (+ is to the player's left) */
  compass(player, objPoi, out) {
    out.length = 0;
    for (const p of this.zonePlaces.concat(objPoi && !this.byId[objPoi.id] ? [objPoi] : [])) {
      const found = this.adv.found[p.id] || this.adv.done[p.id];
      const isObj = p === objPoi;
      if (!found && !isObj) continue;
      const dx = p.at[0] - player.pos.x, dz = p.at[1] - player.pos.z;
      out.push({ id: p.id, rel: angleTo(player.camYaw, Math.atan2(dx, dz)), dist: Math.hypot(dx, dz), glyph: p.glyph, obj: isObj, done: !!this.adv.done[p.id], name: p.name });
    }
    return out;
  }
}
