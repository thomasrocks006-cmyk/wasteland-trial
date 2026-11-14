import * as THREE from 'three';
import {
  clamp, lerp, damp, rnd, rng, pick, terrainHeight, TAU, radialSprite, Builder
} from './core.js';
import { World } from './world.js';
import { Player } from './player.js';
import { FX } from './fx.js';
import { Audio } from './audio.js';
import { WeaponSystem, WEAPONS } from './weapons.js';
import { Enemies, ENEMY_TYPES } from './enemies.js';

/* ================================================================ setup */
const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({
  canvas, antialias: true, powerPreference: 'high-performance', stencil: false
});
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.06;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

let QUALITY = 'balanced';
function pixelRatioFor(q) {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  if (q === 'high') return Math.min(dpr, 2.0);
  if (q === 'fast') return Math.min(dpr, 1.0);
  return Math.min(dpr, 1.6);
}
renderer.setPixelRatio(pixelRatioFor(QUALITY));

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 900);
camera.position.set(0, 4, 8);

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = h > w ? 78 : 70;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 120));
resize();

/* ================================================================ entities */
const audio = new Audio();
const world = new World(scene, QUALITY);
const player = new Player(scene, world);
const fx = new FX(scene, camera, QUALITY);
const enemies = new Enemies(scene, world, fx, audio, player);

/* ---------------- pickups ---------------- */
class Pickups {
  constructor(scene, world) {
    this.world = world;
    this.items = [];
    const healthGeo = new THREE.OctahedronGeometry(0.30, 0);
    const ammoGeo = new THREE.BoxGeometry(0.34, 0.30, 0.34);
    this.healthMesh = new THREE.InstancedMesh(healthGeo,
      new THREE.MeshLambertMaterial({ color: 0x37e0c8, emissive: 0x0d6b62, emissiveIntensity: 0.6 }), 16);
    this.ammoMesh = new THREE.InstancedMesh(ammoGeo,
      new THREE.MeshLambertMaterial({ color: 0xf0b23c, emissive: 0x8a4a10, emissiveIntensity: 0.5 }), 16);
    this.healthMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.ammoMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.healthMesh.frustumCulled = false; this.ammoMesh.frustumCulled = false;
    scene.add(this.healthMesh, this.ammoMesh);
    this.d = new THREE.Object3D();
  }
  spawn(x, z, type) {
    if (this.items.length > 20) this.items.shift();
    this.items.push({ x, z, type, t: rnd(0, TAU), alive: true, y: terrainHeight(x, z) });
  }
  update(dt, time, player) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      if (!player.alive) continue;
      const dx = player.pos.x - it.x, dz = player.pos.z - it.z;
      const d = Math.hypot(dx, dz);
      if (d < 1.5) {
        if (it.type === 'health') {
          if (player.hp >= player.maxHp) continue;
          player.heal(28);
          audio.pickup('health');
          fx.ecoBurst(new THREE.Vector3(it.x, it.y + 0.6, it.z), 0x37e0c8, 12, 1);
        } else {
          audio.pickup('ammo');
          fx.ecoBurst(new THREE.Vector3(it.x, it.y + 0.6, it.z), 0xf0b23c, 10, 1);
          if (ui.onAmmoPickup) ui.onAmmoPickup();
        }
        this.items.splice(i, 1);
        continue;
      }
      it.t += dt;
    }
    let hn = 0, an = 0;
    for (const it of this.items) {
      const y = terrainHeight(it.x, it.z) + 0.55 + Math.sin(it.t * 2.2) * 0.14;
      this.d.position.set(it.x, y, it.z);
      this.d.rotation.set(it.t * 0.7, it.t * 1.4, 0);
      const s = 1 + Math.sin(it.t * 3) * 0.08;
      this.d.scale.setScalar(s);
      this.d.updateMatrix();
      if (it.type === 'health' && hn < 16) this.healthMesh.setMatrixAt(hn++, this.d.matrix);
      else if (it.type === 'ammo' && an < 16) this.ammoMesh.setMatrixAt(an++, this.d.matrix);
    }
    this.healthMesh.count = hn; this.ammoMesh.count = an;
    this.healthMesh.instanceMatrix.needsUpdate = true;
    this.ammoMesh.instanceMatrix.needsUpdate = true;
  }
  clear() { this.items.length = 0; this.healthMesh.count = 0; this.ammoMesh.count = 0; }
}
const pickups = new Pickups(scene, world);

/* ================================================================ state */
const GAME = {
  state: 'title',        // title | playing | paused | dead
  wave: 0,
  score: 0,
  kills: 0,
  headshots: 0,
  combo: 1,
  comboTimer: 0,
  bestCombo: 1,
  shotsFired: 0,
  shotsHit: 0,
  time: 0,
  waveActive: false,
  spawnQueue: [],
  spawnTimer: 0,
  breather: 0,
  totalToSpawn: 0,
  spawnedThisWave: 0,
  objective: '',
  objectiveProgress: 0,
  objectiveTarget: 0,
  runStart: 0,
};
const SAVE_KEY = 'wasteland-trial-v1';
const save = (() => {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY) || '{}'); }
  catch { return {}; }
})();
save.bestWave = save.bestWave || 0;
save.bestScore = save.bestScore || 0;
save.kills = save.kills || 0;

/* ================================================================ weapons wiring */
function worldHit(from, dir, range) {
  // march the ray against the heightfield
  const step = 1.1;
  let t = 0.6;
  const p = new THREE.Vector3();
  let prevY = from.y, prevT = 0;
  while (t < range) {
    p.copy(from).addScaledVector(dir, t);
    const gh = terrainHeight(p.x, p.z);
    if (p.y <= gh) {
      // refine between prevT and t
      let a = prevT, b = t;
      for (let i = 0; i < 6; i++) {
        const m = (a + b) / 2;
        p.copy(from).addScaledVector(dir, m);
        if (p.y <= terrainHeight(p.x, p.z)) b = m; else a = m;
      }
      p.copy(from).addScaledVector(dir, b);
      p.y = terrainHeight(p.x, p.z);
      return p.clone();
    }
    prevT = t; prevY = p.y;
    t += step;
  }
  return null;
}

const grenades = [];

const weapons = new WeaponSystem(scene, player, fx, audio, {
  enemies: () => enemies.list,
  raycast: (o, d, range, pierce) => enemies.raycast(o, d, range, pierce),
  worldHit,
  applyDamage: (e, dmg, point, dir, head, def) => {
    enemies.hit(e, dmg, point, dir, head, def);
    if (head) { GAME.headshots++; }
  },
  spawnProjectile: (pos, vel, ex, dmg) => {
    grenades.push({
      pos, vel, life: 4.5, dmg, ex,
      mesh: null
    });
    audio.shot('bomber', 0);
  },
  onAmmo: () => syncAmmoUI(),
});

/* ================================================================ UI */
const $ = (id) => document.getElementById(id);
const ui = {
  hud: $('hud'), score: $('score'), wave: $('waveNum'), combo: $('combo'),
  healthFill: $('healthFill'), healthNum: $('healthNum'), waveBar: $('waveBar'),
  objective: $('objective'), gunName: $('gunName'), mag: $('ammoMag'), res: $('ammoRes'),
  ammoRow: $('ammoRow'), crosshair: $('crosshair'), hitmarker: $('hitmarker'),
  reloadRing: $('reloadRing'), callout: $('callout'), bloodEdge: $('bloodEdge'),
  bestScore: $('bestScore'), dmgArcs: $('dmgArcs'),
  onAmmoPickup: null,
};

function syncAmmoUI() {
  const d = weapons.def, s = weapons.ammo;
  ui.gunName.textContent = d.name + ' · ' + d.mod;
  ui.mag.textContent = s.mag;
  ui.res.textContent = s.reserve === Infinity ? '∞' : s.reserve;
  ui.ammoRow.classList.toggle('low', s.mag <= Math.max(1, d.mag * 0.25));
  document.querySelectorAll('.wslot').forEach((b, i) => b.classList.toggle('on', i === weapons.index));
}

function showCallout(text) {
  const el = ui.callout;
  el.textContent = text;
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
}

function damageArc(angle) {
  const el = document.createElement('div');
  el.className = 'dmgArc';
  el.style.setProperty('--a', angle + 'rad');
  ui.dmgArcs.appendChild(el);
  setTimeout(() => el.remove(), 820);
}

player.onFootstep = (speed) => {
  if (audio.enabled) audio.step();
  if (speed > 3) {
    const p = new THREE.Vector3(player.pos.x, player.pos.y + 0.1, player.pos.z);
    fx.puff(p, null, 0xa5835c, 0.28, 1, 0.55, 0.5);
  }
};
player.onLand = (v) => {
  audio.land();
  fx.puff(new THREE.Vector3(player.pos.x, player.pos.y + 0.1, player.pos.z), null, 0xa5835c, 0.5, 3, 0.6, 1.2);
};
player.onHurt = () => { audio.playerHurt(); };
player.onDodge = () => {
  audio.click(0, 0.2, 380);
  audio.step();
  fx.puff(new THREE.Vector3(player.pos.x, player.pos.y + 0.25, player.pos.z), null, 0xb08a62, 0.7, 5, 0.7, 2.4);
};
player.onDamageDir = (a) => damageArc(a);

/* ================================================================ input */
const input = {
  mx: 0, my: 0, lookX: 0, lookY: 0, jump: false, sprint: false,
  fireHeld: false, aim: false, jumpQueued: false, dodge: false, dodgeQueued: false,
};
let sensitivity = 1;

const stickZone = $('stickZone');
const lookZone = $('lookZone');
const stick = $('stick');
const knob = $('stickKnob');
let stickId = null, stickCX = 0, stickCY = 0, stickRadius = 46;

function setStickBase(x, y) {
  stick.style.left = (x - 48) + 'px';
  stick.style.top = (y - 48) + 'px';
  stick.style.bottom = 'auto';
}

stickZone.addEventListener('pointerdown', (e) => {
  if (GAME.state !== 'playing') return;
  e.preventDefault();
  stickId = e.pointerId;
  stickZone.setPointerCapture(e.pointerId);
  stickCX = e.clientX; stickCY = e.clientY;
  stick.classList.add('active');
  setStickBase(e.clientX, e.clientY);
  knob.style.transform = 'translate(0,0)';
});
stickZone.addEventListener('pointermove', (e) => {
  if (e.pointerId !== stickId) return;
  const dx = e.clientX - stickCX, dy = e.clientY - stickCY;
  const len = Math.hypot(dx, dy);
  const max = 52;
  const k = len > max ? max / len : 1;
  knob.style.transform = `translate(${dx * k}px,${dy * k}px)`;
  input.mx = clamp((dx * k) / max, -1, 1);
  input.my = clamp((-dy * k) / max, -1, 1);
  input.sprint = (dx * k / max) > 0.82 || (dy * k / max) < -0.82;
});
function endStick(e) {
  if (e.pointerId !== stickId) return;
  stickId = null;
  input.mx = 0; input.my = 0; input.sprint = false;
  stick.classList.remove('active');
  knob.style.transform = 'translate(0,0)';
  stick.style.left = 'calc(env(safe-area-inset-left,0px) + 34px)';
  stick.style.top = 'auto';
  stick.style.bottom = 'calc(env(safe-area-inset-bottom,0px) + 44px)';
}
stickZone.addEventListener('pointerup', endStick);
stickZone.addEventListener('pointercancel', endStick);

/* look drag */
let lookId = null, lastLX = 0, lastLY = 0;
lookZone.addEventListener('pointerdown', (e) => {
  if (GAME.state !== 'playing') return;
  e.preventDefault();
  lookId = e.pointerId;
  lookZone.setPointerCapture(e.pointerId);
  lastLX = e.clientX; lastLY = e.clientY;
});
lookZone.addEventListener('pointermove', (e) => {
  if (e.pointerId !== lookId) return;
  const dx = e.clientX - lastLX, dy = e.clientY - lastLY;
  lastLX = e.clientX; lastLY = e.clientY;
  input.lookX += dx * 0.0034 * sensitivity * (player.aim ? 0.62 : 1);
  input.lookY += dy * 0.0034 * sensitivity * (player.aim ? 0.62 : 1);
});
function endLook(e) { if (e.pointerId === lookId) lookId = null; }
lookZone.addEventListener('pointerup', endLook);
lookZone.addEventListener('pointercancel', endLook);

/* buttons */
function bindHold(el, onDown, onUp) {
  el.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); onDown(); el.classList.add('on'); });
  el.addEventListener('pointerup', (e) => { e.preventDefault(); e.stopPropagation(); el.classList.remove('on'); if (onUp) onUp(); });
  el.addEventListener('pointercancel', () => { el.classList.remove('on'); if (onUp) onUp(); });
  el.addEventListener('pointerleave', () => { el.classList.remove('on'); if (onUp) onUp(); });
}
bindHold($('btnFire'), () => { input.fireHeld = true; }, () => { input.fireHeld = false; });
bindHold($('btnJump'), () => { input.jumpQueued = true; });
bindHold($('btnDodge'), () => { input.dodgeQueued = true; });
$('btnReload').addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); weapons.tryReload(); });
$('btnAim').addEventListener('pointerdown', (e) => {
  e.preventDefault(); e.stopPropagation();
  input.aim = !input.aim;
  $('btnAim').classList.toggle('on', input.aim);
});
document.querySelectorAll('.wslot').forEach((b) => {
  b.addEventListener('pointerdown', (e) => {
    e.preventDefault(); e.stopPropagation();
    weapons.switchTo(parseInt(b.dataset.w, 10));
  });
});

/* keyboard + mouse for testing on desktop */
const keys = {};
window.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'KeyR') weapons.tryReload();
  if (e.code === 'KeyQ') weapons.next();
  if (e.code === 'Digit1') weapons.switchTo(0);
  if (e.code === 'Digit2') weapons.switchTo(1);
  if (e.code === 'Digit3') weapons.switchTo(2);
  if (e.code === 'Digit4') weapons.switchTo(3);
  if (e.code === 'Escape') togglePause();
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });

let mouseDown = false;
canvas.addEventListener('pointerdown', (e) => {
  if (GAME.state !== 'playing') return;
  if (e.pointerType === 'mouse') {
    mouseDown = true;
    if (!document.pointerLockElement) canvas.requestPointerLock?.();
    else input.fireHeld = true;
  }
});
window.addEventListener('pointerup', () => { mouseDown = false; if (GAME.state === 'playing') input.fireHeld = false; });
document.addEventListener('mousemove', (e) => {
  if (GAME.state !== 'playing') return;
  if (document.pointerLockElement === canvas) {
    input.lookX += e.movementX * 0.0022 * sensitivity * (player.aim ? 0.62 : 1);
    input.lookY += e.movementY * 0.0022 * sensitivity * (player.aim ? 0.62 : 1);
  }
});
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement === canvas) input.fireHeld = mouseDown;
});

/* ================================================================ waves */
function budgetFor(w) { return 110 + w * 52 + Math.pow(w, 1.6) * 8; }
const COST = { grunt: 26, wasp: 30, shooter: 40, brute: 95 };

function buildWave(w) {
  const q = [];
  if (w % 5 === 0) {
    q.push('boss');
    const adds = 4 + Math.floor(w / 5) * 2;
    for (let i = 0; i < adds; i++) q.push(i % 3 === 0 ? 'shooter' : 'grunt');
    return q;
  }
  let budget = budgetFor(w);
  const pool = ['grunt'];
  if (w >= 2) pool.push('shooter');
  if (w >= 3) pool.push('wasp');
  if (w >= 4) pool.push('brute');
  let guard = 0;
  while (budget > 18 && guard++ < 90) {
    const t = pick(pool);
    if (COST[t] > budget + 12) { budget -= 20; continue; }
    q.push(t);
    budget -= COST[t];
  }
  if (!q.length) q.push('grunt');
  return q;
}

function objectiveFor(w, queue) {
  if (w % 5 === 0) return 'KILL THE METALPEDE';
  const brutes = queue.filter(x => x === 'brute').length;
  if (brutes >= 2) return 'BREAK THE BRUTES';
  const shooters = queue.filter(x => x === 'shooter').length;
  if (shooters >= 3) return 'SILENCE THE MARKSMEN';
  const wasps = queue.filter(x => x === 'wasp').length;
  if (wasps >= 3) return 'SWAT THE STINGERS';
  return 'ELIMINATE ALL HOSTILES';
}

function startWave(w) {
  GAME.wave = w;
  GAME.waveActive = true;
  const hpScale = 1 + (w - 1) * 0.10;
  const dmgScale = 1 + (w - 1) * 0.045;
  const speedScale = 1 + Math.min(0.35, (w - 1) * 0.022);
  const queue = buildWave(w);
  GAME.spawnQueue = queue.map((type, i) => ({ type, hpScale, dmgScale, speedScale }));
  GAME.totalToSpawn = queue.length;
  GAME.spawnedThisWave = 0;
  GAME.spawnTimer = 0.15;
  GAME.objective = objectiveFor(w, queue);
  GAME.breather = 0;
  GAME.waveKillTarget = queue.length;
  GAME.waveKills = 0;

  ui.objective.textContent = GAME.objective;
  ui.wave.textContent = w;
  ui.waveBar.style.width = '0%';
  audio.waveStart();
  audio.setIntensity(clamp(0.25 + w * 0.08, 0, 1));

  const wi = $('waveIntro');
  $('wiNum').textContent = w;
  $('wiObj').textContent = GAME.objective;
  $('wiKick').textContent = w % 5 === 0 ? 'BOSS WAVE' : 'WAVE';
  wi.classList.remove('hidden');
  wi.querySelector('.wInt').style.animation = 'none';
  void wi.offsetWidth;
  wi.querySelector('.wInt').style.animation = '';
  setTimeout(() => { if (GAME.state !== 'title') wi.classList.add('hidden'); }, 2400);
}

function spawnPoint(minD = 15, maxD = 30) {
  for (let i = 0; i < 30; i++) {
    const a = rnd(0, TAU);
    const d = rnd(minD, maxD);
    const x = player.pos.x + Math.cos(a) * d;
    const z = player.pos.z + Math.sin(a) * d;
    if (Math.hypot(x, z) > 102) continue;
    if (terrainHeight(x, z) > 30) continue;
    return [x, z];
  }
  const a = rnd(0, TAU);
  return [Math.cos(a) * 55, Math.sin(a) * 55];
}

/* ================================================================ scoring */
function addKillScore(e) {
  const base = e.type.score;
  GAME.combo = Math.min(9.9, GAME.combo + 0.18);
  GAME.comboTimer = 4.0;
  GAME.bestCombo = Math.max(GAME.bestCombo, GAME.combo);
  const gained = Math.round(base * GAME.combo);
  GAME.score += gained;
  GAME.kills++;
  GAME.waveKills = (GAME.waveKills || 0) + 1;
  ui.score.textContent = GAME.score.toLocaleString('en-AU');
  ui.combo.textContent = 'x' + GAME.combo.toFixed(1);
  ui.combo.classList.add('pop');
  setTimeout(() => ui.combo.classList.remove('pop'), 110);
  if (e.type.boss) showCallout('METALPEDE DOWN');
}

enemies.onKill = (e) => {
  addKillScore(e);
  // drops
  const r = rng();
  if (e.type.boss) {
    for (let i = 0; i < 4; i++) pickups.spawn(e.pos.x + rnd(-2, 2), e.pos.z + rnd(-2, 2), i < 2 ? 'health' : 'ammo');
  } else if (r < 0.14) {
    pickups.spawn(e.pos.x, e.pos.z, 'health');
  } else if (r < 0.34) {
    pickups.spawn(e.pos.x, e.pos.z, 'ammo');
  }
};

/* ================================================================ run lifecycle */
function resetRun() {
  GAME.state = 'playing';
  GAME.wave = 0; GAME.score = 0; GAME.kills = 0; GAME.headshots = 0;
  GAME.combo = 1; GAME.comboTimer = 0; GAME.bestCombo = 1;
  GAME.time = 0; GAME.waveActive = false; GAME.spawnQueue = []; GAME.breather = 0;
  GAME.shotsFired = 0; GAME.shotsHit = 0;

  enemies.clear();
  pickups.clear();
  grenades.length = 0;

  player.alive = true;
  player.hp = player.maxHp;
  player.pos.set(0, terrainHeight(0, 0), 0);
  player.vel.set(0, 0, 0);
  player.vy = 0;
  player.camYaw = Math.PI; player.camPitch = -0.05;
  player.yaw = Math.PI;
  player.recoilPitch = 0; player.recoilYaw = 0;
  player.knock.set(0, 0, 0);

  weapons.index = 0;
  weapons.state = WEAPONS.map(w => ({ mag: w.mag, reserve: w.reserve }));
  weapons.reloading = false;
  weapons.bloom = 0;
  weapons.syncModel();

  GAME.runStart = performance.now();
  startWave(1);
  syncAmmoUI();
  ui.score.textContent = '0';
  ui.combo.textContent = 'x1.0';
  ui.bestScore.textContent = 'BEST ' + save.bestScore.toLocaleString('en-AU');
}

function endRun() {
  GAME.state = 'dead';
  audio.gameOver();
  const acc = GAME.shotsFired ? Math.round(GAME.shotsHit / GAME.shotsFired * 100) : 0;
  $('dWave').textContent = GAME.wave;
  $('dScore').textContent = GAME.score.toLocaleString('en-AU');
  $('dKills').textContent = GAME.kills;
  $('dAcc').textContent = acc + '%';
  $('dCombo').textContent = 'x' + GAME.bestCombo.toFixed(1);
  $('dHead').textContent = GAME.headshots;

  let newBest = false;
  if (GAME.score > save.bestScore) { save.bestScore = GAME.score; newBest = true; }
  if (GAME.wave > save.bestWave) { save.bestWave = GAME.wave; newBest = true; }
  save.kills += GAME.kills;
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch { }
  $('newBest').classList.toggle('hidden', !newBest);
  $('death').classList.remove('hidden');
  ui.hud.classList.add('hidden');
  document.exitPointerLock?.();
}

function togglePause() {
  if (GAME.state === 'playing') {
    GAME.state = 'paused';
    $('pause').classList.remove('hidden');
    $('pWave').textContent = GAME.wave;
    $('pScore').textContent = GAME.score.toLocaleString('en-AU');
    const acc = GAME.shotsFired ? Math.round(GAME.shotsHit / GAME.shotsFired * 100) : 0;
    $('pAcc').textContent = acc + '%';
    $('pKills').textContent = GAME.kills;
    document.exitPointerLock?.();
  } else if (GAME.state === 'paused') {
    GAME.state = 'playing';
    $('pause').classList.add('hidden');
  }
}

/* ================================================================ buttons */
$('btnStart').addEventListener('click', () => {
  audio.init();
  audio.resume();
  $('title').classList.add('hidden');
  ui.hud.classList.remove('hidden');
  resetRun();
  if (isTouch() && window.innerHeight > window.innerWidth) showRotate();
});
$('btnResume').addEventListener('click', togglePause);
$('btnQuit').addEventListener('click', () => {
  GAME.state = 'title';
  $('pause').classList.add('hidden');
  ui.hud.classList.add('hidden');
  enemies.clear(); pickups.clear();
  $('title').classList.remove('hidden');
  refreshTitleStats();
  audio.setIntensity(0);
});
$('btnRetry').addEventListener('click', () => {
  $('death').classList.add('hidden');
  ui.hud.classList.remove('hidden');
  resetRun();
});
$('btnMenu').addEventListener('click', () => {
  $('death').classList.add('hidden');
  $('title').classList.remove('hidden');
  refreshTitleStats();
});
$('btnPause').addEventListener('pointerdown', (e) => { e.preventDefault(); togglePause(); });

function refreshTitleStats() {
  $('tBestWave').textContent = save.bestWave || '0';
  $('tBestScore').textContent = save.bestScore ? save.bestScore.toLocaleString('en-AU') : '0';
  $('tKills').textContent = save.kills ? save.kills.toLocaleString('en-AU') : '0';
}
refreshTitleStats();

$('sens').addEventListener('input', (e) => { sensitivity = parseFloat(e.target.value); });
$('quality').addEventListener('change', (e) => {
  QUALITY = e.target.value;
  renderer.setPixelRatio(pixelRatioFor(QUALITY));
  resize();
});
$('snd').addEventListener('change', (e) => {
  audio.init();
  audio.setEnabled(e.target.value === 'on');
});

/* ================================================================ rotate */
function isTouch() { return 'ontouchstart' in window || navigator.maxTouchPoints > 0; }
function showRotate() { $('rotate').classList.remove('hidden'); }
function checkOrientation() {
  if (!isTouch()) { $('rotate').classList.add('hidden'); return; }
  const portrait = window.innerHeight > window.innerWidth * 1.06;
  if (portrait && GAME.state === 'playing') showRotate();
  else $('rotate').classList.add('hidden');
}
window.addEventListener('resize', checkOrientation);
window.addEventListener('orientationchange', () => setTimeout(checkOrientation, 200));

/* ================================================================ grenades */
const grenadeMeshGeo = new THREE.SphereGeometry(0.16, 6, 5);
const grenadeMeshMat = new THREE.MeshLambertMaterial({ color: 0xc8301f, emissive: 0x8a1a08, emissiveIntensity: 0.8 });
for (let i = 0; i < 12; i++) {
  const m = new THREE.Mesh(grenadeMeshGeo, grenadeMeshMat);
  m.visible = false;
  scene.add(m);
  grenades.push({ free: true, mesh: m });
}
const grenadePool = grenades.splice(0, 12);
const activeGrenades = [];

function spawnGrenade(pos, vel, ex, dmg) {
  const slot = grenadePool.find(g => g.free);
  if (!slot) return;
  slot.free = false;
  slot.mesh.visible = true;
  slot.pos = pos.clone();
  slot.prev = pos.clone();
  slot.vel = vel.clone();
  slot.life = 4;
  slot.ex = ex;
  slot.dmg = dmg;
  activeGrenades.push(slot);
}

function updateGrenades(dt) {
  for (let i = activeGrenades.length - 1; i >= 0; i--) {
    const g = activeGrenades[i];
    g.life -= dt;
    g.prev.copy(g.pos);
    g.vel.y -= g.ex.gravity * dt;
    g.pos.addScaledVector(g.vel, dt);
    g.mesh.position.copy(g.pos);
    g.mesh.rotation.x += dt * 8;
    g.mesh.rotation.z += dt * 5;

    let boom = g.life <= 0;
    // enemy contact
    for (const e of enemies.list) {
      if (!e.alive) continue;
      const dx = e.pos.x - g.pos.x, dz = e.pos.z - g.pos.z;
      const dy = e.pos.y + e.type.height * 0.5 - g.pos.y;
      if (dx * dx + dz * dz < (e.type.radius + 0.35) ** 2 && Math.abs(dy) < e.type.height * 0.6) { boom = true; break; }
    }
    if (!boom && g.pos.y < terrainHeight(g.pos.x, g.pos.z) + 0.12) boom = true;

    if (boom) {
      enemies.explode(g.pos.clone(), g.ex.dmg ? g.ex.dmg : g.ex.radius, g.dmg, g.ex.falloff);
      g.free = true;
      g.mesh.visible = false;
      activeGrenades.splice(i, 1);
    }
  }
}
// route weapon spawns into the grenade pool
weapons.ctx.spawnProjectile = (pos, vel, ex, dmg) => {
  spawnGrenade(pos, vel, ex, dmg);
  audio.shot('bomber', 0);
};

/* ================================================================ loop */
let last = performance.now();
let fpsAcc = 0, fpsN = 0, lowFpsTime = 0, adapted = false;

function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.08) dt = 0.08;
  if (dt <= 0) return;

  // fps guard
  fpsAcc += dt; fpsN++;
  if (fpsAcc > 1.5) {
    const fps = fpsN / fpsAcc;
    fpsAcc = 0; fpsN = 0;
    if (GAME.state === 'playing') {
      if (fps < 42 && !adapted && QUALITY !== 'fast') {
        lowFpsTime += 1.5;
        if (lowFpsTime > 3) { adapted = true; renderer.setPixelRatio(pixelRatioFor('fast')); resize(); }
      } else lowFpsTime = 0;
    }
  }

  if (GAME.state === 'playing' || GAME.state === 'dead') GAME.time += dt;

  // ---------- input assembly
  if (GAME.state === 'playing') {
    // keyboard movement fallback
    if (keys['KeyW']) input.my = 1;
    else if (keys['KeyS']) input.my = -1;
    if (keys['KeyA']) input.mx = -1;
    else if (keys['KeyD']) input.mx = 1;
    if (!keys['KeyW'] && !keys['KeyS'] && stickId === null && !keys['KeyA'] && !keys['KeyD']) {
      // stick already zeroes these; don't fight the touch stick
    }
    input.jump = input.jumpQueued || keys['Space'];
    input.jumpQueued = false;
    input.dodge = input.dodgeQueued || keys['KeyC'];
    input.dodgeQueued = false;
    player.aim = input.aim || keys['ShiftLeft'] || false;

    player.model.root.updateMatrixWorld(true);
    player.update(dt, input);
    input.lookX = 0; input.lookY = 0;

    // ---------- weapons
    weapons.update(dt);
    if ((input.fireHeld || mouseDown) && GAME.state === 'playing') {
      weapons.fire(camera);
    }

    // ---------- waves
    updateWaves(dt);

    // ---------- enemies
    enemies.update(dt, GAME.time);
    updateGrenades(dt);
    pickups.update(dt, GAME.time, player);

    // combo decay
    if (GAME.comboTimer > 0) {
      GAME.comboTimer -= dt;
      if (GAME.comboTimer <= 0) {
        GAME.combo = 1;
        ui.combo.textContent = 'x1.0';
      }
    }

    // shake decay handled in player

    if (!player.alive && GAME.state === 'playing') {
      setTimeout(endRun, 700);
      GAME.state = 'dying';
      player.model.body.rotation.x = 1.2;
    }
  } else if (GAME.state === 'title') {
    // slow orbit of the dais behind the title
    GAME.time += dt * 0.4;
    const a = GAME.time * 0.09 + Math.PI * 0.72;
    const ty = terrainHeight(0, 0);
    camera.position.set(Math.cos(a) * 30, ty + 13.5, Math.sin(a) * 30);
    camera.lookAt(0, ty + 3.0, 0);
    input.mx = 0; input.my = 0;
  }

  if (GAME.state === 'playing' || GAME.state === 'dying' || GAME.state === 'dead') {
    player.applyToCamera(camera);
    camera.fov = damp(camera.fov, player.aim ? 52 : (window.innerHeight > window.innerWidth ? 78 : 70), 9, dt);
    camera.updateProjectionMatrix();
  }

  world.update(dt, GAME.time, player.pos, camera);
  fx.update(dt);
  renderer.render(scene, camera);

  if (GAME.state === 'playing' || GAME.state === 'dying') updateHud();
}

function updateWaves(dt) {
  if (!GAME.waveActive) {
    // between waves: count the breather down and start the next wave
    if (GAME.breather > 0) {
      GAME.breather -= dt;
      if (GAME.breather <= 0) startWave(GAME.wave + 1);
    }
    return;
  }

  // drip spawns
  if (GAME.spawnQueue.length) {
    GAME.spawnTimer -= dt;
    if (GAME.spawnTimer <= 0) {
      const spec = GAME.spawnQueue.shift();
      const [x, z] = spawnPoint();
      enemies.spawn(spec.type, x, z, spec);
      GAME.spawnedThisWave++;
      GAME.spawnTimer = clamp(0.52 - GAME.wave * 0.015, 0.16, 0.6);
      ui.waveBar.style.width = Math.round((GAME.spawnedThisWave / GAME.totalToSpawn) * 30) + '%';
    }
  }

  const aliveCount = enemies.count;
  if (GAME.spawnQueue.length === 0) {
    if (aliveCount === 0) {
      // wave cleared
      GAME.waveActive = false;
      GAME.breather = 7.0;
      audio.waveClear();
      showCallout('WAVE CLEARED');
      const bonus = 250 * GAME.wave;
      GAME.score += bonus;
      ui.score.textContent = GAME.score.toLocaleString('en-AU');
      $('waveIntro').classList.add('hidden');
      // supply drops near the player
      for (let i = 0; i < 2 + Math.min(3, Math.floor(GAME.wave / 2)); i++) {
        const a = rnd(0, TAU), r = rnd(3, 9);
        pickups.spawn(player.pos.x + Math.cos(a) * r, player.pos.z + Math.sin(a) * r, i % 2 ? 'health' : 'ammo');
      }
      // health trickle
      player.heal(12);
    } else {
      const done = GAME.waveKillTarget ? (GAME.waveKillTarget - aliveCount) / GAME.waveKillTarget : 0;
      ui.waveBar.style.width = Math.round(30 + clamp(done, 0, 1) * 70) + '%';
    }
  }
}

function updateHud() {
  const hpPct = clamp(player.hp / player.maxHp, 0, 1);
  ui.healthFill.style.width = (hpPct * 100) + '%';
  ui.healthFill.style.background = hpPct > 0.5
    ? 'linear-gradient(90deg,#37e0c8,#7cf0a8)'
    : hpPct > 0.25
      ? 'linear-gradient(90deg,#e2a13c,#ffd166)'
      : 'linear-gradient(90deg,#c8301f,#ff7a4a)';
  ui.healthNum.textContent = Math.ceil(player.hp);
  ui.bloodEdge.style.opacity = String(clamp(1 - hpPct / 0.55, 0, 0.95) * 0.85);

  // crosshair spread follows bloom
  const spread = weapons.spreadDeg;
  const px = 6 + spread * 3.4;
  document.querySelector('.ch-t').style.transform = `translateY(${-px * 0.35}px)`;
  document.querySelector('.ch-b').style.transform = `translateY(${px * 0.35}px)`;
  document.querySelector('.ch-l').style.transform = `translateX(${-px * 0.35}px)`;
  document.querySelector('.ch-r').style.transform = `translateX(${px * 0.35}px)`;
  ui.crosshair.classList.toggle('hot', spread > weapons.def.spread + 0.6);

  const s = weapons.ammo;
  ui.mag.textContent = s.mag;
  ui.res.textContent = s.reserve === Infinity ? '∞' : s.reserve;
  ui.ammoRow.classList.toggle('low', s.mag <= Math.max(1, weapons.def.mag * 0.25));

  if (weapons.reloading) {
    ui.reloadRing.classList.remove('hidden');
    const k = clamp(weapons.reloadT / weapons.def.reload, 0, 1);
    ui.reloadRing.querySelector('circle').style.strokeDashoffset = String(107 * (1 - k));
  } else {
    ui.reloadRing.classList.add('hidden');
  }
}

/* ================================================================ boot */
$('loader').classList.add('hidden');
$('title').classList.remove('hidden');
checkOrientation();

// keep the background scene alive on the title screen
requestAnimationFrame((t) => { last = t; frame(t); });

/* ================================================================ phone behaviour */
document.addEventListener('visibilitychange', () => {
  if (document.hidden && GAME.state === 'playing') togglePause();
});
// iOS needs the audio context resumed inside a gesture
['pointerdown', 'touchstart'].forEach((ev) => {
  window.addEventListener(ev, () => { audio.resume(); }, { passive: true });
});
// block iOS pinch-zoom and double-tap zoom
document.addEventListener('gesturestart', (e) => e.preventDefault());
let lastTap = 0;
document.addEventListener('touchend', (e) => {
  const now = Date.now();
  if (now - lastTap < 290) e.preventDefault();
  lastTap = now;
}, { passive: false });

/* ================================================================ debug hook (harmless in prod) */
window.__dbg = { GAME, player, enemies, weapons, fx, input, camera, scene, renderer, world, audio, pickups };
if ('serviceWorker' in navigator) {
  const isLocal = ['127.0.0.1', 'localhost', '0.0.0.0'].includes(location.hostname);
  if (!isLocal) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => { });
    });
  }
}
