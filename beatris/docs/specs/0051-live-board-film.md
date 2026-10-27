# 0051 — «تابلوی زنده»: a 35 s film of the live market prices

**Status:** done.

## What
The owner asked for a promo film:
- **Content:** it introduces the app's new capability, prices and the market, plus one more of the app's capabilities.
- **Length:** 35 seconds.
- **Craft:** all the motion-graphics skills taught so far, attention to detail, and the best film made yet.
- **Music:** outstanding, chosen the way the previous one was.
- **Delivery:** sent here.

The film is `public/media/promo/beatris-live-market.mp4`: 1920×1080 at 60 fps, 35.0 s, with a JPEG poster and a
VP9 WebM beside it for browsers without H.264. The help centre shows it above the teaser.

- **The price capability (spec 0049):**
  - one request to forgod brings the whole market;
  - every update is checked (the 18k gram against ounce × dollar);
  - 25 currency rates reach the trade desk;
  - 50 requests a day are planned by the app itself;
  - the analysis runs on the live price.
- **The other capability: market-language entry (spec 0020).** One typed sentence becomes a trade line priced from
  the board's مظنه, then a saved document with its tracking code.

### Truth
Every number on screen is real, or worked out by the app's own code:
- **The prices** are forgod's real answer of 4 Aban 1405, 16:48 Tehran.
  - It was saved during the 5 test requests of spec 0049, and it holds no key.
  - It is kept outside the repository.
  - On screen it reads «forgod.qzz.io · ۴ آبان ۱۴۰۵ · ساعت ۱۶:۴۸».
- **`live-data.mjs`** turns that answer into `stories/live-data.json` with the app's own functions:
  - `parseForgod`;
  - the check against ounce × dollar;
  - `impliedMesghal`, `impliedUsdMesghal`, `coinIntrinsic` and `bubble` (the market page's analysis);
  - `forgodPlan` and a 24-hour run of the market worker on a fake clock (the dial: 39 day ticks and 4 night ticks,
    43 a day);
  - `parseLine` and `resolveMazaneh` (the sentence).
- **The app's screens** come from a fresh demo server. Its network is `forgod-replay.mjs`:
  - forgod's `/api/all` is answered from the saved file, and any other forgod address is refused;
  - tgju fails at once;
  - the clock is moved to 16:50 that day;
  - the key is a dummy, so nothing is sent to forgod.
- **`live-shots.mjs`** takes the screens at twice the density, in the day skin, with the browser on Tehran time:
  - the market page;
  - the market data page;
  - the desk with a euro line, which starts at the live rate, 3,048,800 rial;
  - the sentence «خرید از مریم رضایی ۱۲٫۴۵ گرم آبشده ۷۵۰ ۲۰ خط زیر مظنه نقد ثبت کن» and its parts;
  - the saved document, whose tracking code is M1405-00001.

  It writes what the app worked out to `stories/live-app.json`.

### The film
- **Structure:** 14 compositions cut on the bars of the track (123.826 BPM; a bar is 1.938 s).
- **Materials:** a graphite LED board and an ivory paper stage.
- **Transformations:**
  - an LED row becomes the board, then the app's real market page;
  - a beam splits into the four sections of one request, then becomes the check;
  - the euro tile flies onto the desk's rate field;
  - the dial's hand becomes a price line, then the analysis cards;
  - the مظنه row drops into the command bar, the sentence types, and it folds into the receipt.
- **The rail of lines:** five lines on a persistent rail at the foot. Each is held for its reading time
  (letters ÷ 15 + 1.5 s), which the page checks when it loads.
- **The end card:**
  - the crown;
  - «بئاتریس»;
  - «قیمت زنده؛ معامله به زبان بازار»;
  - «وب‌اپ روی گوشی و کامپیوتر» and «ویندوز ۱۰ و ۱۱ (۶۴ بیت)»;
  - the address;
  - the small print: the price source and time, the music, the effects and the type.

### Music
The method of the previous film was used again: Mixkit candidates measured for tempo, pulse, dynamics, the arrival of
the groove and a usable ending, then ranked.

- **Chosen:** «Rising Forest» (Diego Nava, Mixkit 471): 123 BPM, pulse 0.83, LRA 8.0.
  - The film takes one unbroken stretch of it from 44.981 s, the build of its bar 23.
  - Its drop lands on the film's bar 1.
  - Its own stop and last hit land on the end card.
- **Alternate cut**, not in the repository: «Autofahren», the music of the earlier films, under the same picture.
  - It is stretched ×1.058307 from 31.881 s, so its kicks meet the film's bars.
  - It is mastered to the same loudness.
- **Effects:** HyperFrames' library (Pixabay licence).
  - Each sound's level is solved against the music alone, in its own band.
  - A sound keeps one level, lower only where the music is quiet.

### `mix.mjs` (shared with spec 0047)
- A `MUSIC` without `end` takes one unbroken stretch: `from`, `dur`, a 5 ms fade in, and `fade` out.
- `MUSIC_FROM` and `MUSIC_TEMPO` lay another track under the same picture (rubberband).
- `--music-only` leaves out the effects. This is the fallback mix.
- An effect now starts where its attack begins, not where its silence ends. An attack begins at the first 5 ms within
  20 dB of the effect's own peak. The bundled pop has 90 ms of soft lead-in, which made every pop late by that much.
- The films of spec 0047 keep their music edit, because their `MUSIC` has an `end`.

## Acceptance
- `public/media/promo/beatris-live-market.mp4`:
  - 1920×1080, 60 fps, 35.0 ± 0.3 s;
  - H.264 High with faststart, AAC 48 kHz;
  - at most 14 MB;
  - a JPEG poster beside it, and a VP9/Opus WebM of the same mix.
- The help centre shows «تابلوی زنده» above the teaser, with its credits. The e2e step «visual quality» checks that both files
  answer as video and that the picture is 1920×1080, 35 s.
  - The check gives up after 20 s instead of waiting for ever.
  - The test browser has no H.264, so it reads the WebM. The first version of the check, with the MP4 alone, hung
    there.
- Loudness on the encoded file: −16 ± 0.5 LUFS, true peak ≤ −1 dBTP.
- The effects' hits start within one frame of their picture events in the decoded mix.
- **Picture:**
  - no black frame;
  - no hold over 0.6 s outside the end card (`frozen-time.sh`);
  - every line passes its reading time;
  - settled lines and the source line are at least 4.5:1 against what is behind them.
- **Determinism:** after `seek(t)`, nothing that can be seen depends on what was shown before. This is checked for
  every quarter beat ± 1 frame, and every half second, after four different seek orders.
- Every number on screen comes from `live-data.json` or `live-app.json` as described under Truth.

## Constraints
- **forgod:** no request to forgod, and no key anywhere. The capture runs on a dummy key and the saved answer.
- **Licences:** the music and the effects stay outside the repository, with credits on the end card, in the help centre
  and in the README.
- **Not touched:**
  - the tutorial films;
  - the films of spec 0047 (re-mixing them is not part of this).
- **Type:** no letter-spacing on Persian.
- **Determinism:** every frame is a function of time alone. No `requestAnimationFrame`, `Date` or unseeded random.

## Verification
- `node scripts/promo-film/stories/render.mjs live`, then `--sheet` and `--stills`.
- `MUSIC=…/rising-forest.mp3 node scripts/promo-film/stories/mix.mjs …`.
- `ebur128`, `blackdetect`, `freezedetect`, the skill's `frozen-time.sh` and `ffprobe`.
- `npm run gate`, the e2e step «visual quality», and the full e2e.

## Results
- **File:** `public/media/promo/beatris-live-market.mp4`, 13.2 MB, with a JPEG poster (the LED board at 3.55 s).
  - 1920×1080, 60 fps (2,100 frames), 35.00 s;
  - H.264 High (level 5.0, CRF 20) with faststart; AAC 48 kHz stereo.
  - Beside it, `beatris-live-market.webm` (13.2 MB): VP9 at CRF 32 and Opus at 128 kb/s, from the same master.
  - The help centre shows it above the teaser. Its codecs string is `avc1.640032`.
- **Loudness** (measured on the encoded file):

  | Mix | Integrated | True peak |
  |---|---|---|
  | the film | −15.9 LUFS | −4.2 dBTP |
  | music only (fallback, not in the repository) | −15.9 LUFS | −4.8 dBTP |
  | the Autofahren alternate (not in the repository) | −15.9 LUFS | −1.1 dBTP |

- **Sync**, in the decoded film against the music-only mix:
  - every click, pop and sparkle starts within 4 ms of its picture event;
  - the whooshes rise 20–57 ms after their cue, which sits before the cut, so the swell lands on it.
  - Two faults were found and fixed on the way:
    - the pops were 90 ms late, from the soft lead-in described above;
    - the stamp's sound came 0.16 s before its impact. The impact now lands on the beat, with the sound.
- **Levels:**
  - The key-press could not rise above this track in its band, even at the peak cap, so it was replaced: a pop on the
    stamp and a soft click on Enter.
  - The lifts on the film: the 50 ms peak in each sound's own band, and its 150 ms body:

    | Sound | In its band | Body |
    |---|---|---|
    | clicks | +3.5 to +5.8 dB | +3.9 to +6.0 dB |
    | typing | +3.5 to +5.7 dB | +4.5 to +4.9 dB |
    | pops | 0.0 to +6.0 dB | +2.1 to +6.2 dB |
    | whooshes | 0.0 to +5.9 dB | +3.6 to +8.2 dB |
    | sparkles | +2.3 to +4.2 dB | — |
    | the chime | +2.3 dB | +4.5 dB |

    The 2–8 kHz band never rises more than +3.9 dB.
  - scipy is not installed here, so the skill's solver was ported to numpy, with the same 4th-order band-passes taken
    from their exact magnitude.
- **The music grid:**
  - Rising Forest's drop lands on bar 1, and its stop and last hit on the end card.
  - The alternate's kicks meet bars 1–15 within 1.5 ms. At 117.14 BPM they had drifted from −13 to +18 ms; the
    stretch was refined to ×1.058307.
- **Picture:**
  - `blackdetect` found no black frame.
  - `freezedetect` (−50 dB, 0.5 s) found no hold.
  - `frozen-time.sh` at 10 fps:
    - seven isolated samples, none longer than 0.1 s (8.4, 19.5, 20.6, 20.7, 23.9, 25.7 and 28.9 s);
    - then the end card, from 31.2 s, which is allowed.
  - Every line passes its reading time when the page loads.
- **Contrast**, measured on the rendered frames against the pixels beside the text:
  - the lines: ink 15.9–17.3:1, gold 4.6–5.1:1;
  - the source line: 5.0–5.1:1;
  - the end card's small print: 4.7–4.9:1, and its gold 4.7–4.8:1.

  The gold of the lines (3.2–3.5:1), the source line (3.3:1) and the end card's small print failed first, so their
  colours were darkened.
- **Determinism:**
  - 360 times, every quarter beat ± 1 frame and every half second, were each reached after four different seek orders.
  - 50 hidden elements keep state from an earlier visit; none of them can be seen at that moment.
  - Screenshots of one state differ only at glyph edges (a mean of 1.3 levels). That is the browser's rasterising, not
    the page.
- **The last review round**, from the contact sheet at one frame a second and stills at every cut ± 0.2 s:
  - while the sentence types, the bar and its parts now sit in the middle of the frame;
  - the camera rises to the price and the line as they arrive.
- **Truth:** the board, the check (26,325,497 against 26,459,000, 0.5% apart), the 25 rates, the plan (43 a day), the
  analysis (a hidden dollar of 273,597, the Emami coin's bubble of +4.6%), the sentence's price (1,144,180,000 rial),
  its value (3,288,480,000 rial) and the tracking code M1405-00001 are the app's own results, as described under Truth.
- **Tests:**
  - `npm run gate`: 503 / 503;
  - e2e, the steps «forgod», «market desk», «web app» and «visual quality»: 78 / 78;
  - the full e2e: 724 / 724, 0 browser errors.
- **Review:** the builder made it, with the sheets and measures above. No independent critic reviewed the film, and
  nobody listened to it before delivery.

## Amendment: Mozart, on the beat
**Asked:** «ویدیو ها موسیقی ندارند و این خوب نیست؛ یک موسیقی کلاسیک از موزارت که با ریتم بخونه روش بزار».

Both films that had been sent did carry their music track (AAC, −15.9 LUFS). The music is now Mozart all the same.

### What
- **The music:** W. A. Mozart, Symphony No. 40 in G minor, K. 550, IV. Allegro assai, in Musopen's recording, CC0
  (archive.org `MusopenKickstarterRecordings`).
  - It is not stored in the repository.
  - It is credited on the end card, in the help centre and in the README.
- **The choice:** four CC0 Musopen recordings of Mozart were measured for their half-note tempo, the clarity of their
  pulse and their loudness per second:
  - the overture to «Le nozze di Figaro»: 150;
  - Symphony 40, I: 104;
  - Symphony 40, IV: 131.7;
  - the overture to «Die Zauberflöte», its Allegro: 153.

  Only IV comes within 6% of the film's grid at two music bars per film bar, and its pulse is steady from start to end
  (65.97 and 65.38 bars a minute).
- **The beat.**
  - The film's grid moves from 123.826 to 128 BPM, so one film bar is 1.875 s.
  - The finale opens with two-bar phrases in turn, the piano rocket then the forte answer, each starting with a tutti
    attack on its upbeat.
  - `scripts/promo-film/stories/warp-music.py` reads `live-music.json`, which lists the measured attack of each of
    the 17 phrases. It stretches each phrase with rubberband (×0.99–1.06, pitch kept) so that its attack falls on a
    film bar line.
  - The coda's own last bars follow: two more bars, with the final chord on bar 18 (33.75 s) and the end card's
    glint, ringing out to the end.
- **The sound.**
  - The orchestra's piano and forte are 20 dB apart, so each cue gets its own level, solved against the music alone
    by the same rules. A sound therefore follows the score.
  - The tonal sounds are tuned into G minor with `p` (semitones) in each cue; `mix.mjs` shifts them with rubberband:

    | Sound | Was | Now |
    |---|---|---|
    | chime | A | G |
    | sparkle | C | B♭ |
    | pop | E | D |
    | click | G♯ | G |

- **Kept as they were:** the frames, the captions and every number. Everything is retimed by the grid alone.

### Results
- **Files:**
  - `beatris-live-market.mp4`: 13.1 MB, 1920×1080, 60 fps, 35.00 s, H.264 High;
  - `.webm`: 13.0 MB;
  - the poster.
- **Loudness:**
  - −16.3 LUFS, true peak −1.7 dBTP, on both files;
  - the music-only mix: −16.2 LUFS.
- **On the beat**, measured in the decoded mix:
  - all 12 forte phrase attacks fall within 17 ms (one frame) of their film bar lines;
  - the piano attacks, which are soft and ill-defined, fall within 50 ms;
  - the effect hits fall within 15 ms of their picture events.
- **Picture:**
  - no black frame;
  - no hold of 0.5 s or more;
  - `frozen-time.sh` finds isolated samples only, then the end card;
  - every line passes its reading time at the new tempo.
- **Skills:** the `npx skills` CLI from vercel-labs/skills was learnt and used to find and read skills without
  installing them.
  - `iart-ai/motion-design-skills@beat-sync-editing` gave the checklist used here:
    - anchor the grid on the music's first beat;
    - cut on phrases;
    - land the biggest moment on the hit;
    - check the beats against the frames.
  - Installing it, and `find-skills`, into the agent's skills folder was refused by the session's permission check,
    so they are not installed.
- **Review:** the builder made it, with the same sheets and measures as before. No independent critic reviewed it, and
  nobody listened to it.
- **CI on `38150d0`:** the browser run passed 721 of 724 checks.
  - The uploader held «حذف» while the page was still scrolling smoothly to the photo it had just added. The button moved
    from under the pointer, so the hold ended and the photo stayed. The showcase then counted five coins, which failed
    its two checks.
  - The film had no part in it. The e2e's `holdApp` now presses only once its button has stood still for a dozen
    frames.
  - Run alone, with the page's processor slowed 6× through Chrome's own throttling, the uploader's delete fails as on
    CI before the change and passes after it.
