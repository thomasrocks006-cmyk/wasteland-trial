Drop three instrumental tracks here, named exactly:

  explore.mp3   calm: title screen, wandering, between fights
  combat.mp3    battle: when sentinels hunt you, or a Trial wave is on
  boss.mp3      the Ironcoil (every fifth Trial wave)

All three must be present; otherwise the built-in synthesised score plays.
Each track loops, so ones without long fade-outs loop best.

---

## What is here now — recorded score, b38 (17 Nov 2026)

All three were made locally with **ACE-Step 1.5** (MIT) on the Vast box's RTX A5000, in D minor —
the same key and, as near as the model allows, the same tempos as the built-in synthesised score
(76 / 104 / 120), so a mood change still cuts on a musical seam.

| file | length | what it is |
|---|---|---|
| `explore.mp3` | 38.4 s | hurdy-gurdy and tagelharpa drone over low strings, frame drum, wind |
| `combat.mp3` | 56.0 s | low-string ostinato, war drums, barking low brass, wordless male choir |
| `boss.mp3` | 44.0 s | low brass stabs with semitone clashes, chanting choir, timpani, iron bell |

**These are real loops, not fades.** Each was cut from a longer generated take at the pair of beats
whose waveform two seconds on matched best (self-similarity +0.85 explore, +0.89 combat, +0.71 boss),
with the tail folded 300 ms into the head, so the wrap has no click and no seam you can hear. Checked
by concatenating three copies and comparing the biggest sample step at the joins against the track's
own maximum: 0.003 / 0.104 / 0.005 at the seams against 0.26 / 0.73 / 0.70 inside.

Mastering on the way out: highpass at 38 Hz, +2.5 dB shelf above 2.5 kHz (a phone speaker plays
almost nothing below 400 Hz — the same reason the synth score is voiced from 150 Hz up), peak at
−1 dBFS.

The three Suno tracks these replace (15 Nov, `Vale at Dawn` etc.) are kept in
`music/suno-2026-11-15/` — move them back over the top of these if you prefer them.
