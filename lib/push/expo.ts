/**
 * Thin client for the Expo Push Service.
 *
 * No SDK dependency — Expo's push API is a single JSON POST endpoint, so a
 * raw fetch is simpler than pulling in `expo-server-sdk` for one call. Expo
 * accepts up to 100 messages per request, so larger batches are chunked.
 * https://docs.expo.dev/push-notifications/sending-notifications/
 */

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const MAX_MESSAGES_PER_REQUEST = 100;

export interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export interface ExpoPushTicket {
  to: string;
  status: "ok" | "error";
  id?: string;
  message?: string;
  // `details.error` carries Expo's machine-readable error code, e.g.
  // "DeviceNotRegistered" — the signal the caller uses to disable a device.
  details?: { error?: string };
}

interface ExpoPushApiResult {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string };
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/**
 * Send a batch of push messages via Expo, returning one ticket per message
 * (in the same order as the input) so the caller can detect per-device
 * failures such as `DeviceNotRegistered`.
 */
export async function sendExpoPushNotifications(
  messages: ExpoPushMessage[]
): Promise<ExpoPushTicket[]> {
  const tickets: ExpoPushTicket[] = [];

  for (const batch of chunk(messages, MAX_MESSAGES_PER_REQUEST)) {
    const response = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(
        batch.map(({ to, title, body, data }) => ({ to, title, body, data }))
      ),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Expo push request failed (${response.status}): ${text}`);
    }

    const json = (await response.json()) as { data?: ExpoPushApiResult[] };
    const results = json.data ?? [];

    batch.forEach((message, index) => {
      const result = results[index];
      tickets.push({
        to: message.to,
        status: result?.status === "ok" ? "ok" : "error",
        id: result?.id,
        message: result?.message,
        details: result?.details,
      });
    });
  }

  return tickets;
}
