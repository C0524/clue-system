param(
  [string]$HostUrl = "https://web.970524.xyz",
  [int]$LocalPort = 3000,
  [string]$ServiceName = "cloudflared",
  [string]$LogFile = ""
)

$ErrorActionPreference = "SilentlyContinue"

if (-not $LogFile -or $LogFile.Trim() -eq "") {
  $LogFile = Join-Path $PSScriptRoot "tunnel_watchdog.log"
}

function Test-LocalPort {
  param([int]$Port)
  $line = netstat -ano | Select-String (":" + $Port + "\s+.*LISTENING") | Select-Object -First 1
  return ($null -ne $line)
}

function Test-HttpOk {
  param([string]$Url)
  try {
    $res = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 8
    if ($res -and $res.StatusCode -ge 200 -and $res.StatusCode -lt 500) { return $true }
  } catch {
  }
  return $false
}

function Append-Log {
  param([string]$Message)
  $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') " + $Message
  try {
    Add-Content -Path $LogFile -Value $line -Encoding UTF8
  } catch {
  }
}

$localListening = Test-LocalPort -Port $LocalPort
$localHttp = Test-HttpOk -Url ("http://localhost:" + $LocalPort)
$publicHttp = Test-HttpOk -Url $HostUrl

$svc = Get-Service $ServiceName
$svcRunning = $false
if ($svc) {
  $svcRunning = ($svc.Status -eq "Running")
}

$proc = Get-CimInstance Win32_Process -Filter "name='cloudflared.exe'" | Select-Object -First 1
$procRunning = ($null -ne $proc)

$needRestart = $false
$reason = @()

if (-not $svcRunning) {
  $needRestart = $true
  $reason += "service_stopped"
}

if (-not $procRunning) {
  $needRestart = $true
  $reason += "process_missing"
}

if (-not $publicHttp) {
  $needRestart = $true
  $reason += "public_probe_failed"
}

if (-not $localListening -or -not $localHttp) {
  $reason += "local_service_unhealthy"
}

if ($needRestart) {
  Append-Log ("ACTION restart " + ($reason -join ","))
  try {
    Restart-Service $ServiceName -Force
  } catch {
    try {
      Start-Service $ServiceName
    } catch {
    }
  }
  $after = Get-Service $ServiceName
  $afterStatus = if ($after) { $after.Status } else { "Unknown" }
  $publicAfter = Test-HttpOk -Url $HostUrl
  Append-Log ("RESULT service=" + $afterStatus + " public_ok=" + $publicAfter)
} else {
  Append-Log "OK no_action service_running public_probe_ok"
}
