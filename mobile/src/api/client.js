/* global AbortController -- provided by RN's fetch polyfill at runtime; not in @react-native/eslint-config's known globals */
/**
 * Thin fetch wrapper for the AutoReply backend.
 *
 * - Reads the base URL from API_BASE_URL via react-native-config (a native-module-backed
 *   read of the .env file baked into the app at build time).
 * - Attaches `Authorization: Bearer <token>` from an in-memory token that is hydrated
 *   once at boot (see src/auth/AuthContext.js) — never reads SecureStore per-request.
 * - Unwraps the `{ success, data, error }` envelope used by every AutoReply API route.
 * - On a 401, clears the token + SecureStore and fires a single registered callback
 *   (single-flight guarded so N concurrent 401s only trigger one sign-out).
 */

import Config from "react-native-config";

import { clearSession } from "../auth/session-store";

const BASE_URL = Config.API_BASE_URL ?? "";

const DEFAULT_TIMEOUT_MS = 20000;
// This route can be slow (Instagram Graph API round trip); give it more room.
const LONG_TIMEOUT_ROUTES = ["/api/instagram/overview"];
const LONG_TIMEOUT_MS = 60000;

export class ApiError extends Error {
  constructor(status, message, data) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    // Populated from the failed response's `data` field when present (e.g.
    // POST /api/mobile/account's 409 carries `{ workspaces }` alongside the
    // error message) — undefined for the common case, so existing call
    // sites that only read `.status`/`.message` are unaffected.
    this.data = data;
  }
}

let inMemoryToken = null;
let unauthorizedHandler = null;
let isHandlingUnauthorized = false;

/** Called once at boot after reading SecureStore, and again on sign-in/sign-out. */
export function setAuthToken(token) {
  inMemoryToken = token;
}

/** Registered by AuthContext; invoked at most once per unauthorized "episode". */
export function registerUnauthorizedHandler(handler) {
  unauthorizedHandler = handler;
}

async function handleUnauthorized() {
  if (isHandlingUnauthorized) return;
  isHandlingUnauthorized = true;
  try {
    inMemoryToken = null;
    await clearSession();
    if (unauthorizedHandler) {
      await unauthorizedHandler();
    }
  } finally {
    isHandlingUnauthorized = false;
  }
}

/**
 * @param {string} path e.g. "/api/dashboard/stats"
 * @param {{method?: string, body?: object, headers?: object, timeoutMs?: number}} [options]
 */
export async function apiFetch(path, options = {}) {
  const { method = "GET", body, headers = {}, timeoutMs } = options;

  const timeout =
    timeoutMs ?? (LONG_TIMEOUT_ROUTES.includes(path) ? LONG_TIMEOUT_MS : DEFAULT_TIMEOUT_MS);

  const requestHeaders = {
    "Content-Type": "application/json",
    ...headers,
  };
  if (inMemoryToken) {
    requestHeaders.Authorization = `Bearer ${inMemoryToken}`;
  }

  // AbortSignal.timeout() isn't implemented by RN's fetch/Hermes polyfills
  // on every RN version (confirmed on 0.81: "AbortSignal.timeout is not a
  // function"), so this builds the same thing manually — an AbortController
  // whose signal fires after `timeout` ms — which works everywhere.
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), timeout);

  let response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: requestHeaders,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: abortController.signal,
    });
  } catch (err) {
    throw new ApiError(0, err?.message ?? "Network request failed");
  } finally {
    clearTimeout(timeoutId);
  }

  let json = null;
  try {
    json = await response.json();
  } catch {
    // Non-JSON response (e.g. a proxy error page) — fall through with json=null.
  }

  if (!response.ok || !json?.success) {
    if (response.status === 401) {
      // Fire and forget — do not block the throw on sign-out completing.
      handleUnauthorized();
    }
    throw new ApiError(
      response.status,
      json?.error ?? `Request failed (${response.status})`,
      json?.data
    );
  }

  return json.data;
}
