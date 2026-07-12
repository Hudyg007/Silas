"use client";

/**
 * Client-side user preferences, persisted in localStorage and broadcast to any
 * live component (BrainCanvas / typewriter) via a window CustomEvent so changes
 * on the settings screen take effect immediately without a reload.
 */

export type BrainIntensity = "subtle" | "lively";

const KEYS = {
  brainIntensity: "silas:brainIntensity",
  typingSpeed: "silas:typingSpeed",
  currentConversationId: "silas:currentConversationId",
  speechEnabled: "silas:speechEnabled",
} as const;

// Defaults chosen to match the pre-settings behaviour: lively brain, and a
// typing pace of 0.8s which maps to the original BASE_CPS of 45 (36 / 0.8).
export const DEFAULT_BRAIN_INTENSITY: BrainIntensity = "lively";
export const DEFAULT_TYPING_SPEED = 0.8; // seconds
export const TYPING_SPEED_MIN = 0.1;
export const TYPING_SPEED_MAX = 2.0;

/** The typewriter's characters-per-second, derived from the typing-speed slider. */
export function cpsFromTypingSpeed(seconds: number): number {
  const s = Math.min(TYPING_SPEED_MAX, Math.max(TYPING_SPEED_MIN, seconds || DEFAULT_TYPING_SPEED));
  return 36 / s;
}

function readRaw(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeRaw(key: string, value: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* storage may be unavailable (private mode) — settings just won't persist */
  }
}

/** Fired whenever any setting changes. detail.key names the field that changed. */
export function onSettingsChange(handler: (key: string) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const listener = (e: Event) => handler((e as CustomEvent<{ key: string }>).detail?.key ?? "");
  window.addEventListener("silas:settings", listener as EventListener);
  return () => window.removeEventListener("silas:settings", listener as EventListener);
}

function broadcast(key: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("silas:settings", { detail: { key } }));
}

// --- Brain intensity -------------------------------------------------------
export function getBrainIntensity(): BrainIntensity {
  return readRaw(KEYS.brainIntensity) === "subtle" ? "subtle" : DEFAULT_BRAIN_INTENSITY;
}
export function setBrainIntensity(value: BrainIntensity) {
  writeRaw(KEYS.brainIntensity, value);
  broadcast(KEYS.brainIntensity);
}
export const BRAIN_INTENSITY_KEY = KEYS.brainIntensity;

// --- Typing speed ----------------------------------------------------------
export function getTypingSpeed(): number {
  const raw = readRaw(KEYS.typingSpeed);
  const n = raw == null ? DEFAULT_TYPING_SPEED : parseFloat(raw);
  return Number.isFinite(n) ? n : DEFAULT_TYPING_SPEED;
}
export function setTypingSpeed(seconds: number) {
  writeRaw(KEYS.typingSpeed, String(seconds));
  broadcast(KEYS.typingSpeed);
}
export const TYPING_SPEED_KEY = KEYS.typingSpeed;

// --- Voice output (Silas speaks his replies via ElevenLabs) ----------------
// Default OFF so nobody's phone starts talking unexpectedly.
export function getSpeechEnabled(): boolean {
  return readRaw(KEYS.speechEnabled) === "1";
}
export function setSpeechEnabled(enabled: boolean) {
  writeRaw(KEYS.speechEnabled, enabled ? "1" : "0");
  broadcast(KEYS.speechEnabled);
}
export const SPEECH_ENABLED_KEY = KEYS.speechEnabled;

// --- Current (last-opened) conversation ------------------------------------
export function getCurrentConversationId(): string | null {
  return readRaw(KEYS.currentConversationId);
}
export function setCurrentConversationId(id: string | null) {
  if (id) writeRaw(KEYS.currentConversationId, id);
  else if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(KEYS.currentConversationId);
    } catch {
      /* ignore */
    }
  }
  broadcast(KEYS.currentConversationId);
}
