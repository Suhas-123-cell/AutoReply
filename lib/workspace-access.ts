import type { Workspace, WorkspaceRole } from "@/app/generated/prisma/client";
import { getCurrentUserId } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { ensureWorkspaceForUser } from "@/lib/workspace";

export type WorkspaceContext = {
  userId: string;
  workspaceId: string;
  workspace: Workspace;
  role: WorkspaceRole;
};

const ROLE_ORDER: Record<WorkspaceRole, number> = {
  MEMBER: 1,
  ADMIN: 2,
  OWNER: 3,
};

export function hasWorkspaceRole(
  role: WorkspaceRole,
  minimumRole: WorkspaceRole
) {
  return ROLE_ORDER[role] >= ROLE_ORDER[minimumRole];
}

export function canManageWorkspace(role: WorkspaceRole) {
  return hasWorkspaceRole(role, "ADMIN");
}

export function canManageBilling(role: WorkspaceRole) {
  return role === "OWNER";
}

export type AccountAccessScope = {
  // null = unrestricted (sees every account in the workspace). A non-null
  // Set means "only these IDs" — including an empty Set, which happens if
  // an owner scopes a member to zero accounts (locks them out entirely,
  // a valid state, not the same as "never scoped").
  instagramAccountIds: Set<string> | null;
  telegramAccountIds: Set<string> | null;
};

/**
 * Owners and admins always see every client account — scoping only ever
 * restricts a MEMBER, never grants extra reach to a manager role. A MEMBER
 * with zero MemberAccountAccess rows is unrestricted too (the default for
 * every member until an owner/admin explicitly assigns accounts), so this
 * feature is opt-in and doesn't change behavior for existing workspaces.
 */
export async function getAccountAccessScope(
  context: WorkspaceContext
): Promise<AccountAccessScope> {
  if (context.role !== "MEMBER") {
    return { instagramAccountIds: null, telegramAccountIds: null };
  }

  const membership = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId: context.workspaceId,
        userId: context.userId,
      },
    },
    select: {
      accountAccess: {
        select: { instagramAccountId: true, telegramAccountId: true },
      },
    },
  });

  const rows = membership?.accountAccess ?? [];
  if (rows.length === 0) {
    return { instagramAccountIds: null, telegramAccountIds: null };
  }

  return {
    instagramAccountIds: new Set(
      rows.flatMap((r) => (r.instagramAccountId ? [r.instagramAccountId] : []))
    ),
    telegramAccountIds: new Set(
      rows.flatMap((r) => (r.telegramAccountId ? [r.telegramAccountId] : []))
    ),
  };
}

export async function getCurrentWorkspaceContext(): Promise<WorkspaceContext | null> {
  const userId = await getCurrentUserId();
  if (!userId) return null;

  const membership = await prisma.workspaceMember.findFirst({
    where: { userId },
    include: { workspace: true },
    orderBy: { createdAt: "asc" },
  });

  if (membership) {
    return {
      userId,
      workspaceId: membership.workspaceId,
      workspace: membership.workspace,
      role: membership.role,
    };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });
  const workspace = await ensureWorkspaceForUser(userId, user?.email);
  const createdMembership = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId: workspace.id,
        userId,
      },
    },
  });

  return {
    userId,
    workspaceId: workspace.id,
    workspace,
    role: createdMembership?.role ?? "OWNER",
  };
}

