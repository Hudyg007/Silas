import { NextRequest } from "next/server";
import { createAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * GET /api/conversations/[id]/messages
 * Returns the ordered message history for a conversation so the chat screen can
 * re-open it: { messages: [{ id, role, content }] }.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) return Response.json({ messages: [] }, { status: 400 });

    const admin = createAdmin();
    const { data, error } = await admin
      .from("messages")
      .select("id, role, content")
      .eq("conversation_id", id)
      .in("role", ["user", "assistant"])
      .not("content", "is", null)
      .order("created_at", { ascending: true });

    if (error) throw new Error(error.message);

    const messages = (data ?? []).filter(
      (m) => typeof m.content === "string" && m.content.trim().length > 0
    );

    return Response.json({ messages });
  } catch (err) {
    console.error("GET /api/conversations/[id]/messages error:", err);
    return Response.json({ messages: [], error: String(err) }, { status: 500 });
  }
}

/**
 * DELETE /api/conversations/[id]/messages
 * Clears every message in a conversation (Danger Zone → "Clear conversation").
 * The conversation row itself is kept so the thread can be reused.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) return Response.json({ ok: false }, { status: 400 });

    const admin = createAdmin();
    const { error } = await admin.from("messages").delete().eq("conversation_id", id);
    if (error) throw new Error(error.message);

    return Response.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/conversations/[id]/messages error:", err);
    return Response.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
