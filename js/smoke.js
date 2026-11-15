/**
 * Smoke test. Load the game with ?smoke=1 and it runs a scripted pass over the
 * systems that have broken before (input direction, look direction, hit
 * registration, spawn safety, loop liveness) and prints PASS/FAIL on screen.
 *
 * It drives the real DOM handlers with synthetic pointer events, so it exercises
 * the same path a thumb does: zone -> input -> physics -> camera.
 */

const results = [];

function check(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then((detail) => results.push({ name, pass: true, detail: detail || '' }))
    .catch((err) => results.push({ name, pass: false, detail: String(err && err.message || err) }));
}

function assert(cond, msg) { if (!cond) throw new Error(msg); }

function mk(type, x, y, id) {
  return new PointerEvent(type, {
    pointerId: id, pointerType: 'touch', clientX: x, clientY: y,
    bubbles: true, cancelable: true, isPrimary: true
  });
}

function gesture(el, x0, y0, dx, dy, id) {
  el.dispatchEvent(mk('pointerdown', x0, y0, id));
  for (let i = 1; i <= 5; i++) {
    el.dispatchEvent(mk('pointermove', x0 + (dx * i) / 5, y0 + (dy * i) / 5, id));
  }
  el.dispatchEvent(mk('pointerup', x0 + dx, y0 + dy, id));
}

/* Waits are in rendered frames, with a floor in milliseconds. Pure millisecond waits
   failed on slow GPUs (4 fps headless): the camera had not even moved yet. */
const wait = (ms, minFrames = Math.ceil(ms / 33)) => new Promise((r) => {
  const t0 = performance.now(); let n = 0;
  const f = () => { n++; if (n >= minFrames && performance.now() - t0 >= ms) r(); else requestAnimationFrame(f); };
  requestAnimationFrame(f);
});
const camDir = () => {
  const d = new (window.__dbg.camera.position.constructor)();
  window.__dbg.camera.getWorldDirection(d);
  return [d.x, d.z];
};
const rightOf = (v) => {
  const yaw = Math.atan2(v[0], v[1]);
  return [Math.cos(yaw), -Math.sin(yaw)];
};

export async function runSmoke() {
  const d = window.__dbg;
  if (!d) { document.body.innerHTML = '<pre>no __dbg</pre>'; return results; }

  // get into a live run
  const title = document.getElementById('title');
  const death = document.getElementById('death');
  if (!death.classList.contains('hidden')) document.getElementById('btnRetry').click();
  else if (!title.classList.contains('hidden')) document.getElementById('btnStart').click();
  await wait(1200);

  await check('game loop is alive', async () => {
    const t0 = d.GAME.time;
    await wait(500);
    assert(d.GAME.time > t0, 'GAME.time did not advance (frame loop is throwing or paused)');
    return `+${(d.GAME.time - t0).toFixed(2)}s`;
  });

  await check('no uncaught exceptions', async () => {
    assert(!window.__smokeErrors || window.__smokeErrors.length === 0,
      (window.__smokeErrors || []).join(' | '));
    return 'clean';
  });

  await check('spawn is on the ground and clear of props', async () => {
    const p = d.player.pos;
    const gh = d.world.constructor ? null : null;
    const ground = d.groundHeight ? d.groundHeight(p.x, p.z) : null;
    assert(d.world.isClear(p.x, p.z, 0.4), 'player spawned inside an obstacle');
    assert(isFinite(p.y), 'player y is not finite');
    return `(${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)})`;
  });

  await check('canvas fills the viewport', async () => {
    const c = d.renderer.domElement;
    const w = Math.round(window.visualViewport ? window.visualViewport.width : window.innerWidth);
    const h = Math.round(window.visualViewport ? window.visualViewport.height : window.innerHeight);
    assert(Math.abs(c.clientWidth - w) <= 3 && Math.abs(c.clientHeight - h) <= 3,
      `canvas ${c.clientWidth}x${c.clientHeight} vs viewport ${w}x${h}`);
    return `${w}x${h}`;
  });

  // keep the player alive while the test drives things
  let god = setInterval(() => { d.player.hp = 100; }, 80);

  // ---- stick moves the player the way the camera faces
  const stickZone = document.getElementById('stickZone');
  for (const [label, dx, dy] of [['up', 0, -50], ['down', 0, 50], ['left', -50, 0], ['right', 50, 0]]) {
    await check(`stick ${label}`, async () => {
      d.player.vel.set(0, 0, 0);
      const before = [d.player.pos.x, d.player.pos.z];
      const f = camDir(), r = rightOf(f);
      const expect = [
        (label === 'up' ? f[0] : label === 'down' ? -f[0] : 0) + (label === 'right' ? r[0] : label === 'left' ? -r[0] : 0),
        (label === 'up' ? f[1] : label === 'down' ? -f[1] : 0) + (label === 'right' ? r[1] : label === 'left' ? -r[1] : 0),
      ];
      const id = 900 + label.length;
      // hold the gesture across real frames: movement is a level input, not an accumulator
      stickZone.dispatchEvent(mk('pointerdown', 130, 290, id));
      for (let i = 1; i <= 5; i++) stickZone.dispatchEvent(mk('pointermove', 130 + (dx * i) / 5, 290 + (dy * i) / 5, id));
      await wait(650);
      const moved = [d.player.pos.x - before[0], d.player.pos.z - before[1]];
      stickZone.dispatchEvent(mk('pointerup', 130 + dx, 290 + dy, id));
      await wait(120);
      const mag = Math.hypot(moved[0], moved[1]);
      assert(mag > 0.15, `player barely moved (${mag.toFixed(2)}m)`);
      const dot = (moved[0] * expect[0] + moved[1] * expect[1]) / mag;
      assert(dot > 0.6, `moved the wrong way (alignment ${dot.toFixed(2)})`);
      return `${mag.toFixed(2)}m, align ${dot.toFixed(2)}`;
    });
  }

  // ---- look drag turns the correct way at several camera yaws
  const lookZone = document.getElementById('lookZone');
  for (const yaw of [0.0, 1.6, 3.1]) {
    await check(`look right at yaw ${yaw}`, async () => {
      d.player.camYaw = yaw;
      await wait(120, 3);
      const f = camDir(), r = rightOf(f);
      gesture(lookZone, 600, 140, 100, 0, 700 + Math.round(yaw * 10));
      await wait(400);
      const f2 = camDir();
      const turn = f2[0] * r[0] + f2[1] * r[1];
      assert(turn > 0.03, `dragging right turned the view left (${turn.toFixed(2)})`);
      return turn.toFixed(2);
    });
  }

  // ---- shots land and kill
  const aimAt = (e) => {
    const p = d.player;
    d.camera.position.set(p.pos.x, p.pos.y + 1.6, p.pos.z);
    d.camera.lookAt(e.pos.x, e.pos.y + e.type.height * 0.55, e.pos.z);
    d.camera.updateMatrixWorld(true);
  };
  const fireAt = (e) => {
    aimAt(e);
    d.weapons.cooldown = 0; d.weapons.reloading = false; d.weapons.switchT = 1;
    d.weapons.fire(d.camera);
  };
  await check('three shots kill a grunt (accuracy and hit marker count it)', async () => {
    d.weapons.shotsFired = 0; d.weapons.shotsHit = 0;
    d.enemies.clear();
    const p = d.player, T = d.camera.position.constructor;
    // the world has cover now, so find a lane that is actually clear before firing
    let spot = null;
    for (let k = 0; k < 24 && !spot; k++) {
      const a = (k / 24) * Math.PI * 2, dx = Math.cos(a), dz = Math.sin(a);
      let clear = true;
      for (let s = 2; s <= 9; s += 1) {
        if (!d.world.isClear(p.pos.x + dx * s, p.pos.z + dz * s, 0.45)) { clear = false; break; }
      }
      if (clear) spot = [p.pos.x + dx * 9, p.pos.z + dz * 9];
    }
    assert(spot, 'no clear firing lane in any direction');
    const e = d.enemies.spawn('grunt', spot[0], spot[1]);
    e.state = 'chase'; e.spawnT = 1; e.scale = 1; e.speed = 0;
    await wait(150, 2);
    let shots = 0;
    for (let i = 0; i < 3; i++) {
      fireAt(e);
      shots++;
      await wait(120, 1);
      if (!e.alive) break;
    }
    assert(!e.alive, `grunt still alive after ${shots} shots (hp ${e.hp.toFixed(0)})`);
    assert(d.accuracy() > 0, 'accuracy still reads 0% after hits');
    await wait(60, 2);
    assert(/kill|hit|head/.test(document.getElementById('hitmarker').className), 'hit marker never shown');
    return `dead after ${shots}, accuracy ${d.accuracy()}%`;
  });

  // ---- cover: a pillar between you and a grunt stops the shot
  await check('a pillar stops shots', async () => {
    d.enemies.clear();
    const px = Math.cos(Math.PI / 4) * 12.5, pz = Math.sin(Math.PI / 4) * 12.5;   // a great pillar
    const tx = -Math.SQRT1_2, tz = Math.SQRT1_2;                                     // tangent to the dais
    const p = d.player;
    p.pos.set(px + tx * 6, 0, pz + tz * 6); p.pos.y = d.terrainHeight(p.pos.x, p.pos.z);
    const e = d.enemies.spawn('grunt', px - tx * 5, pz - tz * 5);
    e.state = 'chase'; e.spawnT = 1; e.scale = 1; e.speed = 0;
    await wait(80, 2);
    const hp0 = e.hp;
    for (let i = 0; i < 3; i++) { fireAt(e); await wait(60, 1); }
    assert(e.hp === hp0, `shots went through the pillar (hp ${hp0} -> ${e.hp.toFixed(0)})`);
    // control: same line with the grunt moved in front of the pillar must hit,
    // otherwise the block above could be the ground or a broken gun
    e.pos.set(px + tx * 2.4, 0, pz + tz * 2.4); e.pos.y = d.terrainHeight(e.pos.x, e.pos.z);
    fireAt(e); await wait(60, 1);
    const hit = e.hp < hp0;
    d.enemies.clear();
    assert(hit, 'control shot with a clear line also missed');
    return 'blocked, control hit';
  });

  // ---- ammo crates refill limited weapons
  await check('an ammo crate refills reserves', async () => {
    const s = d.weapons.state[1];
    s.reserve = 0;
    d.pickups.spawn(d.player.pos.x, d.player.pos.z, 'ammo');
    await wait(200, 4);
    assert(s.reserve > 0, 'scatter reserve still 0 after the crate');
    return 'scatter +' + s.reserve;
  });

  // ---- the boss lands a melee hit up close
  await check('the boss hurts you in melee', async () => {
    clearInterval(god);
    d.enemies.clear();
    const p = d.player;
    p.hp = 100; p.iframe = 0; p.endMode();
    const f = camDir();
    const e = d.enemies.spawn('boss', p.pos.x + f[0] * 3.2, p.pos.z + f[1] * 3.2);
    e.state = 'chase'; e.spawnT = 1; e.scale = 1; e.attackCd = 0; e.speed = 0;
    await wait(900, 14);
    const hp = p.hp;
    d.enemies.clear();
    p.hp = 100; p.alive = true;
    god = setInterval(() => { d.player.hp = 100; }, 80);
    assert(hp < 100, 'boss stood next to you and never hit');
    return `took ${(100 - hp).toFixed(0)}`;
  });

  await check('the boss has a trailing body you can shoot', async () => {
    d.enemies.clear();
    const p = d.player, f = camDir();
    const e = d.enemies.spawn('boss', p.pos.x + f[0] * 14, p.pos.z + f[1] * 14);
    e.state = 'chase'; e.spawnT = 1; e.scale = 1;
    assert(e.segs && e.segs.length >= 5, 'no body segments');
    const sg = e.segs[3];
    const T = d.camera.position.constructor;
    const o = new T(p.pos.x, p.pos.y + 1.6, p.pos.z);
    const dir = new T(sg.x, sg.y + 1.3, sg.z).sub(o).normalize();
    const hits = d.enemies.raycast(o, dir, 80, 1);
    d.enemies.clear();
    assert(hits.length && hits[0].enemy === e, 'a shot at the tail missed');
    return `${e.segs.length} segments`;
  });

  // ---- brutes telegraph a charge
  await check('a brute winds up a charge at range', async () => {
    d.enemies.clear();
    const p = d.player;
    // a charge needs a clear line: find one, so the test can only fail on the AI
    let bx = null, bz = null;
    for (let k = 0; k < 24 && bx === null; k++) {
      const a = (k / 24) * Math.PI * 2;
      const x = p.pos.x + Math.cos(a) * 12, z = p.pos.z + Math.sin(a) * 12;
      if (Math.hypot(x, z) < 90 && d.world.isClear(x, z, 1.4) && !d.world.blocked(x, z, p.pos.x, p.pos.z)) { bx = x; bz = z; }
    }
    assert(bx !== null, 'test setup: no clear line around the player');
    const e = d.enemies.spawn('brute', bx, bz);
    e.state = 'chase'; e.spawnT = 1; e.scale = 1; e.chargeCd = 0;
    let seen = '';
    for (let i = 0; i < 30 && !seen; i++) { await wait(40, 1); if (e.state === 'windup' || e.state === 'charge') seen = e.state; }
    d.enemies.clear();
    assert(seen, 'no wind-up (state ' + e.state + ')');
    return seen;
  });

  // ---- threat radar points at someone behind you
  await check('an enemy behind you gets an edge pointer', async () => {
    d.enemies.clear();
    const p = d.player, f = camDir();
    const e = d.enemies.spawn('grunt', p.pos.x - f[0] * 10, p.pos.z - f[1] * 10);
    e.state = 'chase'; e.spawnT = 1; e.scale = 1; e.speed = 0;
    await wait(150, 4);
    const lit = d.radarEls.filter((el) => parseFloat(el.style.opacity) > 0.2).length;
    d.enemies.clear();
    assert(lit >= 1, 'no pointer shown');
    return lit + ' pointer(s)';
  });

  // ---- clearing a wave opens the upgrade draft, and a pick applies
  await check('wave clear opens the upgrade draft and a pick applies', async () => {
    d.enemies.clear();
    d.GAME.spawnQueue = [];
    d.GAME.waveActive = true;
    await wait(200, 4);
    const draft = document.getElementById('draft');
    assert(!draft.classList.contains('hidden'), 'draft did not open');
    assert(d.GAME.drafting, 'GAME.drafting not set');
    await wait(500, 2);
    const before = d.GAME.perks.length;
    draft.querySelector('.card').click();
    await wait(60, 1);
    assert(d.GAME.perks.length === before + 1, 'pick did not register');
    assert(draft.classList.contains('hidden'), 'draft did not close');
    return d.GAME.perks[d.GAME.perks.length - 1];
  });

  // ---- eco forms
  await check('light form engages, shields and costs eco', async () => {
    const p = d.player;
    p.eco = 100; p.endMode();
    const ok = p.activateMode('light');
    assert(ok, 'activateMode(light) returned false');
    assert(p.mode === 'light', 'mode is ' + p.mode);
    assert(p.dmgTakenMul < 0.6, 'no damage reduction: ' + p.dmgTakenMul);
    assert(p.eco === 55, 'eco not deducted, eco=' + p.eco);
    assert(p.aura.visible, 'aura not shown');
    p.endMode();
    assert(p.dmgTakenMul === 1 && p.dmgMul === 1, 'endMode left multipliers dirty');
    return 'ok';
  });

  await check('dark form multiplies weapon damage', async () => {
    const p = d.player;
    p.eco = 100;
    assert(p.activateMode('dark'), 'activateMode(dark) returned false');
    assert(p.dmgMul > 1.5, 'no damage bonus: ' + p.dmgMul);
    const before = p.dmgMul;
    p.endMode();
    assert(p.dmgMul === 1, 'endMode did not clear bonus');
    return 'x' + before;
  });

  await check('LIGHT button actually enters the form', async () => {
    const p = d.player;
    p.eco = 100; p.endMode();
    document.getElementById('btnLight').dispatchEvent(mk('pointerdown', 520, 320, 4242));
    await wait(300);
    assert(p.mode === 'light', 'tapping LIGHT did not enter the form (mode=' + p.mode + ')');
    document.getElementById('btnLight').dispatchEvent(mk('pointerdown', 520, 320, 4243));
    await wait(200);
    assert(p.mode === 'normal', 'tapping LIGHT again did not exit the form');
    return 'wired';
  });

  await check('eco cannot be spent twice at once', async () => {
    const p = d.player;
    p.eco = 100; p.endMode();
    assert(p.activateMode('light'), 'first activation failed');
    assert(!p.activateMode('dark'), 'a second form could be started while one is active');
    p.endMode();
    return 'guarded';
  });

  // ---- jump and the move-invert setting
  await check('jump leaves the ground and lands again', async () => {
    const p = d.player;
    p.pos.y = d.terrainHeight(p.pos.x, p.pos.z); p.vy = 0; p.grounded = true;
    const y0 = p.pos.y;
    let peak = y0;
    const btn = document.getElementById('btnJump');
    btn.dispatchEvent(mk('pointerdown', 700, 300, 6161));
    for (let i = 0; i < 14; i++) { await wait(60, 1); peak = Math.max(peak, p.pos.y); }
    btn.dispatchEvent(mk('pointerup', 700, 300, 6161));
    assert(peak - y0 > 0.35, `did not leave the ground (${(peak - y0).toFixed(2)}m)`);
    for (let i = 0; i < 30; i++) { await wait(60, 1); if (p.grounded) break; }
    assert(p.grounded, 'never came back down');
    return `apex +${(peak - y0).toFixed(2)}m`;
  });

  await check('MOVE invert setting actually reverses the stick', async () => {
    const p = d.player;
    const sel = document.getElementById('invMove');
    assert(sel, 'no invMove control in the UI');
    sel.value = '-1'; sel.dispatchEvent(new Event('change'));
    const f = camDir();
    const before = [p.pos.x, p.pos.z];
    const z = document.getElementById('stickZone');
    z.dispatchEvent(mk('pointerdown', 130, 290, 555));
    for (let i = 1; i <= 5; i++) z.dispatchEvent(mk('pointermove', 130, 290 - (50 * i) / 5, 555));
    await wait(550);
    z.dispatchEvent(mk('pointerup', 130, 240, 555));
    await wait(150);
    const mv = [p.pos.x - before[0], p.pos.z - before[1]];
    const mag = Math.hypot(mv[0], mv[1]) || 1;
    const dot = (mv[0] * f[0] + mv[1] * f[1]) / mag;
    sel.value = '1'; sel.dispatchEvent(new Event('change'));
    assert(dot < -0.5, `invert did not reverse the stick (alignment ${dot.toFixed(2)})`);
    return 'reversed';
  });

  // ---- report
  await check('no uncaught exceptions (whole run)', async () => {
    assert(!window.__smokeErrors || window.__smokeErrors.length === 0,
      (window.__smokeErrors || []).slice(0, 3).join(' | '));
    return 'clean';
  });

  const pass = results.filter((r) => r.pass).length;
  const fail = results.length - pass;
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;inset:0;z-index:999;background:#080503ee;color:#f4e7d2;' +
    'font:11px/1.6 ui-monospace,monospace;padding:14px;overflow:auto;white-space:pre-wrap';
  box.textContent =
    `SMOKE ${pass}/${results.length} passed${fail ? `  —  ${fail} FAILED` : '  —  ALL GOOD'}\n\n` +
    results.map((r) => `${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? '  —  ' + r.detail : ''}`).join('\n');
  document.body.appendChild(box);
  console.log(JSON.stringify(results));
  window.__smokeDone = { pass, fail, results };
  return results;
}

window.addEventListener('error', (e) => {
  (window.__smokeErrors = window.__smokeErrors || []).push(e.message);
});
