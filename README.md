# Silas

Hudson's personal AI brain. Cloud-hosted, vault-backed, always-on.

**Read first:** [`SILAS-BUILD-SPEC.md`](./SILAS-BUILD-SPEC.md) — the master technical doc with every architectural decision documented.

---

## What works right now (v0.1 tonight)

- ✅ Full Next.js 15 + TypeScript project, ready to run
- ✅ Supabase schema with pgvector for vault + chat memory
- ✅ Vault migration script — pulls your 7,000-note `/Brain/` into the cloud DB with embeddings
- ✅ Chat backend with streaming, RAG over vault + RAG over past conversations (total recall)
- ✅ First-visit onboarding — Silas reads 20 random notes and tells you what he thinks of you
- ✅ Note extraction — after each chat exchange, Silas captures anything worth saving and writes to vault
- ✅ Magic-link auth via Supabase
- ✅ Ugly-but-functional chat UI (Aurora-alive visual saved for v0.2)

## What's NOT in v0.1 (deliberately)

- ❌ Aurora-alive visual (you have v4 widget as the target — implement next)
- ❌ 3D brain visualization (placeholder gradient background only)
- ❌ Voice in/out via ElevenLabs (v2)
- ❌ Always-thinking daemon (DB has the table, no cron worker yet)
- ❌ Calendar / email / GitHub integrations (v2)
- ❌ PWA install (v2)
- ❌ Real Silas personality (placeholder warm-peer — swap when your spec lands)

---

## Quick start

```bash
# 1. Install dependencies (uses pnpm)
cd Silas
pnpm install

# 2. Create a Supabase project
# Visit supabase.com → create org if needed → new project named "silas"
# Wait ~2 min for it to provision
# Project Settings → API → copy URL, anon key, and service_role key

# 3. Run the database schema
# Supabase dashboard → SQL Editor → paste contents of supabase/schema.sql → Run

# 4. Get API keys
# - console.anthropic.com → API Keys → create one
# - platform.openai.com → API Keys → create one (for embeddings, ~$0.07 one-time)

# 5. Configure environment
cp .env.example .env.local
# Edit .env.local with the keys from steps 2-4

# 6. Migrate the vault (one-time, ~5-10 min for 7k notes)
pnpm migrate

# 7. Run dev
pnpm dev

# 8. Open http://localhost:3000
# Sign in via magic link sent to your email
# First visit triggers Silas reading your vault → opening message
```

## Daily use

- `pnpm dev` — local dev server
- Just keep using it. The vault grows itself as Silas captures notes from chat.

## Deploy to Vercel (when ready)

```bash
# Push to GitHub
git init
git add .
git commit -m "initial silas"
gh repo create silas --private --source=. --remote=origin --push

# Then connect to Vercel:
# vercel.com → Add New → Project → Import Git Repository → silas
# Add the same .env.local vars to Vercel Project Settings → Environment Variables
# Deploy. Vercel gives you a URL like silas-hudson.vercel.app
```

## Troubleshooting

**Migration says "0 found":**
Check `BRAIN_VAULT_PATH` in `.env.local`. Must be the absolute path to your Brain folder. Backslashes in Windows paths are fine.

**Chat returns 401:**
You're not signed in. Visit `/login`, get magic link, click it.

**Chat works but Silas doesn't know about your vault:**
Migration didn't finish, or `match_vault_notes` RPC not created. Re-run `supabase/schema.sql` and `pnpm migrate`.

**Onboarding loops or errors:**
Reset state: POST to `/api/onboarding` with no body. It clears your onboarded flag.

**Costs spiking:**
Switch `ANTHROPIC_CHAT_MODEL` to `claude-haiku-4-5-20251001` in `.env.local`. Drops cost ~10x at slight quality loss.

---

## Project structure

```
Silas/
├── SILAS-BUILD-SPEC.md     ← master technical doc, read first
├── README.md               ← this file
├── package.json
├── next.config.ts, tsconfig.json, tailwind.config.ts, postcss.config.mjs
├── .env.example            ← copy to .env.local and fill
├── supabase/
│   └── schema.sql          ← run once in Supabase SQL editor
├── scripts/
│   ├── migrate-vault.ts    ← pnpm migrate
│   └── embed-notes.ts      ← pnpm embed-missing
├── src/
│   ├── app/                ← Next.js App Router pages + API routes
│   ├── components/         ← React components (chat UI)
│   ├── lib/                ← server-side libs (anthropic, supabase, rag, etc.)
│   └── types/
└── docs/                   ← deeper architecture docs (coming)
```

## What to do after v0.1 works

1. **Visual polish** — port Aurora-alive v4 (the widget mockup) into real Three.js component as the background. Replace `.brain-placeholder` div.
2. **Personality spec** — write your real Silas personality, replace `src/lib/personality.ts`.
3. **Voice** — wire ElevenLabs for output, Web Speech API for input.
4. **Always-thinking daemon** — Vercel cron job that triggers Haiku-powered "thoughts" on a schedule.
5. **External integrations** — Google Calendar, Gmail, Spotify, GitHub via OAuth.
6. **PWA** — add manifest.json + service worker for install-to-home-screen.

Each of these is its own brief. Bring one back to me when you want it built.
