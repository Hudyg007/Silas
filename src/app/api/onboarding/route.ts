import { NextRequest } from "next/server";
import { createAdmin } from "@/lib/supabase/server";
import { anthropic, CHAT_MODEL } from "@/lib/anthropic";
import { sampleNotes } from "@/lib/vault";
import { buildOnboardingSystemPrompt } from "@/lib/prompts";
import { HUDSON_USER_ID } from "@/lib/user";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/onboarding
 * Returns: { onboarded: boolean, message?: string }
 * Single-user mode — no auth needed.
 */
export async function GET() {
  try {
    const admin = createAdmin();

    const { data: state } = await admin
      .from("user_state")
      .select("onboarded, onboarding_message")
      .eq("user_id", HUDSON_USER_ID)
      .maybeSingle();

    if (state?.onboarded && state?.onboarding_message) {
      return Response.json({ onboarded: true, message: state.onboarding_message });
    }

    const notes = await sampleNotes(20);
    if (notes.length === 0) {
      return Response.json({
        onboarded: false,
        message: "I don't see any notes in the vault yet. Run pnpm migrate first.",
      });
    }

    const systemPrompt = buildOnboardingSystemPrompt(
      notes.map((n) => ({
        id: n.id,
        path: n.path,
        title: n.title,
        content: n.content,
        folder: n.folder,
        similarity: 1,
      }))
    );

    const result = await anthropic.messages.create({
      model: CHAT_MODEL,
      max_tokens: 1500,
      system: systemPrompt,
      messages: [{ role: "user", content: "(Hudson just opened you for the first time. Speak.)" }],
    });

    const message = result.content
      .filter((b) => b.type === "text")
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("");

    await admin.from("user_state").upsert({
      user_id: HUDSON_USER_ID,
      onboarded: true,
      onboarding_message: message,
      last_visit_at: new Date().toISOString(),
    });

    return Response.json({ onboarded: false, message, justOnboarded: true });
  } catch (err) {
    console.error("/api/onboarding error:", err);
    return Response.json({ onboarded: false, error: String(err) }, { status: 500 });
  }
}

/**
 * POST /api/onboarding/reset (dev convenience)
 */
export async function POST(_req: NextRequest) {
  const admin = createAdmin();
  await admin.from("user_state").update({ onboarded: false, onboarding_message: null }).eq("user_id", HUDSON_USER_ID);
  return Response.json({ reset: true });
}
