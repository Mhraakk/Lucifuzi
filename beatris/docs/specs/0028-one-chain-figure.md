# 0028 — The one-chain figure

**Status:** implemented.

## What
The whole app rests on one idea: every event is recorded once, as one numbered document in one chain, and every
section and page reads that same chain. «هر اتفاق، کجا ثبت می‌شود» (`/books/events`) now opens with a figure that
explains this as a machine. It is built with the anatomy skill: crafted isometric SVG, many small solid parts, calm
motion and a live readout.

### The machine
- **A press on the right.** It stamps each event as a new link: the plunger comes down and the link gets its number
  and its code.
- **One chain.** Links run on one roller chain, over two sprockets on posts with collars, along a guide rail.
- **Five drawers under the chain:** آبشده، سکه، شمش، ارز، وجه. A link drops a token into every drawer whose section
  the event touches. Each drawer's front has a small counter window with the number of documents in that drawer.
- **A dial gauge on the left.** It reads how many links verify. With the chain whole the needle stands on the last
  link. Altered, it falls back to the first bad link.
- **Base and finish:** a base plate on feet, a groove, screws, a ruler strip under the chain (one tick per link) and
  a label plate.

### Truth: every number comes from the app's own rules
- **The example events** are real kinds from `shopevents.mjs`. The card says it is an example (نمونه).
- **Sections** come from `sectionsOf`, the function روزنگار filters with.
- **Link codes:** each link's code is the first four hex digits of `SHA-256(prev + canonical(body))`, with `prev` of
  the first link `GENESIS`. This is the rule of the server's event log (`log` and `verifyLog` in `server/books.mjs`),
  computed in the page with the browser's own SHA-256.
- **«دستکاری» (tamper)** changes one figure in one link's body. The codes are recomputed. As in `verifyLog`, the
  first link whose stored code no longer matches is where the chain breaks. The gauge falls to it and the readout
  says «زنجیره از حلقه k شکسته است». «درست کن» restores it.

### Behaviour
- **Idle tour:** a link is stamped about every 2.4 s, and the tour loops when the chain is full.
- **Drawers:** hovering or focusing a drawer lights the links that dropped into it. The readout names the section and
  its count.
- **Keyboard:**
  - Arrow keys step from link to link, and the readout describes each one.
  - Tab reaches the drawers and the two buttons.
- **Stillness:**
  - With reduced motion, the figure is drawn once in its final state.
  - It stops when it is off screen or the tab is hidden.

### Page and card
- **The card:** «شکل ۱» and the title «یک زنجیره، پنج بخش» at the top. The hint and the live readout are at the
  bottom.
- **Under the card:**
  - The legend: the lit link and the drawers.
  - A true caption, and the two buttons.

## Acceptance
- **`tests/onechain.test.mjs` (node), on the figure's model (`public/js/figures/onechain-model.mjs`):**
  - every link's sections equal `sectionsOf` on the same document;
  - every code equals node's `sha256(prev + canonical(body))` chain from `GENESIS`;
  - each drawer's count equals the number of documents whose sections include it;
  - tampering link k makes the first failing link k, as `verifyLog` reports. Restoring makes the chain whole.
- **e2e** (in «every shop event in one chain»):
  - `/books/events` shows the figure (an `svg.iso-svg` with at least 300 drawn paths);
  - the readout changes during the tour;
  - hovering the آبشده drawer lights its links and names it in the readout;
  - «دستکاری» breaks the chain at the link it names, and «درست کن» makes it whole;
  - no horizontal overflow at 390 px;
  - the day skin draws it with the day tokens.
- **Verified by eye (anatomy checklist):**
  - captures at desktop and phone width in both skins, with 4× close-ups of the press, the drawers and the gauge;
  - the skill's line-end check prints `line ends: 0`.

## Constraints
- **No runtime dependency:** the kit is vendored as `public/vendor/anatomy/iso-kit.mjs`, with its MIT licence.
- **Page rules:**
  - CSP-safe: module scripts only, no inline handlers;
  - colours only from the app's tokens, through the anatomy variables, in every skin;
  - one font (Estedad), and no letter-spacing on Persian.
- **Operator speed comes first:**
  - The figure is built after the event list has drawn, in under 30 ms.
  - Only the moving parts change per frame.
  - It never blocks the search box.

## Amendment — as built (2026-10-12)
- **The links run on one track,** not on a roller chain over sprockets. Each stamped link sends one coin per section it
  touches down a sorting chute into that drawer.
- **The tour stamps a link every 3.6 s** and holds 4.5 s on the full chain before it loops.
- **The press:** a die, a rod and a coil spring.
  - The spring is one wire wound round the rod from the die to the guide under the arm, and it stretches as the die
    comes down.
  - Its turns show in front of the rod and beside it. Right behind the rod they are hidden, so every stretch of wire
    ends on the rod's edge.
  - The die is painted first, so the rod and the spring stand on its face.
- **`{ manual: true }`:** the figure has no clock of its own and is posed by `seek(t)`, `show(section)` and
  `tamper(on)`. Spec 0031's teaser uses it. Without the option, the figure behaves as above.
- **Line-end check:**
  - **Command:** the skill's `lines.mjs` on the figure alone.
  - **Poses:** tour times 1 s, 0.85 s (press down) and 20 s.
  - **Result:** `line ends: 0 of 237`. The spring's earlier half-turns stopped in the air beside the rod (10 ends).
