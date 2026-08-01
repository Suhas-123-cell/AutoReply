import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPrisma, mockHeadersGet } = vi.hoisted(() => ({
  mockPrisma: {
    session: {
      findUnique: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    mobileSessionMeta: {
      updateMany: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
  mockHeadersGet: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({ prisma: mockPrisma }));
vi.mock("next/headers", () => ({
  headers: async () => ({ get: mockHeadersGet }),
}));

import { getBearerSessionUserId } from "../lib/auth/bearer";
import {
  createMobileSession,
  revokeMobileSession,
} from "../lib/auth/mobile-session";

const VALID_TOKEN = "a".repeat(43); // matches randomBytes(32).toString("base64url") length
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

beforeEach(() => {
  vi.clearAllMocks();
  mockHeadersGet.mockReturnValue(null);
});

describe("getBearerSessionUserId — resolution matrix", () => {
  it("returns null with zero Prisma calls when there is no Authorization header", async () => {
    mockHeadersGet.mockReturnValue(null);

    const userId = await getBearerSessionUserId();

    expect(userId).toBeNull();
    expect(mockPrisma.session.findUnique).not.toHaveBeenCalled();
  });

  it("returns null for a non-Bearer scheme", async () => {
    mockHeadersGet.mockReturnValue("Basic dXNlcjpwYXNz");

    const userId = await getBearerSessionUserId();

    expect(userId).toBeNull();
    expect(mockPrisma.session.findUnique).not.toHaveBeenCalled();
  });

  it("returns null for a malformed token without querying the database", async () => {
    mockHeadersGet.mockReturnValue("Bearer too-short");

    const userId = await getBearerSessionUserId();

    expect(userId).toBeNull();
    expect(mockPrisma.session.findUnique).not.toHaveBeenCalled();
  });

  it("returns null for an expired session", async () => {
    mockHeadersGet.mockReturnValue(`Bearer ${VALID_TOKEN}`);
    mockPrisma.session.findUnique.mockResolvedValue({
      id: "sess_1",
      userId: "user_1",
      expires: new Date(Date.now() - 1000),
    });

    const userId = await getBearerSessionUserId();

    expect(userId).toBeNull();
  });

  it("returns the userId for a valid session", async () => {
    mockHeadersGet.mockReturnValue(`Bearer ${VALID_TOKEN}`);
    mockPrisma.session.findUnique.mockResolvedValue({
      id: "sess_1",
      userId: "user_1",
      expires: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000),
    });

    const userId = await getBearerSessionUserId();

    expect(userId).toBe("user_1");
  });
});

describe("getBearerSessionUserId — sliding refresh", () => {
  it("does not write when the session is not near expiry", async () => {
    mockHeadersGet.mockReturnValue(`Bearer ${VALID_TOKEN}`);
    mockPrisma.session.findUnique.mockResolvedValue({
      id: "sess_1",
      userId: "user_1",
      expires: new Date(Date.now() + THREE_DAYS_MS + 60_000), // just outside threshold
    });

    await getBearerSessionUserId();

    expect(mockPrisma.session.update).not.toHaveBeenCalled();
    expect(mockPrisma.mobileSessionMeta.updateMany).not.toHaveBeenCalled();
  });

  it("bumps expiry and lastSeenAt when within the refresh threshold", async () => {
    mockHeadersGet.mockReturnValue(`Bearer ${VALID_TOKEN}`);
    mockPrisma.session.findUnique.mockResolvedValue({
      id: "sess_1",
      userId: "user_1",
      expires: new Date(Date.now() + THREE_DAYS_MS - 60_000), // just inside threshold
    });

    const userId = await getBearerSessionUserId();

    expect(userId).toBe("user_1");
    expect(mockPrisma.session.update).toHaveBeenCalledWith({
      where: { id: "sess_1" },
      data: { expires: expect.any(Date) },
    });
    expect(mockPrisma.mobileSessionMeta.updateMany).toHaveBeenCalledWith({
      where: { sessionId: "sess_1" },
      data: { lastSeenAt: expect.any(Date) },
    });
  });
});

describe("createMobileSession / revokeMobileSession", () => {
  it("creates a Session row plus its MobileSessionMeta row", async () => {
    mockPrisma.session.create.mockResolvedValue({ id: "sess_1" });
    mockPrisma.mobileSessionMeta.create.mockResolvedValue({});

    const result = await createMobileSession({
      userId: "user_1",
      platform: "ios",
    });

    expect(result.sessionToken).toEqual(expect.any(String));
    expect(mockPrisma.mobileSessionMeta.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ sessionId: "sess_1", platform: "ios" }),
    });
  });

  it("is idempotent when revoking a token that no longer exists", async () => {
    mockPrisma.session.findUnique.mockResolvedValue(null);

    await expect(revokeMobileSession("dead-token")).resolves.toBeUndefined();
    expect(mockPrisma.session.delete).not.toHaveBeenCalled();
  });
});
