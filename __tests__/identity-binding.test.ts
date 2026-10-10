import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    user: { findUnique: vi.fn(), findFirst: vi.fn() },
    account: { findUnique: vi.fn() },
    instagramAccount: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn() },
    workspaceMember: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/db/client", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/workspace-access", () => ({ canManageWorkspace: vi.fn() }));
vi.mock("@/lib/meta/client", () => ({
  getLongLivedToken: vi.fn(),
  getUserInfo: vi.fn(),
  subscribeInstagramAccountToWebhooks: vi.fn(async () => ({ success: true })),
}));
vi.mock("@/lib/workspace", () => ({ ensureWorkspaceForUser: vi.fn() }));

import { canonicalizeEmail, findUserByEmail, recordIdentityUsage } from "../lib/auth/identity";
import { signInWithInstagram } from "../lib/instagram-oauth";

const authorization = {
  instagramId: "ig_client",
  username: "client_brand",
  name: "Client",
  encryptedToken: "encrypted",
  tokenExpiresAt: "2026-12-01T00:00:00.000Z",
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("ENCRYPTION_KEY", "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef");
});

describe("mailbox identity", () => {
  it("treats aliases of one inbox as the same identity", () => {
    expect(canonicalizeEmail(" John.Doe+promo@GMail.com ")).toBe("johndoe@gmail.com");
    expect(canonicalizeEmail("johndoe@googlemail.com")).toBe("johndoe@gmail.com");
    expect(canonicalizeEmail("sam+team@outlook.com")).toBe("sam@outlook.com");
  });

  it("leaves other domains alone, where a+b@ may be a different mailbox", () => {
    expect(canonicalizeEmail("first.last+ops@agency.io")).toBe("first.last+ops@agency.io");
  });

  it("signs an alias in to the account that already owns the inbox", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.user.findFirst.mockResolvedValue({ id: "user_original" });

    expect(await findUserByEmail("john.doe+2@gmail.com")).toEqual({ id: "user_original" });
    expect(mockPrisma.user.findFirst).toHaveBeenCalledWith({
      where: { canonicalEmail: "johndoe@gmail.com" },
      orderBy: { createdAt: "asc" },
    });
  });
});

describe("free usage follows the phone and email", () => {
  it("remembers this month's usage when an account is deleted", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-10T12:00:00Z"));
    const tx = {
      workspace: { findMany: vi.fn(async () => [{ dmsSentThisPeriod: 450 }]) },
      identityUsageClaim: { findUnique: vi.fn(async () => null), upsert: vi.fn() },
    };

    await recordIdentityUsage(tx as never, {
      id: "user_1",
      phone: "+14155551234",
      email: "owner@example.com",
    });

    expect(tx.identityUsageClaim.upsert).toHaveBeenCalledTimes(2);
    const [first] = tx.identityUsageClaim.upsert.mock.calls[0] as unknown as [
      { create: { identityHash: string; dmsSentThisPeriod: number; usagePeriodStart: Date } },
    ];
    expect(first.create.dmsSentThisPeriod).toBe(450);
    expect(first.create.usagePeriodStart).toEqual(new Date("2026-10-01T00:00:00Z"));
    // Only an HMAC of the identity is kept, never the phone number itself.
    expect(first.create.identityHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(tx.identityUsageClaim.upsert.mock.calls)).not.toContain("4155551234");
    vi.useRealTimers();
  });
});

describe("Sign in with Instagram", () => {
  it("never signs a client in as the agency owner who connected their account", async () => {
    mockPrisma.account.findUnique.mockResolvedValue(null);
    mockPrisma.instagramAccount.findUnique.mockResolvedValue({
      id: "ia_1",
      workspaceId: "agency_workspace",
    });

    const result = await signInWithInstagram(authorization);

    expect(result).toEqual({ ok: false, error: expect.stringContaining("already connected") });
    expect(mockPrisma.instagramAccount.update).not.toHaveBeenCalled();
  });

  it("signs in the user whose own identity is this Instagram account", async () => {
    mockPrisma.account.findUnique.mockResolvedValue({ userId: "creator_user" });
    mockPrisma.instagramAccount.findUnique.mockResolvedValue({
      id: "ia_1",
      workspaceId: "creator_workspace",
    });
    mockPrisma.workspaceMember.findUnique.mockResolvedValue({ id: "member_1" });

    expect(await signInWithInstagram(authorization)).toEqual({ ok: true, userId: "creator_user" });
    expect(mockPrisma.instagramAccount.update).toHaveBeenCalledWith({
      where: { id: "ia_1" },
      data: {
        accessToken: "encrypted",
        tokenExpiresAt: new Date("2026-12-01T00:00:00.000Z"),
      },
    });
  });

  it("creates a new account linked to the Instagram identity on first sign-in", async () => {
    mockPrisma.account.findUnique.mockResolvedValue(null);
    mockPrisma.instagramAccount.findUnique.mockResolvedValue(null);
    const tx = {
      user: { create: vi.fn(async () => ({ id: "new_user" })) },
      account: { create: vi.fn() },
      workspace: { create: vi.fn(async () => ({ id: "new_workspace" })) },
      instagramAccount: { create: vi.fn() },
    };
    mockPrisma.$transaction.mockImplementation(async (fn: (t: typeof tx) => unknown) => fn(tx));

    expect(await signInWithInstagram(authorization)).toEqual({ ok: true, userId: "new_user" });
    expect(tx.account.create).toHaveBeenCalledWith({
      data: {
        userId: "new_user",
        type: "oauth",
        provider: "instagram",
        providerAccountId: "ig_client",
      },
    });
  });
});
