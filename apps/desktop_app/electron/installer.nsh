!macro wz_read_uninstall_value ROOT_KEY SUB_KEY
  ReadRegStr $0 ${ROOT_KEY} "${SUB_KEY}" "QuietUninstallString"
  StrCmp $0 "" 0 +2
  ReadRegStr $0 ${ROOT_KEY} "${SUB_KEY}" "UninstallString"
!macroend

!macro customInit
  StrCpy $0 ""
  StrCpy $1 ""

  ; Ensure running app/background agent does not block installer.
  nsExec::ExecToLog 'taskkill /F /T /IM "Work Zilla Agent.exe"'
  nsExec::ExecToLog 'taskkill /F /T /IM "employee_agent.exe"'
  nsExec::ExecToLog 'taskkill /F /T /IM "Work Zilla Monitor.exe"'
  nsExec::ExecToLog 'taskkill /F /T /IM "WorkZillaMonitor.exe"'
  nsExec::ExecToLog 'taskkill /F /T /IM "monitoring_agent.exe"'
  nsExec::ExecToLog 'taskkill /F /T /IM "Uninstall Work Zilla Agent.exe"'
  Sleep 1200

  !insertmacro wz_read_uninstall_value HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_ID}"
  StrCmp $0 "" 0 wz_found
  !insertmacro wz_read_uninstall_value HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_ID}"
  StrCmp $0 "" 0 wz_found
  !insertmacro wz_read_uninstall_value HKLM "Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\${APP_ID}"
  StrCmp $0 "" wz_cleanup wz_found

wz_found:
  DetailPrint "Existing Work Zilla Agent detected. Removing before install..."
  ExecWait '$0 /S' $1
  StrCmp $1 "0" wz_cleanup 0
  ExecWait '"$SYSDIR\cmd.exe" /C "$0 /S"' $1

wz_cleanup:
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_ID}"
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_ID}"
  DeleteRegKey HKLM "Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\${APP_ID}"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Work Zilla Monitor"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "WorkZillaMonitor"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "WorkZilla Monitor"
  RMDir /r "$LOCALAPPDATA\Programs\Work Zilla Agent"
  RMDir /r "$LOCALAPPDATA\Programs\Work Zilla Monitor"
  RMDir /r "$PROGRAMFILES\Work Zilla Agent"
  RMDir /r "$PROGRAMFILES\Work Zilla Monitor"
  RMDir /r "$PROGRAMFILES64\Work Zilla Agent"
  RMDir /r "$PROGRAMFILES64\Work Zilla Monitor"
  RMDir /r "$APPDATA\WorkZillaMonitor"
  Delete "$SMSTARTUP\Work Zilla Monitor.lnk"
  Delete "$SMSTARTUP\WorkZillaMonitor.lnk"
!macroend
