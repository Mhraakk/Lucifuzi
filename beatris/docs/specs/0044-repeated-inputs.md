# 0044 — Repeated inputs at every level of the app

**Status:** done. The live checks run after the deploy.

## What
The owner asked: «اپ رو تکمیل کن … بارها و بارها ورودی بده و ببین خروجی صحیح در تمام سطوح اپ می‌ده یا نه و اگر نداد
درستش کن». So the whole app is driven again and again with seeded random inputs. Each output is checked against an
oracle that does not use the app's code. Every difference is root-caused, fixed, and kept as a test.

### Levels
1. **Engine:** the pure modules (`public/js/*.mjs`) called directly, thousands to millions of times per area.
2. **API:** a real server over HTTP, with the same random inputs. What is stored, and every report that reads it, must
   agree with the oracle.
3. **Browser:** the screens people use. The inputs are typed into the real forms, and the figures on screen are read
   back and compared.
4. **Live:** the public pages of https://beatris-6u77.onrender.com. Everything behind sign-in is checked locally, since
   signing in there needs a real mailbox.

### Areas and their oracles
| Area | Oracle |
|---|---|
| Money and weight of every trade and invoice line, payment and conversion | Exact decimal fractions (BigInt), rounded once, half away from zero (spec 0045) |
| The tool calculators (invoice, مظنه, buy-back, coin, density, ring, karat, alloy, casting, plating, stone, resize, Bayes) | Each formula written again from its definition; round trips (مظنه ↔ گرم ۱۸, ring sizes) |
| Dates (Jalali ↔ Gregorian) | The browser's own Persian calendar (`Intl`, `fa-IR-u-ca-persian`) |
| Persian numbers typed and shown | Format then parse gives the number back, for Persian, Arabic and Latin digits and separators |
| Market language and one-line entry | Phrases generated from a grammar with known values |
| Indicators (SMA, EMA, RSI, MACD, Bollinger, ATR) | Plain loops written again from their definitions |
| Fraud probability (Bayes) | Odds × likelihood ratios, computed separately |
| Books: base edition | `tests/fuzz.test.mjs` (spec 0004), many seeds and 5,000 operations each, with an exact oracle |
| Books: shop invoices (jewel, coin, molten, used, service, goods; VAT; payments in gold and coins) | A new API fuzz with the same exact oracle: stored lines, VAT report, balances, stock |
| Day number search and clue finder | Every saved document is found by its own figures |
| The desk, end to end | `scripts/hundred.mjs` (spec 0029), 100 rounds |
| Calculators on screen | Random inputs typed, the figures read back from the page |

## Acceptance
- Every area above runs clean:
  - the engine areas with at least 100,000 random inputs each, plus the edge cases built on purpose (exact halves,
    the smallest and largest allowed values, invalid input);
  - the API fuzzes with at least three seeds of 5,000 operations;
  - the hundred rounds 100/100;
  - the calculators on screen with at least 200 inputs per calculator.
- **Every difference is fixed with a test** that fails without the fix. It is listed under «Findings» with its cause.
- `npm run gate` and the full e2e pass. After the deploy, the live checks pass.

## Constraints
- **Independent oracles:** the oracles never import the module they check. A test may share only the number parser,
  and only where the parser itself is checked separately.
- **Reproducible:** every run is seeded, and a failure prints its seed and input.
- **Local servers only:** fresh data, never the live server. The live checks only read public pages.
- **Accounting logic:** it changes only with its own spec and test (spec 0045 for rounding).
- No new runtime dependency.

## Findings
1. **Exact halves were rounded by binary floating point** (spec 0045).
   - The 750-equivalent is rounded to three decimals before pricing. When the exact value sat on a half milligram,
     it sometimes went down instead of away from zero. Example: 1.047 g at 875 is exactly 1.2215 g of 750; the books
     kept 1.221 instead of 1.222. The lost milligram was then priced, so the line could differ by up to one rounding
     step (10,000 rials at the default step).
   - The final rounding of a money value had the same fault, one rial at a time. It affected currency lines, the
     price of a gram, the making charge per gram, gold value, used-gold deduction and decimal quantities.
   - Found by the fuzz at 5,000 operations with seed 11. The audit then measured each formula against exact
     fractions.
2. **The fuzz generator's own amounts were not decimals:** `x/100 + 1` gave amounts like 4096.219999999999. The
   generator now writes the decimals it means.
3. **An amount in words stopped at 10^15 rials.** `books.words` had scales up to «هزار میلیارد». So 10^15 was written
   «یک» and 2.5×10^15 «دو و پانصد هزار میلیارد». A line may reach 10^15 and a document sums its lines, so the
   invoice's «مبلغ به حروف» could be wrong. «میلیون میلیارد» is added (up to 10^18). The test reads the words back for
   random amounts up to 2^53.
4. **Two checks of the search were the test's own fault**, not the app's. A sample customer's mobile ended in the very
   digits asked for, and a first name was the start of another customer's surname. In both cases more than a page of
   documents held every clue, so the ranking was right. The names and mobiles are now distinct, and the tail is the
   whole figure.
5. **A mobile typed with the international 00 prefix was refused.** «۰۰۹۸ ۹۱۲ …» is how +98 is written without a plus
   key. The three readers of a mobile (the books' `normalizeMobile`, the sign-in's `normalizePhone` and the sign-up
   form's `phoneOf`) knew «+98», «98» and «9…», but not «0098». So the form said «شماره موبایل ۱۱ رقمی را با ۰۹ بنویسید»
   and the books refused the customer's number. «0098» now reads as «98». The test types every shape for random
   mobiles, in Persian and Latin digits, into the books and the sign-in, and the e2e asks the sign-up form itself.
6. **The pure gold of a quarter coin had two values.** The market relations (`ta.mjs`) wrote a quarter as 2.0332 g,
   while the coin table the books use (`coins.mjs`) has 2.03325 g. So the bubble of a quarter was priced on 0.045 mg
   less gold than the coin the shop sells. `ta.mjs` now reads every coin's weight and fineness from `coins.mjs`, and
   the test checks the two agree for every coin.

## Results
| Level | Run | Result |
|---|---|---|
| Engine | `tests/exact.test.mjs` with `EXACT_N=200000` (every booked formula, constructed halves) | 6/6, 0 differences |
| Engine | `tests/repeated.test.mjs` with `REPEAT_N=20000` (dates, numbers, words, calculators, Bayes, indicators, sales desk, identifiers, market relations) | 9/9 in 17 s, 0 differences |
| Engine | Market language and one-line entry, 120,000 generated sentences | 0 misreadings |
| API | `tests/fuzz.test.mjs`, 5 seeds × 5,000 operations | clean |
| API | `tests/fuzz-shop.test.mjs`, seeds 7, 1405 and 20261024 × 5,000 operations | clean, about 45 s each |
| API | `tests/findall.test.mjs`, 160 in the gate and 2 × 1,200 | every document found by its own figures |
| Browser | `scripts/calc-rounds.mjs`: 14 calculators × 200 rounds, typed in Persian or Latin digits | 9,200 figures read back, 0 wrong |
| Browser | `scripts/invoice-rounds.mjs`: 200 sale invoices with 1–3 pieces, used gold, discounts, rial or toman | 1,298 figures, 0 wrong |
| Browser | `scripts/hundred.mjs` (spec 0029) | 100/100, 0 page errors |

## Verification
- `npm run gate`.
- `node --test` on the new randomized suites with larger counts (`FUZZ_N`, `EXACT_N`).
- `node scripts/hundred.mjs`, the full e2e, and the live checks after the deploy.
