import { NextRequest } from "next/server";
import type Anthropic from "@anthropic-ai/sdk";
import { createAdmin } from "@/lib/supabase/server";
import { streamChat } from "@/lib/anthropic";
import { retrieveNotes, retrievePastMessages } from "@/lib/rag";
import { buildChatSystemPrompt } from "@/lib/prompts";
import { extractAndSaveNote } from "@/lib/note-extraction";
import { embed } from "@/lib/embeddings";
import { HUDSON_USER_ID } from "@/lib/user";
import { SELF_PROMPT_TOOLS, executeSelfPromptTool } from "@/lib/self-prompt";

// Safety cap on tool round-trips within a single turn.
const MAX_TOOL_ROUNDS = 6;

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/chat
 * Body: { conversationId: string | null, message: string }
 * Returns: streaming SSE
 *
 * Single-user mode — no auth check, everything is for Hudson.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { conversationId: incomingId, message } = body as { conversationId: string | null; message: string };
    if (!message || message.trim().length === 0) {
      return new Response("Empty message", { status: 400 });
    }

    const admin = createAdmin();

    // Get or create conversation (no user_id needed in single-user mode)
    let conversationId = incomingId;
    if (!conversationId) {
      const { data: newConv, error } = await admin
        .from("conversations")
        .insert({ user_id: HUDSON_USER_ID, title: message.slice(0, 60) })
        .select("id")
        .single();
      if (error || !newConv) throw new Error(`Could not create conversation: ${error?.message}`);
      conversationId = newConv.id;
    }

    // Embed user message for both storage and RAG
    const userEmbedding = await embed(message);

    // Save user message
    await admin.from("messages").insert({
      conversation_id: conversationId,
      role: "user",
      content: message,
      embedding: userEmbedding as unknown as string,
    });

    // Get recent history (last 10 messages)
    const { data: historyData } = await admin
      .from("messages")
      .select("role, content")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(10);

    const history = (historyData || []).reverse().filter((m) => m.role !== "system") as Array<{ role: "user" | "assistant"; content: string }>;

    // Parallel RAG retrieval
    const [notes, pastMessages] = await Promise.all([
      retrieveNotes(message, { count: 8 }),
      retrievePastMessages(message, conversationId!, { count: 5 }),
    ]);

    const systemPrompt = await buildChatSystemPrompt({
      retrievedNotes: notes,
      retrievedPastMessages: pastMessages,
    });

    const encoder = new TextEncoder();
    let fullText = "";

    const responseStream = new ReadableStream({
      async start(controller) {
        try {
          // Agentic loop: stream text, and if Silas calls a self-edit tool,
          // execute it, feed the result back, and continue the SAME turn so he
          // can keep talking in one reply.
          const convo: Anthropic.MessageParam[] = [...history];

          for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
            const stream = await streamChat({
              systemPrompt,
              messages: convo,
              maxTokens: 2048,
              tools: SELF_PROMPT_TOOLS,
            });

            for await (const event of stream) {
              if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
                const text = event.delta.text;
                fullText += text;
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "delta", text })}\n\n`));
              }
            }

            const finalMsg = await stream.finalMessage();

            if (finalMsg.stop_reason !== "tool_use") {
              break;
            }

            // Record the assistant turn (text + tool_use blocks) verbatim.
            convo.push({ role: "assistant", content: finalMsg.content });

            // Execute each tool call and collect tool_result blocks.
            const toolResults: Anthropic.ToolResultBlockParam[] = [];
            for (const block of finalMsg.content) {
              if (block.type !== "tool_use") continue;
              const result = await executeSelfPromptTool(block.name, block.input);
              toolResults.push({
                type: "tool_result",
                tool_use_id: block.id,
                content: result.content,
                is_error: result.isError,
              });
            }

            convo.push({ role: "user", content: toolResults });
            // Loop again so Silas can respond to the tool result in the same reply.
          }

          // Save assistant message with embedding (skip embedding if the turn
          // produced no text — e.g. a tool-only round — to avoid an empty embed).
          const assistantEmbedding = fullText.trim().length > 0 ? await embed(fullText) : null;
          await admin.from("messages").insert({
            conversation_id: conversationId,
            role: "assistant",
            content: fullText,
            embedding: assistantEmbedding as unknown as string,
            metadata: {
              retrieved_note_count: notes.length,
              retrieved_past_message_count: pastMessages.length,
            },
          });

          await admin
            .from("conversations")
            .update({ last_active_at: new Date().toISOString() })
            .eq("id", conversationId);

          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done", conversationId })}\n\n`));
          controller.close();

          extractAndSaveNote({
            userMessage: message,
            assistantMessage: fullText,
            conversationId: conversationId!,
          }).catch((err) => console.error("note extraction failed:", err));
        } catch (err) {
          console.error("stream error:", err);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", message: String(err) })}\n\n`));
          controller.close();
        }
      },
    });

    return new Response(responseStream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    console.error("/api/chat error:", err);
    return new Response(`Error: ${String(err)}`, { status: 500 });
  }
}
