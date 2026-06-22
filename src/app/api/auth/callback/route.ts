import { NextRequest, NextResponse } from "next/server";
import { createServer } from "@/lib/supabase/server";

/**
 * GET /api/auth/callback?code=xxx
 * Supabase redirects here after the user clicks the magic link in email.
 * We exchange the code for a session cookie, then redirect to /.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createServer();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${url.origin}${next}`);
    }
    console.error("Auth callback error:", error);
  }

  return NextResponse.redirect(`${url.origin}/login?error=auth_failed`);
}
