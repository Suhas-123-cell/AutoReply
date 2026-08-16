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
import { issueInstagramSignupExchangeCode } from "@/lib/auth/instagram-signup-exchange";
import { ensureWorkspaceForUser } from "@/lib/workspace";

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

// The mobile app registers this custom scheme (see mobile/android/.../AndroidManifest.xml
// and mobile/ios/.../Info.plist) and react-native-inappbrowser-reborn's
// openAuth intercepts it, so Meta's redirect never actually loads in a
// visible browser tab on mobile. `code` is only ever present for the
// mobile-signup flow — see issueInstagramSignupExchangeCode's docstring for
// why a real session token never travels through this URL.
function mobileDeepLinkFor(
  status: OutcomeStatus,
  opts?: { reason?: string; code?: string }
): string {
  const params = new URLSearchParams({ status });
  if (opts?.reason) params.set("reason", opts.reason.slice(0, 200));
  if (opts?.code) params.set("code", opts.code);
  return `autoreply://ig-connect?${params.toString()}`;
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const error = request.nextUrl.searchParams.get("error");
  const state = verifyOAuthState(request.nextUrl.searchParams.get("state"));
  const baseUrl = getBaseUrl();
  const isMobile = state?.client === "mobile" || state?.client === "mobile-signup";
  const isSignup = state?.client === "mobile-signup";

  const finish = (
    status: OutcomeStatus,
    opts?: { reason?: string; exchangeCode?: string }
  ) =>
    NextResponse.redirect(
      isMobile
        ? mobileDeepLinkFor(status, { reason: opts?.reason, code: opts?.exchangeCode })
        : `${baseUrl}${webPathFor(status, opts?.reason)}`
    );

  if (error) {
    return finish("denied");
  }

  if (!code || !state) {
    return finish("invalid");
  }

  // "Sign in with Instagram" has no existing user/workspace to authorize
  // against — identity comes entirely from the OAuth round trip below, so it
  // skips straight past the acting-user/membership checks that every other
  // flow needs.
  if (isSignup) {
    try {
      const redirectUri = `${baseUrl}/api/instagram/callback`;
      const { accessToken: shortLivedToken } = await exchangeCodeForToken(
        code,
        redirectUri
      );
      const { accessToken: longLivedToken, expiresIn } =
        await getLongLivedToken(shortLivedToken);
      const userInfo = await getUserInfo(longLivedToken);
      const instagramId = userInfo.user_id ?? userInfo.id;
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

      const existingAccount = await prisma.instagramAccount.findUnique({
        where: { instagramId },
        include: { workspace: true },
      });

      let signedInUserId: string;

      if (existingAccount) {
        // This Instagram identity is already connected somewhere — sign the
        // workspace owner back in rather than creating a duplicate account.
        signedInUserId = existingAccount.workspace.ownerId;
        await prisma.instagramAccount.update({
          where: { instagramId },
          data: { accessToken: encryptedToken, tokenExpiresAt, webhookSubscribed },
        });
      } else {
        // True first-time sign-up: Instagram's Business Login API never
        // returns an email, so the new user has none — matches User.email's
        // existing nullable design (see provisionUserByPhone for the same
        // pattern with phone-only accounts).
        const user = await prisma.user.create({
          data: { name: userInfo.name ?? userInfo.username },
        });
        const workspace = await ensureWorkspaceForUser(user.id, null);
        await prisma.instagramAccount.create({
          data: {
            workspaceId: workspace.id,
            instagramId,
            username: userInfo.username,
            name: userInfo.name,
            accessToken: encryptedToken,
            tokenExpiresAt,
            webhookSubscribed,
          },
        });
        signedInUserId = user.id;
      }

      const exchangeCode = await issueInstagramSignupExchangeCode(signedInUserId);
      return finish("connected", { exchangeCode });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("[Instagram Callback] Signup error:", err);
      return finish("failed", { reason: message });
    }
  }

  // Every non-signup flow's state carries a workspaceId (enforced by
  // verifyOAuthState) — this just narrows the type for TypeScript, since
  // OAuthStatePayload.workspaceId is optional to accommodate mobile-signup.
  if (!state.workspaceId) {
    return finish("invalid");
  }
  const workspaceId = state.workspaceId;

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
      workspaceId: workspaceId,
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
      workspaceId: workspaceId,
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
        workspaceId: workspaceId,
        instagramId,
        username: userInfo.username,
        name: userInfo.name,
        accessToken: encryptedToken,
        tokenExpiresAt,
        webhookSubscribed,
      },
      update: {
        workspaceId: workspaceId,
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
          workspaceId: workspaceId,
          message: "Instagram connection failed",
          payload: { reason: message },
        },
      })
      .catch(() => {});

    return finish("failed", { reason: message });
  }
}
