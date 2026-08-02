@echo off
REM 进入脚本目录并设置编码
cd /d "%~dp0"
chcp 65001 >nul
setlocal enabledelayedexpansion
set STOP_FAILED=0
echo ===============================
echo 停止医疗线索系统（自动化）
echo ===============================

REM 优先使用 server.pid 停止对应进程
if exist server.pid (
  set "_PID="
  for /f "usebackq delims=" %%p in (`powershell -NoProfile -Command "$v=Get-Content -Raw '%~dp0server.pid' -ErrorAction SilentlyContinue; if($v){$m=[regex]::Match($v,'[0-9]+'); if($m.Success){$m.Value}}"`) do set "_PID=%%p"
  if defined _PID (
    echo 检测到 PID 文件：server.pid -> PID=!_PID!
    REM 检查进程是否存在
    tasklist /FI "PID eq !_PID!" | findstr /I /C:"!_PID!" >nul 2>&1
    if errorlevel 1 (
      echo 未检测到对应进程（PID !_PID! 已退出或不存在），删除陈旧的 server.pid 文件。
      del /f /q server.pid >nul 2>&1
      goto cleanup_wrapper
    ) else (
      echo 正在终止 PID !_PID! ...
      taskkill /PID !_PID! /F >nul 2>&1
      REM 如果 taskkill 失败，尝试 PowerShell Stop-Process
      tasklist /FI "PID eq !_PID!" | findstr /I /C:"!_PID!" >nul 2>&1
      if not errorlevel 1 (
        echo 通过 taskkill 未能终止，尝试 PowerShell Stop-Process...
        powershell -NoProfile -Command "try{ Stop-Process -Id !_PID! -Force -ErrorAction Stop; Write-Output 'Stopped' } catch { Write-Output 'PowerShell stop failed' }"
      )
      REM 再次检查是否已停止
      tasklist /FI "PID eq !_PID!" | findstr /I /C:"!_PID!" >nul 2>&1
      if errorlevel 1 (
        echo PID !_PID! 已终止。
        del /f /q server.pid >nul 2>&1
        goto cleanup_wrapper
      ) else (
        echo 无法停止 PID !_PID!（可能权限不足或进程被保护）。请手动检查。
        set STOP_FAILED=1
        goto cleanup_wrapper
      )
    )
  )
)

REM 回退：按端口查找并终止（默认端口 3000），适用于未生成 server.pid 的情况
:fallback_by_port
echo 未找到 server.pid，正在按端口 3000 查找对应进程并终止...
set found=0
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000" ^| findstr LISTENING') do (
  set found=1
  echo 找到 PID %%a，正在终止...
  taskkill /PID %%a /F >nul 2>&1
  if errorlevel 1 (
    echo 终止 PID %%a 失败（可能权限不足或进程已退出）。
  ) else (
    echo PID %%a 已终止。
  )
)

if "%found%"=="0" (
  echo 未检测到占用 3000 端口的进程。
) else (
  echo 端口清理完成。
)

:cleanup_wrapper
REM 额外清理 run-server.ps1 的包装进程，避免仍停留在后端窗口
if exist server.wrapper.pid (
  for /f "usebackq delims=" %%w in ("server.wrapper.pid") do set "_WPID=%%w"
  if defined _WPID (
    tasklist /FI "PID eq !_WPID!" | findstr /I /C:"!_WPID!" >nul 2>&1
    if not errorlevel 1 (
      echo 正在终止包装进程 PID !_WPID! ...
      taskkill /PID !_WPID! /F >nul 2>&1
    )
  )
  del /f /q server.wrapper.pid >nul 2>&1
)

echo 完成。
set "_EXITCODE=%STOP_FAILED%"
endlocal
if "%_EXITCODE%"=="1" (
  exit /b 1
) else (
  exit /b 0
)
