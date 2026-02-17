# PDF Download Issue Monitoring Script
# This script monitors logs while you test PDF download

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  PDF Download Issue Monitor" -ForegroundColor Cyan
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
Write-Host "[1/3] Checking device..." -ForegroundColor Yellow
$devices = & $adbCmd devices | Select-Object -Skip 1 | Where-Object { $_ -match "device$" }
if ($devices.Count -eq 0) {
    Write-Host "ERROR: No device connected" -ForegroundColor Red
    exit 1
}
Write-Host "[OK] Device connected" -ForegroundColor Green

# Enable WebView debugging
Write-Host ""
Write-Host "[2/3] Enabling WebView debugging..." -ForegroundColor Yellow
& $adbCmd shell "setprop debug.webview.provider com.google.android.webview" 2>$null
& $adbCmd shell "setprop debug.webview.tracing 1" 2>$null
Write-Host "[OK] WebView debugging enabled" -ForegroundColor Green

# Clear logs
Write-Host ""
Write-Host "[3/3] Clearing logs and starting monitor..." -ForegroundColor Yellow
& $adbCmd logcat -c
Write-Host "[OK] Logs cleared" -ForegroundColor Green

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Monitoring Started" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Now follow these steps on your phone:" -ForegroundColor Yellow
Write-Host ""
Write-Host "1. Open the app" -ForegroundColor White
Write-Host "2. Login with:" -ForegroundColor White
Write-Host "   Email: arunkumar.kn1997@gmail.com" -ForegroundColor Cyan
Write-Host "   Password: arun143122" -ForegroundColor Cyan
Write-Host "3. Create a new order" -ForegroundColor White
Write-Host "4. Go to Orders page" -ForegroundColor White
Write-Host "5. Click the PDF download button" -ForegroundColor White
Write-Host ""
Write-Host "I'm monitoring logs now..." -ForegroundColor Green
Write-Host "Press Ctrl+C to stop monitoring" -ForegroundColor Gray
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Keywords to monitor
$pdfKeywords = @(
    "\[PDF\]",
    "pdf",
    "jspdf",
    "blob",
    "download",
    "forceDownload",
    "savePdfBlob",
    "downloadOrdersPdf",
    "downloadOrderPdf"
)

$errorKeywords = @(
    "error",
    "exception",
    "failed",
    "fatal",
    "crash",
    "uncaught",
    "undefined",
    "null",
    "cannot",
    "unable",
    "denied",
    "blocked"
)

$jsKeywords = @(
    "chromium",
    "webview",
    "console",
    "javascript",
    "v8"
)

$capacitorKeywords = @(
    "capacitor",
    "preferences",
    "filesystem"
)

# Collect logs
$logFile = "$env:TEMP\pdf-monitor-$(Get-Date -Format 'yyyyMMdd-HHmmss').txt"
$allLogs = @()

# Start monitoring
Write-Host "Collecting logs (will analyze after you test)..." -ForegroundColor Yellow
Write-Host ""

# Run logcat and capture output
$job = Start-Job -ScriptBlock {
    param($adbCmd)
    & $adbCmd logcat -v time 2>&1
} -ArgumentList $adbCmd

# Monitor for 2 minutes or until stopped
$startTime = Get-Date
$timeout = 120 # 2 minutes

try {
    while ($true) {
        $elapsed = (Get-Date) - $startTime
        if ($elapsed.TotalSeconds -gt $timeout) {
            Write-Host ""
            Write-Host "Timeout reached. Analyzing logs..." -ForegroundColor Yellow
            break
        }
        
        # Get new logs from job
        $newLogs = Receive-Job -Job $job -ErrorAction SilentlyContinue
        if ($newLogs) {
            foreach ($line in $newLogs) {
                if ($line) {
                    $allLogs += $line
                    
                    # Check if relevant
                    $isRelevant = $false
                    $color = "White"
                    
                    # PDF related
                    foreach ($keyword in $pdfKeywords) {
                        if ($line -match $keyword -and -not $isRelevant) {
                            $isRelevant = $true
                            $color = "Yellow"
                            break
                        }
                    }
                    
                    # Errors
                    foreach ($keyword in $errorKeywords) {
                        if ($line -match $keyword -and -not $isRelevant) {
                            $isRelevant = $true
                            $color = "Red"
                            break
                        }
                    }
                    
                    # JavaScript/Capacitor
                    foreach ($keyword in ($jsKeywords + $capacitorKeywords)) {
                        if ($line -match $keyword -and -not $isRelevant) {
                            $isRelevant = $true
                            $color = "Cyan"
                            break
                        }
                    }
                    
                    # Show relevant logs
                    if ($isRelevant) {
                        Write-Host $line -ForegroundColor $color
                    }
                }
            }
        }
        
        Start-Sleep -Milliseconds 500
        
        # Show progress
        if ([int]$elapsed.TotalSeconds % 10 -eq 0 -and $elapsed.TotalSeconds -gt 0) {
            Write-Host "`rMonitoring... $([int]$elapsed.TotalSeconds)s elapsed" -NoNewline -ForegroundColor Gray
        }
    }
} finally {
    Stop-Job -Job $job -ErrorAction SilentlyContinue
    Remove-Job -Job $job -ErrorAction SilentlyContinue
    
    # Save all logs
    $allLogs | Out-File -FilePath $logFile -Encoding UTF8
}

Write-Host ""
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Analysis Results" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Analyze logs
$pdfLogs = $allLogs | Select-String -Pattern ($pdfKeywords -join "|") -CaseSensitive:$false
$errorLogs = $allLogs | Select-String -Pattern ($errorKeywords -join "|") -CaseSensitive:$false | Where-Object { $_ -match "saree|capacitor|webview|chromium|pdf" -CaseSensitive:$false }
$jsLogs = $allLogs | Select-String -Pattern ($jsKeywords -join "|") -CaseSensitive:$false | Where-Object { $_ -match "error|exception|failed" -CaseSensitive:$false }

Write-Host "[PDF Activity]" -ForegroundColor Yellow
if ($pdfLogs) {
    Write-Host "Found $($pdfLogs.Count) PDF-related log entries:" -ForegroundColor Green
    $pdfLogs | Select-Object -First 20 | ForEach-Object {
        Write-Host "  $_" -ForegroundColor Gray
    }
} else {
    Write-Host "WARNING: No PDF-related logs found!" -ForegroundColor Red
    Write-Host "  This suggests:" -ForegroundColor Yellow
    Write-Host "    - PDF button click didn't trigger JavaScript" -ForegroundColor White
    Write-Host "    - JavaScript errors prevented execution" -ForegroundColor White
    Write-Host "    - WebView console logs not accessible via logcat" -ForegroundColor White
}

Write-Host ""
Write-Host "[Errors Found]" -ForegroundColor Yellow
if ($errorLogs) {
    Write-Host "Found $($errorLogs.Count) error entries:" -ForegroundColor Red
    $errorLogs | Select-Object -First 20 | ForEach-Object {
        Write-Host "  $_" -ForegroundColor Red
    }
} else {
    Write-Host "No obvious errors in native logs" -ForegroundColor Green
    Write-Host "  (JavaScript errors may be in WebView console only)" -ForegroundColor Gray
}

Write-Host ""
Write-Host "[JavaScript/WebView Issues]" -ForegroundColor Yellow
if ($jsLogs) {
    Write-Host "Found $($jsLogs.Count) JS/WebView related issues:" -ForegroundColor Red
    $jsLogs | Select-Object -First 10 | ForEach-Object {
        Write-Host "  $_" -ForegroundColor Red
    }
} else {
    Write-Host "No JS/WebView errors in native logs" -ForegroundColor Green
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Recommendations" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

if (-not $pdfLogs) {
    Write-Host "ISSUE: PDF JavaScript code not executing" -ForegroundColor Red
    Write-Host ""
    Write-Host "To debug further:" -ForegroundColor Yellow
    Write-Host "1. Enable WebView debugging:" -ForegroundColor White
    Write-Host "   npm run debug:webview" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "2. Open Chrome DevTools:" -ForegroundColor White
    Write-Host "   - Go to: chrome://inspect" -ForegroundColor Cyan
    Write-Host "   - Click 'inspect' on com.sareeorder.app" -ForegroundColor White
    Write-Host "   - Check Console tab for [PDF] logs" -ForegroundColor White
    Write-Host ""
    Write-Host "3. Check for JavaScript errors in Console" -ForegroundColor White
    Write-Host "4. Verify PDF button click is registered" -ForegroundColor White
    Write-Host "5. Check Network tab for any failed requests" -ForegroundColor White
} else {
    Write-Host "PDF code is executing. Check errors above for specific issues." -ForegroundColor Green
}

Write-Host ""
Write-Host "Full logs saved to: $logFile" -ForegroundColor Gray
Write-Host ""
