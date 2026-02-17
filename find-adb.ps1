# Helper script to find ADB in Downloads folder

Write-Host "Searching for ADB in Downloads..." -ForegroundColor Cyan
Write-Host ""

$downloadsPath = "$env:USERPROFILE\Downloads"
$found = $false

# Check for platform-tools folder
$platformToolsPath = Join-Path $downloadsPath "platform-tools"
if (Test-Path (Join-Path $platformToolsPath "adb.exe")) {
    Write-Host "[FOUND] ADB at: $platformToolsPath\adb.exe" -ForegroundColor Green
    Write-Host ""
    Write-Host "You're all set! Run: npm run apk:auto" -ForegroundColor Green
    $found = $true
}

# Check for adb.exe directly in Downloads
$adbDirect = Join-Path $downloadsPath "adb.exe"
if (Test-Path $adbDirect) {
    Write-Host "[FOUND] ADB at: $adbDirect" -ForegroundColor Green
    Write-Host ""
    Write-Host "You're all set! Run: npm run apk:auto" -ForegroundColor Green
    $found = $true
}

# Check for ZIP files
$zipFiles = Get-ChildItem -Path $downloadsPath -Filter "*platform*.zip" -ErrorAction SilentlyContinue
if ($zipFiles) {
    Write-Host "[FOUND] Platform Tools ZIP files:" -ForegroundColor Yellow
    foreach ($zip in $zipFiles) {
        Write-Host "  - $($zip.Name)" -ForegroundColor Cyan
        Write-Host "    Location: $($zip.FullName)" -ForegroundColor Gray
    }
    Write-Host ""
    Write-Host "To extract:" -ForegroundColor Yellow
    Write-Host "  1. Right-click the ZIP file" -ForegroundColor White
    Write-Host "  2. Select 'Extract All...'" -ForegroundColor White
    Write-Host "  3. Extract to: $downloadsPath\platform-tools\" -ForegroundColor White
    Write-Host "  4. Then run: npm run apk:auto" -ForegroundColor White
    $found = $true
}

if (-not $found) {
    Write-Host "[NOT FOUND] ADB not found in Downloads" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please:" -ForegroundColor Yellow
    Write-Host "  1. Download platform-tools from:" -ForegroundColor White
    Write-Host "     https://developer.android.com/tools/releases/platform-tools" -ForegroundColor Cyan
    Write-Host "  2. Extract platform-tools.zip to Downloads folder" -ForegroundColor White
    Write-Host "  3. Run this script again or: npm run apk:auto" -ForegroundColor White
}

Write-Host ""
