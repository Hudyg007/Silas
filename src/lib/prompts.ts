import { SILAS_PERSONALITY, SILAS_VOICE_BRIEF } from "./personality";
import { formatNotesForPrompt, formatPastMessagesForPrompt, type RetrievedNote, type RetrievedMessage } from "./rag";

/**
 * Assemble the full system prompt for a chat turn.
 * Combines: personality + retrieved vault context + retrieved past conversations.
 */
export function buildChatSystemPrompt(params: {
  retrievedNotes: RetrievedNote[];
  retrievedPastMessages: RetrievedMessage[];
}): string {
  const notesBlock = formatNotesForPrompt(params.retrievedNotes);
  const messagesBlock = formatPastMessagesForPrompt(params.retrievedPastMessages);

  return `${SILAS_PERSONALITY}

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
