# 0029 — Hundred rounds: every accounting input and output, through the real app

**Status:** implemented.

## What
A debug run that uses the app the way a shop does, a hundred times over. Each round enters through the screens people
use and reads every output that should reflect what was entered. A small model checks every figure. The model uses
only the shared pure engine (`trade.mjs`) and what was typed, never the server's postings.

`node scripts/hundred.mjs [--rounds=100]` starts a fresh server, signs in, sets the base edition and runs the rounds.

### Every round (through the browser)
1. **Desk:**
   - the customer is found by typing in «مشتری» and picked with Enter; every tenth round, a new customer is created
     from the desk;
   - one trade: buy and sell, rotating آبشده، سکه، شمش، ارز. A bar is sold only after it was bought, at its card;
   - the round's payment, rotating cash, card reader, card-to-card, bank slip, cheque and «on account» (none);
   - saved → the receipt with its tracking and authenticity codes.
2. **What was typed is what was stored:** weight, fineness, مظنه, count, price, currency amount, rate, payment
   amounts, references and the cheque's number and date.
3. **Outputs of the same round:**
   - روزنگار in the document's section lists it;
   - روزنگار's number search finds its amount;
   - رهگیری opens it by its code;
   - سرنخ‌یاب (spec 0032) finds it from small clues, holding every clue: three letters of the customer's name with
     three digits of its code; the amount's tail («آخرش …») with its kind; part of a cheque number; part of a bar
     serial;
   - the customer's page shows the balance the model expects.
4. **Every fifth round, the books screens through the API:** a receipt, a payment, an expense, an income or a
   transfer between cash and bank. These change cash and bank exactly by their amounts.
5. **Every tenth round:**
   - a حواله between two customers, a تبدیل of goods on account to rial, a سوخت, a ذوب from the vault and a count;
   - every report: P&L with its net result, VAT, sales, balance, stock;
   - the روزنگار CSV export and the full export;
   - a sweep of every books page for page errors, bad numbers and overflow.

### After every round (API reads, no screen)
- The event log's hash chain verifies, and the replay rebuilds exactly the stored postings.
- **Cash and bank:** each account equals the model: the opening, plus and minus every payment by the account it
  names.
- **Goods:**
  - the vault's آبشده (750 equivalent), each coin, each currency and the bars in the vault equal the model;
  - customers' goods (custody) equal the model's goods on account.
- **Customers:** every customer's balance in every unit equals the model. The model is the sum of each document's
  credit from `calcTrade`, plus the books documents.
- **روزنگار of today:** its document count equals what was saved today.
- **Search:** روزنگار's number search and رهگیری find this round's document. A sample of earlier documents is checked
  again every tenth round.

### The report
- `hundred-report.json` and the console list every feature tried, with:
  - its tries, passes and failures;
  - p50 and p95 time;
  - every failure with the round, the document's code and both values (expected and found).
- Page errors and browser console errors are listed too.
- **A failed desk round** (added 2026-10-12) names the step it stopped at: opening the desk, picking the customer,
  filling the line, adding it, the payment or saving. It also gives what the screen said (toasts and alerts) and
  leaves a screenshot `hundred-rN.png` next to the report.
- The run exits non-zero on any failure.

## Acceptance
- **100/100 rounds:** every check passes, with no page error and no console error.
- **Bugs:** each one the run finds is fixed with a test that fails without the fix, and the run is repeated until it
  is clean.

## Constraints
- **Local only:** a fresh local server and data directory every time, never a live server.
- **One pure engine:** the model uses the same `trade.mjs` the app ships. It never reads postings, so a fault in
  posting, balances, روزنگار, search or reports shows as a difference.
- **No change to accounting logic** without its own spec and test.
