/**
 * Shared between app/api/instagram/callback/route.ts (writer) and
 * app/api/mobile/auth/instagram/exchange/route.ts (reader) — a short-lived,
 * single-use code that stands in for a userId across the redirect boundary
 * of the "sign in with Instagram" flow. See the exchange route's docstring
 * for why this exists instead of putting a session token in the deep link.
 */

import { randomBytes } from "crypto";
import { getRedisConnection } from "@/lib/queue/client";

export const IG_SIGNUP_EXCHANGE_PREFIX = "ig-signup-exchange:";
const EXCHANGE_CODE_TTL_SECONDS = 60;

export async function issueInstagramSignupExchangeCode(
  userId: string
): Promise<string> {
  const code = randomBytes(24).toString("base64url");
  await getRedisConnection().set(
    `${IG_SIGNUP_EXCHANGE_PREFIX}${code}`,
    userId,
    "EX",
    EXCHANGE_CODE_TTL_SECONDS
  );
  return code;
}
