"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { BottomNav } from "@/components/BottomNav";
import { relativeTime } from "@/lib/utils";
import { getCurrentConversationId } from "@/lib/settings";

type Conversation = {
  id: string;
  title: string;
  preview: string;
  updated_at: string;
};

export default function ConversationsPage() {
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    setOpenId(getCurrentConversationId());
    fetch("/api/conversations")
      .then((r) => r.json())
      .then((data) => setConversations(data.conversations ?? []))
      .catch((err) => console.error("load conversations failed:", err))
      .finally(() => setLoading(false));
  }, []);

  function openConversation(id: string) {
    router.push(`/?c=${encodeURIComponent(id)}`);
  }

  function newConversation() {
    // No id → chat screen starts a fresh conversation.
    router.push("/");
  }

  return (
    <div className="relative min-h-screen">
      <PageHeader title="conversations" backHref="/" />

      <main className="relative z-10 px-container-padding pb-40 pt-section-margin">
        {loading ? (
          <p className="px-2 font-body-sm text-body-sm text-on-surface-variant/60">Loading…</p>
        ) : conversations.length === 0 ? (
          <div className="mt-20 flex flex-col items-center gap-3 text-center">
            <p className="font-headline-md text-headline-md text-on-surface">No conversations yet</p>
            <p className="font-body-sm text-body-sm text-on-surface-variant/70">
              Tap the + to start talking to Silas.
            </p>
          </div>
        ) : (
          <div className="evaporation-gradient flex flex-col gap-element-gap">
            {conversations.map((c, i) => {
              // The most-recent row (newest-first → index 0) is the "active" row:
              // ice-blue left edge + ice-blue timestamp. The green live dot is a
              // separate signal, shown only on the conversation that's currently
              // open in the chat screen (this is the one place green is allowed).
              const isActive = i === 0;
              const isOpen = openId != null && c.id === openId;
              return (
                <button
                  key={c.id}
                  onClick={() => openConversation(c.id)}
                  className={
                    "group flex items-center justify-between rounded-24 glass-panel p-bubble-padding-x text-left transition-all duration-300 hover:bg-white/10 active:scale-[0.98] " +
                    (isActive ? "border-l-2 border-l-primary-container" : "")
                  }
                >
                  <div className="flex flex-col gap-1 overflow-hidden">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate font-headline-md text-headline-md text-on-surface">
                        {c.title}
                      </h3>
                      {/* Live indicator — the only place green is allowed on this screen. */}
                      {isOpen && (
                        <span
                          aria-label="live"
                          className="pulse-soft h-2 w-2 shrink-0 rounded-full bg-live shadow-[0_0_6px_2px_rgba(51,224,122,0.6)]"
                        />
                      )}
                    </div>
                    <p
                      className={
                        "truncate font-body-sm text-body-sm " +
                        (isActive ? "text-on-surface" : "text-on-surface-variant")
                      }
                    >
                      {c.preview || "No messages yet"}
                    </p>
                  </div>
                  <div className="ml-4 shrink-0">
                    <span
                      className={
                        "font-label-caps text-label-caps " +
                        (isActive ? "text-primary-container" : "text-on-surface-variant/60")
                      }
                    >
                      {relativeTime(c.updated_at)}
                    </span>
                  </div>
                </button>
              );
            })}

            {/* Decorative organic divider echoing the reference design. */}
            <div className="mt-section-margin flex justify-center opacity-40">
              <div className="h-px w-16 bg-gradient-to-r from-transparent via-primary-container to-transparent" />
            </div>
          </div>
        )}
      </main>

      {/* Floating "new conversation" action. */}
      <button
        onClick={newConversation}
        aria-label="New conversation"
        className="fixed bottom-28 right-8 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary-container text-on-primary-container shadow-2xl shadow-primary-container/30 transition-transform duration-300 active:scale-90"
      >
        <Plus size={28} strokeWidth={2.4} />
      </button>

      <BottomNav />
    </div>
  );
}
