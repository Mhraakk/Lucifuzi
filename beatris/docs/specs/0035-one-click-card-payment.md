# 0035 — One tap: the exact amount goes to the card reader

**Status:** implemented. Builds on spec 0005 (the card-reader bridge); its protocol, drivers and rules are unchanged.

## What
Once the amount of a sale is known, one button — «پرداخت با کارتخوان» — sends exactly what is left to pay to the shop's
card reader. The customer only swipes (or taps) the card and enters the PIN. The document is booked only after the bank
approves, with the reference number (RRN), the last four digits of the card and the terminal ID written on the payment
by themselves.

### The button
- **Where:**
  - in the trade desk, in the bar with «ثبت»;
  - in the invoice editor, under the totals.
- **When it shows:**
  - something is still owed by the customer (the document's rial credit is above zero);
  - this device can reach a card reader, directly or through the counter (below).
- **What it does, in order:**
  - **The amount:** it takes the remaining amount from the document's own calculation (`calc.credit`, whole rial), never
    from typed text.
  - **The row:** it puts that amount on a «کارتخوان» receipt row. It reuses the open card row if there is one and adds
    one if not. A row that already has a reference is never touched.
  - **The charge and the booking:** it charges the row and then books the document.
- **One row, one charge:**
  - An approved row keeps its RRN, so a retry never charges twice.
  - A declined or cancelled charge books nothing.

### Phones and tablets: through the counter
A shop has one card reader, at the counter, connected to one computer through the local bridge (spec 0005). Other
devices reach it through the app server.

- **The counter computer** turns on «این رایانه کارتخوان پیشخوان است».
  - While the app is open there, it calls the server about once a second, and it takes requests one at a time.
  - It sends each request's amount to its bridge, which sends it to the terminal.
  - It reports every step back: waiting for the card, approved, declined, cancelled.
  - A small badge on that computer shows what is happening: «آماده», or the amount being charged.
- **Any other device** turns on «این دستگاه کارتخوان ندارد؛ پرداخت را به کارتخوان پیشخوان بفرست».
  - Its pay button creates a request on the server: the request's id and the exact amount.
  - The same window as a direct charge follows the request to its end.
  - «انصراف» cancels it, both while it waits and while the terminal is working.
- **The server's table** `bk_pos_req`:
  - **States:** pending → connecting → waiting → approved / declined / cancelled / unknown / error / expired.
  - **Ownership:** only the station that claimed a request may report on it.
  - **Finality:** an approved request never changes again.
  - **The log:** every final state goes to the reconciliation log `bk_pos`, under the person who asked. An approval
    without a document therefore appears as «پرداخت تأییدشده بی‌سند», as in spec 0005.
- **Time limits:**
  - **No counter online** (none seen in the last 8 s): the request is refused at once with a plain sentence.
  - **Pending:** a request nobody claims within 60 s expires.
  - **A silent counter:** if a claimed request gets no report for 45 s, it becomes «نتیجه معلوم نیست».
    - The money may have been taken, so it is never shown as declined.
    - The device shows the manual RRN field, as spec 0005 does for a lost bridge.

## Acceptance
- **`tests/posrelay.test.mjs`**, on the server:
  - **Refusals and expiry:**
    - no counter online → 409;
    - a pending request expires;
    - a silent counter → `unknown`.
  - **Claiming:** a counter claims requests one at a time, oldest first, and never takes a second while one is open.
  - **Reports:**
    - only the claiming counter may report;
    - an approval is final;
    - the approved amount and RRN reach `bk_pos` under the requester.
  - **Cancelling:** a pending request is cancelled at once; an open one passes the cancel to the counter.
  - **Amounts:** whole rial from 1,000 up; a reused id never makes a second request.
- **`scripts/e2e.mjs`**, step `pos`, with a stand-in bridge:
  - **One tap on the desk:**
    - the bridge receives exactly the remaining rial amount;
    - the receipt carries the RRN;
    - the document is fully settled.
  - **A declined card** books nothing.
  - **A second device in relay mode:**
    - one tap on that phone;
    - the counter page charges through the bridge;
    - the phone's document is booked with the RRN.
  - **The invoice editor:** one tap charges the remaining amount and books the final invoice.

## Constraints
- **Accounting logic is unchanged:** the card payment is an ordinary «کارتخوان» receipt row. `bk_pos` and `bk_pos_req`
  are only for reconciliation and relay.
- **Amounts** are always whole rial, from the engine's calculation.
- **The browser never sends a command to the bridge**, only an amount and an id (spec 0005).
- **No runtime dependency.** Polling is plain HTTP; no sockets.
