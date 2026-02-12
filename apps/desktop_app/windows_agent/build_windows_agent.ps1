$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$project = Join-Path $PSScriptRoot "WorkZilla.WindowsAgent.csproj"

Write-Host "Building Windows agent..."
dotnet build $project -c Release

dotnet publish $project -c Release -r win-x64 -p:PublishSingleFile=true -p:SelfContained=true -p:IncludeNativeLibrariesForSelfExtract=true

$sourceExe = Join-Path $PSScriptRoot "bin\Release\net6.0-windows\win-x64\publish\employee_agent.exe"
$targetExe = Join-Path $root "electron\monitor\employee_agent.exe"

if (!(Test-Path $sourceExe)) {
  throw "Build output not found: $sourceExe"
}

Copy-Item $sourceExe $targetExe -Force
Write-Host "Copied to $targetExe"
