"use client";

import { useEffect, useState } from "react";
import { ShieldCheck, StickyNote, Trash2, AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { BottomNav } from "@/components/BottomNav";
import { MiniBrain } from "@/components/MiniBrain";
import {
  type BrainIntensity,
  getBrainIntensity,
  setBrainIntensity,
  getTypingSpeed,
  setTypingSpeed,
  getCurrentConversationId,
  DEFAULT_TYPING_SPEED,
  DEFAULT_BRAIN_INTENSITY,
  TYPING_SPEED_MIN,
  TYPING_SPEED_MAX,
} from "@/lib/settings";

function SectionLabel({ children, tone = "muted" }: { children: React.ReactNode; tone?: "muted" | "error" }) {
  return (
    <h2
      className={
        "px-4 font-label-caps text-label-caps uppercase " +
        (tone === "error" ? "text-error/60" : "text-on-surface-variant/60")
      }
    >
      {children}
    </h2>
  );
}

export default function SettingsPage() {
  // Presence prefs — hydrate from localStorage after mount to avoid SSR mismatch.
  const [intensity, setIntensity] = useState<BrainIntensity>(DEFAULT_BRAIN_INTENSITY);
  const [speed, setSpeed] = useState<number>(DEFAULT_TYPING_SPEED);

  // Memory stats.
  const [vault, setVault] = useState<{ noteCount: number; status: string } | null>(null);

  // Danger zone.
  const [confirming, setConfirming] = useState(false);
  const [clearState, setClearState] = useState<"idle" | "working" | "done" | "error" | "none">("idle");

  useEffect(() => {
    setIntensity(getBrainIntensity());
    setSpeed(getTypingSpeed());
    fetch("/api/vault/stats")
      .then((r) => r.json())
      .then((data) => setVault({ noteCount: data.noteCount ?? 0, status: data.status ?? "empty" }))
      .catch((err) => console.error("vault stats failed:", err));
  }, []);

  function toggleIntensity() {
    const next: BrainIntensity = intensity === "lively" ? "subtle" : "lively";
    setIntensity(next);
    setBrainIntensity(next);
  }

  function onSpeed(v: number) {
    setSpeed(v);
    setTypingSpeed(v);
  }

  async function clearConversation() {
    const id = getCurrentConversationId();
    if (!id) {
      setClearState("none");
      setConfirming(false);
      return;
    }
    setClearState("working");
    try {
      const res = await fetch(`/api/conversations/${encodeURIComponent(id)}/messages`, {
        method: "DELETE",
      });
      const data = await res.json();
      setClearState(res.ok && data.ok ? "done" : "error");
    } catch (err) {
      console.error("clear conversation failed:", err);
      setClearState("error");
    } finally {
      setConfirming(false);
    }
  }

  const isLively = intensity === "lively";
  const vaultConnected = (vault?.noteCount ?? 0) > 0;

  return (
    <div className="relative min-h-screen">
      <PageHeader title="settings" backHref="/" />

      <main className="relative z-10 space-y-section-margin px-container-padding pb-40 pt-section-margin">
        {/* ---------------- IDENTITY ---------------- */}
        <section className="space-y-element-gap">
          <SectionLabel>identity</SectionLabel>
          <div className="flex items-center gap-4 rounded-20 glass-panel p-5">
            <MiniBrain size={48} />
            <div>
              <p className="font-headline-md text-headline-md text-on-surface">Hudson</p>
              <p className="font-body-sm text-body-sm text-on-surface-variant">Primary Entity</p>
            </div>
          </div>
        </section>

        {/* ---------------- PRESENCE ---------------- */}
        <section className="space-y-element-gap">
          <SectionLabel>presence</SectionLabel>
          <div className="space-y-6 rounded-20 glass-panel p-5">
            {/* Brain intensity toggle */}
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="font-body-lg-mobile text-body-lg-mobile text-on-surface">Brain intensity</p>
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  {isLively ? "Lively" : "Subtle"}
                </p>
              </div>
              <button
                role="switch"
                aria-checked={isLively}
                aria-label="Brain intensity"
                onClick={toggleIntensity}
                className={
                  "relative h-6 w-12 shrink-0 rounded-full transition-colors duration-200 " +
                  (isLively ? "bg-primary-container" : "bg-surface-container-highest")
                }
              >
                <span
                  className={
                    "absolute top-0 block h-6 w-6 rounded-full shadow transition-transform duration-200 " +
                    (isLively ? "translate-x-6 bg-on-primary-container" : "translate-x-0 bg-white")
                  }
                />
              </button>
            </div>

            {/* Typing speed slider */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="font-body-lg-mobile text-body-lg-mobile text-on-surface">Typing speed</p>
                <span className="font-label-caps text-label-caps text-primary-container">
                  {speed.toFixed(1)}s
                </span>
              </div>
              <input
                type="range"
                min={TYPING_SPEED_MIN}
                max={TYPING_SPEED_MAX}
                step={0.1}
                value={speed}
                onChange={(e) => onSpeed(parseFloat(e.target.value))}
                aria-label="Typing speed"
                className="silas-slider h-1 w-full cursor-pointer appearance-none rounded-full bg-surface-container-highest"
              />
            </div>
          </div>
        </section>

        {/* ---------------- MEMORY ---------------- */}
        <section className="space-y-element-gap">
          <SectionLabel>memory</SectionLabel>
          <div className="divide-y divide-white/5 rounded-20 glass-panel">
            <div className="flex items-center justify-between p-5">
              <div className="flex items-center gap-3">
                <ShieldCheck size={22} className="text-primary-container" />
                <p className="font-body-lg-mobile text-body-lg-mobile text-on-surface">Vault status</p>
              </div>
              {/* Ice-blue badge — green is reserved for the live dot. */}
              <span className="rounded-full bg-primary-container/10 px-3 py-1 font-label-caps text-label-caps uppercase text-primary-container">
                {vault ? (vaultConnected ? "connected" : "empty") : "…"}
              </span>
            </div>
            <div className="flex items-center justify-between p-5">
              <div className="flex items-center gap-3">
                <StickyNote size={22} className="text-primary-container" />
                <p className="font-body-lg-mobile text-body-lg-mobile text-on-surface">Note count</p>
              </div>
              <span className="font-body-lg-mobile text-body-lg-mobile text-on-surface-variant">
                {vault ? `${vault.noteCount.toLocaleString()} ${vault.noteCount === 1 ? "entry" : "entries"}` : "…"}
              </span>
            </div>
          </div>
        </section>

        {/* ---------------- DANGER ZONE ---------------- */}
        <section className="space-y-element-gap">
          <SectionLabel tone="error">danger zone</SectionLabel>

          {!confirming ? (
            <button
              onClick={() => {
                setClearState("idle");
                setConfirming(true);
              }}
              className="group flex w-full items-center justify-between rounded-20 glass-panel p-5 transition-transform duration-200 active:scale-95"
            >
              <div className="flex items-center gap-3">
                <Trash2 size={22} className="text-error" />
                <p className="font-body-lg-mobile text-body-lg-mobile text-error">Clear conversation</p>
              </div>
            </button>
          ) : (
            <div className="space-y-4 rounded-20 border border-error/40 bg-error/5 p-5">
              <div className="flex items-center gap-3">
                <AlertTriangle size={22} className="text-error" />
                <p className="font-body-lg-mobile text-body-lg-mobile text-error">
                  Delete this conversation&apos;s messages?
                </p>
              </div>
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                This permanently clears every message in your current conversation. It can&apos;t be undone.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={clearConversation}
                  disabled={clearState === "working"}
                  className="flex-1 rounded-full bg-error px-4 py-2 font-body-sm text-body-sm font-semibold text-on-error transition-opacity active:opacity-80 disabled:opacity-50"
                >
                  {clearState === "working" ? "Clearing…" : "Clear"}
                </button>
                <button
                  onClick={() => setConfirming(false)}
                  className="flex-1 rounded-full border border-white/10 px-4 py-2 font-body-sm text-body-sm text-on-surface transition-colors hover:bg-white/5"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {clearState === "done" && (
            <p className="px-4 font-body-sm text-body-sm text-primary-container">Conversation cleared.</p>
          )}
          {clearState === "none" && (
            <p className="px-4 font-body-sm text-body-sm text-on-surface-variant">
              No active conversation to clear.
            </p>
          )}
          {clearState === "error" && (
            <p className="px-4 font-body-sm text-body-sm text-error">Couldn&apos;t clear conversation.</p>
          )}
        </section>
      </main>

      <BottomNav />
    </div>
  );
}
