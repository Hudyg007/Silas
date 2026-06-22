# Silas — Architecture Deep Dive

For when you want to understand or extend the system. Pairs with `SILAS-BUILD-SPEC.md` which has the higher-level overview.

---

## Subsystem map

```
┌─ Browser (React) ─────────────────────────────────────┐
│  ChatInterface                                        │
│  ├── MessageList → MessageBubble                      │
│  ├── ChatInput                                        │
│  └── (Onboarding overlay on first visit)              │
│                                                       │
│  Auth: Supabase magic link → cookie session            │
└──────────────┬────────────────────────────────────────┘
               │ HTTPS (Server-Sent Events for chat stream)
┌──────────────▼────────────────────────────────────────┐
│  Next.js Server (Vercel)                              │
│                                                       │
│  /api/chat       → main chat handler with RAG         │
│  /api/onboarding → first-visit handler                │
│  /api/auth/callback → magic link exchange             │
│                                                       │
│  middleware.ts → refreshes auth on every request      │
└──────┬─────────────────────┬────────────────────────┘
       │                     │
       │ Anthropic           │ Supabase
       ▼                     ▼
   Claude API           Postgres + pgvector + Auth
   (chat + extraction)  (vault, conversations, journal)
                              │
                              │ Migration (one-time)
                              ▼
                        Local /Brain/ folder
```

---

## Data flow — chat with RAG

Detailed walkthrough of what happens between "user types message" and "Silas responds":

```
1. User types in ChatInput, presses Enter
2. ChatInterface.send(text) fires
3. Append optimistic user message + pending assistant message to React state
4. POST /api/chat { conversationId, message }
   │
   ├─ 4a. Server: auth check (createServer().auth.getUser())
   ├─ 4b. Server: get-or-create conversation row
   ├─ 4c. Server: embed user message → vector (OpenAI)
   ├─ 4d. Server: insert user message into messages table
   │
   ├─ 4e. Server: fetch last 10 messages from this conversation (history)
   │
   ├─ 4f. Server: parallel RAG queries:
   │        ├─ retrieveNotes(message): top-8 vault notes via match_vault_notes RPC
   │        └─ retrievePastMessages(message, convId): top-5 messages from OTHER conversations
   │
   ├─ 4g. Server: buildChatSystemPrompt({ notes, pastMessages })
   │        - Personality (SILAS_PERSONALITY)
   │        - Formatted retrieved notes
   │        - Formatted past message snippets
   │
   ├─ 4h. Server: anthropic.messages.stream({ system: prompt, messages: history })
   │
   └─ 4i. Server returns ReadableStream of SSE events:
            data: {"type":"delta","text":"..."}
            data: {"type":"delta","text":"..."}
            ...
            data: {"type":"done","conversationId":"..."}
5. Client reads stream, updates assistant message content in real time
6. When done event fires:
   - Stream closes
   - Server (in background, fire-and-forget):
     - Embeds full assistant response
     - Inserts assistant message into messages table
     - extractAndSaveNote() → Haiku call → if note-worthy, writes to vault_notes
7. Client sees pending=false, message renders final state
```

---

## Why this stack

**Next.js 15 with App Router** — Server Components let us do auth + DB queries at the server without a separate API server. Streaming responses (Server-Sent Events) work natively. Vercel runs it all on edge for cheap.

**Supabase** — One service for Postgres + pgvector + Auth + Storage. Free tier handles 500MB DB which is way more than 7k notes need. Magic link auth means no password headache. Real-time subscriptions available if we add presence/live features later.

**pgvector (inside Supabase)** — Vector search lives in the same Postgres that holds our notes. One database, one query, no separate vector DB to pay for. For 7k notes pgvector is plenty fast (ivfflat index, ~10ms per query).

**Anthropic Claude API** — Sonnet 4.6 for chat (smart, fast enough, good price). Haiku 4.5 for cheap background tasks like note extraction (10x cheaper). Streaming works perfectly.

**OpenAI for embeddings** — text-embedding-3-small is $0.02/1M tokens, smaller dims (1536) than text-embedding-3-large (3072) which keeps pgvector indexes small. Anthropic doesn't have a GA embeddings API yet; when they do, swap.

---

## What we explicitly didn't pick (and why)

| Considered | Why not |
|---|---|
| Astro | Less React-aware. App Router server actions are slicker. |
| SvelteKit | Smaller AI ecosystem (no anthropic SDK, etc.) |
| Cloudflare Pages | Edge runtime restrictions break some Anthropic SDK features |
| Firebase | Less SQL-native. Vector search worse than pgvector. |
| Pinecone | $70/mo minimum. Overkill for 7k notes. |
| Turbopuffer | Cheaper than Pinecone but still adds infra. pgvector wins. |
| Auth0/Clerk | Adds a subscription. Supabase Auth is free + integrated. |
| Vercel KV / Upstash Redis | We don't need a cache yet. Add when latency demands it. |

---

## Extension points

**Add a 3D brain visualization (v0.2):**
- Replace `.brain-placeholder` div in `globals.css` with a `<BrainCanvas />` client component
- Use `react-three-fiber` + `three.js`
- Port the Aurora-alive v4 widget logic but at scale (need WebGL for 7k nodes)
- Subscribe to chat events (via Supabase realtime) so brain regions light up when Silas references notes

**Add voice (v2):**
- Voice OUT: hit ElevenLabs streaming TTS in `/api/chat`, return audio bytes alongside text
- Voice IN: Web Speech API (browser-native, free) in `ChatInput.tsx`, transcribe → submit as text

**Add always-thinking daemon (v2):**
- Create `/api/daemon/tick` route that runs a Haiku call to generate a "thought"
- Set up Vercel Cron to hit `/api/daemon/tick` every 15 min during waking hours
- New thoughts insert into `silas_journal` and optionally trigger Web Push notification

**Add external integrations (v2):**
- Google Calendar/Gmail: Supabase has `pg_net` for HTTP calls; or run OAuth flow client-side
- Store user OAuth tokens encrypted in Supabase
- Pre-fetch relevant calendar events before each chat turn

---

## Testing manually (no automated tests yet)

1. **Auth:** Sign in, sign out, sign back in — session should persist
2. **Migration:** Run `pnpm migrate` twice — second run should skip already-migrated notes
3. **Chat with RAG:** Ask Silas "what did I write about X" where X is something in your vault — he should reference it specifically
4. **Total recall:** Have a conversation about topic Y. Start a new conversation. Ask "what did we talk about before about Y" — he should reference past conversation
5. **Note extraction:** Have a conversation containing a specific decision/insight. Check `silas_journal` and `vault_notes WHERE source='silas-wrote'` — should appear
6. **Onboarding:** Reset onboarded flag, refresh — should regenerate opening message

---

## When stuff breaks

- Check Vercel logs (Project → Deployments → Functions → see error stream)
- Check Supabase logs (Project → Logs → API logs)
- Check Anthropic dashboard (Console → Usage → see if you hit rate limits)
- Add `console.log` liberally to API routes — visible in Vercel function logs

---

## Performance gotchas

- **Cold starts:** Vercel functions cold-start in ~500ms. First request after idle is slow. Live with it on free tier; Pro tier has warm functions.
- **Embedding cost:** Every chat message embeds the user message (1 call). Adding RAG over past messages embeds the query ONCE (cached implicitly via the same vector). Each note insert during migration embeds. Optimize by batching where possible (migration script already does).
- **Vector search slowdown:** ivfflat index with `lists=100` works well for ~10k vectors. If you grow to 100k+, consider hnsw index instead.
- **Streaming buffer:** Vercel's edge runtime has tight memory limits. We use nodejs runtime for /api/chat to avoid issues with large prompts.
