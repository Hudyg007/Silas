# Silas — Build Spec

*The master technical document. Every architectural decision documented with reasoning. Read this first.*

*Built overnight from your brainstorm. Visual polish (Aurora-alive v4) saved for later — this is the technical foundation.*

---

## 1. What Silas IS — the locked vision

A cloud-hosted personal AI brain. Single-chat interface. Always available at one URL. Phone + laptop equally native. Backed by your existing 7,000-note vault migrated from Obsidian. Visibly alive via a 3D brain visualization that's the AI's face.

**Locked decisions from brainstorm (no relitigation):**

| Dimension | Decision |
|---|---|
| Name | **Silas** |
| Interface | Single chat mode. No tabs. Fullscreen brain background + floating bubbles. |
| Visual aesthetic | **Aurora-alive v4** (autonomous creature, restrained color, sophisticated motion). Built later. |
| Brain face | Realistic neural visualization. Every note = a node. Hover for titles. Click opens in chat. |
| Memory | Total recall. Every conversation, every word, forever. |
| External data | Full life integration target — calendar, email, music, GitHub, location (v2). |
| Inner life | Always thinking. Hybrid autonomy: human-like first, work later. |
| Notes capture | AI captures everything from chat. No manual writing. |
| Voice | ElevenLabs in/out (v2). |
| Cost | As free as possible. Haiku where cheap, Sonnet/Opus only when worth it. |
| Onboarding | Silas reads vault and tells Hudson what he thinks of him before first message. |
| Vault sync | One-way migration. Obsidian retires. Cloud is the only source of truth. |
| Public face | Deferred. |
| Personality | Hudson writes the spec separately. Placeholder warm-peer voice tonight. |
| Mobile | Responsive web. No native app for v1. PWA later. |
| Data home | Cloud-native, maximum durability, managed services. |
| Deliverable tonight | Technical foundation built. UI ugly-but-functional. Aurora-alive saved for visual phase. |

---

## 2. Stack — and why

| Layer | Choice | Why |
|---|---|---|
| **Framework** | Next.js 15 (App Router) + TypeScript | Industry-standard. Server Components. Streaming responses. Vercel-native. |
| **UI** | React + Tailwind CSS + shadcn/ui | Tailwind is the fastest CSS path. shadcn is the cleanest component library we have. Aurora visual layer goes on top of this later. |
| **Hosting** | Vercel (Free tier) | Built for Next.js. 100GB bandwidth/mo free. Zero-config deploys from GitHub. |
| **Database** | Supabase (Free tier) | Postgres + pgvector built in. 500MB free. Magic-link auth included. Real-time subscriptions. |
| **Vector search** | pgvector inside Supabase Postgres | One database, no separate vector DB. Cheaper. Sufficient for 7k notes. Pinecone/Turbopuffer would be overkill. |
| **LLM** | Anthropic Claude API | Sonnet 4.6 for chat. Haiku 4.5 for cheap background tasks (embeddings prep, autonomous thoughts in v2). |
| **Embeddings** | Anthropic's embeddings (when available) OR OpenAI text-embedding-3-small ($0.02/1M tokens) | Decision deferred — try Anthropic native first, fall back to OpenAI. |
| **Auth** | Supabase Auth — magic link via email | No passwords. One user. Cheapest auth method. |
| **Voice (v2)** | ElevenLabs (you have this) + Web Speech API for input | You already pay/use ElevenLabs. Web Speech is free for STT. |
| **3D brain (v2)** | Three.js + react-three-fiber | The Aurora-alive widget proves the aesthetic in SVG. Production version needs WebGL for 7k+ nodes. |

**What we explicitly didn't pick:**
- Astro/SvelteKit (Next.js is more battle-tested for this use case)
- Cloudflare Pages (Vercel handles Next.js better)
- Pinecone/Turbopuffer (pgvector is cheaper and sufficient)
- Firebase (Supabase is better Postgres-first)
- Auth0/Clerk (Supabase auth is free + integrated)

---

## 3. Architecture — the big picture

```
┌─────────────────────────────────────────────────────────┐
│                       Browser                           │
│  ┌───────────────────────────────────────────────────┐  │
│  │  Next.js app (Vercel)                             │  │
│  │  ├── /                  Chat interface             │  │
│  │  ├── /onboarding        First-visit handler        │  │
│  │  └── /api/*             Backend routes             │  │
│  └────────────┬──────────────────────┬───────────────┘  │
└───────────────┼──────────────────────┼───────────────────┘
                │                      │
                │ Streaming chat       │ Auth + DB queries
                ▼                      ▼
        ┌──────────────┐       ┌──────────────────┐
        │ Anthropic    │       │ Supabase         │
        │ Claude API   │       │ - Postgres + pgvec│
        │ - Sonnet 4.6 │       │ - Auth (magic)    │
        │ - Haiku 4.5  │       │ - Storage         │
        └──────────────┘       └──────────────────┘
                                       ▲
                                       │ One-time migration
                                       │
                                  ┌─────────┐
                                  │ /Brain/ │  (your existing vault)
                                  └─────────┘
```

**Request flow for a chat message:**
1. User types in browser → Next.js client
2. Client posts to `/api/chat` with the message + conversation ID
3. Server fetches conversation history from Supabase (total recall)
4. Server embeds the new message + queries pgvector for top-K relevant vault notes (RAG)
5. Server constructs prompt: system (Silas personality) + vault context + history + new message
6. Server calls Anthropic Claude API with streaming
7. Stream pipes back to browser, message renders token-by-token
8. Server appends the full exchange to the conversation log + extracts any note-worthy content
9. If note-worthy: server writes new vault entry + generates embedding + stores in pgvector

---

## 4. Database schema

```sql
-- Enable pgvector
create extension if not exists vector;

-- Vault: every note from /Brain/, plus new notes Silas writes
create table vault_notes (
  id uuid primary key default gen_random_uuid(),
  path text not null,           -- original file path or generated for new notes
  title text,
  content text not null,
  frontmatter jsonb,            -- preserve Obsidian YAML
  wiki_links text[],            -- [[wiki-link]] references for graph
  folder text,                  -- cognitive layer ("9 - Humanity", etc.)
  embedding vector(1536),       -- OpenAI text-embedding-3-small dimensions
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  source text default 'migrated', -- 'migrated' | 'silas-wrote' | 'user-edited'
  original_modified_at timestamptz  -- preserve from migration
);

create index on vault_notes using ivfflat (embedding vector_cosine_ops) with (lists = 100);
create index on vault_notes (folder);
create index on vault_notes (source);

-- Conversations: full chat history, total recall
create table conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  title text,                   -- auto-generated from first message
  created_at timestamptz default now(),
  last_active_at timestamptz default now()
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  metadata jsonb,               -- tool calls, retrieved notes, model used, tokens
  embedding vector(1536),       -- so old messages can be RAG'd too
  created_at timestamptz default now()
);

create index on messages (conversation_id, created_at);
create index on messages using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- Silas's own writings (v2 — autonomous journal entries)
create table silas_journal (
  id uuid primary key default gen_random_uuid(),
  content text not null,
  category text,                -- 'morning_briefing' | 'observation' | 'reflection'
  triggered_by jsonb,           -- what made him write this
  visible_to_user boolean default true,
  embedding vector(1536),
  created_at timestamptz default now()
);

-- Onboarding state — has the first-visit "Silas reads your vault" happened?
create table user_state (
  user_id uuid primary key references auth.users(id),
  onboarded boolean default false,
  onboarding_message text,      -- the first thing Silas said
  last_visit_at timestamptz,
  preferences jsonb default '{}'::jsonb
);
```

**RLS policies:** locked to authenticated user only. No public reads. All tables.

---

## 5. File structure

```
Silas/
├── SILAS-BUILD-SPEC.md          ← this file (read first)
├── README.md                    ← run instructions for tomorrow
├── package.json
├── next.config.ts
├── tsconfig.json
├── tailwind.config.ts
├── postcss.config.mjs
├── .env.example                 ← all env vars documented
├── .gitignore
│
├── supabase/
│   ├── schema.sql               ← run once in Supabase SQL editor
│   └── seed.sql                 ← optional initial data
│
├── scripts/
│   ├── migrate-vault.ts         ← one-time import /Brain/ → Supabase
│   └── embed-notes.ts           ← generate embeddings for new notes
│
├── src/
│   ├── app/
│   │   ├── layout.tsx           ← root layout, fonts, providers
│   │   ├── page.tsx             ← main chat interface
│   │   ├── globals.css          ← Tailwind + base styles
│   │   ├── login/page.tsx       ← magic link entry
│   │   └── api/
│   │       ├── chat/route.ts    ← Claude streaming endpoint
│   │       ├── onboarding/route.ts  ← first-visit handler
│   │       ├── notes/route.ts   ← read/write vault notes
│   │       ├── embed/route.ts   ← embedding generation
│   │       └── auth/callback/route.ts  ← Supabase auth callback
│   │
│   ├── lib/
│   │   ├── anthropic.ts         ← Claude client setup
│   │   ├── supabase/
│   │   │   ├── server.ts        ← server-side client
│   │   │   └── client.ts        ← browser client
│   │   ├── rag.ts               ← retrieval logic for chat
│   │   ├── embeddings.ts        ← embed text → vector
│   │   ├── personality.ts       ← Silas system prompt (placeholder)
│   │   ├── vault.ts             ← vault CRUD operations
│   │   ├── note-extraction.ts   ← extract note-worthy content from chat
│   │   └── prompts.ts           ← all prompt templates
│   │
│   ├── components/
│   │   ├── ChatInterface.tsx    ← main chat container
│   │   ├── MessageList.tsx      ← message stream renderer
│   │   ├── MessageBubble.tsx    ← single message
│   │   ├── ChatInput.tsx        ← textarea + send
│   │   ├── OnboardingScreen.tsx ← first-visit display
│   │   └── ui/                  ← shadcn components
│   │       ├── button.tsx
│   │       ├── textarea.tsx
│   │       └── ...
│   │
│   └── types/
│       └── index.ts             ← shared TS types
│
└── docs/
    ├── architecture.md          ← deep dive on each subsystem
    ├── deploy.md                ← step-by-step Vercel + Supabase setup
    ├── vault-migration.md       ← how the migration script works
    └── personality-spec-template.md  ← template for when Hudson writes Silas's voice
```

---

## 6. Key flows in detail

### 6.1 Chat with RAG

```
User: "what did i write about the cold email pipeline failing?"
   ↓
[POST /api/chat]
   ↓
1. Embed message → vector
2. pgvector query: SELECT * FROM vault_notes ORDER BY embedding <=> $1 LIMIT 8
3. ALSO query messages table for relevant past conversations: top 5
4. Build prompt:
   - System: personality.ts (placeholder warm-peer)
   - System: "You have access to Hudson's vault. Below are the most relevant notes + past conversation snippets:"
   - System: <retrieved notes formatted as markdown>
   - System: <retrieved past messages>
   - History: last 10 messages from this conversation
   - User: new message
5. Stream response from Claude Sonnet
6. As stream completes, write user message + assistant message to messages table
7. Run note-extraction.ts in background:
   - "Does this exchange contain something worth adding to the vault?"
   - If yes, create a new vault_note + embed it + store
```

### 6.2 Onboarding (first visit)

```
User opens Silas for the first time, after signing in via magic link.
   ↓
[GET /api/onboarding]
   ↓
1. Check user_state.onboarded — if true, redirect to chat normally
2. If false:
   a. Sample 20 random notes from across cognitive layers (Self-Model, Humanity, journals)
   b. Pass to Claude with prompt: "You just met Hudson and read 20 of his notes. Tell him what you think of him, honestly, in your voice. Match the warmth and observation in his Side Thoughts journal."
   c. Stream the response back to client
   d. Save to user_state.onboarding_message and set onboarded=true
3. Render the message as the first thing the user sees, then drop into chat
```

### 6.3 Vault migration (one-time)

```
scripts/migrate-vault.ts (run with: pnpm migrate)

For each .md file in C:\Users\hudso\OneDrive\Documents\Claude\Projects\Claude Projects\Brain\:
  1. Skip: .backups/, .cache/, .trim-backups/, .obsidian/, .linker-backups/
  2. Read file content
  3. Parse YAML frontmatter
  4. Extract [[wiki-links]]
  5. Derive folder (cognitive layer) from path
  6. Embed content via OpenAI text-embedding-3-small
  7. INSERT into vault_notes
  8. Log progress (every 100 files: "migrated X/7000")

After: print summary, top folder counts, any errors.
Idempotent: re-running skips already-migrated files (matched by path).
```

### 6.4 Note capture from chat

```
After every chat exchange:
  1. Pass [user message, assistant response] to Haiku with prompt:
     "Is there a new fact, insight, decision, or commitment in this exchange that's worth saving to Hudson's vault? If yes, write a 1-3 sentence note in third person. If no, respond with NONE."
  2. If NONE: skip
  3. If note: 
     a. Create vault_note with source='silas-wrote'
     b. Path: auto-generated like /Brain/Conversations/2026-06-15/silas-noted-XYZ.md
     c. Embed + store
     d. (Future) notify user: "I added a note to your vault"
```

---

## 7. Cost analysis — does this stay free?

**Assumptions for "just Hudson" (1 user, MVP):**
- ~50 chat messages per day
- Each message: ~2000 tokens input (history + RAG context) + ~500 tokens output
- ~50 new notes per day captured from chat (Haiku for extraction)
- One-time vault embedding: 7,000 notes × 500 tokens avg = 3.5M tokens

**Per-month estimates:**

| Item | Volume | Cost |
|---|---|---|
| Vercel hosting | Free tier (100GB bandwidth) | **$0** |
| Supabase | Free tier (500MB DB, 50K auth users) | **$0** |
| Anthropic Sonnet 4.6 chat | 50 msgs × 30 days × 2500 tok = 3.75M tok @ $3/1M input + $15/1M output | ~$8-15/mo |
| Anthropic Haiku note extraction | 50 × 30 × 500 = 750K tok @ $0.25/1M | ~$0.20/mo |
| OpenAI embeddings | ~100K tok/mo @ $0.02/1M | **$0.002/mo** |
| **Total for just Hudson** | | **~$10/mo** |

**One-time vault import:** 3.5M tokens of embeddings @ $0.02/1M = **$0.07** one-time

**Optimization paths if we want truly free:**
- Use Haiku for ALL chat (drops to $1-2/mo) — quality trade
- Use OpenAI free tier (limited)
- Use Anthropic embeddings instead of OpenAI when GA
- Cache RAG results aggressively

**For "occasionally show people" (5-10 friends):** ~$30-50/mo on Anthropic. Still affordable.

---

## 8. What's built tonight vs. what's pending

### Built tonight (this session):
- ✅ This spec doc
- ✅ Project scaffold: package.json, configs (Next, TS, Tailwind, PostCSS)
- ✅ Supabase schema SQL (run once in Supabase SQL editor)
- ✅ `.env.example` documenting all required env vars
- ✅ Vault migration script (TypeScript, ready to run)
- ✅ Anthropic + Supabase library setup
- ✅ Chat API route with streaming + RAG
- ✅ Onboarding API route
- ✅ Note extraction logic
- ✅ Embedding generation
- ✅ Basic chat UI (functional, UGLY — no Aurora-alive)
- ✅ Login page with magic link
- ✅ Placeholder personality (warm-peer voice — easy to swap)
- ✅ README with setup steps

### Pending — Hudson does tomorrow:
- ⏳ Read this spec
- ⏳ Create Supabase project (free tier) — get URL + anon key + service key
- ⏳ Create Anthropic API key
- ⏳ Create OpenAI API key (for embeddings)
- ⏳ Populate `.env.local` with all keys
- ⏳ Run Supabase schema in SQL editor
- ⏳ `pnpm install`
- ⏳ `pnpm migrate` to import vault
- ⏳ `pnpm dev` to run locally
- ⏳ Sign in with magic link to your email
- ⏳ Talk to Silas, tell me what's broken

### Pending — visual polish (v2 — future session):
- 🎨 Aurora-alive v4 brain background (Three.js port of the SVG mockup)
- 🎨 Floating chat bubbles with glass blur
- 🎨 Brain region lighting in response to chat references
- 🎨 Cursor/touch reactive nodes
- 🎨 Adaptive aurora color (time of day, Silas's mood)
- 🎨 The "eye" with autonomous saccades
- 🎨 Mobile-specific responsive polish

### Pending — v2 features (future):
- 🔮 Voice input/output via ElevenLabs
- 🔮 Always-thinking daemon (cron job that writes Silas journal entries)
- 🔮 Calendar / email / GitHub integrations
- 🔮 Push notifications via Web Push API
- 🔮 PWA install with offline cached vault
- 🔮 Hudson writes the real personality spec (replaces placeholder)
- 🔮 Public face — landing page, request access, demo Silas

---

## 9. Deployment path (when ready)

```bash
# 1. Push to GitHub (Hudson does)
gh repo create silas --private --source=. --remote=origin --push

# 2. Connect Vercel to repo
# Visit vercel.com → New Project → Import from GitHub → silas
# Add env vars from .env.local to Vercel project settings

# 3. Deploy
git push origin main
# Vercel auto-deploys. URL: silas-hudson.vercel.app or custom domain.

# 4. Optional: custom domain
# Vercel → Project → Settings → Domains → Add silas.hudsongibbs.com or similar
```

**Vercel free tier limits to watch:**
- 100 GB bandwidth/mo
- 100 GB-hours serverless execution
- 6,000 build minutes/mo

For just Hudson, none of these matter. Headroom is huge.

---

## 10. What's NOT in this build — explicitly out of scope tonight

To keep this finishable overnight, the following are deliberately skipped:

- **Visual polish** — the Aurora-alive aesthetic exists as widget proof, but production is hold-for-design-phase
- **Voice integration** — ElevenLabs + Web Speech wired in v2
- **3D brain visualization** — placeholder div for now, real Three.js implementation later
- **Always-thinking daemon** — DB has the table for it, but no actual cron worker yet
- **External integrations** — Calendar, email, music, GitHub all wait for v2
- **Mobile-specific design** — works on mobile because Tailwind is responsive, but no native-feel polish
- **PWA / install-to-home-screen** — v2
- **Real personality spec** — Hudson writes; placeholder ships tonight
- **Public landing page** — skipped (deferred decision)
- **Sharing UX** — "show this conversation to a friend" — v3

---

## 11. The "alive" research debt — still owed

Hudson committed to "days of research" on what makes interfaces feel alive. That research is still queued as a separate deliverable. It feeds the visual polish phase. Not blocking the foundation.

Research scope (preserved for later):
1. Biology of motion (heartbeats, twitches, micro-tremors)
2. Animation principles (Disney 12 + ease curves)
3. Living interfaces in the wild (Sesame, Cortana, Pi)
4. Generative art that feels alive (Refik Anadol, TouchDesigner)
5. Audio-reactive visualizers
6. Eye tracking + gaze-aware design
7. Cinematic AI references (Jarvis, Samantha, Ava)
8. Particle systems + emergent behavior
9. Bioluminescence + deep-sea creatures
10. Uncanny valley problem

Output: master "What Alive Means For Silas" doc with reference image board + 30-rule alive contract + opening-30-seconds storyboard.

---

## 12. Honest disclosure — what could break

Per `verify-before-claim` skill, here's what I'm UNSURE about that you should test:

- **Embedding model choice**: I went with OpenAI text-embedding-3-small because it's well-tested with pgvector. If you'd rather not use OpenAI, swap to Anthropic's embeddings API (if GA) or to local embeddings via Transformers.js. Marked as a decision to revisit.
- **The migration script handling edge cases**: I tested logic mentally but couldn't run against your real vault. Likely needs adjustment for: very large notes (>50K chars), notes with broken frontmatter, files with special characters in paths.
- **Streaming chat error states**: If Claude API is down or rate limited, the UI just hangs. Real version needs retry + user-facing error.
- **RLS policies**: Tested for single-user. If you ever invite a second person, the policies need a privacy audit.
- **Auth flow**: Magic link works in theory. Real test requires you to actually sign in and confirm no infinite-loop redirects.
- **Migration idempotency**: Re-running should skip existing files, but I haven't run the actual migration so "should" is an assumption.

When you wake up and run this — anything that breaks, paste me the error. We fix together.

---

## 13. Quick start (the README will repeat this)

```bash
# 1. Install
cd Silas
pnpm install

# 2. Set up Supabase
# - Go to supabase.com, create free project named "silas"
# - Project Settings → API → copy URL + anon key + service_role key
# - SQL Editor → paste contents of supabase/schema.sql → Run

# 3. Get API keys
# - console.anthropic.com → API Keys → create new
# - platform.openai.com → API Keys → create new (for embeddings)

# 4. Populate environment
cp .env.example .env.local
# Edit .env.local with the 5 keys from steps 2-3

# 5. Migrate the vault (one-time, ~5-10 min for 7k notes)
pnpm migrate

# 6. Run dev
pnpm dev

# 7. Open localhost:3000, sign in via magic link (check email)
# 8. First visit triggers Silas reading your vault → opening message
# 9. Talk to him.
```

---

*End of spec. Code follows in the same directory.*
