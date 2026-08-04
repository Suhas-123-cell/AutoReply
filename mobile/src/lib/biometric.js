/**
 * Thin wrapper around expo-local-authentication for the optional app-lock
 * feature (see app/(app)/more/security.jsx and the AppState gate in
 * app/_layout.jsx). The enabled/disabled preference is stored in
 * SecureStore, matching src/auth/session-store.js — the app's one existing
 * local-storage convention — rather than introducing AsyncStorage for a
 * single boolean.
 */
import ReactNativeBiometrics, { BiometryTypes } from "react-native-biometrics";
import * as SecureStore from "./secure-kv";

const LOCK_ENABLED_KEY = "openreply.biometricLockEnabled";
const rnBiometrics = new ReactNativeBiometrics();

/** True if the device has enrolled Face ID / Touch ID / fingerprint hardware. */
export async function isAvailableAsync() {
  const { available, biometryType } = await rnBiometrics.isSensorAvailable();
  return available && biometryType !== BiometryTypes.None;
}

/** Prompts Face ID / Touch ID / fingerprint. Resolves true only on success. */
export async function authenticateAsync(promptMessage = "Unlock OpenReply") {
  // No passcode fallback UI — a failed/cancelled biometric check just leaves
  // the lock screen up, where "Sign out instead" is always visible.
  const { success } = await rnBiometrics.simplePrompt({ promptMessage, cancelButtonText: "Cancel" });
  return success;
}

export async function isBiometricLockEnabled() {
  const value = await SecureStore.getItemAsync(LOCK_ENABLED_KEY);
  return value === "true";
}

export async function setBiometricLockEnabled(enabled) {
  await SecureStore.setItemAsync(LOCK_ENABLED_KEY, enabled ? "true" : "false");
}
