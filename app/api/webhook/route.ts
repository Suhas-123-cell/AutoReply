import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getDMQueue, getRedisConnection } from "@/lib/queue/client";
import {
  parseCommentEvents,
  parseMessageEvents,
  parsePostbackEvents,
  verifyWebhookSignature,
} from "@/lib/meta/webhook";
import { MESSAGE_JOB_NAME, POSTBACK_JOB_NAME } from "@/lib/queue/client";
import { Prisma } from "@/app/generated/prisma/client";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.WEBHOOK_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json(
    { success: false, error: "Verification failed" },
    { status: 403 }
  );
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");

  if (!verifyWebhookSignature(rawBody, signature)) {
    // Record the attempt so a signature mismatch is visible rather than a
    // silent 401 — the common symptom of FACEBOOK_APP_SECRET being set to the
    // wrong app's secret. This endpoint is public, so it records at most one
    // event a minute and never stores the unauthenticated body.
    const firstThisMinute = await getRedisConnection()
      .set("webhook:bad-signature:logged", "1", "EX", 60, "NX")
      .catch(() => null);
    if (firstThisMinute === "OK") {
      await prisma.operationalEvent
        .create({
          data: {
            source: "SYSTEM",
            level: "WARNING",
            message: "Webhook signature verification failed",
            payload: {
              hadSignatureHeader: Boolean(signature),
              bodyLength: rawBody.length,
            },
          },
        })
        .catch(() => {});
    }
    return NextResponse.json(
      { success: false, error: "Invalid signature" },
      { status: 401 }
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON" },
      { status: 400 }
    );
  }

  const webhookEvent = await prisma.webhookEvent.create({
    data: {
      object:
        typeof payload === "object" && payload && "object" in payload
          ? String(payload.object)
          : null,
      payload: payload as Prisma.InputJsonValue,
      status: "PENDING",
    },
  });

  try {
    const commentEvents = parseCommentEvents(
      payload as Parameters<typeof parseCommentEvents>[0]
    );
    const queue = getDMQueue();

    for (const event of commentEvents) {
      const account = await prisma.instagramAccount.findUnique({
        where: { instagramId: event.instagramAccountId },
        select: { workspaceId: true },
      });

      await queue.add(
        "process-comment",
        {
          instagramAccountId: event.instagramAccountId,
          commentId: event.commentId,
          commentText: event.commentText,
          commenterId: event.commenterId,
          commenterName: event.commenterName,
          mediaId: event.mediaId,
          commentTimestamp: event.commentTimestamp,
          source: "WEBHOOK",
        },
        {
          jobId: `comment_${event.instagramAccountId}_${Buffer.from(
            event.commentId
          ).toString("base64url")}`,
        }
      );

      if (account) {
        await prisma.webhookEvent.update({
          where: { id: webhookEvent.id },
          data: { workspaceId: account.workspaceId },
        });
      }
    }

    // Inbound DMs and Story replies → keyword-triggered autoreply.
    const messageEvents = parseMessageEvents(
      payload as Parameters<typeof parseMessageEvents>[0]
    );

    for (const event of messageEvents) {
      await queue.add(
        MESSAGE_JOB_NAME,
        {
          instagramAccountId: event.instagramAccountId,
          messageId: event.messageId,
          messageText: event.messageText,
          senderId: event.senderId,
          isStoryReply: event.isStoryReply,
          interactionTimestamp: event.interactionTimestamp,
        },
        {
          // Message ids can contain characters BullMQ rejects in a job id
          // (":" in particular). base64url encodes into exactly the allowed
          // alphabet and stays injective, so two distinct mids never collapse
          // onto one job id.
          jobId: `message_${event.instagramAccountId}_${Buffer.from(
            event.messageId
          ).toString("base64url")}`,
        }
      );

      if (!webhookEvent.workspaceId) {
        const account = await prisma.instagramAccount.findUnique({
          where: { instagramId: event.instagramAccountId },
          select: { workspaceId: true },
        });
        if (account) {
          await prisma.webhookEvent.update({
            where: { id: webhookEvent.id },
            data: { workspaceId: account.workspaceId },
          });
        }
      }
    }

    // Button taps from opening DMs → deliver the reveal message.
    const postbackEvents = parsePostbackEvents(
      payload as Parameters<typeof parsePostbackEvents>[0]
    );

    for (const event of postbackEvents) {
      await queue.add(
        POSTBACK_JOB_NAME,
        {
          instagramAccountId: event.instagramAccountId,
          userId: event.userId,
          payload: event.payload,
          mid: event.mid,
          interactionTimestamp: event.interactionTimestamp,
        },
        {
          // BullMQ forbids ":" in custom job ids, and the payload is
          // "reveal:<id>", so build with underscores and strip any colons.
          jobId: `postback_${event.instagramAccountId}_${event.userId}_${(
            event.mid ?? event.payload
          ).replace(/:/g, "_")}`,
        }
      );
    }

    // Read receipts do not open the messaging window. Only messages and
    // explicit button interactions above may enqueue a reply.

    await prisma.webhookEvent.update({
      where: { id: webhookEvent.id },
      data: {
        status: "PROCESSED",
        processedAt: new Date(),
      },
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await prisma.webhookEvent.update({
      where: { id: webhookEvent.id },
      data: {
        status: "FAILED",
        errorMessage: message,
        processedAt: new Date(),
      },
    });

    return NextResponse.json(
      { success: false, error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}
