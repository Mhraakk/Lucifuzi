# 0033 — Every feature is tested

**Status:** implemented.

## What
Every page and every API route of the app is exercised by an automated test, and `npm run check` (so the gate)
fails when one is not. A feature arrives with its test, or the gate refuses it.

### The rule (`scripts/coverage.mjs`)
- **A page route** (`route(…)` in `public/js/app.mjs`) counts when a browser test opens it: `scripts/e2e.mjs` or
  `scripts/hundred.mjs`.
- **An API route** (`on(METHOD, '/api/…')` in `server/`) counts when one of these calls it with that method:
  - a unit test;
  - the browser tests;
  - the hundred rounds.

  A GET may be implicit.
- **Matching:** a route matches on its static parts. `/books/doc/:id/edit` needs a line with both `/books/doc/` and
  `/edit`.

### What the first audit found (2026-10-12)
Before this pass, these were never exercised:
- **Pages, never opened in a browser:**
  - the document editor of a saved document (`/books/doc/:id/edit`);
  - the customer's shared statement (`/s/:token`);
  - a procedure (`/sop/:id`);
  - the agents page (`/agents`).
- **API routes, never called (15):**
  - sign out everywhere;
  - drills, SOPs and attendance;
  - course assignments (set and remove);
  - the manual market sync;
  - the desk's product templates;
  - the one-line understanding;
  - the scale settings;
  - training-scenario answers;
  - editing a cash or bank account;
  - editing a stock piece;
  - memory notes.

### Tests added
- **`tests/coverage.test.mjs`:** each of those routes, checked for:
  - its answer;
  - its effect, where the app reads it back (progress, the team page, the count page, the log);
  - who may call it.
- **`tests/booksapi.test.mjs`:** a sold piece cannot be edited in place (409). It is corrected from its invoice.
- **e2e, «pages no other step opens»:**
  - a final expense is corrected from its own editor: no reason, no correction; with one, a new document amends the
    original, and the original stays as void with its figures;
  - the shared statement is opened signed out, shows the customer's name and debt, and «تأیید» reaches the shop;
  - a wrong link says the statement is not available;
  - a procedure is acknowledged and says so after a reload;
  - the agents page lists the registry.
- **POS bridge:** its four PowerShell tests run wherever `pwsh` is installed (`PWSH=` or on the PATH). Before, they
  were skipped on machines without it.

## Acceptance
- `node scripts/coverage.mjs` prints «every page and API route is exercised by a test».
- `npm run check` fails if a page or route is added without a test.
- The new unit tests and the e2e step pass.

## Constraints
- **The rule is static:** it proves that a test reaches the route, not that the test is good. Each new test still
  checks the answer, the effect and the permission, as these do.
- **No change to app behaviour:** this pass adds tests only.
