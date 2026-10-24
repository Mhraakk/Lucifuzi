# 0043 — The Odyssée editorial style on /intro and /history

**Status:** implemented.

## What
The owner pointed at odysseeclinic.com.au and asked for its design in a few places only. Asked where, they chose the
app's introduction (`/intro`) and the gold history (`/history`). The design's grammar, built from scratch on the app's
own images:
- **A statement:** a large serif paragraph whose first line is indented, ink on a quiet paper. Beside it sit a small
  picture, a short paragraph in the body font, and a link that is plain text.
- **Numbered chapters:** a counter («۲ : ۴»), a name, and a hairline whose dark part grows with the chapter. Below are
  tiles whose inactive pictures fade, and numbered captions; only the chosen one has its text.
- **Shifted strips:** a picture cut by a horizontal band that is moved sideways. A few small words are spread across it.
- **A collage:** a small square picture with a caption, overlapping a large picture whose top strip is moved.

### /intro
Between the ticker and the numbers, the dark site gets one paper chapter (the design is meant for some places, not the
whole site). It has four parts:
1. **The statement:** what Beatris is for, with the round photo of a coin.
2. **«چرا بئاتریس؟»:** four numbered chapters, each the answer to a daily pain:
   - one book for everything;
   - coins and seals told apart;
   - melted gold without mistakes;
   - the market read early.

   The tiles are the app's own renders and the coin photo.
3. **The shifted strips:** one render, with «حساب · دانش · بازار» across it and a statement under it.
4. **The collage:** the coin photo and a render, with the line about checked numbers.

The pains section that these chapters now answer is removed. The hero, ticker, numbers, three feature cards, packages
and call stay as they are.

### /history
The whole page takes the style:
- **The opening:** a full-width render with the title, then the statement.
- **Each era is a chapter:**
  - its place;
  - its serif title;
  - its text in the body font;
  - the lesson as an indented serif quote;
  - the facts as small plain words;
  - the 3D picture of the era with a shifted strip. Pictures alternate sides.
- **The counter:** a counter and hairline (`۳ : ۹`) stay in view while reading and follow the era on screen.

## Acceptance
- **/intro chapter:** the page has the paper chapter with:
  - the statement, its first line indented;
  - four chapter tabs (`role=tab`), one selected. Choosing another changes the text, the faded pictures and the
    hairline;
  - the arrow keys move between tabs (in RTL, left is next);
  - the chapters advance by themselves every 7 s only while the chapter is on screen, nobody hovers or focuses it, and
    motion is not reduced.
- **/intro checks:** the existing checks still hold:
  - the hero and its four slides;
  - the ticker;
  - the numbers;
  - three feature cards and three packages;
  - no «تومان» in the page.
- **/history:**
  - nine eras;
  - the counter reads «۱ : ۹» at the top and follows the era on screen;
  - the 3D pictures still arrive and carry the shifted strip.
- **Everywhere:**
  - no sideways scroll at 390 and 1440 px in either skin;
  - every text passes WCAG AA, including the faded captions;
  - under «حرکت کمتر» nothing moves on its own and the strips stand still.

## Constraints
- **Colours:** tokens only (`--od-*`), in the last layer of `app.css`.
  - The /intro chapter is paper in both skins, because the intro site is one fixed look.
  - /history follows the skin: paper and ink in the day skin; deep ink and paper-coloured text in the dark skins.
- **Type:** the statements use Markazi and the rest Estedad. Nothing on Persian text uses letter-spacing (the design's
  spaced capitals become small plain words).
- **Images:** the app's own renders (`/promo/*.webp`), the 3D era pictures and the coin photographs (M.samei, CC BY-SA
  4.0, already credited). Nothing is taken from Odyssée.
- **Technology:** no framework, CDN or new dependency; CSP unchanged.

## Out of scope
The other tabs of the intro site (features, packages, demo) keep their look.

## Verification
- `npm run gate`.
- e2e: the intro and history steps.
- Screenshots at 1440 and 390 px in both skins.
- Deploy and live check.
