import { NextRequest, NextResponse } from "next/server";
import { getWorkspaceInstagramAccount } from "@/lib/instagram-accounts";
import { getAllUserMedia, getUserMedia, MetaApiError } from "@/lib/meta/client";
import { decryptToken } from "@/lib/meta/oauth";
import {
  getAccountAccessScope,
  getCurrentWorkspaceContext,
} from "@/lib/workspace-access";

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
      {
        success: false,
        error: "Instagram account not connected. Please connect your account first.",
      },
      { status: 400 }
    );
  }

  try {
    const accessToken = decryptToken(account.accessToken);

    // `all=true` paginates the full library (for the campaign post picker);
    // otherwise return a single recent page.
    const loadAll = request.nextUrl.searchParams.get("all") === "true";
    let posts;
    if (loadAll) {
      posts = await getAllUserMedia(accessToken, 300);
    } else {
      const limitParam = request.nextUrl.searchParams.get("limit");
      const parsedLimit = limitParam ? Number.parseInt(limitParam, 10) : 25;
      const limit = Number.isFinite(parsedLimit)
        ? Math.min(Math.max(parsedLimit, 1), 50)
        : 25;
      posts = await getUserMedia(accessToken, limit);
    }

    return NextResponse.json({ success: true, data: posts });
  } catch (err) {
    console.error("[Instagram Posts] Error:", err);
    // Surface Meta's own message when it has one — "the token expired" and
    // "your app hit the rate limit" need different fixes from the user's
    // side, and a generic message hides which one this is.
    const message =
      err instanceof MetaApiError ? err.message : "Failed to fetch Instagram posts";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
