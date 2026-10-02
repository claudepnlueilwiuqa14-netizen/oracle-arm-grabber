@echo off
title 自动抢 Oracle 东京 Arm 免费服务器（1核6G）
cd /d "%USERPROFILE%\WorkBuddy\2026-09-30-20-59-27\pw"
set NODE_PATH=%USERPROFILE%\node_modules
set NODE_EXE=%USERPROFILE%\.workbuddy\binaries\node\versions\22.22.2-2\node.exe

echo ==================================================
echo    自动抢 Oracle 东京 Arm 免费服务器（1核 6G）
echo ==================================================
echo    - 这个窗口要一直开着，别关
echo    - 脚本万一崩了，10 秒后会自动重开（看门狗）
echo    - 抢到会弹窗 + 响铃 + 打开记事本通知你
echo    - 想彻底停：直接关掉这个黑窗口
echo ==================================================
echo.

curl -s -m 3 http://127.0.0.1:9222/json/version >nul 2>&1
if errorlevel 1 (
  echo [1/3] 浏览器没在运行，正在启动...
  start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="%USERPROFILE%\WorkBuddy\2026-09-30-20-59-27\chrome-tmp" --remote-allow-origins=* "https://cloud.oracle.com/compute/instances/create?region=ap-tokyo-1"
  echo      等 15 秒让页面加载...
  timeout /t 15 >nul
) else (
  echo [1/3] 浏览器已在运行。
)

if exist oci_retry.stop del oci_retry.stop
echo [2/3] 已清掉停止标志
echo [3/3] 开始抢机（每 70 秒一次）
echo.

:loop
"%NODE_EXE%" oci_retry.js 120
if errorlevel 2 goto stuck
echo.
echo    这一轮跑完了，10 秒后自动重开接着抢...
echo    （想停：关掉这个窗口）
timeout /t 10 >nul
goto loop

:stuck
echo.
echo    抢机卡住了，已经停止自动重启，需要你手动处理。
echo    看上面弹出来的提示窗口，或者直接喊泽泽。
echo.
pause
