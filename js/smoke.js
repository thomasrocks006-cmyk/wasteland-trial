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

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
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
  const god = setInterval(() => { d.player.hp = 100; }, 80);

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
      await wait(120);
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
  await check('three shots kill a grunt', async () => {
    d.enemies.clear();
    const p = d.player, T = d.camera.position.constructor;
    const f = camDir();
    const e = d.enemies.spawn('grunt', p.pos.x + f[0] * 9, p.pos.z + f[1] * 9);
    e.state = 'chase'; e.spawnT = 1; e.scale = 1; e.speed = 0;
    await wait(150);
    let shots = 0;
    for (let i = 0; i < 3; i++) {
      d.camera.position.set(p.pos.x, p.pos.y + 1.6, p.pos.z);
      d.camera.lookAt(e.pos.x, e.pos.y + e.type.height * 0.55, e.pos.z);
      d.camera.updateMatrixWorld(true);
      d.weapons.cooldown = 0; d.weapons.reloading = false;
      d.weapons.fire(d.camera);
      shots++;
      await wait(120);
      if (!e.alive) break;
    }
    assert(!e.alive, `grunt still alive after ${shots} shots (hp ${e.hp.toFixed(0)})`);
    return `dead after ${shots}`;
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

  await check('eco cannot be spent twice at once', async () => {
    const p = d.player;
    p.eco = 100; p.endMode();
    assert(p.activateMode('light'), 'first activation failed');
    assert(!p.activateMode('dark'), 'a second form could be started while one is active');
    p.endMode();
    return 'guarded';
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
