import { NextRequest, NextResponse } from "next/server";
import { revokeMobileSession } from "@/lib/auth/mobile-session";

export const dynamic = "force-dynamic";

const BEARER_PREFIX = "Bearer ";

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith(BEARER_PREFIX)
    ? authHeader.slice(BEARER_PREFIX.length).trim()
    : null;

  // Idempotent even with no/invalid token — a client signing out with a
  // dead token must still get a clean success response.
  if (token) {
    await revokeMobileSession(token);
  }

  return NextResponse.json({ success: true });
}
