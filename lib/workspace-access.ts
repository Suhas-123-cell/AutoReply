import type { Workspace, WorkspaceRole } from "@/app/generated/prisma/client";
import { getCurrentUserId } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { headers } from "next/headers";
import { ensureWorkspaceForUser } from "@/lib/workspace";

export type WorkspaceContext = {
  userId: string;
  workspaceId: string;
  workspace: Workspace;
  role: WorkspaceRole;
};

const ROLE_ORDER: Record<WorkspaceRole, number> = {
  MEMBER: 1,
  EDITOR: 1,
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

export function canManageCampaigns(role: WorkspaceRole) {
  return role === "EDITOR" || canManageWorkspace(role);
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

// Managers see all accounts. Members and editors use explicit grants; an
// intentionally empty selection grants no access. Legacy unrestricted members
// retain access until a manager changes their selection.
export async function getAccountAccessScope(
  context: WorkspaceContext
): Promise<AccountAccessScope> {
  if (canManageWorkspace(context.role)) {
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
      accountAccessRestricted: true,
      accountAccess: {
        select: { instagramAccountId: true, telegramAccountId: true },
      },
    },
  });

  const rows = membership?.accountAccess ?? [];
  if (membership && !membership.accountAccessRestricted && rows.length === 0) {
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

  const requestedWorkspaceId = (await headers()).get("x-workspace-id");
  const membership = await prisma.workspaceMember.findFirst({
    where: { userId, ...(requestedWorkspaceId ? { workspaceId: requestedWorkspaceId } : {}) },
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

  if (requestedWorkspaceId) return null;

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

