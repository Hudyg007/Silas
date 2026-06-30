-- Silas database schema
-- Run once in Supabase SQL editor (project.supabase.com/.../sql)

-- =====================================================
-- Extensions
-- =====================================================
create extension if not exists vector;
create extension if not exists "pgcrypto";

-- =====================================================
-- vault_notes: every note from /Brain/, plus new ones Silas writes
-- =====================================================
create table if not exists vault_notes (
  id uuid primary key default gen_random_uuid(),
  path text unique not null,
  title text,
  content text not null,
  frontmatter jsonb,
  wiki_links text[],
  folder text,
  embedding vector(1536),
  source text default 'migrated' check (source in ('migrated', 'silas-wrote', 'user-edited')),
  original_modified_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists vault_notes_embedding_idx on vault_notes using ivfflat (embedding vector_cosine_ops) with (lists = 100);
create index if not exists vault_notes_folder_idx on vault_notes (folder);
create index if not exists vault_notes_source_idx on vault_notes (source);
create index if not exists vault_notes_path_idx on vault_notes (path);

-- =====================================================
-- conversations: a chat session
-- =====================================================
create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  title text,
  created_at timestamptz default now(),
  last_active_at timestamptz default now()
);

create index if not exists conversations_user_id_idx on conversations (user_id);
create index if not exists conversations_last_active_idx on conversations (last_active_at desc);

-- =====================================================
-- messages: every word ever spoken (total recall)
-- =====================================================
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  metadata jsonb,
  embedding vector(1536),
  created_at timestamptz default now()
);

create index if not exists messages_conv_created_idx on messages (conversation_id, created_at);
create index if not exists messages_embedding_idx on messages using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- =====================================================
-- silas_journal: things Silas writes when not asked (v2)
-- =====================================================
create table if not exists silas_journal (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  content text not null,
  category text,
  triggered_by jsonb,
  visible_to_user boolean default true,
  embedding vector(1536),
  created_at timestamptz default now()
);

create index if not exists silas_journal_user_id_idx on silas_journal (user_id);
create index if not exists silas_journal_created_idx on silas_journal (created_at desc);

-- =====================================================
-- user_state: per-user app state (onboarding status, prefs)
-- =====================================================
create table if not exists user_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  onboarded boolean default false,
  onboarding_message text,
  last_visit_at timestamptz,
  preferences jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- =====================================================
-- silas_prompt_versions: versioned, self-editable system-prompt body
-- Append-only audit + rollback trail. Never overwrite a row.
-- =====================================================
create table if not exists silas_prompt_versions (
  id uuid primary key default gen_random_uuid(),
  version int not null unique,
  body text not null,
  reason text,
  edited_by text default 'silas' check (edited_by in ('silas', 'hudson')),
  created_at timestamptz default now()
);

create index if not exists silas_prompt_versions_version_idx on silas_prompt_versions (version desc);

-- =====================================================
-- silas_prompt_state: single-row pointer + kill switch
-- The boolean primary key (always true) enforces exactly one row.
-- =====================================================
create table if not exists silas_prompt_state (
  id boolean primary key default true check (id = true),
  active_version int not null default 1,
  self_edit_enabled boolean not null default true
);

-- Seed version 1 (self-edit framing + migrated personality) and the state row.
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

-- =====================================================
-- RLS policies — locked to authenticated user only
-- =====================================================
alter table vault_notes enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;
alter table silas_journal enable row level security;
alter table user_state enable row level security;
alter table silas_prompt_versions enable row level security;
alter table silas_prompt_state enable row level security;

-- vault_notes: single-user mode for now — any authenticated user can read all
-- If you ever add multi-user, switch to user_id ownership
create policy "authenticated can read vault" on vault_notes for select using (auth.role() = 'authenticated');
create policy "service role can do anything on vault" on vault_notes for all using (auth.role() = 'service_role');

-- conversations: user owns their own
create policy "users own their conversations" on conversations for all using (auth.uid() = user_id);

-- messages: accessible via conversation ownership
create policy "users own their messages" on messages for all using (
  exists (select 1 from conversations where conversations.id = messages.conversation_id and conversations.user_id = auth.uid())
);

-- silas_journal: user owns their own
create policy "users own their journal" on silas_journal for all using (auth.uid() = user_id);

-- user_state: user owns their own
create policy "users own their state" on user_state for all using (auth.uid() = user_id);

-- silas_prompt_versions / silas_prompt_state: written only by the server
-- (service role bypasses RLS). Authenticated user may read; never write directly.
create policy "service role manages prompt versions" on silas_prompt_versions for all using (auth.role() = 'service_role');
create policy "authenticated can read prompt versions" on silas_prompt_versions for select using (auth.role() = 'authenticated');
create policy "service role manages prompt state" on silas_prompt_state for all using (auth.role() = 'service_role');
create policy "authenticated can read prompt state" on silas_prompt_state for select using (auth.role() = 'authenticated');

-- =====================================================
-- RPC: match_vault_notes — pgvector similarity search
-- =====================================================
create or replace function match_vault_notes(
  query_embedding vector(1536),
  match_count int default 8,
  similarity_threshold float default 0.5
)
returns table (
  id uuid,
  path text,
  title text,
  content text,
  folder text,
  similarity float
)
language sql stable
as $$
  select
    vault_notes.id,
    vault_notes.path,
    vault_notes.title,
    vault_notes.content,
    vault_notes.folder,
    1 - (vault_notes.embedding <=> query_embedding) as similarity
  from vault_notes
  where vault_notes.embedding is not null
    and 1 - (vault_notes.embedding <=> query_embedding) > similarity_threshold
  order by vault_notes.embedding <=> query_embedding
  limit match_count;
$$;

-- =====================================================
-- RPC: match_past_messages — pgvector over old messages
-- =====================================================
create or replace function match_past_messages(
  query_embedding vector(1536),
  conv_id uuid,
  match_count int default 5,
  similarity_threshold float default 0.55
)
returns table (
  id uuid,
  conversation_id uuid,
  role text,
  content text,
  created_at timestamptz,
  similarity float
)
language sql stable
as $$
  select
    messages.id,
    messages.conversation_id,
    messages.role,
    messages.content,
    messages.created_at,
    1 - (messages.embedding <=> query_embedding) as similarity
  from messages
  where messages.embedding is not null
    and messages.conversation_id != conv_id
    and 1 - (messages.embedding <=> query_embedding) > similarity_threshold
  order by messages.embedding <=> query_embedding
  limit match_count;
$$;

-- =====================================================
-- updated_at triggers
-- =====================================================
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists vault_notes_updated_at on vault_notes;
create trigger vault_notes_updated_at before update on vault_notes for each row execute function set_updated_at();

drop trigger if exists user_state_updated_at on user_state;
create trigger user_state_updated_at before update on user_state for each row execute function set_updated_at();
