export function MessageBubble({
  role,
  content,
  pending,
}: {
  role: "user" | "assistant";
  content: string;
  pending?: boolean;
}) {
  const isUser = role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`
          max-w-[85%] rounded-2xl px-4 py-3 leading-relaxed whitespace-pre-wrap
          ${isUser
            ? "bg-white/[0.08] border border-white/15 text-white"
            : "bg-white/[0.04] border border-white/10 text-white/90"
          }
        `}
        style={{ backdropFilter: "blur(12px)" }}
      >
        {content || (pending ? <span className="inline-block animate-pulse opacity-50">…</span> : "")}
        {pending && content && (
          <span className="inline-block ml-1 w-[6px] h-[14px] bg-white/60 animate-pulse" aria-hidden />
        )}
      </div>
    </div>
  );
}
