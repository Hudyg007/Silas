"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MessageList } from "./MessageList";
import { ChatInput } from "./ChatInput";
import { Header } from "./Header";
import {
  cpsFromTypingSpeed,
  getTypingSpeed,
  onSettingsChange,
  setCurrentConversationId,
  TYPING_SPEED_KEY,
} from "@/lib/settings";

// After this long with no interaction, older messages evaporate (fade by age).
const IDLE_MS = 6000;

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  pending?: boolean;
};

// ---------------------------------------------------------------------------
// Typewriter tuning constants — adjust these to change how Silas "types".
//
//   TO MAKE HIM TYPE FASTER OR SLOWER: change BASE_CPS (characters per second).
//   Higher = faster, lower = slower. Everything else is feel/polish.
// ---------------------------------------------------------------------------
const BASE_CPS = 45; // base typing speed, characters revealed per second
const TICK_MS = 20; // how often the reveal loop runs (ms); 16–30ms is smooth
const SENTENCE_PAUSE_MS = 250; // extra pause after . ? !
const NEWLINE_PAUSE_MS = 180; // extra pause after a newline
const COMMA_PAUSE_MS = 80; // short pause after a comma
const MAX_BACKLOG = 120; // if displayed text lags this many chars behind the
//                          network buffer, speed up to catch back up
const CATCHUP_SECONDS = 1.2; // when catching up, drain the backlog within ~this
//                              window so we never lag more than a second or two

// Per-message reveal state. The network fills `target`; the reveal loop walks
// `shown` toward `target.length`, pushing the revealed slice into the message.
type Reveal = {
  msgId: string;
  target: string; // full text received from the network so far
  shown: number; // number of characters currently displayed
  streamEnded: boolean; // true once "done"/"error"/catch fired — drain, then finalize
  frac: number; // fractional-character accumulator between ticks
  pauseMs: number; // remaining "thinking" pause before the next reveal
};

// Single on/off switch for the onboarding paragraph shown on open. Flip to
// `true` to fully restore the fetch("/api/onboarding") behavior.
const ONBOARDING_ENABLED = false;

export function ChatInterface({
  initialConversationId = null,
}: {
  initialConversationId?: string | null;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(initialConversationId);
  const [sending, setSending] = useState(false);
  const [onboardingMessage, setOnboardingMessage] = useState<string | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  // The single active reveal (null when nothing is typing). A long-lived
  // interval reads this each tick, so there's only ever one timer to clean up.
  const revealRef = useRef<Reveal | null>(null);

  // Effective typewriter speed (chars/sec), driven by the settings screen.
  // Defaults to BASE_CPS; the reveal loop reads this live so slider changes
  // take effect immediately.
  const cpsRef = useRef<number>(BASE_CPS);
  useEffect(() => {
    cpsRef.current = cpsFromTypingSpeed(getTypingSpeed());
    return onSettingsChange((key) => {
      if (key === TYPING_SPEED_KEY) cpsRef.current = cpsFromTypingSpeed(getTypingSpeed());
    });
  }, []);

  // Re-open an existing conversation when arriving via /?c=<id>.
  useEffect(() => {
    if (!initialConversationId) return;
    setCurrentConversationId(initialConversationId);
    fetch(`/api/conversations/${encodeURIComponent(initialConversationId)}/messages`)
      .then((r) => r.json())
      .then((data) => {
        const loaded: Message[] = (data.messages ?? []).map(
          (m: { id: string; role: "user" | "assistant"; content: string }) => ({
            id: m.id,
            role: m.role,
            content: m.content,
          })
        );
        if (loaded.length > 0) {
          setMessages(loaded);
          setShowOnboarding(false);
        }
      })
      .catch((err) => console.error("load conversation failed:", err));
  }, [initialConversationId]);

  // Remember the active conversation so the conversations list can flag it live
  // and the settings "Clear conversation" action knows which one to target.
  useEffect(() => {
    if (conversationId) setCurrentConversationId(conversationId);
  }, [conversationId]);

  // Evaporation: when idle, MessageList fades older messages by age. Any
  // interaction (scroll/touch/keypress) or new message restores full opacity.
  const [idle, setIdle] = useState(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetIdle = useCallback(() => {
    setIdle(false);
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => setIdle(true), IDLE_MS);
  }, []);

  // Restore instantly on any global interaction, then re-arm the idle timer.
  useEffect(() => {
    const wake = () => resetIdle();
    window.addEventListener("keydown", wake);
    window.addEventListener("touchstart", wake, { passive: true });
    window.addEventListener("pointerdown", wake);
    return () => {
      window.removeEventListener("keydown", wake);
      window.removeEventListener("touchstart", wake);
      window.removeEventListener("pointerdown", wake);
    };
  }, [resetIdle]);

  // Kick off the idle countdown on mount; clean up on unmount.
  useEffect(() => {
    resetIdle();
    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, [resetIdle]);

  // A new (or still-streaming) message counts as interaction: keep everything
  // at full opacity while it lands, then let the idle timer fade it later.
  useEffect(() => {
    resetIdle();
  }, [messages, resetIdle]);

  useEffect(() => {
    if (!ONBOARDING_ENABLED) {
      setShowOnboarding(false);
      return;
    }
    fetch("/api/onboarding")
      .then((r) => r.json())
      .then((data) => {
        if (data.message) {
          setOnboardingMessage(data.message);
        } else {
          setShowOnboarding(false);
        }
      })
      .catch((err) => {
        console.error("onboarding fetch failed:", err);
        setShowOnboarding(false);
      });
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Steady reveal loop: moves characters from the target buffer into the
  // displayed message a few at a time, with adaptive speed and natural pauses.
  useEffect(() => {
    const interval = setInterval(() => {
      const st = revealRef.current;
      if (!st) return;

      // Honor any "thinking" pause first.
      if (st.pauseMs > 0) {
        st.pauseMs = Math.max(0, st.pauseMs - TICK_MS);
        return;
      }

      const backlog = st.target.length - st.shown;

      // Caught up: if the stream is finished, finalize; otherwise just wait.
      if (backlog <= 0) {
        if (st.streamEnded) {
          const id = st.msgId;
          const finalContent = st.target;
          revealRef.current = null;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === id ? { ...m, content: finalContent, pending: false } : m
            )
          );
          setSending(false);
        }
        return;
      }

      // Adaptive rate: stay calm when keeping up, speed up when far behind so
      // the visible text never lags more than ~CATCHUP_SECONDS behind.
      const catchUp = backlog > MAX_BACKLOG;
      const baseCps = cpsRef.current || BASE_CPS;
      const rate = catchUp
        ? Math.max(baseCps, backlog / CATCHUP_SECONDS)
        : baseCps;

      st.frac += (rate * TICK_MS) / 1000;
      const budget = Math.floor(st.frac);
      if (budget < 1) return; // not enough accumulated for a full character yet
      st.frac -= budget;

      // Reveal up to `budget` characters, stopping early to insert a natural
      // pause after punctuation. While catching up we skip pauses entirely.
      let revealed = 0;
      while (revealed < budget && st.shown < st.target.length) {
        const ch = st.target[st.shown];
        st.shown++;
        revealed++;
        if (!catchUp) {
          if (ch === "." || ch === "?" || ch === "!") {
            st.pauseMs = SENTENCE_PAUSE_MS;
            break;
          }
          if (ch === "\n") {
            st.pauseMs = NEWLINE_PAUSE_MS;
            break;
          }
          if (ch === ",") {
            st.pauseMs = COMMA_PAUSE_MS;
            break;
          }
        }
      }

      if (revealed > 0) {
        const id = st.msgId;
        const shownText = st.target.slice(0, st.shown);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === id ? { ...m, content: shownText, pending: true } : m
          )
        );
      }
    }, TICK_MS);

    return () => clearInterval(interval);
  }, []);

  async function send(text: string) {
    if (sending || !text.trim()) return;
    setSending(true);
    setShowOnboarding(false);

    const userMsg: Message = { id: `u-${Date.now()}`, role: "user", content: text };
    const assistantMsg: Message = { id: `a-${Date.now()}`, role: "assistant", content: "", pending: true };
    setMessages((prev) => [...prev, userMsg, assistantMsg]);

    // Start a fresh reveal for this assistant message. Replacing the ref drops
    // any previous reveal so nothing from an earlier message leaks in.
    const myId = assistantMsg.id;
    revealRef.current = {
      msgId: myId,
      target: "",
      shown: 0,
      streamEnded: false,
      frac: 0,
      pauseMs: 0,
    };

    // Tell the brain Silas has started thinking (drives THINKING mode).
    window.dispatchEvent(new CustomEvent("silas:thinking", { detail: { active: true } }));

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, message: text }),
      });

      if (!res.ok || !res.body) {
        throw new Error(`Chat failed: ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const evt = JSON.parse(line.slice(6));
            if (evt.type === "delta") {
              // Append to the target buffer; the reveal loop handles display.
              if (revealRef.current?.msgId === myId) {
                revealRef.current.target += evt.text;
              }
              // Pulse the brain in time with each token Silas emits.
              window.dispatchEvent(new CustomEvent("silas:token"));
            } else if (evt.type === "done") {
              if (evt.conversationId) setConversationId(evt.conversationId);
              // Don't dump the rest — let the buffer finish revealing first.
              window.dispatchEvent(
                new CustomEvent("silas:thinking", { detail: { active: false } })
              );
            } else if (evt.type === "error") {
              if (revealRef.current?.msgId === myId) {
                revealRef.current.target += `\n\n[error: ${evt.message}]`;
              }
            }
          } catch (e) {
            console.error("SSE parse error:", e, line);
          }
        }
      }
    } catch (err) {
      console.error("send error:", err);
      // Same treatment as the error event: append, then let the buffer drain.
      if (revealRef.current?.msgId === myId) {
        revealRef.current.target += revealRef.current.target
          ? `\n\n[error: ${String(err)}]`
          : `[error: ${String(err)}]`;
      }
      window.dispatchEvent(
        new CustomEvent("silas:thinking", { detail: { active: false } })
      );
    } finally {
      // Safety net: whatever path we took, make sure the brain settles back down.
      window.dispatchEvent(
        new CustomEvent("silas:thinking", { detail: { active: false } })
      );
      // Mark the stream finished. The reveal loop will type out whatever's left
      // in the buffer and then flip the message to not-pending (and re-enable
      // input) once it has fully caught up.
      if (revealRef.current?.msgId === myId) {
        revealRef.current.streamEnded = true;
      }
    }
  }

  return (
    <div className="relative w-full min-h-screen flex flex-col">
      <Header />

      <div
        ref={scrollRef}
        onScroll={resetIdle}
        className="flex-1 overflow-y-auto px-5 pt-28 pb-36"
      >
        <div className="max-w-2xl mx-auto">
          {ONBOARDING_ENABLED && showOnboarding && onboardingMessage && (
            <div className="mb-8 p-5 rounded-[20px] silas-glass text-[var(--text)] leading-relaxed whitespace-pre-wrap">
              {onboardingMessage}
            </div>
          )}
          <MessageList messages={messages} idle={idle} />
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 px-5 pb-8 pt-6 pointer-events-none">
        <div className="max-w-2xl mx-auto pointer-events-auto">
          <ChatInput onSend={send} disabled={sending} />
        </div>
      </div>
    </div>
  );
}
