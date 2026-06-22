/**
 * Embed any notes that don't have embeddings yet.
 * Useful if you imported notes via SQL or migration was interrupted.
 *
 * Usage: pnpm embed-missing
 */
import dotenv from "dotenv";
import path from "node:path";
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config();
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

const EMBED_MODEL = process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";
const BATCH_SIZE = 50;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function main() {
  const { data, error, count } = await supabase
    .from("vault_notes")
    .select("id, title, content", { count: "exact" })
    .is("embedding", null)
    .limit(1000);

  if (error) throw error;
  console.log(`Found ${count ?? 0} notes without embeddings.`);
  if (!data || data.length === 0) return;

  for (let i = 0; i < data.length; i += BATCH_SIZE) {
    const batch = data.slice(i, i + BATCH_SIZE);
    const texts = batch.map((n) => `${n.title || ""}\n\n${n.content}`.slice(0, 30000));
    const res = await openai.embeddings.create({ model: EMBED_MODEL, input: texts });
    const updates = batch.map((n, j) => ({ id: n.id, embedding: res.data[j].embedding as unknown as string }));
    for (const u of updates) {
      await supabase.from("vault_notes").update({ embedding: u.embedding }).eq("id", u.id);
    }
    console.log(`Embedded batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(data.length / BATCH_SIZE)}`);
  }
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
