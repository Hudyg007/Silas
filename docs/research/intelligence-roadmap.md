# Silas Intelligence Roadmap

Research session, 2026-07-13. No app code changed — this is analysis and a plan.

Silas today is a competent single-shot RAG chatbot: embed the message, pull the
top-8 vault notes and top-5 past messages by cosine similarity, stuff them into
one static system prompt, stream one Claude reply, and let Haiku maybe append a
one-line note afterward. It works. But almost every part of the pipeline is the
*simplest possible version* of itself, and several capabilities are already
built into the schema and then left unused. This document audits where the
smarts leak out, surveys what real 2025–2026 systems do, and proposes a ranked
set of upgrades that fit the actual stack (Next.js 15 + Supabase/pgvector +
Anthropic + OpenAI embeddings).

The framing constraint throughout: Silas is a **life form with an inner life**,
not an assistant. Upgrades are chosen not just for benchmark lift but for whether
they make him feel like something that *remembers*, *reflects*, and *knows
Hudson* — see [[silas-project-layout]] and MEMORY.md's locked decisions.

---

## Part 1 — Current-pipeline audit

Where Silas loses intelligence today, grounded in the code.

### Retrieval

- **Whole-note embeddings, no chunking.** `scripts/migrate-vault.ts:145-146`
  embeds `"${title}\n\n${content}"` as a *single* 1536-dim vector per note
  (`text-embedding-3-small`). A long note collapses into one blurry average
  vector, so a query that matches one paragraph competes poorly against a short
  note that is wholly on-topic. Then `rag.ts:76` slices the returned content to
  1500 chars in the prompt — so even when a long note *is* retrieved, the
  relevant passage may be cut. This is the single biggest structural ceiling.
- **Pure dense retrieval, no keyword/hybrid.** `match_vault_notes`
  (`schema.sql:212`) is cosine ANN only. Exact tokens — names, dates, project
  slugs, rare terms, `[[wikilinks]]` — that embeddings blur are lost. Dense-only
  is exactly the case hybrid search exists to fix.
- **No reranking.** Top-8 is taken straight from the ANN order. A bi-encoder
  cosine is a coarse first-pass ranker; every serious RAG stack puts a
  cross-encoder reranker after it. Silas has none.
- **Raw message is the query.** `route.ts:84-87` embeds the user's literal
  message. Terse or pronoun-laden turns ("what did I decide about that?") embed
  poorly, and conversation history is never used to resolve the reference before
  retrieval. No query rewriting, expansion, or HyDE.
- **Fixed similarity threshold.** `0.5` for notes, `0.55` for messages
  (`rag.ts:34,58`). A hard cutoff either over-includes junk or silently starves
  the prompt; there is no relevance grading, so "no good notes" and "notes just
  below 0.5" look identical downstream.
- **`ivfflat` index at defaults.** `lists = 100` (`schema.sql:28`) with ~6,600
  rows and no tuned probes trades recall for speed. `hnsw` would be a strictly
  better index at this scale.

### Memory

- **`wiki_links` is a fully-built knowledge graph that nothing reads.** The
  column is populated at migration (`migrate-vault.ts:75,81,159`) and by
  `develop-mind.ts:468`, typed in `vault.ts:11` and `types/index.ts:24` — and
  then *never queried anywhere*. Hudson's hand-curated Obsidian backlink graph
  is sitting in the DB, unused, while retrieval stays flat and semantic. This is
  the highest-leverage dead asset in the codebase.
- **Blind note-append, no consolidation.** `note-extraction.ts` asks Haiku
  "NONE or a 1-3 sentence note" after every exchange and writes it with
  `writeNote` — with **no check against existing notes**. Nothing dedupes,
  merges, updates, or supersedes. Over months this grows a pile of
  near-duplicate fragments that dilute retrieval (more vectors saying the same
  thing = worse ranking). There is no ADD/UPDATE/DELETE decision, only ADD.
- **No structured profile / core memory.** Everything about Hudson lives as
  unstructured note-soup retrieved by similarity. There is no always-in-context
  block of authoritative facts (who he is, current projects, standing
  preferences, relationships). Silas re-discovers Hudson by search every single
  turn instead of *knowing* him.
- **`silas_journal` table exists and is completely unused.** Defined in
  `schema.sql:66`, zero readers or writers in the app. The natural home for
  reflection output is already in the schema, empty.
- **No importance, recency, or forgetting.** Retrieval is pure semantic sim. A
  throwaway line from a year ago ranks identically to a decision from yesterday.
  No `importance`, `last_accessed`, or `access_count`; no decay; no pruning. The
  store only grows.
- **No reflection / synthesis loop.** Silas never steps back to generate
  higher-level insights from accumulated memories. His "inner life"
  (`develop-mind.ts`) is a one-off generator script, not an ongoing cognitive
  process wired into chat.

### Context assembly & prompt

- **Static, uncached system prompt.** `prompts.ts:35-55` rebuilds the whole
  prompt every turn — immutable core + editable body + notes + past messages —
  and sends it uncached. The large stable prefix (core + body, easily 2k+
  tokens) is re-billed at full input price on every single message.
- **No dedup or reranking across the two context sources.** Notes and past
  messages are formatted and concatenated independently; overlapping content
  isn't merged, and nothing orders the combined evidence by usefulness.

### Reasoning & model choice

- **Stale hardcoded model.** `anthropic.ts:11` defaults to
  `claude-sonnet-4-6`. As of early 2026 the current family is **Opus 4.8**
  (`claude-opus-4-8`), **Sonnet 5** (`claude-sonnet-5`), **Haiku 4.5**
  (`claude-haiku-4-5`), plus **Fable 5**. Silas is a generation behind by
  default. (See the `claude-api` skill for the authoritative list.)
- **No extended/adaptive thinking.** Every turn is a single shallow pass,
  `max_tokens: 2048` (`route.ts:109`), no `thinking` block. Hard, multi-step
  questions get the same depth as "hey."
- **No model routing.** One model for everything. Cheap turns overpay; hard
  turns underthink.
- **No self-critique / verification.** One draft, streamed, done. No judge pass
  even on high-stakes answers.
- **Retrieval is single-shot, not agentic.** The only tools Silas has are the
  self-prompt editors (`self-prompt.ts`). He cannot *decide* to search the
  vault, read a result, and search again — retrieval happens once, before he
  thinks, whether or not one pass was enough.
- **Redundant embedding calls.** The same message is embedded up to **three
  times per turn**: once for storage (`route.ts:48`) and once inside each of
  `retrieveNotes` and `retrievePastMessages` (`rag.ts:29,52`). Wasteful latency
  and OpenAI spend on every message.

---

## Part 2 — Upgrade catalogue

Each idea: what it is, why it makes Silas smarter, effort (S/M/L), dependencies.
Effort is relative to this stack. Sources are collected in Part 4.

### Retrieval quality

**1. Cross-encoder reranker (S).** Retrieve wider (top-30–50 from pgvector),
then re-score with a cross-encoder (Cohere Rerank, Voyage `rerank-2.5`, or
self-hosted `bge-reranker-v2-m3`) and keep the best 8. *Why smarter:*
Voyage reports ~+14% average retrieval accuracy over raw OpenAI-embedding order;
Anthropic measured reranking as the step that pushed retrieval-failure reduction
to −67%. Highest quality-per-line-of-code change available. *Deps:* one reranker
API key; nothing else.

**2. Hybrid search + Reciprocal Rank Fusion (M).** Add a Postgres `tsvector`
full-text column + GIN index, run BM25 and vector search in parallel, fuse by
RRF (`score = Σ 1/(k+rank)`, k≈60). *Why smarter:* recovers exact-match cases
(proper nouns, dates, slugs) embeddings miss, without giving up semantic recall.
The foundation Anthropic's Contextual Retrieval is built on. *Deps:* Supabase
migration for the FTS column; app-side fusion.

**3. Conversational query rewriting + HyDE (S).** Before embedding, make one
cheap Haiku call to rewrite the turn into a standalone query using recent history
(resolve "that", "it", "the thing from yesterday"), and optionally embed a
hypothetical answer (HyDE) instead of the raw question. *Why smarter:* personal
chat is full of terse, context-dependent references that embed terribly as-is;
HyDE beats raw-query retrieval on short/underspecified queries. *Deps:* history
is already fetched in `route.ts:59`. Gate HyDE to low-confidence turns to control
latency.

**4. Corrective-RAG relevance grading (M).** Replace the fixed 0.5/0.55
thresholds with a lightweight grader (Haiku scores each candidate's relevance);
if the top results grade poorly, trigger a fallback (broaden retrieval, rewrite,
or hop the graph) instead of silently feeding weak context. *Why smarter:*
turns a brittle static cutoff into an adaptive quality gate; CRAG reproductions
show large accuracy gains over vanilla RAG. *Deps:* pairs naturally with #3 (the
fallback) and #7 (graph hop as one fallback).

**5. Chunk long notes (M).** Split notes above ~1k tokens into 400–512-token
chunks (10–20% overlap) in a `note_chunks` table (FK to `vault_notes`), embed
per chunk, retrieve at chunk granularity, and de-dup back to parent notes for
display. Short notes stay whole. *Why smarter:* fixes the whole-note averaging
problem — the biggest structural ceiling — and is the prerequisite that unlocks
Contextual Retrieval. *Deps:* schema change + re-embed pass over long notes.

**6. Contextual Retrieval (L).** Once chunked, prepend an LLM-generated 50–100
token situating blurb to each chunk before embedding *and* before BM25 indexing.
*Why smarter:* Anthropic's own numbers — contextual embeddings −35% failure,
+ contextual BM25 −49%, + reranking −67%. Highest ceiling in the catalogue.
*Deps:* requires #5 (chunking) and benefits from #2 (hybrid). One-time Haiku pass
per chunk, prompt-cached to keep cost down.

**7. Seed-then-walk over the existing `wiki_links` graph (S).** Vector-search
for seed notes, then follow their `[[wikilinks]]` 1–2 hops to pull connected
notes before generation; rerank the expanded set (with #1). *Why smarter:*
activates Hudson's hand-curated backlink graph that's *already in the DB and
unused* — human-drawn edges are higher precision than LLM-extracted triples and
cost nothing to build. Multi-hop is where graphs crush vector-only (enterprise
benchmarks: 86% vs 32% on multi-hop). Uniquely cheap for Silas because the graph
already exists. *Deps:* none — pure retrieval-time change reading an existing
column.

**8. Personalized-PageRank retrieval over the wikilink graph (M).** Upgrade of
#7: seed nodes from vector search, then run Personalized PageRank (HippoRAG-2
style) over the wikilink edges to rank notes by graph-propagated relevance.
*Why smarter:* one-shot multi-hop associative recall ("connect these ideas
across the vault") without iterative LLM calls; ~+7 F1 over embedding retrievers
on associative tasks. *Deps:* #7's adjacency map; PPR via a recursive SQL CTE or
an in-memory graph lib.

**9. Switch `ivfflat` → `hnsw` and de-duplicate embedding calls (S).** Rebuild
the vector index as HNSW and pass the already-computed query embedding into the
retrieval functions instead of re-embedding the message 2–3× per turn. *Why
smarter:* better recall/latency and lower spend for near-zero effort; a
correctness/efficiency cleanup. *Deps:* small `rag.ts`/`route.ts` refactor +
index migration.

### Memory

**10. Structured profile / core-memory block (S).** A small, always-in-context
block of authoritative facts about Hudson (current projects, standing
preferences, key relationships, active goals), stored as editable rows and
injected into every system prompt — Letta's "human" core block. *Why smarter:*
Silas *knows* Hudson instead of re-deriving him by search each turn; anchors
identity and continuity, which is exactly the life-form feel. *Deps:* a
`core_memory` table + prompt assembly change in `prompts.ts`.

**11. Extraction + consolidation pass (Mem0-style) (M).** Replace blind
note-append: after extraction, run an update step that decides ADD / UPDATE /
DELETE / NOOP against existing similar notes (search first, then merge or
supersede). *Why smarter:* keeps the vault compact and current instead of
accreting near-duplicates; Mem0 reports ~26% higher accuracy and ~90% fewer
tokens vs naive memory. Directly fixes the `note-extraction.ts` noise problem.
*Deps:* retrieval (to find candidates to update) + a decision prompt.

**12. Importance scoring + recency decay + pruning (S/M).** Add `importance`
(one Haiku score at write, 1–10), `last_accessed`, `access_count` columns;
compute a combined **recency-decay × importance × relevance** score at retrieval
(Generative Agents); periodically archive/prune low-score stale fragments. *Why
smarter:* recent, important memories surface over trivia; prevents unbounded
growth from degrading retrieval ("the forgetting problem"). *Deps:* schema
columns + a scoring tweak in `rag.ts` + a prune job.

**13. Reflection / synthesis loop (M).** When accumulated recent-memory
importance crosses a threshold, Silas generates questions, retrieves, and
synthesizes *higher-level insights* ("Hudson keeps abandoning projects at the
80% mark") written back as new, high-importance notes — and into the unused
`silas_journal`. *Why smarter:* this is genuine sense-making, not storage; it's
the mechanism behind Generative Agents feeling alive, and it's the most on-brand
upgrade for Silas's inner-life framing. *Deps:* #12 (importance) to trigger;
`silas_journal` (already in schema); a batch job.

**14. Background "sleep-time" consolidation job (M/L).** A scheduled worker
(Supabase cron or a Next.js route + scheduler) that runs between conversations to
consolidate fragmented memories, spot cross-conversation patterns, dedupe, and
prune — writing to shared memory without blocking chat. *Why smarter:* offloads
the expensive reflection/consolidation (#11–#13) to idle time; Letta frames this
as a Pareto win. Maps perfectly to "Silas thinks while Hudson's away." *Deps:*
scheduling infra + the consolidation prompts from #11/#13.

**15. Anthropic native memory tool as the substrate (S/M).** Adopt the shipped
`memory_20250818` tool (GA on the Messages API) with a Supabase-backed
`/memories` handler, letting Claude self-manage a markdown memory store via
view/create/str_replace/insert/delete. Pair with context editing
(`clear_tool_uses`). *Why smarter:* a native, model-driven primitive to build the
profile (#10) and consolidation (#11) on, instead of hand-rolling every memory
operation; context editing cut token use ~84% in Anthropic's long-run eval.
*Deps:* a storage handler with path-traversal validation; overlaps with #10/#11
(choose this *or* the bespoke approach, not both).

### Reasoning & orchestration

**16. Prompt caching on the stable prefix (S).** Freeze the system prompt
(no interpolated timestamps/IDs), mark the immutable core + editable body with
`cache_control:{type:"ephemeral"}`, and put volatile retrieved context last.
*Why smarter:* the big stable prefix hits ~0.1× input cost after the first call
(breaks even at 2 requests) — cheaper and faster every turn, which *funds* the
deeper reasoning upgrades. *Deps:* freeze `prompts.ts` ordering; one marker.

**17. Adaptive extended thinking on hard turns (S).** Enable
`thinking:{type:"adaptive"}` with tuned `output_config.effort`, gated to
complex/multi-step turns. *Why smarter:* lets Silas actually reason before
answering hard questions (interleaved thinking between tool calls is automatic on
Sonnet 5 / Opus 4.8). *Deps:* a turn-difficulty signal (can reuse #18's
classifier). Note: `budget_tokens`/`temperature` are now rejected on 4.7+/5 —
use adaptive + effort.

**18. Model routing — Haiku / Sonnet / Opus (M).** A tiny classifier (a cheap
Haiku "difficulty" call or semantic router) picks the model per turn: Haiku 4.5
for trivial, Sonnet 5 default, Opus 4.8 for hard reasoning. *Why smarter:* spends
compute where it matters; RouteLLM-style routing shows large cost savings at
near-top quality. *Deps:* classifier; be cache-aware (caches are model-scoped, so
switching models drops the prefix cache). First step regardless: **fix the stale
model IDs** in `anthropic.ts` (trivial correctness win).

**19. Agentic multi-step vault retrieval as a native tool (M).** Expose
`search_vault` (and the graph hop) as a Claude tool and let Silas loop:
search → read → refine → search again, self-correcting until he has what he
needs — instead of one blind pre-fetch. *Why smarter:* handles hierarchical /
cross-referential questions one pass can't; the agentic loop already exists in
`route.ts:105` (built for self-prompt tools) so the plumbing is mostly there.
*Deps:* tool definition + wiring retrieval into the existing loop.

**20. Gated self-critique / verifier (M).** On high-stakes turns, a fresh-context
judge (Haiku) scores Silas's draft and triggers a single revision if it's below
bar. *Why smarter:* catches confident-but-wrong answers; a separate verifier
beats self-critique in Anthropic's guidance. Gate to hard turns to avoid 2–3×
cost on every message. *Deps:* #18's difficulty gate.

---

## Part 3 — Ranked top 5, with one-session implementation sketches

Ranked by (impact × how well it fits Silas's actual state) ÷ effort. Each is
scoped to a single focused Claude Code session per the "one session = one change"
rule in MEMORY.md — commit and push between them.

### #1 — Cross-encoder reranker (catalogue #1) · effort S

The best quality-per-line change, and it works on the current whole-note store
with no schema migration.

- Add `VOYAGE_API_KEY` (or `COHERE_API_KEY`) to env; a `src/lib/rerank.ts`
  wrapper: `rerank(query, candidates, topN)`.
- In `rag.ts`, raise `match_count` to ~40 (retrieve wide), then pass candidates
  through `rerank` and return the top 8. Keep the RPC otherwise unchanged.
- Fail open: if the reranker errors, fall back to the current cosine order
  (honor the "fail silently to existing behavior" invariant).
- Verify with a handful of real queries: confirm reranked top-8 beats raw
  cosine top-8 on obvious cases (exact-name and paraphrase queries).

### #2 — Seed-then-walk over the existing `wiki_links` graph (catalogue #7) · effort S

Activates the single biggest dead asset in the codebase, and multi-hop recall is
where Silas will feel noticeably more "connected."

- New `src/lib/graph.ts`: after `retrieveNotes` returns seeds, collect their
  `wiki_links`, resolve targets by `path`/`title`, and pull those note rows
  (1 hop first; make hop-count a constant).
- Merge seeds + neighbors, dedupe by id, then rerank the union (reuse #1) down to
  the final 8 for the prompt.
- Add `wiki_links` to the `match_vault_notes` return columns (or a second fetch)
  so the edges are available at retrieval time.
- Verify on a query whose answer lives one hop from the obvious note (e.g. a
  project note that links to its decisions) — the linked context should now
  appear.

### #3 — Structured profile + consolidating note-extraction (catalogue #10 + #11) · effort M

The core memory upgrade — this is what makes Silas *know* Hudson rather than
re-search him, and it stops the vault rotting into duplicate fragments.

- Migration: a single-row `core_memory` table (editable markdown block:
  identity, active projects, standing preferences). Inject it near the top of
  the prompt in `prompts.ts` (before retrieved context), inside the cached prefix.
- Rewrite `note-extraction.ts`: after Haiku proposes a note, `retrieveNotes` for
  the most similar existing notes and make a second cheap call deciding
  ADD / UPDATE / DELETE / NOOP; on UPDATE, edit the existing row instead of
  inserting a near-duplicate.
- Let the same extraction path update `core_memory` when it learns a durable
  profile fact ("Hudson started the Silas project").
- Verify: feed two near-duplicate exchanges and confirm the second UPDATEs rather
  than adds a row; confirm the profile block appears in the assembled prompt.

### #4 — Prompt caching + adaptive thinking + current model IDs (catalogue #16 + #17 + #18-fix) · effort S

A cheap bundle that simultaneously fixes a correctness bug (stale model),
lowers cost, and adds real reasoning depth — and the savings fund #5.

- `anthropic.ts`: default `CHAT_MODEL` to `claude-sonnet-5`, `CHEAP_MODEL` to
  `claude-haiku-4-5` (verify IDs against the `claude-api` skill).
- Freeze the prompt prefix (immutable core + editable body + profile) and mark it
  `cache_control:{type:"ephemeral"}`; ensure volatile retrieved context is
  appended *after* the cache breakpoint. Confirm cache hits via
  `usage.cache_read_input_tokens`.
- Add `thinking:{type:"adaptive"}` in `streamChat`; keep effort modest by
  default. Ensure the SSE loop still only streams `text_delta` (thinking blocks
  must not leak into the typewriter — protect the `silas:token` contract).
- Verify: two identical turns show a cache read on the second; a hard question
  produces a visibly more reasoned answer; typewriter + thinking events unchanged.

### #5 — Reflection loop into `silas_journal` (catalogue #13, with #12's trigger) · effort M

The most on-brand upgrade: turns memory from storage into sense-making, and
finally lights up the empty `silas_journal`. Best done after #3 (needs
consolidated memory + importance to reflect on).

- Add an `importance` score (one Haiku call) when notes are written in
  `note-extraction.ts`.
- New `src/lib/reflection.ts` + an API route (or Supabase cron): when recent
  high-importance memory crosses a threshold, generate 2–3 reflection questions,
  retrieve for each, synthesize higher-level insights, and write them to
  `silas_journal` (and as high-importance `silas-wrote` notes, honoring the
  `silas/thoughts/` + first-person, no-dash conventions from MEMORY.md).
- Surface the latest reflections in the prompt so they inform chat, and as the
  seed for the long-planned `/mind` page.
- Verify: run the job against seeded memories and confirm a genuinely synthetic
  insight (not a restatement) lands in `silas_journal`.

**Sequencing:** #1 → #2 (retrieval quality, no migrations) → #4 (cheap
infra/correctness that funds the rest) → #3 (memory substrate) → #5 (reflection
on top of it). Each is one session; commit and push between.

---

## Part 4 — Sources

**Retrieval (hybrid, reranking, contextual, HyDE, CRAG, chunking)**
- Anthropic, *Introducing Contextual Retrieval* — https://www.anthropic.com/engineering/contextual-retrieval
- Anthropic cookbook, contextual embeddings guide — https://platform.claude.com/cookbook/capabilities-contextual-embeddings-guide
- Voyage AI, *rerank-2* benchmarks — https://blog.voyageai.com/2024/09/30/rerank-2/
- *Best rerankers for RAG (2026)* — https://futureagi.com/blog/best-rerankers-for-rag-2026/
- BAAI bge-reranker — https://huggingface.co/BAAI/bge-reranker-base
- Hybrid search + RRF reference — https://www.digitalapplied.com/blog/hybrid-search-bm25-vector-reranking-reference-2026
- HyDE explainer — https://zilliz.com/learn/improve-rag-and-information-retrieval-with-hyde-hypothetical-document-embeddings
- ARAGOG (HyDE/reranker grading) — https://arxiv.org/pdf/2404.01037
- Corrective RAG (CRAG) reproduction — https://arxiv.org/html/2603.16169 · tutorial https://www.datacamp.com/tutorial/corrective-rag-crag
- Chunking strategies — https://www.firecrawl.dev/blog/best-chunking-strategies-rag

**Memory architectures**
- MemGPT/Letta memory docs — https://docs.letta.com/letta-agent/memory · paper https://arxiv.org/abs/2310.08560
- Mem0 research & LOCOMO numbers — https://mem0.ai/research · https://arxiv.org/pdf/2504.19413
- Generative Agents (memory stream, reflection, importance/recency/relevance) — https://arxiv.org/abs/2304.03442
- Letta sleep-time compute — https://www.letta.com/blog/sleep-time-compute/ · https://arxiv.org/abs/2504.13171
- Structured vs unstructured memory — https://www.leoniemonigatti.com/blog/memory-in-ai-agents.html
- Forgetting / decay (FadeMem, survey) — https://arxiv.org/pdf/2601.18642 · https://arxiv.org/pdf/2512.13564
- Anthropic memory tool (GA) — https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool · cookbook https://github.com/anthropics/claude-cookbooks/blob/main/tool_use/memory_cookbook.ipynb · context management https://www.anthropic.com/news/context-management

**Knowledge-graph / graph-augmented retrieval**
- Microsoft GraphRAG — https://microsoft.github.io/graphrag/ · https://arxiv.org/abs/2404.16130
- LightRAG — https://github.com/HKUDS/LightRAG · https://lightrag.github.io/
- HippoRAG / HippoRAG 2 — https://github.com/OSU-NLP-Group/HippoRAG · https://www.marktechpost.com/2025/03/03/hipporag-2-advancing-long-term-memory-and-contextual-retrieval-in-large-language-models/
- Graph vs vector RAG (multi-hop) — https://airbyte.com/agentic-data/graph-rag-vs-vector-rag · https://arxiv.org/pdf/2502.11371
- Obsidian wikilink GraphRAG in practice — https://github.com/Jinstronda/obsidianGraphRAG · https://motherduck.com/blog/obsidian-rag-duckdb-motherduck/

**Reasoning & orchestration**
- Anthropic extended/adaptive thinking — https://platform.claude.com/docs/en/build-with-claude/extended-thinking.md · https://platform.claude.com/docs/en/build-with-claude/adaptive-thinking.md · effort https://platform.claude.com/docs/en/build-with-claude/effort.md
- Prompt caching — https://platform.claude.com/docs/en/build-with-claude/prompt-caching.md
- Tool use overview — https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview.md
- RouteLLM (model routing) — https://www.lmsys.org/blog/2024-07-01-routellm/ · https://arxiv.org/abs/2406.18665
- Reflexion (self-critique) — https://arxiv.org/abs/2303.11366
- Agentic vs one-shot retrieval — https://arxiv.org/pdf/2509.04820

*Model-ID note:* current Anthropic family as of early 2026 is Opus 4.8
(`claude-opus-4-8`), Sonnet 5 (`claude-sonnet-5`), Haiku 4.5
(`claude-haiku-4-5`), Fable 5 (`claude-fable-5`); verify against the in-repo
`claude-api` skill before editing `anthropic.ts`.
