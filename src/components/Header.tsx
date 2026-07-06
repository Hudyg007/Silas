"use client";

import { useEffect, useState } from "react";

// Floating full-width header pill: "Silas" + live dot on the left, a live
// military clock and numeric date (JetBrains Mono) on the right.
export function Header() {
  // Null until mounted so server and first client render agree (no hydration
  // mismatch); the interval then fills in the real time and ticks every 1s.
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

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
        <div className="flex flex-col items-end leading-tight font-mono tabular-nums">
          <span className="text-[15px] tracking-widest text-[var(--ice-dim)]">{time}</span>
          <span className="text-[11px] tracking-wider text-[var(--text-muted)]">{date}</span>
        </div>
      </div>
    </header>
  );
}
