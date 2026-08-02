[Diagnostics.CodeAnalysis.SuppressMessageAttribute('PSUseDeclaredVarsMoreThanAssignments', '', Scope='Script', Target='*')]
param(
    [string]$DB_HOST = "localhost",
    [string]$DB_USER = "root",
    [string]$DB_PASS = "",
    [string]$DB_NAME = "clue_system",
    [string]$DB_PORT = "3306",
    [string]$AUTH_TOKEN_SECRET = "",
    [string]$ALLOW_INSECURE_AUTH_TOKEN_SECRET = ""
)

Set-Location -Path $PSScriptRoot

# Ensure console uses UTF-8 output
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = New-Object System.Text.UTF8Encoding $false
$PSDefaultParameterValues['Out-File:Encoding'] = 'utf8'
$PSDefaultParameterValues['Set-Content:Encoding'] = 'utf8'

Write-Output "Starting run-server.ps1 - set env and launch node server.js"

# PID 文件路径
$pidFile = Join-Path $PSScriptRoot 'server.pid'
$wrapperPidFile = Join-Path $PSScriptRoot 'server.wrapper.pid'

# 如果存在旧的 PID 文件，尝试清理或终止对应进程以避免冲突
if (Test-Path $pidFile) {
    try {
        $oldPid = (Get-Content $pidFile -ErrorAction SilentlyContinue) -join "" | ForEach-Object { $_.Trim() }
        if ($oldPid) {
            $proc = Get-Process -Id $oldPid -ErrorAction SilentlyContinue
            if ($proc) {
                Write-Warning ("Detected existing process with PID " + $oldPid + ". Attempting to stop it...")
                try {
                    Stop-Process -Id $oldPid -Force -ErrorAction Stop
                    Write-Output ("Stopped old process " + $oldPid)
                } catch {
                    Write-Warning ("Failed to stop old process " + $oldPid + ": " + ($_.Exception.Message))
                }
                Start-Sleep -Seconds 1
            } else {
                Write-Warning ("Found stale server.pid (PID " + $oldPid + ") but process not running; removing file.")
            }
        }
    } catch {
        Write-Warning ("Warning checking existing pid: " + $_.Exception.Message)
    }
    try {
        Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
    } catch {
        Write-Error ("Failed to remove stale server.pid: " + $_.Exception.Message)
    }
}

# 写入包装进程 PID，便于 stop-server 一并清理启动窗口
try {
    $PID | Out-File -FilePath $wrapperPidFile -Encoding ascii -Force
} catch {
    Write-Warning "Failed to write server.wrapper.pid: $($_.Exception.Message)"
}

# Set environment variables from parameters
if ($DB_HOST) { $env:DB_HOST = $DB_HOST }
if ($DB_USER) { $env:DB_USER = $DB_USER }
if ($DB_PASS) { $env:DB_PASS = $DB_PASS }
if ($DB_NAME) { $env:DB_NAME = $DB_NAME }
if ($DB_PORT) { $env:DB_PORT = $DB_PORT }
if ($AUTH_TOKEN_SECRET) { $env:AUTH_TOKEN_SECRET = $AUTH_TOKEN_SECRET }
if ($ALLOW_INSECURE_AUTH_TOKEN_SECRET) { $env:ALLOW_INSECURE_AUTH_TOKEN_SECRET = $ALLOW_INSECURE_AUTH_TOKEN_SECRET }

# Fallback: load auth secret from .env if not passed by caller
if ((-not $env:AUTH_TOKEN_SECRET -or $env:AUTH_TOKEN_SECRET -eq "") -and (Test-Path (Join-Path $PSScriptRoot '.env'))) {
    try {
        Get-Content (Join-Path $PSScriptRoot '.env') -ErrorAction SilentlyContinue | ForEach-Object {
            if ($_ -match '^\s*AUTH_TOKEN_SECRET\s*=\s*(.*)\s*$') {
                $val = $matches[1].Trim().Trim('"').Trim("'")
                if ($val) { $env:AUTH_TOKEN_SECRET = $val }
            }
            if ($_ -match '^\s*ALLOW_INSECURE_AUTH_TOKEN_SECRET\s*=\s*(.*)\s*$') {
                $val2 = $matches[1].Trim().Trim('"').Trim("'")
                if ($val2) { $env:ALLOW_INSECURE_AUTH_TOKEN_SECRET = $val2 }
            }
        }
    } catch {
        Write-Error ("Failed to read auth-related values from .env: " + $_.Exception.Message)
    }
}

if (-not $env:AUTH_TOKEN_SECRET -and -not ($env:ALLOW_INSECURE_AUTH_TOKEN_SECRET -eq '1')) {
    Write-Output "AUTH_TOKEN_SECRET is not set. Please configure AUTH_TOKEN_SECRET in .env."
    Write-Output "For local temporary use only, set ALLOW_INSECURE_AUTH_TOKEN_SECRET=1 in .env."
    exit 1
}

Write-Output "Using config: DB_HOST=$($env:DB_HOST) DB_USER=$($env:DB_USER) DB_NAME=$($env:DB_NAME) DB_PORT=$($env:DB_PORT)"

# If DB_PASS is missing, prompt for it in this window
if (-not $env:DB_PASS -or $env:DB_PASS -eq "") {
    Write-Output "DB_PASS not provided - prompting for password (no echo)"
    $secure = Read-Host -AsSecureString "Enter DB password"
    $env:DB_PASS = (New-Object -TypeName System.Management.Automation.PSCredential -ArgumentList 'tmp', $secure).GetNetworkCredential().Password
    if (-not $env:DB_PASS -or $env:DB_PASS -eq "") {
        Write-Output "Failed to read password."
        exit 1
    }
}

# Check node
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
    Write-Output "Node.js not found - please install node and add to PATH."
    Write-Output "Press any key to exit..."
    $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown') > $null
    exit 1
}

try {
    Write-Output "Launching: node server.js (logs will appear here)"
    $startInfo = Start-Process -FilePath $nodeCmd.Path -ArgumentList 'server.js' -WorkingDirectory $PSScriptRoot -NoNewWindow -PassThru
} catch {
    Write-Output "Failed to start node: $($_.Exception.Message)"
    exit 1
}

# Write server.pid for other scripts
try {
    $pidFile = Join-Path $PSScriptRoot 'server.pid'
    if ($startInfo -and $startInfo.Id) {
        $startInfo.Id | Out-File -FilePath $pidFile -Encoding ascii -Force
        Write-Output "Wrote server.pid -> PID=$($startInfo.Id)"
    } else {
        Write-Warning "Process info not available; server.pid not written."
    }
} catch {
    Write-Warning "Failed to write server.pid: $($_.Exception.Message)"
}

    try {
        Wait-Process -Id $startInfo.Id
        Write-Output "node process exited (PID=$($startInfo.Id))."
        # 仅在 pid 文件仍然指向我们启动的进程时才删除（避免误删其他新进程的 pid）
        try{
            if (Test-Path $pidFile) {
                $cur = (Get-Content $pidFile -ErrorAction SilentlyContinue) -join "" | ForEach-Object { $_.Trim() }
                if ($cur -and $cur -eq ($startInfo.Id.ToString())) { Remove-Item -Path $pidFile -Force -ErrorAction SilentlyContinue }
            }
        } catch {
            Write-Error ("Failed to clean server.pid after exit: " + $_.Exception.Message)
        }
    } catch {
        Write-Warning "Error while waiting for process: $($_.Exception.Message)"
    }

# 清理 wrapper pid 文件（仅当仍指向当前 PowerShell 进程）
try {
    if (Test-Path $wrapperPidFile) {
        $curWrap = (Get-Content $wrapperPidFile -ErrorAction SilentlyContinue) -join "" | ForEach-Object { $_.Trim() }
        if ($curWrap -and $curWrap -eq ($PID.ToString())) {
            Remove-Item -Path $wrapperPidFile -Force -ErrorAction SilentlyContinue
        }
    }
} catch {
    Write-Error ("Failed to clean server.wrapper.pid: " + $_.Exception.Message)
}
