!macro customInit
  StrCpy $0 ""
  StrCpy $1 ""

  ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_ID}" "UninstallString"
  ReadRegStr $1 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_ID}" "InstallLocation"

  StrCmp $0 "" 0 wz_found

  ReadRegStr $0 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_ID}" "UninstallString"
  ReadRegStr $1 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_ID}" "InstallLocation"

  StrCmp $0 "" 0 wz_found

  ReadRegStr $0 HKLM "Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\${APP_ID}" "UninstallString"
  ReadRegStr $1 HKLM "Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\${APP_ID}" "InstallLocation"

  StrCmp $0 "" wz_done wz_found

wz_found:
  MessageBox MB_ICONQUESTION|MB_YESNO "An existing Work Zilla Installer installation was found.$\r$\n$\r$\nClick Yes to remove it and continue." IDYES wz_remove_old IDNO wz_abort_install

wz_remove_old:
  DetailPrint "Removing existing Work Zilla Installer..."
  ExecWait '$0 /S' $2
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
