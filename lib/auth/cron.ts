/**
 * Shared auth check for the Vercel Cron routes (app/api/cron/*). Vercel Cron
 * sends `Authorization: Bearer $CRON_SECRET` automatically when CRON_SECRET
 * is set on the project — see vercel.json's `crons` entries.
 *
 * Deliberately does NOT fall back to NEXTAUTH_SECRET when CRON_SECRET is
 * unset: that fallback used to let one secret double as both the session
 * signing key and the cron bearer token, collapsing two separate trust
 * boundaries. CRON_SECRET must be set explicitly (already documented as
 * required in .env.example).
 */
import { timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";

export function isAuthorizedCronRequest(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;

  const authHeader = request.headers.get("authorization");
  if (!authHeader) return false;

  const expected = Buffer.from(`Bearer ${cronSecret}`);
  const actual = Buffer.from(authHeader);

  return (
    expected.length === actual.length && timingSafeEqual(expected, actual)
  );
}
