@echo off
title 抢机停下来了，需要你处理一下
mode con cols=74 lines=24
echo.
echo    ==========================================================
echo.
echo            抢 机 停 下 来 了 ， 需 要 你 处 理
echo.
echo    ==========================================================
echo.
echo      原因：连续 3 次找不到 Oracle 的创建向导页面。
echo            一般是浏览器被关掉了 / 掉线 / 页面被刷新。
echo.
echo      怎么办（两步，一分钟搞定）：
echo        1. 重新双击桌面的「一键抢Arm服务器.bat」
echo        2. 如果浏览器里是空白的新表单，要手动填一遍向导，
echo           照着这个文件做就行：
echo             %USERPROFILE%\WorkBuddy\2026-09-30-20-59-27\pw\填向导步骤.txt
echo.
echo      嫌麻烦？直接喊泽泽，我远程帮你填。
echo.
echo    ==========================================================
echo.
powershell -NoProfile -Command "[console]::Beep(660,300); Start-Sleep -m 200; [console]::Beep(520,500)"
echo.
pause
