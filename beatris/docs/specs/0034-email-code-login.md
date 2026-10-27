# 0034 — Sign in with a code sent to your email (Supabase)

**Status:** implemented.

## What
The sign-in page asks for an email, and only an email: «Supabase is enough» — the page offers no SMS. A six-digit code
goes to that inbox; the person types it and is in. The same email also carries a link: opening it signs in too. There is
no password and no shop code. The SMS routes of spec 0022 stay on the server (and the day-close signing code keeps using
SMS), but the sign-in page no longer offers them.

### Who sends the code: Supabase Auth, called by the server only
- **The calls:** `server/supabase.mjs` makes two calls to Supabase Auth's REST API, with the project's publishable
  key in the `apikey` header:
  - `POST {url}/auth/v1/otp` with `{ email, create_user: true }`: Supabase emails the code.
  - `POST {url}/auth/v1/verify` with `{ type: 'email', email, token }`: Supabase says whether the code is right.
- **The browser never talks to Supabase.** The shop's devices reach only Beatris, which matters where foreign hosts
  are slow or filtered.
- **No SDK** and no runtime dependency.
- **Configuration:** `BEATRIS_SUPABASE_URL` and `BEATRIS_SUPABASE_KEY` (the publishable key), in the host's variables (Render; Railway before it). Nothing is
  in the repository.

### Accounts
- **An account** is a name, a mobile number (still the key inside a shop) and an optional email.
  - Emails are stored lower-case.
  - Within one shop, an email belongs to one account.
- **Who sets an email:**
  - the vendor: a shop's owner at creation, and any account in the vendor console;
  - a shop's managers, in «تیم»;
  - for the main shop's owner, `BEATRIS_OWNER_EMAIL`.
- **Finding the shop:** the email finds its shop as the mobile does.
  - One shop: a session.
  - Several shops: the person picks one.
  - None, with sign-up open: the person opens their own shop. Sign-up by email also asks for the mobile, because the
    mobile is the account's key.

### The link in the same email
- Supabase's email can carry the code and a link. Opening the link sends the person back to `/login` with a Supabase
  session in the address's `#fragment`. `app.mjs` takes the session from the address before any route can drop it, and
  the address bar no longer shows it.
- The page hands the session to `POST /api/auth/verify { accessToken }`. The server asks Supabase who it belongs to
  (`GET /auth/v1/user`) and then accepts it only when all of these hold:
  - Supabase accepts the session;
  - its email is confirmed;
  - its email matches the claims;
  - it was made by an email code or link (`amr` is `otp`, `magiclink`, `email/signup` or `invite`), never a password;
  - it is not older than this server's own request for that email, still open (two minutes of slack between clocks).
- A link signs in once. An expired link brings the person back to the email field with a plain sentence.

### Codes and limits
- **Where the code comes from:**
  - **Demo accounts** have demo emails, and their code shows on the page.
  - **Development** (no Supabase, not production) shows the code on the page too.
  - **Production without Supabase** answers that email sign-in is not set up yet. Only the vendor's own door stays
    open: `BEATRIS_OWNER_EMAIL` with the PIN `BEATRIS_OWNER_PIN`, as spec 0022 does for the mobile.
- **Code length:** Supabase's «Email OTP Length» is 6 by default. `BEATRIS_EMAIL_CODE_LENGTH` (6–10) tells the page
  how many cells to show when it is changed.
- **Limits:**
  - **Our own, per email:** another code after 60 s, at most 5 an hour and 10 a day.
  - **Per network address:** as for SMS.
  - **Supabase's** own limits also apply.
- **A wrong code** counts tries. After 5, the code is void.
- **An email nobody may sign in with** (no account, and sign-up closed) gets the same answer as a real send, and
  nothing is sent.

## Acceptance
- **`tests/supabase.test.mjs`,** against a mock Supabase:
  - **Request shapes:** the path, the `apikey` header, and the bodies of `otp` and `verify`.
  - **Codes:** a right code signs in. A wrong one counts tries, and after 5 the code is void.
  - **Failure:** Supabase down → a 502 with a plain message.
  - **An unknown email** with sign-up closed sends nothing.
  - **Demo and development** codes come back on the page.
  - **Shops:** an email in two shops → a choice. Sign-up by email requires a mobile.
  - **Emails** are case-insensitive and unique per shop.
  - **Setting emails:** the vendor and the team page can set them.
- **The link:**
  - a session from this sign-in opens the shop once;
  - these never open it:
    - a password session;
    - a session made before this sign-in;
    - a forged token;
    - a link for an email this server never wrote to.
- **The owner's door:** production without Supabase lets `BEATRIS_OWNER_EMAIL` in with `BEATRIS_OWNER_PIN`, and no
  other email.
- **e2e:**
  - **The page:**
    - one field: the email, with no password and no mobile;
    - a malformed email is stopped on the page;
    - signing in by email reaches home.
  - **The link:** a session in the address is taken and checked, then gone from the bar; an expired link says so.
  - **Sign-up and shops:**
    - sign-up asks for the mobile;
    - an email in two shops picks one.
  - **The vendor:**
    - makes a shop with its owner's email, and that owner signs in;
    - sets another email for the account, and the account signs in with it.
- **Live:** `/api/health?deep=1` reports `email: "supabase"` when the variables are set.

## Constraints
- **Keys:** only in environment variables. Codes are never written to the production log.
- **Supabase's built-in mailer** delivers only to the project's own team. Real staff need a custom SMTP server
  (Supabase dashboard → Authentication → SMTP).
- **The code in the email:** Supabase's default templates send a link only. To send the code as well, both
  templates must contain `{{ .Token }}`:
  - «Magic Link», for accounts it already knows;
  - «Confirm signup», for an address's first email.
- **The link in the email:** it needs the project's Site URL set to this app's address. That address is
  `BEATRIS_PUBLIC_URL`, or the one the request came in on.
- **Spec 0022** (SMS) is unchanged and stays available.
- **Tutorial films:** only the sign-in film (chapter 1) is re-made.
