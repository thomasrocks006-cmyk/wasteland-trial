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

## b39: taps that work, FOCUS, harder fights, Tom's score back

- **Using things on a phone.** Walk up to anything usable (a fire, a door, a stone, the hermit, the horse): a pulsing ring with
  TAP · <what it does> floats over it and the orange button on the right says the same. Tap either. Both were broken on
  phones: the touch stream ended a gesture without ever counting it as a tap, and the orange button (and FINISH) sat under
  the invisible look-drag area. Found by tapping with a real touch in the test, not by calling the code.
- **FOCUS** (the gold ring button, or X): hits, parries and finishers fill it; spent, the soldiers slow to a third for six
  seconds while you move at full speed, every blow lands half again as hard and staggers.
- **New attacks**: attack in mid-air for a plunge that lands with a shockwave; guard + full stick + attack for a shield
  charge that bowls men over; stick pulled back + attack for a spinning backhand all round you.
- **Harder**: soldiers 25% tougher, 30% harder hitting, tells 15% quicker, turns come round sooner, three attackers at once
  from level 4. **Payoff**: the last man of a band falls in slow motion with a banner, XP and spoils.
- **Sharpness**: the frame-rate guard used to drop the resolution from 1.6x to 1.0x for the rest of the session the first
  time a fight ran slow (everything went soft). It now steps 1.6 -> 1.3 -> 1.0 and comes back up when there is room. The
  Storm's own light (which every surface paid for, casting or not) is gone: it borrows the effects' flash light, which now
  stays in the scene at zero instead of appearing (an appearing light recompiles every material: a first-use stall).
- **Cape**: the backstop plane follows the shoulders (a twisted chest no longer pushes the cloth through him), sits behind
  the back plate, and the horse's back is a collider when riding. Terrain cells back to 1.69 m (b38 had coarsened the vale).
- **Score**: Tom's Suno tracks are back, sixteen of them now (see music/README.md), decoded only when about to play.

## b38: the low road and the lowland (the world past the gate)

Until now the gate opened onto a view. The land beyond it is real: you can walk it, and the vale is no longer the whole world.
- **The pass is a cliff with a road cut into it.** The gate is at 90 m; the ground fell 36 m in twenty. The low road leaves the
  gate pointing out through the break, doubles three times across the face and runs out onto the basin floor: 160 m of shelf,
  graded by its own length (22%, a steady walk, a horse can take it), 5.2 m of packed earth between stone kerbs, waymarkers on
  the turns. `ROAD` in `js/core.js` is the line; `carve()` cuts the bench into the height field; `buildLowRoad()` in
  `js/world.js` lays the surface on the mesh's own heights, so it can never float over the cut or sink into it.
- **The gate is shut until the Warden falls** — three posts stand in the opening while the pass is barred (`adventure.buildGate`),
  and the barrier is no longer only a picture. The victory card now sends you down the road.
- **The lowland is a place**: a green basin under the cliff, rolling out to old hills, with thickets of fir and birch, boulders,
  and grass that follows the ground down (the grass map now covers the whole field, not just the vale).
- **The old keep** stands past the road's foot on a levelled pad: curtain walls broken to different heights, a gate arch facing
  back up the road, a tower stump, a well, rubble. Its guard of the Ashen Company holds the strongbox (CAPTAIN, SWORDSMAN,
  SHOOTER) until they are dead. Two readings there: THE LOW ROAD at the road's foot, THE KEEPER'S GATE at the keep.
- **A bigger field**: the terrain grid went from ±118 m / 140 to ±186 m / 200 (80 k triangles for the ground, ~18 MB of
  attributes). The walkable edge is a brink at r 181; past the basin the old visual plain and the mountain ring carry the eye on.
  Scene geometry 1.11 M → 1.16 M triangles. Boot on the test box went 3.8 s → ~6 s; `window.__boot` now records the phases
  (grid, terrain, landmarks, props, forest, grass) so the next round can see what costs what.
- **The map** covers the lowland and the road; the compass and the objective follow you down; patrols come out of the basin
  once you are below the pass.
- Not done: no water in the basin, wildlife stay in the vale, the far plain beyond the brink is still scenery, and the keep has
  no interior (the yard and the strongbox are the reward). The walk down was checked on foot and on the horse (9/9 lowland
  checks, `lowland_test.cjs` in scratch).

## b35: open-source nature (scanned rocks, real trees, grass, a mountain range)

Open, permissively licensed work only (no assets pulled from commercial games). Credits in `assets/env/CREDITS.txt` and
`assets/trees/CREDITS.txt`.
- **Photo-scanned props** from Poly Haven (CC0): two mossy rock sets and a boulder (the valley's boulders, rock clusters and
  pebbles, replacing the faceted ones), stumps, fallen trunks, pine roots, ferns (replacing the blob shrubs), a stone fire pit
  (the arch fires), a castle door (the Undercroft; its leaves open when the war camp's banner goes up) and an iron gate (the
  pass; re-hinged, it swings open when the pass is won, replacing the old rune film). Cut down with gltf-transform (weld,
  simplify to a few hundred to a few thousand triangles, 512 px WebP textures, quantized): 2.9 MB for all of them.
  `js/envassets.js` loads them before the world is built; anything missing leaves the old procedural piece in place.
- **Trees** from EZ-Tree (Dan Greenheck, MIT): three pines, an oak, an aspen, generated offline with fewer branches and leaf
  cards, baked to glTF (2.6 MB). `js/trees.js`: every forest and valley tree is a spot; within 35 m (25 fast, 55 high) it
  is the real tree, instanced and swaying, casting shadows; further out it is a card with a picture of that same tree
  rendered at start-up (an impostor). The old procedural tree geometry is not built when the trees load.
- **Grass** after SimonDev's Quick_Grass (MIT): `js/grass.js`, clumps of three blades instanced around the player in a patch
  that follows him (14k clumps balanced), height and growth read from maps baked from the terrain (none on the trail, in
  water, on cliffs or under a rock), lit and fogged like the scene, swaying, fading at the patch edge.
- **A mountain range** in place of the 46 cones: a ring of terrain from ridged noise, coloured by slope and height (rock,
  scree, forest, snow only where it can lie), lower through the pass so the view out stays open.
- Cost on the test box: about 1.28 M rendered triangles at balanced (was about 0.74 M); the frame-rate guard now has a third
  step (after resolution and shadows) that halves the grass and pulls the real trees in closer.

## b34: captured sword play, Ryse finishers, the Trial's guard, tabards, a heavier cape

**Real sword moves.** Quaternius' Universal Animation Library 2 (CC0) has the sword-and-shield set the first one lacked.
It uses a different skeleton naming and bone axes, so `tools/retarget.html` (run by a scratch script with the source glb,
which is not in the repo) bakes each clip onto this rig: every frame, each bone's world rotation relative to the shared
T-pose is carried across, the hips' travel in world space. The result is packed into `assets/ual2.bin` (290 KB, 127 KB
gzipped; int16 quaternions) and loaded by `loadClipPack()` in `hero.js` for the hero and the soldiers alike.
Strike windows were measured from the blade tip's speed (`tools/hero_view.html?profile=`).
- Hero: a tap gives a real three-cut combo (A, B, then C, which strikes twice), each cut flowing into its own recovery
  unless the next press comes. A hold of a fifth of a second winds up the heavy overhead from the heavy combo, which
  stops at the top to charge (damage grows with the charge). On the run: the dash cut. Shield bash, guard stance,
  knockback and guard-break reactions are captured too. The older single-clip set remains the fallback if the pack fails to load.
- Soldiers: the slash is the captured cut B (a deep, readable wind-up), the heavy is the captured overhead, the shield
  bash is the captured one. Shield men stand in the shield guard, a parrying swordsman blocks, a smashed guard staggers,
  a big hit knocks a man back.
- Fixed on the way: a clamped one-shot clip ends *paused*, so reaction clips nobody stopped stayed on forever.

**Finishers, Ryse-style.** Five staged finishers (overhead, cut-down, shield breaker, ambush roll, thrust). Between
stages the action holds and a prompt closes over the man: ATTACK (gold) or GUARD (steel). The right button in time is
PERFECT (health, flow); every prompt PERFECT is FLAWLESS (more health, stamina refilled, XP). A miss never stops the kill.
A side-on finisher camera frames the pair from whichever side is open. Finishers can cut into any moment that is not
mid-strike.

**The Trial** has the guard, and so the counter and shield blocks, with a stamina bar (GUARD sits above the strike button).

**Cloth** is one class now (`js/cloth.js`), shared by the cape and the soldiers' tabards (a front and a back panel from
the belt; the 4 nearest soldiers simulate, the rest ride the hips rigidly, none beyond 35 m). The cape is heavier: a
ceiling keeps each row below the collar line, so it no longer flips over his shoulders at a sprint (hem always at least
35 cm below the collar and behind him; it was rising above the collar at moments).

Tests (scratch): fight 14, combat 10, contact 13, exec 7, trial 3, adv 15, p2 6, vault 10, rt31 5, cloth_test, cloth_lift.

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
