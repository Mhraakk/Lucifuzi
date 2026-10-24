# 0019 — Living signs: the thinking orb, press physics, the gooey tab and painted cards

## What
These are small, shared signs that say what the system is doing. Each one is a single component, so every page looks and behaves the same in every skin.

- **Thinking orb** (`public/js/orb.mjs`)
  - It is drawn by the vendored thinking-orbs engine (MIT, `public/vendor/thinking-orbs/`). The engine is plain 2D canvas, with no WebGL and no network.
  - There are nine states: working, searching, solving, listening, connecting, weaving, composing, breathing and shaping. Each has a Persian label.
  - One shared clock drives every orb. An orb pauses when it is off screen or the tab is hidden. Under reduced motion it shows a still frame.
  - The ink is the skin's gold, and the tone is the skin's tone.
  - The shared `.loading` block becomes an orb everywhere.
  - `busy(btn)` on a button that has `data-think="<state>"` places the orb, with the state's words, beside the button. This is used by the accounting coach (check, hint, audit, the one-line entry) and the studio coach (design, edit, check, hint, export).
  - The assistant's "typing" bubble is a composing orb.
  - The admin's agent list puts an orb beside every live run: queued → breathing, running → working, waiting_for_tool → connecting, waiting_for_approval → listening, paused → breathing.
  - `orbFrame(state, size, t)` is a pure function of time, so films can seek it.
- **Press physics** (`light.mjs`)
  - A press sinks by about the same few pixels whatever the button's width: `--press = 1 − min(0.06, 3.2 / width)`.
  - `morphLabel(btn, text)` glides the button's width to fit the new words, which fade in out of a soft blur.
- **Gooey tab** (`goo.mjs`, phone only)
  - The selected tab is a drop that flows to the next tab.
  - It has a fast head and a slow tail under an SVG goo filter, so a liquid bridge joins them while they move.
  - The drop replaces the selected tab's own fill in every skin. On a desktop, the rail keeps its line.
- **Painted card** (`.mesh`)
  - Four soft pools of the skin's own colour tokens sit under a fine paper grain, after feralui's gradients. It is used on the studio feature card.

- **One dialog** (`public/js/dialog.mjs`): `modal`, `confirmBox` and a new `askBox` serve every question in the app. The browser's alert/confirm/prompt are never used.
- **Uniformity guard** (`tests/uniformity.test.mjs`, run by the gate). It fails on:
  - a browser dialog;
  - a hex colour in page markup;
  - a second UI font (Vazirmatn first, or charts not in Estedad);
  - a manager-dashboard menu name that differs from the books menu for the same place.
- A full-screen workspace without a visible heading names itself with a visually hidden h1, taken from its route `title`.
- The audit and what it fixed are in `docs/reports/2026-10-02-uniformity.md`.

## Acceptance
- Thinking orb (`tests/orb.test.mjs`):
  - All nine states draw finite dots at sizes 20, 32 and 64.
  - The same time gives the same frame, and different times give different frames.
  - Every live run state has an orb, and no finished state has one.
  - Labels are escaped. Decorative orbs are hidden from screen readers. An unknown state falls back to working.
- The engine ships with its licence, and no CDN is used.
- In a browser, the orb shows in the assistant and the studio coach, the drop flows between tabs, and the painted card renders in a dark, a light and the clean skin with no console errors.
- `npm run gate` passes.

## Constraints
- No runtime dependency. The engine file is vendored unmodified, and only its exports are used. No React.
- Colours come only from tokens. There is no letter-spacing on Persian text. Reduced motion is respected everywhere.
- CSP is unchanged: the grain and the goo filter are inline SVG or data URIs, which `img-src data:` already allows.
