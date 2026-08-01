import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { getBaseUrl } from "@/lib/env";
import { canConnectInstagramAccount } from "@/lib/instagram-accounts";
import { getLongLivedToken, getUserInfo, subscribeInstagramAccountToWebhooks } from "@/lib/meta/client";
import {
  encryptToken,
  exchangeCodeForToken,
  verifyOAuthState,
} from "@/lib/meta/oauth";
import { canManageWorkspace } from "@/lib/workspace-access";

// Every possible outcome of this route, and where the *web* app sends the
// user for it. Extracted so a unit test can assert these targets never
// silently change (see __tests__/oauth.test.ts).
type OutcomeStatus =
  | "denied"
  | "invalid"
  | "login"
  | "forbidden"
  | "already_connected"
  | "connected"
  | "failed";

export function webPathFor(status: OutcomeStatus, reason?: string): string {
  switch (status) {
    case "denied":
      return "/settings?instagram=denied";
    case "invalid":
      return "/settings?instagram=invalid";
    case "login":
      return "/login";
    case "forbidden":
      return "/settings?instagram=forbidden";
    case "already_connected":
      return "/settings?instagram=already_connected";
    case "connected":
      return "/dashboard?connected=true";
    case "failed":
      return `/settings?instagram=failed&reason=${encodeURIComponent(
        (reason ?? "").slice(0, 200)
      )}`;
  }
}

// The mobile app registers this custom scheme (see mobile/app.config.ts) and
// expo-web-browser's openAuthSessionAsync intercepts it, so Meta's redirect
// never actually loads in a visible browser tab on mobile.
function mobileDeepLinkFor(status: OutcomeStatus, reason?: string): string {
  const params = new URLSearchParams({ status });
  if (reason) params.set("reason", reason.slice(0, 200));
  return `openreply://ig-connect?${params.toString()}`;
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const error = request.nextUrl.searchParams.get("error");
  const state = verifyOAuthState(request.nextUrl.searchParams.get("state"));
  const baseUrl = getBaseUrl();
  const isMobile = state?.client === "mobile";

  const finish = (status: OutcomeStatus, reason?: string) =>
    NextResponse.redirect(
      isMobile
        ? mobileDeepLinkFor(status, reason)
        : `${baseUrl}${webPathFor(status, reason)}`
    );

  if (error) {
    return finish("denied");
  }

  if (!code || !state) {
    return finish("invalid");
  }

  // Web identifies the acting user from the session cookie. Mobile has no
  // cookie inside its in-app auth browser, so its identity travels in the
  // signed state instead (set by app/api/mobile/instagram/connect/route.ts).
  let actingUserId: string | null;
  if (isMobile) {
    actingUserId = state.userId ?? null;
  } else {
    const session = await auth();
    actingUserId = session?.user?.id ?? null;
  }

  if (!actingUserId) {
    return finish(isMobile ? "invalid" : "login");
  }

  const membership = await prisma.workspaceMember.findFirst({
    where: {
      workspaceId: state.workspaceId,
      userId: actingUserId,
    },
  });

  if (!membership || !canManageWorkspace(membership.role)) {
    return finish("forbidden");
  }

  try {
    const redirectUri = `${baseUrl}/api/instagram/callback`;
    const { accessToken: shortLivedToken } = await exchangeCodeForToken(
      code,
      redirectUri
    );
    const { accessToken: longLivedToken, expiresIn } =
      await getLongLivedToken(shortLivedToken);
    const userInfo = await getUserInfo(longLivedToken);
    // Webhooks and the messaging API key off the professional account ID
    // (user_id), not the app-scoped `id`. Store user_id so comment webhooks
    // can be matched back to this account. Fall back to id if user_id is
    // ever absent.
    const instagramId = userInfo.user_id ?? userInfo.id;
    const connection = await canConnectInstagramAccount({
      workspaceId: state.workspaceId,
      instagramId,
    });

    if (!connection.allowed) {
      return finish("already_connected");
    }

    const encryptedToken = encryptToken(longLivedToken);
    const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000);

    let webhookSubscribed = false;
    try {
      const subscription = await subscribeInstagramAccountToWebhooks(
        instagramId,
        longLivedToken
      );
      webhookSubscribed = Boolean(subscription.success);
    } catch (subscriptionError) {
      console.warn(
        "[Instagram Callback] Webhook subscription failed:",
        subscriptionError
      );
    }

    await prisma.instagramAccount.upsert({
      where: { instagramId },
      create: {
        workspaceId: state.workspaceId,
        instagramId,
        username: userInfo.username,
        name: userInfo.name,
        accessToken: encryptedToken,
        tokenExpiresAt,
        webhookSubscribed,
      },
      update: {
        workspaceId: state.workspaceId,
        username: userInfo.username,
        name: userInfo.name,
        accessToken: encryptedToken,
        tokenExpiresAt,
        webhookSubscribed,
      },
    });

    return finish("connected");
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[Instagram Callback] Error:", err);
    // The message is the only diagnostic a self-hoster gets for a failed
    // connect, so persist it alongside the other operational events rather
    // than leaving it in server logs they may not be able to reach.
    await prisma.operationalEvent
      .create({
        data: {
          source: "SYSTEM",
          level: "ERROR",
          workspaceId: state.workspaceId,
          message: "Instagram connection failed",
          payload: { reason: message },
        },
      })
      .catch(() => {});

    return finish("failed", message);
  }
}
