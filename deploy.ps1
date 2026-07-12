# deploy.ps1 — one-shot Silas deploy to Vercel
# Run from PowerShell:  pwsh .\deploy.ps1

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not $env:VERCEL_TOKEN) { throw "Set VERCEL_TOKEN env var before running: $env:VERCEL_TOKEN = (your token from vercel.com/account/tokens)" }

Write-Host "==> Step 1/4: Ensuring Vercel CLI is installed..." -ForegroundColor Cyan
if (-not (Get-Command vercel -ErrorAction SilentlyContinue)) {
  npm install -g vercel
}
vercel --version

Write-Host ""
Write-Host "==> Step 2/4: Linking to your Vercel project (creates if needed)..." -ForegroundColor Cyan
# --yes accepts defaults; project name comes from package.json ("silas")
vercel link --yes --token $env:VERCEL_TOKEN

Write-Host ""
Write-Host "==> Step 3/4: Pushing env vars from .env.local to Vercel..." -ForegroundColor Cyan
$envVars = @(
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "ANTHROPIC_CHAT_MODEL",
  "ANTHROPIC_CHEAP_MODEL",
  "OPENAI_EMBEDDING_MODEL"
)

$envContent = Get-Content ".env.local"
foreach ($var in $envVars) {
  $line = $envContent | Where-Object { $_ -match "^$var=" } | Select-Object -First 1
  if ($line) {
    $value = ($line -replace "^$var=", "").Trim('"').Trim("'").Trim()
    if ($value) {
      Write-Host "  -> $var"
      # Remove existing first (idempotent), then add
      "y" | vercel env rm $var production --token $env:VERCEL_TOKEN 2>$null | Out-Null
      $value | vercel env add $var production --token $env:VERCEL_TOKEN | Out-Null
    }
  } else {
    Write-Host "  (skipping $var — not in .env.local)" -ForegroundColor Yellow
  }
}

Write-Host ""
Write-Host "==> Step 4/4: Deploying to production..." -ForegroundColor Cyan
vercel --prod --yes --token $env:VERCEL_TOKEN

Write-Host ""
Write-Host "==> DONE. Your Silas URL is shown above (look for https://silas-...vercel.app)" -ForegroundColor Green
Write-Host "    Open it on your phone — should work with no sign-in." -ForegroundColor Green
