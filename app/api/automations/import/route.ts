import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { generateTrackedLinkSlug } from "@/lib/tracking/server";
import { httpUrlSchema } from "@/lib/utils/url";
import {
  canManageCampaigns,
  getAccountAccessScope,
  getCurrentWorkspaceContext,
} from "@/lib/workspace-access";

export const dynamic = "force-dynamic";

const linkSchema = z.object({
  label: z.string().trim().max(20).optional().nullable(),
  destinationUrl: httpUrlSchema,
});

const campaignSchema = z
  .object({
    sourceInstagramAccountId: z.string().optional().nullable(),
    name: z.string().trim().min(1).max(100).optional(),
    goal: z.string().trim().max(120).optional().nullable(),
    postId: z.string().min(1).optional().nullable(),
    postUrl: z.string().url().optional().nullable(),
    pendingNextReel: z.boolean().optional().default(false),
    matchAnyPost: z.boolean().optional().default(false),
    dmTriggerEnabled: z.boolean().optional().default(false),
    keywords: z
      .array(z.string().trim().min(1).max(50))
      .max(10)
      .optional()
      .default([]),
    matchAnyWord: z.boolean().optional().default(false),
    dmMessage: z.string().min(1).max(1000),
    openingDmEnabled: z.boolean().optional().default(false),
    openingDmMessage: z.string().max(1000).optional().nullable(),
    openingDmButtonLabel: z.string().max(64).optional().nullable(),
    linkButtonLabel: z.string().max(20).optional().nullable(),
    requireFollow: z.boolean().optional().default(false),
    followPromptMessage: z.string().max(1000).optional().nullable(),
    followPromptButtonLabel: z.string().max(20).optional().nullable(),
    followUpEnabled: z.boolean().optional().default(false),
    followUpMessage: z.string().max(1000).optional().nullable(),
    publicReplyEnabled: z.boolean().optional().default(false),
    publicReplyMessage: z.string().max(1000).optional().nullable(),
    publicReplyMessages: z
      .array(z.string().max(1000))
      .max(10)
      .optional()
      .default([]),
    wholeWordMatch: z.boolean().optional().default(true),
    trackedLinks: z.array(linkSchema).max(3).optional().default([]),
    // Legacy single-link import field.
    trackedUrl: z
      .union([httpUrlSchema, z.literal("")])
      .optional()
      .nullable(),
  })
  .superRefine((campaign, ctx) => {
    if (!campaign.matchAnyWord && campaign.keywords.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Add at least one keyword, or match any word",
        path: ["keywords"],
      });
    }
    if (
      campaign.openingDmEnabled &&
      (!campaign.openingDmMessage?.trim() ||
        !campaign.openingDmButtonLabel?.trim())
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Opening DM needs a message and a button label",
        path: ["openingDmMessage"],
      });
    }
    if (campaign.requireFollow && !campaign.followPromptMessage?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A follow requirement needs a follow-prompt message",
        path: ["followPromptMessage"],
      });
    }
  });

const importSchema = z.object({
  version: z.literal(1).optional(),
  instagramAccountId: z.string().min(1),
  campaigns: z.array(campaignSchema).min(1).max(200),
});

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
      { success: false, error: "Your role cannot import campaigns" },
      { status: 403 }
    );
  }

  const parsed = importSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid AutoReply campaign JSON",
        details: parsed.error.flatten(),
      },
      { status: 400 }
    );
  }

  const { instagramAccountIds: allowedAccountIds } =
    await getAccountAccessScope(context);
  if (
    allowedAccountIds &&
    !allowedAccountIds.has(parsed.data.instagramAccountId)
  ) {
    return NextResponse.json(
      { success: false, error: "Account not found" },
      { status: 404 }
    );
  }
  const account = await prisma.instagramAccount.findFirst({
    where: {
      id: parsed.data.instagramAccountId,
      workspaceId: context.workspaceId,
    },
    select: { id: true },
  });
  if (!account) {
    return NextResponse.json(
      { success: false, error: "Instagram account not found" },
      { status: 404 }
    );
  }

  const existing = await prisma.automation.findMany({
    where: { instagramAccountId: account.id, postId: { not: null } },
    select: { postId: true },
  });
  const usedPostIds = new Set(
    existing.flatMap((item) => (item.postId ? [item.postId] : []))
  );
  const created: { name: string; automationId: string; targeting: string }[] =
    [];
  const skipped: { row: number; reason: string }[] = [];

  for (const [index, campaign] of parsed.data.campaigns.entries()) {
    const sameSourceAccount = campaign.sourceInstagramAccountId === account.id;
    const preserveSpecificPost = sameSourceAccount && Boolean(campaign.postId);
    if (preserveSpecificPost && usedPostIds.has(campaign.postId as string)) {
      skipped.push({
        row: index + 1,
        reason: "a campaign already exists for this post",
      });
      continue;
    }

    const publicReplies = (
      campaign.publicReplyMessages.length
        ? campaign.publicReplyMessages
        : campaign.publicReplyMessage
        ? [campaign.publicReplyMessage]
        : []
    )
      .map((message) => message.trim())
      .filter(Boolean);
    const links = campaign.trackedLinks.length
      ? campaign.trackedLinks
      : campaign.trackedUrl
      ? [
          {
            label: "Primary campaign link",
            destinationUrl: campaign.trackedUrl,
          },
        ]
      : [];
    const matchAnyPost = !preserveSpecificPost && campaign.matchAnyPost;
    const pendingNextReel =
      !matchAnyPost &&
      (campaign.pendingNextReel ||
        Boolean(campaign.postId && !preserveSpecificPost));
    const dmTriggerEnabled =
      campaign.dmTriggerEnabled ||
      (!preserveSpecificPost && !matchAnyPost && !pendingNextReel);
    const name =
      campaign.name?.trim() ||
      `Imported: ${campaign.keywords[0] ?? "campaign"}`;

    const automation = await prisma.automation.create({
      data: {
        workspaceId: context.workspaceId,
        instagramAccountId: account.id,
        name,
        goal: campaign.goal?.trim() || null,
        postId: preserveSpecificPost ? campaign.postId : null,
        postUrl: preserveSpecificPost ? campaign.postUrl : null,
        pendingNextReel,
        matchAnyPost,
        dmTriggerEnabled,
        keywords: campaign.matchAnyWord ? [] : campaign.keywords,
        matchAnyWord: campaign.matchAnyWord,
        dmMessage: campaign.dmMessage,
        openingDmEnabled: campaign.openingDmEnabled,
        openingDmMessage: campaign.openingDmEnabled
          ? campaign.openingDmMessage
          : null,
        openingDmButtonLabel: campaign.openingDmEnabled
          ? campaign.openingDmButtonLabel
          : null,
        linkButtonLabel: campaign.linkButtonLabel,
        requireFollow: campaign.requireFollow,
        followPromptMessage: campaign.requireFollow
          ? campaign.followPromptMessage
          : null,
        followPromptButtonLabel: campaign.requireFollow
          ? campaign.followPromptButtonLabel
          : null,
        followUpEnabled: campaign.followUpEnabled,
        followUpMessage: campaign.followUpEnabled
          ? campaign.followUpMessage
          : null,
        publicReplyEnabled:
          campaign.publicReplyEnabled && publicReplies.length > 0,
        publicReplyMessage: publicReplies[0] ?? null,
        publicReplyMessages: publicReplies,
        wholeWordMatch: campaign.wholeWordMatch,
        // Imports are drafts until the operator has reviewed targeting and links.
        isActive: false,
        ...(links.length
          ? {
              trackedLinks: {
                create: links.map((link, linkIndex) => ({
                  workspaceId: context.workspaceId,
                  slug: generateTrackedLinkSlug(),
                  label:
                    link.label ||
                    (linkIndex === 0 ? "Primary campaign link" : "Open link"),
                  destinationUrl: link.destinationUrl,
                })),
              },
            }
          : {}),
      },
    });
    if (preserveSpecificPost) usedPostIds.add(campaign.postId as string);
    created.push({
      name,
      automationId: automation.id,
      targeting: preserveSpecificPost
        ? "specific post"
        : matchAnyPost
        ? "any post"
        : pendingNextReel
        ? "next post or reel"
        : "DMs and Story replies",
    });
  }

  return NextResponse.json({
    success: true,
    data: {
      created,
      skipped,
      paused: true,
      note: "Imported campaigns are paused until you review and activate them.",
    },
  });
}
