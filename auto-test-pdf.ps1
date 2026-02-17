# Automated PDF Download Test Script
# Downloads APK from GitHub, installs it, and monitors testing

param(
    [string]$GitHubRepo = "",
    [string]$GitHubToken = ""
)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Automated PDF Download Test" -ForegroundColor Cyan
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
Write-Host "[STEP 1/6] Checking device..." -ForegroundColor Yellow
$devices = & $adbCmd devices | Select-Object -Skip 1 | Where-Object { $_ -match "device$" }
if ($devices.Count -eq 0) {
    Write-Host "ERROR: No device connected" -ForegroundColor Red
    exit 1
}
Write-Host "[OK] Device connected: $($devices[0])" -ForegroundColor Green

# Check if APK exists in Downloads
Write-Host ""
Write-Host "[STEP 2/6] Checking for APK file..." -ForegroundColor Yellow
$apkPath = "$env:USERPROFILE\Downloads\app-debug.apk"
$apkZip = Get-ChildItem -Path "$env:USERPROFILE\Downloads" -Filter "*saree-order*.zip" -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1

if (-not (Test-Path $apkPath) -and -not $apkZip) {
    Write-Host "[INFO] APK not found in Downloads" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Please download APK from GitHub Actions:" -ForegroundColor Cyan
    Write-Host "  1. Go to your GitHub repo → Actions tab" -ForegroundColor White
    Write-Host "  2. Open latest successful workflow run" -ForegroundColor White
    Write-Host "  3. Download 'saree-order-book-apk' artifact" -ForegroundColor White
    Write-Host "  4. Extract app-debug.apk to Downloads folder" -ForegroundColor White
    Write-Host "  5. Or place the ZIP file in Downloads folder" -ForegroundColor White
    Write-Host ""
    Write-Host "Press ENTER after downloading APK..." -ForegroundColor Yellow
    $null = Read-Host
    
    # Check again
    $apkPath = "$env:USERPROFILE\Downloads\app-debug.apk"
    $apkZip = Get-ChildItem -Path "$env:USERPROFILE\Downloads" -Filter "*saree-order*.zip" -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
}

# Extract APK from ZIP if needed
if ($apkZip -and -not (Test-Path $apkPath)) {
    Write-Host "[INFO] Found ZIP file, extracting..." -ForegroundColor Yellow
    $extractPath = "$env:USERPROFILE\Downloads\apk-extract"
    Expand-Archive -Path $apkZip.FullName -DestinationPath $extractPath -Force
    $extractedApk = Get-ChildItem -Path $extractPath -Filter "*.apk" -Recurse | Select-Object -First 1
    if ($extractedApk) {
        Copy-Item $extractedApk.FullName -Destination $apkPath -Force
        Write-Host "[OK] APK extracted" -ForegroundColor Green
    }
}

if (-not (Test-Path $apkPath)) {
    Write-Host "ERROR: APK file not found at: $apkPath" -ForegroundColor Red
    exit 1
}

Write-Host "[OK] APK found: $apkPath" -ForegroundColor Green

# Uninstall old app first (if exists)
Write-Host ""
Write-Host "[STEP 3/6] Uninstalling old app (if exists)..." -ForegroundColor Yellow
& $adbCmd uninstall com.sareeorder.app 2>$null
Write-Host "[OK] Old app uninstalled (if it existed)" -ForegroundColor Green

# Install APK
Write-Host ""
Write-Host "[STEP 4/6] Installing APK..." -ForegroundColor Yellow
& $adbCmd install $apkPath
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Installation failed" -ForegroundColor Red
    Write-Host "Trying with -r flag..." -ForegroundColor Yellow
    & $adbCmd install -r $apkPath
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Installation failed even with -r flag" -ForegroundColor Red
        exit 1
    }
}
Write-Host "[OK] APK installed successfully" -ForegroundColor Green

# Enable WebView debugging
Write-Host ""
Write-Host "[STEP 5/6] Enabling WebView debugging..." -ForegroundColor Yellow
& $adbCmd shell "setprop debug.webview.provider com.google.android.webview" 2>$null
& $adbCmd shell "setprop debug.webview.tracing 1" 2>$null
Write-Host "[OK] WebView debugging enabled" -ForegroundColor Green

# Clear logs
Write-Host ""
Write-Host "[STEP 6/6] Preparing log monitoring..." -ForegroundColor Yellow
& $adbCmd logcat -c
Write-Host "[OK] Logs cleared" -ForegroundColor Green

# Start monitoring
Write-Host ""
Write-Host "Starting monitoring..." -ForegroundColor Yellow
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Testing Instructions" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Now follow these steps on your phone:" -ForegroundColor Yellow
Write-Host ""
Write-Host "1. Open the Saree Order App" -ForegroundColor White
Write-Host "2. Login:" -ForegroundColor White
Write-Host "   Email: arunkumar.kn1997@gmail.com" -ForegroundColor Cyan
Write-Host "   Password: arun143122" -ForegroundColor Cyan
Write-Host "3. Create a NEW order:" -ForegroundColor White
Write-Host "   - Fill all required fields" -ForegroundColor Gray
Write-Host "   - Save the order" -ForegroundColor Gray
Write-Host "4. Go to Orders page" -ForegroundColor White
Write-Host "5. Make sure your order is visible" -ForegroundColor White
Write-Host "6. Click the PDF download button (bottom right)" -ForegroundColor White
Write-Host ""
Write-Host "I'm monitoring logs now..." -ForegroundColor Green
Write-Host "Press Ctrl+C when you've finished testing" -ForegroundColor Gray
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Monitor logs
$logFile = "$env:TEMP\pdf-auto-test-$(Get-Date -Format 'yyyyMMdd-HHmmss').txt"
$allLogs = @()

# Keywords to monitor
$pdfKeywords = @("\[PDF\]", "pdf", "jspdf", "blob", "download", "capacitor.*filesystem", "filesystem.*write", "writefile")
$errorKeywords = @("error", "exception", "failed", "fatal", "crash", "uncaught")
$successKeywords = @("saved successfully", "file saved", "writefile.*success", "uri.*documents")

Write-Host "Monitoring logs (will analyze when you stop)..."
Write-Host ""

# Start logcat job
$job = Start-Job -ScriptBlock {
    param($adbCmd)
    & $adbCmd logcat -v time 2>&1
} -ArgumentList $adbCmd

$startTime = Get-Date

try {
    while ($true) {
        $newLogs = Receive-Job -Job $job -ErrorAction SilentlyContinue
        if ($newLogs) {
            foreach ($line in $newLogs) {
                if ($line) {
                    $allLogs += $line
                    
                    # Show relevant logs in real-time
                    $isRelevant = $false
                    $color = "White"
                    
                    if ($line -match "\[PDF\]") {
                        $isRelevant = $true
                        $color = "Yellow"
                    }
                    if ($line -match "capacitor|filesystem") {
                        $isRelevant = $true
                        $color = "Cyan"
                    }
                    if ($line -match ($errorKeywords -join "|")) {
                        $isRelevant = $true
                        $color = "Red"
                    }
                    if ($line -match ($successKeywords -join "|")) {
                        $isRelevant = $true
                        $color = "Green"
                    }
                    
                    if ($isRelevant) {
                        Write-Host $line -ForegroundColor $color
                    }
                }
            }
        }
        Start-Sleep -Milliseconds 500
    }
} finally {
    Stop-Job -Job $job -ErrorAction SilentlyContinue
    Remove-Job -Job $job -ErrorAction SilentlyContinue
    
    # Save logs
    $allLogs | Out-File -FilePath $logFile -Encoding UTF8
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Analysis Results" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Analyze logs
$pdfLogs = $allLogs | Select-String -Pattern ($pdfKeywords -join "|") -CaseSensitive:$false
$errorLogs = $allLogs | Select-String -Pattern ($errorKeywords -join "|") | Select-String -Pattern "saree|capacitor|webview|pdf"
$successLogs = $allLogs | Select-String -Pattern ($successKeywords -join "|") -CaseSensitive:$false
$capacitorLogs = $allLogs | Select-String -Pattern "capacitor.*filesystem|filesystem.*write" -CaseSensitive:$false

Write-Host "[PDF Activity]" -ForegroundColor Yellow
if ($pdfLogs) {
    Write-Host "Found $($pdfLogs.Count) PDF-related entries" -ForegroundColor Green
    $pdfLogs | Select-Object -First 10 | ForEach-Object {
        Write-Host "  $_" -ForegroundColor Gray
    }
} else {
    Write-Host "WARNING: No PDF-related logs found" -ForegroundColor Red
}

Write-Host ""
Write-Host "[Capacitor Filesystem]" -ForegroundColor Yellow
if ($capacitorLogs) {
    Write-Host "Found Capacitor Filesystem activity:" -ForegroundColor Green
    $capacitorLogs | ForEach-Object {
        Write-Host "  $_" -ForegroundColor Cyan
    }
} else {
    Write-Host "WARNING: No Capacitor Filesystem logs found" -ForegroundColor Yellow
    Write-Host "  This suggests the fix may not be active" -ForegroundColor White
}

Write-Host ""
Write-Host "[Success Indicators]" -ForegroundColor Yellow
if ($successLogs) {
    Write-Host "Found success indicators:" -ForegroundColor Green
    $successLogs | ForEach-Object {
        Write-Host "  $_" -ForegroundColor Green
    }
} else {
    Write-Host "No success indicators found" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "[Errors]" -ForegroundColor Yellow
if ($errorLogs) {
    Write-Host "Found errors:" -ForegroundColor Red
    $errorLogs | Select-Object -First 5 | ForEach-Object {
        Write-Host "  $_" -ForegroundColor Red
    }
} else {
    Write-Host "No errors found" -ForegroundColor Green
}

# Check device files
Write-Host ""
Write-Host "[Device Files Check]" -ForegroundColor Yellow
Write-Host "Checking Documents folder for PDF files..." -ForegroundColor White
$docFiles = & $adbCmd shell "ls /sdcard/Documents/*.pdf 2>/dev/null" 2>$null
if ($docFiles) {
    Write-Host "Found PDF files:" -ForegroundColor Green
    $docFiles | ForEach-Object {
        Write-Host "  $_" -ForegroundColor Green
    }
} else {
    Write-Host "No PDF files found in Documents folder" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Final Verdict" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

if ($capacitorLogs -and $successLogs) {
    Write-Host "[SUCCESS] PDF download fix is WORKING!" -ForegroundColor Green
    Write-Host "  - Capacitor Filesystem is being used" -ForegroundColor White
    Write-Host "  - File save operations detected" -ForegroundColor White
} elseif ($capacitorLogs) {
    Write-Host "[PARTIAL] Capacitor Filesystem detected but no success confirmation" -ForegroundColor Yellow
} elseif ($pdfLogs) {
    Write-Host "[ISSUE] PDF code executing but not using Capacitor Filesystem" -ForegroundColor Red
    Write-Host "  - App may need to be rebuilt" -ForegroundColor White
    Write-Host "  - Check if latest code is in the APK" -ForegroundColor White
} else {
    Write-Host "[ISSUE] PDF download not working" -ForegroundColor Red
    Write-Host "  - No PDF activity detected" -ForegroundColor White
    Write-Host "  - Check Chrome DevTools: chrome://inspect" -ForegroundColor White
}

Write-Host ""
Write-Host "Full logs saved to: $logFile" -ForegroundColor Gray
