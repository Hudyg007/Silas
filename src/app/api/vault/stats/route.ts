import { createAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * GET /api/vault/stats
 * Returns vault memory stats for the settings screen:
 *   { noteCount: number, status: "connected" | "empty" }
 */
export async function GET() {
  try {
    const admin = createAdmin();
    const { count, error } = await admin
      .from("vault_notes")
      .select("*", { count: "exact", head: true });

    if (error) throw new Error(error.message);

    const noteCount = count ?? 0;
    return Response.json({ noteCount, status: noteCount > 0 ? "connected" : "empty" });
  } catch (err) {
    console.error("/api/vault/stats error:", err);
    return Response.json({ noteCount: 0, status: "empty", error: String(err) }, { status: 500 });
  }
}
