import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticatedUserId: vi.fn(),
  workspaceContext: vi.fn(),
  user: { findUnique: vi.fn() },
  instagramAccount: { count: vi.fn() },
}));

vi.mock("@/lib/auth", () => ({ getAuthenticatedUserId: mocks.authenticatedUserId }));
vi.mock("@/lib/workspace-access", () => ({ getCurrentWorkspaceContext: mocks.workspaceContext }));
vi.mock("@/lib/db/client", () => ({
  prisma: { user: mocks.user, instagramAccount: mocks.instagramAccount },
}));
vi.mock("@/lib/firebase/admin", () => ({ getFirebaseAuth: vi.fn() }));

import { GET } from "@/app/api/mobile/auth/session/route";

const user = {
  id: "user_1",
  email: "member@example.com",
  name: "Member",
  phone: null as string | null,
  phoneVerified: null as Date | null,
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.authenticatedUserId.mockResolvedValue(user.id);
  mocks.user.findUnique.mockResolvedValue({ ...user });
  mocks.workspaceContext.mockResolvedValue({
    workspaceId: "workspace_1",
    workspace: { id: "workspace_1", name: "Private workspace" },
    role: "OWNER",
  });
  mocks.instagramAccount.count.mockResolvedValue(2);
});

describe("mobile session phone enrollment", () => {
  it.each([
    { phone: null, phoneVerified: null },
    { phone: "+919876543210", phoneVerified: null },
    { phone: null, phoneVerified: new Date("2026-10-03T00:00:00Z") },
  ])("keeps an authenticated account pending until both phone fields are present: %j", async (phoneStatus) => {
    mocks.user.findUnique.mockResolvedValue({ ...user, ...phoneStatus });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: {
        user: { ...user, phone: phoneStatus.phone, phoneVerified: false },
        workspace: null,
        role: null,
        phoneVerificationRequired: true,
      },
    });
    expect(mocks.workspaceContext).not.toHaveBeenCalled();
    expect(mocks.instagramAccount.count).not.toHaveBeenCalled();
  });

  it("returns workspace access after phone verification", async () => {
    mocks.user.findUnique.mockResolvedValue({
      ...user,
      phone: "+919876543210",
      phoneVerified: new Date("2026-10-03T00:00:00Z"),
    });

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      data: {
        user: { ...user, phone: "+919876543210", phoneVerified: true },
        workspace: { id: "workspace_1", name: "Private workspace" },
        role: "OWNER",
        connectedAccountCount: 2,
        phoneVerificationRequired: false,
      },
    });
    expect(mocks.instagramAccount.count).toHaveBeenCalledWith({
      where: { workspaceId: "workspace_1" },
    });
  });

  it("rejects a request without an authenticated session", async () => {
    mocks.authenticatedUserId.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ success: false, error: "Unauthorized" });
    expect(mocks.user.findUnique).not.toHaveBeenCalled();
    expect(mocks.workspaceContext).not.toHaveBeenCalled();
    expect(mocks.instagramAccount.count).not.toHaveBeenCalled();
  });

  it("rejects a session whose account no longer exists", async () => {
    mocks.user.findUnique.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(401);
    expect(mocks.workspaceContext).not.toHaveBeenCalled();
    expect(mocks.instagramAccount.count).not.toHaveBeenCalled();
  });

  it("rejects a verified account without workspace access", async () => {
    mocks.user.findUnique.mockResolvedValue({
      ...user,
      phone: "+919876543210",
      phoneVerified: new Date(),
    });
    mocks.workspaceContext.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(401);
    expect(mocks.instagramAccount.count).not.toHaveBeenCalled();
  });
});
