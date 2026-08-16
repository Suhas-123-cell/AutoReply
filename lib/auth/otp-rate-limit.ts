/**
 * Rate limiting for the mobile OTP endpoints. Reuses the same Redis
 * connection as the DM queue (lib/queue/client.ts) rather than opening a
 * third ioredis client — lib/utils/rate-limiter.ts already opens a second
 * one, which is one more than this codebase needs.
 *
 * Fails CLOSED on Redis errors: a mobile sign-in briefly unavailable is a
 * much smaller problem than an unmetered email/brute-force channel, and the
 * web magic-link flow is unaffected either way.
 */

import { createHash } from "crypto";
import { getRedisConnection } from "@/lib/queue/client";

function hashKeyPart(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

async function checkAndIncrement(
  key: string,
  max: number,
  windowSeconds: number
): Promise<boolean> {
  try {
    const redis = getRedisConnection();
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, windowSeconds);
    }
    return count <= max;
  } catch {
    // Fail closed.
    return false;
  }
}

export async function allowCodeRequest(
  email: string,
  ip: string | null
): Promise<boolean> {
  const emailOk = await checkAndIncrement(
    `otp:req:e:${hashKeyPart(email)}`,
    5,
    3600
  );
  if (!emailOk) return false;

  if (ip) {
    const ipOk = await checkAndIncrement(`otp:req:ip:${hashKeyPart(ip)}`, 20, 3600);
    if (!ipOk) return false;
  }

  // Sanity ceiling protecting the shared Resend free-tier quota (also used
  // by web magic links).
  return checkAndIncrement("otp:req:global", 500, 3600);
}

export async function allowCodeVerifyAttempt(email: string): Promise<boolean> {
  return checkAndIncrement(`otp:verify:e:${hashKeyPart(email)}`, 10, 900);
}

// Generic per-IP limiter for auth endpoints that have no natural per-identifier
// key to rate limit on up front (Google/Instagram sign-in don't have a
// phone/email to throttle against before the expensive verification step
// runs). Unlike allowCodeRequest's IP check, this is the *only* limiter for
// these routes — so a missing IP fails closed, matching this file's stated
// fail-closed stance, instead of allowing unlimited requests.
export async function allowAuthAttemptByIp(
  scope: string,
  ip: string | null,
  max: number,
  windowSeconds: number
): Promise<boolean> {
  if (!ip) return false;
  return checkAndIncrement(`auth:${scope}:ip:${hashKeyPart(ip)}`, max, windowSeconds);
}
