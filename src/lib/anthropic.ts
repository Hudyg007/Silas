import Anthropic from "@anthropic-ai/sdk";

if (!process.env.ANTHROPIC_API_KEY) {
  console.warn("ANTHROPIC_API_KEY not set — Silas can't think yet");
}

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export const CHAT_MODEL = process.env.ANTHROPIC_CHAT_MODEL || "claude-sonnet-4-6";
export const CHEAP_MODEL = process.env.ANTHROPIC_CHEAP_MODEL || "claude-haiku-4-5-20251001";

/**
 * Stream a chat response. Returns an AsyncIterable of text deltas.
 */
export async function streamChat(params: {
  systemPrompt: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  model?: string;
  maxTokens?: number;
}) {
  const stream = anthropic.messages.stream({
    model: params.model || CHAT_MODEL,
    max_tokens: params.maxTokens || 2048,
    system: params.systemPrompt,
    messages: params.messages,
  });
  return stream;
}

/**
 * One-shot response (no streaming). For background tasks like note extraction.
 */
export async function quickResponse(params: {
  systemPrompt: string;
  userMessage: string;
  model?: string;
  maxTokens?: number;
}) {
  const result = await anthropic.messages.create({
    model: params.model || CHEAP_MODEL,
    max_tokens: params.maxTokens || 400,
    system: params.systemPrompt,
    messages: [{ role: "user", content: params.userMessage }],
  });
  const text = result.content
    .filter((b) => b.type === "text")
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("");
  return { text, usage: result.usage };
}
