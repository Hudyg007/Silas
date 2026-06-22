import { createAdmin } from "./supabase/server";
import { embed } from "./embeddings";

export type VaultNote = {
  id: string;
  path: string;
  title: string | null;
  content: string;
  folder: string | null;
  frontmatter: Record<string, unknown> | null;
  wiki_links: string[] | null;
  source: string;
  created_at: string;
  updated_at: string;
};

/**
 * Get a random sample of notes — used for onboarding.
 * Pulls from across all cognitive layers for breadth.
 */
export async function sampleNotes(count: number = 20): Promise<VaultNote[]> {
  const supabase = createAdmin();
  // Sample across distinct folders for variety
  const { data, error } = await supabase
    .from("vault_notes")
    .select("*")
    .not("content", "is", null)
    .limit(500); // pull a pool, then shuffle client-side for true randomness
  if (error || !data) {
    console.error("sampleNotes error:", error);
    return [];
  }
  // Fisher-Yates shuffle, take first N
  const shuffled = [...data];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, count) as VaultNote[];
}

/**
 * Write a new note that Silas authored. Stores with source='silas-wrote'.
 */
export async function writeNote(params: {
  content: string;
  title?: string;
  folder?: string;
  triggeredBy?: Record<string, unknown>;
}): Promise<{ id: string; path: string } | null> {
  const supabase = createAdmin();
  const dateStr = new Date().toISOString().split("T")[0];
  const slug = (params.title || "thought")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 50);
  const path = `/Brain/Silas-Authored/${dateStr}/${slug}-${Date.now()}.md`;

  const embedding = await embed(params.content);

  const { data, error } = await supabase
    .from("vault_notes")
    .insert({
      path,
      title: params.title ?? null,
      content: params.content,
      folder: params.folder ?? "Silas-Authored",
      source: "silas-wrote",
      embedding: embedding as unknown as string,
      frontmatter: { author: "silas", triggered_by: params.triggeredBy ?? null },
    })
    .select("id, path")
    .single();

  if (error || !data) {
    console.error("writeNote error:", error);
    return null;
  }
  return data;
}

/**
 * Append metadata to an existing note (e.g. when Silas references it,
 * track the access pattern for future tuning).
 */
export async function recordNoteAccess(noteId: string, conversationId: string) {
  const supabase = createAdmin();
  // Just bump updated_at for now; full access log table can come later
  await supabase
    .from("vault_notes")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", noteId);
}
