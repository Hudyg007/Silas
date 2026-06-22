/**
 * One-time vault migration: read every .md file from BRAIN_VAULT_PATH
 * and load into Supabase with embeddings.
 *
 * Usage: pnpm migrate
 *
 * Idempotent: re-running skips already-migrated files (matched by path).
 */
import dotenv from "dotenv";
import path from "node:path";
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config(); // also try plain .env as fallback
import { promises as fs } from "node:fs";
import matter from "gray-matter";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

const VAULT_PATH = process.env.BRAIN_VAULT_PATH;
const SKIP_FOLDERS = new Set([
  ".backups",
  ".cache",
  ".trim-backups",
  ".trim-graveyard",
  ".linker-backups",
  ".obsidian",
  ".git",
  "node_modules",
]);
const EMBED_MODEL = process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";
const BATCH_SIZE = 50; // embed N notes per OpenAI call

if (!VAULT_PATH) {
  console.error("BRAIN_VAULT_PATH not set in .env.local");
  process.exit(1);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

type ParsedNote = {
  path: string;
  title: string | null;
  content: string;
  frontmatter: Record<string, unknown>;
  wiki_links: string[];
  folder: string;
  original_modified_at: string;
};

async function walkVault(dir: string, base: string = dir): Promise<string[]> {
  const out: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    if (SKIP_FOLDERS.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      out.push(...(await walkVault(full, base)));
    } else if (e.isFile() && e.name.endsWith(".md")) {
      out.push(full);
    }
  }
  return out;
}

function parseNote(filePath: string, raw: string, vaultRoot: string, stat: { mtime: Date }): ParsedNote {
  const parsed = matter(raw);
  const rel = path.relative(vaultRoot, filePath).replace(/\\/g, "/");
  const folder = rel.split("/").slice(0, -1).join("/") || "_root";
  const titleMatch = parsed.content.match(/^#\s+(.+)$/m);
  const title = (parsed.data?.title as string) || titleMatch?.[1] || path.basename(filePath, ".md");
  const wikiLinks = Array.from(parsed.content.matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g)).map((m) => m[1]);
  return {
    path: rel,
    title,
    content: parsed.content,
    frontmatter: parsed.data || {},
    wiki_links: Array.from(new Set(wikiLinks)),
    folder,
    original_modified_at: stat.mtime.toISOString(),
  };
}

async function getExistingPaths(): Promise<Set<string>> {
  const out = new Set<string>();
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabase
      .from("vault_notes")
      .select("path")
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    data.forEach((r) => out.add(r.path));
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return out;
}

async function embedBatch(texts: string[]): Promise<number[][]> {
  const truncated = texts.map((t) => t.slice(0, 30000));
  const res = await openai.embeddings.create({ model: EMBED_MODEL, input: truncated });
  return res.data.map((d) => d.embedding);
}

async function main() {
  console.log(`Migrating vault: ${VAULT_PATH}`);
  const filePaths = await walkVault(VAULT_PATH!);
  console.log(`Found ${filePaths.length} markdown files.`);

  const existing = await getExistingPaths();
  console.log(`Already in DB: ${existing.size}`);

  // Parse all notes
  const parsed: ParsedNote[] = [];
  let skipped = 0;
  for (const fp of filePaths) {
    try {
      const stat = await fs.stat(fp);
      const raw = await fs.readFile(fp, "utf-8");
      const note = parseNote(fp, raw, VAULT_PATH!, stat);
      if (existing.has(note.path)) {
        skipped++;
        continue;
      }
      // Skip empty notes
      if (!note.content || note.content.trim().length < 10) {
        continue;
      }
      parsed.push(note);
    } catch (err) {
      console.error(`Failed to parse ${fp}:`, err);
    }
  }
  console.log(`Parsed ${parsed.length} new notes. Skipped ${skipped} already migrated.`);

  // Embed + insert in batches
  let inserted = 0;
  for (let i = 0; i < parsed.length; i += BATCH_SIZE) {
    const batch = parsed.slice(i, i + BATCH_SIZE);
    const texts = batch.map((n) => `${n.title || ""}\n\n${n.content}`);
    let embeddings: number[][];
    try {
      embeddings = await embedBatch(texts);
    } catch (err) {
      console.error(`Embed batch ${i / BATCH_SIZE} failed:`, err);
      continue;
    }
    const rows = batch.map((n, j) => ({
      path: n.path,
      title: n.title,
      content: n.content,
      frontmatter: n.frontmatter,
      wiki_links: n.wiki_links,
      folder: n.folder,
      embedding: embeddings[j] as unknown as string,
      source: "migrated" as const,
      original_modified_at: n.original_modified_at,
    }));
    const { error } = await supabase.from("vault_notes").upsert(rows, { onConflict: "path" });
    if (error) {
      console.error(`Insert batch ${i / BATCH_SIZE} failed:`, error);
    } else {
      inserted += rows.length;
      console.log(`Inserted batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(parsed.length / BATCH_SIZE)} — total ${inserted}/${parsed.length}`);
    }
  }

  console.log(`\nDone. Inserted ${inserted} new notes. ${skipped} skipped (already present).`);

  // Folder summary
  const folderCounts: Record<string, number> = {};
  parsed.forEach((n) => {
    const top = n.folder.split("/")[0];
    folderCounts[top] = (folderCounts[top] || 0) + 1;
  });
  console.log("\nTop folders in new migration:");
  Object.entries(folderCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .forEach(([f, c]) => console.log(`  ${f}: ${c}`));
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
