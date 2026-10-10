/**
 * Instagram OAuth for both "Continue with Instagram" (sign-in) and connecting
 * an account to the current workspace.
 *
 * The server's start route returns the authorize URL plus a verifier. The
 * verifier stays on this device; Meta's redirect comes back as
 * autoreply://ig-connect?status=authorized&result=<one-time code>, and only
 * the code together with this device's verifier signs in or connects. A link
 * crafted by someone else (or an authorize URL they forwarded) can't be
 * completed here.
 *
 * Both the in-app browser's return value and the deep-link screen
 * (app/ig-connect.jsx) can see the same redirect; completeInstagramFlow is
 * memoized per result code so it runs once and both callers share the outcome.
 */
import { Linking, Platform } from "react-native";
import InAppBrowser from "react-native-inappbrowser-reborn";
import DeviceInfo from "react-native-device-info";
import { apiFetch, ApiError } from "../api/client";
import * as SecureStore from "../lib/secure-kv";

const PENDING_KEY = "autoreply.igOAuthPending";
const RETURN_URL = "autoreply://ig-connect";
// Matches the server's flow lifetime.
const PENDING_TTL_MS = 10 * 60 * 1000;

const inFlight = new Map();

/** Parses autoreply://ig-connect?status=…&reason=…&result=… */
export function parseIgConnectUrl(url) {
  const query = (url ?? "").split("?")[1] ?? "";
  const params = {};
  for (const pair of query.split("&")) {
    if (!pair) continue;
    const [key, value = ""] = pair.split("=");
    try {
      params[decodeURIComponent(key)] = decodeURIComponent(value.replace(/\+/g, " "));
    } catch {
      // Malformed escape — ignore the pair.
    }
  }
  return { status: params.status, reason: params.reason, result: params.result };
}

async function savePending(kind, verifier) {
  await SecureStore.setItemAsync(
    PENDING_KEY,
    JSON.stringify({ kind, verifier, createdAt: Date.now() }),
    { accessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }
  );
}

async function takePending() {
  const raw = await SecureStore.getItemAsync(PENDING_KEY);
  await SecureStore.deleteItemAsync(PENDING_KEY);
  if (!raw) return null;
  try {
    const pending = JSON.parse(raw);
    if (Date.now() - pending.createdAt > PENDING_TTL_MS) return null;
    return pending;
  } catch {
    return null;
  }
}

/**
 * Opens Meta's authorize page. Resolves with the parsed redirect when the
 * in-app browser returns it, or null when the user dismissed it (or the
 * system browser was used, in which case app/ig-connect.jsx finishes).
 * @param {"signup" | "connect"} kind
 */
export async function startInstagramFlow(kind) {
  const path =
    kind === "signup" ? "/api/mobile/auth/instagram/start" : "/api/mobile/instagram/connect";
  const { authorizeUrl, verifier } = await apiFetch(path);
  await savePending(kind, verifier);

  if (await InAppBrowser.isAvailable()) {
    const result = await InAppBrowser.openAuth(authorizeUrl, RETURN_URL, {
      ephemeralWebSession: false,
    });
    return result?.type === "success" && result.url ? parseIgConnectUrl(result.url) : null;
  }
  await Linking.openURL(authorizeUrl);
  return null;
}

async function redeem(result) {
  const pending = await takePending();
  if (!pending) {
    throw new ApiError(0, "This Instagram link didn't start on this device. Try again from the app.");
  }
  if (pending.kind === "signup") {
    const deviceName = await DeviceInfo.getDeviceName().catch(() => undefined);
    const data = await apiFetch("/api/mobile/auth/instagram/exchange", {
      method: "POST",
      body: {
        code: result,
        verifier: pending.verifier,
        platform: Platform.OS,
        deviceName,
        appVersion: DeviceInfo.getVersion(),
      },
    });
    return { kind: "signup", data };
  }
  const data = await apiFetch("/api/mobile/instagram/complete", {
    method: "POST",
    body: { result, verifier: pending.verifier },
  });
  return { kind: "connect", data };
}

/**
 * Finishes an authorized redirect. `first` is true for exactly one caller per
 * result, so only that caller signs in or shows the outcome.
 * @returns {Promise<{kind: "signup" | "connect", data: object, first: boolean}>}
 */
export function completeInstagramFlow({ status, reason, result }) {
  if (status !== "authorized" || !result) {
    const message =
      reason ||
      (status === "denied"
        ? "Instagram access was cancelled."
        : "Instagram didn't finish connecting. Try again.");
    return Promise.reject(new ApiError(0, message));
  }
  const existing = inFlight.get(result);
  if (existing) return existing.then((outcome) => ({ ...outcome, first: false }));

  const promise = redeem(result);
  inFlight.set(result, promise);
  return promise.then((outcome) => ({ ...outcome, first: true }));
}

const CONNECT_OUTCOME_COPY = {
  connected: "Instagram connected",
  already_connected: "This Instagram account is connected to another workspace",
  forbidden: "You can't connect Instagram for this workspace",
  failed: "Connection failed",
};

/** Title and detail for a connect outcome returned by the complete route. */
export function describeConnectOutcome(data) {
  return {
    ok: data?.status === "connected",
    title: CONNECT_OUTCOME_COPY[data?.status] ?? "Connection failed",
    reason: data?.reason ?? null,
  };
}
