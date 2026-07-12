export function MessageBubble({
  role,
  content,
  pending,
  opacity,
  idle,
  speaking = false,
  onStopSpeak,
}: {
  role: "user" | "assistant";
  content: string;
  pending?: boolean;
  // Age-based evaporation opacity (1 = full). Applied only while idle.
  opacity: number;
  // When idle we ease into the faded gradient slowly (2.5s); restoring is quick.
  idle: boolean;
  // True while this (assistant) message's reply is being spoken aloud.
  speaking?: boolean;
  onStopSpeak?: () => void;
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

      {/* Stop button — only on the newest Silas message while audio plays. */}
      {speaking && (
        <button
          type="button"
          onClick={onStopSpeak}
          className="silas-stop mt-2 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition-transform active:scale-95"
          aria-label="Stop speaking"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <rect x="6" y="6" width="12" height="12" rx="2" />
          </svg>
          Stop
        </button>
      )}
    </div>
  );
}
