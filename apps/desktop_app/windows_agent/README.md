# Work Zilla Windows Agent (C#)

This is a Windows-only screenshot + heartbeat agent for Work Zilla. It is designed to be launched by the Electron app (Option 3), reusing the existing React UI.

## Build (Windows 10/11)

Prereqs:
- .NET SDK 6.x or newer

Commands:
```powershell
cd apps/desktop_app/windows_agent
# Build release
 dotnet build -c Release

# Publish single file (optional)
 dotnet publish -c Release -r win-x64 -p:PublishSingleFile=true -p:SelfContained=true
```

## Output
The build produces `employee_agent.exe`.
Copy it into:
```
apps/desktop_app/electron/monitor/employee_agent.exe
```

## Config
Electron writes:
```
%APPDATA%\WorkZone\agent_config.json
```
Expected keys:
```json
{
  "device_id": "...",
  "employee_code": "...",
  "company_key": "zilla-17",
  "employee_name": "Guru"
}
```

Agent also reads:
```
%APPDATA%\work-zilla-agent\settings.json
```
for `serverUrl`, `companyKey`, `deviceId`, `employeeName` when needed.

## Run
```powershell
# One capture + upload
employee_agent.exe --once

# Continuous capture + heartbeat
employee_agent.exe

# Tray mode
employee_agent.exe --tray

# Install startup (current user)
employee_agent.exe --startup-install

# Remove startup
employee_agent.exe --startup-remove
```

## Logging
Logs are written to:
```
%APPDATA%\WorkZillaAgent\logs\agent.log
```

## What it does
- Registers employee if needed (`/api/employee/register`)
- Sends heartbeat (`/api/monitor/heartbeat`)
- Fetches interval (`/api/org/settings`)
- Captures screenshots every interval
- Uploads to `/api/screenshot/upload`
- Adds `app_name` + `window_title` metadata from active window

## Notes
- Uses `System.Drawing` capture (Windows only).
- Screenshot filenames include timestamp and GUID; server also renames on upload.
- Tray app provides quick actions and keeps agent running in background.
