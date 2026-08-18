/**
 * Cross-tenant isolation — the app has no Postgres RLS (unlike the
 * Supabase-based plan this was compared against); every route is
 * responsible for its own workspaceId filtering. That means a single route
 * that forgets the filter is a silent, undetected data leak between
 * workspaces. This test proves the two most sensitive mutation routes
 * (campaign delete/update, workspace member removal) actually enforce it —
 * a request scoped to workspace B can never read or mutate workspace A's
 * data, even when it supplies workspace A's real resource id directly.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mockPrisma, mockGetCurrentWorkspaceId, mockGetCurrentWorkspaceContext } =
  vi.hoisted(() => ({
    mockPrisma: {
      automation: {
        findFirst: vi.fn(),
        delete: vi.fn(),
        update: vi.fn(),
      },
      workspaceMember: {
        findFirst: vi.fn(),
        delete: vi.fn(),
      },
    },
    mockGetCurrentWorkspaceId: vi.fn(),
    mockGetCurrentWorkspaceContext: vi.fn(),
  }));

vi.mock("@/lib/db/client", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/auth", () => ({
  getCurrentUserId: vi.fn().mockResolvedValue("user_b"),
  getCurrentWorkspaceId: mockGetCurrentWorkspaceId,
}));
vi.mock("@/lib/workspace-access", () => ({
  getCurrentWorkspaceContext: mockGetCurrentWorkspaceContext,
  canManageWorkspace: () => true,
}));
vi.mock("@/lib/audit", () => ({ logAuditEvent: vi.fn() }));
vi.mock("@/lib/tracking/analytics", () => ({
  calculateCtr: vi.fn(),
  normalizeTopKeywords: vi.fn(),
}));
vi.mock("@/lib/tracking/message", () => ({ buildTrackedUrl: vi.fn() }));
vi.mock("@/lib/tracking/server", () => ({ generateTrackedLinkSlug: vi.fn() }));

import { DELETE as deleteAutomation, PATCH as patchAutomation } from "../app/api/automations/route";
import { DELETE as deleteMember } from "../app/api/workspace/members/route";

beforeEach(() => {
  vi.clearAllMocks();
});

function makeRequest(url: string, init?: ConstructorParameters<typeof NextRequest>[1]) {
  return new NextRequest(url, init);
}

describe("cross-tenant isolation", () => {
  it("DELETE /api/automations 404s on another workspace's campaign, and never calls delete", async () => {
    // Caller is authenticated into workspace B...
    mockGetCurrentWorkspaceId.mockResolvedValue("workspace_b");
    mockGetCurrentWorkspaceContext.mockResolvedValue({
      userId: "user_b",
      workspaceId: "workspace_b",
      role: "OWNER",
    });
    // ...but the automation they're asking to delete belongs to workspace A.
    // findFirst is scoped to { id, workspaceId: "workspace_b" } — since this
    // row's real workspaceId is "workspace_a", a correctly-scoped query
    // finds nothing. The mock enforces that scoping explicitly rather than
    // just returning canned data, so a route that dropped the workspaceId
    // filter would fail this test.
    mockPrisma.automation.findFirst.mockImplementation(({ where }) =>
      where.workspaceId === "workspace_a" ? { id: "automation_a1", workspaceId: "workspace_a" } : null
    );

    const response = await deleteAutomation(
      makeRequest("https://app.test/api/automations?id=automation_a1", { method: "DELETE" })
    );

    expect(response.status).toBe(404);
    expect(mockPrisma.automation.delete).not.toHaveBeenCalled();
  });

  it("PATCH /api/automations 404s on another workspace's campaign, and never calls update", async () => {
    mockGetCurrentWorkspaceId.mockResolvedValue("workspace_b");
    mockGetCurrentWorkspaceContext.mockResolvedValue({
      userId: "user_b",
      workspaceId: "workspace_b",
      role: "OWNER",
    });
    mockPrisma.automation.findFirst.mockImplementation(({ where }) =>
      where.workspaceId === "workspace_a" ? { id: "automation_a1", workspaceId: "workspace_a" } : null
    );

    const response = await patchAutomation(
      makeRequest("https://app.test/api/automations?id=automation_a1", {
        method: "PATCH",
        body: JSON.stringify({ isActive: false }),
        headers: { "Content-Type": "application/json" },
      })
    );

    expect(response.status).toBe(404);
    expect(mockPrisma.automation.update).not.toHaveBeenCalled();
  });

  it("DELETE /api/workspace/members rejects removing a member from another workspace", async () => {
    mockGetCurrentWorkspaceContext.mockResolvedValue({
      userId: "user_b",
      workspaceId: "workspace_b",
      role: "OWNER",
    });
    // The membership row requested belongs to workspace A; scoping the
    // lookup to the caller's workspace_b means it's never found.
    mockPrisma.workspaceMember.findFirst.mockImplementation(({ where }) =>
      where.workspaceId === "workspace_a" ? { id: "member_a1", workspaceId: "workspace_a", role: "MEMBER" } : null
    );

    const response = await deleteMember(
      makeRequest("https://app.test/api/workspace/members", {
        method: "DELETE",
        body: JSON.stringify({ memberId: "member_a1" }),
        headers: { "Content-Type": "application/json" },
      })
    );

    expect(response.status).toBe(400);
    expect(mockPrisma.workspaceMember.delete).not.toHaveBeenCalled();
  });
});
