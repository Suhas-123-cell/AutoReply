import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { getAppleBundleId } from "@/lib/env";

const appleKeys = createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"));

export interface AppleIdentity {
  appleSub: string;
  email: string | null;
  emailVerified: boolean;
}

export async function verifyAppleIdToken(
  idToken: string,
  keySet: JWTVerifyGetKey = appleKeys
): Promise<AppleIdentity | null> {
  const audience = getAppleBundleId();
  if (!audience) return null;

  try {
    const { payload } = await jwtVerify(idToken, keySet, {
      issuer: "https://appleid.apple.com",
      audience,
      algorithms: ["RS256"],
    });
    if (typeof payload.sub !== "string" || !payload.sub) return null;
    return {
      appleSub: payload.sub,
      email: typeof payload.email === "string" ? payload.email : null,
      emailVerified: payload.email_verified === true || payload.email_verified === "true",
    };
  } catch {
    return null;
  }
}
