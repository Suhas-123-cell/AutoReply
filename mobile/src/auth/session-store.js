/**
 * Secure storage for the mobile session and its cached profile.
 * AuthContext rechecks the session online and requires an explicitly verified
 * phone before restoring workspace data from a cached profile.
 */
import * as SecureStore from "../lib/secure-kv";

const TOKEN_KEY = "autoreply.sessionToken";
const EXPIRES_AT_KEY = "autoreply.sessionExpiresAt";
const PROFILE_KEY = "autoreply.sessionProfile";
const INVITE_KEY = "autoreply.pendingInvite";

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
  await SecureStore.deleteItemAsync(PROFILE_KEY);
}

export async function getProfile() {
  const json = await SecureStore.getItemAsync(PROFILE_KEY);
  try { return json ? JSON.parse(json) : null; } catch { return null; }
}
export async function setProfile(profile) {
  await SecureStore.setItemAsync(
    PROFILE_KEY,
    JSON.stringify({ ...profile, cachedAt: new Date().toISOString() }),
    SAVE_OPTIONS
  );
}
export async function getPendingInvite() { return SecureStore.getItemAsync(INVITE_KEY); }
export async function setPendingInvite(token) {
  if (token) await SecureStore.setItemAsync(INVITE_KEY, token, SAVE_OPTIONS);
  else await SecureStore.deleteItemAsync(INVITE_KEY);
}
