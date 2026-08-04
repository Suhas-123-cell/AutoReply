/**
 * Promise-based wrapper around expo-secure-store for the mobile session.
 * Stores only the session token + its expiry — no user/workspace data (that's
 * re-fetched from /api/mobile/auth/session on boot, see AuthContext.js).
 */
import * as SecureStore from "../lib/secure-kv";

const TOKEN_KEY = "openreply.sessionToken";
const EXPIRES_AT_KEY = "openreply.sessionExpiresAt";

const SAVE_OPTIONS = {
  accessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export async function getToken() {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function getExpiresAt() {
  return SecureStore.getItemAsync(EXPIRES_AT_KEY);
}

/** @param {{token: string, expiresAt?: string}} session */
export async function setSession({ token, expiresAt }) {
  await SecureStore.setItemAsync(TOKEN_KEY, token, SAVE_OPTIONS);
  if (expiresAt) {
    await SecureStore.setItemAsync(EXPIRES_AT_KEY, expiresAt, SAVE_OPTIONS);
  }
}

export async function clearSession() {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await SecureStore.deleteItemAsync(EXPIRES_AT_KEY);
}
