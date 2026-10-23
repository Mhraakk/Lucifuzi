# 0042 — The OpenMontage teaser «یک گرم، یک حساب»

**Status:** implemented.

## What
A 30-second promo, 1920×1080 at 60 fps, made with OpenMontage (its animation pipeline: research, proposal, script,
scene plan, assets, edit, compose, publish) and OpenMontage's HyperFrames runtime. One real coin, the app's own photo of
a تمام بهار آزادی, carries the story from its facts to the address:
- the coin showcase (spec 0041);
- the live sales desk (spec 0037);
- slide to book and the customer's signature (spec 0040);
- the day book;
- the tax rule;
- the market and its price alert;
- the coin lab;
- the role desks (spec 0038).

The help centre shows the film above the chapters, in the place of «رؤیای طلایی». That film's files stay, and the
teaser box links to it.

The source lives in `scripts/promo-film/one-gram/`:
- `index.html` is the composition;
- `stage.mjs` copies it and its assets into an OpenMontage project;
- `mix.mjs` makes the master.

The screens come from `app-shots.mjs` and `showcase-shots.mjs` with `--out=shots-gram`. `scripts/promo-film/README.md`
has the commands.

### Storyboard
The cuts sit on the bars of the music (117.1 BPM, so a bar is 2.049 s).

| Time (s) | What is seen | Why | Out |
|---|---|---|---|
| 0–4.1 | The coin turns over beside «هر گرم طلا، یک حساب دقیق.». Three facts snap on with the beats: ۸٫۱۳۳ گرم، عیار ۹۰۰، قطر ۲۲ میلی‌متر. | The app is about exact gold. | The coin steps aside. |
| 4.1–6.1 | Today's price rolls in digit by digit: ۲٬۳۳۴٬۹۷۰٬۰۰۰ ریال, marked «نمونه». | Live prices. | The coin dives into the ring. |
| 6.1–8.2 | The showcase ring turns: eight cards, both faces of four coins. | Spec 0041. | A card opens. |
| 8.2–10.2 | The coin's window: weight, fineness and price. | The details. | It slides away. |
| 10.2–12.3 | The live sales desk arrives in strips, and its showcase is ringed. | Spec 0037. | It slides away. |
| 12.3–14.3 | Slide to book: the handle travels, «ثبت شد» appears, and a ripple spreads. | Spec 0040. | — |
| 14.3–16.4 | The receipt. The customer signs while a pen nib rides the stroke, then the stamp lands. | Spec 0040. | It slides away. |
| 16.4–18.4 | The day book arrives in strips under a gold underline. | روزنگار. | — |
| 18.4–20.5 | «مالیات ۱۰٪ فقط روی اجرت و سود.» above a bar: wage and profit taxed, gold exempt. A glint crosses the taxed part. | The 1405 rule. | — |
| 20.5–22.5 | The market arrives in strips. In the alert pill a target is typed, «خبرم کن» is pressed and the bell rings. | The market and its alert. | — |
| 22.5–24.6 | The coin lab, with a scan line. | Authenticity. | — |
| 24.6–26.6 | Three role desks fan out. | Spec 0038. | The coin flies to the end card. |
| 26.6–30 | The coin, «بئاتریس», «حساب طلا، دقیق و آرام», «ورود با ایمیل» and the address, then the credits. | What to do next. | — |

### Truth
- **Screens:** every screen is the app's own, shot from a seeded demo shop in the day skin.
- **Prices:** they are sample prices. The price scene and the end card both say so.
- **The coin's facts:** they are the app's own data (`coins.mjs`): 8.133 g, fineness 900, 22 mm.
- **The tax line:** it is the rule the app applies. 10% falls on wage and profit only; the gold itself, stones and coins
  are exempt. The bar is a picture of that rule, not of any amount.

### Deterministic
- **Timeline:** one paused GSAP timeline drives everything, and every value is a function of time.
- **Randomness:** the few random starts come from a seeded generator.
- **The pen nib:** it is sampled from the same eased length that draws the stroke.

### Sound
- **Music:** «Autofahren» by Mauro Urbina (Mixkit, free licence), edited to 30 s on its own bar grid. It is not in the
  repository.
- **Effects:** they come from HyperFrames' bundled library (Pixabay licence):
  - a soft whoosh on every sideways transition;
  - pops on the facts, the stamp and the alert field;
  - clicks on taps and presses;
  - one chime on «ثبت شد»;
  - a glint sound on the coin and on the tax bar;
  - typing on the alert's target.
- **Timing:** each effect starts so that its audible onset meets its event; the files' own leading silence is skipped.
- **Levels:** each effect's volume is solved in its own frequency band against the music, with floors for the bands
  where this dark score is nearly silent. Repeated sounds are kept at one level.
- **Master:** `mix.mjs` rebuilds the mix from the composition's own `<audio>` tags and masters it to −16 LUFS, with
  true peak at or below −1 dBTP.

## Acceptance
- **The file:** 1920×1080, 60 fps, 30 s ± 0.1, H.264 High with faststart, AAC 48 kHz. There is a WebM and a JPEG
  poster.
- **Picture:** no more than 1 s of near-frozen time outside the end card. This is measured with the business-motion-film
  `frozen-time.sh`: a luma difference below 0.35 between frames sampled at 10 fps.
- **Sound:** loudness of −16 ± 0.5 LUFS, with true peak at or below −1 dBTP.
- **Composition:** HyperFrames `lint` reports 0 errors, and `validate` finds no console errors and every text passing
  WCAG AA.
- **e2e:** the help centre lists «یک گرم، یک حساب». Its file answers as `video/mp4`, full HD and 30 s long.

## Constraints
- **OpenMontage (AGPL):** it is used as a tool only, and none of its code is in the repository. GSAP (GreenSock licence)
  and the music are staged into the OpenMontage project, not committed.
- **Credits:** the end card and the help centre credit the coin photo (M.samei, CC BY-SA 4.0) and the music. The README
  credits the effects as well.
- **Imagery and fonts:** no stock imagery and no generated imagery. The fonts are the app's own: Markazi and Estedad.
- **The tutorial films:** they are not touched.

## Out of scope
- **Narration and a vertical cut.**
- **An independent critic:** none judged the film. The builder reviewed it with contact sheets and the measurements
  above.

## Verification
- `npm run gate`.
- The e2e teaser check.
- The two measurements (`frozen-time.sh` and `loudness.sh`) on the delivered MP4.
