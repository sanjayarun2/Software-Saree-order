# Automated APK Build and Install Script
# This script builds the APK and installs it on a connected Android device

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  APK Build & Install Automation" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Check if ADB is available
Write-Host "[1/6] Checking ADB..." -ForegroundColor Yellow
$adbCmd = "adb"
$adbPath = Get-Command adb -ErrorAction SilentlyContinue

# If not in PATH, search common locations
if (-not $adbPath) {
    Write-Host "ADB not in PATH, searching common locations..." -ForegroundColor Yellow
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
            Write-Host "Found ADB at: $path" -ForegroundColor Green
            break
        }
    }
    
    if ($foundAdb) {
        $adbCmd = $foundAdb
        # Add to PATH for this session
        $env:PATH = "$(Split-Path $foundAdb -Parent);$env:PATH"
    } else {
        Write-Host "ERROR: ADB not found." -ForegroundColor Red
        Write-Host "Please:" -ForegroundColor Yellow
        Write-Host "  1. Extract platform-tools.zip from Downloads" -ForegroundColor Yellow
        Write-Host "  2. Or add platform-tools folder to PATH" -ForegroundColor Yellow
        Write-Host "  3. Or place adb.exe in Downloads folder" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "Searching in: $env:USERPROFILE\Downloads" -ForegroundColor Cyan
        exit 1
    }
} else {
    Write-Host "[OK] ADB found in PATH" -ForegroundColor Green
}

# Step 2: Check for connected device
Write-Host ""
Write-Host "[2/6] Checking for connected device..." -ForegroundColor Yellow
$devices = & $adbCmd devices | Select-Object -Skip 1 | Where-Object { $_ -match "device$" }
if ($devices.Count -eq 0) {
    Write-Host "ERROR: No Android device found." -ForegroundColor Red
    Write-Host "Please:" -ForegroundColor Yellow
    Write-Host "  1. Connect your phone via USB" -ForegroundColor Yellow
    Write-Host "  2. Enable USB Debugging in Developer Options" -ForegroundColor Yellow
    Write-Host "  3. Accept the USB debugging prompt on your phone" -ForegroundColor Yellow
    exit 1
}
Write-Host "[OK] Device found: $($devices[0])" -ForegroundColor Green

# Step 3: Check Java
Write-Host ""
Write-Host "[3/6] Checking Java..." -ForegroundColor Yellow
$javaHome = $env:JAVA_HOME
if (-not $javaHome) {
    Write-Host "WARNING: JAVA_HOME not set." -ForegroundColor Yellow
    Write-Host "Attempting to find Java..." -ForegroundColor Yellow
    $javaCmd = Get-Command java -ErrorAction SilentlyContinue
    if (-not $javaCmd) {
        Write-Host "ERROR: Java 17 JDK not found." -ForegroundColor Red
        Write-Host ""
        Write-Host "Please install Java 17 JDK:" -ForegroundColor Yellow
        Write-Host "  1. Download from: https://adoptium.net/temurin/releases/?version=17" -ForegroundColor Cyan
        Write-Host "  2. Choose: Windows x64 -> JDK -> .msi installer" -ForegroundColor White
        Write-Host "  3. During installation, check 'Set JAVA_HOME variable'" -ForegroundColor White
        Write-Host "  4. Restart PowerShell and run this script again" -ForegroundColor White
        Write-Host ""
        Write-Host "Alternative: Microsoft OpenJDK 17" -ForegroundColor Yellow
        Write-Host "  https://learn.microsoft.com/en-us/java/openjdk/download#openjdk-17" -ForegroundColor Cyan
        exit 1
    }
    Write-Host "[OK] Java found in PATH" -ForegroundColor Green
} else {
    Write-Host "[OK] JAVA_HOME set: $javaHome" -ForegroundColor Green
}

# Step 4: Install dependencies
Write-Host ""
Write-Host "[4/6] Installing npm dependencies..." -ForegroundColor Yellow
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: npm install failed" -ForegroundColor Red
    exit 1
}
Write-Host "[OK] Dependencies installed" -ForegroundColor Green

# Step 5: Build APK
Write-Host ""
Write-Host "[5/6] Building APK (this may take a few minutes)..." -ForegroundColor Yellow
npm run apk
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: APK build failed" -ForegroundColor Red
    exit 1
}
Write-Host "[OK] APK built successfully" -ForegroundColor Green

# Step 6: Install APK
Write-Host ""
Write-Host "[6/6] Installing APK on device..." -ForegroundColor Yellow
$apkPath = "android\app\build\outputs\apk\debug\app-debug.apk"
if (-not (Test-Path $apkPath)) {
    Write-Host "ERROR: APK file not found at: $apkPath" -ForegroundColor Red
    exit 1
}

& $adbCmd install -r $apkPath
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: APK installation failed" -ForegroundColor Red
    Write-Host "Try manually: $adbCmd install -r $apkPath" -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  SUCCESS! APK installed on device" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "The app should now be available on your phone." -ForegroundColor Cyan
Write-Host "You can launch it from the app drawer." -ForegroundColor Cyan
