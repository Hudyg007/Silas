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
-- RLS policies — locked to authenticated user only
-- =====================================================
alter table vault_notes enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;
alter table silas_journal enable row level security;
alter table user_state enable row level security;

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
