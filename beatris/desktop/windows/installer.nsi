; Beatris (بئاتریس) — Windows 11 x64 desktop installer.
; The app opens in its own window (Microsoft Edge app mode, built into Windows 11) against the live server, with its
; own profile, so logins and settings stay separate from the user's browser. Per-user install: no administrator
; rights needed. Build: desktop/windows/build.sh (makensis 3, amd64-unicode stubs).
Unicode true
Target amd64-unicode
SetCompressor /SOLID lzma
ManifestDPIAware true
RequestExecutionLevel user

!ifndef URL
  !define URL "https://beatris-production-68ac.up.railway.app"
!endif
!ifndef VERSION
  !define VERSION "2.0.0"
!endif
!define NAME "Beatris"
!define NAME_FA "بئاتریس"
!define REGKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\Beatris"

Name "${NAME_FA} — ${NAME}"
OutFile "${OUTFILE}"
InstallDir "$LOCALAPPDATA\Programs\Beatris"
InstallDirRegKey HKCU "Software\Beatris" "InstallDir"
BrandingText "${NAME} ${VERSION}"
VIProductVersion "${VERSION}.0"
VIAddVersionKey "ProductName" "${NAME}"
VIAddVersionKey "FileDescription" "Beatris — gold, coin and bullion accounting (desktop)"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "ProductVersion" "${VERSION}"
VIAddVersionKey "LegalCopyright" "Beatris"

!include "MUI2.nsh"
!include "x64.nsh"
!define MUI_ICON "beatris.ico"
!define MUI_UNICON "beatris.ico"
!define MUI_ABORTWARNING
!define MUI_FINISHPAGE_RUN
!define MUI_FINISHPAGE_RUN_FUNCTION LaunchApp
!define MUI_FINISHPAGE_RUN_TEXT "اجرای بئاتریس"
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "Farsi"
!insertmacro MUI_LANGUAGE "English"

Var Browser

; Edge (always present on Windows 11), else Chrome; the path is resolved at install time from App Paths
Function FindBrowser
  SetRegView 64
  ReadRegStr $Browser HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe" ""
  StrCmp $Browser "" 0 done
  ReadRegStr $Browser HKCU "SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe" ""
  StrCmp $Browser "" 0 done
  StrCpy $Browser "$PROGRAMFILES32\Microsoft\Edge\Application\msedge.exe"
  IfFileExists $Browser done 0
  ReadRegStr $Browser HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe" ""
  StrCmp $Browser "" 0 done
  ReadRegStr $Browser HKCU "SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe" ""
  done:
FunctionEnd

Function .onInit
  ${IfNot} ${RunningX64}
    MessageBox MB_ICONSTOP "این نسخه برای ویندوز ۶۴ بیتی است."
    Abort
  ${EndIf}
FunctionEnd

Section "Beatris" SecMain
  SetOutPath "$INSTDIR"
  File "beatris.ico"
  File "Beatris.cmd"
  ; card-reader bridge (spec 0005): local HTTP on 127.0.0.1 for the app's origin only; starts with Windows
  File "pos-bridge.ps1"
  Call FindBrowser
  ; the launcher and the card-reader bridge read their settings from here (the server address can change without reinstalling)
  FileOpen $0 "$INSTDIR\beatris.ini" w
  FileWrite $0 "browser=$Browser$\r$\nurl=${URL}$\r$\n"
  FileClose $0
  StrCmp $Browser "" 0 +2
    MessageBox MB_ICONEXCLAMATION "مرورگر Edge یا Chrome پیدا نشد؛ بئاتریس در مرورگر پیش‌فرض باز می‌شود."
  CreateDirectory "$LOCALAPPDATA\Beatris\profile"
  ; shortcuts start the browser directly in app mode (no console window, own taskbar icon)
  StrCmp $Browser "" 0 +4
    CreateShortcut "$SMPROGRAMS\${NAME_FA}.lnk" "${URL}" "" "$INSTDIR\beatris.ico" 0
    CreateShortcut "$DESKTOP\${NAME_FA}.lnk" "${URL}" "" "$INSTDIR\beatris.ico" 0
    Goto reg
  CreateShortcut "$SMPROGRAMS\${NAME_FA}.lnk" "$Browser" '--app=${URL}/ --user-data-dir="$LOCALAPPDATA\Beatris\profile" --no-first-run --no-default-browser-check --window-size=1440,900 --lang=fa' "$INSTDIR\beatris.ico" 0 SW_SHOWMAXIMIZED "" "${NAME_FA} — حسابداری طلا، سکه و شمش"
  CreateShortcut "$DESKTOP\${NAME_FA}.lnk" "$Browser" '--app=${URL}/ --user-data-dir="$LOCALAPPDATA\Beatris\profile" --no-first-run --no-default-browser-check --window-size=1440,900 --lang=fa' "$INSTDIR\beatris.ico" 0 SW_SHOWMAXIMIZED "" "${NAME_FA} — حسابداری طلا، سکه و شمش"
  reg:
  CreateShortcut "$SMSTARTUP\Beatris POS.lnk" "$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "$INSTDIR\pos-bridge.ps1"' "$INSTDIR\beatris.ico" 0 SW_SHOWMINIMIZED "" "پل کارتخوان بئاتریس"
  ExecShell "open" "$SMSTARTUP\Beatris POS.lnk" "" SW_HIDE
  WriteRegStr HKCU "Software\Beatris" "InstallDir" "$INSTDIR"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  WriteRegStr HKCU "${REGKEY}" "DisplayName" "${NAME_FA} (${NAME})"
  WriteRegStr HKCU "${REGKEY}" "DisplayIcon" "$INSTDIR\beatris.ico"
  WriteRegStr HKCU "${REGKEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${REGKEY}" "Publisher" "Beatris"
  WriteRegStr HKCU "${REGKEY}" "URLInfoAbout" "${URL}"
  WriteRegStr HKCU "${REGKEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${REGKEY}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegDWORD HKCU "${REGKEY}" "NoModify" 1
  WriteRegDWORD HKCU "${REGKEY}" "NoRepair" 1
  WriteRegDWORD HKCU "${REGKEY}" "EstimatedSize" 200
SectionEnd

Function LaunchApp
  ExecShell "open" "$SMPROGRAMS\${NAME_FA}.lnk"
FunctionEnd

Section "Uninstall"
  Delete "$SMPROGRAMS\${NAME_FA}.lnk"
  Delete "$DESKTOP\${NAME_FA}.lnk"
  Delete "$INSTDIR\beatris.ico"
  Delete "$INSTDIR\Beatris.cmd"
  Delete "$INSTDIR\pos-bridge.ps1"
  Delete "$SMSTARTUP\Beatris POS.lnk"
  Delete "$INSTDIR\beatris.ini"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir "$INSTDIR"
  ; the app profile holds only the login on this PC; the books themselves live on the server
  RMDir /r "$LOCALAPPDATA\Beatris\profile"
  RMDir "$LOCALAPPDATA\Beatris"
  DeleteRegKey HKCU "${REGKEY}"
  DeleteRegKey HKCU "Software\Beatris"
SectionEnd
