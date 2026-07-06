import { ChatInterface } from "@/components/ChatInterface";

// Single-user mode: no auth. You're the only user. Just walk in.
// An optional ?c=<conversationId> re-opens an existing conversation.
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const { c } = await searchParams;
  return (
    <main className="min-h-screen w-full">
      <ChatInterface initialConversationId={c ?? null} />
    </main>
  );
}
