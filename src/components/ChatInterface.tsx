"use client";

import { useEffect, useRef, useState } from "react";
import { MessageList } from "./MessageList";
import { ChatInput } from "./ChatInput";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  pending?: boolean;
};

/* ------------------------------------------------------------------ *
 * Typewriter reveal tunables
 * ------------------------------------------------------------------ *
 * The network and the screen are decoupled: deltas land in a TARGET
 * buffer, and a steady loop drips characters from that buffer into the
 * DISPLAYED text so Silas appears to type.
 *
 * To make Silas type FASTER or SLOWER, change BASE_CPS (characters per
 * second). Everything else only shapes the feel.
 */
const BASE_CPS = 45; // base typing speed (characters/second) — raise to speed up, lower to slow down
const TICK_MS = 20; // reveal loop tick interval (ms)
const SENTENCE_PAUSE_MS = 250; // extra pause after . ? !
const NEWLINE_PAUSE_MS = 180; // extra pause after a newline
const COMMA_PAUSE_MS = 80; // extra pause after a comma
const MAX_BACKLOG = 120; // chars the buffer may get ahead before we speed up to catch up

// How long to pause after revealing a given character (ms). 0 = no pause.
function pauseForChar(ch: string): number {
  if (ch === "." || ch === "?" || ch === "!") return SENTENCE_PAUSE_MS;
  if (ch === "\n") return NEWLINE_PAUSE_MS;
  if (ch === ",") return COMMA_PAUSE_MS;
  return 0;
}

export function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [onboardingMessage, setOnboardingMessage] = useState<string | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  // --- Typewriter state (refs so the reveal loop doesn't re-render on every tick) ---
  const targetRef = useRef(""); // full text received from the network so far
  const displayedRef = useRef(""); // text currently shown on screen
  const carryRef = useRef(0); // fractional characters carried between ticks
  const pauseTicksRef = useRef(0); // remaining ticks to wait for a natural pause
  const streamDoneRef = useRef(false); // network finished (done/error/closed)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const assistantIdRef = useRef<string>(""); // id of the message being revealed

  useEffect(() => {
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

  // Clean up the reveal timer if the component unmounts mid-type.
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  // Stop the current reveal loop and snap the in-progress message to its full
  // text. Called when a new message starts so nothing is left half-typed.
  function flushAndStopReveal() {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    const prevId = assistantIdRef.current;
    if (prevId) {
      const full = targetRef.current;
      setMessages((prev) =>
        prev.map((m) => (m.id === prevId ? { ...m, content: full, pending: false } : m))
      );
    }
  }

  // Start the steady reveal loop for the given assistant message id.
  function startReveal(id: string) {
    if (intervalRef.current) clearInterval(intervalRef.current);

    intervalRef.current = setInterval(() => {
      const target = targetRef.current;
      const displayed = displayedRef.current;
      const backlog = target.length - displayed.length;

      // Nothing left to reveal.
      if (backlog <= 0) {
        // Only finish once the network has actually completed.
        if (streamDoneRef.current) {
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          setMessages((prev) =>
            prev.map((m) => (m.id === id ? { ...m, content: target, pending: false } : m))
          );
        }
        return;
      }

      const catchUp = backlog > MAX_BACKLOG;

      // Honor natural pauses, but not while we're racing to catch up.
      if (!catchUp && pauseTicksRef.current > 0) {
        pauseTicksRef.current -= 1;
        return;
      }

      // Reveal rate: calm base speed, plus a boost proportional to how far the
      // buffer has run ahead so we never lag more than a second or two.
      let cps = BASE_CPS;
      if (catchUp) cps += backlog - MAX_BACKLOG;

      carryRef.current += (cps * TICK_MS) / 1000;
      const n = Math.floor(carryRef.current);
      if (n < 1) return;
      carryRef.current -= n;

      let next = displayed;
      let revealed = 0;
      while (revealed < n && next.length < target.length) {
        const ch = target[next.length];
        next += ch;
        revealed++;
        // When typing calmly, pause after sentence-ends / newlines / commas.
        if (!catchUp) {
          const pause = pauseForChar(ch);
          if (pause > 0) {
            pauseTicksRef.current = Math.round(pause / TICK_MS);
            break;
          }
        }
      }

      if (next !== displayed) {
        displayedRef.current = next;
        setMessages((prev) =>
          prev.map((m) => (m.id === id ? { ...m, content: next } : m))
        );
      }
    }, TICK_MS);
  }

  async function send(text: string) {
    if (sending || !text.trim()) return;
    setSending(true);
    setShowOnboarding(false);

    // Finish any previous reveal before starting a new one.
    flushAndStopReveal();

    const userMsg: Message = { id: `u-${Date.now()}`, role: "user", content: text };
    const assistantMsg: Message = { id: `a-${Date.now()}`, role: "assistant", content: "", pending: true };
    setMessages((prev) => [...prev, userMsg, assistantMsg]);

    // Reset typewriter buffers for this message and kick off the reveal loop.
    targetRef.current = "";
    displayedRef.current = "";
    carryRef.current = 0;
    pauseTicksRef.current = 0;
    streamDoneRef.current = false;
    assistantIdRef.current = assistantMsg.id;
    startReveal(assistantMsg.id);

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
              // Feed the target buffer; the reveal loop shows it gradually.
              targetRef.current += evt.text;
            } else if (evt.type === "done") {
              if (evt.conversationId) setConversationId(evt.conversationId);
              // Let the buffer drain, then the loop marks not-pending.
              streamDoneRef.current = true;
            } else if (evt.type === "error") {
              targetRef.current += `\n\n[error: ${evt.message}]`;
              streamDoneRef.current = true;
            }
          } catch (e) {
            console.error("SSE parse error:", e, line);
          }
        }
      }

      // Network fully read — let whatever is buffered finish typing out.
      streamDoneRef.current = true;
    } catch (err) {
      console.error("send error:", err);
      // Same as the error event: append, then let the buffer drain.
      targetRef.current += `\n\n[error: ${String(err)}]`;
      streamDoneRef.current = true;
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="relative w-full min-h-screen flex flex-col">
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 pt-16 pb-32">
        <div className="max-w-2xl mx-auto">
          {showOnboarding && onboardingMessage && (
            <div className="mb-8 p-5 rounded-xl bg-white/[0.04] border border-white/10 text-white/90 leading-relaxed whitespace-pre-wrap">
              {onboardingMessage}
            </div>
          )}
          <MessageList messages={messages} />
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black via-black/80 to-transparent">
        <div className="max-w-2xl mx-auto">
          <ChatInput onSend={send} disabled={sending} />
        </div>
      </div>
    </div>
  );
}
