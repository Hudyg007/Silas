import OpenAI from "openai";

// Lazy-init so build-time "Collecting page data" doesn't crash without env vars.
let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
}

const EMBED_MODEL = process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";

export async function embed(text: string): Promise<number[]> {
  const truncated = text.slice(0, 30000);
  const response = await getOpenAI().embeddings.create({
    model: EMBED_MODEL,
    input: truncated,
  });
  return response.data[0].embedding;
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  const truncated = texts.map((t) => t.slice(0, 30000));
  const response = await getOpenAI().embeddings.create({
    model: EMBED_MODEL,
    input: truncated,
  });
  return response.data.map((d) => d.embedding);
}
