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
    <div className="flex items-end gap-2 rounded-full silas-glass pl-5 pr-2 py-2">
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
        placeholder="talk to silas…"
        disabled={disabled}
        rows={1}
        className="flex-1 resize-none bg-transparent text-[var(--text)] placeholder:text-[var(--text-muted)] outline-none leading-relaxed max-h-[160px] py-2.5"
      />
      <button
        onClick={submit}
        disabled={disabled || !text.trim()}
        className="silas-send flex items-center justify-center w-11 h-11 rounded-full shrink-0 disabled:opacity-40 transition-transform active:scale-90"
        aria-label="Send"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M12 19V5M12 5l-6 6M12 5l6 6"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </div>
  );
}
