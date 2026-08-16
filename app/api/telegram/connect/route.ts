import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { encryptToken } from "@/lib/meta/oauth";
import { getBaseUrl } from "@/lib/env";
import {
  getBotInfo,
  setWebhook,
  deleteWebhook,
  TelegramApiError,
} from "@/lib/telegram/client";
import {
  canManageWorkspace,
  getAccountAccessScope,
  getCurrentWorkspaceContext,
} from "@/lib/workspace-access";

const connectSchema = z.object({
  botToken: z.string().min(20),
});

// List the workspace's connected Telegram bots (never returns botToken).
export async function GET() {
  const context = await getCurrentWorkspaceContext();
  if (!context) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const { telegramAccountIds } = await getAccountAccessScope(context);

  const accounts = await prisma.telegramAccount.findMany({
    where: {
      workspaceId: context.workspaceId,
      ...(telegramAccountIds ? { id: { in: [...telegramAccountIds] } } : {}),
    },
    select: {
      id: true,
      botId: true,
      botUsername: true,
      connectedAt: true,
    },
    orderBy: { connectedAt: "desc" },
  });

  return NextResponse.json({ success: true, data: accounts });
}

// Connect a client's Telegram bot: paste a @BotFather token, we verify it,
// register our webhook, and store it under the agency's workspace — the bot
// is owned by the workspace record, not by any client-facing account, same
// ownership shape as InstagramAccount.
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
      { success: false, error: "Only owners and admins can connect a bot" },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = connectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "A valid bot token is required" },
      { status: 400 }
    );
  }
  const botToken = parsed.data.botToken.trim();

  let botInfo;
  try {
    botInfo = await getBotInfo(botToken);
  } catch (err) {
    const message =
      err instanceof TelegramApiError
        ? err.message
        : "Could not reach Telegram";
    return NextResponse.json(
      { success: false, error: `Invalid bot token: ${message}` },
      { status: 400 }
    );
  }

  const botId = String(botInfo.id);
  const existing = await prisma.telegramAccount.findUnique({
    where: { botId },
  });
  if (existing) {
    return NextResponse.json(
      {
        success: false,
        error:
          existing.workspaceId === context.workspaceId
            ? "This bot is already connected."
            : "This bot is already connected to a different workspace.",
      },
      { status: 400 }
    );
  }

  const webhookSecret = randomBytes(32).toString("hex");
  const webhookUrl = `${getBaseUrl()}/api/webhook/telegram/${botId}`;

  try {
    await setWebhook(botToken, webhookUrl, webhookSecret);
  } catch (err) {
    const message =
      err instanceof TelegramApiError
        ? err.message
        : "Could not register webhook with Telegram";
    return NextResponse.json(
      { success: false, error: message },
      { status: 502 }
    );
  }

  const account = await prisma.telegramAccount.create({
    data: {
      workspaceId: context.workspaceId,
      botToken: encryptToken(botToken),
      botId,
      botUsername: botInfo.username,
      webhookSecret,
    },
    select: { id: true, botId: true, botUsername: true, connectedAt: true },
  });

  return NextResponse.json({ success: true, data: account });
}

const disconnectSchema = z.object({
  telegramAccountId: z.string().min(1),
});

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
      { success: false, error: "Only owners and admins can disconnect a bot" },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = disconnectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "telegramAccountId is required" },
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
      { success: false, error: "Bot not found" },
      { status: 404 }
    );
  }

  // Best-effort: Telegram's own webhook cleanup shouldn't block us from
  // removing our record even if this bot's token was since revoked.
  try {
    const { decryptToken } = await import("@/lib/meta/oauth");
    await deleteWebhook(decryptToken(account.botToken));
  } catch {
    // ignore — token may already be invalid, nothing more we can do here
  }

  await prisma.telegramAccount.delete({ where: { id: account.id } });

  return NextResponse.json({ success: true });
}
