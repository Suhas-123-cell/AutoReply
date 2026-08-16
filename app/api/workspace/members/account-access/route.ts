import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import {
  canManageWorkspace,
  getCurrentWorkspaceContext,
} from "@/lib/workspace-access";

const setAccessSchema = z.object({
  memberId: z.string().min(1),
  instagramAccountIds: z.array(z.string().min(1)).max(200).default([]),
  telegramAccountIds: z.array(z.string().min(1)).max(200).default([]),
});

// Wholesale replace: delete this member's existing MemberAccountAccess rows
// and recreate from the two ID arrays. Simpler and less error-prone than a
// diff/patch API for a set that's edited via checkboxes, not incrementally —
// both arrays empty means "unrestricted" (same as never having scoped this
// member at all, see getAccountAccessScope's doc comment).
export async function PUT(request: NextRequest) {
  const context = await getCurrentWorkspaceContext();
  if (!context) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }
  if (!canManageWorkspace(context.role)) {
    return NextResponse.json(
      { success: false, error: "Only owners and admins can manage account access" },
      { status: 403 }
    );
  }

  const parsed = setAccessSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Invalid account access data" },
      { status: 400 }
    );
  }

  const member = await prisma.workspaceMember.findFirst({
    where: { id: parsed.data.memberId, workspaceId: context.workspaceId },
  });
  if (!member) {
    return NextResponse.json(
      { success: false, error: "Member not found" },
      { status: 404 }
    );
  }

  const [instagramAccounts, telegramAccounts] = await Promise.all([
    parsed.data.instagramAccountIds.length
      ? prisma.instagramAccount.findMany({
          where: {
            id: { in: parsed.data.instagramAccountIds },
            workspaceId: context.workspaceId,
          },
          select: { id: true },
        })
      : Promise.resolve([]),
    parsed.data.telegramAccountIds.length
      ? prisma.telegramAccount.findMany({
          where: {
            id: { in: parsed.data.telegramAccountIds },
            workspaceId: context.workspaceId,
          },
          select: { id: true },
        })
      : Promise.resolve([]),
  ]);

  await prisma.$transaction([
    prisma.memberAccountAccess.deleteMany({
      where: { workspaceMemberId: member.id },
    }),
    prisma.memberAccountAccess.createMany({
      data: [
        ...instagramAccounts.map((a) => ({
          workspaceMemberId: member.id,
          instagramAccountId: a.id,
        })),
        ...telegramAccounts.map((a) => ({
          workspaceMemberId: member.id,
          telegramAccountId: a.id,
        })),
      ],
    }),
  ]);

  const accountAccess = await prisma.memberAccountAccess.findMany({
    where: { workspaceMemberId: member.id },
    select: { instagramAccountId: true, telegramAccountId: true },
  });

  return NextResponse.json({ success: true, data: { memberId: member.id, accountAccess } });
}
