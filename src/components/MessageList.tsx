import { MessageBubble } from "./MessageBubble";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  pending?: boolean;
};

// Five-step evaporation ramp: newest 100% → oldest ~10%. The newest exchange
// (last user+assistant pair) is pinned at level 0 and never fades.
const FADE_STEPS = [1, 0.65, 0.4, 0.22, 0.1];

export function MessageList({
  messages,
  idle,
  speakingId = null,
  onStopSpeak,
}: {
  messages: Message[];
  idle: boolean;
  // Id of the assistant message whose audio is currently playing (or null).
  speakingId?: string | null;
  onStopSpeak?: () => void;
}) {
  if (messages.length === 0) return null;
  const total = messages.length;

  return (
    <div className="flex flex-col gap-6">
      {messages.map((m, i) => {
        // Distance from the newest message; 0 and 1 are the last pair.
        const dist = total - 1 - i;
        const level = Math.max(0, dist - 1);
        const opacity = idle ? FADE_STEPS[Math.min(level, FADE_STEPS.length - 1)] : 1;
        return (
          <MessageBubble
            key={m.id}
            role={m.role}
            content={m.content}
            pending={m.pending}
            opacity={opacity}
            idle={idle}
            speaking={m.role === "assistant" && m.id === speakingId}
            onStopSpeak={onStopSpeak}
          />
        );
      })}
    </div>
  );
}
