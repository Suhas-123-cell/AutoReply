import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { decryptToken } from "@/lib/meta/oauth";
import {
  sendMessage,
  TelegramApiError,
  type TelegramUpdate,
} from "@/lib/telegram/client";
import { matchKeywords } from "@/lib/utils/keyword-matcher";
import { getRedisConnection } from "@/lib/queue/client";
import {
  releaseWorkspaceDMReservation,
  reserveWorkspaceDMSend,
} from "@/lib/billing/usage";
import { hasVerifiedPhone } from "@/lib/auth/phone-verification";

type RouteProps = { params: Promise<{ botId: string }> };

// Telegram webhook, one URL per bot (path-scoped by botId so a lookup is a
// single indexed query rather than a secret-token table scan). Processed
// inline rather than via BullMQ: Telegram delivers one update per message a
// user sends the bot directly, not a comment-storm-on-a-viral-post spike
// like Instagram's webhook, so the async-queue rule from the brief's
// architecture section doesn't carry the same urgency here.
export async function POST(request: NextRequest, { params }: RouteProps) {
  const { botId } = await params;

  const account = await prisma.telegramAccount.findUnique({
    where: { botId },
    include: {
      workspace: { select: { owner: { select: { phone: true, phoneVerified: true } } } },
    },
  });
  if (!account) {
    return NextResponse.json({ success: false }, { status: 404 });
  }

  const secretHeader = request.headers.get(
    "x-telegram-bot-api-secret-token"
  );
  const expected = Buffer.from(account.webhookSecret);
  const actual = Buffer.from(secretHeader ?? "");
  if (
    expected.length !== actual.length ||
    !timingSafeEqual(expected, actual)
  ) {
    return NextResponse.json({ success: false }, { status: 401 });
  }

  let update: TelegramUpdate;
  try {
    update = await request.json();
  } catch {
    return NextResponse.json({ success: false }, { status: 400 });
  }

  const message = update.message;
  if (!message?.text || !message.chat) {
    // Non-text updates (stickers, edits, etc.) — ack and ignore.
    return NextResponse.json({ success: true });
  }

  // Same rule as Instagram: a workspace sends nothing until its owner has a
  // verified phone number.
  if (!hasVerifiedPhone(account.workspace.owner)) {
    return NextResponse.json({ success: true });
  }

  // Telegram redelivers an update it didn't see acknowledged in time; reply
  // to each update_id once.
  const firstDelivery = await getRedisConnection()
    .set(`tg:update:${botId}:${update.update_id}`, "1", "EX", 24 * 60 * 60, "NX")
    .catch(() => "OK");
  if (firstDelivery !== "OK") {
    return NextResponse.json({ success: true });
  }

  const chatId = String(message.chat.id);
  const senderUsername = message.from?.username ?? null;
  const messageText = message.text;

  const automations = await prisma.telegramAutomation.findMany({
    where: { telegramAccountId: account.id, isActive: true },
    orderBy: { createdAt: "asc" },
  });

  let matchedAutomation: (typeof automations)[number] | null = null;
  let matchedKeyword: string | null = null;
  for (const automation of automations) {
    const result = matchKeywords(
      messageText,
      automation.keywords,
      automation.wholeWordMatch
    );
    if (result.matched) {
      matchedAutomation = automation;
      matchedKeyword = result.matchedKeyword;
      break;
    }
  }

  // Messages that trigger nothing aren't stored: they're private
  // conversations with the bot, not campaign activity.
  if (!matchedAutomation) {
    return NextResponse.json({ success: true });
  }

  // Telegram replies draw from the same monthly allowance as Instagram DMs.
  const usage = await reserveWorkspaceDMSend(account.workspaceId);
  if (!usage.allowed) {
    await prisma.telegramMessageLog.create({
      data: {
        workspaceId: account.workspaceId,
        telegramAccountId: account.id,
        automationId: matchedAutomation.id,
        chatId,
        senderUsername,
        messageText,
        matchedKeyword,
        status: "SKIPPED_PLAN_LIMIT",
        errorMessage: `Monthly DM limit reached (${usage.limit})`,
      },
    });
    return NextResponse.json({ success: true });
  }

  const log = await prisma.telegramMessageLog.create({
    data: {
      workspaceId: account.workspaceId,
      telegramAccountId: account.id,
      automationId: matchedAutomation.id,
      chatId,
      senderUsername,
      messageText,
      matchedKeyword,
      status: "PENDING",
    },
  });

  try {
    const botToken = decryptToken(account.botToken);
    await sendMessage(botToken, chatId, matchedAutomation.replyMessage);
    await prisma.telegramMessageLog.update({
      where: { id: log.id },
      data: { status: "SENT", sentAt: new Date(), attempts: 1 },
    });
  } catch (err) {
    await releaseWorkspaceDMReservation(account.workspaceId, usage.periodStart);
    const message =
      err instanceof TelegramApiError ? err.message : "Failed to send reply";
    await prisma.telegramMessageLog.update({
      where: { id: log.id },
      data: { status: "FAILED", errorMessage: message, attempts: 1 },
    });
  }

  return NextResponse.json({ success: true });
}
