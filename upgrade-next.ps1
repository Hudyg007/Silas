# upgrade-next.ps1 — install patched Next.js + verify build + commit + push
# Usage:  pwsh .\upgrade-next.ps1
#
# What it does:
#   1. pnpm install (regenerates lock with new Next.js >=15.5.0 — patches CVE-2025-29927)
#   2. pnpm build (verifies the upgrade didn't break anything locally)
#   3. If build green AND there are changes → commits + pushes to main
#   4. Vercel auto-deploys on the push
#
# Why this file exists:
#   - Vercel started blocking deploys due to Next.js 15.0.4 vulnerability
#   - package.json was bumped to "^15.5.0" by me; this script regenerates the lock + tests + ships
#   - You can also do it manually: `pnpm install && pnpm build && git commit -am "..." && git push`

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Silas Next.js Upgrade" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan

Write-Host ""
Write-Host "==> Step 1: pnpm install (regenerates lock with patched Next.js)..." -ForegroundColor Cyan
pnpm install
if ($LASTEXITCODE -ne 0) {
  Write-Host "    pnpm install failed. Stopping." -ForegroundColor Red
  exit 1
}

Write-Host ""
Write-Host "==> Step 2: Verify installed Next.js version..." -ForegroundColor Cyan
$nextVer = pnpm list next --depth 0 | Select-String -Pattern "next\s" | ForEach-Object { $_.Line.Trim() }
Write-Host "    $nextVer"

Write-Host ""
Write-Host "==> Step 3: pnpm build (verify nothing breaks)..." -ForegroundColor Cyan
pnpm build
if ($LASTEXITCODE -ne 0) {
  Write-Host ""
  Write-Host "    Build FAILED after upgrade." -ForegroundColor Red
  Write-Host "    Roll back with: git checkout -- package.json && pnpm install" -ForegroundColor Yellow
  Write-Host "    Then investigate the build error before retrying." -ForegroundColor Yellow
  exit 1
}

Write-Host ""
Write-Host "==> Step 4: Build succeeded. Checking git status..." -ForegroundColor Cyan
$status = git status --porcelain
if (-not $status) {
  Write-Host "    No changes to commit (already up to date?)." -ForegroundColor Yellow
  exit 0
}
Write-Host "    Changes detected:"
git status --short

Write-Host ""
Write-Host "==> Step 5: Committing + pushing..." -ForegroundColor Cyan
git add package.json pnpm-lock.yaml
git commit -m "chore: upgrade next to ^15.5.0 to patch CVE-2025-29927"
git push origin main
if ($LASTEXITCODE -ne 0) {
  Write-Host "    git push failed. Check auth + try `git push` manually." -ForegroundColor Red
  exit 1
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  PUSHED. Vercel will auto-deploy." -ForegroundColor Green
Write-Host "  Watch progress: https://vercel.com/silas-team/silas/deployments" -ForegroundColor Green
Write-Host "  After deploy succeeds, run: pwsh .\fix-silas.ps1" -ForegroundColor Green
Write-Host "  (to push env vars + verify Silas is live)" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
