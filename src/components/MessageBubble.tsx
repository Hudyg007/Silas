export function MessageBubble({
  role,
  content,
  pending,
  opacity,
  idle,
}: {
  role: "user" | "assistant";
  content: string;
  pending?: boolean;
  // Age-based evaporation opacity (1 = full). Applied only while idle.
  opacity: number;
  // When idle we ease into the faded gradient slowly (2.5s); restoring is quick.
  idle: boolean;
}) {
  const isUser = role === "user";
  const isTyping = !content && pending;

  return (
    <div
      className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}
      style={{
        opacity,
        transition: `opacity ${idle ? "2.5s" : "0.25s"} ease`,
      }}
    >
      {/* Name label — uppercase JetBrains Mono, 0.1em tracking. */}
      {isUser ? (
        <span className="silas-label text-[var(--text-muted)] mb-1.5 pr-1">HUDSON</span>
      ) : (
        <span className="silas-label text-[var(--ice-tint)] mb-1.5 pl-0.5 flex items-center gap-1.5">
          <span className="silas-name-dot" />
          SILAS
        </span>
      )}

      <div
        className={`silas-bubble max-w-[85%] px-4 py-3 leading-relaxed whitespace-pre-wrap text-[var(--text)] ${
          isUser ? "silas-bubble-user" : "silas-bubble-silas"
        } ${isTyping ? "silas-bubble-typing" : ""}`}
      >
        {content}
        {pending && content && <span className="silas-caret" aria-hidden />}
      </div>
    </div>
  );
}
