# 0045 — Exact rounding of money and weight

**Status:** done.

## What
The books round twice:
- the 750-equivalent of a piece to three decimals, then its price;
- a money value to a whole rial, or to the shop's rounding step.

Both roundings are half away from zero (`rnd`, spec 0004). They were computed in binary floating point, which cannot
hold most decimals exactly. On an exact half, the result sometimes fell on the wrong side:
- **The 750-equivalent:** 1.047 g × 875 ÷ 750 is exactly 1.2215. The float product is 1.22149999…, so the books kept
  1.221 g instead of 1.222 g. The missing milligram was then priced. At a مظنه of 30 million rials the line came out
  6,926 rials short (step 1), or one whole rounding step short (step 10,000).
- **Money:** 22,069.26 dollars × 358,075 rials is exactly 7,902,450,274.5 rials. The float product is just under the
  half, so the line was booked at …274 instead of …275.

The audit (spec 0044) measured how often each formula went wrong against exact fractions:
- about one line in 1,600 had a wrong 750-equivalent;
- about one in 200 currency lines had a wrong rial.

Every rounded figure is now computed exactly. Each typed number is taken as the decimal it was written as. A product
or quotient of such decimals is an exact fraction (BigInt), and it is rounded once, half away from zero, to the unit
or step the books already use. The rules do not change; only the arithmetic does.

### Where
- **`public/js/exact.mjs` (new):**
  - `dec(x)` reads a number or numeric string as a decimal;
  - `mulDiv(nums, dens, step)` gives Π nums ÷ Π dens rounded to a multiple of `step`;
  - `quant(x, step)` rounds one decimal to a step;
  - `sum(xs, step)` adds decimals exactly.
  - **Speed:** the float result is used where it is provably on the same side of the half as the exact one. Its error
    is about 2e-15 relative, against a margin of 1e-12. Only a figure that close to a half takes the BigInt path
    (`exactMulDiv`, `exactSum`). A first version that always used BigInt made the engine about 7× slower.
  - **Checks:** 8 million comparisons show the two paths equal, constructed halves included. The engine is back to
    its old speed: 20,000 documents in about 40 ms.
- **`trade.mjs`:**
  - the weight;
  - the 750-equivalent, mesghal and pure weight;
  - the gold value by مظنه, by the price of a gram of 750, or by agreed amount;
  - the implied مظنه;
  - coins by count, weight or amount;
  - currency amount and value;
  - تبدیل (convert);
  - the quantities of حواله and سوخت.
- **`books.mjs`:**
  - the price per gram at a fineness;
  - molten-gold value;
  - every jewel field: weight, gold, making charge (percent, per gram, fixed), profit, commission, stones,
    discount, VAT;
  - coin and goods prices;
  - decimal quantities;
  - used-gold gross and deduction;
  - service;
  - toman → rial;
  - payments in gold, coins and money;
  - credit in grams.
- **`server/books.mjs`:** the amounts it rounds itself:
  - the opening and adjustment balances and their costs;
  - the payment amounts of receipts and payments;
  - the credit limit;
  - a write-off's bar equivalent;
  - the dashboard's stock value and the coin price derived from gold.
- **`melt.mjs` (the molten-gold course and its ledger trainer):** the same two roundings, so a learner who rounds
  correctly by hand is graded right.

## Acceptance
- **Exact against the oracle:** for random inputs and for inputs built to land exactly on a half, every figure listed
  above equals the exact fraction rounded half away from zero. The test oracle reaches the answer independently:
  - it builds the halves from known answers;
  - it rounds by its own decimal string arithmetic.

  The gate runs 2,000 inputs per formula (about 20,000 in all); `EXACT_N=200000` runs 200,000 per formula.
- **The two examples:**
  - 1.047 g at 875 → 1.222 g of 750, and its value at 30,000,000 rials مظنه is the value of 1.222 g;
  - 22,069.26 × 358,075 → 7,902,450,275 rials.
- **Nothing else moves:**
  - away from halves, every figure equals the old float result. A random sample of 200,000 lines per formula shows
    no other difference;
  - the existing unit tests, the fuzz, the hundred rounds and the e2e pass unchanged;
  - documents already saved keep their stored figures, since the replay reads the stored calculation. A new version
    of an old document is computed exactly.
- **Speed:** the 20,000-document bench (spec 0001) stays within its p95 targets.

## Constraints
- No change to any rule:
  - the units (rial, grams of 750 to three decimals, currency to two);
  - the steps (1, 1,000, 10,000, 100,000 rials);
  - half away from zero;
  - VAT only on making charge and profit (and commission).
- No new dependency. BigInt is in every supported browser and in Node 22.
- Inputs keep their validation and Persian messages. Exactness never accepts what was refused before.

## Out of scope
- Charts and indicators. Their figures are shown, not booked.
- The tool calculators. They show rounded tomans and are checked by spec 0044 against their own formulas.

## Results
- `EXACT_N=200000 node --test tests/exact.test.mjs`: 6/6 in 39 s. Every formula agrees with the decimal-string
  oracle, constructed halves included.
- The old engines fail the new test on the two examples and on the constructed halves; away from halves they agree
  with the new ones on every sampled line.
- The float fast path and the BigInt path agree on 8 million inputs. The 20,000-document bench is back to its old
  speed (about 40 ms), against about 7× slower for BigInt everywhere.

## Verification
- `npm run gate` (new `tests/exact.test.mjs`).
- `EXACT_N=200000 node --test tests/exact.test.mjs`.
- The fuzz with three seeds at 5,000.
- `node scripts/hundred.mjs`.
- The full e2e.
