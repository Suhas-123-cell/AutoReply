import { NextResponse } from "next/server";
import { canManageWorkspace, getCurrentWorkspaceContext } from "@/lib/workspace-access";
import { getBaseUrl, getMissingInstagramOAuthEnv } from "@/lib/env";
import { getAuthorizationUrl } from "@/lib/meta/oauth";
import {
  startOAuthFlow,
  WEB_FLOW_COOKIE,
  WEB_FLOW_COOKIE_MAX_AGE,
} from "@/lib/meta/oauth-flow";
import { getInstagramRedirectUri } from "@/lib/instagram-oauth";
import { legalPage } from "@/lib/legal/page";

export async function GET() {
  const context = await getCurrentWorkspaceContext();
  if (!context) {
    return legalPage("Sign in required", "<p>Open AutoReply on your phone to connect Instagram.</p>");
  }
  if (!canManageWorkspace(context.role)) {
    return legalPage("Access denied", "<p>You cannot connect Instagram for this workspace.</p>");
  }

  // getAuthorizationUrl and createOAuthState call requireEnv, which throws.
  // Without this check an incomplete .env surfaces as a 500 on a plain <a>
  // navigation, which reads to the user as the button doing nothing at all.
  const missingEnv = getMissingInstagramOAuthEnv();
  if (missingEnv.length > 0) {
    return legalPage("Instagram is unavailable", "<p>Connection is not configured on this server.</p>");
  }

  const { state, flowId } = await startOAuthFlow({
    client: "web",
    userId: context.userId,
    workspaceId: context.workspaceId,
  });
  const response = NextResponse.redirect(
    getAuthorizationUrl(getInstagramRedirectUri(), state)
  );
  // Binds the flow to this browser: the callback rejects a state that comes
  // back without the matching cookie (e.g. an authorize link sent to someone
  // else).
  response.cookies.set(WEB_FLOW_COOKIE, flowId, {
    httpOnly: true,
    secure: getBaseUrl().startsWith("https://"),
    sameSite: "lax",
    path: "/api/instagram/callback",
    maxAge: WEB_FLOW_COOKIE_MAX_AGE,
  });
  return response;
}
