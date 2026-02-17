# Comprehensive PDF Feature Testing Script
# Tests PDF download functionality and reports issues

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  PDF Feature Test & Verification" -ForegroundColor Cyan
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
Write-Host "[TEST 1] Checking device connection..." -ForegroundColor Yellow
$devices = & $adbCmd devices | Select-Object -Skip 1 | Where-Object { $_ -match "device$" }
if ($devices.Count -eq 0) {
    Write-Host "[FAIL] No device connected" -ForegroundColor Red
    exit 1
}
Write-Host "[PASS] Device connected" -ForegroundColor Green

# Check app installation
Write-Host ""
Write-Host "[TEST 2] Checking app installation..." -ForegroundColor Yellow
$appInstalled = & $adbCmd shell pm list packages | Select-String "com.sareeorder.app"
if ($appInstalled) {
    Write-Host "[PASS] App is installed" -ForegroundColor Green
} else {
    Write-Host "[FAIL] App not installed" -ForegroundColor Red
    Write-Host "Run: npm run apk:install" -ForegroundColor Yellow
    exit 1
}

# Check WebView version
Write-Host ""
Write-Host "[TEST 3] Checking WebView version..." -ForegroundColor Yellow
$webviewVersion = & $adbCmd shell dumpsys package com.google.android.webview | Select-String "versionName"
if ($webviewVersion) {
    Write-Host "[PASS] WebView found: $webviewVersion" -ForegroundColor Green
} else {
    Write-Host "[WARN] WebView version not found (may still work)" -ForegroundColor Yellow
}

# Clear logs
Write-Host ""
Write-Host "[TEST 4] Preparing log monitoring..." -ForegroundColor Yellow
& $adbCmd logcat -c
Write-Host "[OK] Logs cleared" -ForegroundColor Green

# Instructions
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Manual Testing Steps" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Follow these steps on your phone:" -ForegroundColor White
Write-Host ""
Write-Host "1. Open the Saree Order App" -ForegroundColor Yellow
Write-Host "2. Sign in (if not already)" -ForegroundColor Yellow
Write-Host "3. Navigate to Orders page" -ForegroundColor Yellow
Write-Host "4. Make sure you have some orders visible" -ForegroundColor Yellow
Write-Host "5. Click the PDF download button (bottom right)" -ForegroundColor Yellow
Write-Host ""
Write-Host "Watch for:" -ForegroundColor Cyan
Write-Host "  - Does the button show 'Generating...'?" -ForegroundColor White
Write-Host "  - Does a PDF file appear in Downloads?" -ForegroundColor White
Write-Host "  - Any error messages on screen?" -ForegroundColor White
Write-Host "  - Does the button become idle/unresponsive?" -ForegroundColor White
Write-Host ""
Write-Host "Press ENTER when you've clicked the PDF button..." -ForegroundColor Yellow
$null = Read-Host

# Monitor logs for 30 seconds
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Analyzing Logs (30 seconds)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$logFile = "$env:TEMP\pdf-test-logs.txt"
$timeout = 30
$startTime = Get-Date

# Start logcat in background and capture output
$job = Start-Job -ScriptBlock {
    param($adbCmd, $logFile)
    & $adbCmd logcat -d > $logFile 2>&1
} -ArgumentList $adbCmd, $logFile

# Wait and show progress
for ($i = 0; $i -lt $timeout; $i++) {
    Start-Sleep -Seconds 1
    $elapsed = (Get-Date) - $startTime
    Write-Host "`rCollecting logs... $($elapsed.TotalSeconds.ToString('F1'))s" -NoNewline -ForegroundColor Gray
}

Write-Host ""
Write-Host ""
Write-Host "Analyzing logs..." -ForegroundColor Yellow
Write-Host ""

# Analyze logs
$logs = Get-Content $logFile -ErrorAction SilentlyContinue

# Check for PDF-related logs
$pdfLogs = $logs | Select-String -Pattern "pdf|jspdf|blob|download|\[PDF\]" -CaseSensitive:$false
$errorLogs = $logs | Select-String -Pattern "error|exception|failed|fatal|uncaught" -CaseSensitive:$false | Select-String -Pattern "saree|capacitor|webview|chromium" -CaseSensitive:$false

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Test Results" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

if ($pdfLogs) {
    Write-Host "[FOUND] PDF-related activity:" -ForegroundColor Green
    $pdfLogs | Select-Object -First 10 | ForEach-Object {
        Write-Host "  $_" -ForegroundColor Gray
    }
    Write-Host ""
} else {
    Write-Host "[WARNING] No PDF-related logs found" -ForegroundColor Yellow
    Write-Host "  This might mean:" -ForegroundColor White
    Write-Host "    - PDF button was not clicked" -ForegroundColor Gray
    Write-Host "    - JavaScript errors prevented execution" -ForegroundColor Gray
    Write-Host "    - WebView console logs not captured" -ForegroundColor Gray
    Write-Host ""
}

if ($errorLogs) {
    Write-Host "[ERRORS FOUND] Issues detected:" -ForegroundColor Red
    $errorLogs | Select-Object -First 10 | ForEach-Object {
        Write-Host "  $_" -ForegroundColor Red
    }
    Write-Host ""
} else {
    Write-Host "[OK] No obvious errors found" -ForegroundColor Green
    Write-Host ""
}

# Recommendations
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Recommendations" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "1. Check browser console:" -ForegroundColor Yellow
Write-Host "   - Open Chrome DevTools" -ForegroundColor White
Write-Host "   - Connect to: chrome://inspect" -ForegroundColor White
Write-Host "   - Look for [PDF] prefixed logs" -ForegroundColor White
Write-Host ""

Write-Host "2. Check Downloads folder on phone:" -ForegroundColor Yellow
Write-Host "   - Open Files app" -ForegroundColor White
Write-Host "   - Check Downloads folder" -ForegroundColor White
Write-Host "   - Look for PDF files" -ForegroundColor White
Write-Host ""

Write-Host "3. Test PDF generation:" -ForegroundColor Yellow
Write-Host "   - Visit: http://localhost:3000/test-pdf (if dev server running)" -ForegroundColor White
Write-Host "   - Or check browser console for JavaScript errors" -ForegroundColor White
Write-Host ""

Write-Host "4. Enable verbose logging:" -ForegroundColor Yellow
Write-Host "   - The app already has [PDF] console logs" -ForegroundColor White
Write-Host "   - Check browser DevTools console for detailed logs" -ForegroundColor White
Write-Host ""

# Cleanup
Remove-Item $logFile -ErrorAction SilentlyContinue

Write-Host "Test complete!" -ForegroundColor Green
