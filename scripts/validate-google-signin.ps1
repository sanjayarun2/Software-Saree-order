# Validates Google Sign-In prerequisites for the Android APK.
# Run: .\scripts\validate-google-signin.ps1

$ErrorActionPreference = "Stop"

$ProjectId = "helical-patrol-499311-d0"
$PackageName = "com.sareeorder.app"
$ExpectedWebClientId = "525751857875-fuo9efh2hiq7sqjscdrclmlq2c8jn81o.apps.googleusercontent.com"
$AppId = "1:525751857875:android:09b1253930c58ff8f1da26"
$RepoRoot = Split-Path -Parent $PSScriptRoot

function Normalize-Sha1([string]$sha) {
  return ($sha -replace ":", "").ToLowerInvariant()
}

function Fail([string]$message) {
  Write-Host "FAIL: $message" -ForegroundColor Red
  $script:Failed = $true
}

function Pass([string]$message) {
  Write-Host "OK:   $message" -ForegroundColor Green
}

function Warn([string]$message) {
  Write-Host "WARN: $message" -ForegroundColor Yellow
}

$Failed = $false
Write-Host "`n=== Google Sign-In validation ===" -ForegroundColor Cyan

# 1) Local signing SHA-1
Write-Host "`n[1] APK signing certificate" -ForegroundColor Yellow
$signingReport = & "$RepoRoot\android\gradlew.bat" -p "$RepoRoot\android" signingReport 2>&1 | Out-String
$shaMatches = [regex]::Matches($signingReport, "SHA1:\s*([0-9A-F:]+)")
if ($shaMatches.Count -eq 0) {
  Fail "Could not read SHA-1 from gradlew signingReport"
  $localSha1 = $null
} else {
  $localSha1 = $shaMatches[0].Groups[1].Value
  Pass "Release/debug SHA-1: $localSha1"
}

# 2) google-services.json
Write-Host "`n[2] android/app/google-services.json" -ForegroundColor Yellow
$gsPath = Join-Path $RepoRoot "android\app\google-services.json"
if (-not (Test-Path $gsPath)) {
  Fail "Missing $gsPath (CI writes this from GOOGLE_SERVICES_JSON_B64)"
} else {
  $gs = Get-Content $gsPath -Raw | ConvertFrom-Json
  $pkg = $gs.client[0].client_info.android_client_info.package_name
  if ($pkg -ne $PackageName) {
    Fail "Package name mismatch: $pkg"
  } else {
    Pass "Package name: $pkg"
  }

  $webClients = @($gs.client[0].oauth_client | Where-Object { $_.client_type -eq 3 })
  if ($webClients.Count -eq 0) {
    Fail "No Web OAuth client (type 3) in google-services.json"
  } elseif ($webClients[0].client_id -ne $ExpectedWebClientId) {
    Fail "Web client ID mismatch: $($webClients[0].client_id)"
  } else {
    Pass "Web client ID matches expected value"
  }

  $androidClients = @($gs.client[0].oauth_client | Where-Object { $_.client_type -eq 1 })
  if ($androidClients.Count -eq 0) {
    Warn "No Android OAuth client (type 1) in google-services.json - native picker may fail with [16]"
    Warn "Create Android OAuth client in GCP Console, or rely on browser fallback in latest app build"
  } else {
    $matchedAndroid = $false
    foreach ($ac in $androidClients) {
      $sha = $ac.android_info.certificate_hash
      $pkg = $ac.android_info.package_name
      if ($pkg -eq $PackageName -and $localSha1 -and (Normalize-Sha1 $sha) -eq (Normalize-Sha1 $localSha1)) {
        $matchedAndroid = $true
        Pass "Android OAuth client linked to package + SHA-1"
      }
    }
    if (-not $matchedAndroid) {
      Warn "Android OAuth client(s) present but none match current package + SHA-1"
    }
  }
}

# 3) Env / build config
Write-Host "`n[3] Web Client ID in app config" -ForegroundColor Yellow
$envId = $env:NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID
if ($envId -and $envId.Trim() -ne $ExpectedWebClientId) {
  Warn "NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID env differs from Firebase web client"
} elseif ($envId) {
  Pass "NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID is set locally"
} else {
  Pass "NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID set at CI build time (GOOGLE_WEB_CLIENT_ID secret)"
}

# 4) Firebase SHA fingerprints (requires gcloud login)
Write-Host "`n[4] Firebase Android SHA fingerprints" -ForegroundColor Yellow
try {
  $token = gcloud auth print-access-token 2>$null
  if (-not $token) { throw "gcloud not authenticated" }
  $headers = @{
    Authorization = "Bearer $token"
    "x-goog-user-project" = $ProjectId
  }
  $parent = "projects/$ProjectId/androidApps/$AppId"
  $shaList = Invoke-RestMethod -Uri "https://firebase.googleapis.com/v1beta1/$parent/sha" -Headers $headers
  $certs = @($shaList.certificates)
  if ($certs.Count -eq 0) {
    Fail "No SHA certificates on Firebase app - Google Sign-In [16] will fail"
  } else {
    $hasMatch = $false
    foreach ($cert in $certs) {
      if ($cert.certType -eq "SHA_1" -and $localSha1 -and (Normalize-Sha1 $cert.shaHash) -eq (Normalize-Sha1 $localSha1)) {
        $hasMatch = $true
      }
      Pass "Firebase SHA-$($cert.certType): $($cert.shaHash)"
    }
    if ($localSha1 -and -not $hasMatch) {
      Fail "Firebase SHA-1 does not match gradlew signingReport ($localSha1)"
    }
  }
} catch {
  Fail "Could not query Firebase SHA list: $($_.Exception.Message)"
  Warn "Run: gcloud auth login sanjay.cyber.audit@gmail.com"
}

# 5) MainActivity plugin marker
Write-Host "`n[5] Android MainActivity" -ForegroundColor Yellow
$mainActivity = Join-Path $RepoRoot "android\app\src\main\java\com\sareeorder\app\MainActivity.java"
if (-not (Test-Path $mainActivity)) {
  Fail "MainActivity.java not found"
} elseif ((Get-Content $mainActivity -Raw) -notmatch "ModifiedMainActivityForSocialLoginPlugin") {
  Fail "MainActivity must implement ModifiedMainActivityForSocialLoginPlugin"
} else {
  Pass "MainActivity implements social login plugin contract"
}

Write-Host ""
if ($Failed) {
  Write-Host "Validation FAILED. Fix items above before testing Google Sign-In on APK." -ForegroundColor Red
  exit 1
}

Write-Host "Validation PASSED (see WARN above for native Android OAuth gaps)." -ForegroundColor Green
Write-Host "Install latest APK. Native sign-in uses account picker; if [16], app falls back to browser OAuth." -ForegroundColor White
Write-Host ""
exit 0
