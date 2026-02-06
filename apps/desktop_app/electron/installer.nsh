!macro customInit
  ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_ID}" "UninstallString"
  StrCmp $0 "" 0 +3
  ReadRegStr $0 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_ID}" "UninstallString"
  StrCmp $0 "" done
  MessageBox MB_OK "Work Zilla Agent is already installed. Please uninstall it before installing again."
  Abort

done:
!macroend
