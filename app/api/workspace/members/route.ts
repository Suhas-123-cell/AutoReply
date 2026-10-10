import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { logAuditEvent } from "@/lib/audit";
import {
  buildInvitationUrl,
  generateInvitationToken,
  getInvitationExpiry,
  normalizeInvitationEmail,
} from "@/lib/workspace-invitations";
import {
  canManageWorkspace,
  getCurrentWorkspaceContext,
} from "@/lib/workspace-access";

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["ADMIN", "EDITOR", "MEMBER"]).default("MEMBER"),
});

const updateMemberSchema = z.object({
  memberId: z.string().min(1),
  role: z.enum(["ADMIN", "EDITOR", "MEMBER"]),
});

const deleteSchema = z.object({
  memberId: z.string().min(1).optional(),
  invitationId: z.string().min(1).optional(),
});

async function getMemberPayload(
  workspaceId: string,
  currentUserRole?: "OWNER" | "ADMIN" | "EDITOR" | "MEMBER",
  includeInvitations = true
) {
  const [members, invitations] = await Promise.all([
    prisma.workspaceMember.findMany({
      where: { workspaceId },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        role: true,
        accountAccessRestricted: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
        accountAccess: {
          select: { instagramAccountId: true, telegramAccountId: true },
        },
      },
    }),
    includeInvitations ? prisma.workspaceInvitation.findMany({
      where: { workspaceId, status: "PENDING" },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        role: true,
        token: true,
        expiresAt: true,
        createdAt: true,
      },
    }) : Promise.resolve([]),
  ]);

  return {
    ...(currentUserRole ? { currentUserRole } : {}),
    members,
    invitations: invitations.map((invitation) => ({
      ...invitation,
      inviteUrl: buildInvitationUrl(invitation.token),
    })),
  };
}

export async function GET() {
  const context = await getCurrentWorkspaceContext();
  if (!context) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  return NextResponse.json({
    success: true,
    data: {
      ...(await getMemberPayload(
        context.workspaceId,
        context.role,
        canManageWorkspace(context.role)
      )),
    },
  });
}

export async function POST(request: NextRequest) {
  const context = await getCurrentWorkspaceContext();
  if (!context) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }
  if (!canManageWorkspace(context.role)) {
    return NextResponse.json(
      { success: false, error: "Only owners and admins can invite members" },
      { status: 403 }
    );
  }

  const parsed = inviteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Invalid invitation", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  // Admins can add editors and members; only the owner can create admins.
  if (parsed.data.role === "ADMIN" && context.role !== "OWNER") {
    return NextResponse.json(
      { success: false, error: "Only the workspace owner can invite admins" },
      { status: 403 }
    );
  }

  const email = normalizeInvitationEmail(parsed.data.email);
  await prisma.workspaceInvitation.upsert({
      where: {
        workspaceId_email: {
          workspaceId: context.workspaceId,
          email,
        },
      },
      create: {
        workspaceId: context.workspaceId,
        email,
        role: parsed.data.role,
        token: generateInvitationToken(),
        invitedByUserId: context.userId,
        expiresAt: getInvitationExpiry(),
      },
      update: {
        role: parsed.data.role,
        status: "PENDING",
        token: generateInvitationToken(),
        invitedByUserId: context.userId,
        expiresAt: getInvitationExpiry(),
      },
    });

  return NextResponse.json({
    success: true,
    data: await getMemberPayload(context.workspaceId, context.role),
  });
}

export async function PATCH(request: NextRequest) {
  const context = await getCurrentWorkspaceContext();
  if (!context) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }
  if (!canManageWorkspace(context.role)) {
    return NextResponse.json(
      { success: false, error: "Only owners and admins can update roles" },
      { status: 403 }
    );
  }

  const parsed = updateMemberSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Invalid member update" },
      { status: 400 }
    );
  }

  const member = await prisma.workspaceMember.findFirst({
    where: { id: parsed.data.memberId, workspaceId: context.workspaceId },
  });
  if (!member || member.role === "OWNER") {
    return NextResponse.json(
      { success: false, error: "Member cannot be updated" },
      { status: 400 }
    );
  }
  // Admins are peers: only the owner can promote to, or change, an admin.
  if (
    context.role !== "OWNER" &&
    (member.role === "ADMIN" || parsed.data.role === "ADMIN")
  ) {
    return NextResponse.json(
      { success: false, error: "Only the workspace owner can change admin roles" },
      { status: 403 }
    );
  }

  await prisma.workspaceMember.update({
    where: { id: member.id },
    // A demoted admin starts with no account access until a manager grants
    // specific accounts, rather than silently keeping all of them.
    data: {
      role: parsed.data.role,
      ...(member.role === "ADMIN" && parsed.data.role !== "ADMIN"
        ? { accountAccessRestricted: true }
        : {}),
    },
  });

  return NextResponse.json({
    success: true,
    data: await getMemberPayload(context.workspaceId, context.role),
  });
}

export async function DELETE(request: NextRequest) {
  const context = await getCurrentWorkspaceContext();
  if (!context) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }
  if (!canManageWorkspace(context.role)) {
    return NextResponse.json(
      { success: false, error: "Only owners and admins can remove members" },
      { status: 403 }
    );
  }

  const parsed = deleteSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success || (!parsed.data.memberId && !parsed.data.invitationId)) {
    return NextResponse.json(
      { success: false, error: "Missing member or invitation ID" },
      { status: 400 }
    );
  }

  if (parsed.data.memberId) {
    const member = await prisma.workspaceMember.findFirst({
      where: { id: parsed.data.memberId, workspaceId: context.workspaceId },
    });
    if (!member || member.role === "OWNER" || member.userId === context.userId) {
      return NextResponse.json(
        { success: false, error: "Member cannot be removed" },
        { status: 400 }
      );
    }
    if (member.role === "ADMIN" && context.role !== "OWNER") {
      return NextResponse.json(
        { success: false, error: "Only the workspace owner can remove admins" },
        { status: 403 }
      );
    }

    await prisma.workspaceMember.delete({ where: { id: member.id } });

    await logAuditEvent(context.workspaceId, "Workspace member removed", {
      memberId: member.id,
      removedUserId: member.userId,
      byUserId: context.userId,
    });
  }

  if (parsed.data.invitationId) {
    await prisma.workspaceInvitation.updateMany({
      where: {
        id: parsed.data.invitationId,
        workspaceId: context.workspaceId,
        status: "PENDING",
      },
      data: { status: "REVOKED" },
    });

    await logAuditEvent(context.workspaceId, "Workspace invitation revoked", {
      invitationId: parsed.data.invitationId,
      byUserId: context.userId,
    });
  }

  return NextResponse.json({
    success: true,
    data: await getMemberPayload(context.workspaceId, context.role),
  });
}
