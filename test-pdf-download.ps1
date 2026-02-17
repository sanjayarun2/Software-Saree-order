# PDF Download Testing & Debugging Script
# This script helps debug PDF download issues in the Saree Order App

param(
    [switch]$Watch = $true,
    [switch]$Clear = $false,
    [switch]$Test = $false
)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  PDF Download Debug Tool" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Find ADB
$adbCmd = "adb"
$adbPath = Get-Command adb -ErrorAction SilentlyContinue

if (-not $adbPath) {
    $searchPaths = @(
        "$env:USERPROFILE\Downloads\platform-tools\adb.exe",
        "$env:USERPROFILE\Downloads\platform-tools\platform-tools\adb.exe",
        "$env:USERPROFILE\Downloads\adb.exe",
        "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
    )
    
    $foundAdb = $null
    foreach ($path in $searchPaths) {
        if (Test-Path $path) {
            $foundAdb = $path
            break
        }
    }
    
    if ($foundAdb) {
        $adbCmd = $foundAdb
        $env:PATH = "$(Split-Path $foundAdb -Parent);$env:PATH"
    } else {
        Write-Host "ERROR: ADB not found." -ForegroundColor Red
        exit 1
    }
}

# Check device
Write-Host "[1/4] Checking device..." -ForegroundColor Yellow
$devices = & $adbCmd devices | Select-Object -Skip 1 | Where-Object { $_ -match "device$" }
if ($devices.Count -eq 0) {
    Write-Host "ERROR: No Android device found." -ForegroundColor Red
    exit 1
}
Write-Host "[OK] Device connected" -ForegroundColor Green

# Clear logs if requested
if ($Clear) {
    Write-Host ""
    Write-Host "[2/4] Clearing logcat buffer..." -ForegroundColor Yellow
    & $adbCmd logcat -c
    Write-Host "[OK] Logs cleared" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "[2/4] Skipping log clear (use -Clear to clear logs)" -ForegroundColor Gray
}

# Enable WebView debugging
Write-Host ""
Write-Host "[3/4] Enabling WebView debugging..." -ForegroundColor Yellow
& $adbCmd shell "setprop debug.webview.provider com.google.android.webview" 2>$null
& $adbCmd shell "setprop debug.webview.tracing 1" 2>$null
Write-Host "[OK] WebView debugging enabled" -ForegroundColor Green

# Instructions
Write-Host ""
Write-Host "[4/4] Starting PDF download monitor..." -ForegroundColor Yellow
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  PDF Download Test Instructions" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Open the app on your phone" -ForegroundColor White
Write-Host "2. Navigate to Orders page" -ForegroundColor White
Write-Host "3. Filter some orders (or use existing filtered list)" -ForegroundColor White
Write-Host "4. Click the PDF download button" -ForegroundColor White
Write-Host "5. Watch the logs below for errors" -ForegroundColor White
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Monitoring Logs (Press Ctrl+C to stop)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Filtering for PDF-related logs..." -ForegroundColor Yellow
Write-Host ""

# Keywords to search for in logs
$pdfKeywords = @(
    "pdf",
    "jspdf",
    "blob",
    "download",
    "chromium",
    "webview",
    "download.*apk",
    "file.*download",
    "save.*pdf",
    "generate.*pdf",
    "\[PDF\]",
    "forceDownload",
    "savePdfBlob",
    "downloadOrdersPdf",
    "downloadOrderPdf"
)

# Error keywords
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
    "unable"
)

# Start monitoring
$filterPattern = ($pdfKeywords + $errorKeywords) -join "|"

if ($Watch) {
    Write-Host "Watching for PDF download activity..." -ForegroundColor Green
    Write-Host ""
    
    # Monitor logs with filtering
    & $adbCmd logcat -v time | ForEach-Object {
        $line = $_
        
        # Check if line contains PDF-related keywords
        $isPdfRelated = $pdfKeywords | ForEach-Object {
            if ($line -match $_) { return $true }
        }
        
        # Check if line contains errors
        $isError = $errorKeywords | ForEach-Object {
            if ($line -match $_) { return $true }
        }
        
        # Display relevant lines
        if ($isPdfRelated -or $isError) {
            if ($isError) {
                Write-Host $line -ForegroundColor Red
            } elseif ($isPdfRelated) {
                Write-Host $line -ForegroundColor Yellow
            } else {
                Write-Host $line -ForegroundColor White
            }
        }
    }
} else {
    Write-Host "Use -Watch to monitor logs in real-time" -ForegroundColor Yellow
}
