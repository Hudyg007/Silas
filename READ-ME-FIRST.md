# READ ME FIRST — Silas Recovery

Two things broke overnight, both have one-command fixes. Run them in order.

## STEP 1: Upgrade Next.js (Vercel is blocking deploys)

Vercel started rejecting builds due to Next.js 15.0.4 vulnerability (CVE-2025-29927). I bumped package.json to `^15.5.0`; this script regenerates the lock, verifies the build, commits + pushes.

```powershell
cd "C:\Users\hudso\OneDrive\Documents\Claude\Projects\Claude Projects\Silas"; pwsh .\upgrade-next.ps1
```

If the build fails after upgrade, the script rolls back instructions are in its output.

## STEP 2: Push env vars + flip auth wall

Once Vercel deploys the new build (~2-3 min after push), the env vars still need to be set:

```powershell
cd "C:\Users\hudso\OneDrive\Documents\Claude\Projects\Claude Projects\Silas"; pwsh .\fix-silas.ps1
```

You'll need these 5 secrets on hand:
- Supabase URL + anon key + service_role key (supabase.com/dashboard/project/_/settings/api)
- Anthropic API key (console.anthropic.com/settings/keys)
- OpenAI API key (platform.openai.com/api-keys)

The script will prompt for each one (hidden input), push to Vercel via API, disable any auth wall, and trigger a redeploy.

Live URL: `https://silas-b61m6n8ra-silas-team.vercel.app`

## Full overnight notes

See `../MORNING-OVERVIEW-2026-06-22.md` for everything else that happened.
