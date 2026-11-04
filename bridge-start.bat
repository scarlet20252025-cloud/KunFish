@echo off
chcp 65001 >nul
cd /d D:\whale-girl
set PYTHONIOENCODING=utf-8
set PYTHONUTF8=1
set WECHATAUTO_RHYTHM=off
set HTTP_PROXY=
set HTTPS_PROXY=
set ALL_PROXY=
set http_proxy=
set https_proxy=
set all_proxy=
echo ==== bridge start %DATE% %TIME% ==== >> "D:\whale-girl\data\bridge.log"
"D:\whale-girl\runtime\python\python.exe" -u "examples\wechatauto_bridge.py" >> "D:\whale-girl\data\bridge.log" 2>&1
echo ==== bridge exit %ERRORLEVEL% %DATE% %TIME% ==== >> "D:\whale-girl\data\bridge.log"
