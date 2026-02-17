# Debug Script for Saree Order App
# This script helps debug the Android app using ADB logcat

param(
    [switch]$Clear = $false,
    [switch]$Filter = $true,
    [switch]$Watch = $true,
    [string]$SearchTerm = "saree"
)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Saree Order App - Debug Tool" -ForegroundColor Cyan
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
Write-Host "[1/3] Checking device..." -ForegroundColor Yellow
$devices = & $adbCmd devices | Select-Object -Skip 1 | Where-Object { $_ -match "device$" }
if ($devices.Count -eq 0) {
    Write-Host "ERROR: No Android device found." -ForegroundColor Red
    Write-Host "Please connect your phone via USB and enable USB Debugging." -ForegroundColor Yellow
    exit 1
}
Write-Host "[OK] Device connected" -ForegroundColor Green

# Clear logs if requested
if ($Clear) {
    Write-Host ""
    Write-Host "[2/3] Clearing logcat buffer..." -ForegroundColor Yellow
    & $adbCmd logcat -c
    Write-Host "[OK] Logs cleared" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "[2/3] Skipping log clear (use -Clear to clear logs)" -ForegroundColor Gray
}

# Start logcat
Write-Host ""
Write-Host "[3/3] Starting logcat..." -ForegroundColor Yellow
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Live Logs (Press Ctrl+C to stop)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

if ($Filter) {
    Write-Host "Filtering for: '$SearchTerm' (case-insensitive)" -ForegroundColor Yellow
    Write-Host "To see all logs, run: .\debug-app.ps1 -Filter:`$false" -ForegroundColor Gray
    Write-Host ""
    
    # Filtered logcat
    & $adbCmd logcat | Select-String -Pattern $SearchTerm -CaseSensitive:$false
} else {
    Write-Host "Showing all logs..." -ForegroundColor Yellow
    Write-Host ""
    
    # Full logcat
    & $adbCmd logcat
}
