import * as THREE from 'three';
import {
  clamp, lerp, damp, rnd, rng, pick, terrainHeight, TAU, radialSprite, Builder, waterLevel, RIVER,
  riverNearest, LAKE, RIVER_W, waterDist, ARENA_R, trailDist, TRAIL
} from './core.js';
import { World } from './world.js';
import { Player } from './player.js';
import { FX } from './fx.js';
import { Audio } from './audio.js';
import { WeaponSystem, WEAPONS } from './weapons.js';
import { Enemies, ENEMY_TYPES } from './enemies.js';
import { Wildlife } from './wildlife.js';

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
const camera = new THREE.PerspectiveCamera(70, 1, 0.3, 2200);
camera.position.set(0, 4, 8);

function resize() {
  const vv = window.visualViewport;
  const w = Math.round((vv && vv.width) || document.documentElement.clientWidth || window.innerWidth);
  const h = Math.round((vv && vv.height) || document.documentElement.clientHeight || window.innerHeight);
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  camera.aspect = w / h;
  camera.fov = h > w ? 78 : 62;
  camera.updateProjectionMatrix();
}
/* iOS reports a stale size for a moment after rotation, which leaves the canvas
   at the old aspect. Re-run the sizing a few times so it always lands right. */
function scheduleResize() {
  resize();
  [60, 160, 320, 640, 1100].forEach((ms) => setTimeout(resize, ms));
}
window.addEventListener('resize', scheduleResize);
window.addEventListener('orientationchange', scheduleResize);
if (window.visualViewport) window.visualViewport.addEventListener('resize', scheduleResize);
resize();

/* ================================================================ entities */
const audio = new Audio();
const world = new World(scene, QUALITY);
const player = new Player(scene, world);
const fx = new FX(scene, camera, QUALITY);
const enemies = new Enemies(scene, world, fx, audio, player);
const wildlife = new Wildlife(scene, world);

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
  /** pop: thrown up out of a kill, it falls, bounces once and settles */
  spawn(x, z, type, pop = false) {
    if (this.items.length > 20) this.items.shift();
    const a = rnd(0, TAU);
    this.items.push({
      x, z, type, t: rnd(0, TAU), alive: true, y: terrainHeight(x, z),
      h: pop ? 1.3 : 0.55, vy: pop ? rnd(4, 5.5) : 0, vx: pop ? Math.cos(a) * 1.6 : 0, vz: pop ? Math.sin(a) * 1.6 : 0,
      air: pop, bounced: false,
    });
  }
  update(dt, time, player) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.t += dt;
      if (it.air) {
        it.vy -= 18 * dt; it.h += it.vy * dt;
        it.x += it.vx * dt; it.z += it.vz * dt;
        if (it.h <= 0.55 && it.vy < 0) {
          it.h = 0.55;
          if (!it.bounced) { it.bounced = true; it.vy *= -0.4; it.vx *= 0.5; it.vz *= 0.5; }
          else { it.air = false; it.vx = it.vz = 0; }
        }
      }
      if (!player.alive) continue;
      const dx = player.pos.x - it.x, dz = player.pos.z - it.z;
      const d = Math.hypot(dx, dz);
      const wanted = it.type === 'ammo' || player.hp < player.maxHp;
      // within reach it slides to you, faster as it closes
      if (wanted && !it.air && d < 5 && d > 0.01) {
        const sp = Math.min(d, (5 + (5 - d) * 4) * dt);
        it.x += (dx / d) * sp; it.z += (dz / d) * sp;
      }
      if (d < 1.5) {
        if (it.type === 'health') {
          if (player.hp >= player.maxHp) continue;
          player.heal(28);
          audio.pickup('health');
          fx.ecoBurst(new THREE.Vector3(it.x, it.y + 0.6, it.z), 0x37e0c8, 12, 1);
        } else {
          // used to call a hook nobody set, so crates gave nothing
          const got = weapons.refill();
          audio.pickup('ammo');
          fx.ecoBurst(new THREE.Vector3(it.x, it.y + 0.6, it.z), 0xf0b23c, 10, 1);
          if (got > 0) showToast('+AMMO');
        }
        this.items.splice(i, 1);
        continue;
      }
    }
    let hn = 0, an = 0;
    for (const it of this.items) {
      const y = terrainHeight(it.x, it.z) + it.h + (it.air ? 0 : Math.sin(it.t * 2.2) * 0.14);
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
  perks: [],             // names taken this run, in order
  drafting: false,
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

/** distance to the first hill or solid obstacle along a ray (Infinity if none within range) */
function wallDist(from, dir, range, minT = 0) {
  const g = worldHit(from, dir, range);
  const tg = g ? g.distanceTo(from) : Infinity;
  return Math.min(tg, world.rayObstacle(from, dir, Math.min(range, tg), minT));
}

const weapons = new WeaponSystem(scene, player, fx, audio, {
  enemies: () => enemies.list,
  raycast: (o, d, range, pierce) => enemies.raycast(o, d, range, pierce),
  worldHit,
  wallDist,
  applyDamage: (e, dmg, point, dir, head, def) => {
    enemies.hit(e, dmg, point, dir, head, def);
  },
  // one report per trigger pull: a scatter blast to the face is one headshot, not nine
  onShot: (hit, head) => { if (head) GAME.headshots++; },
  spawnProjectile: (pos, vel, ex, dmg) => {
    grenades.push({
      pos, vel, life: 4.5, dmg, ex,
      mesh: null
    });
  },
  // a blade connecting: a short freeze, longer on a finisher
  onMeleeHit: (n, finisher) => timeWarp(0.08, finisher ? 0.09 : 0.045),
  onAmmo: () => syncAmmoUI(),
});

/* ================================================================ UI */
const $ = (id) => document.getElementById(id);
weapons.onFired = () => audio.duck();
const ui = {
  hud: $('hud'), score: $('score'), wave: $('waveNum'), combo: $('combo'),
  healthFill: $('healthFill'), healthNum: $('healthNum'), waveBar: $('waveBar'),
  objective: $('objective'), gunName: $('gunName'), mag: $('ammoMag'), res: $('ammoRes'),
  ammoRow: $('ammoRow'), crosshair: $('crosshair'), hitmarker: $('hitmarker'),
  reloadRing: $('reloadRing'), callout: $('callout'), bloodEdge: $('bloodEdge'),
  bestScore: $('bestScore'), dmgArcs: $('dmgArcs'),
  comboBar: $('comboBar'), bossBar: $('bossBar'), bossFill: $('bossFill'), bossName: $('bossName'),
  toast: $('toast'), radar: $('radar'), draft: $('draft'),
};

/** accuracy over the run: pellets that hit (or blasts that hurt something) / pellets fired */
function accuracy() {
  return weapons.shotsFired ? Math.round(Math.min(1, weapons.shotsHit / weapons.shotsFired) * 100) : 0;
}

let toastTimer = 0;
function showToast(text) {
  ui.toast.textContent = text;
  ui.toast.classList.remove('show');
  void ui.toast.offsetWidth;
  ui.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ui.toast.classList.remove('show'), 900);
}

/* hit markers: the CSS existed but nothing ever triggered it. One restart per frame at most. */
let markerKind = null;        // null | 'hit' | 'head' | 'kill'
const MARK_RANK = { hit: 1, head: 2, kill: 3 };
enemies.onHit = (e, head, killed) => {
  const k = killed ? 'kill' : head ? 'head' : 'hit';
  if (!markerKind || MARK_RANK[k] > MARK_RANK[markerKind]) markerKind = k;
  if (killed) audio.killTick();
};
function flushMarker() {
  if (!markerKind) return;
  const el = ui.hitmarker;
  el.className = '';
  void el.offsetWidth;
  el.className = 'show ' + markerKind;
  markerKind = null;
}
enemies.onEnrage = () => { showCallout('IRONCOIL ENRAGED'); audio.duck(); };

function syncAmmoUI() {
  const d = weapons.def, s = weapons.ammo;
  ui.gunName.textContent = d.name;
  ui.mag.textContent = s.mag;
  ui.res.textContent = s.reserve === Infinity ? '∞' : s.reserve;
  ui.ammoRow.classList.toggle('low', !d.melee && s.mag <= Math.max(1, weapons.magSize() * 0.25));
  ui.ammoRow.classList.toggle('melee', !!d.melee);     // blades have no ammunition to count
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
  const p = new THREE.Vector3(player.pos.x, player.pos.y + 0.1, player.pos.z);
  if (player.inWater > 0.05) {
    // wading: a splash and spray instead of dust
    if (audio.enabled) audio.splash();
    p.y += player.inWater;
    fx.puff(p, null, 0xe4f0f2, 0.35, 2, 0.45, 1.2);
    fx.spark(p, new THREE.Vector3(0, 1, 0), 0xdff4ff, 4, 2.5, 0.08, 0.35);
    return;
  }
  if (audio.enabled) audio.step();
  if (speed > 3) fx.puff(p, null, 0x8c7d5c, 0.28, 1, 0.55, 0.5);
};
player.onLand = (v) => {
  audio.land();
  fx.puff(new THREE.Vector3(player.pos.x, player.pos.y + 0.1, player.pos.z), null, 0xa5835c, 0.5, 3, 0.6, 1.2);
};
player.onJump = () => {
  audio.click(0, 0.14, 520);
  fx.puff(new THREE.Vector3(player.pos.x, player.pos.y + 0.06, player.pos.z), null, 0xa5835c, 0.32, 2, 0.45, 1.0);
};
player.onHurt = () => { audio.playerHurt(); };
player.onDodge = () => {
  audio.click(0, 0.2, 380);
  audio.step();
  fx.puff(new THREE.Vector3(player.pos.x, player.pos.y + 0.25, player.pos.z), null, 0xb08a62, 0.7, 5, 0.7, 2.4);
};
player.onDamageDir = (a) => damageArc(a);
player.onMode = (m) => {
  const p = new THREE.Vector3(player.pos.x, player.pos.y + 1.0, player.pos.z);
  if (m === 'light') {
    fx.ecoBurst(p, 0x6ef0ff, 26, 1.6);
    fx.ring(player.pos.clone().setY(player.pos.y + 0.15), 0x6ef0ff, 5, 0.6);
    audio.pickup('health');
  } else if (m === 'dark') {
    fx.ecoBurst(p, 0xc06bff, 30, 1.8);
    fx.ring(player.pos.clone().setY(player.pos.y + 0.15), 0xc06bff, 6, 0.7);
    audio.explosion(0.2);
  } else {
    fx.ecoBurst(p, 0xffd9a0, 10, 0.8);
  }
};

/** try to enter a form; gives audio/UI feedback when refused */
function tryMode(m) {
  if (GAME.state !== 'playing') return;
  if (player.mode === m) { player.endMode(); return; }
  if (player.activateMode(m)) {
    showCallout(m === 'light' ? 'LIGHT FORM' : 'DARK FORM');
  } else if (player.eco < 45 && player.modeT <= 0) {
    audio.click(0, 0.16, 300);
    showCallout('NEED CHARGE');
  }
}

/* ================================================================ input */
const input = {
  mx: 0, my: 0, lookX: 0, lookY: 0, jump: false, sprint: false,
  fireHeld: false, aim: false, jumpQueued: false, jumpHeld: false, jumpHeldTouch: false, dodge: false, dodgeQueued: false,
};
let sensitivity = 1;

const stickZone = $('stickZone');
const lookZone = $('lookZone');
const stick = $('stick');
const knob = $('stickKnob');
let stickCX = 0, stickCY = 0;

function setStickBase(x, y) {
  stick.style.left = (x - 48) + 'px';
  stick.style.top = (y - 48) + 'px';
  stick.style.bottom = 'auto';
}
function resetStickVisual() {
  stick.classList.remove('active');
  knob.style.transform = 'translate(0,0)';
  stick.style.left = 'calc(env(safe-area-inset-left,0px) + 34px)';
  stick.style.top = 'auto';
  stick.style.bottom = 'calc(env(safe-area-inset-bottom,0px) + 44px)';
}

/* One gesture layer that accepts pointer events OR plain touch events.
   iOS can hand us either (and can cancel a pointer stream mid-drag), so
   listening to only one of them leaves the stick dead or latched. */
function bindZone(el, handlers) {
  let id = null;
  let mode = null;             // 'pointer' | 'touch'
  let lastActivity = 0;

  const down = (pid, x, y, m) => {
    if (id !== null) return;
    id = pid; mode = m; lastActivity = performance.now();
    handlers.down(x, y);
  };
  const move = (pid, x, y, m) => {
    if (id === null || id !== pid || mode !== m) return;
    lastActivity = performance.now();
    handlers.move(x, y);
  };
  const up = (pid, m) => {
    if (id === null || (pid !== null && (id !== pid || mode !== m))) return;
    id = null; mode = null;
    handlers.up();
  };

  // safety net: a gesture that somehow never receives its release must not
  // leave the control latched for the rest of the run
  setInterval(() => {
    if (id !== null && performance.now() - lastActivity > 3000) { id = null; mode = null; handlers.up(); }
  }, 1000);

  el.addEventListener('pointerdown', (e) => {
    if (GAME.state !== 'playing') return;
    e.preventDefault();
    try { el.setPointerCapture(e.pointerId); } catch { }
    down(e.pointerId, e.clientX, e.clientY, 'pointer');
  });
  el.addEventListener('pointermove', (e) => {
    if (mode !== 'pointer') return;
    move(e.pointerId, e.clientX, e.clientY, 'pointer');
  });
  const pUp = (e) => up(e.pointerId, 'pointer');
  el.addEventListener('pointerup', pUp);
  el.addEventListener('pointercancel', pUp);

  el.addEventListener('touchstart', (e) => {
    if (GAME.state !== 'playing') return;
    // a new finger with no pointer stream behind it means any previous gesture
    // is stale (iOS cancels pointer streams); clear it rather than ignore the touch
    if (e.touches.length === 1 && id !== null) { id = null; mode = null; handlers.up(); }
    if (mode === 'pointer') return;          // pointer path already owns it
    e.preventDefault();
    const t = e.changedTouches[0];
    if (t) down(t.identifier, t.clientX, t.clientY, 'touch');
  }, { passive: false });
  el.addEventListener('touchmove', (e) => {
    if (mode !== 'touch') return;
    const t = Array.from(e.changedTouches).find((c) => c.identifier === id);
    if (!t) return;
    e.preventDefault();
    move(t.identifier, t.clientX, t.clientY, 'touch');
  }, { passive: false });
  const tUp = (e) => {
    const list = Array.from(e.changedTouches || []);
    const t = list.find((c) => c.identifier === id);
    // clear if our finger ended, or if no fingers are left at all — a gesture that
    // began on the pointer path must also release when the touch stream ends
    if (t || !e.touches || e.touches.length === 0) {
      if (id !== null) { id = null; mode = null; handlers.up(); }
    }
  };
  el.addEventListener('touchend', tUp);
  el.addEventListener('touchcancel', tUp);

  // never let a gesture latch if the release lands somewhere else
  window.addEventListener('pointerup', pUp);
  window.addEventListener('pointercancel', pUp);
  window.addEventListener('touchend', tUp);
  window.addEventListener('touchcancel', tUp);
  window.addEventListener('blur', () => { id = null; mode = null; handlers.up(); });
}

bindZone(stickZone, {
  down(x, y) {
    stickCX = x; stickCY = y;
    stick.classList.add('active');
    setStickBase(x, y);
    knob.style.transform = 'translate(0,0)';
    input.mx = 0; input.my = 0;
  },
  move(x, y) {
    const dx = x - stickCX, dy = y - stickCY;
    const max = 52;
    const len = Math.hypot(dx, dy);
    const k = len > max ? max / len : 1;
    knob.style.transform = `translate(${dx * k}px,${dy * k}px)`;
    // deadzone so a resting thumb never drifts, rescaled so it still reaches full tilt
    let nx = (dx * k) / max, ny = (dy * k) / max;
    const mag = Math.hypot(nx, ny);
    const dead = 0.16;
    if (mag > dead) {
      const scale = ((mag - dead) / (1 - dead)) / mag;
      nx *= scale; ny *= scale;
    } else { nx = 0; ny = 0; }
    input.mx = clamp(nx, -1, 1);
    input.my = clamp(-ny, -1, 1);
    input.sprint = mag > 0.93;
  },
  up() {
    input.mx = 0; input.my = 0; input.sprint = false;
    resetStickVisual();
  },
});

/* look drag */
let lastLX = 0, lastLY = 0;
bindZone(lookZone, {
  down(x, y) { lastLX = x; lastLY = y; },
  move(x, y) {
    const dx = x - lastLX, dy = y - lastLY;
    lastLX = x; lastLY = y;
    input.lookX += dx * 0.0034 * sensitivity * invX * (player.aim ? 0.62 : 1);
    input.lookY += dy * 0.0034 * sensitivity * invY * (player.aim ? 0.62 : 1);
  },
  up() { },
});

/* buttons — accept pointer OR touch, without double-firing on the same tap */
function onPress(el, fn) {
  // one tap can arrive as both a pointerdown and a touchstart: drop the second of a
  // pair of DIFFERENT types close together, but never a genuine quick second tap
  let lastT = 0, lastType = '';
  const fire = (e) => {
    if (e.cancelable) e.preventDefault();
    e.stopPropagation();
    const now = performance.now();
    const kind = e.type === 'touchstart' ? 'touch' : 'pointer';
    if (kind !== lastType && now - lastT < 400) return;
    lastT = now; lastType = kind;
    fn(e);
  };
  el.addEventListener('pointerdown', fire);
  el.addEventListener('touchstart', fire, { passive: false });
}

function bindHold(el, onDown, onUp) {
  let held = false;
  const down = (e) => {
    if (e.cancelable) e.preventDefault();
    e.stopPropagation();
    if (held) return;
    held = true;
    onDown();
    el.classList.add('on');
  };
  const up = (e) => {
    if (e && e.cancelable) e.preventDefault();
    if (!held) return;
    held = false;
    el.classList.remove('on');
    if (onUp) onUp();
  };
  el.addEventListener('pointerdown', down);
  el.addEventListener('touchstart', down, { passive: false });
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('pointerleave', up);
  el.addEventListener('touchend', up, { passive: false });
  el.addEventListener('touchcancel', up);
  window.addEventListener('blur', () => { if (held) up(); });
}
bindHold($('btnFire'), () => { input.fireHeld = true; }, () => { input.fireHeld = false; });
bindHold($('btnJump'), () => { input.jumpQueued = true; input.jumpHeldTouch = true; }, () => { input.jumpHeldTouch = false; });
bindHold($('btnDodge'), () => { input.dodgeQueued = true; });
onPress($('btnLight'), () => tryMode('light'));
onPress($('btnDark'), () => tryMode('dark'));
onPress($('btnReload'), () => weapons.tryReload());
onPress($('btnAim'), () => setAim(!input.aim));
document.querySelectorAll('.wslot').forEach((b) => {
  onPress(b, () => weapons.switchTo(parseInt(b.dataset.w, 10)));
});
// the AIM toggle survives across runs otherwise
function setAim(on) { input.aim = on; $('btnAim').classList.toggle('on', on); }

/* keyboard + mouse for testing on desktop */
const keys = {};
window.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (GAME.drafting && /^Digit[123]$/.test(e.code)) { pickPerk(+e.code.slice(5) - 1); return; }
  if (e.code === 'KeyR') weapons.tryReload();
  if (e.code === 'KeyQ') weapons.next();
  if (e.code === 'Digit1') weapons.switchTo(0);
  if (e.code === 'Digit2') weapons.switchTo(1);
  if (e.code === 'Digit3') weapons.switchTo(2);
  if (e.code === 'Digit4') weapons.switchTo(3);
  if (e.code === 'KeyL') tryMode('light');
  if (e.code === 'KeyK') tryMode('dark');
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
    input.lookX += e.movementX * 0.0022 * sensitivity * invX * (player.aim ? 0.62 : 1);
    input.lookY += e.movementY * 0.0022 * sensitivity * invY * (player.aim ? 0.62 : 1);
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
  if (w % 5 === 0) return 'KILL THE IRONCOIL';
  const brutes = queue.filter(x => x === 'brute').length;
  if (brutes >= 2) return 'BREAK THE BRUTES';
  const shooters = queue.filter(x => x === 'shooter').length;
  if (shooters >= 3) return 'SILENCE THE MARKSMEN';
  const wasps = queue.filter(x => x === 'wasp').length;
  if (wasps >= 3) return 'SWAT THE STINGERS';
  return 'ELIMINATE ALL HOSTILES';
}

let waveIntroTimer = 0;
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
  audio.setMusicIntensity(clamp(0.15 + w * 0.12, 0, 1));
  audio.setMood(w % 5 === 0 ? 'boss' : 'combat');

  const wi = $('waveIntro');
  $('wiNum').textContent = w;
  $('wiObj').textContent = GAME.objective;
  $('wiKick').textContent = w % 5 === 0 ? 'BOSS WAVE' : 'WAVE';
  wi.classList.remove('hidden');
  wi.querySelector('.wInt').style.animation = 'none';
  void wi.offsetWidth;
  wi.querySelector('.wInt').style.animation = '';
  clearTimeout(waveIntroTimer);   // a stale timer from the last wave used to cut this one short
  waveIntroTimer = setTimeout(() => wi.classList.add('hidden'), 2400);
}

function spawnPoint(minD = 15, maxD = 30) {
  for (let i = 0; i < 30; i++) {
    const a = rnd(0, TAU);
    const d = rnd(minD, maxD);
    const x = player.pos.x + Math.cos(a) * d;
    const z = player.pos.z + Math.sin(a) * d;
    if (Math.hypot(x, z) > 102) continue;
    if (terrainHeight(x, z) > 30) continue;
    // never drop an enemy inside the dais, a pillar or a wreck
    let blocked = false;
    for (let k = 0; k < world.obstacles.length; k++) {
      const o = world.obstacles[k];
      if (Math.hypot(x - o.x, z - o.z) < o.r + 1.2) { blocked = true; break; }
    }
    if (blocked) continue;
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
  if (e.type.boss) showCallout('IRONCOIL DOWN');
}

/* time warp: a tiny freeze on every kill (hit-stop), slow motion for the boss */
const warp = { t: 0, scale: 1 };
function timeWarp(scale, dur) {
  if (warp.t <= 0 || scale <= warp.scale) { warp.scale = scale; warp.t = Math.max(warp.t, dur); }
}
const STREAKS = { 2: 'DOUBLE KILL', 3: 'TRIPLE KILL', 5: 'RAMPAGE', 8: 'UNSTOPPABLE', 12: 'UNTOUCHABLE' };
let streak = 0, lastKillT = -9;

enemies.onKill = (e) => {
  addKillScore(e);
  if (GAME.mode === 'wander' && GAME.kills % 6 === 0 && !GAME.drafting) setTimeout(() => { if (GAME.state === 'playing') openDraft(); }, 600);
  if (e.type.boss) timeWarp(0.22, 1.6);
  else timeWarp(0.06, 0.05);
  streak = GAME.time - lastKillT < 1.4 ? streak + 1 : 1;
  lastKillT = GAME.time;
  if (STREAKS[streak]) {
    GAME.score += 60 * streak;
    ui.score.textContent = GAME.score.toLocaleString('en-AU');
    showCallout(STREAKS[streak]);
    audio.streak(streak);
  }
  player.addEco((e.type.boss ? 40 : 7) * RUN.charge);
  if (RUN.leech) player.heal(RUN.leech);
  // drops
  const r = rng() / RUN.scav;
  if (e.type.boss) {
    for (let i = 0; i < 4; i++) pickups.spawn(e.pos.x + rnd(-2, 2), e.pos.z + rnd(-2, 2), i < 2 ? 'health' : 'ammo', true);
  } else if (r < 0.14) {
    pickups.spawn(e.pos.x, e.pos.z, 'health', true);
  } else if (r < 0.34) {
    pickups.spawn(e.pos.x, e.pos.z, 'ammo', true);
  }
};

/* ================================================================ run lifecycle */
/* ================================================================ perks
   After every cleared wave you pick one of three. They stack. */
const RUN = { charge: 1, scav: 1, leech: 0 };
const PERKS = [
  { id: 'hide', name: 'THICK HIDE', desc: '+25 max health, fully healed', apply() { player.maxHp += 25; player.hp = player.maxHp; } },
  { id: 'hot', name: 'KEEN EDGE', desc: '+15% damage with every weapon', apply() { weapons.mods.dmg *= 1.15; } },
  { id: 'reach', name: 'LONG REACH', desc: 'Blades reach 25% further and sweep wider', apply() { weapons.mods.reach *= 1.25; } },
  { id: 'hands', name: 'QUICK DRAW', desc: 'Spears and runes ready 25% faster', apply() { weapons.mods.reload *= 0.75; } },
  { id: 'mags', name: 'FULL QUIVER', desc: '+30% spears and runes per load', apply() { weapons.mods.mag *= 1.3; } },
  { id: 'steady', name: 'TRUE AIM', desc: '30% tighter throws and casts', apply() { weapons.mods.spread *= 0.7; } },
  { id: 'conduit', name: 'SPIRIT WELL', desc: '+60% charge from kills', apply() { RUN.charge *= 1.6; } },
  { id: 'burn', name: 'LONG BURN', desc: 'Light and Dark forms last 4 s longer', apply() { player.formDur += 4; } },
  { id: 'slip', name: 'SLIPSTREAM', desc: 'Dodge recovers twice as fast, longer immunity', apply() { player.dodgeCdBase *= 0.5; player.dodgeIframe += 0.15; } },
  { id: 'leech', name: 'BLOOD PRICE', desc: 'Every kill heals 3', apply() { RUN.leech += 3; } },
  { id: 'scav', name: 'SCAVENGER', desc: 'Kills drop supplies 70% more often', apply() { RUN.scav *= 1.7; } },
  { id: 'bang', name: 'WILDFIRE', desc: 'Fire rune blast radius +35%', apply() { weapons.mods.blast *= 1.35; } },
  { id: 'lance', name: 'IMPALER', desc: 'Spears pierce 2 more bodies', apply() { weapons.mods.pierce += 2; } },
  { id: 'wind', name: 'SECOND WIND', desc: 'Regenerate 1.2 health a second', apply() { player.regen += 1.2; } },
];
let draftChoices = [], draftOpenedAt = 0;
function openDraft() {
  const pool = PERKS.slice();
  draftChoices = [];
  while (draftChoices.length < 3 && pool.length) draftChoices.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  ui.draft.querySelectorAll('.card').forEach((c, i) => {
    const pk = draftChoices[i];
    c.querySelector('b').textContent = pk.name;
    c.querySelector('span').textContent = pk.desc;
    const n = GAME.perks.filter((x) => x === pk.name).length;
    c.querySelector('i').textContent = n ? 'TAKEN ×' + n : (i + 1);
  });
  GAME.drafting = true;
  draftOpenedAt = performance.now();
  ui.draft.classList.remove('hidden');
}
function pickPerk(i) {
  if (!GAME.drafting || !draftChoices[i]) return;
  if (performance.now() - draftOpenedAt < 450) return;   // a thumb still on FIRE must not pick by accident
  const pk = draftChoices[i];
  pk.apply();
  GAME.perks.push(pk.name);
  GAME.drafting = false;
  ui.draft.classList.add('hidden');
  GAME.breather = 3.5;
  showCallout(pk.name);
  audio.pickup('health');
  syncAmmoUI();
}
ui.draft.querySelectorAll('.card').forEach((c, i) => c.addEventListener('click', () => pickPerk(i)));

/** everything a run leaves lying around, cleared for the next one or for the title */
function clearField() {
  enemies.clear();
  pickups.clear();
  for (const g of activeGrenades) { g.free = true; g.mesh.visible = false; }
  activeGrenades.length = 0;
  player.endMode();
  setAim(false);
  input.fireHeld = false;
  GAME.drafting = false;
  ui.draft.classList.add('hidden');
  ui.bossBar.classList.add('hidden');
  clearTimeout(waveIntroTimer);
  $('waveIntro').classList.add('hidden');
}

/* ================================================================ wander mode
   The valley as an open world: no waves. A few sentinel patrols roam and leave
   you be until you come close or strike one; new patrols appear out of sight.
   Health returns while nothing hunts you, and an upgrade is offered every six kills. */
const PATROL_TARGET = 4;
const PATROLS = [['grunt', 'grunt'], ['shooter'], ['grunt', 'shooter'], ['brute'], ['wasp', 'wasp'], ['grunt', 'grunt', 'shooter']];
let patrolTimer = 0, patrolId = 0, calmT = 0;
function spawnPatrol() {
  for (let k = 0; k < 50; k++) {
    const a = rnd(0, TAU), r = rnd(24, ARENA_R - 10);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (Math.hypot(x - player.pos.x, z - player.pos.z) < 40) continue;   // never in your face
    if (!world.isClear(x, z, 2.2) || waterDist(x, z) < 2) continue;
    const lvl = GAME.kills / 25;                                          // the vale stiffens slowly
    patrolId++;
    for (const kind of pick(PATROLS)) {
      const e = enemies.spawn(kind, x + rnd(-3, 3), z + rnd(-3, 3), { hpScale: 1 + lvl * 0.15, dmgScale: 1 + lvl * 0.08 });
      e.passive = true; e.aggro = false; e.home = { x, z }; e.group = patrolId;
    }
    return true;
  }
  return false;
}
function startWander() {
  GAME.wave = 0; GAME.waveActive = false; GAME.breather = 0; GAME.spawnQueue = [];
  ui.wave.textContent = '';
  ui.objective.textContent = 'WANDER THE VALE';
  ui.waveBar.style.width = '0%';
  audio.setIntensity(0.15);
  audio.setMusicIntensity(0.5);
  audio.setMood('explore');
  for (let i = 0; i < 3; i++) spawnPatrol();
  patrolTimer = 20; calmT = 10;
}
function updateWander(dt) {
  const groups = new Set();
  let hunting = false;
  for (const e of enemies.list) {
    if (!e.alive) continue;
    if (e.passive) groups.add(e.group);
    if (e.aggro && Math.hypot(e.pos.x - player.pos.x, e.pos.z - player.pos.z) < 45) hunting = true;
  }
  patrolTimer -= dt;
  if (groups.size < PATROL_TARGET && patrolTimer <= 0) { spawnPatrol(); patrolTimer = 24; }
  calmT = hunting ? 0 : calmT + dt;
  audio.setMood(hunting ? 'combat' : calmT > 4 ? 'explore' : audio.nextMood);
  if (calmT > 5 && player.alive) player.heal(5 * dt);
  ui.objective.textContent = hunting ? 'SENTINELS HUNT YOU' : 'WANDER THE VALE';
}

/* the valley's sound follows you: river by distance and side, the cascade, wind up high */
const CASCADE = (() => { let k = 0; for (let i = 1; i < RIVER.length - 1; i++) if (RIVER[i - 1].wy - RIVER[i + 1].wy > 0.8) k = i; return RIVER[k]; })();
function updateAmbience(dt) {
  if (!audio.ctx) return;
  const L = GAME.state === 'title' ? camera.position : player.pos;
  const rn = riverNearest(L.x, L.z);
  const lakeD = Math.hypot(L.x - LAKE.x, L.z - LAKE.z) - LAKE.r;
  const useLake = lakeD < rn.d - RIVER_W;
  const wd = Math.max(0, useLake ? lakeD : rn.d - RIVER_W);
  const wx = useLake ? LAKE.x : RIVER[rn.i].x, wz = useLake ? LAKE.z : RIVER[rn.i].z;
  const m = camera.matrixWorld.elements;                     // camera right = column 0
  const side = (dx, dz) => { const l = Math.hypot(dx, dz) || 1; return (dx * m[0] + dz * m[2]) / l; };
  const cd = Math.hypot(L.x - CASCADE.x, L.z - CASCADE.z);
  let hunting = false;
  for (const e of enemies.list) if (e.alive && e.aggro) { hunting = true; break; }
  audio.setAmbience({
    river: Math.pow(clamp(1 - wd / 34, 0, 1), 1.6) * (useLake ? 0.55 : 1),
    riverPan: side(wx - L.x, wz - L.z) * clamp(wd / 4, 0, 1),
    roar: Math.pow(clamp(1 - cd / 75, 0, 1), 2),
    roarPan: side(CASCADE.x - L.x, CASCADE.z - L.z),
    wind: clamp((L.y - 2) / 22, 0, 1),
    birds: GAME.state === 'title' ? 0.8 : (hunting || (GAME.mode === 'trial' && GAME.waveActive)) ? 0.15
      : trailDist(L.x, L.z) < 14 ? 1.0 : 0.65,                 // the forest is livelier
  }, dt);
}

function resetRun(mode = GAME.mode || 'wander') {
  GAME.mode = mode;
  GAME.state = 'playing';
  GAME.wave = 0; GAME.score = 0; GAME.kills = 0; GAME.headshots = 0;
  GAME.combo = 1; GAME.comboTimer = 0; GAME.bestCombo = 1;
  GAME.time = 0; GAME.waveActive = false; GAME.spawnQueue = []; GAME.breather = 0;
  GAME.shotsFired = 0; GAME.shotsHit = 0;

  GAME.perks = [];
  clearField();
  RUN.charge = 1; RUN.scav = 1; RUN.leech = 0;
  weapons.mods = { dmg: 1, reload: 1, mag: 1, spread: 1, blast: 1, pierce: 0, reach: 1 };
  weapons.shotsFired = 0; weapons.shotsHit = 0;
  player.maxHp = 100; player.formDur = 9; player.dodgeCdBase = 0.8; player.dodgeIframe = 0.42; player.regen = 0;

  player.alive = true;
  player.hp = player.maxHp;
  player.iframe = 0; player.dodging = 0; player.model.body.rotation.set(0, 0, 0);
  const sp = world.pickSpawn();
  player.pos.set(sp[0], terrainHeight(sp[0], sp[1]), sp[1]);
  // face the monument from the spawn point
  player.camYaw = Math.atan2(-sp[0], -sp[1]);
  player.yaw = player.camYaw;
  player.vel.set(0, 0, 0);
  player.vy = 0;
  player.camPitch = -0.05;
  player.recoilPitch = 0; player.recoilYaw = 0;
  player.knock.set(0, 0, 0);
  player.endMode();
  player.eco = 0;

  weapons.index = 0;
  weapons.state = WEAPONS.map(w => ({ mag: w.mag, reserve: w.reserve }));
  weapons.reloading = false;
  weapons.bloom = 0;
  weapons.syncModel();

  GAME.runStart = performance.now();
  document.querySelector('.waveRow .lbl').textContent = GAME.mode === 'trial' ? 'WAVE' : 'THE VALE';
  if (GAME.mode === 'trial') startWave(1); else startWander();
  syncAmmoUI();
  ui.score.textContent = '0';
  ui.combo.textContent = 'x1.0';
  ui.bestScore.textContent = 'BEST ' + save.bestScore.toLocaleString('en-AU');
}

function endRun() {
  GAME.state = 'dead';
  audio.gameOver();
  audio.setMood('explore');
  ui.draft.classList.add('hidden'); GAME.drafting = false;
  const acc = accuracy();
  const secs = Math.round((performance.now() - GAME.runStart) / 1000);
  $('dTime').textContent = Math.floor(secs / 60) + ':' + String(secs % 60).padStart(2, '0');
  $('dUpg').textContent = GAME.perks.length;
  $('dPerks').textContent = GAME.perks.join(' · ');
  $('dWave').textContent = GAME.mode === 'trial' ? GAME.wave : '—';
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
    $('pAcc').textContent = accuracy() + '%';
    $('pKills').textContent = GAME.kills;
    document.exitPointerLock?.();
  } else if (GAME.state === 'paused') {
    GAME.state = 'playing';
    $('pause').classList.add('hidden');
  }
}

/* ================================================================ buttons */
function startMode(mode) {
  audio.init();
  audio.resume();
  audio.startMusic();
  $('title').classList.add('hidden');
  ui.hud.classList.remove('hidden');
  resetRun(mode);
  if (isTouch() && window.innerHeight > window.innerWidth) showRotate();
}
$('btnStart').addEventListener('click', () => startMode('wander'));
$('btnTrial').addEventListener('click', () => startMode('trial'));
$('btnResume').addEventListener('click', togglePause);
$('btnQuit').addEventListener('click', () => {
  GAME.state = 'title';
  $('pause').classList.add('hidden');
  ui.hud.classList.add('hidden');
  clearField();
  $('title').classList.remove('hidden');
  refreshTitleStats();
  audio.setIntensity(0);
  audio.setMood('explore');
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
onPress($('btnPause'), () => togglePause());

function refreshTitleStats() {
  $('tBestWave').textContent = save.bestWave || '0';
  $('tBestScore').textContent = save.bestScore ? save.bestScore.toLocaleString('en-AU') : '0';
  $('tKills').textContent = save.kills ? save.kills.toLocaleString('en-AU') : '0';
}
refreshTitleStats();

let invX = 1, invY = 1;
const BUILD = 'b24';
$('build').textContent = 'BUILD ' + BUILD;
/* settings are kept on the phone; they used to reset on every launch */
const SET_KEY = 'wasteland-trial-settings';
const settings = (() => { try { return JSON.parse(localStorage.getItem(SET_KEY) || '{}'); } catch { return {}; } })();
// v2 fixed the mirrored stick and look: any inversion saved to work around them
// would now come out backwards, so drop those once
if (settings.v !== 2) { delete settings.invX; delete settings.invMove; settings.v = 2; }
function saveSettings() { try { localStorage.setItem(SET_KEY, JSON.stringify(settings)); } catch { } }
const SETTERS = {
  sens: (v) => { sensitivity = parseFloat(v); },
  invX: (v) => { invX = parseFloat(v); },
  invY: (v) => { invY = parseFloat(v); },
  quality: (v) => { QUALITY = v; renderer.setPixelRatio(pixelRatioFor(QUALITY)); resize(); },
  snd: (v) => { audio.setEnabled(v === 'on'); },
};
for (const [id, set] of Object.entries(SETTERS)) {
  const el = $(id);
  if (settings[id] !== undefined) { el.value = settings[id]; set(el.value); }
  el.addEventListener(el.type === 'range' ? 'input' : 'change', () => {
    if (id === 'snd') audio.init();
    set(el.value);
    settings[id] = el.value;
    saveSettings();
  });
}

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
// the fire rune's orb: self-lit, trailing sparks (see updateGrenades)
const grenadeMeshGeo = new THREE.SphereGeometry(0.22, 10, 8);
const grenadeMeshMat = new THREE.MeshBasicMaterial({ color: 0xffb050, toneMapped: false });
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
  slot.bounced = false;
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
    g.mesh.scale.setScalar(1 + Math.sin(performance.now() * 0.03) * 0.15);
    fx.spark(g.pos, null, 0xffa040, 1, 1.2, 0.2, 0.3);

    let boom = g.life <= 0;
    // enemy contact
    for (const e of enemies.list) {
      if (!e.alive) continue;
      const dx = e.pos.x - g.pos.x, dz = e.pos.z - g.pos.z;
      const dy = e.pos.y + e.type.height * 0.5 - g.pos.y;
      if (dx * dx + dz * dz < (e.type.radius + 0.35) ** 2 && Math.abs(dy) < e.type.height * 0.6) { boom = true; break; }
    }
    const gy = terrainHeight(g.pos.x, g.pos.z) + 0.12;
    if (!boom && g.pos.y < gy) {
      // first touch skips off the ground; the second (or a short fuse) sets it off
      if (!g.bounced && g.ex.bounce !== false) {
        g.bounced = true; g.pos.y = gy;
        g.vel.y = Math.abs(g.vel.y) * 0.42; g.vel.x *= 0.62; g.vel.z *= 0.62;
        g.life = Math.min(g.life, 0.6);
        fx.puff(g.pos.clone(), null, 0xa5835c, 0.35, 2, 0.5, 1.2);
        audio.click(0, 0.14, 260);
      } else boom = true;
    }

    if (boom) {
      if (enemies.explode(g.pos.clone(), g.ex.radius, g.dmg, g.ex.falloff) > 0) weapons.shotsHit++;
      g.free = true;
      g.mesh.visible = false;
      activeGrenades.splice(i, 1);
    }
  }
}
// route weapon spawns into the grenade pool
weapons.ctx.spawnProjectile = (pos, vel, ex, dmg) => {
  spawnGrenade(pos, vel, ex, dmg);       // the weapon already played its own cast sound
};

/* ================================================================ loop */
let last = performance.now();
let kbMoving = false;
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

  // self-healing size guard: if the canvas ever drifts from the viewport
  // (iOS does this around rotation and toolbar changes), snap it back
  const vvw = window.visualViewport;
  const sw = Math.round((vvw && vvw.width) || window.innerWidth);
  const sh = Math.round((vvw && vvw.height) || window.innerHeight);
  if (Math.abs(renderer.domElement.clientWidth - sw) > 3 || Math.abs(renderer.domElement.clientHeight - sh) > 3) {
    resize();
  }

  if (warp.t > 0) { warp.t -= dt; dt *= warp.scale; if (warp.t <= 0) warp.scale = 1; }

  if (GAME.state === 'playing' || GAME.state === 'dead') GAME.time += dt;

  // ---------- input assembly
  if (GAME.state === 'playing') {
    // keyboard movement: level input, so releasing a key stops you (it used to latch)
    const kx = (keys['KeyD'] ? 1 : 0) - (keys['KeyA'] ? 1 : 0);
    const ky = (keys['KeyW'] ? 1 : 0) - (keys['KeyS'] ? 1 : 0);
    if (kx || ky) { input.mx = kx; input.my = ky; kbMoving = true; }
    else if (kbMoving) { input.mx = 0; input.my = 0; kbMoving = false; }
    input.jump = input.jumpQueued || keys['Space'];
    input.jumpHeld = input.jumpHeldTouch || !!keys['Space'];
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
    if (GAME.mode === 'trial') updateWaves(dt); else updateWander(dt);

    // ---------- enemies
    enemies.update(dt, GAME.time);
    updateGrenades(dt);
    pickups.update(dt, GAME.time, player);

    // combo decay
    if (GAME.comboTimer > 0 && !GAME.drafting) {
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
    const sprinting = input.sprint && Math.hypot(player.vel.x, player.vel.z) > 6;
    camera.fov = damp(camera.fov, player.aim ? 46 : (window.innerHeight > window.innerWidth ? 78 : 62) + (sprinting ? 7 : 0), 9, dt);
    camera.updateProjectionMatrix();
  }

  world.update(dt, GAME.time, player.pos, camera);
  wildlife.update(dt, GAME.time, player);
  updateAmbience(dt);
  fx.update(dt);
  renderer.render(scene, camera);

  if (GAME.state === 'playing' || GAME.state === 'dying') { updateHud(); updateRadar(); flushMarker(); }
  else if (ui.radar.childElementCount && radarShown) hideRadar();
}

function updateWaves(dt) {
  if (!GAME.waveActive) {
    // between waves: hold while the upgrade draft is open, then count down
    if (GAME.drafting) return;
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
      audio.setMood('explore');
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
      openDraft();
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

  // eco meter and form buttons
  const ecoPct = clamp(player.eco / player.maxEco, 0, 1);
  const ecoFill = document.getElementById('ecoFill');
  if (ecoFill) ecoFill.style.width = (ecoPct * 100) + '%';
  const ecoWrap = document.getElementById('ecoWrap');
  if (ecoWrap) ecoWrap.classList.toggle('full', player.eco >= 45);
  const ready = player.eco >= 45 && player.modeT <= 0;
  ['btnLight', 'btnDark'].forEach((id) => {
    const b = document.getElementById(id);
    if (!b) return;
    b.classList.toggle('ready', ready);
    b.classList.toggle('spent', player.modeT > 0);
  });

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
  ui.ammoRow.classList.toggle('low', s.mag <= Math.max(1, weapons.magSize() * 0.25));

  // the combo drains: show how long is left to keep the chain
  ui.comboBar.style.transform = `scaleX(${clamp(GAME.comboTimer / 4, 0, 1)})`;

  // boss health
  let boss = null;
  for (const e of enemies.list) if (e.alive && e.type.boss) { boss = e; break; }
  ui.bossBar.classList.toggle('hidden', !boss);
  if (boss) {
    ui.bossFill.style.transform = `scaleX(${clamp(boss.hp / boss.maxHp, 0, 1)})`;
    ui.bossBar.classList.toggle('enraged', !!boss.enraged);
  }

  if (weapons.reloading) {
    ui.reloadRing.classList.remove('hidden');
    const k = clamp(weapons.reloadT / weapons.reloadTime, 0, 1);
    ui.reloadRing.querySelector('circle').style.strokeDashoffset = String(107 * (1 - k));
  } else {
    ui.reloadRing.classList.add('hidden');
  }
}

/* ================================================================ threat radar
   Off-screen enemies get a pointer at the screen edge. On a phone the view is
   narrow; before this the first sign of a flanker was the damage arc. */
const RADAR_N = 12;
const radarEls = [];
for (let i = 0; i < RADAR_N; i++) {
  const el = document.createElement('div');
  el.className = 'thr';
  el.style.opacity = '0';
  ui.radar.appendChild(el);
  radarEls.push(el);
}
let radarShown = false;
const _rv = new THREE.Vector3(), _rv2 = new THREE.Vector3();
const RADAR_CLASS = { grunt: 'g', shooter: 's', brute: 'b', wasp: 'w', boss: 'x' };
function hideRadar() { radarEls.forEach((el) => { el.style.opacity = '0'; }); radarShown = false; }
function updateRadar() {
  const W = window.innerWidth, H = window.innerHeight;
  const cand = [];
  camera.updateMatrixWorld();
  for (const e of enemies.list) {
    if (!e.alive || e.state === 'spawn') continue;
    _rv.set(e.pos.x, e.pos.y + e.type.height * 0.6, e.pos.z).applyMatrix4(camera.matrixWorldInverse);
    const behind = _rv.z > -0.5;
    const ndc = _rv2.copy(_rv).applyMatrix4(camera.projectionMatrix);
    if (!behind && Math.abs(ndc.x) < 0.94 && Math.abs(ndc.y) < 0.9) continue;   // on screen: you can see it
    const d = Math.hypot(e.pos.x - player.pos.x, e.pos.z - player.pos.z);
    if (d > 45) continue;
    cand.push({ e, d, x: _rv.x, y: behind ? Math.min(_rv.y, 0) - 0.001 : _rv.y });
  }
  cand.sort((a, b) => a.d - b.d);
  const rx = W * 0.44, ry = H * 0.40;
  for (let i = 0; i < RADAR_N; i++) {
    const el = radarEls[i], c = cand[i];
    if (!c) { el.style.opacity = '0'; continue; }
    // direction on the screen plane; anything behind is pushed to the bottom edge
    const a = Math.atan2(c.x, c.y);
    const px = W / 2 + Math.sin(a) * rx, py = H / 2 - Math.cos(a) * ry;
    const near = clamp(1 - c.d / 45, 0, 1);
    const s = (c.e.type.boss ? 1.6 : 1) * (0.75 + near * 0.55);
    el.className = 'thr ' + RADAR_CLASS[c.e.key];
    el.style.transform = `translate(${px.toFixed(1)}px,${py.toFixed(1)}px) rotate(${a.toFixed(3)}rad) scale(${s.toFixed(2)})`;
    el.style.opacity = (0.35 + near * 0.65).toFixed(2);
  }
  radarShown = cand.length > 0;
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
  // the first touch anywhere starts the score, so the title screen has music too
  window.addEventListener(ev, () => { audio.init(); audio.resume(); audio.startMusic(); }, { passive: true });
});
// block iOS pinch-zoom and double-tap zoom
document.addEventListener('gesturestart', (e) => e.preventDefault());
let lastTap = 0;
document.addEventListener('touchend', (e) => {
  const now = Date.now();
  if (now - lastTap < 290) e.preventDefault();
  lastTap = now;
}, { passive: false });

/* ================================================================ crash reporting
   A thrown frame used to look like a frozen game. Now it says so, in the open. */
let crashShown = false;
function reportCrash(what) {
  if (crashShown) return;
  crashShown = true;
  document.getElementById('crashMsg').textContent = String(what).slice(0, 240);
  document.getElementById('crash').classList.remove('hidden');
}
window.addEventListener('error', (e) => {
  reportCrash((e.message || 'error') + ' @ ' + (e.filename || '').split('/').pop() + ':' + (e.lineno || 0));
});
window.addEventListener('unhandledrejection', (e) => {
  reportCrash('promise: ' + ((e.reason && (e.reason.message || e.reason)) || 'unknown'));
});
document.getElementById('crashReload').addEventListener('click', () => location.reload());

/* ================================================================ debug hook (harmless in prod) */
window.__dbg = { THREE, GAME, player, enemies, weapons, fx, input, camera, scene, renderer, world, audio, pickups, accuracy, PERKS, pickPerk, radarEls, terrainHeight, waterLevel, wildlife, startMode, TRAIL, riverPoint: RIVER[Math.floor(RIVER.length * 0.55)] };

// ?smoke=1 runs the scripted self-test (see js/smoke.js)
if (location.search.includes('smoke')) {
  import('./smoke.js').then((m) => m.runSmoke()).catch((e) => console.error(e));
}
if ('serviceWorker' in navigator) {
  const isLocal = ['127.0.0.1', 'localhost', '0.0.0.0'].includes(location.hostname);
  if (!isLocal) {
    // when a new build takes over, reload once so the phone never keeps showing
    // an old cached version after an update
    const hadController = !!navigator.serviceWorker.controller;
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (hadController && !reloaded) { reloaded = true; location.reload(); }
    });
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' })
        .then((reg) => { reg.update().catch(() => { }); })
        .catch(() => { });
    });
  }
}
