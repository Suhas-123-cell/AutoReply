/**
 * Telegram Bot API client
 *
 * Telegram is the zero-gate launch channel: no Meta App Review wait, a bot
 * token is live in ~2 minutes via @BotFather. Mirrors lib/meta/client.ts's
 * shape (typed error class, small fetch wrappers) but talks to
 * api.telegram.org instead of Graph API.
 */

const TELEGRAM_API_BASE = "https://api.telegram.org";

export class TelegramApiError extends Error {
  constructor(
    message: string,
    public readonly errorCode?: number
  ) {
    super(message);
    this.name = "TelegramApiError";
  }
}

interface TelegramApiResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
}

async function callTelegramApi<T>(
  botToken: string,
  method: string,
  body?: Record<string, unknown>
): Promise<T> {
  const response = await fetch(
    `${TELEGRAM_API_BASE}/bot${botToken}/${method}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    }
  );

  const data = (await response.json()) as TelegramApiResponse<T>;
  if (!data.ok || data.result === undefined) {
    throw new TelegramApiError(
      data.description ?? `Telegram API call to ${method} failed`,
      data.error_code
    );
  }
  return data.result;
}

export interface TelegramBotInfo {
  id: number;
  is_bot: boolean;
  first_name: string;
  username: string;
}

/** Validates a bot token and returns the bot's identity. Throws on an invalid token. */
export function getBotInfo(botToken: string): Promise<TelegramBotInfo> {
  return callTelegramApi<TelegramBotInfo>(botToken, "getMe");
}

/**
 * Registers our webhook URL with Telegram for this bot, scoped to the
 * message updates we actually process. secretToken is echoed back by
 * Telegram on every update as the X-Telegram-Bot-Api-Secret-Token header —
 * Telegram's equivalent of Meta's x-hub-signature-256 check.
 */
export function setWebhook(
  botToken: string,
  webhookUrl: string,
  secretToken: string
): Promise<true> {
  return callTelegramApi<true>(botToken, "setWebhook", {
    url: webhookUrl,
    secret_token: secretToken,
    allowed_updates: ["message"],
  });
}

export function deleteWebhook(botToken: string): Promise<true> {
  return callTelegramApi<true>(botToken, "deleteWebhook");
}

export interface SendMessageResult {
  message_id: number;
}

export function sendMessage(
  botToken: string,
  chatId: string | number,
  text: string
): Promise<SendMessageResult> {
  return callTelegramApi<SendMessageResult>(botToken, "sendMessage", {
    chat_id: chatId,
    text,
  });
}

// --- Inbound update shape (only the fields we read) ---

export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    text?: string;
    chat: { id: number; type: string };
    from?: { id: number; username?: string; first_name?: string };
    date: number;
  };
}
