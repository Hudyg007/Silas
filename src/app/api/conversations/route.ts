import { createAdmin } from "@/lib/supabase/server";
import { HUDSON_USER_ID } from "@/lib/user";

export const runtime = "nodejs";

/**
 * GET /api/conversations
 * Returns Hudson's conversations, newest first, each with a one-line preview of
 * its most recent message:
 *   { conversations: [{ id, title, preview, updated_at }] }
 *
 * Single-user mode — everything belongs to Hudson, no auth check.
 */
export async function GET() {
  try {
    const admin = createAdmin();

    const { data: convos, error } = await admin
      .from("conversations")
      .select("id, title, created_at, last_active_at")
      .eq("user_id", HUDSON_USER_ID)
      .order("last_active_at", { ascending: false })
      .limit(100);

    if (error) throw new Error(error.message);

    const rows = convos ?? [];
    if (rows.length === 0) {
      return Response.json({ conversations: [] });
    }

    // Fetch the latest message per conversation for the preview line. One query
    // per conversation is fine at this scale (single user, capped at 100).
    const conversations = await Promise.all(
      rows.map(async (c) => {
        const { data: last } = await admin
          .from("messages")
          .select("content, created_at")
          .eq("conversation_id", c.id)
          .not("content", "is", null)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const preview = (last?.content ?? "")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 140);

        return {
          id: c.id,
          title: c.title || "Untitled",
          preview,
          updated_at: last?.created_at || c.last_active_at || c.created_at,
        };
      })
    );

    return Response.json({ conversations });
  } catch (err) {
    console.error("/api/conversations error:", err);
    return Response.json({ conversations: [], error: String(err) }, { status: 500 });
  }
}
