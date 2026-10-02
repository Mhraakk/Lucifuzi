# 0020 — Market language at the desk: «بیست خط زیر مظنه ۱۰۹ میلیون»

## What
A gold dealer agrees a price in the market's own words, and the operator writes it down exactly as said. The desk's one-line box (spec 0013) now understands it, spells out the price it understood, and on «ثبت کن» issues the document.

- **«خط»:** one خط is 10,000 toman, which is 100,000 rial (`KHAT_RIAL`). Twenty lines are 200,000 toman.
  - Below: «۲۰ خط پایین / زیر / کمتر (از) مظنه», «مظنه … منهای ۲۰ خط», «مظنه … ۲۰ خط پایین».
  - Above: «۵ خط بالای / روی / بالاتر از مظنه», «بعلاوه ۵ خط».
  - A money distance needs both its unit and its direction: «۲۰۰ هزار تومان زیر مظنه», «منهای ۲ میلیون ریال».
  - A «خط» with neither up nor down is a question to the operator. It is never guessed.
- **The مظنه number:**
  - «۱۰۹ میلیون», «۱۰۸ میلیون و ۸۰۰», «۱۰۸/۸۰۰» and «مظنه ۱۰۹» (millions of toman, as the market says it), in digits or in words.
  - A base given without a unit is read in the unit that puts it nearest the market board. With no board available, the shop's unit is used.
  - With no number at all («۲۰ خط زیر مظنه»), the market board's مظنه is used and marked as such.
  - A مظنه far from the board (×1.5 or ÷1.5) is flagged.
- **The rest of the sentence:**
  - Customer, side (خرید/خریدیم/خریدم/فروش/فروختیم…), weight, fineness (also «۷۵۰ی» or «هفتصد و پنجاهی») and payment are understood in any order.
  - Filler words such as «امروز» or «آقای» are dropped.
  - Before anything is applied, the preview shows each understood part and the price worked out. For example:
    - «مظنه ۱٬۰۹۰٬۰۰۰٬۰۰۰ − ۲۰ خط (۲٬۰۰۰٬۰۰۰) = ۱٬۰۸۸٬۰۰۰٬۰۰۰ ریال»
    - the reading choices it made, and what is still missing.
- **«ثبت کن» / «صادر کن»:** a whole sentence (customer, line and payment, or نسیه) is booked at once. If anything is missing, nothing is booked and the missing part is named.
- **Free sentences (the smartening layer):**
  - When words are left over, «از دستیار بپرس» asks the shop's language engine (the agent platform's `structured()`) to rewrite the sentence in the desk's own words.
  - The rewrite is parsed again by the same rules.
  - It is refused if it carries a number the operator never said. Money may differ only by an unsaid scale (thousands or millions).
  - The operator still sees the result and presses Enter.
- **Two real parser bugs found by the generated tests:**
  - A weight after a price was being added into the price («۱۰۹ میلیون ۱۵۹٫۳۳ گرم»).
  - Number words were joined out of order («هفتصد و پنجاه بیست», «نهصد و شانزده دو»).

## Acceptance (`tests/market-language.test.mjs`, e2e «market language»)
- «۲۰ خط پایین مظنه بازار ۱۰۹ میلیون» gives a مظنه of 1,088,000,000 rial, and 14 other ways of saying the same thing give the same price.
- Above the مظنه, the board's مظنه, and the shop's unit when no board is available, all resolve correctly. «۲۰ خط» with no direction is an error.
- The whole sentence fills every field. The line is priced by the unchanged accounting engine from that مظنه.
- **Generated sentences:** 4 seeds × 5,000 sentences (every order, digits or words, every مظنه style).
  - Each gives the exact مظنه, weight, fineness, side and customer.
  - No word is left unknown.
- **Language engine:**
  - The rules answer without calling the model.
  - The model's rewrite is accepted when its numbers are the operator's, and refused when it invents one.
- **In the browser:**
  - The preview spells out the price.
  - «ثبت کن» books the document, and the document's مظنه is 1,088,000,000.
  - An incomplete «ثبت کن» books nothing.
- `npm run gate` passes.

## Constraints
- The accounting engine (`trade.mjs`, `books.mjs`) is unchanged. The sentence only fills the desk's fields. The مظنه is stored in rial, as when it is typed.
- The model is never the source of a number. Nothing is booked without the operator's Enter.
