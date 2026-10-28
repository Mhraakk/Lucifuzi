# 0055 — «طلا، به دقت بئاتریس»: a teaser made the Higgsfield way

**Status:** in progress. The script and the prompts are done; the AI shots come back from the owner's Higgsfield account.

## What
**Asked:** «https://github.com/higgsfield-ai/skills.git این مهارت ها رو یاد بگیر و برای ساخت یه تیزر تبلیغاتی جدید
استفاده کن … اثر مهارت های جدیدی که یاد گرفتی رو در ساخت ویدیو نشونم بده که کاملا اثر پذیرفته از این مهارت ها باشند».
Also: install `Panniantong/Agent-Reach` and use it in the app if it applies.

**Answers:**
- **Account:** the owner's own Higgsfield account and credits.
- **Who runs the prompts:** the owner, in Higgsfield's app. The `higgsfield` CLI (1.2.2, checksum verified) is installed
  in the build container, but its sign-in is an OAuth page that answers on `localhost`, so it cannot finish there.
  Codes and callback addresses are never passed through the chat.

The film is a 30 s, 16:9, 1080p teaser: `public/media/promo/beatris-gold-precision.{mp4,webm,jpg}`, plus a 9:16 cut, a
16:9 thumbnail and a 9:16 cover.

## How each skill shapes the film
| Skill | What it decides here |
|---|---|
| `higgsfield-faceless-video` (channel motion) | Three 10 s blocks with arc roles hook → turn → payoff (the skill's own gate asks for exactly that at 30 s). Five shots per block, each opening with its size (WIDE, MEDIUM, CU, DETAIL), never the same size twice in a row. One through-line object, a hand-poured gold bar, in every block. Narration lines of 20–23 words, at most two sentences, numbers in words. The first clip is checked before the rest are made. The script passes the skill's `validate_motion_script.py` (`valid: true`). |
| `higgsfield-generate` | Seedance 2.5 in omni-reference mode: each AI block is one generation that holds all its cuts, with the bar's still as image 1 and the location still as image 2. Prompts follow its rules: subject, setting and style first, then camera and light; motion verbs instead of a still description; requirements stated positively; under about 200 tokens; no real people or marks. |
| `higgsfield-brandkit` | A «brand lock» block with the app's own colours (`--gold` #E3B862, `--gold-hi` #F7E6B0, `--gold-deep` #6B4A14, `--void` #080705), repeated word for word in every image prompt. The logo is never generated; the crown is drawn by our code. |
| `higgsfield-youtube-thumbnail` | An information-gap concept: the bar on a jewellery scale whose display is blank. Nano Banana Pro at 4K, the skill's prompt contract in its order. The Persian headline is laid over by our own renderer, the skill's deterministic overlay path, because image models break Persian script. |
| Virality Predictor (`brain_activity`) | Scores cut v1: overall score, peak second and weakest stretch. The weakest stretch is recut once and v2 is scored. Both numbers are reported. |

`higgsfield-product-photoshoot` is not used. Its modes start from a photo of a real product, and this film has none.
Its hero art direction (one product, macro lens, raking key light, empty side for type) shapes the bar's still.

## Storyboard
| Time | Role | On screen (Persian line) | Shots |
|---|---|---|---|
| 0–10 s | hook | «در بازار طلا، هر قطعه را با ترازو و عیار می‌سنجند. یک سوت اشتباه در حساب، از جیب مغازه می‌رود.» | AI: WIDE the pour · DETAIL the melt cools · MEDIUM the bar slides onto velvet · CU light across its ripples · MEDIUM onto a scale, the camera pushes into the dark display |
| 10–20 s | turn | «بئاتریس معادل هفتصد و پنجاه را تا سه رقم حساب می‌کند. طلا و پول، هر کدام در ستون خودش ثبت می‌شود.» | App: CU weight 10 and fineness 740 typed · DETAIL ۹٫۸۶۷ g of 750 · MEDIUM the bar's cut-out tied to its number · CU مظنه ÷ ۴٫۳۳۱۸, rounded to the thousand · WIDE the gold and cash columns take the row |
| 20–30 s | payoff | «روز که بسته شود، هر سوت طلا و هر تومان، سند و ردپای خودش را دارد. بئاتریس؛ طلا، به دقت سوت.» | AI: MEDIUM the closed shop at dusk · App: CU the trace page («رهگیری») answers the bar's tracking code with its document's whole life · AI: DETAIL the bar under one light, fading to black · WIDE the crown draws · CU tagline, the two ways to get the app, the address |

- The cut from the scale's dark glass into the app is a match through darkness: the AI shot ends on black glass with
  one gold reflection, and the app shot starts from the same black.
- The lines are shown on screen, not spoken. No Persian voice in Higgsfield's catalogue has been heard yet, so none is
  used. The script keeps the skill's speech rules anyway, so a voice can be added later without rewriting.

## Generations (the owner's shot sheet)
The sheet is a private artifact page with each prompt, its model and settings, what to attach, and a place for the
result's link, file, credits and notes. The page saves to its own store, which the build reads back.

1. **The bar** (through-line): image, GPT Image 2.5 or Nano Banana Pro, 16:9.
2. **The workshop look:** image, same model.
3. **Block 1:** Seedance 2.5, omni reference (images 1 and 2), 10 s, 1080p, sound off. Checked before step 4.
4. **The shop look:** image, with the bar as reference.
5. **Block 3's two AI shots:** Seedance 2.5, omni reference (the bar and the shop), 6 s.
6. **Thumbnail 16:9** and 7. **cover 9:16:** Nano Banana Pro, 4K.
8. **Virality Predictor** on cut v1, then on v2.
9. *Optional:* a music bed (Sonilo Music or Seed Audio), and Reframe to 9:16 for the vertical cut.

## Truth
- Every Persian word and every number is drawn by our renderer, never by the image or video model.
- The app shots are the real app, captured from a fresh demo shop. The numbers come from the app's own rules: 10 g at
  740 is ۹٫۸۶۷ g of 750 (rounded to 3 digits first), the 18k gram is مظنه ÷ ۴٫۳۳۱۸۰۲, and the amount is rounded to the
  thousand toman. Prices are sample prices, and the end card says so.
- The end card's fine print says the gold footage was made with AI (Higgsfield) and names the music and type licences.
- No testimonial, rating, count or saving is claimed.

## Sound
- Music: the owner's Higgsfield track if made; otherwise a CC0 recording, credited on the end card and kept out of the
  repository.
- Sound effects: the Pixabay-licensed library used before, each on a real picture event (`stories/mix.mjs`).
- −16 LUFS, true peak under −1 dBTP.

## Agent-Reach
- Installed as a research tool (`uv tool install` of the v1.6.0 release zip, read first; `agent-reach setup` added web,
  GitHub, YouTube, Bilibili and V2EX).
- YouTube search worked and found Seedance product-ad tutorials and jewellery commercials. Their subtitles were refused
  from the build container's address («Sign in to confirm you're not a bot»). The tool's own rule is to stop there, so
  nothing from those videos is cited.
- **Not in the app.** It is a Python tool, the app has no runtime dependencies and Render runs Node only. Reading
  social networks behind a sign-in from a shop's server also carries legal and security risk.

## Acceptance
- `ffprobe`: 30.0 s, 1920×1080. The master's frame rate suits the AI clips' own rate: no uneven cadence and no
  interpolation artefacts.
- −16 LUFS ± 0.5, true peak ≤ −1 dBTP; no frozen stretch of 0.5 s or more and no black frames except the deliberate
  match.
- Every on-screen line passes the read-time rule of `stories/kit.mjs` (characters ÷ 15 + 1.5 s).
- Virality v1 and v2 recorded, with what changed between them.
- e2e: `/help` shows the new teaser, and its media answer 200.
- The tutorial videos are not touched.

## Constraints
- Raw AI clips stay out of the repository; only the finished film, poster and covers go in.
- The build ledger in `scripts/promo-film/README.md`: model, prompt, settings, job or result link, the window used.
- No keys, tokens or account data anywhere in the repository.

## Out of scope
- A spoken Persian voice-over.
- Running Higgsfield from the server or the app.
