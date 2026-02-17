# Enable WebView Debugging for Chrome DevTools
# This allows you to debug the app's WebView in Chrome DevTools

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Enable WebView Debugging" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Find ADB
$adbCmd = "adb"
$adbPath = Get-Command adb -ErrorAction SilentlyContinue

if (-not $adbPath) {
    $searchPaths = @(
        "$env:USERPROFILE\Downloads\platform-tools\adb.exe",
        "$env:USERPROFILE\Downloads\platform-tools\platform-tools\adb.exe",
        "$env:USERPROFILE\Downloads\adb.exe"
    )
    
    foreach ($path in $searchPaths) {
        if (Test-Path $path) {
            $adbCmd = $path
            $env:PATH = "$(Split-Path $path -Parent);$env:PATH"
            break
        }
    }
}

# Check device
$devices = & $adbCmd devices | Select-Object -Skip 1 | Where-Object { $_ -match "device$" }
if ($devices.Count -eq 0) {
    Write-Host "ERROR: No device connected" -ForegroundColor Red
    exit 1
}

Write-Host "[1/3] Enabling WebView debugging..." -ForegroundColor Yellow
& $adbCmd shell "setprop debug.webview.provider com.google.android.webview" 2>$null
& $adbCmd shell "setprop debug.webview.tracing 1" 2>$null
Write-Host "[OK] WebView debugging enabled" -ForegroundColor Green

Write-Host ""
Write-Host "[2/3] Checking WebView package..." -ForegroundColor Yellow
$webviewPackage = & $adbCmd shell pm list packages | Select-String "webview"
if ($webviewPackage) {
    Write-Host "[OK] WebView found: $webviewPackage" -ForegroundColor Green
} else {
    Write-Host "[WARN] WebView package not found" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "[3/3] Setup complete!" -ForegroundColor Green
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  How to Debug WebView" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Open Chrome browser on your computer" -ForegroundColor White
Write-Host "2. Go to: chrome://inspect" -ForegroundColor Cyan
Write-Host "3. Look for 'com.sareeorder.app' under 'Remote Target'" -ForegroundColor White
Write-Host "4. Click 'inspect' to open DevTools" -ForegroundColor White
Write-Host "5. Go to Console tab to see [PDF] logs" -ForegroundColor White
Write-Host ""
Write-Host "This will show:" -ForegroundColor Yellow
Write-Host "  - JavaScript console logs" -ForegroundColor White
Write-Host "  - [PDF] prefixed debug messages" -ForegroundColor White
Write-Host "  - Errors and warnings" -ForegroundColor White
Write-Host "  - Network requests" -ForegroundColor White
Write-Host ""
Write-Host "Now test PDF download and watch the console!" -ForegroundColor Green
