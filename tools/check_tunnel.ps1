param(
  [string]$HostUrl = "https://web.970524.xyz",
  [int]$LocalPort = 3000,
  [switch]$AutoRestartCloudflared
)

$ErrorActionPreference = 'SilentlyContinue'

Write-Host "=== Tunnel Health Check ===" -ForegroundColor Cyan
Write-Host ("Time: " + (Get-Date).ToString("yyyy-MM-dd HH:mm:ss"))

# 1) Local app port
$portLines = netstat -ano | Select-String (":" + $LocalPort + "\s+.*LISTENING")
if ($portLines) {
  Write-Host "[OK] Local service is listening on port $LocalPort" -ForegroundColor Green
  $line = $portLines.ToString()
  $pid = ($line -split '\s+')[-1]
  Write-Host ("     PID=" + $pid)
} else {
  Write-Host "[FAIL] Local service is NOT listening on port $LocalPort" -ForegroundColor Red
}

# 2) Local HTTP probe
try {
  $r = Invoke-WebRequest -Uri ("http://localhost:" + $LocalPort) -UseBasicParsing -TimeoutSec 5
  Write-Host ("[OK] Local HTTP probe: " + $r.StatusCode) -ForegroundColor Green
} catch {
  Write-Host "[WARN] Local HTTP probe failed" -ForegroundColor Yellow
}

# 3) cloudflared service/process
$svc = Get-Service cloudflared
if ($svc) {
  Write-Host ("[INFO] cloudflared service status: " + $svc.Status)
} else {
  Write-Host "[WARN] cloudflared service not found" -ForegroundColor Yellow
}

$proc = Get-CimInstance Win32_Process -Filter "name='cloudflared.exe'" | Select-Object -First 1
if ($proc) {
  Write-Host ("[INFO] cloudflared PID=" + $proc.ProcessId)
  Write-Host ("[INFO] CommandLine=" + $proc.CommandLine)

  $pidSockets = netstat -ano | Select-String ("\s" + $proc.ProcessId + "$")
  $edgeSockets = $pidSockets | Where-Object { $_.ToString() -match "ESTABLISHED|SYN_SENT" }
  if ($edgeSockets) {
    Write-Host "[OK] cloudflared has outbound/edge sockets" -ForegroundColor Green
  } else {
    Write-Host "[WARN] cloudflared has no outbound edge sockets (may cause 1033)" -ForegroundColor Yellow
  }
} else {
  Write-Host "[FAIL] cloudflared process not running" -ForegroundColor Red
}

# 4) Public URL probe
try {
  $wr = Invoke-WebRequest -Uri $HostUrl -UseBasicParsing -TimeoutSec 10
  Write-Host ("[OK] Public URL probe: " + $wr.StatusCode + " " + $HostUrl) -ForegroundColor Green
} catch {
  Write-Host ("[FAIL] Public URL probe failed: " + $HostUrl) -ForegroundColor Red
}

# 5) Optional auto-restart cloudflared
if ($AutoRestartCloudflared) {
  Write-Host "[ACTION] Restarting cloudflared service..." -ForegroundColor Cyan
  Restart-Service cloudflared -Force
  Start-Sleep -Seconds 2
  $svc2 = Get-Service cloudflared
  Write-Host ("[INFO] cloudflared service status(after): " + $svc2.Status)
}

Write-Host "=== Done ===" -ForegroundColor Cyan
