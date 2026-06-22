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

export function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [onboardingMessage, setOnboardingMessage] = useState<string | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

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

  async function send(text: string) {
    if (sending || !text.trim()) return;
    setSending(true);
    setShowOnboarding(false);

    const userMsg: Message = { id: `u-${Date.now()}`, role: "user", content: text };
    const assistantMsg: Message = { id: `a-${Date.now()}`, role: "assistant", content: "", pending: true };
    setMessages((prev) => [...prev, userMsg, assistantMsg]);

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
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsg.id ? { ...m, content: m.content + evt.text, pending: true } : m
                )
              );
            } else if (evt.type === "done") {
              if (evt.conversationId) setConversationId(evt.conversationId);
              setMessages((prev) =>
                prev.map((m) => (m.id === assistantMsg.id ? { ...m, pending: false } : m))
              );
            } else if (evt.type === "error") {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsg.id
                    ? { ...m, content: m.content + `\n\n[error: ${evt.message}]`, pending: false }
                    : m
                )
              );
            }
          } catch (e) {
            console.error("SSE parse error:", e, line);
          }
        }
      }
    } catch (err) {
      console.error("send error:", err);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsg.id
            ? { ...m, content: `[error: ${String(err)}]`, pending: false }
            : m
        )
      );
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
