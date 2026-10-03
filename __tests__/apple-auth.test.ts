import { beforeEach, describe, expect, it, vi } from "vitest";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { verifyAppleIdToken } from "@/lib/auth/apple";

beforeEach(() => {
  vi.stubEnv("APPLE_BUNDLE_ID", "com.autoreply.app");
});

describe("Apple identity tokens", () => {
  it("accepts a signed token for the app bundle", async () => {
    const { publicKey, privateKey } = await generateKeyPair("RS256");
    const keys = createLocalJWKSet({ keys: [{ ...await exportJWK(publicKey), kid: "test", alg: "RS256" }] });
    const token = await new SignJWT({ email: "user@example.com", email_verified: "true" })
      .setProtectedHeader({ alg: "RS256", kid: "test" })
      .setIssuer("https://appleid.apple.com")
      .setAudience("com.autoreply.app")
      .setSubject("apple-user-1")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);

    expect(await verifyAppleIdToken(token, keys)).toEqual({
      appleSub: "apple-user-1", email: "user@example.com", emailVerified: true,
    });
  });

  it("rejects a token for another app", async () => {
    const { publicKey, privateKey } = await generateKeyPair("RS256");
    const keys = createLocalJWKSet({ keys: [{ ...await exportJWK(publicKey), kid: "test", alg: "RS256" }] });
    const token = await new SignJWT({ email: "user@example.com" })
      .setProtectedHeader({ alg: "RS256", kid: "test" })
      .setIssuer("https://appleid.apple.com")
      .setAudience("other.app")
      .setSubject("apple-user-1")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);

    expect(await verifyAppleIdToken(token, keys)).toBeNull();
  });

  it("rejects an expired token and missing configuration", async () => {
    const { publicKey, privateKey } = await generateKeyPair("RS256");
    const keys = createLocalJWKSet({ keys: [{ ...await exportJWK(publicKey), kid: "test", alg: "RS256" }] });
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: "RS256", kid: "test" })
      .setIssuer("https://appleid.apple.com")
      .setAudience("com.autoreply.app")
      .setSubject("apple-user-1")
      .setIssuedAt(0)
      .setExpirationTime(1)
      .sign(privateKey);

    expect(await verifyAppleIdToken(token, keys)).toBeNull();
    vi.stubEnv("APPLE_BUNDLE_ID", "");
    expect(await verifyAppleIdToken(token, keys)).toBeNull();
  });
});
