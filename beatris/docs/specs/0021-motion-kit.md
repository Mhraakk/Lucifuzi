# 0021 — Motion kit: text morph, morphing dock, new tab icons, smooth caret, cinematic captions

## What
One small motion kit (`public/js/motion.mjs`). All movement is spring-based and touches only transform, opacity and filter. Nothing runs while things are at rest, and everything honours reduced motion.

- **`spring()`:** one shared frame loop, semi-implicit, 4 sub-steps. It sleeps when every spring is at rest.
- **`springEase()`:** the same spring as a CSS `linear()` curve for WAAPI transitions.
- **`morphText(el, text)`:**
  - Kept words glide to their new place (FLIP on a spring). New words rise out of a blur, and leaving words fade upward.
  - Persian letters join, so whole words move, never single letters.
  - The element keeps an `aria-label` of the whole text.
  - Used in the desk's one-sentence summary, in button labels (`morphLabel`) and in the dock tray.
- **Dock (`dock.mjs`):**
  - On a desktop rail, icons swell by the pointer's distance with a jelly squash from their speed. One highlight glides to the item under the pointer.
  - A tray beside the rail names the place in one sentence. Its words morph and slide in the direction the pointer moved.
  - On a phone, press-and-hold (280 ms) opens the tray above the bar. Sliding scrubs across the tabs; letting go opens the tab under the finger. A quick tap stays a tap.
- **Tab icons (`TAB_ICON`):** drawn for this app's meanings — a house with a Persian arch, an open book with a gem marker, practice as a loop round a target, the market as candles, the books as a ruled ledger, the studio as a ring with its stone, tools as a goldsmith's balance.
  - Each icon has two layers. The soft fill comes in and the accent stroke draws itself when the tab is current.
- **Smooth caret (`caret.mjs`):**
  - In the desk's one-line box and the assistant, the text cursor glides on a spring.
  - Its place comes from a hidden mirror of the input with a marker, so RTL Persian mixed with digits is laid out by the browser exactly as the input lays it out.
  - It is steady while moving and blinks at rest.
- **Cinematic captions (tutorial overlay):**
  - The line is a floating glass card.
  - The old line leaves upward into a blur, and the new one arrives word by word out of a blur.

## Acceptance
- **Desk caret:** after typing, the custom caret's x equals the end of the text, to the pixel. A typing burst shows no long tasks.
- **Desktop rail:** hovering shows the tray with the place's sentence.
- **Phone:** hold-and-scrub opens the tray, and releasing navigates to the tab under the finger. No browser errors.
- **Affected e2e steps:** desk, operator, market language, light layer, skins, mobile pages, home, learn and tools all pass (209/209). The gate passes.

## Constraints
- No React or motion library: everything is native. CSP is unchanged. There is no letter-spacing on Persian text.
