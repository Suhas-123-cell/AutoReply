import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockVerifyIdToken, mockPrisma, transactionClient } = vi.hoisted(() => ({
  mockVerifyIdToken: vi.fn(),
  mockPrisma: { $transaction: vi.fn() },
  transactionClient: {
    user: { findUnique: vi.fn(), updateMany: vi.fn() },
    identityUsageClaim: { findMany: vi.fn() },
    workspace: { findMany: vi.fn(), update: vi.fn() },
  },
}));

vi.mock("@/lib/db/client", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/firebase/admin", () => ({
  getFirebaseAuth: () => ({ verifyIdToken: mockVerifyIdToken }),
}));

import { attachVerifiedPhone, verifyFirebasePhoneIdToken } from "@/lib/auth/phone-verification";

const NOW = new Date("2026-10-03T10:00:00Z");
const NOW_SECONDS = Math.floor(NOW.getTime() / 1000);
const PHONE = "+14155551234";
const validIdentity = {
  firebase: { sign_in_provider: "phone" },
  phone_number: PHONE,
  auth_time: NOW_SECONDS - 30,
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("FIREBASE_AUTH_EMULATOR_HOST", "");
  vi.stubEnv("ENCRYPTION_KEY", "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef");
  mockVerifyIdToken.mockResolvedValue(validIdentity);
  mockPrisma.$transaction.mockImplementation(async (callback) => callback(transactionClient));
  transactionClient.user.findUnique.mockResolvedValue({ phone: null, phoneVerified: null, email: null });
  transactionClient.user.updateMany.mockResolvedValue({ count: 1 });
  transactionClient.identityUsageClaim.findMany.mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("Firebase phone verification", () => {
  it("accepts a recent phone sign-in only after Firebase verifies revocation", async () => {
    expect(await verifyFirebasePhoneIdToken("signed-id-token")).toBe(PHONE);
    expect(mockVerifyIdToken).toHaveBeenCalledWith("signed-id-token", true);
  });

  it.each([
    ["invalid signature", "auth/argument-error"],
    ["revoked token", "auth/id-token-revoked"],
    ["expired token", "auth/id-token-expired"],
  ])("rejects a Firebase verification failure: %s", async (_description, code) => {
    mockVerifyIdToken.mockRejectedValue(Object.assign(new Error("verification failed"), { code }));
    expect(await verifyFirebasePhoneIdToken("rejected-token")).toBeNull();
  });

  it.each([
    ["a Google sign-in with a phone claim", { ...validIdentity, firebase: { sign_in_provider: "google.com" } }],
    ["a password sign-in", { ...validIdentity, firebase: { sign_in_provider: "password" } }],
    ["a missing phone claim", { ...validIdentity, phone_number: undefined }],
    ["a phone without country code", { ...validIdentity, phone_number: "4155551234" }],
    ["a malformed phone", { ...validIdentity, phone_number: "+0123456789" }],
    ["a stale SMS sign-in", { ...validIdentity, auth_time: NOW_SECONDS - 601 }],
    ["a future sign-in outside clock tolerance", { ...validIdentity, auth_time: NOW_SECONDS + 31 }],
    ["a missing authentication time", { ...validIdentity, auth_time: undefined }],
    ["a nonnumeric authentication time", { ...validIdentity, auth_time: String(NOW_SECONDS) }],
  ])("rejects %s", async (_description, identity) => {
    mockVerifyIdToken.mockResolvedValue(identity);
    expect(await verifyFirebasePhoneIdToken("id-token")).toBeNull();
  });

  it("accepts the ten-minute boundary and permitted clock tolerance", async () => {
    mockVerifyIdToken.mockResolvedValue({ ...validIdentity, auth_time: NOW_SECONDS - 600 });
    expect(await verifyFirebasePhoneIdToken("id-token")).toBe(PHONE);
    mockVerifyIdToken.mockResolvedValue({ ...validIdentity, auth_time: NOW_SECONDS + 30 });
    expect(await verifyFirebasePhoneIdToken("id-token")).toBe(PHONE);
  });

  it("rejects emulator tokens in production before token verification", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("FIREBASE_AUTH_EMULATOR_HOST", "localhost:9099");
    expect(await verifyFirebasePhoneIdToken("emulator-token")).toBeNull();
    expect(mockVerifyIdToken).not.toHaveBeenCalled();
  });
});

describe("verified phone account binding", () => {
  it("attaches a number only while the authenticated account remains unverified", async () => {
    expect(await attachVerifiedPhone("user_1", PHONE)).toEqual({ ok: true });
    expect(transactionClient.user.findUnique).toHaveBeenCalledWith({
      where: { id: "user_1" }, select: { phone: true, phoneVerified: true, email: true },
    });
    expect(transactionClient.user.updateMany).toHaveBeenCalledWith({
      where: { id: "user_1", phoneVerified: null },
      data: { phone: PHONE, phoneVerified: NOW },
    });
  });

  it("rejects a number already bound to another account through the unique index", async () => {
    transactionClient.user.updateMany.mockRejectedValue({ code: "P2002" });
    expect(await attachVerifiedPhone("user_other_email", PHONE)).toEqual({ ok: false, reason: "phone_in_use" });
  });

  it("allows a retry of the same verified number without writing", async () => {
    transactionClient.user.findUnique.mockResolvedValue({ phone: PHONE, phoneVerified: NOW });
    expect(await attachVerifiedPhone("user_1", PHONE)).toEqual({ ok: true });
    expect(transactionClient.user.updateMany).not.toHaveBeenCalled();
  });

  it("prevents replacing an already verified number", async () => {
    transactionClient.user.findUnique.mockResolvedValue({ phone: PHONE, phoneVerified: NOW });
    expect(await attachVerifiedPhone("user_1", "+14155559876")).toEqual({ ok: false, reason: "already_verified" });
    expect(transactionClient.user.updateMany).not.toHaveBeenCalled();
  });

  it("rejects a concurrent attempt when another verification won the conditional update", async () => {
    transactionClient.user.updateMany.mockResolvedValue({ count: 0 });
    expect(await attachVerifiedPhone("user_1", PHONE)).toEqual({ ok: false, reason: "already_verified" });
  });

  it("does not write when the authenticated user was deleted", async () => {
    transactionClient.user.findUnique.mockResolvedValue(null);
    expect(await attachVerifiedPhone("deleted_user", PHONE)).toEqual({ ok: false, reason: "user_not_found" });
    expect(transactionClient.user.updateMany).not.toHaveBeenCalled();
  });

  it("propagates an unexpected database failure", async () => {
    transactionClient.user.updateMany.mockRejectedValue(new Error("database unavailable"));
    await expect(attachVerifiedPhone("user_1", PHONE)).rejects.toThrow("database unavailable");
  });

  it("carries this month's free usage from a deleted account with the same phone or email", async () => {
    transactionClient.user.findUnique.mockResolvedValue({
      phone: null, phoneVerified: null, email: "Owner+promo@gmail.com",
    });
    transactionClient.identityUsageClaim.findMany.mockResolvedValue([{ dmsSentThisPeriod: 480 }]);
    transactionClient.workspace.findMany.mockResolvedValue([
      { id: "workspace_new", usagePeriodStart: new Date("2026-10-01T00:00:00Z"), dmsSentThisPeriod: 3 },
    ]);

    expect(await attachVerifiedPhone("user_1", PHONE)).toEqual({ ok: true });

    const lookup = transactionClient.identityUsageClaim.findMany.mock.calls[0][0];
    expect(lookup.where.identityHash.in).toHaveLength(2);
    expect(lookup.where.usagePeriodStart).toEqual({ gte: new Date("2026-10-01T00:00:00Z") });
    expect(transactionClient.workspace.update).toHaveBeenCalledWith({
      where: { id: "workspace_new" },
      data: { usagePeriodStart: new Date("2026-10-01T00:00:00Z"), dmsSentThisPeriod: 480 },
    });
  });
});
