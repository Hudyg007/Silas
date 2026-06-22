import { MessageBubble } from "./MessageBubble";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  pending?: boolean;
};

export function MessageList({ messages }: { messages: Message[] }) {
  if (messages.length === 0) return null;
  return (
    <div className="flex flex-col gap-4">
      {messages.map((m) => (
        <MessageBubble key={m.id} role={m.role} content={m.content} pending={m.pending} />
      ))}
    </div>
  );
}
