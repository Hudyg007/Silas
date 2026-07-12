# fix-silas.ps1 — full diagnostic + recovery for Silas
# Run from PowerShell in the Silas folder:  pwsh .\fix-silas.ps1
#
# What it does (in order):
#   1. Probes the deployed URL — reports HTTP status
#   2. If 401/403 — disables Vercel deployment protection via API
#   3. Lists Vercel env vars currently set on the project
#   4. For any missing required key, prompts you to paste it (one-time)
#   5. Triggers a fresh production deploy
#   6. Re-probes the URL to confirm it works
#
# Why this is needed:
#   - The original deploy.ps1 read .env.local which was already wiped by
#     `vercel env pull` (OIDC token replaced everything). So the prod deploy
#     went up with NO API keys set in Vercel.
#   - This script recovers by asking you ONCE for any missing keys.
#   - You will need to paste 5 secrets: SUPABASE_URL, SUPABASE_ANON_KEY,
#     SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY, OPENAI_API_KEY.
#   - Get them from:
#       Supabase  -> https://supabase.com/dashboard/project/_/settings/api
#       Anthropic -> https://console.anthropic.com/settings/keys
#       OpenAI    -> https://platform.openai.com/api-keys

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$TOKEN     = $env:VERCEL_TOKEN; if (-not $TOKEN) { throw "Set VERCEL_TOKEN env var before running: $env:VERCEL_TOKEN = (your token from vercel.com/account/tokens)" }
$SILAS_URL = "https://silas-b61m6n8ra-silas-team.vercel.app"
$PROJECT   = "silas"
$TEAM_SLUG = "silas-team"

# Required env vars and their sources
$REQUIRED = [ordered]@{
  "NEXT_PUBLIC_SUPABASE_URL"      = "Supabase project URL (Settings -> API -> Project URL)"
  "NEXT_PUBLIC_SUPABASE_ANON_KEY" = "Supabase anon/public key (Settings -> API -> anon public)"
  "SUPABASE_SERVICE_ROLE_KEY"     = "Supabase service_role key (Settings -> API -> service_role secret)"
  "ANTHROPIC_API_KEY"             = "Anthropic key starting with sk-ant-"
  "OPENAI_API_KEY"                = "OpenAI key starting with sk-"
}
$OPTIONAL = [ordered]@{
  "ANTHROPIC_CHAT_MODEL"   = "claude-sonnet-4-6"
  "ANTHROPIC_CHEAP_MODEL"  = "claude-haiku-4-5-20251001"
  "OPENAI_EMBEDDING_MODEL" = "text-embedding-3-small"
}

# ---------- helpers (Vercel REST API) ----------
$headers = @{ Authorization = "Bearer $TOKEN" }
$headersJson = @{ Authorization = "Bearer $TOKEN"; "Content-Type" = "application/json" }

function Get-TeamId {
  $r = Invoke-RestMethod -Uri "https://api.vercel.com/v2/teams?slug=$TEAM_SLUG" -Headers $headers
  if ($r.id) { return $r.id }
  if ($r.teams) { return $r.teams[0].id }
  throw "Could not resolve team ID for slug '$TEAM_SLUG'"
}

function Get-ProjectInfo($teamId) {
  Invoke-RestMethod -Uri "https://api.vercel.com/v9/projects/${PROJECT}?teamId=$teamId" -Headers $headers
}

function Get-EnvVars($teamId) {
  $r = Invoke-RestMethod -Uri "https://api.vercel.com/v9/projects/${PROJECT}/env?teamId=$teamId" -Headers $headers
  return $r.envs
}

function Set-EnvVar($teamId, $key, $value) {
  $body = @{
    key    = $key
    value  = $value
    type   = "encrypted"
    target = @("production", "preview", "development")
  } | ConvertTo-Json
  Invoke-RestMethod -Uri "https://api.vercel.com/v10/projects/${PROJECT}/env?teamId=$teamId&upsert=true" -Method Post -Headers $headersJson -Body $body | Out-Null
}

function Disable-Protection($teamId) {
  $body = '{"ssoProtection":null,"passwordProtection":null}'
  Invoke-RestMethod -Uri "https://api.vercel.com/v9/projects/${PROJECT}?teamId=$teamId" -Method Patch -Headers $headersJson -Body $body
}

function Probe-Url {
  try {
    $r = Invoke-WebRequest -Uri $SILAS_URL -Method Get -MaximumRedirection 0 -ErrorAction Stop -SkipHttpErrorCheck
    return $r.StatusCode
  } catch {
    return $_.Exception.Response.StatusCode.value__
  }
}

# ---------- main ----------
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Silas Recovery Script" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan

Write-Host ""
Write-Host "==> Resolving team..." -ForegroundColor Cyan
$teamId = Get-TeamId
Write-Host "    Team ID: $teamId"

Write-Host ""
Write-Host "==> Step 1: Probing Silas URL..." -ForegroundColor Cyan
$code = Probe-Url
Write-Host "    HTTP $code from $SILAS_URL"

if ($code -eq 401 -or $code -eq 403) {
  Write-Host ""
  Write-Host "==> Step 2: Auth wall detected. Disabling Vercel deployment protection..." -ForegroundColor Cyan
  $r = Disable-Protection $teamId
  Write-Host "    Done. ssoProtection: $($r.ssoProtection)  passwordProtection: $($r.passwordProtection)" -ForegroundColor Green
}

Write-Host ""
Write-Host "==> Step 3: Checking env vars set in Vercel..." -ForegroundColor Cyan
$existing = Get-EnvVars $teamId
$existingKeys = @($existing | ForEach-Object { $_.key })
Write-Host "    Currently set: $($existingKeys.Count) vars"
foreach ($k in $existingKeys) { Write-Host "      - $k" }

Write-Host ""
Write-Host "==> Step 4: Checking for missing required keys..." -ForegroundColor Cyan
$missingRequired = @()
foreach ($key in $REQUIRED.Keys) {
  if ($existingKeys -notcontains $key) {
    $missingRequired += $key
  }
}

if ($missingRequired.Count -gt 0) {
  Write-Host "    Missing: $($missingRequired -join ', ')" -ForegroundColor Yellow
  Write-Host ""
  Write-Host "    ==> Need to set these now. Paste each value when prompted." -ForegroundColor Yellow
  Write-Host ""
  foreach ($key in $missingRequired) {
    Write-Host "    $key" -ForegroundColor White
    Write-Host "    ($($REQUIRED[$key]))" -ForegroundColor Gray
    $secure = Read-Host "    Value" -AsSecureString
    $val = [System.Net.NetworkCredential]::new("", $secure).Password
    if ([string]::IsNullOrWhiteSpace($val)) {
      Write-Host "    SKIPPED (empty)" -ForegroundColor Red
      continue
    }
    Set-EnvVar $teamId $key $val
    Write-Host "    Saved." -ForegroundColor Green
    Write-Host ""
  }
} else {
  Write-Host "    All required keys are set." -ForegroundColor Green
}

# Optional model keys — set defaults if missing
foreach ($key in $OPTIONAL.Keys) {
  if ($existingKeys -notcontains $key) {
    Write-Host "    Setting optional $key = $($OPTIONAL[$key])"
    Set-EnvVar $teamId $key $OPTIONAL[$key]
  }
}

Write-Host ""
Write-Host "==> Step 5: Triggering production redeploy..." -ForegroundColor Cyan
$env:VERCEL_TOKEN = $TOKEN
vercel --prod --yes --token $TOKEN

Write-Host ""
Write-Host "==> Step 6: Probing again (waiting 10s for deploy to start)..." -ForegroundColor Cyan
Start-Sleep -Seconds 10
$code2 = Probe-Url
Write-Host "    HTTP $code2 from $SILAS_URL"

if ($code2 -eq 200 -or $code2 -eq 307 -or $code2 -eq 308) {
  Write-Host ""
  Write-Host "============================================" -ForegroundColor Green
  Write-Host "  SILAS IS LIVE" -ForegroundColor Green
  Write-Host "  Open on phone: $SILAS_URL" -ForegroundColor Green
  Write-Host "============================================" -ForegroundColor Green
} else {
  Write-Host ""
  Write-Host "==> Still not 200. Pulling deploy logs..." -ForegroundColor Yellow
  vercel logs $SILAS_URL --token $TOKEN 2>&1 | Select-Object -First 80
  Write-Host ""
  Write-Host "==> If you see 'Missing X' or 'Invalid Y' in the log, set that env var manually:" -ForegroundColor Yellow
  Write-Host "    https://vercel.com/$TEAM_SLUG/$PROJECT/settings/environment-variables"
}
