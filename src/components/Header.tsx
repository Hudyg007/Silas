"use client";

import { useEffect, useState } from "react";
import {
  getSpeechEnabled,
  setSpeechEnabled,
  onSettingsChange,
  SPEECH_ENABLED_KEY,
} from "@/lib/settings";

// Floating full-width header pill: "Silas" + live dot on the left, a speaker
// toggle and a live military clock + numeric date (JetBrains Mono) on the right.
export function Header() {
  // Null until mounted so server and first client render agree (no hydration
  // mismatch); the interval then fills in the real time and ticks every 1s.
  const [now, setNow] = useState<Date | null>(null);
  const [speech, setSpeech] = useState(false);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Read the persisted speaker choice on mount, and stay in sync if it changes
  // elsewhere. Default OFF (Silas stays silent until you turn him on).
  useEffect(() => {
    setSpeech(getSpeechEnabled());
    return onSettingsChange((key) => {
      if (key === SPEECH_ENABLED_KEY) setSpeech(getSpeechEnabled());
    });
  }, []);

  function toggleSpeech() {
    const next = !speech;
    setSpeech(next);
    setSpeechEnabled(next);
  }

  const pad = (n: number) => String(n).padStart(2, "0");
  const time = now ? `${pad(now.getHours())}:${pad(now.getMinutes())}` : "--:--";
  const date = now
    ? `${pad(now.getMonth() + 1)}.${pad(now.getDate())}.${now.getFullYear()}`
    : "--.--.----";

  return (
    <header className="fixed top-0 left-0 right-0 z-30 px-5 pt-4">
      <div className="max-w-2xl mx-auto flex items-center justify-between rounded-full silas-glass px-5 py-3">
        <div className="flex items-center gap-2">
          <span className="font-sans font-semibold text-[20px] text-[var(--text)] tracking-tight">
            Silas
          </span>
          <span className="silas-live-dot" aria-label="live" />
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={toggleSpeech}
            className="flex items-center justify-center w-9 h-9 rounded-full transition-transform active:scale-90"
            style={{ color: speech ? "var(--ice-bright)" : "var(--text-muted)" }}
            aria-label={speech ? "Silas voice on" : "Silas voice off"}
            aria-pressed={speech}
            title={speech ? "Silas speaks his replies" : "Silas is silent"}
          >
            {speech ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  d="M11 5 6 9H3v6h3l5 4V5Z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M15.5 8.5a5 5 0 0 1 0 7M18 6a9 9 0 0 1 0 12"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  d="M11 5 6 9H3v6h3l5 4V5Z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="m17 9 4 6M21 9l-4 6"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </button>
          <div className="flex flex-col items-end leading-tight font-mono tabular-nums">
            <span className="text-[15px] tracking-widest text-[var(--ice-dim)]">{time}</span>
            <span className="text-[11px] tracking-wider text-[var(--text-muted)]">{date}</span>
          </div>
        </div>
      </div>
    </header>
  );
}
