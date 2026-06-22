import { NextResponse } from "next/server";

// Single-user mode: no auth, no middleware needed.
// (Leaving this file as a stub in case auth comes back later.)
export function middleware() {
  return NextResponse.next();
}

export const config = {
  matcher: [],
};
