# Download APK from GitHub Actions and Install on Device
# This script downloads the latest APK artifact from GitHub and installs it

param(
    [string]$GitHubRepo = "",  # e.g., "username/repo-name"
    [string]$GitHubToken = ""   # Optional: GitHub token for private repos
)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Download & Install APK from GitHub" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Check ADB
Write-Host "[1/4] Checking ADB..." -ForegroundColor Yellow
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
            Write-Host "Found ADB at: $path" -ForegroundColor Green
            break
        }
    }
    
    if ($foundAdb) {
        $adbCmd = $foundAdb
        $env:PATH = "$(Split-Path $foundAdb -Parent);$env:PATH"
    } else {
        Write-Host "ERROR: ADB not found." -ForegroundColor Red
        Write-Host "Please extract platform-tools to Downloads folder." -ForegroundColor Yellow
        exit 1
    }
} else {
    Write-Host "[OK] ADB found" -ForegroundColor Green
}

# Step 2: Check device
Write-Host ""
Write-Host "[2/4] Checking for connected device..." -ForegroundColor Yellow
$devices = & $adbCmd devices | Select-Object -Skip 1 | Where-Object { $_ -match "device$" }
if ($devices.Count -eq 0) {
    Write-Host "ERROR: No Android device found." -ForegroundColor Red
    Write-Host "Please connect your phone via USB and enable USB Debugging." -ForegroundColor Yellow
    exit 1
}
Write-Host "[OK] Device found" -ForegroundColor Green

# Step 3: Download APK
Write-Host ""
Write-Host "[3/4] Downloading APK from GitHub..." -ForegroundColor Yellow

# If no repo specified, prompt user
if (-not $GitHubRepo) {
    Write-Host ""
    Write-Host "Please provide your GitHub repository:" -ForegroundColor Yellow
    Write-Host "  Format: username/repo-name" -ForegroundColor Cyan
    Write-Host "  Example: sanjayarun2/Software-Saree-order" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "You can also:" -ForegroundColor Yellow
    Write-Host "  1. Manually download APK from GitHub Actions" -ForegroundColor White
    Write-Host "  2. Place it in Downloads folder as 'app-debug.apk'" -ForegroundColor White
    Write-Host "  3. Run this script again (it will auto-detect)" -ForegroundColor White
    Write-Host ""
    
    # Check if APK already exists in Downloads
    $existingApk = "$env:USERPROFILE\Downloads\app-debug.apk"
    if (Test-Path $existingApk) {
        Write-Host "[FOUND] Existing APK in Downloads: $existingApk" -ForegroundColor Green
        $apkPath = $existingApk
        Write-Host "[SKIP] Using existing APK" -ForegroundColor Green
    } else {
        Write-Host "Enter GitHub repo (or press Enter to use manual download): " -NoNewline -ForegroundColor Yellow
        $GitHubRepo = Read-Host
    }
}

# If repo provided, download via GitHub API
if ($GitHubRepo -and -not $apkPath) {
    Write-Host "Downloading from: $GitHubRepo" -ForegroundColor Cyan
    
    # GitHub API endpoint for latest workflow run artifacts
    $apiUrl = "https://api.github.com/repos/$GitHubRepo/actions/artifacts"
    $headers = @{}
    
    if ($GitHubToken) {
        $headers["Authorization"] = "token $GitHubToken"
    }
    
    try {
        $artifacts = Invoke-RestMethod -Uri $apiUrl -Headers $headers -ErrorAction Stop
        $latestArtifact = $artifacts.artifacts | Where-Object { $_.name -eq "saree-order-book-apk" } | Sort-Object -Property created_at -Descending | Select-Object -First 1
        
        if (-not $latestArtifact) {
            Write-Host "ERROR: Artifact 'saree-order-book-apk' not found." -ForegroundColor Red
            Write-Host "Make sure the GitHub Actions workflow has completed successfully." -ForegroundColor Yellow
            exit 1
        }
        
        Write-Host "Found artifact: $($latestArtifact.name) (created: $($latestArtifact.created_at))" -ForegroundColor Green
        
        # Download artifact
        $downloadUrl = "https://api.github.com/repos/$GitHubRepo/actions/artifacts/$($latestArtifact.id)/zip"
        $zipPath = "$env:USERPROFILE\Downloads\saree-order-book-apk.zip"
        
        Write-Host "Downloading artifact..." -ForegroundColor Yellow
        Invoke-WebRequest -Uri $downloadUrl -Headers $headers -OutFile $zipPath -ErrorAction Stop
        
        # Extract APK
        Write-Host "Extracting APK..." -ForegroundColor Yellow
        $extractPath = "$env:USERPROFILE\Downloads\apk-extract"
        Expand-Archive -Path $zipPath -DestinationPath $extractPath -Force
        $apkPath = Get-ChildItem -Path $extractPath -Filter "*.apk" -Recurse | Select-Object -First 1 -ExpandProperty FullName
        
        if (-not $apkPath) {
            Write-Host "ERROR: APK not found in downloaded artifact." -ForegroundColor Red
            exit 1
        }
        
        Write-Host "[OK] APK downloaded: $apkPath" -ForegroundColor Green
        
        # Cleanup
        Remove-Item $zipPath -Force -ErrorAction SilentlyContinue
    } catch {
        Write-Host "ERROR: Failed to download from GitHub API." -ForegroundColor Red
        Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host ""
        Write-Host "Alternative: Download manually from GitHub Actions:" -ForegroundColor Yellow
        Write-Host "  1. Go to: https://github.com/$GitHubRepo/actions" -ForegroundColor Cyan
        Write-Host "  2. Open latest workflow run" -ForegroundColor White
        Write-Host "  3. Download 'saree-order-book-apk' artifact" -ForegroundColor White
        Write-Host "  4. Extract and place app-debug.apk in Downloads folder" -ForegroundColor White
        exit 1
    }
}

# If still no APK path, check Downloads
if (-not $apkPath) {
    $apkPath = "$env:USERPROFILE\Downloads\app-debug.apk"
    if (-not (Test-Path $apkPath)) {
        Write-Host "ERROR: APK not found." -ForegroundColor Red
        Write-Host "Please download APK from GitHub Actions and place it in Downloads as 'app-debug.apk'" -ForegroundColor Yellow
        exit 1
    }
    Write-Host "[OK] Using APK from Downloads: $apkPath" -ForegroundColor Green
}

# Step 4: Install APK
Write-Host ""
Write-Host "[4/4] Installing APK on device..." -ForegroundColor Yellow
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
Write-Host ""
Write-Host "To debug:" -ForegroundColor Yellow
Write-Host "  adb logcat | findstr /i 'saree'" -ForegroundColor White
