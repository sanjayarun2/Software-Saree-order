# One-shot ADB log dump for debugging (run while reproducing: open app -> tap Scan)
# Run: .\scripts\dump-logs.ps1
# Then open app, tap barcode scan, wait 5 sec, script saves and exits.

$logDir = "logs"
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$rawFile = Join-Path $logDir "adb-raw-$timestamp.log"

if (-not (Get-Command adb -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: adb not found." -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }

Write-Host "Clearing logcat..." -ForegroundColor Cyan
adb logcat -c

Write-Host "Reproduce the issue now: open app -> Orders -> tap Scan on an order." -ForegroundColor Yellow
Write-Host "Waiting 15 seconds to capture logs..." -ForegroundColor Yellow
Start-Sleep -Seconds 15

Write-Host "Dumping logcat to $rawFile ..." -ForegroundColor Cyan
adb logcat -d -v time > $rawFile

Write-Host "Done. Open $rawFile and search for: Camera, Permission, BarcodeScanner, Capacitor, Exception, denied" -ForegroundColor Green
