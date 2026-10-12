# 0025 — Visual quality: the sharpest picture each screen can show

**Status:** implemented.

## What
Every picture the app draws is drawn at the best quality the device can actually show and sustain: full pixel
density, the GPU's own limits for anti-aliasing, reflections, shadows and texture filtering, and smooth motion. The
GPU works hard while something is on screen and moving, and nothing is drawn when nothing changes.

### 1. One quality probe (`public/js/quality.mjs`)
- **What it measures:** pixel density, CPU cores, memory, the GPU's limits (WebGL2, MSAA samples, texture size,
  anisotropy, renderer name), data saver, reduced motion, and touch versus mouse. The 3D stage reads the GPU's
  limits from its own WebGL context; nothing else opens one.
- **The decision, `tierOf(caps)`:** pure and tested, so the same device always gets the same settings.
  - **ultra:** a strong GPU on a desktop (8 MSAA samples, 8 cores, 8 GB).
  - **high:** a good phone or laptop.
  - **standard:** software rendering, data saver, 2 GB or no WebGL2.
- **What each tier sets:** pixel density cap, MSAA samples and their memory budget, reflection map size and blur,
  shadow map size, anisotropy, the dynamic-resolution floor, the supersampling budgets for stills and exports, the
  canvas density cap and the video size.
- **For support:** `?quality=ultra|high|standard` pins a tier for the tab.

### 2. 3D (every stage: login coin, home ring, history, coin lab, studio)
- **Density:** the canvas always has full device density, up to the tier cap (ultra and high 3, standard 1.5). It
  follows the window to a screen with another density.
- **Anti-aliasing:** the GPU's own MSAA samples, up to 8, within a memory budget. A small showpiece gets 8, a
  full-screen 4K studio 4.
- **One HDR target:** the picture ends on screen, so the composer's second target is never allocated. This halves
  the memory the old setup used.
- **Reflections:** the environment map at 1024 (ultra), 512 (high) or 256, with the light tent blurred less on the
  bigger maps. Polished gold and gem facets reflect crisp strip lights.
- **Shadows:** 4096 (ultra), 2048 (high) or 1024 (standard). The soft edge has the same width on every tier; a bigger
  map only makes it cleaner.
- **Texture filtering:** the GPU's maximum anisotropy (usually 16) on every texture: metals, coin photos, scans.
- **Motion stays smooth:** while the picture moves, the frame time is averaged.
  - If frames slip (over 24 ms), the HDR picture steps down 15%, never under the tier's floor (1.25×, 1.5× or 0.75×
    density).
  - It climbs back after a calm stretch; each climb waits twice as long as the last.
  - A step that does not help (the frame rate is capped elsewhere) is undone and not tried again.
- **Stills are sharper than motion:** 400 ms after the picture stops, it is drawn once more at twice the density each
  way and filtered down (2×2 supersampling).
  - Only within the tier's budget (ultra 16 MP, high 8 MP, standard never).
  - Not after motion had to step down.
  - Never again on that stage if the sharper frame held the next one back by more than 150 ms.
  - The next movement returns to the moving density.
- **The showpieces** (login coin, home ring) get a glint on ultra and high: only the strip lights' reflections bloom,
  in a tight halo, so the metal keeps its colour.
- **Exports:**
  - **Still images:** up to 8K (7680×4320) where the GPU allows. Pictures within the export budget are drawn at twice
    the size each way and filtered down (2×2 supersampling, plus MSAA where it fits). This covers up to 20 MP drawn on
    ultra (a 2K square), 10 MP on high. Bigger pictures keep at least 4× MSAA. Transparent PNGs are supersampled the
    same way.
  - **Turntable video:** 1080, 1440 or 2160 square, the largest the tier allows chosen first (ultra 2160 at 40 Mb/s,
    high 1440 at 24 Mb/s). Each turn step is exactly one frame at even times, and the clip loops without a jump.
  - **History artworks:** drawn at the density the screen shows them (3:2, never under 900×600).
- **Data attributes:** the canvas carries `data-quality`, `data-scale` and `data-samples`, so the state can be
  seen and tested.

### 3. 2D canvases
Price charts, the Elliott view, the thinking orbs and the lesson viewer render at full device density, up to 4×. A
canvas is kept under 16.7 million pixels, the browsers' limit. Orbs keep whole-pixel sizes, so they are not resized
every frame.

### 4. Text, images, icons
- **Text:** smoothing (`-webkit-` and `-moz-osx-`) and kerning are set once for both skins.
- **Coin photos:** shown at the real resolution they have. No detail is invented.
- **PWA screenshots:** wide at 2× (2560×1440), narrow at 3× (1170×2532), made by `scripts/pwa-shots.mjs`. The
  service worker precaches the quality module (cache v33).

### 5. Tutorial films
- **Recording density:** chapters are recorded at 1.5× device density, giving a true 1920×1080 frame on desktop.
  The phone chapter is recorded at 3×, giving 1080×2338.
- **Cards:** opening and end cards are rendered at the same size.
- **Encoding:** higher quality, with H.264 and VP9 copies as before.

### 6. Power
- Every stage pauses off-screen and in a hidden tab.
- Reduced motion keeps the showpieces still: drawn once, then supersampled.
- Counter screens (desk, روزنگار) draw no 3D.

## Acceptance (`tests/quality.test.mjs`, e2e «visual quality», screenshots)
- **`tierOf` and the budgets:**
  - A desktop GPU (8 samples, 2× density, 12 cores, 16 GB) is ultra: 8 samples, 1024 reflections, 4096 shadows.
  - A modern phone (3×, 4 samples, 6 cores) is high, with density 3.
  - A software renderer, data saver or 2 GB device is standard, with no supersampling.
  - MSAA never exceeds its memory budget. Supersampling never exceeds its budget or the GPU's size limit.
  - The same input always gives the same output.
- **In the browser, at 2× density and on a 3× phone (tier pinned to high):**
  - the login coin's canvas backing store is 2× (3×) its CSS size;
  - MSAA is the GPU's own;
  - the still coin (reduced motion) is redrawn with 2×2 supersampling;
  - the market charts and the Elliott chart are 2× their CSS size.
- **Films:** `chapters.json` and the files report 1920×1080 for desktop chapters and 1080×2338 for the phone chapter.
- **No regressions:** the full e2e passes with no browser error. Side-by-side screenshots show the studio still, the
  1080 exports and the transparent PNG edges at least as clean as before.

## Constraints
- **No new dependency:** three.js stays the vendored bundle.
- **No invented detail:** photos and scans keep their real resolution.
- **Both skins** look the same in quality; colours come only from tokens.
- **Operator speed comes first:** the desk and روزنگار never wait for graphics.

## Amendment 1 — 8K screens and 8K chart pictures
- **On an 8K screen** (7680×4320, usually 1920×1080 CSS at 4×): tables, figures and text are drawn by the browser at
  the screen's own density. Every 2D chart is drawn at up to 4× its CSS size within the canvas area cap, so a full-width
  chart is 7680 px wide. e2e at 1920×1080×4: the market chart's backing store is 4× its CSS size (or the area cap), and
  روزنگار, گاوصندوق, the P&L report and the events guide have no horizontal overflow.
- **A chart picture** («ذخیره تصویر نمودار») is 7680 px wide: the chart is drawn again at that density, not enlarged,
  never above the browser's canvas area, then drawn back for the screen. e2e reads the PNG header: 7680 wide.

## Amendment 2 — the films' recorder and one encoding
§5 asked for true 1920×1080 frames and higher quality. Playwright's own recorder gave neither:
- **It enlarged:** the browser's screencast only gives frames at the window's own pixel size. With the density
  emulated, as §5 first did, that is the CSS size (1280×720), so the film would have been a 1280×720 picture
  enlarged.
- **It squeezed:** it encodes VP8 at 1 Mb/s.
- **It re-encoded:** the old chain encoded each film four times (VP8, H.264 CRF 26, CRF 18, CRF 24).
The new path:
- **Real density:** the browser is launched at the chapter's real density (`--force-device-scale-factor`: 1.5 for
  the desktop, 1080/390 for the phone) and window size, without emulation. The phone chapter keeps the mobile layout
  rules and touch through the DevTools emulation, with the density left as it is.
- **Smooth enough at 1.5×:** software drawing at 1920×1080 managed only 5–14 changing frames a second, against
  15–22 for the old 720p recordings. Measured on the روزنگار page, frosted glass alone took a third of each frame. For
  the recording only, three things change:
  - the frosted bars (top bar, dock, dialogs) become solid at the same tint;
  - the ambient glow's 46-second drift, which no one can see, is held still;
  - caption words arrive without blur.
  Motion then reaches 16–20 changing frames a second, on a par with the old films at 2.25 times the pixels. Nothing
  else in the app changes.
- **Recorder (`scripts/screencast.mjs`):** the screencast hands over every frame the browser draws, as JPEG 92.
  - Each frame is held for as long as it stayed on screen and written at a constant 25 frames a second.
  - The output is an H.264 CRF 12 master in `RAW` (visually lossless). It is encoded at the fastest preset and at a
    lower priority, so the browser draws first.
  - The first frame's size is checked. If the browser drew less than the full frame, the chapter stops with an
    error, because a smaller frame would be an enlargement.
- **Cards:** the canvas is drawn at the page's density (1.5×), saved as PNG and padded to the frame, never scaled.
- **One encoding for the page:** the film is built from the master in a single pass:
  - H.264 High profile, CRF 20 (desktop) or 22 (phone), preset slow, at the level the frame needs: 4.0 for
    1920×1080 and 5.0 for 1080×2338;
  - a VP9 copy at CRF 32;
  - sound in AAC 192 kb/s and Opus 128 kb/s;
  - a poster at JPEG quality 2.
- **The comparison film** (`scripts/compare-video.mjs`, linked from the help page) is recorded the same way. It is
  joined in one pass to 1920×1080 at the films' quality.
  - Each live segment opens its page, and waits for the app to finish loading, before its recorder starts. So the
    film never shows a loading spinner or an empty frame (2026-10-12).
- **The help page names the exact codec:** `chapters.json` gives each chapter's `width`, `height` and `codec`
  (`avc1.640028` or `avc1.640032`). The page puts that codec on its MP4 source, so a device that cannot play it takes
  the VP9 copy.
- **Acceptance:**
  - `tests/tutorial.test.mjs` reads every chapter's MP4 header. The size and the H.264 profile and level must match
    `chapters.json`: 1920×1080 for desktop chapters and 1080×2338 for the phone chapter. The WebM and the poster must
    exist.
  - e2e: the help page loads chapter 1 at 1920×1080 and chapter 12 at 1080×2338, with the codec on the source.
