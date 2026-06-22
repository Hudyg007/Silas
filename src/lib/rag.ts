import { createAdmin } from "./supabase/server";
import { embed } from "./embeddings";

export type RetrievedNote = {
  id: string;
  path: string;
  title: string | null;
  content: string;
  folder: string | null;
  similarity: number;
};

export type RetrievedMessage = {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  created_at: string;
  similarity: number;
};

/**
 * Retrieve top-K most relevant vault notes for a query.
 */
export async function retrieveNotes(
  query: string,
  options: { count?: number; threshold?: number } = {}
): Promise<RetrievedNote[]> {
  const embedding = await embed(query);
  const supabase = createAdmin();
  const { data, error } = await supabase.rpc("match_vault_notes", {
    query_embedding: embedding as unknown as string,
    match_count: options.count ?? 8,
    similarity_threshold: options.threshold ?? 0.5,
  });
  if (error) {
    console.error("retrieveNotes error:", error);
    return [];
  }
  return (data as RetrievedNote[]) || [];
}

/**
 * Retrieve relevant past messages from OTHER conversations.
 * Used for cross-conversation memory.
 */
export async function retrievePastMessages(
  query: string,
  currentConversationId: string,
  options: { count?: number; threshold?: number } = {}
): Promise<RetrievedMessage[]> {
  const embedding = await embed(query);
  const supabase = createAdmin();
  const { data, error } = await supabase.rpc("match_past_messages", {
    query_embedding: embedding as unknown as string,
    conv_id: currentConversationId,
    match_count: options.count ?? 5,
    similarity_threshold: options.threshold ?? 0.55,
  });
  if (error) {
    console.error("retrievePastMessages error:", error);
    return [];
  }
  return (data as RetrievedMessage[]) || [];
}

/**
 * Format retrieved notes into a markdown block suitable for the system prompt.
 */
export function formatNotesForPrompt(notes: RetrievedNote[]): string {
  if (notes.length === 0) return "";
  return notes
    .map((n, i) => {
      const header = `### Note ${i + 1}${n.title ? ` — ${n.title}` : ""}${n.folder ? ` (${n.folder})` : ""}`;
      const sim = `(relevance: ${n.similarity.toFixed(2)})`;
      return `${header} ${sim}\n${n.content.slice(0, 1500)}${n.content.length > 1500 ? "\n[…truncated]" : ""}`;
    })
    .join("\n\n---\n\n");
}

/**
 * Format retrieved past messages into a markdown block.
 */
export function formatPastMessagesForPrompt(messages: RetrievedMessage[]): string {
  if (messages.length === 0) return "";
  return messages
    .map((m) => {
      const speaker = m.role === "user" ? "Hudson" : "Silas";
      const date = new Date(m.created_at).toLocaleDateString();
      return `[${date}] ${speaker}: ${m.content.slice(0, 600)}${m.content.length > 600 ? " […]" : ""}`;
    })
    .join("\n\n");
}
