# Wasteland Trial

A third-person arena shooter, built as an installable iPhone PWA. Our own
hero (the runner: navy coat, swept brown hair, red headband), our own boss.
Everything you see is procedural — no image or model files beyond the three.js
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

## b22: draw, throw, the pass

- Weapons ride sheathed across the hero's back. The first press draws (the hand
  goes over the shoulder to the hilt); seven quiet seconds and it goes back.
  Patrols that notice you don't wait: hold attack and the draw flows into the strike.
- Swings: a forehand diagonal, a rising backhand and an overhead, each with a held
  wind-up, a fast strike with a wrist snap, a dip and the off hand out; a light
  trail follows the blade's actual tip.
- The spear is thrown: wind-up, release, a real spear flies and sticks where it
  lands; damage arrives with it; a fresh spear appears in the hand.
- The hero: rounded boots with heel and sole, gloves with thumb and fingers, leather
  and cloth with surface relief, a cloak that moves.
- The pass: the rim breaks on one side past the lake; from the parapet the land
  falls to a vast lowland with forest, a lake, a colossal statue and a citadel,
  under great mountains, clouds and a low golden sun from behind you.
- Music: three recorded tracks in `music/` (made in Suno on the owner's account,
  loudness-matched to -17 LUFS).

## b23: the forest trail

A dirt trail leaves the shrine ring and winds through forest to the parapet at the
pass, so you come out of the trees onto the lowland view. Broadleaf trees line it
with branches arching overhead; firs stand behind; ferns, bushes, fallen logs,
mossy stones and mushrooms cover the floor. Foliage is textured leaf, needle and
frond cards (alpha cut, crown-shaped normals, swaying, casting leaf-shaped
shadows); trunks carry bark with relief; shafts of light angle down from the sun.
The valley's fir stands use the same trees. Birds sing more under the trees.

## b25: the long forest walk

The trail now leaves the west of the shrine and loops most of the way round the
valley (342 m, about a minute's walk) before ending at the parapet. Sections:
young wood, dark firs (with light shafts), a shallow ford with stepping stones
below the cascade, a birch grove, a clearing with a ring of standing stones round
a rune-lit altar, the old giants (huge mossy trees, ferns, low mist, a watchtower
through the trees), then thinning to the view. The forest is built in 40 m chunks
so the camera and shadow pass skip what's out of view.

## b26: detail pass

The sentinels are rebuilt as rounded bronze constructs with a specular sheen:
a hunched grunt with crested helm, banded belly and clawed gauntlets; a tall
archer with crescent helm, breastplate and ringed bolt-caster; a horned bull
brute with nose ring, spine plates and banded flanks; a bronze wasp with fanned
blade-wings; the Ironcoil with a domed, spiked head and segments. Eyes glow in
each helm's slit (they used to sit inside the old box heads). Ivy climbs the
shrine's pillars, the towers and the arch. The hero gains a belt pouch, a
buckled baldric and leather bracers.

## b27: the hero, sculpted

The head is one sculpted surface instead of glued-on parts: brow ridge, eye
sockets, nose, lips, cheekbones and a square jaw are shaped into a single mesh,
and its skin is painted texel by texel from the same shape (warm cheeks and
nose, shadowed sockets, brows, stubble that stops at the lips). The eyes are
hazel and sit in the sockets under almond lids with dark lash lines and a small
catchlight. Swept brown hair with loose locks replaces the beanie-like wrap; the
red band is tied round the hair, and its tails still stream back. The head is
10% larger than life so it reads at play distance. The cloak drapes round the
shoulders with pleats and a ragged hem instead of hanging as a flat board, and
the scarf, fur collar and hips are slimmer. Materials are physically based, lit
by a sky environment. Building the hero takes about 0.3 s once at load.

## b28: the adventure

Wander now has a spine, a body to tire, a guard to raise and a character that grows.

**The vale's story.** Thirteen places, each with a reason to go: a shrine rune, three
watchtower beacons, the standing stones (guarded by stonekin), a wolf den, two caches,
four inscriptions, and the pass gate at the end of the forest trail. Five lights (shrine,
three beacons, altar) answer the gate; breaking the seal wakes the Pass Warden. Beacons
draw an ambush. Lit places throw a beam you can see across the valley. A compass shows
the places you have found and the next objective with its distance. Everything is saved:
lights stay lit, relics stay yours, levels stay, and dying drops you back at the shrine
with all of it (the Trial keeps its arcade rules, untouched).

**Combat.** Stamina (sprint, dodge, every swing and block spend it; empty means winded).
**GUARD** (hold) turns blows from the front: raise it just before a hit lands for a PARRY
(no damage, the attacker staggers, a little stamina back); later it blocks for 20% and
costs stamina; empty it breaks. Wander lengthens every melee tell so a parry can be
caught on a phone. **Heavy strike:** tap to swing, hold about 0.6 s and release for a slow
overhead that hits hard (the button glows as it charges). **LOCK** pulls the view to the
nearest threat; tap again to let go.

**Growth.** XP from kills, discoveries, lights, caches and parries; 20 levels (+6 health,
+3 stamina, +3% damage each) and a banked skill pick per level, offered when it is calm
(DECIDE LATER banks it). Seven relics from caches and fights: Warden's Clasp, Wayfarer's
Boots, Whetstone of Ash, Parry Sigil, Ring of Second Breath, Hunter's Horn and the
Warden's Cloak (the hero's cloak turns crimson). The journal is on the pause screen.

**Creatures by region.** Wolves (a pack that circles, crouches, then lunges in a straight
line you can sidestep) hold the den and the old giants' wood; stonekin (big, slow, moss-grey
stone) guard the standing stones; brutes, stingers and sharpshooters hold the pass.

**Wander HUD.** The score, combo, charge, forms and reload are gone from Wander. What is
left: health, stamina, level, lights, the compass, the sword/axe/spear/rune strip and
JUMP, DODGE, AIM, LOCK, GUARD and a context USE button that appears at a place.

**Not in b28:** the lowland below the pass is still a view, not a walkable zone (that
needs a bigger terrain grid); the gate opens onto the parapet and the ending card says so.

**Keyboard:** F guard (hold), E use, T lock.

## b29: red team, then depth

**Red team (all fixed):** a corrupt or old save no longer produces NaN health or crashes the
journal (saves are sanitised on load, journal text is never markup); enemies past a type's draw
cap no longer go invisible; tapping GUARD is no longer a shield (a parry needs a fresh raise
after the guard has been down for half a second; parry XP is throttled); a deliberate swipe
breaks lock-on; place rings follow the terrain; the HUD only touches the DOM when something
changed; the skill draft sits under the compass; a second performance guard drops shadows if the
game is still slow at the lowest resolution. Measured on this box: ~700k triangles and 120-250
draw calls a frame, so older phones will lean on that guard.

**Day and night.** A day is nine minutes of Wander (dawn, noon, evening, dusk, night, predawn),
with the sun on an arc, a moon and twinkling stars at night, fog, sky, water, haze and light
colours following the time, fireflies and a lantern that follows the hero after dark. At dusk
a banner announces the wolves, and night patrols are mostly wolves and stonekin. Time stands
still underground and in the Trial (which keeps the old morning).

**The Under-Vault.** Once the standing-stones altar is awake, a sealed door beneath the
colossi opens onto a crypt: an antechamber, a pillared hall of guardians behind a rune seal,
and the throne of the **Stone Warden** (new boss: a long tell, then a ground slam you jump or
parry, bolts when enraged, stone that shatters when it dies). It lies far below the valley and
is lit by baked torchlight, with the game's terrain and collision swapped for the vault's own
floor and walls while you are in it. The Warden's cache holds the **Vault Heartstone**
(+25 health, heavier heavy strikes). Progress is saved; the vault empties for good.

**The hermit.** An old warden at a campfire east of the shrine gives three bounties (wolves,
stonekin, parries) that pay XP, a skill pick and two relics (Wolf-Fang Charm, Hermit's Talisman).

**Also:** a full-screen map (pause, MAP) drawn from the real terrain with every place you have
found; relics show on the hero (bronze pauldron, Heartstone gem, hunting horn, wolf fang);
stonekin and the Warden break into rock and light when slain.

## b30: a real hero, real sword play, real surfaces

**The hero.** The procedural hero is replaced by a skinned human (Quaternius' CC0 Universal
Animation Library mannequin: 53 bones, proper proportions) driven by motion-captured clips:
idle, walk, jog, sprint, roll, jump, a sword strike, hit reactions and death. He is dressed as
a Warden in armour fitted plate by plate (helm with a glowing visor, gorget, breastplate,
pauldrons, vambraces, tassets, cuisses, greaves, sabatons), with a cloak that hangs under
gravity, a real sword and a painted heater shield. The rigid armour is baked into five skinned
meshes so it costs a handful of draw calls. The old procedural hero is kept as the fallback if
`assets/hero.glb` cannot be loaded. Dev views: `tools/hero_view.html`, `tools/viewer.html`.

**Sword and shield.** Rebuilt on the clips (js/melee.js).
- A press starts the swing at once. The blade goes up; if you are still holding when it reaches
  the top it stops there and charges (a visible, readable charge). Let go early for a quick cut;
  let go after the charge for a heavy overhead.
- The blow lands where the blade actually is: each frame of the strike the blade and the path
  its tip travelled are swept against what is in front of you, with an assist so close targets
  are never missed. Contact has a freeze, a shove, a stagger, a shake and a clang.
- Attacks are commitments: you slow while swinging; the next link comes on the next press once
  the blow is through (cut, cut, finisher); a dodge cuts the recovery short.
- The shield is posed by inverse kinematics: it hangs at the side, comes up to the front on
  GUARD, jolts when it takes a blow, flares on a parry, and **bashes** (guard + attack: a
  stagger and a shove). A parry opens a **riposte**: the next blow within a second hits
  about 1.8x.

**Surfaces.** Photographic CC0 textures with normal maps (ambientCG: slate, rock, mossy ground,
two barks) replace the procedural noise on stone, ground and trunks; boulders are now smooth,
finer and textured instead of flat-shaded gems; the steel and the shield reflect the real sky
at the current time of day (image-based lighting rendered from the sky shader). The spawn
point no longer drops you inside fir branches.

**Credits.** Hero and animations: Quaternius, Universal Animation Library (CC0). Textures:
ambientCG (CC0). Three.js addons (GLTFLoader, SkeletonUtils, BufferGeometryUtils): MIT.

**Still the old look:** the bronze sentinels and wolves (instanced procedural models), the
grass and foliage cards, the faceted far mountains. Replacing the enemies with skinned,
animated humanoids needs a level-of-detail scheme first (a skinned enemy costs far more than an
instanced one).

## b33: a cloth cape

The cloak was a stiff sheet bolted to the upper back and tilted to look like it hung, so it passed through his back, hips
and legs whenever he crouched, lunged or swung. It is now cloth (`hero.js` buildCloak / updateCloak), simulated the way
engine cloth is (Unreal Chaos Cloth, Unity Cloth, PhysX): 117 points (9 x 13) joined by stretch, shear and bend springs
(Verlet integration, position-based constraints, 2 substeps x 6 iterations), the collar row pinned along the shoulder
blades, gravity and still-air drag (so it streams back when he runs), a slow gust. It cannot pass into the body: capsules
round the back, hips, shoulders, arms, thighs and shins push it out without throwing it (inelastic), a backstop plane along
the spine keeps it from wrapping round the front, and it rests on the ground. Only half his own travel reaches it as
inertia (the world velocity scale engines use) so a run does not fling it about; a teleport or revive starts it at rest.
Measured in game: no cloth inside the body standing, running or turning; a few points up to ~5 cm for a frame in the
fastest attack twists; streams back ~33 degrees at a run; about 0.4 ms a frame on the test box.

## b32: steel that stops, counters, blood

**Contact.** The blade is a solid thing. Each frame of a strike it is swept against what is in front of it, and what it
meets first decides the blow (`js/melee.js` `contact()`): a soldier's **shield** (a disc on its face) stops the cut, which
springs back along its path, checks you and leaves you open a beat (a wooden knock with an iron rattle). His **blade**,
when he is swinging it, meets yours: a **clash**, both thrown back, his attack broken (a bright inharmonic ring). A
**body** takes the cut: the edge drags a moment, blood sprays along the swing and stains the ground, a wound stays on him
(one instanced mesh for every wound in the field), and blood builds on your blade and dries off. A held heavy blow
smashes a shield aside instead of bouncing. His blows on your shield spring back the same way and leave him longer to
recover. Hitstop, shake and (on Android, and on a gamepad) vibration scale with what was hit. Sounds: `audio.impact()`
(steel, parry, shield, flesh, armour, whoosh).

**Different attacks.** Tap: forehand (the captured clip), rising backhand, overhead (authored hand and blade paths in
`hero.js` `SWING_PATHS`, on the clip's timing, the torso turning into the cut). Hold: the blade stops high and charges
(a ring fills the attack button, steel rings when full) into a heavy blow. Run and strike: a lunging thrust. A sheathed
sword draws and cuts in one press.

**Counter (Arkham / Mordor).** While a man shows a yellow `!` the GUARD button lights as COUNTER. Press it and you turn
to him, take the blow on your blade and cut back with a riposte; two at once are both taken. Red `!!` cannot be
countered: it says ROLL.

**Special.** The SPECIAL button appears when ready: FINISH a stunned or beaten man (or anyone at full flow), or SWEEP
(3 flow) when they crowd you, a wide cut that staggers everyone around.

**Injury.** Hurt men hunch and limp and wind up slower; below about a quarter they go down on one knee, open to a
finisher, then fight on hurt. You bleed when hit.

**Findable.** USE shows greyed with WALK CLOSER and the distance when something usable is within 30 m. The pause
screen has a HOW TO FIGHT card; first-fight tips show once per device. Also: a blow from point-blank always counts as in
front of your shield, and soldiers no longer walk inside you during a heavy wind-up (that made shield blocks fail).

Tests (scratch): contact_test 13/13 (shield stop, geometry, shield smash, blood/wound/drag, counter, double counter, red
refuses, kneel, sweep, his rebound, thrust, three cuts, USE), fight_test 14, combat_test 10, adv_func 15, p2 6, vault 10,
rt31 5.

## b31: soldiers, readable fights, finishing moves

The monsters are gone. The vale is held by the Ashen Company: footmen and spearmen behind shields, swordsmen who parry,
crossbowmen who keep their range, captains and a warlord. They are skinned men built from the same rig as the hero
(`js/soldiers.js`: cached per-style armour, one rig clone each, far ones animate at a coarse step; at most 12 are drawn).
No flyers, no stone creatures. Wolves stay as the one animal.

**How a fight works** (`js/soldier_ai.js`). Only two soldiers attack at once (attack tokens); the rest circle behind their
shields. An attacker closes, *winds up* (raised blade, a marker over the head), strikes, then recovers, open. Every attack
has an answer:

| Marker | Attack | Answer |
|---|---|---|
| yellow `!` | slash, thrust | parry (a fresh guard raise just before it lands) or dodge |
| red `!!` | heavy, shield bash | cannot be parried: dodge it, or take it on the shield |
| bolt | crossbow | dodge or shield |

A parry shows the clash (sparks where the blades meet) and leaves the soldier **stunned and open**. Shield soldiers turn
light blows from the front: break them with a held heavy blow, a shield bash, or go round behind. Swordsmen sometimes
parry a quick tap of yours.

**Flow and finishers** (`js/melee.js`). Steer toward a man and attack: you face him, dash onto him and strike (freeflow).
Six unblocked hits fill the flow meter; a stunned man, or anyone once flow is full, can be finished with G or the finish
button: four kill moves (overhead, thrust, roll-behind, shield slam) with a short kill-cam, input locked and untouchable
until it ends, then a little health back. Being hit breaks the flow.

**Medieval pass.** Rune, altar, vault and warden language became watch-fires, a war camp, the Undercroft, a gaoler and a
warlord; light/dark forms became Shield Wall / Battle Rage; the rune weapon is a fire pot; glows are firelight, not cyan.

Tests (scratch, not in the repo): fight_test (13), combat_test, adv_func, p2_test, vault_test, rt1, rt31 (Trial waves,
restart mid-finisher, leak check). Combat sim cost about 1.3 ms a frame with 12 soldiers on this box.

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
