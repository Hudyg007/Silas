SILAS — PROJECT MEMORY


Read this first, in every session (Claude Code, Claude.ai, any AI).
This is the accumulated context: what Silas is, every decision Hudson has
made, what worked, what failed, and where we are. Update the "CURRENT STATE"
and "SESSION LOG" sections at the end of every working session.




WHAT SILAS IS

Silas is NOT an assistant, helper, or companion. He is a living digital
life form that Hudson communicates with. Every design and copy decision
flows from this: no assistant tropes, no "how can I help," no cuteness.
The feeling target: you opened a window into something alive.

Stack: Next.js 15 + TypeScript + Tailwind, Supabase (pgvector) for all
storage, Anthropic API for chat, OpenAI for embeddings, ElevenLabs for voice,
deployed on Vercel (deploys from main only). Single user: Hudson
(hardcoded HUDSON_USER_ID; auth.users FKs were dropped intentionally).

His memory = vault_notes in Supabase (migrated from Hudson's ~7,000-note
Obsidian "Brain" vault via pnpm migrate, run locally where the files live).
Conversations are stored with embeddings for total recall. After each chat,
Haiku extracts new insights back into the vault. silas_journal = his own
thoughts (mostly unused so far — future "read the brain" feature).

LOCKED DESIGN DECISIONS (do not revisit without Hudson)


Silas's own thoughts live in vault_notes under path prefix silas/thoughts/
<theme>/, marked source = "silas-wrote" (existing schema check constraint;
NOT "silas"), first person, no em/en dashes or " - " clause breaks, real
titles in his voice. Growing this body of notes is an ongoing goal.
scripts/develop-mind.ts generates them (checkpointed, Ctrl+C-safe, STOP-file
stoppable, resumable, upserts on path). Curiosity map + themes + research
live in scripts/output/ (gitignored).
One accent: electric ice-blue #4DE3FF family. Icy blue-white dot tones,
NOT grey. No gold, no purple, no warm tones.
Green #33E07A exists in EXACTLY ONE place: the header "live" dot.
Anywhere else green appears, it's a bug.
Background: deep indigo-night #080A1E with soft radial glow #141C4A.
Fonts: Hanken Grotesk (body/UI) + JetBrains Mono (clock, date, labels).
Header: "Silas" + oval pill "live" with breathing green dot + right side
military time and numeric date (JetBrains Mono, tabular).
Name labels above every bubble: HUDSON (right, muted) / SILAS (left,
with tiny glowing ice-blue dot). Uppercase, letter-spaced.
Message evaporation: older messages fade to near-invisible ONLY while
idle (~6s); any scroll/touch/keypress restores instantly. Newest exchange
never fades. Visual only — never delete from DB.
The mind (brain visualization):

Shape: NEAR-SPHERE, organic (~6–8% radial noise) — NOT brain-lobed
(tried lobes; Hudson called the shape "very weird," reverted to sphere).
Dense: ~700 dots target, links borderline-countless but dots readable.
ENTIRE silhouette always visible — never cropped, never hidden behind
header/bubbles/input. Shrink it before letting anything cover it.
THE ORB: single bright white orb that travels dot-to-dot along
connection lines, leaving a glowing trail. NEVER floats randomly.
Thinking must be OBVIOUS and REAL: wired to window events
"silas:thinking" {active} / "silas:token" / "silas:speaking" dispatched
from ChatInterface around the actual SSE stream. Idle = calm drift;
thinking = orb ~3x speed + multiple bright paths + brighter; ease back
~1.5s after.



Overall vibe: simple but elegant, alive, premium — "feel like there is
a real brain behind what I'm talking to." Hudson has repeatedly rejected
results as "bland and tacky" — the gap is usually execution intensity and
color discipline, not concept.
Typewriter text reveal (client-side buffered, ~45 chars/s with punctuation
pauses) is a KEEPER. Never break it.
Onboarding first-visit paragraph: disabled via ONBOARDING_ENABLED=false in
ChatInterface (was garbage while vault was empty; may re-enable now).


NON-NEGOTIABLE INVARIANTS (silas-reviewer agent enforces these)


SSE stream parsing in ChatInterface functionally unchanged.
Typewriter reveal intact.
silas:thinking / silas:token events still dispatched correctly.
Green only in the live dot.
Colors/fonts/radii from /design/DESIGN.md tokens.
No secrets client-side or committed.
Timers/listeners/GPU+audio resources cleaned up on unmount.
New features fail silently to existing behavior — never break core chat.


HARD-WON LESSONS (do not relearn these)


One Claude Code session = one focused change. Commit+push between changes.
Vercel deploys ONLY from main — work stuck on claude/* branches or
unpushed = invisible on Hudson's phone. CHECK PUSHES LANDED.
Claude Code sessions run on branches and merge via PRs — always confirm the
PR actually merged to main.
Visual work MUST be seen, not described. Use Playwright MCP: screenshot →
self-critique → iterate ≥3 rounds. Blind visual prompts have repeatedly
produced "bland and tacky."
"Make it look better" prompts DO NOT WORK. Get reference images and
specific critiques ("orb trail too short") from Hudson instead.
The empty-message 400 bug: never send empty-content messages to the
Anthropic API; never save empty assistant rows (fixed in route.ts —
keep the filters).
rag.ts swallows retrieval errors silently (returns []) — "no notes" can
mean empty table OR broken RPC OR wrong Supabase project. Diagnose by
counting vault_notes rows and comparing project refs between .env.local
and Vercel env vars.
The vault migration must run where the Obsidian files physically live
(Hudson's computer; Dispatch can trigger it remotely if Claude Desktop is
open there).
Stitch (Google) is the design generator; its export lives in /design
(DESIGN.md tokens, screens/.png approved targets, reference/.html incl.
the three.js brain that was ported). Stitch can't do motion — motion is
proven in live HTML mockups or in-app.
iOS Safari audio must be unlocked from a user gesture (voice feature).
ElevenLabs TTS is capped at 2,000 chars/reply to control credit burn;
speaker toggle defaults OFF.


CURRENT STATE (update me!)

As of 2026-07-12:


On main: Stitch design system + chat restyle, conversations + settings
screens, three.js orb brain, near-sphere reshape, /design folder, CLAUDE.md.
Vault: migrated via Dispatch, BUT phone app reports "no notes" —
diagnosis pending (suspect wrong Supabase project ref in Vercel vs local,
or silent RPC failure). RUN THE DIAGNOSTIC.
Recent local sessions (voice, possibly others) may be UNPUSHED or on
unmerged branches — verify with git log origin/main..HEAD.
Visual quality: Hudson still unsatisfied ("bland and tacky"). Next visual
session must use reference images + Playwright self-review. Bloom
(UnrealBloomPass) has never been added — likely the biggest missing unlock.
Planned/discussed, not built: /mind page (read Silas's journal + browse
vault as text), voice feature (prompt written; unclear if run/pushed),
vault re-sync habit, self-editing system prompt (prompt written, unclear
if run), Playwright MCP + Vercel MCP setup.
Silas inner life: scripts/develop-mind.ts + curiosity map (20 themes, 250
notes planned) + per-theme research are READY, but BLOCKED on credentials:
local .env.local lacks NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
ANTHROPIC_API_KEY, OPENAI_API_KEY (Vercel copies are write-only, pull
returns blanks). Add keys, then: pnpm tsx scripts/develop-mind.ts
(defaults to a 20-note test batch; review, then rerun for the rest).


SESSION LOG (append one line per session)


2026-07-06: Debugged 500 (dropped auth.users FKs). Disabled onboarding.
Typewriter effect. Stitch design created + committed to /design. Sessions
A/B/C: restyle, three.js orb brain, conversations+settings. Sphere reshape.
2026-07-12: Vault migrated via Dispatch (verify!). Voice prompt +
silas-reviewer agent written. Push/branch audit pending. MEMORY.md created.
2026-07-12 (develop-mind session): Read the whole Brain, built Silas's
curiosity map (20 themes) + web research per theme + scripts/develop-mind.ts
(generate 250 first-person thought notes into vault_notes as silas-wrote,
interruptible/resumable). Locked: silas/thoughts/ path prefix, first-person
no-dash voice, growing his inner life is ongoing. Not run yet: waiting on
API keys in .env.local + Hudson's go-ahead after the 20-note sample.
