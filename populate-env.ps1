# populate-env.ps1 — Fetch env vars from Vercel and write .env.local for local dev
# Run from PowerShell in the Silas directory:  pwsh .\populate-env.ps1
#
# What it does:
#   1. Calls Vercel API to list + decrypt all env vars set on the project
#   2. For any required key NOT found in Vercel, prompts you to paste it
#   3. Writes a complete .env.local with all keys + BRAIN_VAULT_PATH
#
# Key sources (if you need to paste manually):
#   Supabase  -> https://supabase.com/dashboard/project/umwwjrbskyepphtqjrgl/settings/api
#   Anthropic -> https://console.anthropic.com/settings/keys
#   OpenAI    -> https://platform.openai.com/api-keys

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$TOKEN      = $env:VERCEL_TOKEN; if (-not $TOKEN) { throw "Set VERCEL_TOKEN env var before running: $env:VERCEL_TOKEN = (your token from vercel.com/account/tokens)" }
$TEAM_SLUG  = "silas-team"
$PROJECT    = "silas"
$BRAIN_PATH = 'C:\Users\hudso\OneDrive\Documents\Claude\Projects\Claude Projects\Brain'

$headers     = @{ Authorization = "Bearer $TOKEN" }
$headersJson = @{ Authorization = "Bearer $TOKEN"; "Content-Type" = "application/json" }

$REQUIRED = [ordered]@{
    "NEXT_PUBLIC_SUPABASE_URL"      = "Supabase project URL  (Settings -> API -> Project URL)"
    "NEXT_PUBLIC_SUPABASE_ANON_KEY" = "Supabase anon key     (Settings -> API -> anon public)"
    "SUPABASE_SERVICE_ROLE_KEY"     = "Supabase service_role (Settings -> API -> service_role)"
    "ANTHROPIC_API_KEY"             = "Anthropic key (starts with sk-ant-)"
    "OPENAI_API_KEY"                = "OpenAI key (starts with sk-)"
}
$DEFAULTS = [ordered]@{
    "ANTHROPIC_CHAT_MODEL"   = "claude-sonnet-4-6"
    "ANTHROPIC_CHEAP_MODEL"  = "claude-haiku-4-5-20251001"
    "OPENAI_EMBEDDING_MODEL" = "text-embedding-3-small"
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Silas — Populate .env.local" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan

# ---- Resolve team ID ----
Write-Host ""
Write-Host "==> Resolving Vercel team..." -ForegroundColor Cyan
try {
    $teamResp = Invoke-RestMethod -Uri "https://api.vercel.com/v2/teams?slug=$TEAM_SLUG" -Headers $headers
    $teamId = if ($teamResp.id) { $teamResp.id } else { $teamResp.teams[0].id }
    Write-Host "    Team ID: $teamId" -ForegroundColor Green
} catch {
    Write-Host "    Could not reach Vercel API: $_" -ForegroundColor Yellow
    Write-Host "    Will prompt for all keys manually." -ForegroundColor Yellow
    $teamId = $null
}

# ---- Fetch env vars from Vercel ----
$values = @{}
if ($teamId) {
    Write-Host ""
    Write-Host "==> Fetching env vars from Vercel project '$PROJECT'..." -ForegroundColor Cyan
    try {
        $envResp = Invoke-RestMethod -Uri "https://api.vercel.com/v9/projects/$PROJECT/env?teamId=$teamId" -Headers $headers
        $envList = $envResp.envs
        Write-Host "    Found $($envList.Count) vars in Vercel"

        foreach ($env in $envList) {
            if ($REQUIRED.Keys -contains $env.key) {
                Write-Host "    Decrypting $($env.key)..." -ForegroundColor Gray
                try {
                    $detail = Invoke-RestMethod `
                        -Uri "https://api.vercel.com/v9/projects/$PROJECT/env/$($env.id)?teamId=$teamId" `
                        -Headers $headers
                    if ($detail.value) {
                        $values[$env.key] = $detail.value
                        $preview = $detail.value.Substring(0, [Math]::Min(20, $detail.value.Length))
                        Write-Host "    $($env.key) = $preview..." -ForegroundColor Green
                    }
                } catch {
                    Write-Host "    Could not decrypt $($env.key): $_" -ForegroundColor Yellow
                }
            }
        }
    } catch {
        Write-Host "    Could not list env vars: $_" -ForegroundColor Yellow
    }
}

# ---- Prompt for any missing required keys ----
$missing = @($REQUIRED.Keys | Where-Object { -not $values.ContainsKey($_) })
if ($missing.Count -gt 0) {
    Write-Host ""
    Write-Host "==> $($missing.Count) key(s) not found in Vercel — please paste them now." -ForegroundColor Yellow
    Write-Host "    (Values are hidden as you type)" -ForegroundColor Gray
    Write-Host ""

    foreach ($key in $missing) {
        Write-Host "  $key" -ForegroundColor White
        Write-Host "  -> $($REQUIRED[$key])" -ForegroundColor Gray
        $secure = Read-Host "     Paste value" -AsSecureString
        $val = [System.Net.NetworkCredential]::new("", $secure).Password
        if ([string]::IsNullOrWhiteSpace($val)) {
            Write-Host "     SKIPPED (empty — migration will fail without this)" -ForegroundColor Red
        } else {
            $values[$key] = $val
            Write-Host "     Saved." -ForegroundColor Green
        }
        Write-Host ""
    }
}

# ---- Write .env.local ----
Write-Host "==> Writing .env.local..." -ForegroundColor Cyan

$lines = @("# Populated by populate-env.ps1 on $(Get-Date -Format 'yyyy-MM-dd HH:mm')", "")

foreach ($key in $REQUIRED.Keys) {
    if ($values.ContainsKey($key)) {
        $lines += "$key=`"$($values[$key])`""
    } else {
        $lines += "# $key=  <-- NOT SET: add manually"
    }
}

$lines += ""
foreach ($key in $DEFAULTS.Keys) {
    $lines += "$key=`"$($DEFAULTS[$key])`""
}

$lines += ""
$lines += "BRAIN_VAULT_PATH=`"$BRAIN_PATH`""

$lines | Set-Content -Path ".env.local" -Encoding UTF8

$setCount = ($REQUIRED.Keys | Where-Object { $values.ContainsKey($_) }).Count
Write-Host "    Written: $setCount/$($REQUIRED.Count) required keys + defaults + BRAIN_VAULT_PATH" -ForegroundColor Green

# ---- Summary ----
Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
if ($setCount -eq $REQUIRED.Count) {
    Write-Host "  .env.local is complete!" -ForegroundColor Green
    Write-Host ""
    Write-Host "  Next steps — run in this directory:" -ForegroundColor White
    Write-Host "    pnpm install" -ForegroundColor Yellow
    Write-Host "    pnpm migrate           # imports vault -> Supabase (takes a while)" -ForegroundColor Yellow
    Write-Host "    pnpm embed-missing     # backfills any missing embeddings" -ForegroundColor Yellow
} else {
    Write-Host "  .env.local is INCOMPLETE" -ForegroundColor Red
    Write-Host "  Missing: $( ($REQUIRED.Keys | Where-Object { -not $values.ContainsKey($_) }) -join ', ')" -ForegroundColor Red
    Write-Host "  Edit .env.local manually before running pnpm migrate." -ForegroundColor Yellow
}
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
