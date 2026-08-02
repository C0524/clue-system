@echo off
REM 进入脚本目录并设置编码
cd /d "%~dp0"
chcp 65001 >nul
setlocal

echo ===============================
echo 重启医疗线索系统（一键重启）
echo ===============================

if not exist "%~dp0stop-server.bat" (
  echo 未找到 stop-server.bat，无法继续。
  exit /b 1
)
if not exist "%~dp0start-server.bat" (
  echo 未找到 start-server.bat，无法继续。
  exit /b 1
)

echo [1/2] 正在停止服务...
call "%~dp0stop-server.bat"
set STOP_CODE=%ERRORLEVEL%
if not "%STOP_CODE%"=="0" (
  echo 停止阶段返回错误码 %STOP_CODE%，将继续尝试启动。
)

REM 最多等待 10 秒，尽量确保 3000 端口释放
set WAIT=0
set MAXWAIT=10
:wait_port_release
netstat -ano | findstr ":3000" | findstr LISTENING >nul 2>&1
if errorlevel 1 goto do_start
if %WAIT% GEQ %MAXWAIT% goto do_start
timeout /t 1 >nul
set /a WAIT+=1
goto wait_port_release

:do_start
echo [2/2] 正在启动服务...
call "%~dp0start-server.bat"
set START_CODE=%ERRORLEVEL%

if "%START_CODE%"=="0" (
  echo 重启完成。
  endlocal
  exit /b 0
) else (
  echo 启动失败，错误码 %START_CODE%。
  endlocal
  exit /b %START_CODE%
)
