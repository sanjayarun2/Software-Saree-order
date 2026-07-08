# Run once in PowerShell (interactive login required):
#   .\scripts\setup-google-oauth.ps1
#
# Uses: sanjay.cyber.audit@gmail.com (or change $Account below)

$ErrorActionPreference = "Stop"
$Account = "sanjay.cyber.audit@gmail.com"
$PackageName = "com.sareeorder.app"
$Sha1 = "94:A4:0D:44:AF:72:29:E4:37:A5:54:CD:83:9C:2F:4A:90:76:3D:F0"
$ExistingWebClientId = "525751857875-fuo9efh2hiq7sqjscdrclmlq2c8jn81o.apps.googleusercontent.com"
$ProjectNumber = "525751857875"

Write-Host "`n=== Google OAuth setup ($Account) ===" -ForegroundColor Cyan

Write-Host "`nStep 1: gcloud login (browser opens)..." -ForegroundColor Yellow
gcloud auth login $Account --force
gcloud config set account $Account

Write-Host "`nStep 2: Listing projects..." -ForegroundColor Yellow
gcloud projects list --format="table(projectId,name,projectNumber)"

$match = gcloud projects list --format="value(projectId,projectNumber)" | Where-Object { $_ -match $ProjectNumber }
if ($match) {
  $projectId = ($match -split "\s+")[0]
  Write-Host "Found existing project for OAuth client: $projectId" -ForegroundColor Green
} else {
  $projectId = Read-Host "Enter GCP project ID to use (or create one in console first)"
}

gcloud config set project $projectId

Write-Host "`nStep 3: Enable required APIs..." -ForegroundColor Yellow
gcloud services enable iamcredentials.googleapis.com --project=$projectId 2>$null

Write-Host @"

Step 4 — MANUAL in Google Cloud Console (CLI cannot create OAuth clients reliably):
  https://console.cloud.google.com/apis/credentials?project=$projectId

  A) If project $ProjectNumber exists here:
     - Open Web client: $ExistingWebClientId
     - Create Android OAuth client:
         Package: $PackageName
         SHA-1:   $Sha1

  B) If project not found — create NEW:
     1. OAuth consent screen (External)
     2. Web client → copy Client ID + Secret → Supabase Auth → Google
     3. Android client → package + SHA-1 above

Then run from repo root:
  gh secret set GOOGLE_WEB_CLIENT_ID --body \"YOUR_WEB_CLIENT_ID\"
  git commit --allow-empty -m \"Rebuild APK with new Google OAuth.\"
  git push origin main

"@ -ForegroundColor White

Write-Host "Done (login + project scan). Complete steps 4 in browser.`n" -ForegroundColor Cyan
