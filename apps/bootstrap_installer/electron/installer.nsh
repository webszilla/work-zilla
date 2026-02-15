!macro wz_read_uninstall_value ROOT_KEY SUB_KEY
  ReadRegStr $0 ${ROOT_KEY} "${SUB_KEY}" "QuietUninstallString"
  StrCmp $0 "" 0 +2
  ReadRegStr $0 ${ROOT_KEY} "${SUB_KEY}" "UninstallString"
  ReadRegStr $1 ${ROOT_KEY} "${SUB_KEY}" "InstallLocation"
!macroend

!macro customInit
  StrCpy $0 ""
  StrCpy $1 ""

  ; Force-close any known old bootstrap installer processes first.
  nsExec::ExecToLog 'taskkill /F /T /IM "Work Zilla Installer.exe"'
  nsExec::ExecToLog 'taskkill /F /T /IM "work-zilla-bootstrap-installer.exe"'
  nsExec::ExecToLog 'taskkill /F /T /IM "WorkZillaInstaller.exe"'
  nsExec::ExecToLog 'taskkill /F /T /IM "Uninstall Work Zilla Installer.exe"'
  Sleep 1500

  ; Hard cleanup for old install folders (for corrupted uninstall cases).
  RMDir /r "$LOCALAPPDATA\Programs\Work Zilla Installer"
  RMDir /r "$PROGRAMFILES\Work Zilla Installer"
  RMDir /r "$PROGRAMFILES64\Work Zilla Installer"

  ; Remove common/legacy uninstall keys so NSIS doesn't get stuck on stale entries.
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\com.workzilla.bootstrap"
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\com.workzilla.bootstrap"
  DeleteRegKey HKLM "Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\com.workzilla.bootstrap"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Work Zilla Installer"
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\Work Zilla Installer"
  DeleteRegKey HKLM "Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\Work Zilla Installer"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Work Zilla Installer_is1"
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\Work Zilla Installer_is1"
  DeleteRegKey HKLM "Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\Work Zilla Installer_is1"

  !insertmacro wz_read_uninstall_value HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_ID}"

  StrCmp $0 "" 0 wz_found

  !insertmacro wz_read_uninstall_value HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_ID}"

  StrCmp $0 "" 0 wz_found

  !insertmacro wz_read_uninstall_value HKLM "Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\${APP_ID}"

  StrCmp $0 "" wz_done wz_found

wz_found:
  MessageBox MB_ICONQUESTION|MB_YESNO "An existing Work Zilla Installer installation was found.$\r$\n$\r$\nClick Yes to remove it and continue." IDYES wz_remove_old IDNO wz_abort_install

wz_remove_old:
  DetailPrint "Removing existing Work Zilla Installer..."
  nsExec::ExecToLog 'taskkill /F /T /IM "Work Zilla Installer.exe"'
  nsExec::ExecToLog 'taskkill /F /T /IM "Uninstall Work Zilla Installer.exe"'
  Sleep 1200

  ExecWait '$0 /S' $2
  StrCmp $2 "0" wz_cleanup 0

  DetailPrint "Primary uninstall failed with exit code $2. Retrying through cmd..."
  ExecWait '"$SYSDIR\cmd.exe" /C "$0 /S"' $2
  StrCmp $2 "0" wz_cleanup 0
  MessageBox MB_ICONEXCLAMATION|MB_OK "Automatic uninstall returned code $2. Continuing with cleanup."

wz_cleanup:
  StrCmp $1 "" wz_shortcuts_cleanup
  RMDir /r "$1"

wz_shortcuts_cleanup:
  Delete "$DESKTOP\Work Zilla Installer.lnk"
  RMDir /r "$SMPROGRAMS\Work Zilla Installer"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_ID}"
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_ID}"
  DeleteRegKey HKLM "Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\${APP_ID}"
  Goto wz_done

wz_abort_install:
  Abort

wz_done:
!macroend
