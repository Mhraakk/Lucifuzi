# 0057 — Production on Fly.io, with a persistent volume

**Status:** in progress. The files and the deploy job are in. The first deploy waits for the owner's Fly.io token.

## What
**Asked:** the owner was told that a Render deploy would wipe the data, because the service has no persistent disk. They answered «Fly.io تومن میگیرم اپ رو اونجا دیپلوی کن»: they buy Fly.io and want the app deployed there.

**Now:**
- The app runs on Fly.io as app `beatris` (https://beatris.fly.dev) in Frankfurt (`fra`).
- The SQLite databases, backups and uploaded photos live on a Fly volume mounted at `/data`, so no deploy loses data.
- GitHub Actions deploys after the gate and the browser e2e pass on the production branch. Render no longer needs a manual deploy.

**Not moved:** the Render service's data. It lives on Render's temporary disk and the app offers no export, so the move starts from empty databases, as any Render redeploy would have. Render stays up until the owner decides to turn it off.

## How
- **`beatris/Dockerfile`:**
  - `node:22-slim`, then `npm install --omit=dev` (the app has no runtime dependencies);
  - the commit comes in as the build argument `BEATRIS_BUILD`, so `/api/health` reports it;
  - it listens on `PORT=8080`.
- **`beatris/.dockerignore`:** keeps out of the image what the server never reads at run time: `node_modules`, local data, the tests, the build and film scripts, the Windows installer's sources and the screenshots. The built installers stay; they are served from `public/downloads`.
- **`beatris/fly.toml`:**
  - region `fra`;
  - `[env]`: `NODE_ENV=production`, `PORT=8080`, `BEATRIS_DATA_DIR=/data`, `BEATRIS_PUBLIC_URL=https://beatris.fly.dev`;
  - the volume `beatris_data` (1 GB) mounted at `/data`;
  - one machine always on (`auto_stop_machines = "off"`, `min_machines_running = 1`): the market feed polls and the nightly backup runs on a schedule;
  - an HTTP check on `/api/health`;
  - shared CPU with 512 MB.
- **`.github/workflows/beatris.yml`:**
  - It gains `workflow_dispatch`, and a `fly` job that needs `gate` and `e2e`.
  - The job runs only on the production branch, and only when the repository secret `FLY_API_TOKEN` exists. Without the secret it skips, so CI stays green.
  - **First run, repeatable:**
    - it creates the app if missing;
    - it creates the volume in `fra` if missing;
    - it sets `BEATRIS_TOKEN_SECRET` to a random 32-byte value if missing. The value is never printed.
  - **Then:**
    - `flyctl deploy --remote-only` builds on Fly's builder;
    - the job checks that `https://beatris.fly.dev/api/health` reports the commit.
- **`server/auth.mjs`:** `isProd` also counts Fly.io (`FLY_APP_NAME`) as production, as it already does Render and Railway. Sign-in codes are never shown there, even if `NODE_ENV` were missing.

## Owner, once
1. **Create a token.** fly.io → Account → Access Tokens → create an organization token for `personal`, and copy it.
2. **Add it to GitHub.** github.com/Mhraakk/Lucifuzi → Settings → Secrets and variables → Actions → New repository secret. Name it `FLY_API_TOKEN`, paste the token and save.
3. **After the first deploy:** fly.io → app `beatris` → Secrets → add:
   - `BEATRIS_SUPABASE_URL` and `BEATRIS_SUPABASE_KEY` (sign-in by email code);
   - `BEATRIS_FORGOD_KEY` (live market);
   - `BEATRIS_OWNER_PHONE`, `_NAME` and `_EMAIL` (the owner's account).

   The values are the ones in Render → Environment. Fly restarts the machine with them.

The token and the keys never appear in the chat or the repository.

## Acceptance
- `tests/hardening.test.mjs`: `isProd({ FLY_APP_NAME })` is true.
- **CI:** the gate and e2e pass. The `fly` job skips without the token and succeeds with it.
- **Live:**
  - `https://beatris.fly.dev/api/health` → `ok: true` and `build` = the commit;
  - `?deep=1` → `db: ok`, `data: { mount: "/data", persistent: true }`;
  - once the owner's secrets are set, `email: "supabase"`.
- **Data survives:** an account made before a deploy is still there after the next one.

## Constraints
- No keys or secrets in the repository. Configuration that is not secret lives in `fly.toml`; secrets live only in Fly or GitHub.
- No runtime dependencies are added; the image runs the same `npm start` as Render did.
- The Render service and the Railway volume are not deleted or moved by this change.

## Out of scope
- Moving Render's or Railway's existing data.
- A custom domain (Fly certificates can be added later).
- More than one machine: SQLite on one volume is a single writer.
