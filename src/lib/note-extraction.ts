import { quickResponse } from "./anthropic";
import { buildNoteExtractionPrompt } from "./prompts";
import { writeNote } from "./vault";

/**
 * Background task: after a chat exchange, decide if anything is worth saving
 * to the vault. If yes, write the note. Runs cheap (Haiku).
 *
 * Designed to be fire-and-forget — never blocks user-facing chat response.
 */
export async function extractAndSaveNote(params: {
  userMessage: string;
  assistantMessage: string;
  conversationId: string;
}): Promise<{ saved: boolean; noteId?: string; reason?: string }> {
  try {
    const exchange = `HUDSON: ${params.userMessage}\n\nSILAS: ${params.assistantMessage}`;

    const result = await quickResponse({
      systemPrompt: buildNoteExtractionPrompt(),
      userMessage: exchange,
      maxTokens: 300,
    });

    const text = result.text.trim();
    if (text === "NONE" || text.length < 10) {
      return { saved: false, reason: "not worth saving" };
    }

    // Write the note to the vault
    const written = await writeNote({
      content: text,
      title: text.split(".")[0].slice(0, 80),
      folder: "Silas-Authored",
      triggeredBy: { conversation_id: params.conversationId, kind: "chat-extraction" },
    });

    if (!written) {
      return { saved: false, reason: "write failed" };
    }
    return { saved: true, noteId: written.id };
  } catch (err) {
    console.error("extractAndSaveNote error:", err);
    return { saved: false, reason: "error" };
  }
}
