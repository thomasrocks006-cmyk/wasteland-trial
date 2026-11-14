# Wasteland Trial

A Jak-style third-person arena shooter, built as an installable iPhone PWA.
Everything is procedural — no image, model or audio files beyond the three.js
library and one font, so it loads fast and works offline once installed.

## Play

**https://thomasrocks006-cmyk.github.io/wasteland-trial/**

Open that on the phone (Safari), then **Share → Add to Home Screen**. It runs
fullscreen, in landscape, and keeps working with no signal. It is served from
GitHub Pages, so the address is stable.

Local development: `./serve.sh` starts a static server plus a temporary tunnel
and prints an HTTPS address (that address changes on every restart).

## Controls

| | |
|---|---|
| Left thumb | move (push to the edge to sprint) |
| Right thumb drag | look / aim |
| Fire button | shoot (hold for automatic) |
| DODGE | roll in the stick direction (0.42 s of invulnerability) |
| AIM | aim down sights: tighter spread, less recoil, 52° zoom |
| RELOAD / JUMP | as labelled |
| Weapon strip | tap 1-4 |

On desktop: WASD, mouse look (click to lock), left click to fire, R reload,
C dodge, 1-4 weapons, Space jump, Shift aim, Esc pause.

## The four gunstaff mods

Each is a different weapon, not a reskin — spread, cadence, recoil and feel all
change:

| | Damage | Rate | Spread | Kick |
|---|---|---|---|---|
| **Blaster** (orange) | 26 | 225 rpm | 0.55° | 1.45° |
| **Scatter** (yellow) | 12 × 9 pellets | 72 rpm | 6.4° | 4.6° + shove |
| **Beam** (blue) | 105, pierces 3 | 58 rpm | 0.08° | 5.4° |
| **Bomber** (red) | 140 splash r4.8 | 46 rpm | 0.9° | 6.8° + shove |

Recoil is a real spring on the camera: every shot adds pitch and yaw velocity,
the crosshair blooms, the gun model kicks back, and the screen shakes. Headshots
do 1.9×. Touch aim-assist is 3.2° unaimed, 1.2° aimed.

## The run

Endless waves with escalating counts and mixes, a **Metalpede** boss every fifth
wave, health and ammo eco dropped by kills and between waves, combo multiplier,
and a score/accuracy/headshot summary at the end. Best wave and score are kept
in `localStorage`.

Enemies: grunts (fast melee), sharpshooters (keep range, lead their shots),
brutes (four-legged, heavy, stagger only on big hits), stingers (flying divers),
and the boss.

## Files

```
index.html            shell, HUD, menus
style.css             HUD and menu styling (safe-area aware)
js/main.js            loop, waves, scoring, input, PWA wiring
js/core.js            math, noise, the shared terrain field, geometry builder
js/world.js           terrain mesh, sky shader, ruins, rocks, grass, lights
js/player.js          hero rig, movement, over-shoulder camera, recoil spring
js/weapons.js         four weapons, models, hitscan, spread, reload
js/enemies.js         types, instanced rendering, AI, projectiles
js/fx.js              tracers, muzzle flashes, sparks, decals, damage numbers
js/audio.js           all sound synthesised at runtime (WebAudio)
tools/make_icons.py   generates the PWA icons
serve.sh              local server + tunnel
```

## Notes for whoever touches this next

- The terrain height is one function, `terrainHeight(x, z)` in `core.js`, used by
  the mesh, the physics and the enemy AI. Change it in one place only.
- Enemy limbs are `InstancedMesh` per body part, so the whole horde costs about
  25 draw calls. Keep it that way: don't add per-enemy meshes.
- Materials must not set `vertexColors` unless the geometry has a colour
  attribute — instanced tinting alone uses `instanceColor`.
- The service worker is cache-first and versioned (`CACHE` in `sw.js`). Bump it
  whenever you ship changed assets, or phones will keep the old build.
- It skips service-worker registration on localhost so local edits show up
  immediately.
