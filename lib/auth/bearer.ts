/**
 * Resolves a mobile app's `Authorization: Bearer <sessionToken>` header to a
 * userId, by looking the token up in the same `Session` table Auth.js uses
 * for cookie-based web sessions (see lib/auth/mobile-session.ts, which is
 * what creates these rows).
 *
 * This is the ONLY new code path wired into the existing
 * `getCurrentUserId()` (lib/auth.ts). It is intentionally cheap to skip: a
 * web request has no Authorization header, so this returns null immediately
 * without touching the database, and lib/auth.ts falls through to the
 * original `auth()` cookie check exactly as before.
 */

import { headers } from "next/headers";
import { prisma } from "@/lib/db/client";

const BEARER_PREFIX = "Bearer ";
// Tokens are crypto.randomBytes(32).toString("base64url") -> 43 base64url
// chars. Reject anything outside a generous bound before it ever reaches a
// database query, as a cheap guard against sending garbage into the unique
// index lookup.
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{20,128}$/;

// A sliding-expiry session is bumped to a fresh 30-day window once it's
// within this many ms of expiring, so an active app doesn't get signed out
// mid-use. Not bumped on every request to avoid a write per API call.
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const REFRESH_THRESHOLD_MS = 3 * 24 * 60 * 60 * 1000;

export async function getBearerSessionUserId(): Promise<string | null> {
  if (process.env.MOBILE_API_ENABLED === "false") return null;

  let authHeader: string | null;
  try {
    authHeader = (await headers()).get("authorization");
  } catch {
    // Not in a request context (e.g. called from a script or a future
    // non-request code path) — behave as "no header", never throw.
    return null;
  }

  if (!authHeader || !authHeader.startsWith(BEARER_PREFIX)) return null;

  const token = authHeader.slice(BEARER_PREFIX.length).trim();
  if (!TOKEN_PATTERN.test(token)) return null;

  const session = await prisma.session.findUnique({
    where: { sessionToken: token },
    select: { id: true, userId: true, expires: true },
  });

  if (!session || session.expires.getTime() <= Date.now()) return null;

  const msUntilExpiry = session.expires.getTime() - Date.now();
  if (msUntilExpiry < REFRESH_THRESHOLD_MS) {
    const newExpiry = new Date(Date.now() + SESSION_TTL_MS);
    await Promise.all([
      prisma.session.update({
        where: { id: session.id },
        data: { expires: newExpiry },
      }),
      prisma.mobileSessionMeta.updateMany({
        where: { sessionId: session.id },
        data: { lastSeenAt: new Date() },
      }),
    ]);
  }

  return session.userId;
}
