# 0053 — دیده‌بان: the owner's own dashboard

**Status:** implemented.

## What
**Asked:** «می خوام یک dashboard فقط برای من که مالک و سازنده اپ هستم ساخته بشه … تجزیه تحلیل رفتار کاربرها، امار ثبت
نام، چه کسی در داخل ثبت کرده و لاگین شده و خلاصه تمام اطاعات ورودی و خروجی اپ … از این مخزن برای طراحیش استفاده کن
https://github.com/0kzh/glisse.git». «React اگر بهتر است خب به اپ قابلیتش رو بده».

**Answers:**
- **Tracking:** «ردپای کامل هر کاربر». Every page and every main action is kept with its time, plus the IP and the
  device at each sign-in. Raw rows stay 180 days, then only daily sums.
- **Shops:** «شمار و جمع‌ها». Counts and totals only; a shop's documents and customers are never opened.

`/owner` («دیده‌بان») is one page for the platform owner. It has eight tabs:

| Tab | What it shows |
|---|---|
| نمای کلی | Users, sign-ups, DAU/WAU/MAU, sign-ins and failures, online now, shops, documents, outputs, AI and errors, each with a daily series |
| ثبت‌نام | New shops and new accounts by day, and who made each shop |
| ورودها | Every sign-in step: code asked, failed code, blocked, signed in, shop picked, signed out everywhere. Each row has the IP, the raw `X-Forwarded-For` chain and the device. Failures are grouped by IP and by address. |
| کاربران | Everyone in every shop: role, made, last seen, sessions, time in the app, top pages. A drawer opens one person's timeline. |
| رفتار | Top pages and actions, a weekday × hour heat map, session lengths, devices, the funnel (sign-up → first sign-in → first document → active in week two) and weekly retention |
| فروشگاه‌ها | Per shop: documents by type and state, turnover and 750 grams of final documents, outputs, card reader, AI, last activity |
| ورودی و خروجی | **In:** documents made, amended and voided, sign-ups, uploads. **Out:** exports, prints, PDFs, shares, sign-in codes by channel, AI calls, MCP calls. |
| زنده | Sign-ins and actions as they happen (SSE) |

**React for this page only.**
- glisse (Apple's Liquid Glass for React, MIT, v0.4.3) brings the glass header, the TabBar with its lens, Switch,
  Slider, Menu and SearchField.
- It is bundled with React 19.3.1 and htm 3.1.1 (templates without JSX or eval) into one ESM file,
  `public/vendor/glisse/glisse.bundle.js`. This follows `three.bundle.js`: no runtime dependency and no CDN.
- The rest of the app stays without a framework.

## Who sees it
- `isPlatformOwner`: a user of the main shop with role owner, active, whose mobile is `BEATRIS_OWNER_PHONE` or whose
  email is `BEATRIS_OWNER_EMAIL`. In production a demo account never qualifies.
- No other vendor or owner qualifies. `/api/me` carries `owner: true` for that one account.
- `/owner` sends anyone else home, and every `/api/owner/*` answers them 403 (401 without a session).

## Data (main database, `server/owner.mjs`)
- **`auth_log`:** `at`, `kind`, `user_id`, `tenant_id`, `who`, `via`, `ok`, `reason`, `ip`, `xff`, `ua`, `device`.
  - `kind` is one of `code`, `verify_fail`, `blocked`, `login`, `signup`, `pick`, `logout_all`.
  - `who` is half-hidden until an account is known; then the dashboard shows the account's name and shop.
- **`act_events`:** `at`, `tenant_id`, `user_id`, `sid`, `kind`, `path`, `name`, `ms`.
  - `kind` is one of `view`, `act`, `error`, `beat` (from the screens) or `mcp` (from the server).
  - Paths carry no ids (`/books/doc/:id`). Nothing typed is ever kept.
- **`act_daily`:** sums per day, shop, user, kind and path. The daily job `owner.prune` folds raw rows older than 180
  days into it, then deletes them.
- **Read from each shop, never written:**
  - `bk_docs`: counts, Σ|net| and Σ g750 of final documents.
  - `bk_log`: `doc.print|pdf|share`, `export`, `doc.update|void`. An index on `bk_log(at)` is added when missing.
  - `bk_pos`, `bk_shares`, `ai_usage`.
- **Codes:** from `otp_sends`.

## Capture
- **Sign-in:** the three `/api/auth/*` steps, recorded at the gateway with the outcome, the channel and the reason,
  plus `logout-all`.
- **The screens:** `public/js/harness.mjs` (every page, signed in):
  - `view` with the time spent, at each navigation and when the tab is hidden;
  - `act` for every `[data-act]` press (its name only);
  - `error` for error toasts and page errors;
  - `beat` every 60 s while the tab is visible;
  - a random `sid` per tab.
- **Transport:** `POST /api/act`, batched. On hide, a `keepalive` fetch with the session header (never the token in a
  URL or a body). The server keeps at most one `beat` per user a minute and 100 events per batch.
- **MCP:** each `tools/call` adds an `mcp` event with the tool's name.
- **Live feed:** every row is also published on the bus as `owner.event` for the live tab.

## API (all GET, owner only)
`/api/owner/overview`, `signups`, `logins`, `users`, `users/:tenant/:id`, `behavior`, `shops`, `io`, `stream` (SSE)
and `export?what=logins|users|shops|signups` (CSV).
- `days` ranges over 1–180.
- `self=1` counts the owner's own activity, which is left out by default.
- No answer carries a document's or a customer's content (`data_json`, party names): the tests look for both.

## Acceptance
- **`tests/owner.test.mjs`:**
  - **Guard:**
    - a demo owner without the variables, a manager, and the owner of another shop get 403; no session gets 401;
    - the owner named by the variables gets 200 on every endpoint.
  - **`auth_log`:** every kind lands with IP, chain and device.
  - **Harness:** the kinds reach `act_events`; a second `beat` within a minute is dropped; ids in paths are folded.
  - **Numbers:** `overview`, `signups`, `shops` and `io` match seeded data.
  - **Privacy:** no response contains a seeded customer's name or `data_json`.
  - **Retention:** `prune` folds rows older than 180 days into `act_daily` and deletes them.
  - **Live:** `stream` sends a sign-in as it happens.
  - **CSV:** export has a header row and one line per row.
- **e2e «owner dashboard (spec 0053)»:**
  - the counts show, and the sign-in made a moment ago is in the table;
  - the TabBar lens moves, a user's drawer opens, and «زنده» shows the session;
  - the glass filter is set in Chromium;
  - a manager and a non-owner are sent home;
  - at 390 px there is no sideways scroll, in both skins.
- **Gate:** `'/owner'` is in the e2e `ROUTES`, and every new API path is in a test.

## Constraints
- **Time and numbers:** Persian digits, Jalali dates, Tehran time. No letter-spacing on Persian text.
- **Design:** tokens for both skins, and the 390 px layout.
- **CSP:** the existing one is enough.
  - glisse injects its CSS (`style-src 'unsafe-inline'`).
  - Its displacement maps are `data:` images (`img-src data:`).
  - No eval: htm builds templates at run time without it.
- **Refraction:** full in Chromium. Other browsers get blur and an edge highlight; glisse's own fallback.
- **Read-only:** no write to any shop's books.
- **Login notice:** the login page says, in one line, that sign-in and activity are recorded for security and support.

## Out of scope
- The IP is still the leftmost `X-Forwarded-For` entry (spec 0054). `xff` keeps the raw chain until the hop Render
  appends is measured.
- Alerts by email or SMS.

## Results
- **Server and tests:** `server/owner.mjs` and the gateway wiring; `tests/owner.test.mjs`, 7 tests: guard, every auth
  kind with IP, chain and device, harness, numbers, privacy, retention, CSV and the live feed.
- **Page:** `/owner` with the eight tabs and the side panel for one person's timeline. The e2e step «owner dashboard
  (spec 0053)» passes 17 of 17 with no browser errors.
- **Glass:** the refraction filter is set in Chromium (`--lg-filter: url(#glisse-…)`). At 390 px nothing scrolls
  sideways, in both skins.
- **Bundle:** `glisse.bundle.js` is 263 KB, 84 KB gzipped, with no `eval` or `new Function`.
  - glisse 0.4.3's npm tarball was read before bundling. It imports only `react` and `react/jsx-runtime`, and has no
    network, storage, cookie, navigation, `eval` or obfuscated access.
  - The CSP (`connect-src 'self'`, `img-src 'self' data: blob:`) stays as it was and is a second fence.
- **Deviations from the approved plan:**
  - **React 19.3.0, not 19.3.1.** 19.3.1 was 13 days old at build time, and every glisse release is under a week
    old. The bundle takes the React release older than two weeks; glisse needs React ≥ 18.
  - **The side panel is solid, not glass.** A refracting panel that large took about 7 s to paint under software GL,
    and would be janky on real devices too. Glass stays on the header, the filter row, the TabBar and the controls.
- **Timing:** under the e2e's SwiftShader GL, the first paint of the page takes 3–8 s, against about 0.3 s for other
  pages. glisse draws its displacement maps on a GPU canvas, and SwiftShader makes the read-backs slow. The e2e waits
  are sized for that.
- **Colours:** the two chart series were checked with the dataviz validator.
  - The app's own `--chart-*` tokens fail it in both skins (lightness band, chroma, colour-blind separation), so the
    dashboard has its own pair.
  - Dark skins: `#b98a2e` / `#3987e5`. Day skin: `#a8741a` / `#2a78d6`. Every check passes on the calm, classic and
    day surfaces.
