import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import {
  canManageWorkspace,
  getCurrentWorkspaceContext,
} from "@/lib/workspace-access";

const setAccessSchema = z.object({
  memberId: z.string().min(1),
  unrestricted: z.boolean().default(false),
  instagramAccountIds: z.array(z.string().min(1)).max(200).default([]),
  telegramAccountIds: z.array(z.string().min(1)).max(200).default([]),
});

// Explicit unrestricted mode distinguishes every account from no accounts.
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

  if (member.role === "OWNER" || member.role === "ADMIN") {
    return NextResponse.json({ success: false, error: "Managers already have access to every account" }, { status: 400 });
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

  if (instagramAccounts.length !== new Set(parsed.data.instagramAccountIds).size ||
      telegramAccounts.length !== new Set(parsed.data.telegramAccountIds).size) {
    return NextResponse.json({ success: false, error: "Every selected account must belong to this workspace" }, { status: 400 });
  }
  await prisma.$transaction([
    prisma.workspaceMember.update({ where: { id: member.id }, data: { accountAccessRestricted: !parsed.data.unrestricted } }),
    prisma.memberAccountAccess.deleteMany({
      where: { workspaceMemberId: member.id },
    }),
    prisma.memberAccountAccess.createMany({
      data: parsed.data.unrestricted ? [] : [
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
