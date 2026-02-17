# Quick Debug Commands for Saree Order App
# Run individual commands for specific debugging tasks

param(
    [Parameter(Mandatory=$true)]
    [ValidateSet("logs", "clear", "errors", "crash", "package", "info", "help")]
    [string]$Command
)

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

function Show-Logs {
    Write-Host "Showing filtered logs (saree order app)..." -ForegroundColor Cyan
    Write-Host "Press Ctrl+C to stop" -ForegroundColor Yellow
    Write-Host ""
    & $adbCmd logcat | Select-String -Pattern "saree|capacitor|webview|chromium" -CaseSensitive:$false
}

function Clear-Logs {
    Write-Host "Clearing logcat buffer..." -ForegroundColor Yellow
    & $adbCmd logcat -c
    Write-Host "[OK] Logs cleared" -ForegroundColor Green
}

function Show-Errors {
    Write-Host "Showing errors and warnings..." -ForegroundColor Cyan
    Write-Host ""
    & $adbCmd logcat *:E *:W | Select-String -Pattern "saree|capacitor" -CaseSensitive:$false
}

function Show-Crash {
    Write-Host "Checking for crash logs..." -ForegroundColor Cyan
    Write-Host ""
    & $adbCmd logcat | Select-String -Pattern "FATAL|AndroidRuntime|crash" -CaseSensitive:$false
}

function Show-PackageInfo {
    Write-Host "App package information..." -ForegroundColor Cyan
    Write-Host ""
    & $adbCmd shell dumpsys package com.sareeorder.app | Select-String -Pattern "versionName|versionCode|enabled" -CaseSensitive:$false
}

function Show-DeviceInfo {
    Write-Host "Device information..." -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Device Model:" -ForegroundColor Yellow
    & $adbCmd shell getprop ro.product.model
    Write-Host ""
    Write-Host "Android Version:" -ForegroundColor Yellow
    & $adbCmd shell getprop ro.build.version.release
    Write-Host ""
    Write-Host "API Level:" -ForegroundColor Yellow
    & $adbCmd shell getprop ro.build.version.sdk
}

function Show-Help {
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "  Debug Commands Help" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Usage: .\debug-commands.ps1 <command>" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Commands:" -ForegroundColor Cyan
    Write-Host "  logs     - Show filtered logs (saree app)" -ForegroundColor White
    Write-Host "  clear    - Clear logcat buffer" -ForegroundColor White
    Write-Host "  errors   - Show only errors and warnings" -ForegroundColor White
    Write-Host "  crash    - Check for crash logs" -ForegroundColor White
    Write-Host "  package  - Show app package info" -ForegroundColor White
    Write-Host "  info     - Show device information" -ForegroundColor White
    Write-Host "  help     - Show this help message" -ForegroundColor White
    Write-Host ""
    Write-Host "Examples:" -ForegroundColor Cyan
    Write-Host "  .\debug-commands.ps1 logs" -ForegroundColor Gray
    Write-Host "  .\debug-commands.ps1 errors" -ForegroundColor Gray
    Write-Host "  .\debug-commands.ps1 clear" -ForegroundColor Gray
    Write-Host ""
}

switch ($Command) {
    "logs" { Show-Logs }
    "clear" { Clear-Logs }
    "errors" { Show-Errors }
    "crash" { Show-Crash }
    "package" { Show-PackageInfo }
    "info" { Show-DeviceInfo }
    "help" { Show-Help }
}
