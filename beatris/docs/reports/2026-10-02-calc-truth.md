# Are the numbers real? — calculation audit, 2026-10-02

Every number shown should come from the shop's own entries, the market feed or an engine applied to them. Nothing should be made up. This audit covers the calculation code (`public/js`, `server`) and the paths the pages use.

| Area | What was checked | Result |
|---|---|---|
| Elliott + Fibonacci (`elliott.mjs`, `ta.mjs`) | Where the bars come from; which prices are used | The bars are the selected symbol's own daily OHLC from `/api/market/series` (about 3 years daily, 6 weekly, 11 monthly), resampled from those same days. Turning points use each candle's **high and low** (`zigzag`), not only the close. Fibonacci runs from the start of the counted move to its extreme. Scenario probabilities use the count's rules, the slope, RSI and MACD of the same series. Without a valid count, no scenario is drawn and the page says so. |
| Market data (`server/market.mjs`) | Mixing of sample and real data | A series is either fully real (stored bars from the shop's feed) or fully sample. Sample data is labelled on every page: «داده نمونه آموزشی». The two are never mixed. |
| Randomness | `Math.random` in calculation code | Used only for IDs, practice-question seeds and a maintenance tick. No shown figure uses it. |
| Constants | One source per constant | **Fixed:** the desk's sentence parser used mesghal = 4.608 g, while the books use 4.6083 g, so «۲ مثقال» was 9.216 g instead of 9.217 g. It now imports the books' constant. The market page's fair-price line used a typed-in formula; it now uses `MAZANEH_TO_G750` / `MAZANEH_TO_G1000`. |
| مظنه from a sentence (spec 0020) | Price from «خط» | 1 خط = 10,000 toman, checked by 20,000 generated sentences. The line value is computed by the unchanged accounting engine. |
| Parser | Numbers next to each other; «نیم» | **Fixed:** a weight after a price was added into the price; number words were joined out of order; «نیم مثقال» was read as a «نیم» coin. All three were found by the new tests. |
| Books and dashboard | Figures against the ledger | Already covered by the existing property tests (spec 0004): thousands of random documents, ledger balance, replay equal to ledger, and explanation equal to the dashboard. They still pass. |

What this audit does not cover: the accuracy of the external feed itself (tgju.org, or the channel the shop connects). The app shows the source and the time of the last update next to each price.
