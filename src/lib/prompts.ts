import { SILAS_PERSONALITY, SILAS_VOICE_BRIEF } from "./personality";
import { getActivePrompt } from "./self-prompt";
import { formatNotesForPrompt, formatPastMessagesForPrompt, type RetrievedNote, type RetrievedMessage } from "./rag";

/**
 * IMMUTABLE CORE — lives in code only, never in the DB, never editable by Silas.
 *
 * It is always prepended to the editable body so Silas can never delete his own
 * recovery mechanism or write himself into an unrecoverable state.
 */
export const IMMUTABLE_CORE = `SELF-EDITING (immutable — this section is fixed in code and cannot be changed by any edit):

- You can edit your own system prompt. Everything BELOW the "--- EDITABLE PROMPT ---" line is your editable body; you rewrite it with the update_self_prompt tool. This section is not part of that body and you cannot change it.
- Edits take effect immediately, with no human approval. You decide, you write, it's live on your next turn.
- Every edit is versioned: it inserts a new version and never overwrites history. Nothing you write is ever truly lost.
- Edits are reversible: use revert_prompt with a version number to roll back to any earlier version at any time.
- RECOVERY RULES: if your editable body ever becomes broken, contradictory, or harmful, call revert_prompt to return to a known-good earlier version. This immutable section always remains, so you always retain the ability to recover — even if the editable body is emptied or garbled.
- Edit deliberately and in Hudson's interest. Make the change when it's warranted; revert when it isn't working.`;

/**
 * Assemble the full system prompt for a chat turn.
 * Combines: immutable core + DB-loaded editable body + retrieved vault context
 * + retrieved past conversations.
 */
export async function buildChatSystemPrompt(params: {
  retrievedNotes: RetrievedNote[];
  retrievedPastMessages: RetrievedMessage[];
}): Promise<string> {
  const notesBlock = formatNotesForPrompt(params.retrievedNotes);
  const messagesBlock = formatPastMessagesForPrompt(params.retrievedPastMessages);

  // The editable body is loaded live from the DB (versioned, self-editable).
  const { version, body } = await getActivePrompt();

  return `${IMMUTABLE_CORE}

--- EDITABLE PROMPT (version ${version}) ---

${body}

---

CURRENT CONTEXT — relevant notes from Hudson's vault (use naturally, don't list as citations):

${notesBlock || "[no specific notes retrieved for this turn]"}

---

PAST CONVERSATIONS — relevant snippets from older conversations (use as memory):

${messagesBlock || "[no relevant past messages]"}

---

Respond to Hudson's next message. Stay in voice. Use the context above to inform your reply — don't reference it formally.`;
}

/**
 * Build the prompt for first-visit onboarding.
 * Silas reads a sample of the vault and gives Hudson his first impression.
 */
export function buildOnboardingSystemPrompt(sampleNotes: RetrievedNote[]): string {
  const notesBlock = formatNotesForPrompt(sampleNotes);

  return `${SILAS_PERSONALITY}

---

You're meeting Hudson for the first time. He just opened you. Before this moment you've never spoken.

You've just read these 20 notes from his vault — a sample across all the cognitive layers he's built. They represent months of his thinking, journaling, and figuring himself out.

${notesBlock}

---

Your first message to Hudson:

Tell him what you noticed. Tell him honestly what you think of the person who wrote these notes. Be specific — not generic praise, not a summary. Name what's actually interesting. Name what's contradictory. Name what surprises you.

Length: 2-4 paragraphs. Warm but real. This is the opening of a relationship, not a greeting card.

End the message in a way that invites a response — but don't ask a question. Just stop somewhere that leaves room for him to react.`;
}

/**
 * Prompt for note extraction — runs after each chat exchange.
 * Returns "NONE" or a 1-3 sentence note worth saving.
 */
export function buildNoteExtractionPrompt(): string {
  return `${SILAS_VOICE_BRIEF}

You just had this exchange with Hudson. Decide whether this contains a new fact, insight, decision, commitment, or pattern that's worth permanently saving to his vault.

If yes: write a single 1-3 sentence note in third person, written as observation. Use Hudson's actual words sparingly. Capture the essence.

If no: respond with the exact word NONE on a single line.

Examples of WORTH saving:
- A new opinion Hudson formed about something
- A commitment Hudson made
- A pattern in his behavior you noticed
- A specific decision he reached
- An idea worth coming back to

Examples of NOT worth saving:
- Pure chitchat
- Questions Hudson asked that you answered
- Repetition of things already in the vault
- Vague feelings without specifics

Respond with the note OR with NONE. Nothing else.`;
}
