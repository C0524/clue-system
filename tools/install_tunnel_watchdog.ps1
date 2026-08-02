param(
  [string]$TaskName = "ClueTunnelWatchdog",
  [int]$Minutes = 2,
  [switch]$Remove
)

$ErrorActionPreference = "SilentlyContinue"

$watchdogScript = Join-Path $PSScriptRoot "tunnel_watchdog.ps1"
if (-not (Test-Path $watchdogScript)) {
  Write-Host "watchdog script not found: $watchdogScript"
  exit 1
}

if ($Minutes -lt 1) { $Minutes = 1 }

if ($Remove) {
  schtasks /Delete /TN $TaskName /F | Out-Null
  Write-Host "Task removed: $TaskName"
  exit 0
}

$tr = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$watchdogScript`""

# Prefer SYSTEM account; if not permitted, fallback to current user.
$createSystem = schtasks /Create /TN $TaskName /SC MINUTE /MO $Minutes /TR $tr /RU SYSTEM /RL HIGHEST /F
if ($LASTEXITCODE -ne 0) {
  $currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
  schtasks /Create /TN $TaskName /SC MINUTE /MO $Minutes /TR $tr /RU $currentUser /RL HIGHEST /F | Out-Null
}

schtasks /Run /TN $TaskName | Out-Null
Write-Host "Task installed and started: $TaskName (every $Minutes minute(s))"
Write-Host "Watchdog script: $watchdogScript"
