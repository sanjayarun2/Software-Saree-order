# Complete setup: Supabase migration + env + GitHub secret + APK rebuild
# Run in PowerShell from repo root:
#   .\scripts\complete-setup.ps1
#
# Or non-interactive:
#   $env:SUPABASE_URL='https://rzwbpjjayarptlwjfpzm.supabase.co'
#   $env:SUPABASE_SERVICE_ROLE_KEY='eyJ...'
#   $env:SUPABASE_ANON_KEY='eyJ...'
#   $env:GOOGLE_WEB_CLIENT_ID='123456-abc.apps.googleusercontent.com'
#   .\scripts\complete-setup.ps1 -NonInteractive

param(
  [switch]$NonInteractive,
  [switch]$SkipApkRebuild
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

function Read-Secret([string]$Prompt) {
  if ($NonInteractive) { return (Get-Item "env:$Prompt" -ErrorAction SilentlyContinue).Value }
  $v = Read-Host $Prompt
  if (-not $v) { throw "Missing $Prompt" }
  return $v.Trim()
}

Write-Host "`n=== Saree Order App — complete setup ===" -ForegroundColor Cyan
Write-Host "Project: rzwbpjjayarptlwjfpzm.supabase.co`n"

$supabaseUrl = if ($env:SUPABASE_URL) { $env:SUPABASE_URL } else { Read-Secret "SUPABASE_URL (default https://rzwbpjjayarptlwjfpzm.supabase.co)" }
if (-not $supabaseUrl) { $supabaseUrl = "https://rzwbpjjayarptlwjfpzm.supabase.co" }

$serviceKey = Read-Secret "SUPABASE_ACCESS_TOKEN (sbp_...) OR SUPABASE_DB_PASSWORD"
$anonKey = Read-Secret "SUPABASE_ANON_KEY (publishable anon key)"
$googleClientId = Read-Secret "GOOGLE_WEB_CLIENT_ID (*.apps.googleusercontent.com)"

Write-Host "`n[1/4] Applying migration check_auth_email_exists..." -ForegroundColor Yellow
$env:NEXT_PUBLIC_SUPABASE_URL = $supabaseUrl
$env:SUPABASE_URL = $supabaseUrl
if ($serviceKey -like "sbp_*") {
  $env:SUPABASE_ACCESS_TOKEN = $serviceKey
} elseif ($serviceKey -like "eyJ*") {
  throw "Use SUPABASE_ACCESS_TOKEN (sbp_...) or database password for migrations — not the service_role JWT."
} else {
  $env:SUPABASE_DB_PASSWORD = $serviceKey
}
node scripts/run-migration.mjs add_check_auth_email_exists
if ($LASTEXITCODE -ne 0) { throw "Migration failed" }
Write-Host "Migration OK" -ForegroundColor Green

Write-Host "`n[2/4] Writing .env.local..." -ForegroundColor Yellow
$envContent = @"
NEXT_PUBLIC_SUPABASE_URL=$supabaseUrl
NEXT_PUBLIC_SUPABASE_ANON_KEY=$anonKey
NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID=$googleClientId
"@
Set-Content -Path ".env.local" -Value $envContent -Encoding utf8
Write-Host ".env.local updated" -ForegroundColor Green

Write-Host "`n[3/4] Setting GitHub secret GOOGLE_WEB_CLIENT_ID..." -ForegroundColor Yellow
gh secret set GOOGLE_WEB_CLIENT_ID --body $googleClientId
if ($LASTEXITCODE -ne 0) { throw "gh secret set failed" }
Write-Host "GitHub secret set" -ForegroundColor Green

if (-not $SkipApkRebuild) {
  Write-Host "`n[4/4] Triggering APK rebuild (empty commit)..." -ForegroundColor Yellow
  git commit --allow-empty -m "Rebuild APK with Google Web Client ID configured."
  git push origin main
  Write-Host "Push complete — check Actions for Build APK" -ForegroundColor Green
} else {
  Write-Host "`n[4/4] Skipped APK rebuild (-SkipApkRebuild)" -ForegroundColor DarkYellow
}

Write-Host "`n=== Done ===" -ForegroundColor Cyan
Write-Host "Manual step (Google Cloud Console): Android OAuth client for com.sareeorder.app + release SHA-1"
Write-Host "  cd android; .\gradlew signingReport"
Write-Host "See docs/GOOGLE_SIGNIN.md`n"
