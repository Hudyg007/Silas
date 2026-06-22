import { ChatInterface } from "@/components/ChatInterface";

// Single-user mode: no auth. You're the only user. Just walk in.
export default function HomePage() {
  return (
    <main className="min-h-screen w-full">
      <ChatInterface />
    </main>
  );
}
