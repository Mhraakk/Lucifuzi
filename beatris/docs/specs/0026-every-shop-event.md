# 0026 — Every event of a melted-gold and coin shop, recordable, in one chain

**Status:** implemented.

## What
A melted-gold (آبشده) and coin shop is run by a gold seller and an accountant. Whatever happens in such a shop, from
the everyday to the very unlikely, can be recorded in the books. Each event can be reached from more than one place,
and every one of them lands in the same chain:
- one document numbering and tracking code;
- one hash-chained log;
- one set of postings;
- one روزنگار, vault, customer balance, trading result and search.

### 1. The catalogue (`public/js/shopevents.mjs`)
One list, in Persian, of every event a shop like this meets. It is the single source for three things: the in-app
guide «هر اتفاق، کجا ثبت می‌شود», the command palette, and the test that records every event.

Each event has:
- a group (آبشده, سکه, شمش, ارز, وجه و بانک و چک, طرف حساب, گاوصندوق و موجودی, درآمد و هزینه, اصلاح و کنترل,
  رویدادهای دور);
- a one-line story («مشتری ۱۲ گرم آبشده ۷۴۰ آورد و پول نقد خواست»);
- the way to record it, naming the exact screen, button, line kind or document;
- the entry points (desk, one-line entry, form, customer page, vault, palette);
- what it moves: vault, a customer's money or goods account, the trading result, other income or expense.

An event that no screen can record is a bug. The test fails for any catalogue event without a working recipe.

### 2. New kinds of document (the gaps the audit found)
The audit compared real shop life with the existing documents (trade, حواله, تبدیل, sale, buy, return, receipt,
payment, expense, transfer, opening, adjust, cheque states, conditional assay). Three kinds were missing:

- **سند درآمد (`income`):** money or goods received that are not a sale. Categories: کارمزد عیارسنجی و ری‌گیری،
  کمیسیون و حق‌الزحمه، سود بانکی، اجاره دریافتی، بیمه و خسارت، هدیه، سایر.
  - It mirrors the expense document.
  - It is received in cash, at the bank, by cheque, in gold or coins, or «روی حساب» of a customer (`offset`: the
    customer owes it).
  - **Postings:** the asset account, and `inc:<category>` with the opposite sign.
- **سوخت یا بخشودگی مانده (`writeoff`):** part or all of one customer's balance is cleared, for an agreed reason.
  - It works in any unit: rial, grams of 750, a coin type, a currency or a sealed bar.
  - **Direction:** a customer's debt forgiven is a loss. Our debt to them that they waive, or a tiny leftover they will
    never claim, is a gain.
  - **Limits:** never more than the balance, never across zero. A manager only, with the reason written.
  - **Postings:** the customer's account, and `wo` in the same unit with the opposite sign.
  - **Trading result:**
    - goods they owed us leave our position at average cost, a realized loss;
    - goods we owed them come back into our position at zero cost, so the gain is realized when sold;
    - rial is reported under «سوخت و بخشودگی».
- **ذوب و تبدیل جنس (`transform`):** what goes into the vault and what comes out of a melting, re-assay, cutting or
  sealing:
  - **Inputs:** melted gold, sealed bars and coins leave the vault (`dir: out`). Their nominal gold is weight ×
    fineness, and for a coin its official weight and fineness.
  - **Outputs:** melted gold and new sealed bars enter (`dir: in`).
  - **Wastage (افت):** the 750-equivalent in minus the 750-equivalent out. A loss is realized at average cost. A gain
    (a better assay) enters at zero cost.
  - **Cost:** the inputs' average cost moves to the outputs. Coins melted into gold move their cost from the coin
    position to gold.
  - **Fee:** an optional melter's or lab's fee, paid or owed, goes to the expense «ذوب و ری‌گیری».
  - **Bars:** the same serial rules as trade apply: in once, out only if present.
- **A sealed bar leaves at its card** (trade and transform alike): the weight and fineness of an outgoing bar line
  must equal the bar's card, the weight and fineness it came into the vault with (±0.0005 g, ±0.05 fineness; the document
  being corrected never counts as the card), or the document is refused with the card's
  figures. The desk fills them from the card when the serial is typed on a sale. Without this, a bar bought as 250 g
  and sold as 100 g leaves 150 g in the position that the vault no longer holds (found by the fuzz test).

### 3. One position, everywhere (a consistency fix)
The trading result keeps, per unit, what the shop owns: physical stock + goods customers owe − goods the shop owes.
The audit found moves that changed the vault or a customer's goods account but not this position. They now all count:
- **Gold or coins as payment** in a sale, buy, return, receipt, payment, expense or income (for example a debt settled
  with 3 grams, or rent paid with a coin): received is bought at its stated value; given is sold at its value, with
  the profit or loss against average cost.
- **A sale left on gold credit** (نسیه طلایی): the grams the customer now owes enter at the credit's value.
- **Opening balances of customers in goods:** they enter the position at the cost given, or else at the average cost of
  the same goods the shop holds in that opening (gold with its bars, each coin, each currency). At zero cost, grams owed
  to us would later show their whole value as profit and grams we owe would hide profit; at the shop's own average the
  result is exact (the test sells everything and finds exactly the price margin). Only a row the result must value at
  zero (stock without a cost, or customers' goods with no stock to price them) raises «بهای تمام‌شده ثبت نشده». The
  FIFO lots take what the shop owes at the opening out of the oldest lot at its cost, realizing nothing, so the two
  views agree. Opening rows never realize anything, whatever their order.
- **The new documents:** income in kind, write-off and transform, as in §2.

The invariant: for every unit (gold in grams of 750 with bars at their card's 750-equivalent, each coin, each
currency), position quantity = vault + Σ customers' goods balances. After every document, in every test.

### 4. The whole count
The vault's physical count covers everything the shop holds, not only gold and coins:
- each cash box;
- each currency;
- every sealed bar, as a checklist of serials, where a missing bar is a shortage at its card.

The differences are saved with the existing «سند اصلاح موجودی». A count is what is physically there, so it is never
below zero: the dialog refuses a negative figure, and the server refuses an adjustment that would leave gold, a coin, a
currency or a cash box below zero (found by the browser test, whose box had gone negative).

### 5. The result of the period
The P&L tab adds the whole result:
- **Trading result:** realized by average cost, including count shortages, wastage and goods write-offs.
- **Other income:** by category.
- **Expenses:** by category.
- **Rial write-offs:** gains and losses.
- **Net result:** the sum of these.

The same numbers are in the export.

### 5b. A cheque in a rial document (a bug the one-chain test found)
A cheque taken or given in a base-edition document (trade, transform…) was stored at ten times its amount, as if typed
in toman, so its bounce, clearing or endorsement moved ten times the money. Cheques of base-edition documents are now
stored in rial as typed. At start, each existing cheque whose amount is exactly ten times its own payment's value is put
right, its status postings are rebuilt from its history, and the repair is written to the hash-chained log
(`cheque.repair`, from → to). The repair is idempotent. `tests/chequefix.test.mjs` covers both.

### 6. Correcting the new kinds
- **Income** is corrected in its form like an expense (an amendment).
- **حواله، تبدیل، ذوب، شمارش و سوخت** are recorded from their own place (desk, vault, customer page). They are
  corrected by voiding and recording again; both stay in the history. The document page says so instead of offering
  an editor, and the form refuses these kinds with a link to where they are recorded.
- **The change log** (spec 0024) names a write-off's unit and amount and each row of an opening or a count, in words.

### 7. The paper
Every kind prints with its own body on the standard form and on A4/A5/roll: the melting's rows (in and out, 750-
equivalent, wastage, fee), the write-off's unit and amount, the payments and category of income and expenses, the
rows of an opening or a count with their cost. The bottom line says what it is («دریافت شد»، «پرداخت شد»، «سوخت از
بدهی مشتری»…), never «قابل پرداخت خریدار» for a document that has no buyer.

### 8. Several ways in
- **The guide «هر اتفاق، کجا ثبت می‌شود»:** under راهنما and in the books menu. Each event has a button that opens the
  right screen.
- **The palette (Ctrl+K):** finds an event by any word of its story.
- **The customer page:** «سوخت یا بخشودگی مانده».
- **The vault:** «ذوب و تبدیل جنس» and the full count.
- **صندوق، بانک، چک:** «درآمد» next to «هزینه».
- **اسناد:** a «سند تازه» menu with every kind the edition uses.

## Acceptance
- **`tests/shopevents.test.mjs`:** every catalogue event is recorded through the real HTTP API with its recipe. After
  each one:
  - the log's hash chain verifies;
  - the position invariant (§3) holds for every unit;
  - the vault is never negative where it cannot be;
  - the document appears in روزنگار of its day;
  - one of its figures is found by the number search;
  - its tracking code opens in رهگیری.
  - An event without a recipe fails the test.
- **`tests/trade.test.mjs`:**
  - the new calculations: income, write-off (each unit, each direction, never across zero), transform (wastage, gain,
    coins to gold, bar to melt, melt to bar);
  - the position fix: gold and coin payments, gold credit, opening customer goods in any order.
- **Fuzz:** melting (with bars and coins in, melted gold or a new bar out, and a fee), write-offs in rial, gold and
  coins, income, and expenses paid in cash or gold join the random sequences. The vault is checked every 25 steps;
  at the end, every customer balance, the net result (income, expenses with the melter's fees, rial write-offs) and
  the position invariant for gold, each coin and each currency must equal the model.
- **`tests/tradeapi.test.mjs`:** a bar sent out at another weight or fineness than its card is refused and stays in
  the vault.
- **`tests/docdiff.test.mjs`:** the change log of a write-off and of a count adjustment.
- **e2e:**
  - an income from صندوق، بانک، چک;
  - a write-off from a customer page;
  - a melting from the vault;
  - the full count with a cash box;
  - the guide opens the right screen;
  - the palette finds «ذوب».

## Constraints
- **Corrections:** amendment only. Final documents are never deleted, and the new kinds follow the same void, amend
  and restore rules.
- **Money:** integer rial. Weights are 3 decimals, and 750-equivalents are rounded to 3 decimals before any price.
- **No silent changes:**
  - The trading result changes only where the audit found a real inconsistency.
  - The existing count-shortage and surplus conventions stay as they were.
  - Every change of a reported number is covered by a test that explains it.
- **Tax:** no change for melted gold and coins; their principal stays exempt.
