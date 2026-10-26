# 0047 — Three stories: the app, its capacity and its control room

**Status:** done.

## What
The owner asked for a new motion-graphics teaser:
- **Reference:** use Mercury's «Payroll» launch film (whatships.com/videos/mercury-payroll) as a model for different
  designs.
- **Shape:** build it in three storylines.
- **Music:** use the last music of the project, «Autofahren» (Mixkit).
- **Content:** introduce the app in detail, its abilities and capacities, and the control section.
- **Tools:** install the nine video resources they named and use them.

So there are three films, each about 32 seconds, 1920×1080 at 60 fps. Each has its own design, all cut to the same
track:

| Film | Story | Design |
|---|---|---|
| **۱. یک روز پشت پیشخوان** | A day of the shop, morning to night, on its own screens: the market's sample prices, the sales desk and a compare click, the cart line added up (the tax only on the wage and the profit), «اگر…؟», the saved sale and the customer's screen, one click to the card reader, the receipt, the day book, the pulse, the dashboard's warning and the day close. | **Living screencast** on ivory: the app's real screens (day skin) in one window with a camera, a cursor that clicks and gold marks; one short line per two bars on the right; gold dust that gathers into the entrance's crown. |
| **۲. ظرفیت** | What the app holds and how it is checked, as numbers that are true. | **Swiss grid:** paper, black type, one gold signal colour, giant numerals beside small notes, every move on the beat. |
| **۳. اتاق کنترل** | The control section: a number that explains itself («؟»), the overview, the exceptions with their probability, the twin and time machine, the ten-day forecast with due cheques, the clue palette, and the wall of its twelve tools. | **Dark keynote:** a graphite stage, the app's calm (dark) skin, screens that arrive on a curved track from the right, one gold accent, one giant number. |

### What was taken from Mercury, and what was not
- **Taken (the grammar):**
  - the real product as the star;
  - short lines that blur in and out between screens;
  - camera push-ins on a click;
  - a table that fills row by row, and a number that counts;
  - a bar that grows;
  - a calm, even pace of two to four seconds a beat;
  - a final line in the form «You build X. Mercury handles Y.»;
  - a quiet logo lock-up with the small print.
- **Not taken:** its interface, layouts, colours, typeface, footage, logo or words.

### The nine resources
They were cloned into the session's scratch space, outside the repository, and read before anything ran.

| Resource | Licence | Used for |
|---|---|---|
| lemomo-ai/lemo-opuscar | MIT | The method: `DIRECTOR.md` and `TECHNIQUE.md` (treatment first, three candidate structures, one native move, the cue map on the music grid, readable holds, a review loop with contact sheets, loudness). The three designs follow its styles `living-screencast`, `swiss-motion` and `dark-keynote`, as grammar only. |
| Vincentwei1021/mg-styles-15 | MIT | Its rubric for judging a motion-design film. |
| mexicat/pdoom-video | MIT | Its rule that every frame is a pure function of song time. The renderer here keeps it. |
| JohnHeibel/ClaudeAnimationBase | MIT | Read. Its subject, character animation in p5.js, has no place in these films. |
| athemeroy/awesome-claude-5-5-videos | CC BY 4.0 | Its research notes on what recurs in strong code-made films. |
| joeseesun/opus-video-prompts | none stated | Read only (no licence, so nothing is copied). |
| kingbootoshi/video-alchemy | MIT | Read. It edits talking-head footage, which these films do not have. |
| imtamiliniyan/claude-video-skills | MIT | `MOTION-STYLE.md` as a checklist. Its Remotion pipeline is not used: React and Remotion's own licence stay out. |
| vyn-store/claude-code-video-editing | none stated | Read only. |

No code from any of them enters the repository.

### How it is made
- Each film is one page that draws its frame from the time alone (`window.seek(t)`), with a small kit of pure easing,
  camera, cursor and word functions (`kit.mjs`). There is no animation library and no free-running clock.
- A recorder (`render.mjs`) steps through the frames in a headless browser and pipes them into ffmpeg. Next to the
  picture it writes the film's sound cues and music edit.
- The screens are the app's own, captured at twice the density from fresh demo shops:
  - the day skin by `app-shots.mjs --out=stories/shots-day`;
  - the control tabs in the calm skin by `stories/control-shots.mjs`, after three weeks of trades, two cheques due
    within ten days and one odd price go in through the API.
- The music is cut on its own bar grid: 117.14 BPM, so a bar is 2.049 s. Each film uses fifteen bars of a different
  part of the same track, then the track's own ending under the end card:
  - film 1 from 0.1 s (the build-up from its opening);
  - film 2 from 32.88 s (the full groove);
  - film 3 from 151.71 s (the section with breaks).
- The effects come from HyperFrames' bundled library (Pixabay licence). `mix.mjs` lays each on its picture event, with
  its own leading silence skipped so the onset meets the frame.
- Each master is −16 LUFS with true peak ≤ −1 dBTP.
- The source goes in `scripts/promo-film/stories/`. The screens, the music and the effects stay out of the repository.

### Truth
Every fact on screen is the app's own or a measured result of this release:
- **Events:** 90 shop events in 10 groups (spec 0026).
- **Calculators:** 14 calculators on screen, read back 9,200 times without a wrong figure (spec 0044).
- **Exactness:** 200,000 inputs per formula, 0 differences (spec 0045).
- **Calendar:** 201 years of the Persian calendar checked day by day (spec 0044).
- **Hundred rounds:** 100 rounds of the desk without a failure (spec 0029).
- **Shops:** each shop has its own database.
- **Roles:** four workspaces.
- **Tests:** 486 automated tests in the gate (`npm run gate`, 486 / 486 on this release).
- **Speed test:** a shop of 20,000 documents in the speed test (spec 0004).
- **Examples:** the exact gram (1.047 g at 875 → 1.222 g of 750) and the tax rule (10% on wage and profit only).
- **The cart line in film 1:** 820,800,000 + 215,542,080 + 21,554,208 = 1,057,896,288 rial, read off the desk's own
  screen; the tax, 21,554,208, is exactly 10% of the wage and profit, 215,542,080.
- **The control room in film 3:** the pulse of 63% and its reasons, the exception probabilities (85%, 75%, 69%), the
  forecast and the twin are what the demo shop's own control tabs show; the twelve tools are its twelve tabs.
- **Prices:** they are sample prices and say «نمونه».
- **Names:** the people are the demo shop's.

## Acceptance
- **The files:** three films, each 1920×1080, 60 fps, 30–35 s, H.264 High with faststart, AAC 48 kHz, plus a JPEG
  poster each.
- **Picture:**
  - no blank or black frame;
  - no more than 1 s of frozen picture outside the end card;
  - every line of text stays at least its reading time (letters ÷ 15 + 1.5 s, at least 1.8 s for a line). Each film
    checks its own lines when it loads, and the recorder fails on the error.
- **Sound:**
  - every cut and key action lands on the bar grid (±1 frame);
  - −16 LUFS ±0.5, true peak ≤ −1 dBTP.
- **Three designs a viewer can tell apart from one frame each:** ivory screencast, Swiss paper, dark stage.
- **Truth:** every number on screen is in the list above, and the people are the demo shop's.
- **Review:**
  - contact sheets of every film, at one frame a second, looked at before delivery;
  - one fix round.

  No independent critic reviewed them (the owner's rule on subagents); the report says so.

## Constraints
- No new runtime dependency.
- The app is not changed for the films.
- The tutorial films are not touched (the owner's rule).
- No third-party code, music, footage or logo in the repository.
- The credits name the music, the effects, the fonts and the coin photograph (M.samei, CC BY-SA 4.0) wherever it
  appears.
- Persian type: no letter-spacing, and words move as words (letters never break apart).

## Verification
- `node scripts/promo-film/stories/render.mjs <film>`, then `mix.mjs`.
- `ebur128` and `blackdetect` on each master.
- The read-time and cue checks.
- Contact sheets.

## Where it differs
- **Length:** each film is 34.16 s, fifteen bars plus the track's own 3.43 s ending under the end card. So the
  acceptance reads 30–35 s, not the 32 s first planned.
- **No GSAP:** the films need only easing, a camera, a cursor and words. A small kit of pure functions (`kit.mjs`) does
  that, so no animation library is fetched or vendored.
- **The exact gram** is shown only in film 2. In its place, film 1 shows the cart line of the sales desk, added up from
  its own screen: the tax on the wage and profit only.
- **Separators:** the films use the app's own font fallback. Estedad leaves U+066B–066C (٫ ٬) to Vazirmatn, as
  `app.css` does, so the numbers look like the screens.
- **Published:**
  - films 1 and 3 are re-encoded at CRF 20 from their CRF 16 masters, which cuts a third of the size;
  - film 2 is published as its master;
  - the masters stay outside the repository.

## Results
- **Files:** `public/media/promo/beatris-counter.mp4` (13.9 MB), `beatris-capacity.mp4` (5.6 MB) and
  `beatris-control.mp4` (13.6 MB), each with a JPEG poster.
  - All are 1920×1080, 60 fps, 34.16 s, H.264 High with faststart, and AAC 48 kHz.
  - The help centre links the three under its teaser. An e2e check makes sure each link answers as video/mp4.
- **Loudness** (`mix.mjs`, measured on the encoded file):
  - film 1: −16.0 LUFS, true peak −1.4 dBTP;
  - film 2: −15.9 LUFS, −1.3 dBTP;
  - film 3: −16.0 LUFS, −1.9 dBTP.

  Film 3 first came out at −0.9 dBTP, because the AAC's inter-sample peaks rose after the master. The mixer now measures
  the encoded file and masters again with a lower peak target until the ceiling holds.
- **Picture:**
  - `blackdetect` found no black frame.
  - `freezedetect` (−50 dB, at least 0.9 s), before the fix round, found holds of 1.27–3.4 s in all three: the
    explain card, the closing lines, and the Swiss numerals.
  - After the fix round, films 1 and 3 have none. Film 2 has one of 0.92 s, under the 1 s limit. The end cards drift
    too.
- **Reading time:** every line is checked when its film loads. The check stopped three lines during the work: film 1's
  opening line, and two lines of film 3. Each was given more time or made shorter.
- **The one fix round, after the contact sheets:**
  - a slow drift on every hold;
  - the app's separators;
  - the lines centred on the window;
  - the saved-sale card moved clear of the invoice number;
  - film 2: the databases fill with gold, and the note changes with its label;
  - the peak ceiling, as above.
- **Truth:** the test count on screen (486) is this release's gate, 486 / 486.
- **Review:** the builder made it, with contact sheets of every film at one frame a second and the measures above. No
  independent critic reviewed the films, and nobody listened to them before delivery.
