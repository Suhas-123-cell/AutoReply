import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthenticatedUserId: vi.fn(),
  verifyFirebasePhoneIdToken: vi.fn(),
  attachVerifiedPhone: vi.fn(),
  allowPhoneVerifyAttempt: vi.fn(),
  allowAuthAttemptByIp: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getAuthenticatedUserId: mocks.getAuthenticatedUserId }));
vi.mock("@/lib/auth/phone-verification", () => ({
  verifyFirebasePhoneIdToken: mocks.verifyFirebasePhoneIdToken,
  attachVerifiedPhone: mocks.attachVerifiedPhone,
}));
vi.mock("@/lib/auth/otp-rate-limit", () => ({
  allowPhoneVerifyAttempt: mocks.allowPhoneVerifyAttempt,
  allowAuthAttemptByIp: mocks.allowAuthAttemptByIp,
}));
vi.mock("@/lib/http/client-ip", () => ({ getClientIp: () => "203.0.113.1" }));

import { POST } from "@/app/api/mobile/auth/verify-phone/route";

function request(body: unknown) {
  return new NextRequest("http://localhost/api/mobile/auth/verify-phone", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("FIREBASE_SERVICE_ACCOUNT_JSON", "test-service-account-configured");
  mocks.getAuthenticatedUserId.mockResolvedValue("current_user");
  mocks.allowPhoneVerifyAttempt.mockResolvedValue(true);
  mocks.allowAuthAttemptByIp.mockResolvedValue(true);
  mocks.verifyFirebasePhoneIdToken.mockResolvedValue("+14155551234");
  mocks.attachVerifiedPhone.mockResolvedValue({ ok: true });
});

afterEach(() => vi.unstubAllEnvs());

describe("required phone verification endpoint", () => {
  it("requires an authenticated app session before accepting a Firebase token", async () => {
    mocks.getAuthenticatedUserId.mockResolvedValue(null);
    const response = await POST(request({ idToken: "id-token" }));
    expect(response.status).toBe(401);
    expect(mocks.verifyFirebasePhoneIdToken).not.toHaveBeenCalled();
    expect(mocks.attachVerifiedPhone).not.toHaveBeenCalled();
  });

  it("fails closed when Firebase is not configured", async () => {
    vi.stubEnv("FIREBASE_SERVICE_ACCOUNT_JSON", "");
    const response = await POST(request({ idToken: "id-token" }));
    expect(response.status).toBe(503);
    expect(mocks.verifyFirebasePhoneIdToken).not.toHaveBeenCalled();
    expect(mocks.attachVerifiedPhone).not.toHaveBeenCalled();
  });

  it.each(["user", "ip"])("rejects attempts exceeding the %s limit", async (limit) => {
    if (limit === "user") mocks.allowPhoneVerifyAttempt.mockResolvedValue(false);
    else mocks.allowAuthAttemptByIp.mockResolvedValue(false);
    const response = await POST(request({ idToken: "id-token" }));
    expect(response.status).toBe(429);
    expect(mocks.verifyFirebasePhoneIdToken).not.toHaveBeenCalled();
    expect(mocks.attachVerifiedPhone).not.toHaveBeenCalled();
  });

  it.each([{}, { idToken: "" }, { idToken: 123 }, { idToken: "a".repeat(8193) }])("rejects malformed token input without writes", async (body) => {
    const response = await POST(request(body));
    expect(response.status).toBe(400);
    expect(mocks.verifyFirebasePhoneIdToken).not.toHaveBeenCalled();
    expect(mocks.attachVerifiedPhone).not.toHaveBeenCalled();
  });

  it("rejects an invalid phone identity without changing the app user", async () => {
    mocks.verifyFirebasePhoneIdToken.mockResolvedValue(null);
    const response = await POST(request({ idToken: "invalid-token" }));
    expect(response.status).toBe(400);
    expect(mocks.attachVerifiedPhone).not.toHaveBeenCalled();
  });

  it("binds only the token's verified phone to the current app user", async () => {
    const response = await POST(request({
      idToken: "verified-token", phone: "+14155559876", userId: "another_user",
    }));
    expect(response.status).toBe(200);
    expect(mocks.allowPhoneVerifyAttempt).toHaveBeenCalledWith("current_user");
    expect(mocks.allowAuthAttemptByIp).toHaveBeenCalledWith("phone-verify", "203.0.113.1", 20, 900);
    expect(mocks.verifyFirebasePhoneIdToken).toHaveBeenCalledWith("verified-token");
    expect(mocks.attachVerifiedPhone).toHaveBeenCalledWith("current_user", "+14155551234");
    expect(await response.json()).toEqual({
      success: true, data: { phone: "+14155551234", phoneVerified: true },
    });
  });

  it.each(["phone_in_use", "already_verified"])("reports a phone ownership conflict: %s", async (reason) => {
    mocks.attachVerifiedPhone.mockResolvedValue({ ok: false, reason });
    const response = await POST(request({ idToken: "verified-token" }));
    expect(response.status).toBe(409);
    expect((await response.json()).success).toBe(false);
  });

  it("rejects a session whose app user disappeared", async () => {
    mocks.attachVerifiedPhone.mockResolvedValue({ ok: false, reason: "user_not_found" });
    expect((await POST(request({ idToken: "verified-token" }))).status).toBe(401);
  });
});
