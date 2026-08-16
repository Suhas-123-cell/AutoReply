import { NextRequest, NextResponse } from "next/server";
import { getWorkspaceInstagramAccount } from "@/lib/instagram-accounts";
import { getUserInfo, MetaApiError } from "@/lib/meta/client";
import { decryptToken } from "@/lib/meta/oauth";
import {
  getAccountAccessScope,
  getCurrentWorkspaceContext,
} from "@/lib/workspace-access";

export const dynamic = "force-dynamic";

// Live profile lookup (username + avatar) for the campaign preview.
export async function GET(request: NextRequest) {
  const context = await getCurrentWorkspaceContext();
  if (!context) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }
  const { instagramAccountIds } = await getAccountAccessScope(context);

  const account = await getWorkspaceInstagramAccount(
    context.workspaceId,
    request.nextUrl.searchParams.get("instagramAccountId"),
    instagramAccountIds
  );
  if (!account) {
    return NextResponse.json(
      { success: false, error: "Instagram account not connected" },
      { status: 400 }
    );
  }

  try {
    const token = decryptToken(account.accessToken);
    const info = await getUserInfo(token);
    return NextResponse.json(
      {
        success: true,
        data: {
          username: info.username,
          name: info.name ?? null,
          profilePictureUrl: info.profile_picture_url ?? null,
        },
      },
      { headers: { "Cache-Control": "private, max-age=300" } }
    );
  } catch (err) {
    console.error("[Instagram Profile] Error:", err);
    const message =
      err instanceof MetaApiError ? err.message : "Failed to load profile";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
