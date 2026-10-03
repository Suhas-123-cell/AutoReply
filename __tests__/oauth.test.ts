import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  createOAuthState,
  decryptToken,
  encryptToken,
  verifyOAuthState,
} from "../lib/meta/oauth";

// webOutcomePage lives in the callback route, which also pulls in auth(), prisma,
// and the Meta client/workspace helpers at module scope. None of those run
// inside webOutcomePage itself, but importing the module still evaluates its
// top-level imports, so they're stubbed out here purely to keep the import
// side-effect-free (mirrors how agency-workspaces.test.ts mocks
// @/lib/db/client to safely import lib/instagram-accounts).
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ prisma: {} }));
vi.mock("@/lib/instagram-accounts", () => ({
  canConnectInstagramAccount: vi.fn(),
}));
vi.mock("@/lib/meta/client", () => ({
  getLongLivedToken: vi.fn(),
  getUserInfo: vi.fn(),
  subscribeInstagramAccountToWebhooks: vi.fn(),
}));
vi.mock("@/lib/workspace-access", () => ({ canManageWorkspace: vi.fn() }));

beforeEach(() => {
  vi.stubEnv("NEXTAUTH_SECRET", "test-secret-with-enough-length");
  vi.stubEnv(
    "ENCRYPTION_KEY",
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
  );
});

describe("OAuth state and token encryption", () => {
  it("round-trips encrypted tokens", () => {
    const encrypted = encryptToken("long-lived-token");
    expect(encrypted).not.toBe("long-lived-token");
    expect(decryptToken(encrypted)).toBe("long-lived-token");
  });

  it("signs and verifies Instagram OAuth state", () => {
    const state = createOAuthState("workspace_123");
    expect(verifyOAuthState(state)?.workspaceId).toBe("workspace_123");
  });

  it("rejects tampered OAuth state", () => {
    const state = createOAuthState("workspace_123");
    expect(verifyOAuthState(`${state}tampered`)).toBeNull();
  });

  it("legacy single-arg call round-trips with no client/userId fields", () => {
    const state = createOAuthState("workspace_123");
    const parsed = verifyOAuthState(state);

    expect(parsed?.workspaceId).toBe("workspace_123");
    expect(parsed?.client).toBeUndefined();
    expect(parsed?.userId).toBeUndefined();
  });

  it("mobile call round-trips with client: 'mobile' and the given userId", () => {
    const state = createOAuthState("workspace_123", { userId: "user_456" });
    const parsed = verifyOAuthState(state);

    expect(parsed?.workspaceId).toBe("workspace_123");
    expect(parsed?.client).toBe("mobile");
    expect(parsed?.userId).toBe("user_456");
  });
});

describe("webOutcomePage", () => {
  it("renders a close-window page for web OAuth outcomes", async () => {
    const { webOutcomePage } = await import(
      "../app/api/instagram/callback/route"
    );

    const connected = webOutcomePage("connected");
    expect(connected.status).toBe(200);
    expect(connected.headers.get("content-type")).toContain("text/html");
    expect(await connected.text()).toContain("Instagram connected");

    const denied = webOutcomePage("denied");
    expect(await denied.text()).toContain("You can close this window");
  });
});
