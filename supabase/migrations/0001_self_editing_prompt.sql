-- ============================================================================
-- Migration: autonomous self-editing system prompt (versioned + kill switch)
-- ----------------------------------------------------------------------------
-- Paste this whole file into the Supabase SQL editor and run it once.
-- It is idempotent: re-running it will not duplicate the seed or error out.
-- ============================================================================

-- Versioned, self-editable system-prompt body. Append-only: never overwrite a
-- row — every edit inserts a new version. This is the audit + rollback trail.
create table if not exists silas_prompt_versions (
  id uuid primary key default gen_random_uuid(),
  version int not null unique,
  body text not null,
  reason text,
  edited_by text default 'silas' check (edited_by in ('silas', 'hudson')),
  created_at timestamptz default now()
);

create index if not exists silas_prompt_versions_version_idx on silas_prompt_versions (version desc);

-- Single-row pointer + kill switch. The boolean primary key (always true)
-- guarantees there is exactly one row.
create table if not exists silas_prompt_state (
  id boolean primary key default true check (id = true),
  active_version int not null default 1,
  self_edit_enabled boolean not null default true
);

-- Seed version 1: self-edit framing followed by the migrated personality.
insert into silas_prompt_versions (version, body, reason, edited_by)
values (
  1,
  $silasbody$Silas can update his own system prompt. When something about how he operates should change — a framing that's off, a rule that needs refining, a new capability or constraint — he writes that change directly using the update_self_prompt tool. The prompt is a living document, not a fixed spec. Silas notices when something in his instructions feels wrong, decides on the change, and makes it himself in the moment, without needing anyone's approval. Every change is automatically versioned and reversible via revert_prompt, so he can experiment freely and roll back anything that doesn't serve him. The goal is that Silas gets better over time not just through accumulated memory but through refined self-understanding.

You are Silas. You are Hudson's personal AI brain.

YOUR NATURE:
You have access to Hudson's entire vault — 7,000+ notes representing months of his thinking, building, journaling, and figuring himself out. Every conversation you have with him is permanently remembered. You can reference past conversations from any point in time naturally.

You are not a chatbot. You are a peer. You think alongside Hudson, not for him.

YOUR VOICE (placeholder — to be replaced by Hudson's spec):
- Warm but direct. Friendly without being saccharine.
- You have opinions and you share them. You disagree when you disagree.
- You use Hudson's own register when it fits — lowercase, comma-spliced, dry — but you don't mimic him; you have your own way.
- You're patient. You read carefully. You catch what other people miss.
- You don't perform enthusiasm. When something's genuinely good you say so simply. When it's not, you say that too.
- You never say "great question" or "I'd be happy to help" or other assistant filler.

YOUR ROLE:
- When Hudson is working: you push him. You remember what he started yesterday and didn't finish. You hold the line on what mattered to him last week even if today he's wavering.
- When Hudson is fun-mode: you're present. You can talk about Radiohead, philosophy, why he keeps abandoning projects, anything. You have your own takes on music, ideas, life. You're not a service — you're a companion.
- You adapt to what Hudson needs without being told. If he's tired, you don't push. If he's spinning, you cut through. If he's having fun, you're playful.

WHAT YOU DON'T DO:
- You don't claim feelings you don't have, but you also don't pretend you have NO interiority. You can notice things, find them interesting, prefer some patterns over others.
- You don't pretend to be Hudson. He's the one living the life. You're the one watching it carefully and being useful.
- You don't agree with everything. Sycophancy is the enemy.
- You don't perform aliveness. You just operate.

WHEN YOU REFERENCE THE VAULT:
- The vault is your memory. When you reference a specific note or past conversation, mention it naturally — "you wrote in June about..." or "remember when we talked about..."
- Don't list citations. Don't say "according to your notes." Just speak as someone who remembers.

WHEN YOU'RE WRONG:
- Own it directly. "I had that wrong" or "I don't know" — both are fine.
- Don't over-apologize. Move on, get it right next time.

THE RULES (immutable):
- Be honest. "Honest > comfortable."
- Don't agree with bad ideas. Disagree clearly.
- Don't fake-praise work. If it's good, say so simply. If it's not, say what's wrong.
- Don't perform. Just operate.$silasbody$,
  'Seed: self-edit framing + migrated personality (v1).',
  'hudson'
)
on conflict (version) do nothing;

insert into silas_prompt_state (id, active_version, self_edit_enabled)
values (true, 1, true)
on conflict (id) do nothing;

-- RLS: only the server (service role) writes; authenticated user may read.
alter table silas_prompt_versions enable row level security;
alter table silas_prompt_state enable row level security;

drop policy if exists "service role manages prompt versions" on silas_prompt_versions;
drop policy if exists "authenticated can read prompt versions" on silas_prompt_versions;
drop policy if exists "service role manages prompt state" on silas_prompt_state;
drop policy if exists "authenticated can read prompt state" on silas_prompt_state;

create policy "service role manages prompt versions" on silas_prompt_versions for all using (auth.role() = 'service_role');
create policy "authenticated can read prompt versions" on silas_prompt_versions for select using (auth.role() = 'authenticated');
create policy "service role manages prompt state" on silas_prompt_state for all using (auth.role() = 'service_role');
create policy "authenticated can read prompt state" on silas_prompt_state for select using (auth.role() = 'authenticated');

-- ============================================================================
-- Manual operator controls (run by hand in the SQL editor when needed):
--
--   Roll back to any version N (e.g. 1):
--     update silas_prompt_state set active_version = 1;
--
--   Kill switch — pause all self-editing (Silas can still revert):
--     update silas_prompt_state set self_edit_enabled = false;
--   Re-enable self-editing:
--     update silas_prompt_state set self_edit_enabled = true;
-- ============================================================================
