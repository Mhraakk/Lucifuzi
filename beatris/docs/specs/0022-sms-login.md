# 0022 — Sign in with a mobile number and an SMS code

**Status:** implemented. Replaces the username/password accounts of the vendor console (task 49) and the account requests with a shop code (spec 0011).
For signing in, it was later replaced by email codes (spec 0034); the SMS code still signs the day close when an SMS panel works, and the code goes to the signer's email when it does not (spec 0054).

## What
Nobody is issued a username or a password any more. An account is a name, a mobile number and a role. Every person signs in the same way, on a phone or a desktop:

1. **Mobile number** → «دریافت کد».
   - An SMS with a 6-digit code goes out. The code is valid for 3 minutes, can be sent again after 60 seconds, and dies after 5 wrong tries.
2. **The code** → in. No shop code or shop id is ever asked:
   - The number finds its shop by itself.
   - A number that works in several shops picks the shop after the code (shop name and role).
3. **A number with no account:**
   - **Open sign-up on** (the vendor's switch, on by default): after the code, the person writes their name and their shop's name. A new shop is made with them as its owner, using the vendor's plan and trial days. The owner then adds their staff by mobile number.
   - **Sign-up off:** the answer is the same as for a known number, so nobody can probe which numbers have accounts. No SMS is sent. The page says that a number not yet added by a manager receives nothing.
4. **Exceptions** (the code never reaches a real phone):
   - **Demo accounts** (demo mode only): the code is shown on the screen and never sent, because the demo numbers are not real people's.
   - **Development and tests** (`NODE_ENV` not production, no SMS service): the code is printed in the server log and shown on the page as «کد آزمایشی».
   - **The vendor's way in before SMS is set up:** in production, while no SMS service is configured, the main shop's owner (`BEATRIS_OWNER_PHONE`) uses `BEATRIS_OWNER_PIN` in place of the code. Once SMS works, this stops.

**Accounts (no username, no password):**
- **Vendor console:**
  - A new shop needs only the shop's name, the owner's name and the owner's mobile (plus plan, end date and user cap).
  - Users are added by name, mobile and role. Any user's mobile can be corrected.
  - Old username-only users are flagged «بدون موبایل — نمی‌تواند وارد شود» until a mobile is set.
- **Team page:** every shop's owner or manager adds colleagues by name, mobile and role, and can correct a mobile.
- **User caps:** a cap of `0` means unlimited. New shops start unlimited; existing caps stay.
- **Shared numbers:** one mobile may have an account in several shops.
- **Changing a mobile** signs that account out everywhere.
- **Retired:**
  - `/join` and `/staff/access` lead back to `/login`. Their tables are left untouched.
  - The me page loses «تغییر رمز»; «خروج از همه دستگاه‌ها» stays.

**Signing the day close (bastan-e rooz):** the signer confirms with a fresh SMS code sent to their own mobile («کد امضا»), in place of their password.

**SMS services** (`server/sms.mjs`): each request is built exactly as the provider's official SDK sends it.

| Service | Request | Success |
|---|---|---|
| SMS.ir | `POST api.sms.ir/v1/send/verify/`, header `X-API-KEY`, JSON `mobile, templateId, parameters[{name,value}]` | `status = 1` |
| کاوه‌نگار | `POST api.kavenegar.com/v1/{key}/verify/lookup.json`, form `receptor, token, template` | `return.status = 200` |
| IPPanel / فراز | `POST edge.ippanel.com/v1/api/send`, header `Authorization`, JSON `sending_type: pattern, from_number, code, recipients[+98…], params` | `meta.status = true` |
| قاصدک | `POST gateway.ghasedak.me/Rest/api/v1/WebService/SendOtpSMS`, header `ApiKey`, JSON `sendDate, receptors[{mobile}], templateName, inputs[{param,value}]` | `isSuccess` |
| ملی‌پیامک | `POST rest.payamak-panel.com/api/SendSMS/BaseServiceNumber`, form `username, password, text, to, bodyId` | `RetStatus = 1` and `Value` is a recId |

**Configuration**, either way:
- **Vendor console card «پیامک ورود»:**
  - Fields: service, key, template or pattern, sender line (IPPanel), parameter name, panel username (ملی‌پیامک).
  - The key is sealed with AES-GCM like the AI keys and is never sent back.
  - «پیامک آزمایشی» sends a real code to a number.
  - The same card holds the open sign-up switch, the plan and the trial days.
- **Server variables** (Railway then, Render now): `BEATRIS_SMS_PROVIDER`, `BEATRIS_SMS_API_KEY`, `BEATRIS_SMS_TEMPLATE`, `BEATRIS_SMS_SENDER`, `BEATRIS_SMS_PARAM`, `BEATRIS_SMS_USERNAME`.
  - If these are set they win, and the console shows them read-only.
  - `BEATRIS_SMS_BASE_URL` (variables only) sends through your own relay, for example a server inside Iran, with the same paths.

**Reachability:**
- Test on 2026-10-11 from a server outside Iran: `api.sms.ir` answered. The other four hosts dropped the connection.
- The console's test button shows this for the real server.
- A request waits at most 10 seconds. A failure shows the provider's own message.

## Acceptance (`tests/sms.test.mjs`, `tests/otp.test.mjs`, e2e «sign-in by SMS»)
- **Providers (mock server):** for each of the five services:
  - The exact method, path, headers and body are sent, with the phone in the right format (`+98…` for IPPanel).
  - Success is read correctly.
  - A provider error, a timeout and an unreachable host each give a Persian message that never contains the key.
- **Login:**
  - Code → session. Persian digits are accepted.
  - A wrong code fails. The 5th wrong try voids the code, and an expired code fails.
  - The code is never stored in plain text.
  - A resend within 60 s is refused. Per-phone, per-IP and server-wide limits hold, and they survive a restart (the database, not memory).
- **No shop id:**
  - A number in another shop signs into that shop.
  - A number in two shops picks the shop with the ticket, and a ticket cannot pick a shop that number is not in.
  - A suspended or expired shop says so.
- **Sign-up:**
  - Open: an unknown number creates a shop with itself as owner and adds staff by mobile.
  - Closed: an unknown number receives the same answer, no SMS goes out, and verify fails.
  - Daily caps hold.
- **Exceptions:**
  - A demo account gets the code on screen and no SMS goes out.
  - Production without SMS: real numbers get a clear error, and the vendor's owner phone works with `BEATRIS_OWNER_PIN`, but only while SMS is unset.
  - Production never returns a code to the page for a real number.
- **Accounts:**
  - No route issues a username or a password, and `/api/auth/login` (password) is gone.
  - Shop admins add colleagues by mobile within the cap (0 = unlimited).
  - Changing a mobile signs the account out.
  - The day close needs a correct «کد امضا».
- **Browser:**
  - Phone → code (six-box field, resend timer) → home.
  - A wrong code shows an error.
  - Vendor console: SMS card, a shop made with a mobile only, and the new owner signs in with a code.
  - Team: a colleague is added by mobile and signs in.
  - Signing up a new shop works.
  - Picking between two shops works.
  - The day close is signed with a code.
- `npm run gate` passes.

## Constraints
- **Codes:**
  - Six digits from `crypto.randomInt`, stored only as HMAC-SHA256(server secret, phone:purpose:code).
  - One live code per number and purpose. The code never appears in production logs.
- **Keys:**
  - Never in the repository, never in a response, never in a log or an error text.
  - The Kavenegar key sits in the URL path, so that URL is never logged.
- **Sending limits (in the database):**
  - Per number: 1 per 60 s, 5 per hour, 10 per day.
  - Per IP: 20 per hour, 60 per day.
  - Whole server: 300 per hour (`BEATRIS_SMS_HOURLY_CAP`).
  - New shops from sign-up: 3 per IP per day, 50 per day for the server (`BEATRIS_SIGNUP_DAILY_CAP`).
- **Unchanged:**
  - The session: a 30-day signed token carrying the shop id.
  - The books, the accounting engine and the per-shop databases.
- **Data:** the tables only grow (`CREATE TABLE IF NOT EXISTS`). Nothing on `/data` is moved or deleted.

## Out of scope
- Voice calls, email and authenticator apps.
- Delivery reports.
- A relay server inside Iran. Only the setting to use one is provided.
