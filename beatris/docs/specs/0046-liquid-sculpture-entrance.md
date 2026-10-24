# 0046 — The entrance: a liquid gold sculpture

**Status:** done. The live look follows the deploy.

## What
The owner gave an English prompt: a React component, «Sculpture Hero — liquid particle hero» by
guglielmogiannattasio.it (`liquid-sculpture-hero.tsx` and its `demo.tsx`). They asked that the app's logo and entrance
look exactly like it, live: «لوگو و ورودی اپ درست مثل پرامپت انگلیسی لایو باشه».

### What the prompt is
- A screen-high hero with:
  - a nav: brand, four links, a light/dark switch and one call to action;
  - a sculpture in the band between the nav and the copy;
  - a giant faint word behind the sculpture;
  - the copy: an eyebrow, a two-line headline with an accent in an italic serif, a body and two calls to action;
  - a hint («Move across the form» / «Touch the form»);
  - the credit «by guglielmogiannattasio.it».
- The sculpture is rebuilt from about 100,000 particles, sampled from the image's own pixels and simulated on the GPU
  (WebGL2: a flow map for the cursor's wake, a simulation pass, instanced capsules, an image pass).
  - The cursor turns the material liquid, and it settles back into the crisp image.
  - Without WebGL2, the static image is shown.

### How it comes into Beatris
The app has no React, TypeScript, Tailwind or shadcn, and no build step. Its rules allow no runtime dependency, no CDN
and no script from outside its own origin (CLAUDE.md, CSP).
- **No `/components/ui`.** The prompt's setup (shadcn CLI, Tailwind, TypeScript, a `/components/ui` folder) is not
  added. In this app, `public/js` plays that part: `ui.mjs`, `blocks.mjs` and the page modules. A React component would
  need a bundler and a runtime that the server does not have.
- **`public/js/liquid.mjs` (new):** the component ported line by line to plain JavaScript:
  - the engine (`LiquidEngine`), with its shaders unchanged;
  - the layout (`computeRect`) and `hexToRgb`;
  - `mountSculpture(root, options)`, which does what the component's effects do: one canvas per engine, resize and
    visibility observers, reduced motion, pointer and touch, the image load and the first-frame hand-over.
- **The sculpture is the app's own.** The prompt's images sit on 21st.dev's CDN with no stated licence, and the CSP
  allows only this origin. So the sculpture is rendered with the app's own three.js:
  - interwoven gold filaments rising into the three points of the Beatris crown;
  - the coin as its jewel, a bead on each side point, a woven foot and gold dust;
  - a transparent background, so one image serves both tones (the engine's alpha mode).

  The script is kept: `scripts/sculpture.mjs`.
- **Persian and right to left.**
  - The prompt's Google Fonts (Geist, Instrument Serif) become the app's local fonts: Estedad for text and Markazi for
    the accent.
  - Persian text gets no letter-spacing (CLAUDE.md). Only the Latin backdrop word and the credit keep theirs.
  - Arrows point the way the page reads.
- **`/login` becomes the hero.**
  - **Brand:** the crown mark and «بئاتریس», with no ® (nothing says the name is registered).
  - **Links:** «معرفی», «امکانات», «بسته‌ها», «نسخه ویندوز», and «نصب وب‌اپ» where the browser can install.
  - **Switch and call to action:** the light/dark switch, and «درخواست نمایش» as the call to action.
  - **Backdrop word:** «beatris».
  - **Headline:** «هر گرم طلا / حساب پس می‌دهد.», with the second line in the accent face.
  - **Sign-in:** where the prompt has its body and buttons, the aside holds a short line and the sign-in itself (email,
    code, shop choice, sign-up), unchanged in behaviour.
  - **Hint:** «روی طلا حرکت کنید» / «طلا را لمس کنید».
  - **Credit:** kept.
- **The switch flips the app's own skin pair** (`flipSkin`, spec 0014), so the choice carries into the app. The hero
  shows the prompt's two grounds: paper #EBE9E5 with ink #151514, and night #111110 with #F1EFEA.
- **Demo accounts** (demo servers only) stay, under the hero.
- The previous entrance (the turning daric and its quote) is retired.

### Where it differs from the prompt, and why
- **Body:** the sign-in's first line takes the body's place, so the aside stays short and the sculpture keeps its band.
- **The switch:** the tone changes at once. The prompt fades its ground over 0.6 s while its text follows by
  inheritance. Here the sign-in's fields take their colours from tokens, which change at once. A fade would draw them
  in the new colour on the old ground for half a second.
- **At rest:** the prompt's last frame kept a trace of the stir (up to 0.04 px of drift). The port clears it, so at rest
  the canvas shows exactly the image it started from.
- **The sculpture's tails fade out at both sides** (in the image itself), so a sculpture laid out narrower than the
  screen never shows a cut edge.
- **Phones:** the sculpture keeps a third of the screen's height, since the sign-in is taller than the prompt's copy.
- **Persian type:** line height 1.14 instead of 0.92, and no capitals or tracking.
- **The app's own touches are off on the entrance:** the page's fade-in and the lamp that follows the hand. The prompt's
  ground is still.

## Acceptance
- **The sculpture draws.** On `/login` in a browser with WebGL2, the canvas draws the sculpture (`data-gl="on"`).
  - At rest, the canvas shows the crisp image.
  - Moving the pointer across it changes the pixels under the pointer (the material turns liquid).
  - Within a few seconds after the pointer leaves, it settles back to the crisp image.
- **Without WebGL2,** or after a lost context, the static image shows (`data-gl="off"`), and the sign-in works.
- **The sign-in is unchanged.** The e2e steps pass as before:
  - email → code → in;
  - a wrong code;
  - a new shop;
  - two shops;
  - the demo chip;
  - the install guide.
- **Reduced motion:** no assembly, half strength, a still hint. Everything works.
- **Layout:**
  - at 1440 px, the hero fills the screen without scrolling;
  - at 390 px, no sideways scroll, and every step of the sign-in is fully visible and usable (the page may scroll on
    a short phone);
  - the keyboard reaches the nav, then the form, with focus always visible.
- **Rules:**
  - only same-origin requests;
  - no inline handlers, no `eval`;
  - the motion rules of spec 0039: durations and curves from tokens, hovers inside `(hover: hover)`, the hint's pulse
    as a named loop that stops at the first touch.
- **Unit tests** cover the pure parts against values worked out by hand: `computeRect` at each breakpoint, and
  `hexToRgb`.
- **Live:** after the deploy, the live checks pass, and `/login` on https://beatris-6u77.onrender.com draws the
  sculpture.

## Constraints
- No new dependency. The image is a local WebP under 400 KB.
- The engine runs only while the hero is on screen and the page is visible. With ambient motion off, it stops when the
  material has settled.
- The credit link stays (`rel="noopener"`).
- The tutorial films are not changed (the owner's rule). They keep the entrance they were filmed with.
- Accounting and sign-in logic do not change.

## Results
- **The entrance e2e step:** 13/13.
  - The engine draws, and a stir changes the pixels; once the hand leaves, the canvas returns to the very same pixels.
  - The hero fills 1440 × 900 with the sculpture centred in its band.
  - Both tones take the prompt's grounds, and only this server is asked for anything.
  - On a phone, the sculpture is 284 px high and the whole sign-in is there.
  - With less motion, the cue is still.
- **Sign-in steps:** the e2e steps that touch the sign-in (sign-in by email, the web app, the install guide, skins,
  mobile) pass. Gate 480/480.
- **One test had to change.** The light entrance lets the service worker take control of the page sooner. Once it
  does, Playwright's route no longer sees the page's own requests. So the «new build» test of spec 0036 now runs with
  service workers blocked. The app's behaviour did not change: the worker passes `/api` through untouched.
- **The sculpture image** is 2400 × 960 (236 KB). That is enough for a 2× screen, and lighter to upload to the GPU
  than the first 3000 × 1200.

## Verification
- `npm run gate` (new `tests/liquid.test.mjs`; the motion test knows the new loop).
- An e2e step «entrance (spec 0046)», plus the existing sign-in steps.
- Screenshots at 1440 and 390 px in both tones, at rest and stirred.
- After the deploy: the live checks, and a live look at `/login`.
