import { createHash, randomBytes } from "node:crypto";
import { getRedisConnection } from "@/lib/queue/client";

// The /r/:slug redirect is fully public and unauthenticated (it has to be —
// it's the link real Instagram users tap), so unlike every other endpoint
// in this app it can't be gated behind a session. A per-IP cap stops one
// abusive actor from flooding LinkClick inserts or DB load, without
// throttling the many different real users a genuinely popular link
// legitimately gets clicked by.
const CLICK_LIMIT_MAX = 30;
const CLICK_LIMIT_WINDOW_SECONDS = 60;

export async function allowLinkClick(ipHash: string | null): Promise<boolean> {
  if (!ipHash) return true; // No IP to key on — don't block, just don't rate-limit.
  try {
    const redis = getRedisConnection();
    const key = `rate:click:${ipHash}`;
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, CLICK_LIMIT_WINDOW_SECONDS);
    }
    return count <= CLICK_LIMIT_MAX;
  } catch {
    // Fail open: a Redis hiccup must never break a real user's click-through.
    return true;
  }
}

export function generateTrackedLinkSlug() {
  return randomBytes(7).toString("base64url");
}

export function hashClickIp(ipAddress: string | null | undefined) {
  if (!ipAddress) return null;

  const salt = process.env.NEXTAUTH_SECRET ?? "campaigncue-click-salt";
  return createHash("sha256").update(`${salt}:${ipAddress}`).digest("hex");
}

export function getRequestIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() ?? null;
  }

  return (
    request.headers.get("x-real-ip") ??
    request.headers.get("cf-connecting-ip") ??
    null
  );
}
