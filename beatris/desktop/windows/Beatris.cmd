@echo off
rem Beatris launcher (fallback): opens the app window with the settings written at install time.
setlocal
for /f "usebackq tokens=1,* delims==" %%a in ("%~dp0beatris.ini") do set "%%a=%%b"
if not defined url set "url=https://beatris-production-68ac.up.railway.app"
if defined browser (
  start "" "%browser%" --app=%url%/ --user-data-dir="%LOCALAPPDATA%\Beatris\profile" --no-first-run --window-size=1440,900 --lang=fa
) else (
  start "" "%url%/"
)
