import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import {
  canManageWorkspace,
  getAccountAccessScope,
  getCurrentWorkspaceContext,
} from "@/lib/workspace-access";

// List a client bot's keyword-reply automations, or every automation across
// the workspace's bots when telegramAccountId is omitted (the "all clients,
// one view" console read).
export async function GET(request: NextRequest) {
  const context = await getCurrentWorkspaceContext();
  if (!context) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const { telegramAccountIds: allowedAccountIds } =
    await getAccountAccessScope(context);

  const telegramAccountId = request.nextUrl.searchParams.get(
    "telegramAccountId"
  );

  const automations = await prisma.telegramAutomation.findMany({
    where: {
      workspaceId: context.workspaceId,
      ...(telegramAccountId
        ? { telegramAccountId }
        : allowedAccountIds
          ? { telegramAccountId: { in: [...allowedAccountIds] } }
          : {}),
    },
    include: { telegramAccount: { select: { botUsername: true } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ success: true, data: automations });
}

const createSchema = z.object({
  telegramAccountId: z.string().min(1),
  name: z.string().min(1).max(100),
  keywords: z.array(z.string().min(1).max(50)).min(1).max(10),
  wholeWordMatch: z.boolean().optional().default(true),
  replyMessage: z.string().min(1).max(4096),
  isActive: z.boolean().optional().default(true),
});

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
      { success: false, error: "Only owners and admins can create automations" },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Invalid automation data" },
      { status: 400 }
    );
  }

  const account = await prisma.telegramAccount.findFirst({
    where: {
      id: parsed.data.telegramAccountId,
      workspaceId: context.workspaceId,
    },
  });
  if (!account) {
    return NextResponse.json(
      { success: false, error: "Telegram bot not found" },
      { status: 400 }
    );
  }

  const automation = await prisma.telegramAutomation.create({
    data: {
      workspaceId: context.workspaceId,
      telegramAccountId: account.id,
      name: parsed.data.name,
      keywords: parsed.data.keywords,
      wholeWordMatch: parsed.data.wholeWordMatch,
      replyMessage: parsed.data.replyMessage,
      isActive: parsed.data.isActive,
    },
  });

  return NextResponse.json({ success: true, data: automation });
}

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  keywords: z.array(z.string().min(1).max(50)).min(1).max(10).optional(),
  wholeWordMatch: z.boolean().optional(),
  replyMessage: z.string().min(1).max(4096).optional(),
  isActive: z.boolean().optional(),
});

// Mirrors /api/automations's PATCH shape: id as a query param, partial body.
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
      { success: false, error: "Only owners and admins can update automations" },
      { status: 403 }
    );
  }

  const automationId = request.nextUrl.searchParams.get("id");
  if (!automationId) {
    return NextResponse.json(
      { success: false, error: "Missing automation ID" },
      { status: 400 }
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Invalid automation data" },
      { status: 400 }
    );
  }

  const existing = await prisma.telegramAutomation.findFirst({
    where: { id: automationId, workspaceId: context.workspaceId },
  });
  if (!existing) {
    return NextResponse.json(
      { success: false, error: "Automation not found" },
      { status: 404 }
    );
  }

  const updated = await prisma.telegramAutomation.update({
    where: { id: automationId },
    data: parsed.data,
  });

  return NextResponse.json({ success: true, data: updated });
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
      { success: false, error: "Only owners and admins can delete automations" },
      { status: 403 }
    );
  }

  const automationId = request.nextUrl.searchParams.get("id");
  if (!automationId) {
    return NextResponse.json(
      { success: false, error: "Missing automation ID" },
      { status: 400 }
    );
  }

  const existing = await prisma.telegramAutomation.findFirst({
    where: { id: automationId, workspaceId: context.workspaceId },
  });
  if (!existing) {
    return NextResponse.json(
      { success: false, error: "Automation not found" },
      { status: 404 }
    );
  }

  await prisma.telegramAutomation.delete({ where: { id: automationId } });

  return NextResponse.json({ success: true });
}
