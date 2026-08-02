@echo off
REM 进入脚本目录并设置编码
cd /d "%~dp0"
chcp 65001 >nul
echo ===============================
echo 启动医疗线索系统（一键启动）
echo ===============================

setlocal enabledelayedexpansion

REM 默认 MySQL 环境变量（可在 .env 中覆盖）
set DB_HOST=localhost
set DB_USER=root
set DB_NAME=clue_system
set DB_PORT=3306
set AUTH_TOKEN_SECRET=
set ALLOW_INSECURE_AUTH_TOKEN_SECRET=

REM 从 .env 文件读取（若存在）
if exist .env (
  for /f "usebackq tokens=1* delims==" %%A in (".env") do (
    if /i "%%~A"=="DB_PASS" set "DB_PASS=%%~B"
    if /i "%%~A"=="DB_HOST" set "DB_HOST=%%~B"
    if /i "%%~A"=="DB_USER" set "DB_USER=%%~B"
    if /i "%%~A"=="DB_NAME" set "DB_NAME=%%~B"
    if /i "%%~A"=="DB_PORT" set "DB_PORT=%%~B"
    if /i "%%~A"=="AUTH_TOKEN_SECRET" set "AUTH_TOKEN_SECRET=%%~B"
    if /i "%%~A"=="ALLOW_INSECURE_AUTH_TOKEN_SECRET" set "ALLOW_INSECURE_AUTH_TOKEN_SECRET=%%~B"
  )
)

REM 若仍无密码则交互式输入（仅当前会话）
if not defined DB_PASS (
  echo 未检测到数据库密码（DB_PASS），为保障安全请在此输入（不会保存）：
  set /p DB_PASS=请输入数据库密码：
  if not defined DB_PASS (
    echo 未输入密码，脚本退出。
    pause
    exit /b 1
  )
)

REM 检查 Node
where node >nul 2>&1
if errorlevel 1 (
  echo 未检测到 Node.js，请先安装 Node.js 并将 node 添加到 PATH。
  pause
  exit /b 1
)

echo 使用配置： DB_HOST=%DB_HOST% DB_USER=%DB_USER% DB_NAME=%DB_NAME% DB_PORT=%DB_PORT%

if not defined AUTH_TOKEN_SECRET (
  if /i not "%ALLOW_INSECURE_AUTH_TOKEN_SECRET%"=="1" (
    echo 未检测到 AUTH_TOKEN_SECRET。请在 .env 中配置 AUTH_TOKEN_SECRET=你的密钥
    echo 如仅本地临时调试，可在 .env 设置 ALLOW_INSECURE_AUTH_TOKEN_SECRET=1
    pause
    exit /b 1
  )
)

echo 正在打开新窗口启动服务（显示日志并保持打开）...
start "Clue Server" powershell -NoProfile -ExecutionPolicy Bypass -NoExit -Command "& { & '%~dp0run-server.ps1' -DB_HOST '%DB_HOST%' -DB_USER '%DB_USER%' -DB_PASS '%DB_PASS%' -DB_NAME '%DB_NAME%' -DB_PORT '%DB_PORT%' -AUTH_TOKEN_SECRET '%AUTH_TOKEN_SECRET%' -ALLOW_INSECURE_AUTH_TOKEN_SECRET '%ALLOW_INSECURE_AUTH_TOKEN_SECRET%' }"

REM 等待 run-server.ps1 写入 server.pid（循环等待，最长 15 秒）
set MAXWAIT=15
set WAIT=0
:wait_for_pid
if exist server.pid (
  set "_PID="
  for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "$v=Get-Content -Raw '%~dp0server.pid' -ErrorAction SilentlyContinue; if($v){$m=[regex]::Match($v,'[0-9]+'); if($m.Success){$m.Value}}"`) do set "_PID=%%i"
  if not defined _PID (
    if %WAIT% GEQ %MAXWAIT% (
      echo server.pid 已生成但内容无效，请在新窗口查看启动日志。
    ) else (
      timeout /t 1 >nul
      set /a WAIT+=1
      goto wait_for_pid
    )
  ) else (
    echo 启动成功，PID=!_PID!
  )
) else (
  if %WAIT% GEQ %MAXWAIT% (
    echo server.pid 尚未生成，请在新窗口查看启动日志。
  ) else (
    timeout /t 1 >nul
    set /a WAIT+=1
    goto wait_for_pid
  )
)

endlocal
exit /b 0
