; StageCue for Ableton Live: Windows installer (NSIS 3).
;
; Copies the StageCue device into this person's Ableton User Library, under
; Presets\Audio Effects\Max Audio Effect\StageCue, so it shows in Live's browser.
; Installs for the current user only: no administrator rights needed.
;
; Built by build-installers.ts, which passes:
;   /DVERSION=0.1.0  /DOUTFILE=…\StageCue-Ableton-0.1.0.exe  /DDEVICE=…\device

Unicode true
ManifestDPIAware true
SetCompressor /SOLID lzma
RequestExecutionLevel user

!ifndef VERSION
  !error "Pass /DVERSION=x.y.z"
!endif
!ifndef OUTFILE
  !error "Pass /DOUTFILE=path"
!endif
!ifndef DEVICE
  !error "Pass /DDEVICE=folder with the device files"
!endif

!define PRODUCT "StageCue for Ableton Live"
!define BROWSER_PATH "Presets\Audio Effects\Max Audio Effect\StageCue"
!define UNINSTALL_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\StageCueAbleton"
!define UNINSTALLER "$LOCALAPPDATA\StageCue\Uninstall StageCue for Ableton.exe"

Name "${PRODUCT}"
OutFile "${OUTFILE}"
InstallDir "$DOCUMENTS\Ableton\User Library\${BROWSER_PATH}"
BrandingText "StageCue ${VERSION}"

VIProductVersion "${VERSION}.0"
VIAddVersionKey "ProductName" "${PRODUCT}"
VIAddVersionKey "FileDescription" "${PRODUCT} installer"
VIAddVersionKey "ProductVersion" "${VERSION}"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "LegalCopyright" "StageCue"

!include "MUI2.nsh"

!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TITLE "${PRODUCT}"
!define MUI_WELCOMEPAGE_TEXT "This adds the StageCue device to Ableton Live on this computer. The device reads the locators in your Live set and sends them to StageCue, which shows the choir what section comes next.$\r$\n$\r$\nIt goes into your Ableton User Library. Your songs, sets and other devices are not touched.$\r$\n$\r$\nYou need Live 12 Suite, or Live 12 with Max for Live."
!insertmacro MUI_PAGE_WELCOME

!define MUI_DIRECTORYPAGE_TEXT_TOP "StageCue found your Ableton User Library and will put the device here. Change it only if Live's Library settings point somewhere else."
!insertmacro MUI_PAGE_DIRECTORY

!insertmacro MUI_PAGE_INSTFILES

!define MUI_FINISHPAGE_TITLE "StageCue is ready in Ableton"
!define MUI_FINISHPAGE_TEXT "1. Open Live.$\r$\n$\r$\n2. In Live's browser, open User Library > Presets > Audio Effects > Max Audio Effect > StageCue.$\r$\n$\r$\n3. Drag StageCue onto the master track. Audio passes through untouched.$\r$\n$\r$\n4. The light on the device turns green when it finds StageCue on the network.$\r$\n$\r$\nTo have it in every new song: with the device on the master track, open Live's Settings, File && Folder, and click Save Current Set as Default."
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "English"

; Ask PowerShell where this person's User Library is, and start there.
Function .onInit
  InitPluginsDir
  File "/oname=$PLUGINSDIR\find-library.ps1" "find-library.ps1"
  nsExec::ExecToStack 'powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PLUGINSDIR\find-library.ps1"'
  Pop $0 ; exit code, or "error"
  Pop $1 ; the folder, or nothing
  StrCmp $0 "0" 0 done
  StrCmp $1 "" done
  StrCpy $INSTDIR "$1\${BROWSER_PATH}"
  done:
FunctionEnd

Section "StageCue device"
  SetOutPath "$INSTDIR"
  File "${DEVICE}\StageCue.amxd"
  File "${DEVICE}\stagecue-lom.js"
  File "${DEVICE}\stagecue-bridge.js"
  File "${DEVICE}\package.json"

  ; The uninstaller lives outside the User Library, so Live's browser never shows it.
  CreateDirectory "$LOCALAPPDATA\StageCue"
  WriteUninstaller "${UNINSTALLER}"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayName" "${PRODUCT}"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "Publisher" "StageCue"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "UninstallString" '"${UNINSTALLER}"'
  WriteRegDWORD HKCU "${UNINSTALL_KEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINSTALL_KEY}" "NoRepair" 1
SectionEnd

Section "Uninstall"
  ReadRegStr $0 HKCU "${UNINSTALL_KEY}" "InstallLocation"
  StrCmp $0 "" forget
  Delete "$0\StageCue.amxd"
  Delete "$0\stagecue-lom.js"
  Delete "$0\stagecue-bridge.js"
  Delete "$0\package.json"
  RMDir "$0" ; only if now empty
  forget:
  DeleteRegKey HKCU "${UNINSTALL_KEY}"
  Delete "${UNINSTALLER}"
  RMDir "$LOCALAPPDATA\StageCue"
SectionEnd
