@echo off
set "NODE_PATH=C:\Users\frank.wong\AppData\Local\Microsoft\WinGet\Packages\OpenJS.NodeJS.LTS_Microsoft.Winget.Source_8wekyb3d8bbwe\node-v24.20.0-win-x64"
if exist "%NODE_PATH%\node.exe" (
    set "PATH=%NODE_PATH%;%PATH%"
)
cd /d "%~dp0"
echo Starting TPBL Frontend on http://localhost:3000 ...
call npm run dev
