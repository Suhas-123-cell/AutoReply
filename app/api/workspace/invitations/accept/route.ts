import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { normalizeInvitationEmail } from "@/lib/workspace-invitations";

export async function POST(request: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json(
      { success: false, error: "Sign in with the invited email first" },
      { status: 401 }
    );
  }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });
  if (!user?.email) {
    return NextResponse.json(
      { success: false, error: "Sign in with the invited email first" },
      { status: 401 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const token = typeof body.token === "string" ? body.token : null;
  if (!token) {
    return NextResponse.json(
      { success: false, error: "Missing invitation token" },
      { status: 400 }
    );
  }

  const invitation = await prisma.workspaceInvitation.findUnique({
    where: { token },
    include: { workspace: { select: { name: true } } },
  });
  if (!invitation || invitation.status !== "PENDING") {
    return NextResponse.json(
      { success: false, error: "Invitation is no longer available" },
      { status: 404 }
    );
  }

  if (invitation.expiresAt <= new Date()) {
    await prisma.workspaceInvitation.update({
      where: { id: invitation.id },
      data: { status: "EXPIRED" },
    });
    return NextResponse.json(
      { success: false, error: "Invitation has expired" },
      { status: 410 }
    );
  }

  if (normalizeInvitationEmail(user.email) !== invitation.email) {
    return NextResponse.json(
      { success: false, error: "This invitation is for a different email" },
      { status: 403 }
    );
  }

  await prisma.$transaction([
    prisma.workspaceMember.upsert({
      where: {
        workspaceId_userId: {
          workspaceId: invitation.workspaceId,
          userId,
        },
      },
      create: {
        workspaceId: invitation.workspaceId,
        userId,
        role: invitation.role,
      },
      update: { role: invitation.role },
    }),
    prisma.workspaceInvitation.update({
      where: { id: invitation.id },
      data: { status: "ACCEPTED", acceptedAt: new Date() },
    }),
  ]);

  return NextResponse.json({
    success: true,
    data: {
      workspaceName: invitation.workspace.name,
    },
  });
}

