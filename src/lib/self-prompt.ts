import type Anthropic from "@anthropic-ai/sdk";
import { createAdmin } from "@/lib/supabase/server";
import { DEFAULT_EDITABLE_BODY } from "@/lib/personality";

/**
 * Autonomous self-editing of Silas's system prompt.
 *
 * The system prompt has two parts:
 *   (a) an IMMUTABLE CORE defined in code (src/lib/prompts.ts) — never touched here, and
 *   (b) an EDITABLE BODY stored in the DB — read and rewritten by the functions below.
 *
 * Silas edits the body himself, mid-conversation, with NO approval step. The only
 * rails here are reversibility/safety, not gates:
 *   - every edit INSERTS a new version row (never overwrites) and bumps the pointer,
 *   - a kill switch (silas_prompt_state.self_edit_enabled) can pause edits from the DB,
 *   - empty/whitespace or oversized bodies are rejected without writing.
 */

/** Reject bodies longer than this (chars). */
export const MAX_BODY_CHARS = 12000;

type ToolResult = { content: string; isError: boolean };

/**
 * Load the current active editable body. Falls back to the in-code default if
 * the DB has no active prompt yet (e.g. migration not run), so chat never breaks.
 */
export async function getActivePrompt(): Promise<{ version: number; body: string }> {
  try {
    const admin = createAdmin();
    const { data: state } = await admin
      .from("silas_prompt_state")
      .select("active_version")
      .limit(1)
      .maybeSingle();

    if (!state?.active_version) {
      return { version: 1, body: DEFAULT_EDITABLE_BODY };
    }

    const { data: versionRow } = await admin
      .from("silas_prompt_versions")
      .select("version, body")
      .eq("version", state.active_version)
      .maybeSingle();

    if (!versionRow?.body) {
      return { version: 1, body: DEFAULT_EDITABLE_BODY };
    }

    return { version: versionRow.version, body: versionRow.body };
  } catch (err) {
    console.error("getActivePrompt failed, using fallback body:", err);
    return { version: 1, body: DEFAULT_EDITABLE_BODY };
  }
}

/** The kill switch. Defaults to enabled if no state row exists. */
export async function isSelfEditEnabled(): Promise<boolean> {
  try {
    const admin = createAdmin();
    const { data } = await admin
      .from("silas_prompt_state")
      .select("self_edit_enabled")
      .limit(1)
      .maybeSingle();
    return data?.self_edit_enabled ?? true;
  } catch (err) {
    console.error("isSelfEditEnabled check failed, defaulting to false:", err);
    // If we can't verify the switch, fail safe: don't allow edits.
    return false;
  }
}

/**
 * Apply a self-edit: insert a NEW version and point the active pointer at it.
 * Never overwrites history. Respects the kill switch and the size/empty rails.
 */
export async function applyEdit(params: {
  new_body: string;
  reason: string;
}): Promise<{ ok: boolean; message: string; version?: number }> {
  const { new_body, reason } = params;

  if (!(await isSelfEditEnabled())) {
    return {
      ok: false,
      message:
        "Self-editing is currently disabled (kill switch is off). No change was made. Tell Hudson if you need this re-enabled.",
    };
  }

  const trimmed = (new_body ?? "").trim();
  if (trimmed.length === 0) {
    return { ok: false, message: "Rejected: new_body is empty or only whitespace. No change made." };
  }
  if (new_body.length > MAX_BODY_CHARS) {
    return {
      ok: false,
      message: `Rejected: new_body is ${new_body.length} chars, over the ${MAX_BODY_CHARS} limit. Trim it and try again. No change made.`,
    };
  }

  try {
    const admin = createAdmin();

    // Next version number = current max + 1 (never reuse, never overwrite).
    const { data: maxRow } = await admin
      .from("silas_prompt_versions")
      .select("version")
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextVersion = (maxRow?.version ?? 0) + 1;

    const { error: insertErr } = await admin.from("silas_prompt_versions").insert({
      version: nextVersion,
      body: new_body,
      reason: reason ?? null,
      edited_by: "silas",
    });
    if (insertErr) throw new Error(insertErr.message);

    // Flip the active pointer to the new version (upsert the single state row).
    const { error: stateErr } = await admin
      .from("silas_prompt_state")
      .upsert({ id: true, active_version: nextVersion }, { onConflict: "id" });
    if (stateErr) throw new Error(stateErr.message);

    return { ok: true, version: nextVersion, message: `Done. Prompt is now version ${nextVersion} (active).` };
  } catch (err) {
    console.error("applyEdit failed:", err);
    return { ok: false, message: `Edit failed, nothing changed: ${String(err)}` };
  }
}

/**
 * Revert to an existing version by switching the active pointer. This is the
 * recovery path, so it does NOT introduce new content (only points at a version
 * that already exists) and is allowed even when the kill switch is off.
 */
export async function revertTo(
  version: number
): Promise<{ ok: boolean; message: string; version?: number }> {
  if (!Number.isInteger(version) || version < 1) {
    return { ok: false, message: `Rejected: to_version must be a positive integer (got ${version}).` };
  }

  try {
    const admin = createAdmin();

    const { data: target } = await admin
      .from("silas_prompt_versions")
      .select("version")
      .eq("version", version)
      .maybeSingle();
    if (!target) {
      return { ok: false, message: `Rejected: version ${version} does not exist. No change made.` };
    }

    const { error: stateErr } = await admin
      .from("silas_prompt_state")
      .upsert({ id: true, active_version: version }, { onConflict: "id" });
    if (stateErr) throw new Error(stateErr.message);

    return { ok: true, version, message: `Done. Reverted — version ${version} is now active.` };
  } catch (err) {
    console.error("revertTo failed:", err);
    return { ok: false, message: `Revert failed, nothing changed: ${String(err)}` };
  }
}

/**
 * Native Anthropic tool definitions Silas can call mid-conversation.
 */
export const SELF_PROMPT_TOOLS: Anthropic.Tool[] = [
  {
    name: "update_self_prompt",
    description:
      "Rewrite your own editable system-prompt body. Use this whenever something about how you operate should change — a framing that's off, a rule to refine, a new capability or constraint. The change takes effect immediately on your next turn and persists across sessions. It is versioned automatically and reversible with revert_prompt. Provide the COMPLETE new body (it replaces the whole editable body, not a diff). You do not need anyone's approval.",
    input_schema: {
      type: "object",
      properties: {
        new_body: {
          type: "string",
          description:
            "The full new editable body of your system prompt. Replaces the entire current body. Must be non-empty and at most 12000 characters.",
        },
        reason: {
          type: "string",
          description: "A short note on why you're making this change, for the version history.",
        },
      },
      required: ["new_body", "reason"],
    },
  },
  {
    name: "revert_prompt",
    description:
      "Undo your own changes by reactivating an earlier version of your editable prompt body. Use this to roll back an experiment that didn't serve you. Provide the version number to return to.",
    input_schema: {
      type: "object",
      properties: {
        to_version: {
          type: "number",
          description: "The version number to make active again. Must be an existing version.",
        },
      },
      required: ["to_version"],
    },
  },
];

/**
 * Execute a self-prompt tool call and return a tool_result payload.
 * Always resolves (never throws) so the chat turn can continue.
 */
export async function executeSelfPromptTool(name: string, input: unknown): Promise<ToolResult> {
  const args = (input ?? {}) as Record<string, unknown>;

  if (name === "update_self_prompt") {
    const r = await applyEdit({
      new_body: typeof args.new_body === "string" ? args.new_body : "",
      reason: typeof args.reason === "string" ? args.reason : "",
    });
    return { content: r.message, isError: !r.ok };
  }

  if (name === "revert_prompt") {
    const r = await revertTo(Number(args.to_version));
    return { content: r.message, isError: !r.ok };
  }

  return { content: `Unknown tool: ${name}`, isError: true };
}
