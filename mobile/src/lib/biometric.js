/**
 * Thin wrapper around expo-local-authentication for the optional app-lock
 * feature (see app/(app)/more/security.jsx and the AppState gate in
 * app/_layout.jsx). The enabled/disabled preference is stored in
 * SecureStore, matching src/auth/session-store.js — the app's one existing
 * local-storage convention — rather than introducing AsyncStorage for a
 * single boolean.
 */
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";

const LOCK_ENABLED_KEY = "openreply.biometricLockEnabled";

/** True if the device has enrolled Face ID / Touch ID / fingerprint hardware. */
export async function isAvailableAsync() {
  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  if (!hasHardware) return false;
  const isEnrolled = await LocalAuthentication.isEnrolledAsync();
  return isEnrolled;
}

/** Prompts Face ID / Touch ID / fingerprint. Resolves true only on success. */
export async function authenticateAsync(promptMessage = "Unlock OpenReply") {
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage,
    // No passcode fallback UI — a failed/cancelled biometric check just
    // leaves the lock screen up, where "Sign out instead" is always visible.
    disableDeviceFallback: false,
    cancelLabel: "Cancel",
  });
  return result.success;
}

export async function isBiometricLockEnabled() {
  const value = await SecureStore.getItemAsync(LOCK_ENABLED_KEY);
  return value === "true";
}

export async function setBiometricLockEnabled(enabled) {
  await SecureStore.setItemAsync(LOCK_ENABLED_KEY, enabled ? "true" : "false");
}
