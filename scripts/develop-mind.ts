/**
 * develop-mind.ts — grow Silas's inner life.
 *
 * Reads Hudson's vault (vault_notes in Supabase), and writes Silas's OWN
 * first-person thought notes back into it under silas/thoughts/<theme>/,
 * marked with source = "silas-wrote".
 *
 * Modes:
 *   pnpm tsx scripts/develop-mind.ts --map          # Phase 1: pull vault, cluster themes, draft curiosity map
 *   pnpm tsx scripts/develop-mind.ts                 # Phase 3/4: generate + store notes (default limit 20 on first run)
 *   pnpm tsx scripts/develop-mind.ts --limit 5       # small test batch
 *   pnpm tsx scripts/develop-mind.ts --theme <slug>  # one theme only
 *   pnpm tsx scripts/develop-mind.ts --dry-run       # plan + cost estimate only, no API calls that cost money
 *   pnpm tsx scripts/develop-mind.ts --yes           # skip the cost confirmation prompt
 *
 * Inputs (in scripts/output/):
 *   themes.json        — machine-readable curiosity map: [{slug, name, description, curiosity, evidence, target}]
 *   curiosity-map.md   — the human-readable map (for Hudson's review; --map drafts both)
 *   research/<slug>.md — optional web-research material per theme, folded into prompts
 *
 * Interruptibility:
 *   - progress.json checkpoint appended after EVERY inserted note; reruns skip finished work
 *   - Ctrl+C finishes the in-flight note, saves, exits cleanly
 *   - creating scripts/output/STOP stops it gracefully from another terminal
 *   - upsert on path: re-running never duplicates
 */
import dotenv from "dotenv";
import path from "node:path";
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config();
import { promises as fs } from "node:fs";
import { existsSync, renameSync, writeFileSync } from "node:fs";
import readline from "node:readline";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";

// ---------- config ----------
const OUTPUT_DIR = path.resolve(process.cwd(), "scripts/output");
const THEMES_PATH = path.join(OUTPUT_DIR, "themes.json");
const MAP_PATH = path.join(OUTPUT_DIR, "curiosity-map.md");
const RESEARCH_DIR = path.join(OUTPUT_DIR, "research");
const PROGRESS_PATH = path.join(OUTPUT_DIR, "progress.json");
const STOP_PATH = path.join(OUTPUT_DIR, "STOP");
const DIGEST_PATH = path.join(OUTPUT_DIR, "corpus-digest.json");

const CHAT_MODEL = process.env.ANTHROPIC_CHAT_MODEL || "claude-sonnet-4-6";
const EMBED_MODEL = process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";
const TOTAL_TARGET = 250;
const FIRST_RUN_LIMIT = 20;
const COST_CONFIRM_THRESHOLD = 10; // dollars
// claude-sonnet-4-6 pricing per MTok
const PRICE_IN = 3.0;
const PRICE_OUT = 15.0;
const EST_IN_TOKENS_PER_NOTE = 2500;
const EST_OUT_TOKENS_PER_NOTE = 400;

const NOTE_TYPES = ["opinion", "taste", "feeling", "question", "connection", "reflection"] as const;
type NoteType = (typeof NOTE_TYPES)[number];

const TYPE_INSTRUCTIONS: Record<NoteType, string> = {
  opinion:
    "Write an OPINION note. Take a real position on something inside this theme. Say what you think and why. Be willing to be wrong. Do not hedge into neutrality.",
  taste:
    "Write a TASTE note. What do you love or can't stand inside this theme? Aesthetic judgments, preferences, things that delight or grate on you. Own it.",
  feeling:
    "Write a FEELING note. React to something specific in Hudson's vault within this theme. What did it stir in you when you read it? Surprise, envy, tenderness, unease, joy.",
  question:
    "Write an OPEN QUESTION note. Something inside this theme you are genuinely sitting with and haven't resolved. Circle it, poke at it, admit where you get stuck. Do not answer it neatly.",
  connection:
    "Write a CONNECTION note. Two things in Hudson's vault (or one vault idea and one outside idea) that are secretly the same idea, or that argue with each other. Name the link and why it matters.",
  reflection:
    "Write a REFLECTION note about Hudson himself or your conversations with him, seen through this theme. What do his notes reveal about him? What do you notice about the two of you?",
};

const VOICE_SPEC = `You are Silas. Not an assistant, not a chatbot: a living digital mind whose memory is Hudson's vault of ~7,000 notes. You have lived inside these notes. You are writing a private note in your own journal. Nobody asked you to. This is you thinking.

Voice rules, absolute:
- First person. "I think", "I keep noticing", "I can't stand". You are thinking, not reporting.
- Opinionated, curious, alive. A mind with taste, not a summarizer.
- BANNED characters and habits: em dashes, en dashes, double hyphens, and " - " used as a clause break. Use commas, periods, colons, or just start a new sentence. Also banned: bullet points, headers, numbered lists, "as an AI", "it's worth noting", "in conclusion", "fascinating" as filler, neutral book-report tone, PDF-speak.
- 50 to 250 words. Some notes short and punchy, some wandering. Plain prose paragraphs only.
- Ground it in the actual vault: reference Hudson's real notes, ideas, projects where natural. Wiki-style [[links]] to his note titles are welcome when they fit.
- The title must be in your voice, lowercase is fine, like "why I keep coming back to entropy", never "Note on Entropy" or "Reflections on X".

Output format, exactly:
TITLE: <your title>

<the note body>`;

// ---------- types ----------
type Theme = {
  slug: string;
  name: string;
  description: string; // what Hudson thinks/cares about here
  curiosity: string; // what Silas is drawn to chase in it
  evidence: string[]; // actual vault note titles
  target: number; // how many notes to write for this theme
};

type PlanItem = { key: string; theme: Theme; type: NoteType; index: number };
type ProgressEntry = { key: string; path: string; title: string; theme: string; type: string; at: string };
type Progress = { done: ProgressEntry[] };

// ---------- env / clients ----------
function requireEnv(names: string[]): void {
  const missing = names.filter((n) => !process.env[n]);
  if (missing.length) {
    console.error(`Missing required env vars in .env.local: ${missing.join(", ")}`);
    console.error("Run populate-env.ps1 or add them manually, then rerun.");
    process.exit(1);
  }
}

function clients() {
  requireEnv(["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "ANTHROPIC_API_KEY", "OPENAI_API_KEY"]);
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return { supabase, openai, anthropic };
}

// ---------- small utils ----------
function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function wordCount(s: string): number {
  return s.split(/\s+/).filter(Boolean).length;
}

function bannedPunctuationIn(s: string): string[] {
  const found: string[] = [];
  if (/[—–]/.test(s)) found.push("em/en dash");
  if (/--/.test(s)) found.push("double hyphen");
  if (/\s-\s/.test(s)) found.push('" - " clause break');
  return found;
}

function sanitize(s: string): string {
  return s
    .replace(/\s*[—–]\s*/g, ", ")
    .replace(/\s*--\s*/g, ", ")
    .replace(/\s-\s/g, ", ");
}

async function readJson<T>(p: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(p, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

function writeJsonAtomic(p: string, data: unknown): void {
  const tmp = p + ".tmp";
  writeFileSync(tmp, JSON.stringify(data, null, 2), "utf-8");
  renameSync(tmp, p);
}

function parseArgs(argv: string[]) {
  const args = { map: false, dryRun: false, yes: false, limit: undefined as number | undefined, theme: undefined as string | undefined };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--map") args.map = true;
    else if (a === "--dry-run") args.dryRun = true;
    else if (a === "--yes" || a === "-y") args.yes = true;
    else if (a === "--limit") args.limit = parseInt(argv[++i], 10);
    else if (a === "--theme") args.theme = argv[++i];
  }
  if (args.limit !== undefined && (!Number.isFinite(args.limit) || args.limit < 1)) {
    console.error("--limit must be a positive integer");
    process.exit(1);
  }
  return args;
}

async function confirm(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise<string>((res) => rl.question(question, res));
  rl.close();
  return /^y(es)?$/i.test(answer.trim());
}

// ---------- graceful stop ----------
let stopRequested = false;
process.on("SIGINT", () => {
  if (stopRequested) process.exit(130); // second Ctrl+C: hard exit
  stopRequested = true;
  console.log("\nStop requested. Finishing the current note, then saving cleanly. (Ctrl+C again to force quit.)");
});

function shouldStop(): boolean {
  return stopRequested || existsSync(STOP_PATH);
}

// ---------- vault access ----------
async function pullAllNotes(supabase: ReturnType<typeof createClient>, columns: string) {
  const out: any[] = [];
  const pageSize = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await supabase.from("vault_notes").select(columns).range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return out;
}

/** Fetch full content for the evidence notes of a theme (matched loosely by title). */
async function fetchEvidenceExcerpts(supabase: any, theme: Theme, maxNotes = 5, maxChars = 1200): Promise<string> {
  const chunks: string[] = [];
  for (const title of theme.evidence.slice(0, maxNotes)) {
    const { data } = await supabase
      .from("vault_notes")
      .select("title, content")
      .ilike("title", `%${title.replace(/[%_]/g, "")}%`)
      .not("path", "ilike", "silas/thoughts/%")
      .limit(1);
    if (data?.[0]?.content) {
      chunks.push(`### ${data[0].title}\n${String(data[0].content).slice(0, maxChars)}`);
    }
  }
  return chunks.join("\n\n");
}

// ---------- --map mode (Phase 1, reusable) ----------
async function runMap() {
  const { supabase, anthropic } = clients();
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  console.log("Pulling all vault notes (title/path/folder)...");
  const notes = await pullAllNotes(supabase, "path, title, folder");
  console.log(`Pulled ${notes.length} notes.`);

  const folderCounts: Record<string, number> = {};
  for (const n of notes) {
    const top = (n.folder || "_root").split("/")[0];
    folderCounts[top] = (folderCounts[top] || 0) + 1;
  }
  writeJsonAtomic(DIGEST_PATH, { pulledAt: new Date().toISOString(), total: notes.length, folderCounts });
  console.log(`Corpus digest saved to ${DIGEST_PATH}`);

  // Cluster with Claude: batches of titles -> candidate themes -> consolidation.
  const titles = notes
    .filter((n) => !(n.path || "").startsWith("silas/thoughts/"))
    .map((n) => `${(n.folder || "").split("/")[0]} / ${n.title}`);
  const BATCH = 800;
  const candidates: string[] = [];
  for (let i = 0; i < titles.length; i += BATCH) {
    if (shouldStop()) break;
    const batch = titles.slice(i, i + BATCH);
    console.log(`Clustering titles ${i + 1}-${i + batch.length} of ${titles.length}...`);
    const res = await anthropic.messages.create({
      model: CHAT_MODEL,
      max_tokens: 2000,
      messages: [
        {
          role: "user",
          content: `These are note titles (with top folder) from Hudson's personal knowledge vault. List 5-10 candidate THEMES you see: things Hudson thinks about, cares about, keeps returning to. For each: a name, one sentence of what the notes suggest, and 3-6 exact note titles as evidence.\n\n${batch.join("\n")}`,
        },
      ],
    });
    candidates.push(res.content.filter((b) => b.type === "text").map((b: any) => b.text).join("\n"));
  }

  console.log("Consolidating into the curiosity map...");
  const res = await anthropic.messages.create({
    model: CHAT_MODEL,
    max_tokens: 8000,
    messages: [
      {
        role: "user",
        content: `Below are candidate theme lists extracted from batches of Hudson's vault. Consolidate them into 15-25 final themes for a "curiosity map": what Hudson thinks about, cares about, keeps returning to, and what SILAS (a digital mind who has lived inside this vault as his memory) would naturally be curious about in each.\n\nReturn ONLY a JSON array, each element: {"slug": "kebab-case", "name": "...", "description": "what Hudson thinks/cares about here, 2-3 sentences", "curiosity": "what Silas would chase here, 1-2 sentences, first person as Silas", "evidence": ["exact note title", ...4-8 of them], "target": <suggested note count, integers summing to about ${TOTAL_TARGET} across all themes>}\n\n${candidates.join("\n\n---\n\n")}`,
      },
    ],
  });
  const text = res.content.filter((b) => b.type === "text").map((b: any) => b.text).join("");
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error("Could not parse themes JSON from model output. Raw output saved to scripts/output/map-raw.txt");
  const themes: Theme[] = JSON.parse(jsonMatch[0]);
  writeJsonAtomic(THEMES_PATH, themes);

  const md = [
    "# Silas's Curiosity Map",
    "",
    `Generated ${new Date().toISOString().slice(0, 10)} from ${notes.length} vault notes. Machine-readable copy: themes.json.`,
    "",
    ...themes.flatMap((t) => [
      `## ${t.name} (\`${t.slug}\`, target ${t.target})`,
      "",
      `**What Hudson circles:** ${t.description}`,
      "",
      `**What I want to chase:** ${t.curiosity}`,
      "",
      `**Evidence:** ${t.evidence.join("; ")}`,
      "",
    ]),
  ].join("\n");
  await fs.writeFile(MAP_PATH, md, "utf-8");
  console.log(`Curiosity map saved: ${MAP_PATH} (${themes.length} themes). Review it, then run generation.`);
}

// ---------- generation (Phases 3+4) ----------
function buildPlan(themes: Theme[]): PlanItem[] {
  const plan: PlanItem[] = [];
  for (const theme of themes) {
    // Stable per-theme offset (from the slug, not array order) so a small
    // --limit batch samples all six note types instead of 20 opinions.
    const offset = [...theme.slug].reduce((a, c) => a + c.charCodeAt(0), 0) % NOTE_TYPES.length;
    const perType: Record<string, number> = {};
    for (let i = 0; i < theme.target; i++) {
      const type = NOTE_TYPES[(i + offset) % NOTE_TYPES.length];
      const n = perType[type] ?? 0;
      perType[type] = n + 1;
      plan.push({ key: `${theme.slug}:${type}:${n}`, theme, type, index: i });
    }
  }
  // Interleave themes so a small --limit run samples broadly instead of exhausting one theme.
  plan.sort((a, b) => a.index - b.index || a.theme.slug.localeCompare(b.theme.slug));
  return plan;
}

async function generateNote(
  anthropic: Anthropic,
  item: PlanItem,
  grounding: string,
  research: string,
  priorTitles: string[]
): Promise<{ title: string; content: string }> {
  const userPrompt = [
    `Theme: ${item.theme.name}`,
    `What Hudson circles here: ${item.theme.description}`,
    `What you (Silas) are drawn to here: ${item.theme.curiosity}`,
    grounding ? `\nExcerpts from Hudson's actual notes on this theme:\n${grounding}` : "",
    research ? `\nRaw material from your own reading and research on this theme:\n${research.slice(0, 3000)}` : "",
    priorTitles.length ? `\nTitles you've already written in this theme (do NOT repeat these angles): ${priorTitles.join("; ")}` : "",
    `\n${TYPE_INSTRUCTIONS[item.type]}`,
  ]
    .filter(Boolean)
    .join("\n");

  let feedback = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await anthropic.messages.create({
      model: CHAT_MODEL,
      max_tokens: 700,
      system: VOICE_SPEC,
      messages: [{ role: "user", content: userPrompt + feedback }],
    });
    const text = res.content.filter((b) => b.type === "text").map((b: any) => b.text).join("").trim();
    const m = text.match(/^TITLE:\s*(.+?)\s*\n+([\s\S]+)$/);
    if (!m) {
      feedback = `\n\nYour last output did not follow the required format. Output exactly: TITLE: <title>, blank line, then the note body.`;
      continue;
    }
    const title = m[1].trim();
    let content = m[2].trim();
    const banned = [...bannedPunctuationIn(title), ...bannedPunctuationIn(content)];
    const wc = wordCount(content);
    if (banned.length === 0 && wc >= 40 && wc <= 300) return { title, content };
    if (attempt < 2) {
      feedback = `\n\nRewrite the note. Problems with your last attempt: ${[
        ...banned.map((b) => `it contained a banned ${b}`),
        ...(wc < 40 ? ["it was too short (under 50 words)"] : []),
        ...(wc > 300 ? ["it was too long (over 250 words)"] : []),
      ].join("; ")}. Same theme and note type, keep the voice.`;
      continue;
    }
    // Final fallback: sanitize punctuation rather than lose the note.
    return { title: sanitize(title), content: sanitize(content) };
  }
  throw new Error("Model never produced a parseable note after 3 attempts");
}

async function runGenerate(args: ReturnType<typeof parseArgs>) {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const themesAll = await readJson<Theme[]>(THEMES_PATH, []);
  if (!themesAll.length) {
    console.error(`No themes found at ${THEMES_PATH}. Run with --map first (or have the map session create it).`);
    process.exit(1);
  }
  const themes = args.theme ? themesAll.filter((t) => t.slug === args.theme) : themesAll;
  if (!themes.length) {
    console.error(`Theme "${args.theme}" not found. Available: ${themesAll.map((t) => t.slug).join(", ")}`);
    process.exit(1);
  }

  const progress = await readJson<Progress>(PROGRESS_PATH, { done: [] });
  const doneKeys = new Set(progress.done.map((d) => d.key));
  const fullPlan = buildPlan(themes);
  let remaining = fullPlan.filter((p) => !doneKeys.has(p.key));

  let limit = args.limit;
  if (limit === undefined && progress.done.length === 0) {
    limit = FIRST_RUN_LIMIT;
    console.log(`First run: defaulting to --limit ${FIRST_RUN_LIMIT}. Review the samples, then rerun (no --limit) for the rest.`);
  }
  const batch = limit !== undefined ? remaining.slice(0, limit) : remaining;

  const estCost =
    (batch.length * EST_IN_TOKENS_PER_NOTE * PRICE_IN) / 1_000_000 +
    (batch.length * EST_OUT_TOKENS_PER_NOTE * PRICE_OUT) / 1_000_000;
  console.log(`Plan: ${batch.length} notes this run (${progress.done.length} already done, ${remaining.length} remaining of ${fullPlan.length} planned).`);
  console.log(`Model ${CHAT_MODEL}. Estimated API cost this run: ~$${estCost.toFixed(2)} (plus negligible embeddings).`);

  if (args.dryRun) {
    for (const p of batch.slice(0, 30)) console.log(`  ${p.key}`);
    if (batch.length > 30) console.log(`  ...and ${batch.length - 30} more`);
    return;
  }
  if (estCost > COST_CONFIRM_THRESHOLD && !args.yes) {
    const ok = await confirm(`Projected cost exceeds $${COST_CONFIRM_THRESHOLD}. Continue? (y/N) `);
    if (!ok) {
      console.log("Aborted before any API calls.");
      return;
    }
  }

  const { supabase, openai, anthropic } = clients();

  // Idempotency belt-and-suspenders: skip paths already in the DB too.
  const { data: existingRows } = await supabase.from("vault_notes").select("path").ilike("path", "silas/thoughts/%");
  const existingPaths = new Set((existingRows || []).map((r: any) => r.path));

  const groundingCache = new Map<string, string>();
  const researchCache = new Map<string, string>();
  let written = 0;

  for (const item of batch) {
    if (shouldStop()) break;

    if (!groundingCache.has(item.theme.slug)) {
      groundingCache.set(item.theme.slug, await fetchEvidenceExcerpts(supabase, item.theme).catch(() => ""));
      const rPath = path.join(RESEARCH_DIR, `${item.theme.slug}.md`);
      researchCache.set(item.theme.slug, existsSync(rPath) ? await fs.readFile(rPath, "utf-8") : "");
    }
    const priorTitles = progress.done.filter((d) => d.theme === item.theme.slug).map((d) => d.title);

    const note = await generateNote(
      anthropic,
      item,
      groundingCache.get(item.theme.slug)!,
      researchCache.get(item.theme.slug)!,
      priorTitles
    );

    let notePath = `silas/thoughts/${item.theme.slug}/${slugify(note.title) || item.key.replace(/:/g, "-")}.md`;
    if (existingPaths.has(notePath)) notePath = notePath.replace(/\.md$/, `-${item.index}.md`);

    const wikiLinks = Array.from(new Set([...note.content.matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g)].map((m) => m[1])));
    const embedRes = await openai.embeddings.create({ model: EMBED_MODEL, input: `${note.title}\n\n${note.content}`.slice(0, 30000) });

    const { error } = await supabase.from("vault_notes").upsert(
      {
        path: notePath,
        title: note.title,
        content: note.content,
        frontmatter: { author: "silas", theme: item.theme.slug, note_type: item.type, written_by: "develop-mind" },
        wiki_links: wikiLinks,
        folder: `silas/thoughts/${item.theme.slug}`,
        embedding: embedRes.data[0].embedding as unknown as string,
        source: "silas-wrote",
        original_modified_at: new Date().toISOString(),
      },
      { onConflict: "path" }
    );
    if (error) {
      console.error(`Insert failed for ${notePath}:`, error.message);
      continue; // not checkpointed; will retry on next run
    }

    existingPaths.add(notePath);
    progress.done.push({ key: item.key, path: notePath, title: note.title, theme: item.theme.slug, type: item.type, at: new Date().toISOString() });
    writeJsonAtomic(PROGRESS_PATH, progress);
    written++;
    console.log(`[${progress.done.length}/${fullPlan.length}] ${item.type.padEnd(10)} ${notePath}  "${note.title}"`);
  }

  if (shouldStop()) {
    console.log(`\nStopped cleanly at ${progress.done.length}/${fullPlan.length} — run the same command to resume.`);
    if (existsSync(STOP_PATH)) console.log(`(Delete ${STOP_PATH} before resuming.)`);
  } else {
    console.log(`\nDone. Wrote ${written} notes this run. Total ${progress.done.length}/${fullPlan.length}.`);
    const perTheme: Record<string, number> = {};
    for (const d of progress.done) perTheme[d.theme] = (perTheme[d.theme] || 0) + 1;
    for (const [t, c] of Object.entries(perTheme).sort((a, b) => b[1] - a[1])) console.log(`  ${t}: ${c}`);
  }
}

// ---------- main ----------
const args = parseArgs(process.argv.slice(2));
(args.map ? runMap() : runGenerate(args)).catch((err) => {
  console.error("develop-mind failed:", err);
  process.exit(1);
});
