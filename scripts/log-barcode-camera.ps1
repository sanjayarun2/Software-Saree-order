# ADB log script for barcode scanner / camera / permission debugging
# Run: powershell -ExecutionPolicy Bypass -File scripts\log-barcode-camera.ps1
# Then open the app, tap Scan, and watch the output.

$ErrorActionPreference = "Stop"
$logDir = "logs"
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$logFile = Join-Path $logDir "barcode-camera-$timestamp.log"

if (-not (Get-Command adb -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: adb not found. Add Android SDK platform-tools to PATH." -ForegroundColor Red
    exit 1
}

$list = adb devices 2>&1 | Out-String
if (-not ($list -match "device\s*$")) {
    Write-Host "ERROR: No device/emulator found. Run: adb devices" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }

Write-Host "Clearing logcat..." -ForegroundColor Cyan
adb logcat -c

# Log tags: Capacitor, plugin, camera, permission, ML Kit, WebView/Chromium (for JS errors)
$filter = "Capacitor:V Capacitor/Plugin:V BarcodeScanner:V capawesome:V Camera:V Permission:V ActivityManager:I AndroidRuntime:E System.err:V chromium:V Console:V *:S"
# Simpler: capture everything from our app process and key system tags
$pid = adb shell "pidof com.sareeorder.app" 2>$null
if ($pid) { Write-Host "App PID: $pid" -ForegroundColor Green }

Write-Host "Logging to: $logFile" -ForegroundColor Green
Write-Host "Open the app -> Orders -> Dispatch -> tap barcode icon. Watch for permission/camera lines." -ForegroundColor Yellow
Write-Host "Press Ctrl+C to stop." -ForegroundColor Yellow
Write-Host ""

# Full logcat (no tag filter) so we don't miss anything; we'll grep in real time
adb logcat -v time 2>&1 | ForEach-Object {
    $line = $_
    $lower = $line.ToLower()
    # Only show lines that might be relevant
    $relevant = $lower -match "capacitor|barcode|scanner|plugin|camera|permission|mlkit|capawesome|com\.sareeorder|denied|exception|error|not available|startscan|stopscan"
    if ($relevant) {
        if ($line -match "FATAL|Exception|Error|denied|not available") {
            Write-Host $line -ForegroundColor Red
        } elseif ($line -match "BarcodeScanner|startScan|stopScan|Permission|Camera") {
            Write-Host $line -ForegroundColor Cyan
        } else {
            Write-Host $line
        }
        Add-Content -Path $logFile -Value $line -ErrorAction SilentlyContinue
    }
}
