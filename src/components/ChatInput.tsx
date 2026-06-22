"use client";

import { useEffect, useRef, useState } from "react";

export function ChatInput({
  onSend,
  disabled,
}: {
  onSend: (text: string) => void;
  disabled?: boolean;
}) {
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.style.height = "auto";
      ref.current.style.height = Math.min(ref.current.scrollHeight, 200) + "px";
    }
  }, [text]);

  function submit() {
    if (disabled || !text.trim()) return;
    onSend(text.trim());
    setText("");
  }

  return (
    <div className="flex items-end gap-2 rounded-2xl border border-white/15 bg-black/40 px-4 py-3" style={{ backdropFilter: "blur(16px)" }}>
      <textarea
        ref={ref}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder="talk to silas..."
        disabled={disabled}
        rows={1}
        className="flex-1 resize-none bg-transparent text-white placeholder-white/30 outline-none leading-relaxed max-h-[200px]"
      />
      <button
        onClick={submit}
        disabled={disabled || !text.trim()}
        className="text-white/70 hover:text-white disabled:opacity-30 transition px-3 py-1 rounded-lg hover:bg-white/10"
        aria-label="Send"
      >
        ↑
      </button>
    </div>
  );
}
