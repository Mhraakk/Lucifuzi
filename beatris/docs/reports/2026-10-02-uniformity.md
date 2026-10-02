# Uniformity and integration audit — 2026-10-02

How it was checked:
- A browser crawl visited all 52 routes in the calm skin at desktop size (`/tmp` script, not shipped).
- For each page it recorded:
  - the words used for each link destination;
  - the number of h1 headings;
  - the font families actually rendered;
  - controls that sit outside the shared kit.
- A static scan of `public/js` and `app.css` looked for browser dialogs, hex colours in markup and spinners.
- Result: the e2e steps affected by these changes passed, 239/239 checks with 0 browser errors.

## Divergences found and fixed
| Divergence | Where | Fix |
|---|---|---|
| The browser's own confirm/prompt dialogs (unstyled, with OS look), 10 places | me, exam, market data, coin photos, invoice credit limit, melt tool, team (×4) | A single `dialog.mjs` (`confirmBox` plus a new `askBox`). `bk.mjs` re-exports it. |
| Three different loading signs (a conic spinner, a ring spinner, bare text) | shell, coin lab, coin photos, assistant "typing" dots | One thinking orb (spec 0019). Every `.loading` block becomes an orb. |
| A second UI font (Vazirmatn) | manager dashboard, all canvas charts, the Elliott view | Changed to Estedad, like every page. |
| Naskh used for headings and body on the training pages only | accounting coach, studio coach, team view | Changed to Estedad. Naskh stays only for formal print, the brand and lesson paper. |
| The same place named differently in two menus | dashboard sidebar ("معاملات", "موجودی طلا", "حسابداری", "داشبورد", "خانه اپ") vs the books menu | Renamed to the books menu's words. |
| A hex colour in markup | lesson "floor task" note box | Moved to CSS and built from tokens. |
| No page heading | trade desk, 3D studio, coin lab | Each route declares a title. The shell adds a visually hidden h1. |

## Kept on purpose
- Different link words that carry context (for example "گزارش سود و زیان" pointing to /books/reports) are descriptive cards, not menu names.
- Segmented buttons without their own class are styled by their `.seg` container. They are part of the kit.

## How it stays this way
`tests/uniformity.test.mjs` runs in `npm run gate` and fails on any of the following:
- a browser dialog;
- a hex colour in page markup;
- Vazirmatn named first in a CSS font declaration, or charts that do not use Estedad;
- a dashboard menu name that differs from the books menu name for the same place.
