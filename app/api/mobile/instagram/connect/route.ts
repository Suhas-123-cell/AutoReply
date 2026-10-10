import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth";
import { canManageWorkspace, getCurrentWorkspaceContext } from "@/lib/workspace-access";
import { getMissingInstagramOAuthEnv } from "@/lib/env";
import { getAuthorizationUrl } from "@/lib/meta/oauth";
import { startOAuthFlow } from "@/lib/meta/oauth-flow";
import { getInstagramRedirectUri } from "@/lib/instagram-oauth";

export const dynamic = "force-dynamic";

// Mobile counterpart to app/api/instagram/connect/route.ts. Returns the
// authorize URL for the app to open in an in-app browser, plus a verifier the
// app keeps. The callback only stores the authorized result; the app then
// redeems it at /api/mobile/instagram/complete with this verifier, so an
// authorize link forwarded to someone else can never connect their account.
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

  const { state, verifier } = await startOAuthFlow({
    client: "mobile",
    userId,
    workspaceId: context.workspaceId,
  });

  return NextResponse.json({
    success: true,
    data: {
      authorizeUrl: getAuthorizationUrl(getInstagramRedirectUri(), state),
      verifier,
    },
  });
}
