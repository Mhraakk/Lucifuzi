# 0027 — روزنگار by section, search and tracking inside it, and sorting everywhere

**Status:** implemented.

## What
### 1. Sections (بخش)
روزنگار can show one section of the shop at a time:
- **همه** (everything);
- **آبشده** (melted gold, including ذوب);
- **سکه**;
- **شمش**;
- **ارز**;
- **وجه** (money only).

A document belongs to every section it touches:
- by its lines;
- by its حواله or تبدیل unit (G750 → آبشده, COIN → سکه, BAR → شمش, FX → ارز, IRR → وجه);
- by its payments (money → وجه; gold or coins as payment → آبشده or سکه).

Inside a section, everything follows it:
- the list of the day;
- the tiles: only that section's totals, with the realized result of that unit when it is one unit;
- the type filters (خرید، فروش، جنسی، …), which combine with the section;
- the word search;
- the number search over all days (spec 0023): only figures of that section count. «۱۲۰ گرم» inside آبشده finds melted
  gold lines, not coin weights; a money figure inside سکه finds coin line values and their payments;
- tracking: each row's code opens رهگیری. رهگیری also takes `?sec=` and lists, for a customer or a word, only that
  section's documents;
- the CSV export, which exports what is shown;
- the URL (`?sec=melt&f=buy&sort=…`), so a view can be bookmarked, and the palette («روزنگار آبشده»).

### 2. Sorting
Every stock and day table sorts by any column.
- **Columns:**
  - **روزنگار** (a timeline, so a «ترتیب» selector): time (first or last of the day), amount, 750-equivalent weight,
    coin count, customer, document number. Inside a section, amount and weight count only that section's lines.
  - **گاوصندوق:**
    - the net-position table by item, held, customers' share or net;
    - cash and bank by name or balance;
    - bars by serial, maker, weight, fineness, seal date or entry date.
  - **دفتر شمش‌ها** (cards, so a «ترتیب» selector): serial, weight, fineness, maker, status, last move, seal date.
  - **انبار و ویترین, اسناد, چک‌ها, تطبیق بانک:** every column with a value.
  - **مشتریان:** every column; «مانده» sorts by the whole balance at today's prices (money + gold + coins + currency,
    + = owes us), which the list now carries as `worth`.
  - **گزارش‌ها:** the P&L positions and days, VAT by month, sales analysis by group.
  - A totals row stays at the bottom whatever the order. **محصولات** keep the desk's own order (set by hand there).
- **Order:** a click on a column sorts it ascending; a second click sorts it descending; a third click returns to the
  natural order.
  - Numbers sort by value, never by their Persian text.
  - Names sort by Persian collation (ی and ي, ک and ك are the same letter).
  - Dates sort by day.
  - Empty cells go last.
  - Equal keys keep their natural order (stable).
- **Shown:** the header carries `aria-sort` and an arrow.
- **Keyboard:** a column header is a button, reachable with Tab and sorted with Enter or Space.
- **Kept:** the choice is kept per table for the viewer (local only), and روزنگار also keeps it in the URL.
- **One helper:** `public/js/sorting.mjs` holds the sort (pure, tested) and the wiring for any `table[data-sort]`.

## Acceptance
- **`tests/sorting.test.mjs`:**
  - numbers in Persian digits with separators and signs;
  - money and grams;
  - Persian names with Arabic letters;
  - Jalali dates;
  - empty cells last;
  - stability;
  - the three-click cycle.
- **`tests/daysearch.test.mjs`:** sections of each document kind; the number search inside a section; the section of
  each figure.
- **e2e:**
  - روزنگار «آبشده» shows only melted gold;
  - a number search inside آبشده finds a melted-gold line and not a coin line with the same number;
  - the tracking link opens رهگیری;
  - sorting by amount orders the rows by value, both ways;
  - the vault and bar tables sort;
  - the URL keeps the section.

## Constraints
- **The data is unchanged:** sections and sorting are views only, and the day's totals are the same numbers, filtered.
- **Speed:** everything happens in the page, with no new request, except the all-days number search.
- **The look is unchanged:** chips and table headers stay as they are, in both skins, with no letter-spacing on Persian.
