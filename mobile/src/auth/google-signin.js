/**
 * Thin wrapper around @react-native-google-signin/google-signin.
 *
 * webClientId comes from react-native-config (baked in at build time, same
 * pattern as API_BASE_URL in src/api/client.js) — it must match the
 * backend's GOOGLE_WEB_CLIENT_ID, since that's the audience the server
 * checks the returned ID token against.
 */
import Config from "react-native-config";
import { GoogleSignin, statusCodes } from "@react-native-google-signin/google-signin";

let configured = false;

export function isGoogleSignInConfigured() {
  return Boolean(Config.GOOGLE_WEB_CLIENT_ID);
}

function ensureConfigured() {
  if (configured) return;
  GoogleSignin.configure({
    webClientId: Config.GOOGLE_WEB_CLIENT_ID,
    iosClientId: Config.GOOGLE_IOS_CLIENT_ID,
    offlineAccess: false,
  });
  configured = true;
}

/**
 * Returns the ID token to send to POST /api/mobile/auth/google, or null if
 * the user cancelled. Throws on a real failure (network, misconfiguration).
 */
export async function signInWithGoogle() {
  if (!isGoogleSignInConfigured()) {
    throw new Error(
      "Google sign-in isn't configured yet. Set GOOGLE_WEB_CLIENT_ID in the app's .env."
    );
  }
  ensureConfigured();

  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const result = await GoogleSignin.signIn();
    // v13's signIn() returns { type: "success", data } | { type: "cancelled" }.
    if (result.type === "cancelled") return null;
    return result.data.idToken;
  } catch (err) {
    if (
      err.code === statusCodes.SIGN_IN_CANCELLED ||
      err.code === statusCodes.IN_PROGRESS
    ) {
      return null;
    }
    throw err;
  }
}
