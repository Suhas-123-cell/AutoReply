/**
 * Server-side state for the Instagram OAuth round trip.
 *
 * A flow is created when a client starts connecting (or signing in with)
 * Instagram and consumed exactly once by the callback. Nothing the callback
 * trusts travels through the browser except an opaque flow id:
 *
 * - Web flows are bound to the browser that started them by an httpOnly
 *   cookie, so an authorize link handed to someone else fails.
 * - Mobile flows never connect anything in the callback. The callback stores
 *   the authorized result under a one-time code and deep-links it back to the
 *   app; only the app that started the flow holds the verifier needed to
 *   redeem it. A link forwarded to another device, or a crafted
 *   autoreply://ig-connect?result=… opened on a victim's phone, can't be
 *   redeemed.
 */

import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { getRedisConnection } from "@/lib/queue/client";
import { createOAuthState, type OAuthClient } from "@/lib/meta/oauth";

const FLOW_PREFIX = "ig-oauth:flow:";
const RESULT_PREFIX = "ig-oauth:result:";
const FLOW_TTL_SECONDS = 10 * 60;
const RESULT_TTL_SECONDS = 2 * 60;

export const WEB_FLOW_COOKIE = "ig_oauth_flow";
export const WEB_FLOW_COOKIE_MAX_AGE = FLOW_TTL_SECONDS;

export type OAuthFlow =
  | { client: "web"; userId: string; workspaceId: string }
  | { client: "mobile"; userId: string; workspaceId: string; verifierHash: string }
  | { client: "mobile-signup"; verifierHash: string };

export interface InstagramAuthorization {
  instagramId: string;
  username: string;
  name: string | null;
  encryptedToken: string;
  tokenExpiresAt: string;
}

export type PendingInstagramResult = Extract<
  OAuthFlow,
  { client: "mobile" | "mobile-signup" }
> &
  InstagramAuthorization;

export function toAuthorization(result: InstagramAuthorization): InstagramAuthorization {
  return {
    instagramId: result.instagramId,
    username: result.username,
    name: result.name,
    encryptedToken: result.encryptedToken,
    tokenExpiresAt: result.tokenExpiresAt,
  };
}

function hashVerifier(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

type StartInput =
  | { client: "web"; userId: string; workspaceId: string }
  | { client: "mobile"; userId: string; workspaceId: string }
  | { client: "mobile-signup" };

/**
 * Returns the signed state for the authorize URL, the flow id (the web cookie
 * value) and, for mobile, the verifier the app keeps and later presents.
 */
export async function startOAuthFlow(input: StartInput): Promise<{
  state: string;
  flowId: string;
  verifier: string | null;
}> {
  const flowId = randomBytes(24).toString("base64url");
  const verifier =
    input.client === "web" ? null : randomBytes(32).toString("base64url");
  const flow: OAuthFlow =
    input.client === "web"
      ? input
      : { ...input, verifierHash: hashVerifier(verifier as string) };

  await getRedisConnection().set(
    `${FLOW_PREFIX}${flowId}`,
    JSON.stringify(flow),
    "EX",
    FLOW_TTL_SECONDS
  );

  return { state: createOAuthState(flowId, input.client), flowId, verifier };
}

/** Single use: a second callback with the same state finds nothing. */
export async function consumeOAuthFlow(
  flowId: string,
  client: OAuthClient
): Promise<OAuthFlow | null> {
  const raw = await getRedisConnection().getdel(`${FLOW_PREFIX}${flowId}`);
  if (!raw) return null;
  try {
    const flow = JSON.parse(raw) as OAuthFlow;
    return flow.client === client ? flow : null;
  } catch {
    return null;
  }
}

export async function storeOAuthResult(
  result: PendingInstagramResult
): Promise<string> {
  const code = randomBytes(24).toString("base64url");
  await getRedisConnection().set(
    `${RESULT_PREFIX}${code}`,
    JSON.stringify(result),
    "EX",
    RESULT_TTL_SECONDS
  );
  return code;
}

/**
 * Redeems a mobile result exactly once, and only with the verifier issued to
 * the app that started the flow.
 */
export async function consumeOAuthResult(
  code: string,
  verifier: string,
  client: "mobile" | "mobile-signup"
): Promise<PendingInstagramResult | null> {
  const raw = await getRedisConnection().getdel(`${RESULT_PREFIX}${code}`);
  if (!raw) return null;

  let result: PendingInstagramResult;
  try {
    result = JSON.parse(raw) as PendingInstagramResult;
  } catch {
    return null;
  }
  if (result.client !== client) return null;

  const expected = Buffer.from(result.verifierHash);
  const actual = Buffer.from(hashVerifier(verifier));
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return null;
  }
  return result;
}
