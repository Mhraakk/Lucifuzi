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
