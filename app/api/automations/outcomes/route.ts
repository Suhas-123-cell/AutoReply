import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import {
  canManageCampaigns,
  getAccountAccessScope,
  getCurrentWorkspaceContext,
} from "@/lib/workspace-access";

export const dynamic = "force-dynamic";

const outcomeKinds = ["QUALIFIED_LEAD", "BOOKING", "SALE"] as const;

const createSchema = z.object({
  automationId: z.string().min(1),
  kind: z.enum(outcomeKinds),
  quantity: z.number().int().min(1).max(10_000).optional().default(1),
  valueCents: z.number().int().min(0).max(2_000_000_000).optional().nullable(),
  currency: z.string().trim().regex(/^[A-Z]{3}$/).optional().default("USD"),
  note: z.string().trim().max(240).optional().nullable(),
  occurredAt: z.coerce.date().max(new Date(Date.now() + 5 * 60_000)).optional(),
});

async function getCampaignInScope(
  workspaceId: string,
  automationId: string,
  allowedAccountIds: Set<string> | null
) {
  return prisma.automation.findFirst({
    where: {
      id: automationId,
      workspaceId,
      ...(allowedAccountIds
        ? { instagramAccountId: { in: [...allowedAccountIds] } }
        : {}),
    },
    select: { id: true },
  });
}

export async function GET(request: NextRequest) {
  const context = await getCurrentWorkspaceContext();
  if (!context) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  const automationId = request.nextUrl.searchParams.get("automationId");
  if (!automationId) {
    return NextResponse.json(
      { success: false, error: "Missing campaign ID" },
      { status: 400 }
    );
  }

  const { instagramAccountIds } = await getAccountAccessScope(context);
  if (!(await getCampaignInScope(context.workspaceId, automationId, instagramAccountIds))) {
    return NextResponse.json(
      { success: false, error: "Campaign not found" },
      { status: 404 }
    );
  }

  const [groups, recent] = await Promise.all([
    prisma.campaignOutcome.groupBy({
      by: ["kind"],
      where: { workspaceId: context.workspaceId, automationId },
      _sum: { quantity: true, valueCents: true },
    }),
    prisma.campaignOutcome.findMany({
      where: { workspaceId: context.workspaceId, automationId },
      orderBy: { occurredAt: "desc" },
      take: 20,
    }),
  ]);

  const summary = Object.fromEntries(
    outcomeKinds.map((kind) => [kind, { quantity: 0, valueCents: 0 }])
  );
  for (const group of groups) {
    if (group.kind in summary) {
      summary[group.kind] = {
        quantity: group._sum.quantity ?? 0,
        valueCents: group._sum.valueCents ?? 0,
      };
    }
  }

  return NextResponse.json(
    { success: true, data: { summary, recent } },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(request: NextRequest) {
  const context = await getCurrentWorkspaceContext();
  if (!context) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!canManageCampaigns(context.role)) {
    return NextResponse.json(
      { success: false, error: "Your role cannot record outcomes" },
      { status: 403 }
    );
  }

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Invalid outcome", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { instagramAccountIds } = await getAccountAccessScope(context);
  if (!(await getCampaignInScope(context.workspaceId, parsed.data.automationId, instagramAccountIds))) {
    return NextResponse.json(
      { success: false, error: "Campaign not found" },
      { status: 404 }
    );
  }

  const outcome = await prisma.campaignOutcome.create({
    data: {
      workspaceId: context.workspaceId,
      automationId: parsed.data.automationId,
      kind: parsed.data.kind,
      quantity: parsed.data.quantity,
      valueCents: parsed.data.valueCents,
      currency: parsed.data.currency,
      note: parsed.data.note || null,
      occurredAt: parsed.data.occurredAt,
    },
  });
  return NextResponse.json({ success: true, data: outcome }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const context = await getCurrentWorkspaceContext();
  if (!context) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!canManageCampaigns(context.role)) {
    return NextResponse.json(
      { success: false, error: "Your role cannot remove outcomes" },
      { status: 403 }
    );
  }
  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ success: false, error: "Missing outcome ID" }, { status: 400 });
  }

  const { instagramAccountIds } = await getAccountAccessScope(context);
  const existing = await prisma.campaignOutcome.findFirst({
    where: {
      id,
      workspaceId: context.workspaceId,
      automation: instagramAccountIds
        ? { instagramAccountId: { in: [...instagramAccountIds] } }
        : undefined,
    },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ success: false, error: "Outcome not found" }, { status: 404 });
  }
  await prisma.campaignOutcome.delete({ where: { id } });
  return NextResponse.json({ success: true, data: { deleted: true } });
}
