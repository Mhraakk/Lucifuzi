# 0023 — Number search in روزنگار

**Status:** implemented. Read-only.

## What
An accountant remembers one figure, «حدود ۶۰۰ میلیون تومان», and nothing else. In روزنگار, typing that figure
searches **every day**, and every figure of every document, with fixed and visible rules. There are no guesses, and
there is no new page.

- **Reading the number:**
  - Digits (Persian, Arabic or Latin, with or without separators) or words. Scales are هزار، میلیون، میلیارد. The
    market forms «۱/۲ میلیارد» and «۴۵ میلیون و ۲۰۰» are read the same way as at the desk (`oneline.mjs`).
- **Unit:**
  - A unit typed after the number (تومان/ریال، گرم/سوت، مثقال، تا/عدد/سکه) is the unit searched.
  - Money typed without a unit is read in the shop's unit. The screen shows that reading and offers one switch to
    the other unit.
  - A bare number with no unit and no scale is compared, as written, with every kind of figure. Each result names
    the figure it matched.
- **Precision:**
  - The choices are دقیق، ±۱٪، ±۵٪، ±۱۰٪.
  - The default is دقیق. «حدود، تقریباً، حول و حوش، نزدیک» selects ±۵٪.
  - The searched band itself is always shown. For example: «۵٬۷۰۰٬۰۰۰٬۰۰۰ تا ۶٬۳۰۰٬۰۰۰٬۰۰۰ ریال».
- **Figures searched:**
  - **Money:** every payment and receipt, every line value (price, making charge, profit, tax, discount, fee), each
    document's total, the part left on the customer's account, hawalas, conversions and opening balances.
  - **Goods:** weight, 750-equivalent, mesghal and count.
  - **Prices:** the مظنه and other prices are searched only when «مظنه، نرخ یا قیمت» is written.
  - Voided documents, and originals replaced by an amendment, are searched too. They are marked «باطل» or
    «جایگزین‌شده» so a remembered figure that was later corrected is still found.
- **Words beside the number:**
  - Any words typed with the number narrow the results. They are matched the way روزنگار's own filter matches
    (normalized letters) against the customer's name, the note and references.
- **Order of results:**
  - Nearest to the number first, then newest first.
  - The results are grouped by day. Each one shows the time, the document, the customer, the matched figure, how far
    it is from the number, and links to the document and to روزنگار of that day.
- **Ways in:**
  - The search box of روزنگار. A number triggers the all-days search, and plain words still filter the day shown.
  - Ctrl+K: a number there offers «این عدد در روزنگار».

## Acceptance (`tests/daysearch.test.mjs`, e2e «day number search»)
- **Reading:**
  - «۶۰۰ میلیون تومان» is 6,000,000,000 rial.
  - «۶۰۰ میلیون» is 600,000,000 in a rial shop and 6,000,000,000 rial in a toman shop.
  - «۱/۲ میلیارد ریال», «یک میلیارد و دویست میلیون ریال» and «۱٬۲۰۰٬۰۰۰٬۰۰۰ ریال» are the same.
  - «۱۲۰ گرم» is a weight. «۳ تا سکه» is a count.
  - «حدود» selects ±۵٪.
- **On a seeded shop:**
  - An exact figure finds its payment on its own day, months back.
  - ±۵٪ finds the 598.5 million payment for «حدود ۶۰۰ میلیون تومان»; دقیق does not.
  - The original of an amended document is found and marked «جایگزین‌شده».
  - «۱۲۰ گرم» finds the deposit.
  - Words narrow the results to one customer.
  - The same query twice gives the same list in the same order.
- **Permissions:** a seller without back-dating sees only today, as in روزنگار.
- **Speed:** on 3,000 documents a search answers in under 150 ms after the first. The bench records 20,000.

## Constraints
- Read-only. The index lives in memory per ledger revision (spec 0004).
- No fuzzy names, no estimated values, no combinations of payments: the result of a search must be predictable from
  the rules above.
- The page and its rules are the same for every user. Only the date reach follows the روزنگار permission.
