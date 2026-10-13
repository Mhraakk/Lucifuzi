# 0030 — Elliott as a machine (the wave rig)

**Status:** implemented.

## What
The Elliott studio (`/books/elliott`, `/market/elliott`) carries, right under its chart, an anatomy figure that
explains a five-wave count as an instrument: «دستگاه موج». It is built with the vendored anatomy kit (spec 0028) and
judged by the app's own rule engine (`ta.elliott`), the same engine the studio's count uses. The studio is always
navy, so the figure takes the studio's own tokens (`--ew-*`) in every skin; the wave line is the studio's impulse
blue.

### The machine
- **Six rails on a base, P0…P5:** each rail is a post, with a slider at the price of its swing point. The board
  behind them carries the wave line, drawn through the sliders' heights, and a faint grid that runs edge to edge.
- **Every hard rule is a physical stop that lights when it is broken:**
  - **On rail P2, a collar at P0's height:** wave 2 never retraces more than 100% of wave 1.
  - **On rail P3, a collar at P1's height:** wave 3 goes beyond the end of wave 1.
  - **On rail P4, a collar at P1's height:** wave 4 does not enter wave 1's price range.
  - **In a tray at the front, three gauge rods** as long as waves 1, 3 and 5: wave 3 is not the shortest. The
    shortest rod is lit, and it turns red if it is wave 3.
- **Fibonacci:** a ruler beside rail P2 has ticks at 0.382, 0.5, 0.618 and 0.786 of wave 1, and a ruler beside rail
  P4 has ticks at 0.236, 0.382 and 0.5 of wave 3. Each ruler hangs from its strip's edge.
- **The card:** «شکل ۱» and the title «دستگاه موج» at the top, the live readout at the bottom. The readout gives the
  measured ratios (موج ۲ ÷ موج ۱، موج ۳ ÷ موج ۱، موج ۴ ÷ موج ۳، موج ۵ ÷ موج ۱), how many rules hold, and the
  engine's score.

### Truth
- Every verdict, ratio and score is `ta.elliott(points)`'s `impulse-done` candidate for the six points shown. The
  machine never judges by itself.
- **The textbook examples:**
  - **Valid:** waves 2 = 0.618 × 1, 3 = 1.618 × 1, 4 = 0.382 × 3, 5 = 1.
  - **Each broken rule alone:** wave 2 below P0; wave 3 the shortest; wave 4 in wave 1's range. In each, the other
    rules still hold, so one stop lights at a time.
- **«شمارش همین نمودار»:** when the studio has found a count, its points are put on the machine, as prices in the
  chart's own units. A count of four or fewer waves (wave5, wave3, abc) is not an impulse. The button then says so
  and stays off, and nothing is guessed.

### Behaviour
- **Idle tour:** the examples in turn. The sliders glide to their new heights, and a stop lights or goes out when its
  rule changes.
- **Pointer:** dragging a slider moves its price. The figure judges the count at every step. Each slider has a
  touch target half a rail gap wide, so a finger can take it on a phone.
- **Keyboard:** ← and → pick a rail; ↑ and ↓ move it by 1% of the range; Home brings back the valid example.
- **Stillness:** with reduced motion, each change lands at once. The figure stops when it is off screen.

## Acceptance
- **`tests/elliottfig.test.mjs`:**
  - every example's verdicts equal `ta.elliott` on its six points;
  - each broken example breaks exactly its one rule;
  - the valid example's ratios are 0.618, 1.618, 0.382 and 1;
  - the stops' heights equal the rule prices (P0 for rail 2, P1 for rails 3 and 4).
- **e2e:**
  - the figure is drawn on `/books/elliott`;
  - «موج ۲ عمیق» lights the stop on rail 2 and the readout names wave 2;
  - «شمارش همین نمودار» either takes the studio's impulse (its six prices in the readout) or explains why not;
  - no overflow at 390 px.
- **Line-end check** (added 2026-10-12): the anatomy skill's `lines.mjs` on the rig alone, for «نمونه درست»، «موج ۲
  عمیق» and «موج ۳ کوتاه», prints `line ends: 0 of 102`.

## Constraints
- **Colours:** the anatomy tokens of spec 0028, and red only for a broken rule.
- **Font:** Estedad only.
- **CSP:** CSP-safe.
- **Speed:** built after the studio's chart, never delaying it.
