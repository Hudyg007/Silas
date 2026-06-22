export type Message = {
  id: string;
  conversation_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  metadata?: Record<string, unknown> | null;
  created_at: string;
};

export type Conversation = {
  id: string;
  user_id: string;
  title: string | null;
  created_at: string;
  last_active_at: string;
};

export type VaultNote = {
  id: string;
  path: string;
  title: string | null;
  content: string;
  frontmatter: Record<string, unknown> | null;
  wiki_links: string[] | null;
  folder: string | null;
  source: "migrated" | "silas-wrote" | "user-edited";
  original_modified_at: string | null;
  created_at: string;
  updated_at: string;
};

export type UserState = {
  user_id: string;
  onboarded: boolean;
  onboarding_message: string | null;
  last_visit_at: string | null;
  preferences: Record<string, unknown>;
};
