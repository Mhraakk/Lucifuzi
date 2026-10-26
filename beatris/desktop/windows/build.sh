#!/usr/bin/env bash
# Builds the Windows 11 and Windows 10 x64 installers: public/downloads/Beatris-Setup-Win11-x64.exe and
# Beatris-Setup-Win10-x64.exe (Beatris-Setup-x64.exe stays as a copy of the Windows 11 one, for links already out there)
#   [FFMPEG=/path/to/ffmpeg] bash desktop/windows/build.sh [https://your-server]
set -euo pipefail
cd "$(dirname "$0")"
URL="${1:-https://beatris-6u77.onrender.com}"
FF="${FFMPEG:-ffmpeg}"
VER="$(node -p "require('../../package.json').version")"
tmp="$(mktemp -d)"
# the icon is regenerated from icon-512.png when ffmpeg is present; otherwise the committed beatris.ico is used as is
if command -v "$FF" >/dev/null 2>&1; then
  for s in 256 64 48 32 24 16; do "$FF" -loglevel error -y -i ../../public/icon-512.png -vf "scale=$s:$s:flags=lanczos" "$tmp/i$s.png"; done
  node make-ico.mjs beatris.ico "$tmp"/i256.png "$tmp"/i64.png "$tmp"/i48.png "$tmp"/i32.png "$tmp"/i24.png "$tmp"/i16.png
else
  echo "ffmpeg not found: keeping the existing beatris.ico" >&2
fi
mkdir -p ../../public/downloads
for T in Win11 Win10; do
  makensis -V2 -WX -DURL="$URL" -DVERSION="$VER" -DTARGET="${T,,}" -DOUTFILE="$(pwd)/../../public/downloads/Beatris-Setup-$T-x64.exe" installer.nsi
done
cp ../../public/downloads/Beatris-Setup-Win11-x64.exe ../../public/downloads/Beatris-Setup-x64.exe
rm -rf "$tmp"
cp pos-bridge.ps1 ../../public/downloads/beatris-pos-bridge.ps1
ls -la ../../public/downloads/
