# Silas — Deploy Guide

Step-by-step for getting Silas live on a real URL.

---

## Phase 1: Local development (run on your machine first)

You should get this working locally before deploying. ~30 min.

### 1.1 Supabase setup
1. Go to https://supabase.com → Sign in with GitHub → Create new organization (free) → New project
2. Name it `silas`, generate strong password, pick region nearest you (San Francisco is fine from Vancouver)
3. Wait ~2 min for provisioning
4. Once ready: **Project Settings → API**
   - Copy `URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - Copy `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - Copy `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (KEEP SECRET)

5. **SQL Editor → New query** → paste contents of `supabase/schema.sql` → Run
6. Verify: **Table Editor** should show `vault_notes`, `conversations`, `messages`, `silas_journal`, `user_state`

### 1.2 Anthropic API key
1. Go to https://console.anthropic.com
2. Settings → API Keys → Create Key
3. Copy → `ANTHROPIC_API_KEY`
4. (Optional) Add a low billing limit ($20/mo) under Settings → Billing

### 1.3 OpenAI API key (embeddings only)
1. Go to https://platform.openai.com
2. API keys → Create new secret key
3. Copy → `OPENAI_API_KEY`
4. Add $5 credit (will last months for embeddings only)

### 1.4 Environment file
```bash
cp .env.example .env.local
# Edit .env.local with all 5 keys + BRAIN_VAULT_PATH
```

### 1.5 Install and migrate
```bash
pnpm install
pnpm migrate     # ~5-10 min, imports your 7k notes with embeddings
pnpm dev         # localhost:3000
```

### 1.6 First visit
1. Open http://localhost:3000
2. Auto-redirects to `/login`
3. Enter your email → magic link sent
4. Click the link in your email → callback redirects to `/`
5. First visit triggers onboarding — Silas reads vault, sends opening message
6. You're in. Talk to him.

---

## Phase 2: Push to GitHub

```bash
git init
git add .
git commit -m "Silas v0.1 — foundation"

# Create private repo on GitHub
gh repo create silas --private --source=. --remote=origin --push

# Or via web: github.com/new → name "silas" → private → create → push manually:
# git remote add origin git@github.com:YOUR-USER/silas.git
# git push -u origin main
```

**Verify `.env.local` is NOT committed.** It's in `.gitignore` so it shouldn't be, but double-check `git status` shows no env files.

---

## Phase 3: Deploy to Vercel

1. Go to https://vercel.com → Sign in with GitHub
2. **Add New → Project** → Import your `silas` repo
3. Framework: Next.js (auto-detected)
4. **Environment Variables:** add all 8 from your `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `ANTHROPIC_API_KEY`
   - `OPENAI_API_KEY`
   - `NEXT_PUBLIC_SITE_URL` → set to your eventual Vercel URL (you can update after first deploy)
   - `ANTHROPIC_CHAT_MODEL`, `ANTHROPIC_CHEAP_MODEL`, `OPENAI_EMBEDDING_MODEL` (optional, defaults work)
5. **Deploy**
6. Wait ~2 min for first build
7. Get your URL: `silas-yourname.vercel.app` or similar

### 3.1 Update Supabase callback URL
1. Supabase → **Authentication → URL Configuration**
2. **Site URL:** `https://silas-yourname.vercel.app`
3. **Redirect URLs:** add `https://silas-yourname.vercel.app/api/auth/callback`
4. Save

### 3.2 Update Vercel env
1. Vercel → Project → Settings → Environment Variables
2. Update `NEXT_PUBLIC_SITE_URL` to your actual Vercel URL
3. Trigger redeploy: Deployments → ... → Redeploy

### 3.3 First production visit
1. Open your Vercel URL
2. Sign in with magic link — should work end-to-end
3. Onboarding triggers, Silas reads vault, replies

---

## Phase 4 (optional): custom domain

1. Buy domain (Namecheap, Cloudflare, etc.) — `silas.hudsongibbs.com` or wherever
2. Vercel → Project → Settings → Domains → Add domain
3. Follow DNS instructions (add CNAME)
4. Wait for propagation (~5 min to 24 hr)
5. Update Supabase callback URLs to new domain
6. Update `NEXT_PUBLIC_SITE_URL` to new domain
7. Redeploy

---

## Costs you should expect

**At zero users (just Hudson, daily use):**
- Vercel: $0 (free tier covers it)
- Supabase: $0 (free tier covers 500MB)
- Anthropic: ~$10-15/mo with Sonnet, ~$1-2/mo with Haiku
- OpenAI (embeddings): pennies/mo after migration
- **Total: ~$10-15/mo**

**Limits to watch:**
- Vercel: 100 GB bandwidth/mo (you'll use <1 GB solo)
- Supabase: 500 MB DB (7k notes ~ 50 MB), 2 GB egress/mo (fine for one user)
- Anthropic: pay-as-you-go, set a billing alert

**When to upgrade:**
- Supabase Pro ($25/mo) if DB > 500 MB or you want point-in-time recovery
- Vercel Pro ($20/mo) only if you go viral

---

## Operating notes

- **Killing autonomy (cost control):** Comment out the `extractAndSaveNote(...)` call in `src/app/api/chat/route.ts` to disable background note writing temporarily.
- **Reset onboarding:** POST to `/api/onboarding` (no body) to clear `onboarded` flag and re-trigger the first-visit experience.
- **Reset DB:** Supabase → SQL Editor → `truncate vault_notes, conversations, messages, silas_journal, user_state cascade;` (DESTRUCTIVE)
- **Backup vault:** Supabase → Database → Backups → Daily auto-backups on free tier. Can also export via `pg_dump`.
- **View Silas's writings:** SQL Editor: `select * from vault_notes where source = 'silas-wrote' order by created_at desc limit 50;`
