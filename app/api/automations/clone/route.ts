import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { generateTrackedLinkSlug } from "@/lib/tracking/server";
import {
  canManageCampaigns,
  getAccountAccessScope,
  getCurrentWorkspaceContext,
} from "@/lib/workspace-access";

const cloneSchema = z.object({
  sourceAutomationId: z.string().min(1),
  // Client Instagram accounts (within the same workspace) to deploy this
  // flow to. Each gets its own Automation row — a real per-account campaign,
  // not a shared reference — so per-client edits and stats stay independent.
  targetInstagramAccountIds: z.array(z.string().min(1)).min(1).max(50),
});

// Cross-account clones are always paused. Instagram media ids belong to one
// account, so a specific-post source becomes a "next post or reel" draft on
// each target instead of silently storing an invalid foreign media id.
export async function POST(request: NextRequest) {
  const context = await getCurrentWorkspaceContext();
  if (!context) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }
  if (!canManageCampaigns(context.role)) {
    return NextResponse.json(
      { success: false, error: "Your role cannot clone campaigns" },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = cloneSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Invalid clone request" },
      { status: 400 }
    );
  }

  const { instagramAccountIds: allowedAccountIds } =
    await getAccountAccessScope(context);
  const source = await prisma.automation.findFirst({
    where: {
      id: parsed.data.sourceAutomationId,
      workspaceId: context.workspaceId,
      ...(allowedAccountIds
        ? { instagramAccountId: { in: [...allowedAccountIds] } }
        : {}),
    },
    include: {
      trackedLinks: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!source) {
    return NextResponse.json(
      { success: false, error: "Source automation not found" },
      { status: 404 }
    );
  }

  const targetIds = [...new Set(parsed.data.targetInstagramAccountIds)];
  const targets = await prisma.instagramAccount.findMany({
    where: {
      workspaceId: context.workspaceId,
      id: {
        in: allowedAccountIds
          ? targetIds.filter((id) => allowedAccountIds.has(id))
          : targetIds,
      },
    },
  });
  const foundIds = new Set(targets.map((t) => t.id));

  const created: { instagramAccountId: string; automationId: string }[] = [];
  const skipped: { instagramAccountId: string; reason: string }[] = [];

  for (const targetId of targetIds) {
    if (!foundIds.has(targetId)) {
      skipped.push({ instagramAccountId: targetId, reason: "not found in this workspace" });
      continue;
    }
    if (targetId === source.instagramAccountId) {
      skipped.push({ instagramAccountId: targetId, reason: "same as source account" });
      continue;
    }

    const clone = await prisma.automation.create({
      data: {
        workspaceId: context.workspaceId,
        instagramAccountId: targetId,
        name: source.name,
        goal: source.goal,
        postId: null,
        postUrl: null,
        pendingNextReel:
          !source.matchAnyPost &&
          (source.pendingNextReel || Boolean(source.postId)),
        matchAnyPost: source.matchAnyPost,
        keywords: source.keywords,
        matchAnyWord: source.matchAnyWord,
        dmTriggerEnabled: source.dmTriggerEnabled,
        dmMessage: source.dmMessage,
        openingDmEnabled: source.openingDmEnabled,
        openingDmMessage: source.openingDmMessage,
        openingDmButtonLabel: source.openingDmButtonLabel,
        linkButtonLabel: source.linkButtonLabel,
        requireFollow: source.requireFollow,
        followPromptMessage: source.followPromptMessage,
        followPromptButtonLabel: source.followPromptButtonLabel,
        followUpEnabled: source.followUpEnabled,
        followUpMessage: source.followUpMessage,
        publicReplyEnabled: source.publicReplyEnabled,
        publicReplyMessage: source.publicReplyMessage,
        publicReplyMessages: source.publicReplyMessages,
        wholeWordMatch: source.wholeWordMatch,
        isActive: false,
        ...(source.trackedLinks.length > 0
          ? {
              trackedLinks: {
                create: source.trackedLinks.map((link) => ({
                  workspaceId: context.workspaceId,
                  slug: generateTrackedLinkSlug(),
                  label: link.label,
                  destinationUrl: link.destinationUrl,
                })),
              },
            }
          : {}),
      },
    });

    created.push({ instagramAccountId: targetId, automationId: clone.id });
  }

  return NextResponse.json({
    success: true,
    data: {
      created,
      skipped,
      paused: true,
      note: "Clones are paused. Review the target post and links before activating.",
    },
  });
}
