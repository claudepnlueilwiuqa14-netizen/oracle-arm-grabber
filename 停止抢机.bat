@echo off
title 停止抢机
cd /d "%USERPROFILE%\WorkBuddy\2026-09-30-20-59-27\pw"
echo 正在通知抢机脚本停下（最多等一轮，约 70 秒）...
echo. > oci_retry.stop
echo.
echo 停止标志 oci_retry.stop 已放好。
echo 脚本下一轮会自己退出，不会留下半开的连接。
echo.
echo 怎么确认停了：过 2 分钟双击「看状态.bat」，
echo 里面的"更新时间"不再变化，就是真停了。
echo.
pause
