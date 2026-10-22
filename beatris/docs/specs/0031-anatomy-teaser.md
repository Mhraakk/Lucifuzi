# 0031 — The anatomy teaser «کالبد یک دفتر طلا»

**Status:** implemented.

## What
A 30-second motion film, 1920×1080 at 60 fps, made from the app's own two anatomy figures (specs 0028 and 0030): the
one-chain machine of `/books/events` and the wave rig of the Elliott studio. It says what Beatris is with the sound
off: every event of a gold shop is one document in one chain, sorted into its section; tampering shows; and the
Elliott count is judged by its rules. It ends on how to start.

`node scripts/promo-film/render.mjs anatomy [fps=60]` renders the frames; `scripts/promo-film/README.md` has the
encode and the mix. The film is `public/media/promo/beatris-anatomy.mp4` (H.264 High, faststart), with a WebM and a
poster, and the help centre shows it above the chapters.

### Storyboard
| Time (s) | What is seen | Why | Out |
|---|---|---|---|
| 0–2.8 | On ink, the one-chain machine is drawn line by line (every edge and seam draws on). | A technical drawing: this is an instrument. | The solids fill in. |
| 2.8–4.6 | The solids fill bottom to top; the card's corners appear: «شکل ۱» and the title. | The object is real and whole. | The camera pushes in on the press. |
| 4.6–11.8 | The press stamps documents 1 and 2. Each gets its number and its code, and coins roll to the drawers of its sections. Caption: «هر رویداد طلافروشی، یک سند» then «هر سند، یک حلقه در یک زنجیره». | The mechanism, at reading speed. | A speed ramp. |
| 11.8–13.8 | Documents 3 to 8 are stamped four times faster; the drawer counters climb to their real totals. | Everything goes through the one chain. | The camera pulls back. |
| 13.8–17.2 | Each drawer lights in turn with its links: آبشده ۴، سکه ۲، شمش ۱، ارز ۲، وجه ۷. Caption: «پنج بخش، یک دفتر». | Sections without separate books. | — |
| 17.2–20.4 | Link 4 is altered: links 4 to 8 turn red and the dial falls back. Caption: «دست ببرید، از همان حلقه پیدا می‌شود». | Trust. | The machine slides out and the wave rig slides in. |
| 20.4–27.2 | The wave rig: the textbook count (score 100), then «موج ۲ عمیق» (the stop on rail 2 turns red, score 0), then the textbook again. Caption: «الیوت با همان دقت: هر قاعده یک ضامن». | The analysis is judged too. | A fade to the end card. |
| 27.2–30 | «بئاتریس», the line «حسابداری طلافروشی، بازار و الیوت در یک اپ» and «ورود با شماره موبایل». Small print: «تصاویر از خود اپ، با داده نمونه». | What to do next. | Fade out. |

### Truth
- **Drawn by the app's modules:** the film page mounts `mountOneChain` and `mountWave` from `public/js/figures/`,
  served from the repository. So the eight events, their sections, their SHA-256 codes, the drawer counts, the broken
  link and every Elliott verdict and score are the app's own (`trade.mjs`, `sectionsOf`, the event-log rule and
  `ta.elliott`).
- **Captions say only what the figures show:** «داده نمونه» is in the small print.

### Deterministic
- **No clock of its own:** each figure takes `{ manual: true }`. It has no rAF loop, no tour timer and no observer,
  and its state is set by `seek(t)` (the chain) and `pose(prices)` (the rig). The film's `seek(t)` is a pure
  function of `t`, so a frame can be rendered again and come out the same.
- **The tamper** (which needs SHA-256, async) is computed once before the first frame.

### Sound
- **Music:** the nocturne already used by the films, mastered as in the prism teaser.
- **Sound effects:** one soft whoosh per scene change; a dry hit on every stamp of the press at reading speed, on the
  tampered link and on the broken Elliott rule; and a shimmer on the end card. All three are from the kit `sfx.py`
  makes. Their times are the page's own (`window.SFX`, written next to the frames as `sfx.json`), and the mix places
  them there (`encode-anatomy.mjs`).
- **Levels:** the music is kept under the effects, with a loudness target of −14 LUFS and true peak at or below
  −1.5 dBFS.

## Acceptance
- **The file:** 1920×1080, 60 fps, 30 s ± 0.1, H.264 High with faststart, AAC 48 kHz. There is a WebM and a JPEG
  poster.
- **Render:** a frame reached from anywhere in the film is the same PNG, byte for byte (`render.mjs anatomy
  --check`, six frames). The camera's layers carry no `will-change`, so Chrome never keeps a stale raster scale.
- **Picture:** no frozen stretch longer than 0.6 s outside the end card (measured with ffmpeg `freezedetect`).
- **Sound:** loudness from −15 to −13 LUFS, with true peak at or below −1.4 dBFS.
- **e2e:** the help centre lists the teaser, and its file answers with `video/mp4`.

## Constraints
- **Built from the app:** no screenshot stand-ins, no stock imagery, no fonts but Estedad.
- **Colours:** the app's tokens.
- **Figures in the app are unchanged:** `manual` is opt-in, and without it the figures behave exactly as before
  (their tests and e2e pass unchanged).

## Amendment — the camera never stands still (2026-10-12)
- **What the first measure found:**
  - `freezedetect` called five stretches frozen: 1.05 s at 3.1 s, 1.62 s at 6.6 s, 1.23 s at 9.8 s, 0.78 s at
    11.0 s and 0.6 s at 26.3 s.
  - A rolling coin or a changing counter moves too few pixels to count as motion.
- **The camera now always moves:**
  - It dollies in slowly while the drawing builds (scale 0.955 to 1, from 0 to 6.2 s).
  - After the push-in on the press, it tracks along the rail after the coins: 150 px and 5% closer, eased over 5.4
    to 13.4 s, and released by the pull-back.
  - After the pull-back it drifts at a steady rate (3.5% from 13.4 to 20.4 s).
  - The rig is drawn 18% larger, so it fills the frame. It glides 60 px and 7% closer until the end card.
- **The press:** the spring is drawn as spec 0028's amendment describes, so the film shows the figure as the app
  draws it.
- **Review stills:** `render.mjs anatomy --stills=3.5,7,26.5 [--out=dir]` renders stills from the same clock.
- **Measured after the change:**
  - **Picture:** no frozen stretch. All six `--check` frames come out the same.
  - **Sound:** −14.1 LUFS, with true peak at −1.6 dBFS.
  - **File:** 1920×1080, 30 s, H.264 High 4.2 (`avc1.64002a`) with its index first. The MP4 is 11.1 MB and the WebM
    6.9 MB.

## Amendment — the help centre shows «رؤیای طلایی» (2026-10-22)
- **Why:** this film's end card says «ورود با شماره موبایل». Spec 0034 retired that sign-in, so the help centre
  would be promising a door that no longer exists.
- **Change:** `/help` now opens with the 32 s teaser «رؤیای طلایی» (`public/media/promo/beatris-dream.{mp4,webm,jpg}`,
  `scripts/promo-film/dream.mjs`). It covers email sign-in, the live sales desk and a desk for every role.
- **This film:** its sources and files stay in the repository as they are; the film itself is not changed.
- **Same encoder:** `encode-anatomy.mjs` encodes both films (`FILM=anatomy|dream`) and checks both against this
  spec's measures: −14 LUFS ±1, a true peak at or below −1.4 dBFS, and no frozen stretch before the end card.
