# Wasteland Trial

A third-person arena shooter, built as an installable iPhone PWA. Our own
hero (the runner: navy jacket, red headwrap, cyan visor), our own boss.
Everything is procedural — no image, model or audio files beyond the three.js
library and one font, so it loads fast and works offline once installed.

## Play

**https://thomasrocks006-cmyk.github.io/wasteland-trial/**

Open that on the phone (Safari), then **Share → Add to Home Screen**. It runs
fullscreen, in landscape, and keeps working with no signal. It is served from
GitHub Pages, so the address is stable.

Local development: `./serve.sh` starts a static server plus a temporary tunnel
and prints an HTTPS address (that address changes on every restart).

## Forms

Kills fill the **CHARGE** bar under your health. At 45 charge you can take one form for
nine seconds:

| Form | Effect |
|---|---|
| **LIGHT** | Damage taken cut to 42%, heals 7/s, fire rate +35% |
| **DARK** | Weapon damage ×1.75, damage taken ×0.82 |

Tap LIGHT or DARK again to drop out of the form early. One form at a time.

## Upgrades between waves

Clearing a wave opens a draft: pick one of three upgrades (tap a card, or 1-3 on
a keyboard). They stack for the rest of the run and are listed on the death
screen. Thirteen in the pool: health, damage, reload, magazine, spread, charge
gain, form length, dodge, heal on kill, supply drops, Bomber radius, Beam
pierce, regeneration.

## Cover, radar and the boss

- Pillars, walls, wrecks, the dais and hills stop shots both ways, and aim
  assist will not lock onto anything you cannot see.
- Enemies off screen get a pointer at the screen edge, coloured by type
  (orange grunt, cyan sharpshooter, red brute, gold stinger, large orange boss),
  brighter when closer.
- Brutes rear up (red flash, ground ring, growl) and then charge in a straight
  line. Roll through it; if they ram a wall they are stunned for a second.
- The **Ironcoil** (every fifth wave) is a segmented body that arcs after you.
  Every segment can be shot. Its health bar sits at the top. Below half it
  enrages: faster, and it throws a ring of low bolts you jump or roll through.

## The vale (b21)

A green mythic valley under snowy peaks: a river falls off the rim as a cascade
between two hooded stone colossi, winds round the rune-ringed shrine and ends in
a lake. Stone watchtowers with lit windows, pine stands, reeds and lily pads,
spirit motes in the air. The river is carved into the height field: you wade
through it (slower, with splashes).

**Two ways to play.** *Wander the Vale* (main): no waves. Sentinel patrols roam
and leave you be until you come close or strike one; new patrols appear out of
sight. Deer graze and bolt, rabbits scatter, birds wheel overhead. Health returns
when nothing hunts you; an upgrade is offered every six kills. *The Trial*:
the endless waves, as before.

**Arsenal.** Sword (three-strike combo, overhead finisher), war axe (one slow wide
chop), thrown spear (pierces three), fire rune (arcing orb, bursts on contact).
Strikes step you toward the nearest foe in front.

**Recorded music.** Put `music/explore.mp3`, `music/combat.mp3` and
`music/boss.mp3` in the game folder and they replace the synthesised score
(looping, crossfading by mood). With any missing, the synth score plays.

## Music and sound

An original score, synthesised live in `audio.js` (no files). One key (D minor),
three moods that cut on a bar line: **explore** (title and between waves: harp,
strings, wooden flute), **combat** (string ostinato, taiko, horns) and **boss**
(brass stabs, choir, timpani). Everything is voiced from about 150 Hz up with
added harmonics, because a phone speaker plays nothing below that; the old score
was 27-115 Hz bass under a melody at 1.5% volume, which is why it seemed missing.
Reverb is a send (the old wiring looped it back into the master, which browsers
mute). On iOS it plays through the silent switch.

## Feel and physics

- A kill throws the body away from the shot; it tumbles, bounces, lies there,
  then sinks. Explosions throw rock debris that bounces on the real ground.
- Bomber charges skip once off the ground before going off.
- Dropped supplies pop out of the kill, bounce, and slide to you within 5 m.
- A tiny freeze on every kill, slow motion on the boss kill, kill-streak calls
  (DOUBLE KILL to UNTOUCHABLE) with a score bonus, a camera that follows with a
  little weight, and a wider view while sprinting.

## Self-test

Add `?smoke=1` to the address. The game runs a scripted pass (24 checks) over
the systems that have broken before and the ones added since: loop liveness,
stick direction in four directions, look direction at three camera angles, hit
registration with the hit marker and accuracy, a pillar stopping shots (with a
control shot that must hit), ammo crates refilling, the boss landing a melee
hit, shooting the boss's tail, a brute winding up, the edge radar, the upgrade
draft, spawn safety, canvas fit, and both forms. Waits are counted in rendered
frames, so it passes on a slow phone too (verified at 4 fps). A build that
fails it does not ship.

## Crash reporting

If a frame ever throws, a red bar appears at the bottom with the message and a
RELOAD button, instead of a frozen screen.

## Controls

| | |
|---|---|
| Left thumb | move, exactly where you push relative to the screen (push to the edge to sprint) |
| Right thumb drag | look / aim |
| Fire button | shoot (hold for automatic) |
| DODGE | roll in the stick direction (0.42 s of invulnerability) |
| AIM | aim down sights: tighter spread, less recoil, 52° zoom |
| RELOAD / JUMP | as labelled |
| Weapon strip | tap 1-4 |
| LIGHT / DARK | form (needs 45 charge) |

On desktop: WASD, mouse look (click to lock), left click to fire, R reload,
C dodge, 1-4 weapons, Space jump, Shift aim, L light, K dark, Esc pause.

## The four weapons

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

Endless waves with escalating counts and mixes, the **Ironcoil** boss every fifth
wave, health and ammo crates dropped by kills and between waves (ammo crates add
40% of each limited weapon's starting reserve), a combo multiplier with a
draining timer bar, an upgrade draft after every wave, and a summary at the end
(wave, score, kills, accuracy, best combo, headshots, time, upgrades). Best wave
and score, and your settings, are kept in `localStorage`.

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

- The terrain height is one function, `terrainHeight(x, z)` in `core.js`. It
  interpolates a cached height grid (`GRID_SEG`/`GRID_EXT`) that the mesh is also
  built from, so what you walk on is exactly what you see. Never sample the raw
  noise (`terrainRaw`) for physics, and never change the grid size in one place.
- Terrain triangles are wound so normals point **up**. Inverting the winding makes
  the ground get lit from below and stops shadows landing on it.
- Hit volumes are three stacked spheres (legs, torso, head) per enemy. A single
  body sphere is smaller than the silhouette and makes on-target shots miss.
- Enemy limbs are `InstancedMesh` per body part, so the whole horde costs about
  25 draw calls. Keep it that way: don't add per-enemy meshes.
- Materials must not set `vertexColors` unless the geometry has a colour
  attribute — instanced tinting alone uses `instanceColor`.
- Obstacles are upright cylinders `{x, z, r, h}`; `h` is the top above local
  ground. `world.rayObstacle` stops shots, `world.pointSolid` stops enemy bolts.
  Anything with `r < 0.8` (dead trees) lets shots through.
- Enemy melee resolves on the game clock (`pendingHit`), never `setTimeout`, so
  nothing lands while paused or after a restart.
- The service worker is network-first and versioned (`CACHE` in `sw.js`). Bump it
  whenever you ship changed assets, or phones will keep the old build.
- It skips service-worker registration on localhost so local edits show up
  immediately.
