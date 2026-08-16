import { prisma } from "@/lib/db/client";

export async function canConnectInstagramAccount({
  workspaceId,
  instagramId,
}: {
  workspaceId: string;
  instagramId: string;
}) {
  const existingAccount = await prisma.instagramAccount.findUnique({
    where: { instagramId },
    select: { workspaceId: true },
  });

  if (existingAccount && existingAccount.workspaceId !== workspaceId) {
    return {
      allowed: false,
      reason: "already_connected" as const,
    };
  }

  return {
    allowed: true,
    reason: null,
  };
}

/**
 * @param allowedAccountIds Pass a scoped MEMBER's account-access set (from
 *   getAccountAccessScope) to keep this from resolving to an account outside
 *   it — an explicit out-of-scope ID or an unscoped "pick any" both come back
 *   null, same as "not connected", rather than leaking another client's data.
 */
export async function getWorkspaceInstagramAccount(
  workspaceId: string,
  instagramAccountId?: string | null,
  allowedAccountIds?: Set<string> | null
) {
  if (instagramAccountId && instagramAccountId !== "all") {
    if (allowedAccountIds && !allowedAccountIds.has(instagramAccountId)) {
      return null;
    }
    return prisma.instagramAccount.findFirst({
      where: { id: instagramAccountId, workspaceId },
    });
  }

  return prisma.instagramAccount.findFirst({
    where: {
      workspaceId,
      ...(allowedAccountIds ? { id: { in: [...allowedAccountIds] } } : {}),
    },
    orderBy: { connectedAt: "desc" },
  });
}

