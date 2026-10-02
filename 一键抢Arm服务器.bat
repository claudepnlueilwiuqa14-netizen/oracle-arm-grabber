@echo off
title 自动抢 Oracle Arm 免费服务器（Ampere A1.Flex）
cd /d "%USERPROFILE%\WorkBuddy\2026-09-30-20-59-27\pw"
set NODE_EXE=%USERPROFILE%\.workbuddy\binaries\node\versions\22.22.2-2\node.exe

echo ==================================================
echo    自动抢 Oracle Arm 免费服务器（Ampere A1.Flex）
echo ==================================================
echo    - 这个窗口要一直开着，别关
echo    - 脚本万一崩了，10 秒后会自动重开（看门狗）
echo    - 抢到会弹窗 + 响铃 + 打开记事本通知你
echo    - 想彻底停：双击「停止抢机.bat」，或关掉这个窗口
echo    - 抢哪个地区、多大规格，都在 config.js 里改
echo ==================================================
echo.

curl -s -m 3 http://127.0.0.1:9222/json/version >nul 2>&1
if errorlevel 1 (
  echo [1/3] 浏览器没在运行，正在启动...
  start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="%USERPROFILE%\WorkBuddy\2026-09-30-20-59-27\chrome-tmp" --remote-allow-origins=* "https://cloud.oracle.com"
  echo      等 15 秒；如果没登录 Oracle，请先手动登录
  timeout /t 15 >nul
) else (
  echo [1/3] 浏览器已在运行。
)

if exist oci_retry.stop del oci_retry.stop
echo [2/3] 已清掉停止标志
echo [3/3] 开始抢机（全自动：填向导 + 反复点创建）
echo.

:loop
"%NODE_EXE%" oci_grab.js auto
if errorlevel 2 goto stuck
echo.
echo    这一轮跑完了，10 秒后自动重开接着抢...
timeout /t 10 >nul
goto loop

:stuck
echo.
echo    抢机卡住了，已停止自动重启，需要你手动处理。
echo    看弹出来的提示窗口，按提示做完再回来双击本文件。
echo.
pause
