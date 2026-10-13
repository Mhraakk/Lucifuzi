# 0032 — سرنخ‌یاب: one search for any clue

**Status:** implemented. Read-only.

## What
A person remembers a scrap: «یه چیزی حدود ۴۹ میلیون، اسمش رض… بود، فکر کنم کارت به کارت»، «آخرش ۷۸۰ بود»، «چک ۸۸۹…»،
«همون شمش HR12…»، «موبایلش ۴۵۶۷»، «دیروز عصر سکه امامی». From that scrap alone the app finds the document, the trade,
the customer, the cheque or the bar. There is one engine and one box, and they are the same everywhere:
- `/books/find` «سرنخ‌یاب»;
- Ctrl+K and the search button in the top bar (phone and desktop);
- روزنگار and رهگیری when their own search finds nothing.

Nothing is guessed. Every clue is read with a fixed, visible rule. The page shows how it read each clue, and every
result says which clue it matched, in which field, and how.

### Reading the clues (`public/js/clue.mjs`, `readClues`)
- **Amounts:** read as in روزنگار (spec 0023): units, scales, «۱/۲ میلیارد», words, «حدود» = ±۵٪. A money amount
  typed without a unit is read in the shop's unit.
- **Ranges:**
  - «۴۹ میلیون و خرده‌ای» → from 49 million to under 50 million.
  - «سیصد و خرده‌ای میلیون» → from 300 million to under 400 million.
  - «بیشتر از / بالای ۲ میلیارد» and «کمتر از / زیر ۵ گرم» are open ranges.
  - «بین ۱۰ و ۱۲ گرم» and «از ۱۰ تا ۱۲ گرم» are closed ranges.
- **Part of a figure:**
  - «آخرش ۷۸۰» matches a figure that ends in 780 followed only by zeros, so it reads the same in rial and in toman.
  - «اولش ۴۹» matches a figure that starts with 49.
  - A bare run of four or more digits also matches a figure that contains it.
- **Codes and numbers that are not money:** a bare run of three or more digits is a fragment. It matches anywhere in:
  - a tracking code and the document's number;
  - a payment reference and the card digits;
  - a cheque number and a صیادی ID;
  - a bar serial;
  - a customer's mobile, phone, national ID and customer code.

  A bare number is also compared, as written, with every figure (spec 0023). A whole tracking code opens its
  document. A Latin letter-and-digit fragment («HR12») matches serials, tracking codes and authenticity codes.
  «سند ۱۲» is document number 12, and «کد مشتری ۳۴» is customer code 34.
- **Words:** letters are folded as in روزنگار (ی/ي, ک/ك, آ/ا, no ZWNJ, no diacritics). Words are matched in order of
  strength: the whole word, the start of a word, three or more letters inside a word, and finally letters that sound
  alike (ت/ط، س/ص/ث، ز/ذ/ض/ظ، ه/ح، ق/غ), marked «هم‌آوا». They are matched in the customer's name, لقب, father's name,
  city, group, tags and note, and in the document's note, category, line names, bank names, cheque owners and the
  name of the person who entered it.
- **Words that name a thing also mean the thing:**
  - kinds: آبشده/طلا، سکه، امامی/بهار/تمام/نیم/ربع/گرمی، شمش/پلمپ، ارز/دلار/یورو/درهم…;
  - directions: خرید، فروش، دریافت، پرداخت;
  - methods: نقد، کارتخوان، کارت به کارت، فیش، چک، ساتنا، پایا، تسویه طلایی;
  - document types: حواله، تبدیل، سوخت، ذوب، هزینه، درآمد، افتتاحیه، اصلاح موجودی;
  - states: باطل، اصلاحیه، چک برگشتی، وصول.

  The clue holds if the document is that thing **or** the word is in its text (a customer named «بهار» is still
  found).
- **Days and hours:** امروز، دیروز، پریروز، این هفته، هفته پیش، این ماه، ماه پیش، امسال، پارسال. Also:
  - a Jalali month («مهر»، «مهر ۱۴۰۴»);
  - a day of a month («۱۲ مهر»);
  - a full date («۱۴۰۵/۷/۱۲»);
  - a weekday («سه‌شنبه»);
  - an hour («ساعت ۱۰»، «ساعت ۵ عصر»);
  - a part of the day: صبح ۵–۱۱، ظهر ۱۲–۱۳، بعدازظهر ۱۲–۱۷، عصر ۱۴–۱۷، شب ۱۸–۲۳.

  A month without a year is the latest such month that has begun.
- **Words that only say how something was said** (به، که، زدیم، یادمه، فکر کنم…) narrow nothing, as in روزنگار.

### Matching and order
- **A clue holds** for a document if any of these holds it: the document's own fields, its customer (or a حواله's two
  customers), the person who entered it, its figures, its kinds and states, its day or its hour.
- **Order:**
  - Documents that hold **every** clue come first.
  - If none holds them all, «نزدیک‌ترین‌ها» lists the documents that hold the most clues. Each one names the clue it
    misses, because a memory can be wrong in one detail.
  - Within each group, results are ordered by the strength of their matches, then by the nearest figure, then by the
    newest.

  Match strengths:

  | Strength | Matches |
  |---|---|
  | 100 | an exact figure, an exact code |
  | 95 | a whole number field |
  | 90 | a whole word |
  | 80 | inside a band or range |
  | 75 | the start of a word, or the start or end of a code |
  | 70 | a kind or state; a day |
  | 60 | an hour or weekday; the start or end of a figure |
  | 55 | digits inside a code |
  | 50 | letters inside a word |
  | 45 | هم‌آوا |
  | 40 | digits inside a figure |
- **People:** customers that hold the name, phone or code clues are listed above the documents, each with the clues
  it matched. Opening one opens its page.
- **Reach and determinism:**
  - Voided documents and replaced originals are found and marked, as in spec 0023.
  - A seller without back-dating sees only today, as in روزنگار. As in رهگیری, a whole tracking code still opens its
    document.
  - The same query always gives the same list in the same order.

## Acceptance
- **`tests/clue.test.mjs` (reading and matching on built documents):**
  - every reading above;
  - «۴۹ میلیون و خرده‌ای تومان» covers 49,780,000 toman and not 50,100,000;
  - «آخرش ۷۸۰» finds 49,780,000 toman in a rial shop and in a toman shop;
  - «طهرانی» finds «تهرانی» as هم‌آوا;
  - «بهار» finds both a bahar coin trade and a customer named بهار;
  - a wrong day plus a right name and a right amount lands in «نزدیک‌ترین‌ها», naming the day as the missed clue;
  - the order is stable.
- **API (`tests/clue.test.mjs` on a seeded shop):** each of these finds its document:
  - a name fragment;
  - the last four digits of a mobile (the customer too);
  - part of a cheque number;
  - part of a bar serial (both the bar's buy and its sell);
  - part of a tracking code;
  - an amount's tail;
  - «دیروز سکه امامی»;
  - «فروش به رضا کارت به کارت».

  The seller's reach is today only. 3,000 documents answer in under 150 ms after the first query.
- **e2e:**
  - `/books/find` shows the clues it understood and finds a document from a name fragment and an amount tail;
  - Ctrl+K lists documents and people from the same engine;
  - the top-bar search button opens it on a phone;
  - the hundred rounds (spec 0029) search every round's document by a small clue: part of the customer's name, the
    amount's tail, part of the tracking code.

## Constraints
- Read-only. No AI call and no estimate: every rule is written above, and the page shows it.
- One engine (`clue.mjs`), used by the server and the tests. It reads amounts with روزنگار's own reader
  (`daysearch.mjs` `amountAt`), so a figure is read the same way everywhere.
- The index is built once per ledger revision (spec 0004), on the figure index of spec 0023.
