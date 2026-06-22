import OpenAI from "openai";

// Lazy-init so build-time "Collecting page data" doesn't crash without env vars.
// The newer OpenAI SDK throws if apiKey is undefined at construction time;
// deferring to first-call means it only runs when env vars are actually present.
let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
}

const EMBED_MODEL = process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";

/**
 * Embed a single piece of text into a 1536-dim vector.
 * text-embedding-3-small is cheap ($0.02 / 1M tokens) and matches our pgvector schema.
 */
export async function embed(text: string): Promise<number[]> {
  // OpenAI has a token limit per request; truncate very large notes
  const truncated = text.slice(0, 30000);
  const response = await getOpenAI().embeddings.create({
    model: EMBED_MODEL,
    input: truncated,
  });
  return response.data[0].embedding;
}

/**
 * Embed a batch of texts efficiently in one API call.
 * Used by the migration script. Max 2048 inputs per request.
 */
export async function embedBatch(texts: string[]): Promise<number[][]> {
  const truncated = texts.map((t) => t.slice(0, 30000));
  const response = await getOpenAI().embeddings.create({
    model: EMBED_MODEL,
    input: truncated,
  });
  return response.data.map((d) => d.embedding);
}
