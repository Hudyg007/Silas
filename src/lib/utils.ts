import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Compact relative time, e.g. "just now", "2h ago", "3d ago".
 * Rendered in JetBrains Mono on the conversation rows.
 */
export function relativeTime(input: string | number | Date): string {
  const then = new Date(input).getTime();
  if (!Number.isFinite(then)) return "";
  const diff = Date.now() - then;
  const sec = Math.max(0, Math.floor(diff / 1000));
  if (sec < 45) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  const wk = Math.floor(day / 7);
  if (wk < 5) return `${wk}w ago`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(day / 365)}y ago`;
}
