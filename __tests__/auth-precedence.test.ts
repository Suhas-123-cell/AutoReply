/**
 * getCurrentUserId() precedence — the single new code path in lib/auth.ts is
 * getBearerSessionUserId() (mobile bearer tokens); it MUST be tried first but
 * MUST fall through to the original auth() cookie check byte-identically for
 * a request with no Authorization header. This test locks in that ordering
 * so a future edit can't silently make the web path start hitting
 * prisma.session directly (bypassing Auth.js) or reverse the precedence.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPrisma, mockGetBearerSessionUserId, mockAuth } = vi.hoisted(() => ({
  mockPrisma: {
    session: { findUnique: vi.fn() },
  },
  mockGetBearerSessionUserId: vi.fn(),
  mockAuth: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/auth/bearer", () => ({
  getBearerSessionUserId: mockGetBearerSessionUserId,
}));
vi.mock("next-auth", () => ({
  default: () => ({
    handlers: {},
    auth: mockAuth,
    signIn: vi.fn(),
    signOut: vi.fn(),
  }),
}));
vi.mock("next-auth/providers/resend", () => ({ default: vi.fn() }));
vi.mock("@auth/prisma-adapter", () => ({ PrismaAdapter: vi.fn() }));

vi.stubEnv("NEXTAUTH_SECRET", "test-secret-with-enough-length");

import { getCurrentUserId } from "../lib/auth";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getCurrentUserId precedence", () => {
  it("with no Authorization header, resolves via auth() and never queries Session directly", async () => {
    mockGetBearerSessionUserId.mockResolvedValue(null);
    mockAuth.mockResolvedValue({ user: { id: "user_web_1" } });

    const userId = await getCurrentUserId();

    expect(userId).toBe("user_web_1");
    expect(mockGetBearerSessionUserId).toHaveBeenCalledTimes(1);
    expect(mockAuth).toHaveBeenCalledTimes(1);
    expect(mockPrisma.session.findUnique).not.toHaveBeenCalled();
  });

  it("prefers a resolved bearer session over auth(), and never calls auth()", async () => {
    mockGetBearerSessionUserId.mockResolvedValue("user_mobile_1");
    mockAuth.mockResolvedValue({ user: { id: "user_web_1" } });

    const userId = await getCurrentUserId();

    expect(userId).toBe("user_mobile_1");
    expect(mockAuth).not.toHaveBeenCalled();
  });

  it("returns null when neither the bearer path nor auth() resolves a user", async () => {
    mockGetBearerSessionUserId.mockResolvedValue(null);
    mockAuth.mockResolvedValue(null);

    const userId = await getCurrentUserId();

    expect(userId).toBeNull();
  });
});
