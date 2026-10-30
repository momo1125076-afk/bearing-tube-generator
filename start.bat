@echo off
cd /d %~dp0
echo 打开 http://localhost:8765/index.html
python -m http.server 8765
