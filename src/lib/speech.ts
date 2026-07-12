"use client";

/**
 * Client-side voice output. One reusable <audio> element plays Silas's replies
 * fetched from /api/tts. Everything here fails SILENTLY to text-only — a TTS
 * error, a missing key, or a blocked autoplay never breaks the chat.
 *
 * iOS Safari only allows audio.play() that chains from a user gesture, so we
 * `unlock()` the element on the send/mic tap: a muted play()/pause() inside the
 * gesture "arms" the element, and the later real play() then works.
 *
 * While audio plays we dispatch the window event "silas:speaking"
 * {detail:{active}} so BrainCanvas can pulse the mind in a gentle rhythm.
 */

// Cap TTS input per reply to control ElevenLabs credit burn. The server caps
// too; this trims before we ever send. Tunable.
export const TTS_CHAR_CAP = 2000;

let audioEl: HTMLAudioElement | null = null;
let currentUrl: string | null = null;
let speakingId: string | null = null;
const listeners = new Set<(id: string | null) => void>();

function getAudio(): HTMLAudioElement {
  if (!audioEl) {
    audioEl = new Audio();
    audioEl.preload = "auto";
    // Whenever playback ends or errors, settle the "speaking" state.
    audioEl.addEventListener("ended", () => setSpeaking(null));
    audioEl.addEventListener("error", () => setSpeaking(null));
  }
  return audioEl;
}

function emitSpeaking(active: boolean) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("silas:speaking", { detail: { active } }));
}

function setSpeaking(id: string | null) {
  const was = speakingId;
  speakingId = id;
  if (!!was !== !!id) emitSpeaking(!!id);
  if (was !== id) listeners.forEach((l) => l(id));
}

function revokeUrl() {
  if (currentUrl) {
    try {
      URL.revokeObjectURL(currentUrl);
    } catch {
      /* ignore */
    }
    currentUrl = null;
  }
}

/** Msg id currently speaking, or null. */
export function getSpeakingId(): string | null {
  return speakingId;
}

/** Subscribe to speaking-state changes (for the stop button). Returns unsub. */
export function onSpeakingChange(cb: (id: string | null) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/**
 * Arm the audio element inside a user gesture so iOS Safari will allow the
 * later programmatic play(). Safe to call on every send/mic tap.
 */
export function unlockAudio() {
  try {
    const el = getAudio();
    el.muted = true;
    const p = el.play();
    if (p && typeof p.then === "function") {
      p.then(() => {
        el.pause();
        el.currentTime = 0;
        el.muted = false;
      }).catch(() => {
        el.muted = false;
      });
    } else {
      el.pause();
      el.muted = false;
    }
  } catch {
    /* unlock is best-effort */
  }
}

/** Stop any current playback immediately and clear the speaking state. */
export function stopSpeaking() {
  if (audioEl) {
    try {
      audioEl.pause();
      audioEl.currentTime = 0;
    } catch {
      /* ignore */
    }
  }
  revokeUrl();
  setSpeaking(null);
}

/**
 * Speak `text` for message `id`. Stops any prior playback first. Resolves when
 * playback has started (or silently when it can't). Never throws.
 */
export async function speak(text: string, id: string) {
  const clean = (text || "").trim();
  if (!clean) return;

  // Stop whatever's playing before starting the new one.
  stopSpeaking();

  const capped =
    clean.length > TTS_CHAR_CAP ? clean.slice(0, TTS_CHAR_CAP - 1) + "…" : clean;

  try {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: capped }),
    });
    if (!res.ok) return; // not configured / upstream error → stay silent

    const blob = await res.blob();
    revokeUrl();
    currentUrl = URL.createObjectURL(blob);

    const el = getAudio();
    el.muted = false;
    el.src = currentUrl;
    setSpeaking(id);
    await el.play();
  } catch {
    // Autoplay blocked or network error — fall back to text-only.
    setSpeaking(null);
  }
}
