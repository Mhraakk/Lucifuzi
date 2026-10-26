# 0050 — Desktop installers for Windows 11 and Windows 10 (64-bit)

**Status:** done.

## What
The owner asked for the desktop app's installer for Windows 11 64-bit, and one for Windows 10 64-bit
(«فایل نصبی نسخه دسکتاپ اپ رو هم برای ویندوز ۱۱ ۶۴ بیت می خوام / برای ویندوز ۱۰ نسخه ۶۴ بیت هم می خوام»).

Until now there was one installer, `Beatris-Setup-x64.exe`, built for Windows 11. It is now built twice from the same
NSIS script, `desktop/windows/installer.nsi`, with `TARGET=win11` or `TARGET=win10`:

| File | For | What differs |
|---|---|---|
| `public/downloads/Beatris-Setup-Win11-x64.exe` | Windows 11, 64-bit | On Windows 10 it says it is the Windows 11 build, names the Windows 10 file, and asks whether to go on (silent install: it goes on). |
| `public/downloads/Beatris-Setup-Win10-x64.exe` | Windows 10, 64-bit | If neither the new Edge nor Chrome is found (an old Windows 10 may have only the old Edge, which has no app window), it offers Edge's free download page. Until then the app opens in the default browser. |
| `public/downloads/Beatris-Setup-x64.exe` | links already sent out | A copy of the Windows 11 build. |

Both:
- stop on 32-bit Windows, and on Windows 7 and 8, with a message: the browsers the app window needs no longer run there;
- carry the target in the window title («ویندوز ۱۱ ۶۴ بیت» / «ویندوز ۱۰ ۶۴ بیت») and in the file description;
- install per user, without administrator rights, as before: the app window, the shortcuts, the card-reader bridge,
  and removal from «Apps & features»;
- give every message box a silent-mode default, so `/S` never waits on a dialog.

### Where they are offered
- **Login page:** «نسخه ویندوز» fetches the Windows 11 build. When the browser reports its Windows through user-agent
  client hints (Chromium: `platformVersion` 13 or more is Windows 11, 1 to 10 is Windows 10), the link changes to the
  matching build and says «نسخه ویندوز ۱۱» or «نسخه ویندوز ۱۰». A browser without client hints keeps the default.
- **Install guide** (on Windows): both links.
- **Help centre header:** both links.
- **Card-reader settings:** both installers, each with the bridge.

## Acceptance
- `build.sh` builds both with `makensis -WX` (a warning fails the build), and copies the Windows 11 build to the old
  name.
- Both are PE32+ x86-64 executables.
- **Under Wine** (`winecfg /v win11 | win10 | win7`, silent install):
  - the Windows 11 build installs on Windows 11, and goes on on Windows 10;
  - the Windows 10 build on Windows 10 with Edge writes Edge's path to `beatris.ini`; without a browser it writes an
    empty `browser=`, and the app opens in the default browser;
  - on Windows 7 both stop with exit code 2 and install nothing;
  - each uninstalls cleanly.
- **e2e, «web app» step:**
  - the three files answer as `application/vnd.microsoft.portable-executable`;
  - the login link is the Windows 11 build by default and when the browser reports 15.0.0;
  - it is the Windows 10 build when the browser reports 10.0.0.
- `npm run gate` passes.

## Constraints
- One script for both. The app and the server are not changed beyond the links.
- No runtime dependency.
- No code signing. Windows shows «Windows protected your PC» the first time, as before; removing it needs a Code
  Signing certificate.

## Out of scope
- A 32-bit build: Edge and Chrome dropped 32-bit Windows 7/8, and the app window needs one of them.
- An offline app: the installer opens the live server, as before.

## Verification
- `bash desktop/windows/build.sh` (with `FFMPEG=/nonexistent`, so the committed icon is kept).
- The Wine runs above.
- `E2E_ONLY='web app' npm run e2e`.
- After deploy, `HEAD` on the two new addresses on the live server.

## Results
- **Files:**

  | File | Size | SHA-256 |
  |---|---|---|
  | `Beatris-Setup-Win11-x64.exe` | 272,887 B | `daeeedf0…96d2f` |
  | `Beatris-Setup-Win10-x64.exe` | 272,913 B | `30b7ee60…26836` |

  The old name is byte-for-byte the Windows 11 build.
- **Wine:** every case in the acceptance list behaved as written. The runs were silent installs, so the dialogs took
  their silent defaults. No one clicked through them on a real Windows 10 or 11 PC.
- **e2e:**
  - the «web app» step passes, 12 / 12;
  - with the «product page» and «visual quality» steps, 54 / 54.
- **Gate:** passes.
- **Review:** no independent critic reviewed this work.
