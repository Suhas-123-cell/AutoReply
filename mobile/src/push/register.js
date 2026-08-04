/**
 * Push notification registration (Firebase Cloud Messaging).
 *
 * The OS permission dialog is one-shot on iOS — a denial can only be reversed
 * in Settings, not by asking again — so nothing here requests permission
 * except in direct response to the user tapping "Enable notifications" on the
 * pre-permission explainer (PushPermissionModal.jsx). That modal is shown at
 * most once per install, gated by the SecureStore-backed flag below (checked
 * from src/App.jsx).
 *
 * Local storage uses the secure-kv keychain helper throughout, matching
 * src/auth/session-store.js — the app's one existing local-storage
 * convention — rather than introducing AsyncStorage for a few small values.
 */
import { Platform } from "react-native";
import messaging from "@react-native-firebase/messaging";
import notifee, { AndroidImportance, EventType } from "@notifee/react-native";
import DeviceInfo from "react-native-device-info";
import * as SecureStore from "../lib/secure-kv";
import { apiFetch, ApiError } from "../api/client";
import { navigate } from "../navigation/navigationRef";

const PRIMER_SEEN_KEY = "openreply.pushPrimerSeen";
const TOKEN_KEY = "openreply.fcmToken";
// Cached locally because PATCH /api/mobile/push/preferences takes the token
// as its identifier and there is no GET endpoint to read current prefs back.
const PREFS_KEY = "openreply.pushPreferences";

export async function hasSeenPushPrimer() {
  return (await SecureStore.getItemAsync(PRIMER_SEEN_KEY)) === "true";
}

export async function markPushPrimerSeen() {
  await SecureStore.setItemAsync(PRIMER_SEEN_KEY, "true");
}

export async function getStoredPushToken() {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function getStoredPushPreferences() {
  const raw = await SecureStore.getItemAsync(PREFS_KEY);
  if (!raw) return { leadAlerts: true, failureAlerts: true };
  try {
    return JSON.parse(raw);
  } catch {
    return { leadAlerts: true, failureAlerts: true };
  }
}

async function storePushPreferences(prefs) {
  await SecureStore.setItemAsync(PREFS_KEY, JSON.stringify(prefs));
}

/** Android requires channels to exist before a notification can target them. */
export async function configureAndroidChannels() {
  if (Platform.OS !== "android") return;
  await notifee.createChannel({ id: "leads", name: "New leads", importance: AndroidImportance.DEFAULT });
  await notifee.createChannel({ id: "failures", name: "Send failures", importance: AndroidImportance.HIGH });
  await notifee.createChannel({ id: "ops", name: "Operational alerts", importance: AndroidImportance.DEFAULT });
}

/** Displays an FCM RemoteMessage as a local notification via notifee (foreground presentation — FCM alone doesn't show a banner while the app is in the foreground). */
async function displayForegroundNotification(remoteMessage) {
  const { notification, data } = remoteMessage;
  if (!notification) return;
  await notifee.displayNotification({
    title: notification.title,
    body: notification.body,
    data,
    android: { channelId: data?.kind === "send_failure" ? "failures" : "leads" },
  });
}

/**
 * Requests OS permission (if not already granted/denied), fetches the FCM
 * registration token, and registers it with the backend. Returns the token
 * on success, or null if permission was denied / the token couldn't be
 * obtained — callers should treat null as "couldn't enable, try again later"
 * rather than throwing.
 */
export async function registerForPushNotificationsAsync() {
  const existing = await messaging().hasPermission();
  let authorized =
    existing === messaging.AuthorizationStatus.AUTHORIZED ||
    existing === messaging.AuthorizationStatus.PROVISIONAL;
  if (!authorized) {
    const requested = await messaging().requestPermission();
    authorized =
      requested === messaging.AuthorizationStatus.AUTHORIZED ||
      requested === messaging.AuthorizationStatus.PROVISIONAL;
  }
  if (!authorized) return null;

  await configureAndroidChannels();

  let fcmToken;
  try {
    fcmToken = await messaging().getToken();
  } catch (err) {
    console.warn("[push] Couldn't get FCM token:", err?.message ?? err);
    return null;
  }

  const deviceName = await DeviceInfo.getDeviceName().catch(() => undefined);
  try {
    await apiFetch("/api/mobile/push/register", {
      method: "POST",
      body: {
        fcmToken,
        platform: Platform.OS,
        appVersion: DeviceInfo.getVersion(),
        deviceName,
      },
    });
  } catch (err) {
    console.warn("[push] Registration call failed:", err instanceof ApiError ? err.message : err);
    return null;
  }

  await SecureStore.setItemAsync(TOKEN_KEY, fcmToken);
  return fcmToken;
}

/** Best-effort unregister (e.g. on sign-out). Never throws. */
export async function unregisterPushToken() {
  const fcmToken = await getStoredPushToken();
  if (!fcmToken) return;
  try {
    await apiFetch("/api/mobile/push/register", {
      method: "DELETE",
      body: { fcmToken },
    });
  } catch {
    // Best-effort — the server-side row is harmless if left behind and will
    // self-disable the next time a push to it bounces.
  }
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

/** @param {{leadAlerts?: boolean, failureAlerts?: boolean}} prefs */
export async function updatePushPreferences(prefs) {
  const fcmToken = await getStoredPushToken();
  if (!fcmToken) {
    throw new Error("Notifications are not enabled on this device yet.");
  }
  await apiFetch("/api/mobile/push/preferences", {
    method: "PATCH",
    body: { fcmToken, ...prefs },
  });
  const current = await getStoredPushPreferences();
  await storePushPreferences({ ...current, ...prefs });
}

// Maps the web-shaped deep links the backend sends (see
// lib/queue/dm-worker.ts's enqueuePush calls, e.g. "/logs?highlight=<id>") to
// the React Navigation screen name that should open. Navigation goes through
// the module-level navigationRef (see navigate() in ../navigation/navigationRef),
// so the map targets a screen name directly rather than a path string.
const DEEP_LINK_ROUTE_MAP = [[/^\/logs\b/, "Activity"]];

export function mapDeepLinkToRoute(deepLink) {
  if (!deepLink) return null;
  for (const [pattern, replacement] of DEEP_LINK_ROUTE_MAP) {
    if (pattern.test(deepLink)) {
      return deepLink.replace(pattern, replacement);
    }
  }
  return deepLink;
}

function handleNotificationOpen(remoteMessage) {
  const deepLink = remoteMessage?.data?.deepLink;
  const screenName = mapDeepLinkToRoute(deepLink);
  if (screenName) navigate(screenName);
}

/**
 * Registers foreground display, background/quit-state tap-to-deep-link, and
 * cold-start tap handling. Call once from the app root; returns an
 * unsubscribe function.
 */
export function addNotificationResponseListener() {
  const unsubForeground = messaging().onMessage(displayForegroundNotification);

  // Local (notifee-displayed) notification tapped while the app is
  // foregrounded or backgrounded.
  const unsubLocalTap = notifee.onForegroundEvent(({ type, detail }) => {
    if (type === EventType.PRESS) handleNotificationOpen({ data: detail.notification?.data });
  });

  // App was backgrounded (not quit) and the user tapped the native FCM
  // notification to bring it to the foreground.
  const unsubBackgroundTap = messaging().onNotificationOpenedApp(handleNotificationOpen);

  // Cold start: app was quit and launched by tapping a notification. This
  // was previously unhandled (expo-notifications only wired warm taps).
  messaging()
    .getInitialNotification()
    .then((remoteMessage) => {
      if (remoteMessage) handleNotificationOpen(remoteMessage);
    });

  return {
    remove() {
      unsubForeground();
      unsubLocalTap();
      unsubBackgroundTap();
    },
  };
}
