import { NextResponse } from "next/server";
import { canManageWorkspace, getCurrentWorkspaceContext } from "@/lib/workspace-access";
import { getBaseUrl, getMissingInstagramOAuthEnv } from "@/lib/env";
import { createOAuthState, getAuthorizationUrl } from "@/lib/meta/oauth";
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

  const redirectUri = `${getBaseUrl()}/api/instagram/callback`;
  const state = createOAuthState(context.workspaceId);

  return NextResponse.redirect(getAuthorizationUrl(redirectUri, state));
}
