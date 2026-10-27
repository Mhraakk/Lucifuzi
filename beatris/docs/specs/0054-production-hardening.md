# 0054 — Production hardening and leftovers

**Status:** done.

## What
**Asked:** «اپ رو چک کن و اگر چیزی مونده بود تکمیلش کن». A read-only pass over the code, the docs and the live service
(Render, `srv-dbd36u7avr4c7399qkf0`) found the gaps below. Each one is fixed in code and covered by
`tests/hardening.test.mjs`, unless the list says otherwise.

### Security and data
1. **Production on Render.**
   - The gap: production was detected from `NODE_ENV` or `RAILWAY_ENVIRONMENT` only. Render sets `RENDER` and
     nothing sets `NODE_ENV`, so the live server counted as development. `/api/auth/code` would hand back the
     sign-in code there, and HSTS was off.
   - The fix: `isProd(env)` in `server/auth.mjs` is the one test, used by the OTP, the token secret, HSTS, the
     vendor check and the demo switch. It is true for `NODE_ENV=production`, or for a host variable (`RENDER`,
     `RAILWAY_ENVIRONMENT`) unless `NODE_ENV` names a development or test run.
2. **No demo accounts in production.**
   - `demoFrom(env)` ignores `BEATRIS_DEMO` and `BEATRIS_DEMO_OTP` in production, with a warning.
   - A demo owner is never the vendor in production: `platform.isVendor` and `/api/me` `vendor` both check this.
     The old check read a `demo_blocked` field that nothing ever set.
3. **The vendor's PIN.** `BEATRIS_OWNER_PIN` opens only while neither SMS nor email can send a code. Once Supabase is
   set up, the fixed PIN is no longer a way in.
4. **The day-close signature without SMS.**
   - The gap: the code was SMS-only, so without an SMS panel the close answered 503.
   - The fix: the code goes to the signer's email when SMS cannot send in production, or when the account has no
     mobile. The answer shows the address half-hidden (`maskEmail`). The check follows whichever channel holds a live
     code.
5. **Edit or void after printing.**
   - The gap: `control.mjs` looked for `action='doc.event'`, which is never logged. The log names each act
     (`doc.print`, `doc.pdf`, `doc.share`), so the alert «ویرایش یا ابطال پس از چاپ» never fired.
   - The fix: it now reads those actions.
6. **Dropped harness events.** The desk sent `desk.paycard` and `desk.quote`, but `EVENT_KINDS` dropped both. They are
   now stored.
7. **Persistent disk.**
   - Deep health (`/api/health?deep=1`) reports `data: { mount, persistent }`.
   - In production the server warns at start when the data folder is on the container's own filesystem, which a
     redeploy wipes.
   - The «No users» warning names `BEATRIS_OWNER_EMAIL` and the Supabase variables.
8. **Backups.**
   - The gap: they copied only the shops open in memory, so a suspended or expired shop was missing.
   - The fix: they now copy every shop in `tenants` and the uploaded photos (`media/`).
9. **Rate limit.** `BEATRIS_RATE_LIMIT` is read (`rateLimitFrom`). It was documented but ignored.
10. **`/agents`** is for managers and owners: route option `admin: true`. The page's data was already admin-only on the
    server.
11. **Studio briefs.**
    - The gap: «رکاب» (this app's word for the shank) was read as a bezel. Any brief with a setting other than prong
      then failed the whole run with an engine error.
    - The fix: «رکاب» no longer means a bezel. A setting the engine does not build is checked by its rules, left out
      of the geometry, and named in an info finding (`SETTING_NOT_MODELLED`).

### Wording and docs
- The sign-in moved to email (spec 0034), and the host to Render. Persian messages that still sent people to
  «Railway» or to an SMS code for sign-in now say «متغیرهای سرور» and email.
- README, `docs/PRODUCTION.md`, ARCHITECTURE and CLAUDE.md describe Render with its disk. Variables that no doc listed
  are now listed.
- Specs without a Status line have one.

## Acceptance
- `tests/hardening.test.mjs`:
  - `isProd`, `demoFrom` and `rateLimitFrom` give the table above. `maskEmail` keeps one letter of each part, for
    any domain.
  - A server with `RENDER=true` and no `NODE_ENV` returns no code for a mobile or an email. In development it does.
  - A demo owner, forced on in production, gets `vendor: false` and 403 from the vendor console and ops.
  - The PIN is open without SMS or email, and closed once Supabase is configured.
  - Without SMS, the sign code goes by email: the masked address comes back, without the code. A wrong code is
    refused (403), and the right one closes the day with a valid signature.
  - A receipt printed and then voided carries «پیش از ابطال چاپ یا ارسال شده بود» and a higher probability than one
    voided unprinted. `desk.paycard` and `desk.quote` are stored; an unknown kind is not.
  - A backup holds the main shop and a suspended shop, both `integrity ok`, plus the photo under `media/`.
  - Deep health has `data`, and `storageOf` resolves mounts by path boundary.
  - «رکاب» parses as prong. A bezel brief builds the shank only, names the setting, and the run succeeds through
    `/api/studio/design`.
- `npm run gate` is green.

## Constraints
- No behaviour of the books changes. The only accounting-adjacent change is the alert's query, which is read-only.
- The tutorial videos are not touched («دیگر تغییری در ویدیوهای آموزشی نده»). They still show sign-in by SMS and the
  Railway address.
- No secret is set by code or written to the repo. The owner's variables, the disk and the health check path are
  set by the owner in Render.

## Out of scope
- **The client IP.** It is still the leftmost `X-Forwarded-For` entry, which a client can forge. The owner's dashboard
  (spec 0053) records the raw chain. `ctx.ip` changes after one forged request against the live server shows which
  hop Render appends.
- **Open sign-up by default** is a business decision. The owner's dashboard watches sign-ups.

## Verification
`npm run gate`, `node --test tests/hardening.test.mjs`, the e2e run. Live: `/api/health?deep=1` shows `data` after
deploy.
