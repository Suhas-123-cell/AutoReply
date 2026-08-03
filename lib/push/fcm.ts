/**
 * Thin wrapper around Firebase Cloud Messaging (Firebase Admin SDK).
 *
 * FCM is the single delivery path for both platforms: Android devices
 * register a native FCM token, and iOS devices register an APNs token that
 * Firebase re-wraps into an FCM registration token once the project's APNs
 * key is configured in the Firebase console — see
 * @react-native-firebase/messaging's getToken(). So there's no separate
 * direct-APNs code path here, same one-request-per-batch shape as the old
 * Expo client this replaces.
 */

import { getMessaging } from "@/lib/firebase/admin";

const MAX_MESSAGES_PER_REQUEST = 500; // FCM sendEach batch limit

export interface FcmPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export interface FcmPushTicket {
  to: string;
  status: "ok" | "error";
  id?: string;
  message?: string;
  // FCM's machine-readable error code, e.g.
  // "messaging/registration-token-not-registered" — the signal the caller
  // uses to disable a device.
  errorCode?: string;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

// FCM data payload values must all be strings.
function toStringData(data?: Record<string, unknown>): Record<string, string> | undefined {
  if (!data) return undefined;
  return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, String(value)]));
}

/**
 * Send a batch of push messages via FCM, returning one ticket per message
 * (in the same order as the input) so the caller can detect per-device
 * failures such as an unregistered token.
 */
export async function sendFcmPushNotifications(
  messages: FcmPushMessage[]
): Promise<FcmPushTicket[]> {
  const tickets: FcmPushTicket[] = [];
  const messaging = getMessaging();

  for (const batch of chunk(messages, MAX_MESSAGES_PER_REQUEST)) {
    const response = await messaging.sendEach(
      batch.map(({ to, title, body, data }) => ({
        token: to,
        notification: { title, body },
        data: toStringData(data),
      }))
    );

    response.responses.forEach((result, index) => {
      const message = batch[index];
      tickets.push({
        to: message.to,
        status: result.success ? "ok" : "error",
        id: result.messageId,
        message: result.error?.message,
        errorCode: result.error?.code,
      });
    });
  }

  return tickets;
}
