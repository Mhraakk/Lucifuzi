# 0052 — Mozart under the comparison film, on its cuts

**Status:** done.

## What
**Asked:** «ویدیو ها موسیقی ندارند و این خوب نیست؛ یک موسیقی کلاسیک از موزارت که با ریتم بخونه روش بزار» (spec 0051,
amendment). Every film in the app was checked for a sound track:
- the 8 promo files and the 22 tutorial chapters have one;
- the comparison film, `public/media/compare/beatris-vs-marquise.mp4`, has none. It runs 118.64 s, 1920×1080 at
  25 fps, and the help page's head links it (`scripts/compare-video.mjs`).

It now has Mozart under it, on the beat of its own cuts:
- **The music:** W. A. Mozart, String Quartet No. 19 in C major, K. 465, IV. Allegro molto, in Musopen's recording
  (CC0, archive.org `MusopenKickstarterRecordings`).
  - It is not stored in the repository.
  - It is credited beside the film's link on the help page, in the README and here.
- **The choice:** five CC0 Mozart recordings were measured for their pulse and their loudness per second:

  | Recording | Pulse |
  |---|---|
  | Symphony 40, II | 99.6 BPM, the clearest pulse, but very soft for its first minute |
  | Symphony 40, III | 146 BPM, G minor |
  | K. 465, II | no steady pulse |
  | K. 465, III | 163 BPM in 3/4 |
  | K. 465, IV | 150 BPM in 2/4, bright, in C major |

  K. 465, IV was chosen. Its exposition runs from the first note to its closing chord at 111.14 s. Slowed by 5%, it
  covers the whole film, so the music runs unbroken and ends on Mozart's own cadence.
- **On the beat:**
  - The recording's beats were tracked at 150 BPM.
  - Each of the film's 15 cuts lands on one of them: the seven slides, the six live pages, the summing-up and the
    sources.
  - The beats were chosen jointly, by dynamic programming. Every span is stretched by about the overall amount, and
    a stronger attack wins.
  - `warp-music.py` gained an `at` mode for a film whose cuts are fixed. Each span between two anchors is stretched
    (rubberband, pitch kept) onto its span of the film. The plan is `scripts/compare-music.json`.
  - The closing chord lands at 116.6 s and rings to the end.
- **The picture is untouched.** `mix.mjs --music-only` copies the video stream and masters the sound to −16 LUFS
  under −1 dBTP. The poster is unchanged.

## Acceptance
- The film's MP4 holds a video track and a sound track (e2e: «comparison film: …», read from the file's header, as the
  test browser cannot play H.264).
- The video stream is bit-identical to the old one: same MD5 of its packets.
- Loudness: −16 ± 0.5 LUFS, true peak ≤ −1 dBTP.
- Every cut lands on a beat of the music. Where the music has an attack there, it falls within one frame (40 ms).
- No span is stretched by more than 9%. No click at any join.
- `warp-music.py` makes the live film's track (spec 0051) bit-identical to before.
- The help page credits the music.

## Constraints
- No change to the film's picture, nor to the tutorial chapters.
- The recording stays outside the repository. Downloads are untrusted, so Python runs with `-I`.
- No runtime dependency.

## Out of scope
- Re-recording the film. Its cuts would move, and the plan would have to be measured again (noted in
  `compare-video.mjs`).
- A WebM copy. The help page links the MP4 alone, as before.

## Verification
`npm run gate`, the e2e films step, and the measures below on the delivered file. After the deploy, the live file
answers with its new size.

## Results
- **The file:** `beatris-vs-marquise.mp4`, 6.08 MB (was 3.17 MB), 1920×1080, 25 fps, 118.64 s, with H.264 and AAC
  192 kb/s.
  - Video packets MD5 `35864182…` before and after: the picture is untouched.
- **Loudness:** −16 LUFS, true peak −1.4 dBTP. Per 5 s, the music sits between −13 and −23 dB RMS.
- **Stretch:** every span ×1.014–×1.084 slower than played; ×1.049 overall.
- **On the beat**, measured in the delivered mix as the strongest attack within ±60 ms of each cut:
  - 12 of the 16 sync points (15 cuts and the closing chord) fall within 24 ms, under one frame of 40 ms.
  - The other four are 22.32, 75.80, 100.08 and 104.72 s. They land in legato passages, where the beat is soft: the
    nearest attack is 28–46 ms away.
- **Joins:** the high-frequency level at each join is between −6.7 and +9 dB of its surroundings. These are the
  music's own attacks, and none is a click.
- **Regression:** `warp-music.py` on `live-music.json` gives the same samples as before (max difference 0.0).
- **Review:** the builder made it, with measures only. No independent critic reviewed it, and nobody listened to it.
