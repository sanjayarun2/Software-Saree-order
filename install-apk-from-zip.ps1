param(
    # Path to the ZIP file downloaded from GitHub Actions.
    # If not provided, defaults to build-apk.zip in your Downloads folder.
    [string]$ZipPath = "$env:USERPROFILE\Downloads\build-apk.zip"
)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Install APK from ZIP (GitHub)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

if (-not (Test-Path $ZipPath)) {
    Write-Host "ERROR: ZIP file not found at:" -ForegroundColor Red
    Write-Host "       $ZipPath" -ForegroundColor Red
    Write-Host ""
    Write-Host "Tip: Pass the ZIP path explicitly, for example:" -ForegroundColor Yellow
    Write-Host "  .\install-apk-from-zip.ps1 -ZipPath 'C:\Users\YOURNAME\Downloads\build-apk.zip'" -ForegroundColor Yellow
    exit 1
}

$ZipPath = (Resolve-Path $ZipPath).Path
Write-Host "[1/5] Using ZIP file:" -ForegroundColor Yellow
Write-Host "      $ZipPath" -ForegroundColor Gray

# Create extract folder next to the ZIP
$zipDir  = Split-Path $ZipPath -Parent
$zipName = [IO.Path]::GetFileNameWithoutExtension($ZipPath)
$extract = Join-Path $zipDir "$zipName-extracted"

if (Test-Path $extract) {
    Write-Host "[2/5] Cleaning previous extract folder..." -ForegroundColor Yellow
    Remove-Item -Recurse -Force $extract
}

Write-Host "[2/5] Extracting ZIP to: $extract" -ForegroundColor Yellow
New-Item -ItemType Directory -Path $extract | Out-Null
Expand-Archive -Path $ZipPath -DestinationPath $extract -Force

# Find first APK
Write-Host "[3/5] Searching for APK inside extracted folder..." -ForegroundColor Yellow
$apk = Get-ChildItem -Path $extract -Recurse -Filter *.apk -ErrorAction SilentlyContinue | Select-Object -First 1

if (-not $apk) {
    Write-Host "ERROR: No .apk file found inside ZIP." -ForegroundColor Red
    Write-Host "       Check the extracted folder manually: $extract" -ForegroundColor Red
    exit 1
}

$apkPath = $apk.FullName
Write-Host "[OK] Found APK:" -ForegroundColor Green
Write-Host "     $apkPath" -ForegroundColor Gray

# Check / locate ADB (similar to build-and-install.ps1)
Write-Host "[4/5] Checking adb..." -ForegroundColor Yellow
$adbCmd = "adb"
$adbPath = Get-Command adb -ErrorAction SilentlyContinue

if (-not $adbPath) {
    Write-Host "adb not in PATH, searching common locations..." -ForegroundColor Yellow
    $searchPaths = @(
        "$env:USERPROFILE\Downloads\platform-tools\adb.exe",
        "$env:USERPROFILE\Downloads\platform-tools\platform-tools\adb.exe",
        "$env:USERPROFILE\Downloads\adb.exe",
        "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe",
        "$env:ProgramFiles\Android\android-sdk\platform-tools\adb.exe",
        "$env:USERPROFILE\AppData\Local\Android\Sdk\platform-tools\adb.exe"
    )

    $foundAdb = $null
    foreach ($path in $searchPaths) {
        if (Test-Path $path) {
            $foundAdb = $path
            break
        }
    }

    if (-not $foundAdb) {
        Write-Host "ERROR: 'adb' not found." -ForegroundColor Red
        Write-Host " - Please extract Android platform-tools to one of these locations:" -ForegroundColor Red
        Write-Host "   $env:USERPROFILE\Downloads\platform-tools" -ForegroundColor Red
        Write-Host "   $env:LOCALAPPDATA\Android\Sdk\platform-tools" -ForegroundColor Red
        Write-Host " - Or add adb.exe to your PATH." -ForegroundColor Red
        exit 1
    }

    $adbCmd = $foundAdb
    $adbDir = Split-Path $foundAdb -Parent
    Write-Host "[OK] Found adb at: $foundAdb" -ForegroundColor Green
    Write-Host "Temporarily adding to PATH for this session: $adbDir" -ForegroundColor Yellow
    $env:PATH = "$adbDir;$env:PATH"
} else {
    Write-Host "[OK] adb found in PATH" -ForegroundColor Green
}

# Check device
Write-Host "Checking connected devices..." -ForegroundColor Yellow
$devices = & $adbCmd devices | Select-String "device`$"
if (-not $devices) {
    Write-Host "ERROR: No Android device detected." -ForegroundColor Red
    Write-Host " - Check USB cable" -ForegroundColor Red
    Write-Host " - Enable USB debugging on the phone" -ForegroundColor Red
    exit 1
}
Write-Host "[OK] Device connected." -ForegroundColor Green

# Always uninstall existing app first, then install fresh
Write-Host "[5/5] Uninstalling existing com.sareeorder.app (if present)..." -ForegroundColor Yellow
& $adbCmd uninstall com.sareeorder.app 2>$null | Out-Null
Write-Host "[OK] Old app uninstalled (or not present)" -ForegroundColor Green

Write-Host "[5/5] Installing APK to device (fresh install)..." -ForegroundColor Yellow
& $adbCmd install "$apkPath"
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: adb install failed." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  APK installed successfully!" -ForegroundColor Green
Write-Host "  You can now open the Saree Order App" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan

