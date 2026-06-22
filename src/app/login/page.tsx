"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || window.location.origin}/api/auth/callback`,
      },
    });
    setLoading(false);
    if (error) {
      setError(error.message);
    } else {
      setSent(true);
    }
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="mb-10 text-center">
          <div className="text-2xl font-light tracking-wide text-white/90">silas</div>
          <div className="text-xs uppercase tracking-[0.2em] text-white/40 mt-1">enter</div>
        </div>

        {sent ? (
          <div className="text-center text-white/70 leading-relaxed">
            check your email for a magic link.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <input
              type="email"
              required
              placeholder="your@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/30 focus:outline-none focus:border-white/30 transition"
              autoComplete="email"
              autoFocus
            />
            <button
              type="submit"
              disabled={loading || !email}
              className="w-full px-4 py-3 bg-white/10 hover:bg-white/15 disabled:opacity-40 border border-white/15 rounded-lg text-white/90 transition"
            >
              {loading ? "sending..." : "send magic link"}
            </button>
            {error && <div className="text-sm text-red-400/80 mt-2">{error}</div>}
          </form>
        )}
      </div>
    </div>
  );
}
