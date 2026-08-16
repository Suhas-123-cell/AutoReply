/**
 * Verifies a Google ID token from the mobile app's native Google Sign-In.
 *
 * The mobile app never talks to Google's token endpoint directly with a
 * client secret (there isn't one for a native app) — it gets a signed ID
 * token straight from the OS-level Google Sign-In SDK and this just verifies
 * that JWT's signature and audience server-side. `google-auth-library`
 * handles Google's public-key rotation for the signature check.
 */

import { OAuth2Client } from "google-auth-library";

// Native Google Sign-In issues tokens whose `aud` is the *Web* client ID
// (the "server client ID" in Google's own docs), not the iOS/Android client
// ID — those two only identify the app to Google for the sign-in UI itself.
// Both are still accepted here in case a future web client verifies tokens
// the same way.
function getAllowedAudiences(): string[] {
  return [
    process.env.GOOGLE_WEB_CLIENT_ID,
    process.env.GOOGLE_IOS_CLIENT_ID,
    process.env.GOOGLE_ANDROID_CLIENT_ID,
  ].filter((v): v is string => Boolean(v));
}

export function isGoogleSignInConfigured(): boolean {
  return getAllowedAudiences().length > 0;
}

export interface GoogleIdentity {
  googleSub: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
}

export async function verifyGoogleIdToken(
  idToken: string
): Promise<GoogleIdentity | null> {
  const audiences = getAllowedAudiences();
  if (audiences.length === 0) return null;

  const client = new OAuth2Client();
  try {
    const ticket = await client.verifyIdToken({ idToken, audience: audiences });
    const payload = ticket.getPayload();
    if (!payload?.sub) return null;

    return {
      googleSub: payload.sub,
      email: payload.email ?? null,
      emailVerified: payload.email_verified ?? false,
      name: payload.name ?? null,
    };
  } catch {
    return null;
  }
}
