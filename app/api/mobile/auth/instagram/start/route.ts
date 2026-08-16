import { NextRequest, NextResponse } from "next/server";
import { getBaseUrl, getMissingInstagramOAuthEnv } from "@/lib/env";
import { createSignupOAuthState, getAuthorizationUrl } from "@/lib/meta/oauth";
import { allowAuthAttemptByIp } from "@/lib/auth/otp-rate-limit";

export const dynamic = "force-dynamic";

function getClientIp(request: NextRequest): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded ? forwarded.split(",")[0].trim() : null;
}

// "Sign in with Instagram" entry point — deliberately unauthenticated,
// unlike app/api/mobile/instagram/connect/route.ts (which links an account
// to an *existing* logged-in user's workspace). This is the account-creation
// path: no session exists yet, so identity comes entirely from the Instagram
// OAuth round trip itself, via app/api/instagram/callback/route.ts's
// "mobile-signup" branch.
export async function GET(request: NextRequest) {
  // No per-identifier key exists this early (identity only resolves after
  // the Meta round trip in the callback) — IP-only, generous limit since
  // this itself is cheap (no outbound call), just guarding against someone
  // scripting endless state-token generation.
  const allowed = await allowAuthAttemptByIp("ig-start", getClientIp(request), 30, 3600);
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

  const redirectUri = `${getBaseUrl()}/api/instagram/callback`;
  const state = createSignupOAuthState();

  return NextResponse.json({
    success: true,
    data: { authorizeUrl: getAuthorizationUrl(redirectUri, state) },
  });
}
