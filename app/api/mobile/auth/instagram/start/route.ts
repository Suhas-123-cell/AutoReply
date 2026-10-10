import { NextRequest, NextResponse } from "next/server";
import { getMissingInstagramOAuthEnv } from "@/lib/env";
import { getAuthorizationUrl } from "@/lib/meta/oauth";
import { startOAuthFlow } from "@/lib/meta/oauth-flow";
import { getInstagramRedirectUri } from "@/lib/instagram-oauth";
import { allowAuthAttemptByIp } from "@/lib/auth/otp-rate-limit";
import { getClientIp } from "@/lib/http/client-ip";

export const dynamic = "force-dynamic";

// "Sign in with Instagram" entry point — deliberately unauthenticated,
// unlike app/api/mobile/instagram/connect/route.ts (which links an account
// to an *existing* logged-in user's workspace). This is the account-creation
// path: no session exists yet, so identity comes entirely from the Instagram
// OAuth round trip itself (see lib/instagram-oauth.ts's signInWithInstagram).
export async function GET(request: NextRequest) {
  // No per-identifier key exists this early (identity only resolves after
  // the Meta round trip in the callback) — IP-only, generous limit since
  // this itself is cheap (no outbound call), just guarding against someone
  // scripting endless state-token generation.
  const allowed = await allowAuthAttemptByIp("ig-start", getClientIp(request.headers), 30, 3600);
  if (!allowed) {
    return NextResponse.json(
      { success: false, error: "Too many attempts. Try again later." },
      { status: 429 }
    );
  }

  const missingEnv = getMissingInstagramOAuthEnv();
  if (missingEnv.length > 0) {
    return NextResponse.json(
      { success: false, error: "Instagram sign-in is not configured yet" },
      { status: 503 }
    );
  }

  // The verifier stays in the app; the exchange route only signs in with a
  // result redeemed alongside it (see lib/meta/oauth-flow.ts).
  const { state, verifier } = await startOAuthFlow({ client: "mobile-signup" });

  return NextResponse.json({
    success: true,
    data: {
      authorizeUrl: getAuthorizationUrl(getInstagramRedirectUri(), state),
      verifier,
    },
  });
}
