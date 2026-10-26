# 0049 — Live prices from forgod: currencies, the dollar, 18k gold and bitcoin

**Status:** in progress.

## What
The owner gave three addresses of one price service, with a key, and asked that they be built into the app,
working and tested:

| Address | What the owner said it is | What it returns (checked) |
|---|---|---|
| `/api/all` | currency prices (قیمت ارزها) | every price, in four sections: 24 currencies, gold (ounce, 18k gram, mesghal, five coins), coin bubbles, 17 crypto coins |
| `/api/usd` | the dollar | one row: `usd` |
| `/api/usd_btc` | bitcoin | one row: `usd_btc`, with its dollar price |
| `/api/18ayar` (same pattern) | 18k gold | one row: `18ayar` |

The owner listed four prices for three addresses. The gold row is `18ayar` in the gold section of `/api/all`, and
`/api/18ayar` returns it alone (checked).

### What the service sends (from the test requests, 2026-10-26)
- HTTPS works (Cloudflare, HTTP/2), so the app uses `https://`, never the `http://` of the owner's message: a key in a
  plain-HTTP address can be read on the way.
- `/api/all`: `{ sections: { currencies, gold, bubbles, crypto }, last_updated: <ISO, UTC>, stale: <bool> }`.
  - A row is `{ code, name, price: "272,210", change, time: "16:48:45", section }`. Crypto rows add `usd_price`.
- A single row (`/api/usd` and the others) is the same row with `last_updated` and `stale` on it.
- **Units: toman.** The ounce is in dollars, and `usd_price` is in dollars. Checked against each other:
  - ounce 4,010.70 ÷ 31.1035 × 0.75 × dollar 272,210 = 26.33 million toman, and the 18k gram reads 26,459,000;
  - mesghal 114,618,000 = the 18k gram × 4.331802 (`MAZANEH_TO_G750`);
  - bitcoin 21,718,329,500 ÷ `usd_price` 80,176.94 = 270,880, the tether rate.
- **The yen is quoted per 100 yen** (173,377). Read per one yen, it would make the dollar 0.6 yen.
- `time` is the source's Tehran clock time of that quote. An old quote carries a date instead, e.g. «26 خرداد».

### The feed: a new mode `forgod`
1. **One request per update:** `GET <base>/api/all?api_key=<key>`. It carries all four things the owner named.
2. **If it fails** (network, a non-2xx answer, bad JSON, or no usable row): the three single addresses `/api/usd`,
   `/api/18ayar` and `/api/usd_btc`, one after another, so the dollar, the 18k gram and bitcoin still update. Each
   source's result is shown on the market data page.
3. **The key** comes only from the server's `BEATRIS_FORGOD_KEY`. It is never stored in the database or sent to a
   browser, an export or a log. An error text has the key masked before it is kept. The page only says whether a key is
   set. `BEATRIS_FORGOD_URL` may change the address (https only, a public host; default `https://api.forgod.qzz.io`).
4. **Default mode:** `BEATRIS_MARKET_FEED` still decides. Without it, a server with a forgod key starts in `forgod`
   instead of `owner`. A manager's choice on the market data page still wins over both.
5. **History:** forgod gives only today's prices. As in `owner` mode, the daily history comes once from tgju's tables,
   so the charts and the day's change work from the first update. Bitcoin has no tgju table: its history starts with its
   first live price.
6. **Interval:** the manager's setting, 5 to 60 minutes; the default stays 10 (144 requests a day).

### Mapping into the app
| forgod | App symbol | Note |
|---|---|---|
| `18ayar` | `geram18` (گرم ۱۸) | It also sets the shop's base price, when «follow the market» is on. |
| `abshodeh` | `mesghal` (مظنه) | If it is missing, it is the 18k gram × 4.331802; and the other way round. |
| — | `geram24` | The 18k gram × 1000 ÷ 750, as in `owner` mode. |
| `sekkeh`, `bahar`, `nim`, `rob`, `gerami` | `sekee`, `sekeb`, `nim`, `rob`, `gerami` | |
| `usd` | `usd` (دلار) | |
| `usd_xau` | `ons` (انس) | dollars |
| `usd_btc` | **`btc` (بیت‌کوین), a new symbol** | toman; its dollar price is kept beside the currency table |

- **The new symbol `btc`** joins the board, the charts, the four-chart grid, the alerts, the analytics and the MCP tools
  like any other. The sample market gets a bitcoin series of its own, from a separate seed, so every existing sample
  price stays exactly as it was.
- **The currency table:** all currency rows, plus tether (`usd_usdt` → `USDT`), are kept as the latest rates. The AED
  row is `aed_note`. The table is stored as the setting `marketFx`, not as daily bars.
  - It is shown on the market page as «نرخ ارزها», with each rate's time and «هر ۱۰۰» on the yen.
  - **At the trade desk:** a currency line's rate starts from the live rate in rial (toman × 10 ÷ units), as the dollar
    already did. The same holds for «مثل معامله قبلی», a macro, a one-line entry and the conversion of a currency balance.
    The clerk can still type over it. The desk's price strip is unchanged: it stays at a few numbers.

### Checks on every update
- **`stale: true`:** nothing is stored. The status says the source called its prices old.
- **A row whose `time` is not a clock time** (an old quote with a date) is skipped.
- **The day of a quote** is the Tehran day of `last_updated`. A row whose clock time is more than 10 minutes after that
  moment is from the day before.
- **Each price** must be a positive number under 10¹³.
- **The 18k gram must agree with the ounce × the dollar** within 25%. If not, nothing is stored: a toman/rial mix-up
  would otherwise go straight into a fresh database, where the 30% jump guard has no previous price to compare with.
- **Bitcoin must agree with its dollar price × the dollar** within 25%, or bitcoin alone is skipped.
- The existing rules still apply: a quote more than 30% from the last close is refused, and a manager's own price for a
  day is never overwritten.

### Health
`/api/health?deep=1` adds `market`: the mode, whether the last update worked, how many prices it stored, when, and how
many currency rates are held. It shows no price, no error text and no key.

### Amendment: 50 requests a day, and analysis on the live price
The owner added two things:
- «روزی ۵۰ درخواست میشه فرستاد پس محدودیتش رو اتومات … تنظیم کن»: forgod allows 50 requests a day.
- «مسیر تحلیل رو هم در اپ به این قیمت در نظر بگیر و تحت تاثیر قرار بده»: the analysis must run on these prices.

**The allowance.** `BEATRIS_FORGOD_DAILY`, default 50.
- A rolling 24-hour log of every request sent to forgod is kept in the database (`forgodQuota`). It counts `/api/all`
  and each single address. A rolling window keeps every calendar day, in any time zone, within the number.
- The plan, `forgodPlan(daily)`:
  - 12% is kept back for a manager's «به‌روزرسانی همین حالا» (6 of 50);
  - a tenth of the rest goes to the night;
  - the rest is spread over market hours, 09:00–22:00 Tehran.

  For 50 that is every 20 minutes by day and every 165 minutes at night: 43 automatic requests a day, within 44.
- Automatic updates stop at daily − reserve; a manager's stop at daily. Over the line nothing is sent, and the status
  says from what time the next request is possible.
- The three single addresses are tried only when there is room for all three.
- A 429, 401 or 403 from forgod stops every request for an hour.
- The manager's interval still counts when it is longer than the plan's.
- The market data page shows the allowance used, the plan, the next automatic update and any stop.
- The deep health adds the allowance used and the number of stored days.

**The analysis follows the live price.**
- The market page and the Elliott studio listen to the live stream and still check the board every minute.
- When a price they read moves (the symbol in view, the ounce, the dollar, the mazaneh, the four charts), they work
  it all out again on it, keeping the chart where the user left it:
  - the chart;
  - «شکار قیمت» with its levels;
  - the fair value from ounce × dollar;
  - the bubbles;
  - the hidden dollar;
  - the waves;
  - the four charts;
  - the Iranian-market analytics.
- The price hunt says what it rests on: «بر پایه قیمت زنده امروز (forgod…، ساعت ۱۷:۰۵)». The fair-value note says
  that the ounce and the dollar come from the same live update. The Elliott studio names the live price and its time.
- The MCP tools, the backtest, the pulse and the control pages read the stored prices on every request, so they
  follow the feed already.

## Acceptance
- **Parsing**, against rows shaped exactly like the service's (made-up numbers, no key):
  - every mapping in the table;
  - `geram24` derived;
  - mesghal from the gram, and the gram from mesghal, when one is missing;
  - the yen per 100;
  - tether in the currency table;
  - a dated (old) row skipped;
  - a late clock time put on the day before;
  - `stale` refused;
  - a ×10 unit error refused by the ounce × dollar check;
  - a wrong bitcoin dropped alone;
  - a single-row answer read like `/api/all`.
- **Sync in `forgod` mode with a stub service:**
  - exactly one request to `/api/all`, with the key as `api_key` and nothing else;
  - the history once from tgju;
  - the board shows the prices and `btc`;
  - `marketFx` holds the rates;
  - the shop's base price follows the 18k gram;
  - when `/api/all` fails, the three single addresses are used and named in the status;
  - without a key, the status says so and nothing is requested;
  - the key is in no status, error, setting, board or feed view, even when the service's error echoes the address.
- **API:**
  - `PUT /api/market/feed {mode:"forgod"}` is accepted;
  - `GET /api/market/feed` says whether a key is set, never the key;
  - `/api/market` carries `fx`.
- **Default mode:** `forgod` with a key and no `BEATRIS_MARKET_FEED`; `owner` without a key; the variable wins over both.
- **The sample market:** every existing symbol's series is unchanged, and `btc` has one.
- **The desk:** a euro line's rate starts from the live euro rate in rial; the dollar's behaviour is unchanged.
- **Browser (e2e):** the board has 12 tiles; the market data page offers forgod and says whether its key is set.
- **Live:** with the key set on Render, `/api/health?deep=1` reads mode `forgod`, `ok: true`, prices stored, and
  currency rates held.
- **The allowance:**
  - `forgodPlan(50)` is 6 kept back, 44 automatic, every 20 and every 165 minutes;
  - 48 hours of automatic updates on a fake clock: at most 44 in any 24 hours, every 20 minutes in market hours and
    every 165 at night;
  - the manager's reserve after the automatic part is used up;
  - the 51st request is never sent;
  - the count survives a restart;
  - the window rolls rather than resets;
  - the single addresses only with room for three;
  - a 429 stops it for an hour;
  - the interval follows the Tehran clock and never undercuts the manager.
- **Browser:** a live board from the stream with a new mazaneh makes the price hunt show it, «قیمت زنده امروز
  (forgod…)», and the Elliott studio count again on it.
- `npm run gate` and the e2e pass.

## Constraints
- No key in the repository, a test, a log, the database, a browser response or a commit. The key lives only in the
  host's environment.
- No runtime dependency.
- The accounting logic (`books.mjs`, `trade.mjs`, `server/books.mjs`) is not touched. The desk only pre-fills a rate the
  clerk can change.
- The existing feed modes behave exactly as before.
- Few requests: one per update. The single addresses are used only when `/api/all` fails.

## Verification
- The 5 test requests: four by hand, plus one through the app's own feed code. Results are below.
- `tests/forgod.test.mjs`, `npm run gate`, and the e2e step «forgod (spec 0049)».
- After deploy: the deep health on https://beatris-6u77.onrender.com.
