import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  allowCodeVerifyAttempt: vi.fn(),
  allowAuthAttemptByIp: vi.fn(),
  verifyCode: vi.fn(),
  verifyGoogle: vi.fn(),
  verifyApple: vi.fn(),
  provisionEmail: vi.fn(),
  provisionGoogle: vi.fn(),
  provisionApple: vi.fn(),
  createSession: vi.fn(),
  membership: vi.fn(),
  user: { findUnique: vi.fn() },
  redis: { get: vi.fn(), del: vi.fn() },
}));

vi.mock("@/lib/auth/otp-rate-limit", () => ({
  allowCodeVerifyAttempt: mocks.allowCodeVerifyAttempt,
  allowAuthAttemptByIp: mocks.allowAuthAttemptByIp,
}));
vi.mock("@/lib/auth/mobile-codes", () => ({
  normalizeEmail: (email: string) => email.trim().toLowerCase(),
  verifyMobileAuthCode: mocks.verifyCode,
}));
vi.mock("@/lib/auth/google", () => ({
  isGoogleSignInConfigured: () => true,
  verifyGoogleIdToken: mocks.verifyGoogle,
}));
vi.mock("@/lib/auth/apple", () => ({ verifyAppleIdToken: mocks.verifyApple }));
vi.mock("@/lib/env", () => ({ getAppleBundleId: () => "com.autoreply.app" }));
vi.mock("@/lib/auth/provision", () => ({
  provisionUserByEmail: mocks.provisionEmail,
  provisionUserByGoogleAccount: mocks.provisionGoogle,
  provisionUserByAppleAccount: mocks.provisionApple,
}));
vi.mock("@/lib/auth/mobile-session", () => ({ createMobileSession: mocks.createSession }));
vi.mock("@/lib/workspace", () => ({ getWorkspaceMembership: mocks.membership }));
vi.mock("@/lib/db/client", () => ({ prisma: { user: mocks.user } }));
vi.mock("@/lib/queue/client", () => ({ getRedisConnection: () => mocks.redis }));
vi.mock("@/lib/firebase/admin", () => ({ getFirebaseAuth: vi.fn() }));
vi.mock("@/lib/http/client-ip", () => ({ getClientIp: () => "203.0.113.1" }));

import { POST as emailSignIn } from "@/app/api/mobile/auth/verify-code/route";
import { POST as googleSignIn } from "@/app/api/mobile/auth/google/route";
import { POST as appleSignIn } from "@/app/api/mobile/auth/apple/route";
import { POST as instagramSignIn } from "@/app/api/mobile/auth/instagram/exchange/route";

const user = {
  id: "user_1",
  email: "member@example.com",
  name: "Member",
  phone: null as string | null,
  phoneVerified: null as Date | null,
};
const workspace = { id: "workspace_1", name: "Private workspace" };
const expires = new Date("2026-11-03T00:00:00Z");
const signIns = [
  { name: "email", route: emailSignIn, body: { email: user.email, code: "123456", platform: "ios" } },
  { name: "Google", route: googleSignIn, body: { idToken: "google-token", platform: "android" } },
  { name: "Apple", route: appleSignIn, body: { idToken: "apple-token", name: user.name } },
  { name: "Instagram", route: instagramSignIn, body: { code: "exchange-code", platform: "ios" } },
];

function request(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/mobile/auth", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function provisionPhoneStatus(phone: string | null, phoneVerified: Date | null) {
  const currentUser = { ...user, phone, phoneVerified };
  for (const provision of [mocks.provisionEmail, mocks.provisionGoogle, mocks.provisionApple]) {
    provision.mockResolvedValue({ user: currentUser, workspace });
  }
  mocks.user.findUnique.mockResolvedValue(currentUser);
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.allowCodeVerifyAttempt.mockResolvedValue(true);
  mocks.allowAuthAttemptByIp.mockResolvedValue(true);
  mocks.verifyCode.mockResolvedValue({ ok: true });
  mocks.verifyGoogle.mockResolvedValue({
    googleSub: "google_1", email: user.email, emailVerified: true, name: user.name,
  });
  mocks.verifyApple.mockResolvedValue({
    appleSub: "apple_1", email: user.email, emailVerified: true,
  });
  mocks.createSession.mockResolvedValue({ sessionToken: "pending-session-token", expires });
  mocks.membership.mockResolvedValue({ role: "OWNER", workspace });
  mocks.redis.get.mockResolvedValue(user.id);
  mocks.redis.del.mockResolvedValue(1);
  provisionPhoneStatus(null, null);
});

describe("mobile sign-in phone enrollment contract", () => {
  it.each(signIns)("$name sign-in issues a pending session without workspace access", async ({ route, body }) => {
    const response = await route(request(body));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      success: true,
      data: {
        sessionToken: "pending-session-token",
        expiresAt: expires.toISOString(),
        user: { ...user, phoneVerified: false },
        workspace: null,
        role: null,
        phoneVerificationRequired: true,
      },
    });
    expect(JSON.stringify(payload)).not.toContain(workspace.id);
    expect(JSON.stringify(payload)).not.toContain(workspace.name);
    expect(mocks.createSession).toHaveBeenCalledWith(expect.objectContaining({ userId: user.id }));
  });

  it.each(signIns)("$name sign-in requires verification when a phone exists without a verification date", async ({ route, body }) => {
    provisionPhoneStatus("+919876543210", null);

    const response = await route(request(body));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data).toMatchObject({
      user: { phone: "+919876543210", phoneVerified: false },
      workspace: null,
      role: null,
      phoneVerificationRequired: true,
    });
  });

  it.each(signIns)("$name sign-in restores workspace access for an already verified account", async ({ route, body }) => {
    provisionPhoneStatus("+919876543210", new Date("2026-10-03T00:00:00Z"));

    const response = await route(request(body));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      data: {
        sessionToken: "pending-session-token",
        expiresAt: expires.toISOString(),
        user: { ...user, phone: "+919876543210", phoneVerified: true },
        workspace,
        role: "OWNER",
        phoneVerificationRequired: false,
      },
    });
  });
});
