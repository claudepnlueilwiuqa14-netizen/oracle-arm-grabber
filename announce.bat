@echo off
title 抢到了！Oracle Arm 免费服务器
mode con cols=70 lines=20
echo.
echo    ==========================================================
echo.
echo         抢  到  了  ！   Arm 服务器已经创建成功
echo.
echo    ==========================================================
echo.
echo      规格：      1 核 6G 内存  （永久免费）
echo      地区：      日本东京
echo      系统：      Oracle Linux 9
echo.
echo      详情已经用记事本打开：桌面\抢到了-Arm服务器.txt
echo      里面有公网 IP 和连接方法。
echo.
echo      下一步：喊一声泽泽，我马上给你装图形桌面。
echo.
echo    ==========================================================
echo.
powershell -NoProfile -Command "[console]::Beep(880,400); Start-Sleep -m 250; [console]::Beep(1175,400); Start-Sleep -m 250; [console]::Beep(880,700)"
start notepad "%USERPROFILE%\Desktop\抢到了-Arm服务器.txt"
echo.
pause
