Drop three instrumental tracks here, named exactly:

  explore.mp3   calm: title screen, wandering, between fights
  combat.mp3    battle: when sentinels hunt you, or a Trial wave is on
  boss.mp3      the Ironcoil (every fifth Trial wave)

All three must be present; otherwise the built-in synthesised score plays.
Each track loops, so ones without long fade-outs loop best.

---

## What is here now (17 Nov 2026)

Tom's Suno score, sixteen tracks, all loudness-matched at -18 LUFS (128 kbps):

| mood | files | songs |
|---|---|---|
| explore | explore, explore2 .. explore6 | Vale at Dawn (both takes), Ashwood Hollow (both), The Long Road Down (both) |
| combat | combat, combat2 .. combat6 | Bronze Sentinels (both), Iron Takes the Field (both), Shieldwall (both) |
| boss | boss, boss2 .. boss4 | The Coiled Wyrm (both), The Warlord's Due (both) |

The list lives in `js/audio.js` (MUSIC). Tracks are decoded only when about to play and only two are kept in memory
(a decoded three-minute track is about 60 MB). When one ends the next is another of the same mood, never the one just
heard. The ACE-Step tracks b38 swapped in were taken out on Tom's word; copies are outside the repo in
scratch/wasteland-trial/ace-step-20261117. `suno-2026-11-15/` holds the first three as they were.
