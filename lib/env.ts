import { z } from "zod";

const HEX_32_BYTE = /^[a-f0-9]{64}$/i;

function readEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} environment variable is required`);
  }
  return value;
}

export function requireEnv(name: string): string {
  return readEnv(name);
}

export function getBaseUrl(): string {
  return process.env.NEXTAUTH_URL ?? "http://localhost:3000";
}

export function getEncryptionKeyHex(): string {
  const value = readEnv("ENCRYPTION_KEY");
  if (!HEX_32_BYTE.test(value)) {
    throw new Error("ENCRYPTION_KEY must be a 32-byte hex string");
  }
  return value;
}

// Env vars that must be present before an Instagram OAuth round trip can even
// start. Checked up front so a self-hoster with a half-filled .env gets the
// variable names back instead of an unhandled throw from requireEnv().
const INSTAGRAM_OAUTH_ENV = [
  "INSTAGRAM_APP_ID",
  "INSTAGRAM_APP_SECRET",
  "ENCRYPTION_KEY",
  "NEXTAUTH_SECRET",
] as const;

export function getMissingInstagramOAuthEnv(): string[] {
  return INSTAGRAM_OAUTH_ENV.filter((name) => {
    const value = process.env[name];
    if (!value) return true;
    // A malformed key fails later inside encryptToken, after the user has
    // already round-tripped through Meta — catch the bad format here instead.
    return name === "ENCRYPTION_KEY" && !HEX_32_BYTE.test(value);
  });
}

export function getMetaGraphApiVersion(): string {
  return process.env.META_GRAPH_API_VERSION ?? "v25.0";
}

export interface FirebaseServiceAccount {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

// The Firebase console downloads a service account key as JSON; we store the
// whole blob in one env var rather than three, so there's a single secret to
// rotate. FCM delivers to both platforms from this one credential — Android
// devices register a native FCM token, iOS devices register an APNs token
// that Firebase re-wraps into an FCM token once the project's APNs key is
// configured in the console.
export function getFirebaseServiceAccount(): FirebaseServiceAccount {
  const raw = readEnv("FIREBASE_SERVICE_ACCOUNT_JSON");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON must be valid JSON");
  }

  const { project_id, client_email, private_key } = parsed as Record<string, unknown>;
  if (
    typeof project_id !== "string" ||
    typeof client_email !== "string" ||
    typeof private_key !== "string"
  ) {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT_JSON must include project_id, client_email, and private_key"
    );
  }

  return {
    projectId: project_id,
    clientEmail: client_email,
    // The JSON from the console escapes newlines as literal "\n"; the SDK
    // needs real line breaks to parse the PEM key.
    privateKey: private_key.replace(/\\n/g, "\n"),
  };
}

export const serverEnvSchema = z.object({
  NEXTAUTH_URL: z.string().url(),
  NEXTAUTH_SECRET: z.string().min(16),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  ENCRYPTION_KEY: z.string().regex(HEX_32_BYTE),
  INSTAGRAM_APP_ID: z.string().min(1),
  INSTAGRAM_APP_SECRET: z.string().min(1),
  FACEBOOK_APP_SECRET: z.string().min(1),
  WEBHOOK_VERIFY_TOKEN: z.string().min(1),
});

export function validateCoreEnv() {
  return serverEnvSchema.parse(process.env);
}
