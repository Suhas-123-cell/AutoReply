import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import {
  allowLinkClick,
  getRequestIp,
  hashClickIp,
  isLikelyLinkPreview,
} from "@/lib/tracking/server";

type RedirectRouteProps = {
  params: Promise<{ slug: string }>;
};

export async function GET(request: NextRequest, { params }: RedirectRouteProps) {
  const { slug } = await params;
  const trackedLink = await prisma.trackedLink.findUnique({
    where: { slug },
    select: {
      id: true,
      workspaceId: true,
      automationId: true,
      destinationUrl: true,
      automation: {
        select: {
          instagramAccountId: true,
        },
      },
    },
  });

  if (!trackedLink) {
    return NextResponse.redirect(new URL("/", request.url), { status: 302 });
  }

  const ipHash = hashClickIp(getRequestIp(request));

  // This is the one fully public, unauthenticated endpoint in the app — real
  // Instagram users tap it directly, so it can't be gated behind a session.
  // Still redirect on a rate-limit hit (never strand a real click), just skip
  // the analytics write so one abusive actor can't flood LinkClick inserts.
  const userAgent = request.headers.get("user-agent");
  if (!isLikelyLinkPreview(userAgent) && await allowLinkClick(ipHash)) {
    // Analytics must never block the destination if the database is briefly
    // unavailable. The customer bought the click-through, not the counter.
    await prisma.linkClick
      .create({
        data: {
          workspaceId: trackedLink.workspaceId,
          automationId: trackedLink.automationId,
          instagramAccountId: trackedLink.automation.instagramAccountId,
          trackedLinkId: trackedLink.id,
          ipHash,
          userAgent,
          referrer: request.headers.get("referer"),
        },
      })
      .catch((error) => console.error("[Tracked Link] Click logging failed:", error));
  }

  return NextResponse.redirect(trackedLink.destinationUrl, { status: 302 });
}
