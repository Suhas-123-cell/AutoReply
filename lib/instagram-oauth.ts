/**
 * What happens after Meta authorizes an Instagram account: connecting it to a
 * workspace, or signing in with it. Shared by the web callback and the mobile
 * completion routes (see lib/meta/oauth-flow.ts for how each is reached).
 */

import { prisma } from "@/lib/db/client";
import { getBaseUrl } from "@/lib/env";
import { decryptToken, encryptToken, exchangeCodeForToken } from "@/lib/meta/oauth";
import {
  getLongLivedToken,
  getUserInfo,
  subscribeInstagramAccountToWebhooks,
} from "@/lib/meta/client";
import { canConnectInstagramAccount } from "@/lib/instagram-accounts";
import { canConnectAnotherAccount } from "@/lib/billing/usage";
import { canManageWorkspace } from "@/lib/workspace-access";
import { hasVerifiedPhone } from "@/lib/auth/phone-verification";
import { ensureWorkspaceForUser } from "@/lib/workspace";
import type { InstagramAuthorization } from "@/lib/meta/oauth-flow";

export type ConnectStatus = "forbidden" | "already_connected" | "connected" | "failed";

export function getInstagramRedirectUri(): string {
  return `${getBaseUrl()}/api/instagram/callback`;
}

/** Trades the callback's code for a long-lived token and the account identity. */
export async function authorizeInstagram(code: string): Promise<InstagramAuthorization> {
  const { accessToken: shortLivedToken } = await exchangeCodeForToken(
    code,
    getInstagramRedirectUri()
  );
  const { accessToken, expiresIn } = await getLongLivedToken(shortLivedToken);
  const userInfo = await getUserInfo(accessToken);
  return {
    // Webhooks and the messaging API key off the professional account ID
    // (user_id), not the app-scoped `id`.
    instagramId: userInfo.user_id ?? userInfo.id,
    username: userInfo.username,
    name: userInfo.name ?? null,
    encryptedToken: encryptToken(accessToken),
    tokenExpiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
  };
}

async function subscribeToWebhooks(authorization: InstagramAuthorization) {
  try {
    const subscription = await subscribeInstagramAccountToWebhooks(
      authorization.instagramId,
      decryptToken(authorization.encryptedToken)
    );
    return Boolean(subscription.success);
  } catch (error) {
    console.warn("[Instagram] Webhook subscription failed:", error);
    return false;
  }
}

function accountData(authorization: InstagramAuthorization, webhookSubscribed: boolean) {
  return {
    username: authorization.username,
    name: authorization.name,
    accessToken: authorization.encryptedToken,
    tokenExpiresAt: new Date(authorization.tokenExpiresAt),
    webhookSubscribed,
  };
}

export async function connectAuthorizedInstagramAccount(input: {
  actingUserId: string;
  workspaceId: string;
  authorization: InstagramAuthorization;
}): Promise<{ status: ConnectStatus; reason?: string }> {
  const { actingUserId, workspaceId, authorization } = input;

  const actingUser = await prisma.user.findUnique({
    where: { id: actingUserId },
    select: { phone: true, phoneVerified: true },
  });
  if (!hasVerifiedPhone(actingUser)) {
    return { status: "forbidden", reason: "Verify your phone before connecting Instagram." };
  }

  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: actingUserId } },
    select: { role: true },
  });
  if (!membership || !canManageWorkspace(membership.role)) {
    return { status: "forbidden" };
  }

  const connection = await canConnectInstagramAccount({
    workspaceId,
    instagramId: authorization.instagramId,
  });
  if (!connection.allowed) return { status: "already_connected" };

  // Only a brand-new account consumes a connected-account slot; re-auth of a
  // connected account must never count against the plan limit twice.
  const isNewConnection = !(await prisma.instagramAccount.findUnique({
    where: { instagramId: authorization.instagramId },
    select: { id: true },
  }));
  if (isNewConnection) {
    const accountLimit = await canConnectAnotherAccount(workspaceId);
    if (!accountLimit.allowed) {
      return {
        status: "failed",
        reason:
          "Your plan's connected-account limit has been reached. Upgrade to connect more accounts.",
      };
    }
  }

  const webhookSubscribed = await subscribeToWebhooks(authorization);
  await prisma.instagramAccount.upsert({
    where: { instagramId: authorization.instagramId },
    create: {
      workspaceId,
      instagramId: authorization.instagramId,
      ...accountData(authorization, webhookSubscribed),
    },
    update: { workspaceId, ...accountData(authorization, webhookSubscribed) },
  });

  return { status: "connected" };
}

function isUniqueViolation(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === "P2002"
  );
}

const ALREADY_CONNECTED_ERROR =
  "This Instagram account is already connected to an AutoReply workspace. Sign in with the account that connected it.";

/**
 * "Sign in with Instagram" resolves only to the user whose own identity is
 * this Instagram account. An account that someone else connected (e.g. an
 * agency managing a client) never signs that person in as the workspace
 * owner — that would hand over every other client in the workspace.
 */
export async function signInWithInstagram(
  authorization: InstagramAuthorization
): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const { instagramId } = authorization;
  const [linked, existingAccount] = await Promise.all([
    prisma.account.findUnique({
      where: {
        provider_providerAccountId: { provider: "instagram", providerAccountId: instagramId },
      },
      select: { userId: true },
    }),
    prisma.instagramAccount.findUnique({
      where: { instagramId },
      select: { id: true, workspaceId: true },
    }),
  ]);

  if (linked) {
    if (existingAccount) {
      // Refresh the stored token only where this user is actually a member.
      const member = await prisma.workspaceMember.findUnique({
        where: {
          workspaceId_userId: { workspaceId: existingAccount.workspaceId, userId: linked.userId },
        },
        select: { id: true },
      });
      if (member) {
        await prisma.instagramAccount.update({
          where: { id: existingAccount.id },
          data: {
            accessToken: authorization.encryptedToken,
            tokenExpiresAt: new Date(authorization.tokenExpiresAt),
          },
        });
      }
    } else {
      const workspace = await ensureWorkspaceForUser(linked.userId, null);
      const limit = await canConnectAnotherAccount(workspace.id);
      if (limit.allowed) {
        const webhookSubscribed = await subscribeToWebhooks(authorization);
        await prisma.instagramAccount
          .create({
            data: {
              workspaceId: workspace.id,
              instagramId,
              ...accountData(authorization, webhookSubscribed),
            },
          })
          .catch((error) => {
            if (!isUniqueViolation(error)) throw error;
          });
      }
    }
    return { ok: true, userId: linked.userId };
  }

  if (existingAccount) return { ok: false, error: ALREADY_CONNECTED_ERROR };

  // First-time sign-up. Instagram's Business Login never returns an email, so
  // the new user has none; the phone-verification step that follows is what
  // ties the account to a person.
  const webhookSubscribed = await subscribeToWebhooks(authorization);
  try {
    const userId = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { name: authorization.name ?? authorization.username },
      });
      await tx.account.create({
        data: {
          userId: user.id,
          type: "oauth",
          provider: "instagram",
          providerAccountId: instagramId,
        },
      });
      const workspace = await tx.workspace.create({
        data: {
          name: "My workspace",
          ownerId: user.id,
          members: { create: { userId: user.id, role: "OWNER" } },
        },
      });
      await tx.instagramAccount.create({
        data: {
          workspaceId: workspace.id,
          instagramId,
          ...accountData(authorization, webhookSubscribed),
        },
      });
      return user.id;
    });
    return { ok: true, userId };
  } catch (error) {
    // A concurrent sign-in for the same Instagram account won the race.
    if (isUniqueViolation(error)) return { ok: false, error: ALREADY_CONNECTED_ERROR };
    throw error;
  }
}
