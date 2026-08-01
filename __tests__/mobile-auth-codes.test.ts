import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHmac } from "crypto";

const { mockPrisma, mockSendEmail } = vi.hoisted(() => ({
  mockPrisma: {
    mobileAuthCode: {
      updateMany: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  mockSendEmail: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/email/send", () => ({ sendEmail: mockSendEmail }));

vi.stubEnv("MOBILE_OTP_SECRET", "test-otp-secret-with-enough-length");

import {
  issueMobileAuthCode,
  verifyMobileAuthCode,
  normalizeEmail,
} from "../lib/auth/mobile-codes";

function expectedHash(email: string, code: string): string {
  return createHmac("sha256", "test-otp-secret-with-enough-length")
    .update(`${email}:${code}`)
    .digest("hex");
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.$transaction.mockImplementation(
    (ops: Promise<unknown>[]) => Promise.all(ops)
  );
  mockPrisma.mobileAuthCode.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.mobileAuthCode.create.mockResolvedValue({});
  mockPrisma.mobileAuthCode.update.mockResolvedValue({});
  mockSendEmail.mockResolvedValue(undefined);
});

describe("normalizeEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmail(" Test@Example.COM ")).toBe("test@example.com");
  });
});

describe("issueMobileAuthCode", () => {
  it("generates a zero-padded 6-digit code", async () => {
    const { code } = await issueMobileAuthCode("test@example.com");
    expect(code).toMatch(/^\d{6}$/);
  });

  it("stores an HMAC-SHA256 hash of the code, not the code itself", async () => {
    const { code } = await issueMobileAuthCode("test@example.com");
    const createCall = mockPrisma.mobileAuthCode.create.mock.calls[0][0];
    expect(createCall.data.codeHash).toBe(
      expectedHash("test@example.com", code)
    );
    expect(createCall.data.codeHash).not.toBe(code);
  });

  it("invalidates prior unconsumed codes before issuing a new one", async () => {
    await issueMobileAuthCode("test@example.com");

    expect(mockPrisma.mobileAuthCode.updateMany).toHaveBeenCalledWith({
      where: { email: "test@example.com", consumedAt: null },
      data: { consumedAt: expect.any(Date) },
    });
  });

  it("sends the code by email", async () => {
    const { code } = await issueMobileAuthCode("test@example.com");
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "test@example.com",
        subject: expect.stringContaining(code),
      })
    );
  });
});

describe("verifyMobileAuthCode", () => {
  const email = "test@example.com";

  it("rejects when no unconsumed code exists", async () => {
    mockPrisma.mobileAuthCode.findFirst.mockResolvedValue(null);

    const result = await verifyMobileAuthCode(email, "123456");
    expect(result).toEqual({ ok: false, reason: "invalid" });
  });

  it("rejects an expired code", async () => {
    mockPrisma.mobileAuthCode.findFirst.mockResolvedValue({
      id: "code_1",
      codeHash: expectedHash(email, "123456"),
      expiresAt: new Date(Date.now() - 1000),
      attempts: 0,
    });

    const result = await verifyMobileAuthCode(email, "123456");
    expect(result).toEqual({ ok: false, reason: "expired" });
  });

  it("rejects once attempts reach the cap of 5", async () => {
    mockPrisma.mobileAuthCode.findFirst.mockResolvedValue({
      id: "code_1",
      codeHash: expectedHash(email, "123456"),
      expiresAt: new Date(Date.now() + 60_000),
      attempts: 5,
    });

    const result = await verifyMobileAuthCode(email, "123456");
    expect(result).toEqual({ ok: false, reason: "too_many_attempts" });
    // Must reject before incrementing further or comparing the code.
    expect(mockPrisma.mobileAuthCode.update).not.toHaveBeenCalled();
  });

  it("counts the attempt then rejects a wrong code via timing-safe compare", async () => {
    mockPrisma.mobileAuthCode.findFirst.mockResolvedValue({
      id: "code_1",
      codeHash: expectedHash(email, "123456"),
      expiresAt: new Date(Date.now() + 60_000),
      attempts: 0,
    });

    const result = await verifyMobileAuthCode(email, "000000");

    expect(mockPrisma.mobileAuthCode.update).toHaveBeenCalledWith({
      where: { id: "code_1" },
      data: { attempts: { increment: 1 } },
    });
    expect(result).toEqual({ ok: false, reason: "invalid" });
  });

  it("accepts a correct code and atomically consumes it", async () => {
    mockPrisma.mobileAuthCode.findFirst.mockResolvedValue({
      id: "code_1",
      codeHash: expectedHash(email, "123456"),
      expiresAt: new Date(Date.now() + 60_000),
      attempts: 0,
    });
    mockPrisma.mobileAuthCode.updateMany.mockResolvedValue({ count: 1 });

    const result = await verifyMobileAuthCode(email, "123456");

    expect(result).toEqual({ ok: true });
    expect(mockPrisma.mobileAuthCode.updateMany).toHaveBeenCalledWith({
      where: { id: "code_1", consumedAt: null },
      data: { consumedAt: expect.any(Date) },
    });
  });

  it("rejects a second concurrent consume of the same code (count: 0)", async () => {
    mockPrisma.mobileAuthCode.findFirst.mockResolvedValue({
      id: "code_1",
      codeHash: expectedHash(email, "123456"),
      expiresAt: new Date(Date.now() + 60_000),
      attempts: 0,
    });
    // Simulates another concurrent request having already consumed this row.
    mockPrisma.mobileAuthCode.updateMany.mockResolvedValue({ count: 0 });

    const result = await verifyMobileAuthCode(email, "123456");
    expect(result).toEqual({ ok: false, reason: "invalid" });
  });
});
