# 0024 — Transparent corrections: exact change log, safe restore, repeatable simulation

**Status:** implemented. No new screen. The existing document page, رهگیری and the simulator show more and promise
more.

## What
A professional user needs to see, prove and undo, not to guess. Three things the books already do become exact.

### 1. What exactly changed
`public/js/docdiff.mjs` (pure) compares two contents of a document field by field:
- the header: date, customer, note, category, seller, credit unit;
- every line: kind, direction, priced or not, weight, fineness, مظنه or price basis, count, serial, fee, making
  charge, profit, discount;
- every payment: method, direction, amount, account, reference, card, cheque number and due date;
- hawala and conversion terms, and the resulting totals: total, received, paid, left on account.

Lines and payments are paired by their kind before they are compared, so an inserted line reads as «added» rather
than as every later line changed. Money inputs are compared in rial; the full edition's toman inputs are ×10.

The output is a list of `{ at, n, field, from, to, kind }`. The same two contents always give the same list, in the
same order.
- **In the log:** an amendment (`doc.amend`), an edit of a draft (`doc.update`) and a restore (`doc.restore`) write
  this list into their log entry, so the hash chain carries what changed, not just that something changed.
- **On the document page:** an amendment shows «تغییرات نسبت به سند قبلی» line by line, for example
  «ردیف ۱ (آبشده)، وزن: از ۱۲٫۴۵۰ به ۱۲٫۵۴۰ گرم». Each version in «تاریخچه نسخه‌ها» shows what it changed.
- **In رهگیری:** the timeline shows the same lines under each correction. Documents corrected before this change get
  their diff computed from the stored versions.

### 2. Safe restore («برگرداندن»)
A wrong amendment or a wrong void can be undone in one step, without retyping and without touching history:
- **A replaced original:** a new amendment of the current document whose content is exactly the chosen original.
  The original stays where it is.
- **A voided document:** a new document with the same content, linked to it (`restores`). It keeps the original
  date.

**Exactness first:**
- The restored document must reproduce the original's figures exactly: every line value, every payment, total,
  received, paid and left on account.
- If anything would differ, nothing is saved, and the first difference is named. Rounding, tax rate or prices may
  have changed since.

**Every normal check applies:** period locks, approvals, stock and bar serials, cheques, items already sold and
credit limits.

**Who and how:** managers only, as for a void. A reason is required. The log entry `doc.restore` names both
documents and the change list.

**Out of scope:** opening and inventory-adjustment documents are corrected with a new document of their own, as
today.

### 3. A simulation you can repeat
- **Its basis:** the trade simulator answers with the basis it used:
  - the day;
  - the ledger position (the last event of the hash-chained log: its number and hash);
  - the prices it compared against, with their source and time;
  - a short fingerprint of inputs + basis.
- **Repeating it:**
  - Sent again with the same basis, it gives the same result.
  - If the books have moved since (new events), the answer says how many events came in after that basis.
  - Prices can be pinned, so a review tomorrow can re-run today's decision with today's prices.

## Acceptance (`tests/docdiff.test.mjs`, `tests/restore.test.mjs`, e2e «corrections»)
- **Diff:**
  - Weight, مظنه, payment amount and customer changes are listed with from and to.
  - An inserted line is one «added», not a shifted list.
  - Toman inputs of a full-edition invoice appear in rial.
  - Identical contents give an empty list. The order is stable.
- **Log:** after an amendment, the log entry holds the change list, and the chain still verifies.
- **Restore:**
  - After a wrong amendment, the original comes back as a new amendment with the original figures. Balances equal
    those before the wrong amendment.
  - A voided trade comes back with the same date, figures and balances. The bar serial and stock checks still stop
    an impossible restore.
  - A change of rounding since the original stops the restore and names the difference.
  - A seller cannot restore, and a reason is required.
- **Simulation:**
  - The same input with the same basis gives an identical answer, fingerprint included.
  - After a new document, the answer reports one event since the basis.
  - Pinned prices are used instead of the live board.

## Constraints
- **Accounting formulas do not change.** A restore is the existing save or amend, plus a refusal when the figures
  would not be identical.
- No new table, no new menu.
