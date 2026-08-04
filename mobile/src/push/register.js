/**
 * Expo push notification registration.
 *
 * The OS permission dialog is one-shot on iOS — a denial can only be reversed
 * in Settings, not by asking again — so nothing here calls
 * requestPermissionsAsync() except in direct response to the user tapping
 * "Enable notifications" on the pre-permission explainer
 * (PushPermissionModal.jsx). That modal is shown at most once per install,
 * gated by the SecureStore flag below (checked from app/_layout.jsx).
 *
 * Local storage uses SecureStore throughout, matching
 * src/auth/session-store.js — the app's one existing local-storage
 * convention — rather than introducing AsyncStorage for a few small values.
 */
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import Constants from "expo-constants";
import { apiFetch, ApiError } from "../api/client";
import { navigate } from "../navigation/navigationRef";

const PRIMER_SEEN_KEY = "openreply.pushPrimerSeen";
const TOKEN_KEY = "openreply.expoPushToken";
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
  await Notifications.setNotificationChannelAsync("leads", {
    name: "New leads",
    importance: Notifications.AndroidImportance.DEFAULT,
  });
  await Notifications.setNotificationChannelAsync("failures", {
    name: "Send failures",
    importance: Notifications.AndroidImportance.HIGH,
  });
  await Notifications.setNotificationChannelAsync("ops", {
    name: "Operational alerts",
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

/**
 * Requests OS permission (if not already granted/denied), fetches the Expo
 * push token, and registers it with the backend. Returns the token on
 * success, or null if permission was denied / the token couldn't be
 * obtained (e.g. no EAS projectId configured yet) — callers should treat
 * null as "couldn't enable, try again later" rather than throwing.
 */
export async function registerForPushNotificationsAsync() {
  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== "granted") {
    const requested = await Notifications.requestPermissionsAsync();
    status = requested.status;
  }
  if (status !== "granted") return null;

  await configureAndroidChannels();

  let expoPushToken;
  try {
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    const tokenResponse = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );
    expoPushToken = tokenResponse.data;
  } catch (err) {
    console.warn("[push] Couldn't get Expo push token:", err?.message ?? err);
    return null;
  }

  try {
    await apiFetch("/api/mobile/push/register", {
      method: "POST",
      body: {
        expoPushToken,
        platform: Platform.OS,
        appVersion: Constants.expoConfig?.version ?? undefined,
        deviceName: Constants.deviceName ?? undefined,
      },
    });
  } catch (err) {
    console.warn("[push] Registration call failed:", err instanceof ApiError ? err.message : err);
    return null;
  }

  await SecureStore.setItemAsync(TOKEN_KEY, expoPushToken);
  return expoPushToken;
}

/** Best-effort unregister (e.g. on sign-out). Never throws. */
export async function unregisterPushToken() {
  const expoPushToken = await getStoredPushToken();
  if (!expoPushToken) return;
  try {
    await apiFetch("/api/mobile/push/register", {
      method: "DELETE",
      body: { expoPushToken },
    });
  } catch {
    // Best-effort — the server-side row is harmless if left behind and will
    // self-disable the next time a push to it bounces.
  }
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

/** @param {{leadAlerts?: boolean, failureAlerts?: boolean}} prefs */
export async function updatePushPreferences(prefs) {
  const expoPushToken = await getStoredPushToken();
  if (!expoPushToken) {
    throw new Error("Notifications are not enabled on this device yet.");
  }
  await apiFetch("/api/mobile/push/preferences", {
    method: "PATCH",
    body: { expoPushToken, ...prefs },
  });
  const current = await getStoredPushPreferences();
  await storePushPreferences({ ...current, ...prefs });
}

// Maps the web-shaped deep links the backend sends (see
// lib/queue/dm-worker.ts's enqueuePush calls, e.g. "/logs?highlight=<id>")
// to the React Navigation screen name that should open. (Previously these
// mapped to expo-router paths passed to router.push(); now that navigation
// goes through the module-level navigationRef instead of a router prop —
// see navigate() in ../navigation/navigationRef — the map targets a screen
// name directly rather than a path string.)
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

/** Registers the notification-tap handler. Call once from the app root. */
export function addNotificationResponseListener() {
  return Notifications.addNotificationResponseReceivedListener((response) => {
    const deepLink = response.notification.request.content.data?.deepLink;
    const screenName = mapDeepLinkToRoute(deepLink);
    if (screenName) navigate(screenName);
  });
}
