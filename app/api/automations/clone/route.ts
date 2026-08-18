import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import {
  canManageWorkspace,
  getCurrentWorkspaceContext,
} from "@/lib/workspace-access";

const cloneSchema = z.object({
  sourceAutomationId: z.string().min(1),
  // Client Instagram accounts (within the same workspace) to deploy this
  // flow to. Each gets its own Automation row — a real per-account campaign,
  // not a shared reference — so per-client edits and stats stay independent.
  targetInstagramAccountIds: z.array(z.string().min(1)).min(1).max(50),
});

// One-click flow cloning: build a campaign once, deploy it to every client
// account in one call. Requires the source campaign's postId to also exist
// on the target account (comment-to-DM automations are scoped to a specific
// post) — callers are expected to have already resolved that on the client
// side; rows that fail the per-account postId uniqueness check are skipped
// and reported back, not silently dropped.
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
      { success: false, error: "Only owners and admins can clone automations" },
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

  const source = await prisma.automation.findFirst({
    where: {
      id: parsed.data.sourceAutomationId,
      workspaceId: context.workspaceId,
    },
  });
  if (!source) {
    return NextResponse.json(
      { success: false, error: "Source automation not found" },
      { status: 404 }
    );
  }

  const targets = await prisma.instagramAccount.findMany({
    where: {
      workspaceId: context.workspaceId,
      id: { in: parsed.data.targetInstagramAccountIds },
    },
  });
  const foundIds = new Set(targets.map((t) => t.id));

  const created: { instagramAccountId: string; automationId: string }[] = [];
  const skipped: { instagramAccountId: string; reason: string }[] = [];

  for (const targetId of parsed.data.targetInstagramAccountIds) {
    if (!foundIds.has(targetId)) {
      skipped.push({ instagramAccountId: targetId, reason: "not found in this workspace" });
      continue;
    }
    if (targetId === source.instagramAccountId) {
      skipped.push({ instagramAccountId: targetId, reason: "same as source account" });
      continue;
    }

    const conflict = await prisma.automation.findFirst({
      where: { instagramAccountId: targetId, postId: source.postId },
      select: { id: true },
    });
    if (conflict) {
      skipped.push({
        instagramAccountId: targetId,
        reason: "a campaign already exists for this post on that account",
      });
      continue;
    }

    const clone = await prisma.automation.create({
      data: {
        workspaceId: context.workspaceId,
        instagramAccountId: targetId,
        name: source.name,
        goal: source.goal,
        postId: source.postId,
        postUrl: source.postUrl,
        matchAnyPost: source.matchAnyPost,
        keywords: source.keywords,
        matchAnyWord: source.matchAnyWord,
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
        isActive: source.isActive,
      },
    });

    created.push({ instagramAccountId: targetId, automationId: clone.id });
  }

  return NextResponse.json({ success: true, data: { created, skipped } });
}
