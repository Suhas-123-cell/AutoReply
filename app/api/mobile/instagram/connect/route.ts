import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth";
import { canManageWorkspace, getCurrentWorkspaceContext } from "@/lib/workspace-access";
import { getBaseUrl, getMissingInstagramOAuthEnv } from "@/lib/env";
import { createOAuthState, getAuthorizationUrl } from "@/lib/meta/oauth";

export const dynamic = "force-dynamic";

// Mobile counterpart to app/api/instagram/connect/route.ts. That route 302s
// straight to Meta because a web <a> tag can follow a redirect; a mobile
// client instead opens the URL itself in an in-app browser session
// (expo-web-browser's openAuthSessionAsync), so this returns JSON instead of
// redirecting. The signed state additionally carries the userId, since
// there is no session cookie inside that in-app browser for the callback to
// read — see app/api/instagram/callback/route.ts's `isMobile` branch.
export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const context = await getCurrentWorkspaceContext();
  if (!context) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  if (!canManageWorkspace(context.role)) {
    return NextResponse.json(
      { success: false, error: "Only owners and admins can connect Instagram" },
      { status: 403 }
    );
  }

  const missingEnv = getMissingInstagramOAuthEnv();
  if (missingEnv.length > 0) {
    return NextResponse.json(
      { success: false, error: "Instagram connection is not configured yet" },
      { status: 503 }
    );
  }

  // Same redirect URI as the web flow — the Meta app's allowlist needs no
  // change for mobile.
  const redirectUri = `${getBaseUrl()}/api/instagram/callback`;
  const state = createOAuthState(context.workspaceId, { userId });

  return NextResponse.json({
    success: true,
    data: { authorizeUrl: getAuthorizationUrl(redirectUri, state) },
  });
}
