$nodePath = "C:\Users\frank.wong\AppData\Local\Microsoft\WinGet\Packages\OpenJS.NodeJS.LTS_Microsoft.Winget.Source_8wekyb3d8bbwe\node-v24.20.0-win-x64"
if (Test-Path "$nodePath\node.exe") {
    $env:PATH = "$nodePath;" + $env:PATH
}

Set-Location -Path $PSScriptRoot
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "  🏀 啟動 TPBL 前端服務 (Next.js + Tailwind CSS)" -ForegroundColor Green
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "[*] 本地訪問網址: http://localhost:3000" -ForegroundColor Yellow
Write-Host "[*] 單場 G07 覆盤: http://localhost:3000/games/G07" -ForegroundColor Yellow
Write-Host "========================================================" -ForegroundColor Cyan

npm run dev
