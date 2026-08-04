/**
 * Multi-key string KV on top of react-native-keychain, matching the
 * getItemAsync/setItemAsync/deleteItemAsync shape the app previously used via
 * expo-secure-store. Each key is stored under its own keychain "service" so
 * unrelated values (session token, biometric-lock flag, push token, ...)
 * don't collide.
 */
import * as Keychain from "react-native-keychain";

export const WHEN_UNLOCKED_THIS_DEVICE_ONLY = Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY;

export async function getItemAsync(key) {
  const credentials = await Keychain.getGenericPassword({ service: key });
  return credentials ? credentials.password : null;
}

export async function setItemAsync(key, value, options = {}) {
  await Keychain.setGenericPassword(key, value, { service: key, ...options });
}

export async function deleteItemAsync(key) {
  await Keychain.resetGenericPassword({ service: key });
}
