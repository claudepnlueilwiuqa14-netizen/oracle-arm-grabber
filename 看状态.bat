@echo off
title 抢机状态查看
cd /d "%USERPROFILE%\WorkBuddy\2026-09-30-20-59-27\pw"
echo ==================================================
echo    抢机运行状态
echo ==================================================
echo.
echo 现在时间：
echo     %date% %time%
echo.
echo --------------------------------------------------
echo 【一】状态文件（这才是判断活没活的依据）
echo --------------------------------------------------
powershell -NoProfile -Command "if (Test-Path '抢机状态.txt') { Get-Content '抢机状态.txt' -Encoding UTF8 } else { '（还没有状态文件，说明脚本没跑起来）' }"
echo.
echo --------------------------------------------------
echo 【二】最近 10 条日志
echo --------------------------------------------------
powershell -NoProfile -Command "if (Test-Path 'oci_retry.log') { Get-Content 'oci_retry.log' -Encoding UTF8 -Tail 10 } else { '（没有日志）' }"
echo.
echo --------------------------------------------------
echo 【三】判断方法
echo --------------------------------------------------
echo    状态文件里那个"更新时间"，跟现在差不到 3 分钟 = 还在抢。
echo    超过 3 分钟没变 = 停了，重新双击「一键抢Arm服务器.bat」。
echo ==================================================
echo.
pause
