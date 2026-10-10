import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import {
  createOAuthState,
  decryptToken,
  encryptToken,
  verifyOAuthState,
} from "../lib/meta/oauth";

const { mockRedis, mockAuth, mockAuthorize, mockConnect } = vi.hoisted(() => {
  const store = new Map<string, string>();
  return {
    mockRedis: {
      store,
      set: vi.fn(async (key: string, value: string) => {
        store.set(key, value);
        return "OK";
      }),
      getdel: vi.fn(async (key: string) => {
        const value = store.get(key) ?? null;
        store.delete(key);
        return value;
      }),
    },
    mockAuth: vi.fn(),
    mockAuthorize: vi.fn(),
    mockConnect: vi.fn(),
  };
});

// The callback route pulls in auth(), prisma and the Instagram helpers at
// module scope; stub them so the route's own flow checks are what's tested.
vi.mock("@/lib/auth", () => ({ auth: mockAuth }));
vi.mock("@/lib/db/client", () => ({
  prisma: { operationalEvent: { create: vi.fn(async () => ({})) } },
}));
vi.mock("@/lib/queue/client", () => ({ getRedisConnection: () => mockRedis }));
vi.mock("@/lib/instagram-oauth", () => ({
  authorizeInstagram: mockAuthorize,
  connectAuthorizedInstagramAccount: mockConnect,
}));

import {
  consumeOAuthFlow,
  consumeOAuthResult,
  startOAuthFlow,
  storeOAuthResult,
} from "../lib/meta/oauth-flow";
import { GET as callback } from "../app/api/instagram/callback/route";

const authorization = {
  instagramId: "ig_1",
  username: "creator",
  name: null,
  encryptedToken: "encrypted",
  tokenExpiresAt: "2026-12-01T00:00:00.000Z",
};

function callbackRequest(state: string, cookie?: string) {
  return new NextRequest(
    `http://localhost/api/instagram/callback?code=meta-code&state=${encodeURIComponent(state)}`,
    cookie ? { headers: { cookie } } : undefined
  );
}

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
    const state = createOAuthState("flow_123", "mobile");
    expect(verifyOAuthState(state)).toMatchObject({ flowId: "flow_123", client: "mobile" });
  });

  it("rejects tampered OAuth state", () => {
    const state = createOAuthState("flow_123", "web");
    expect(verifyOAuthState(`${state}tampered`)).toBeNull();
  });
});

describe("Instagram OAuth flows", () => {
  beforeEach(() => {
    mockRedis.store.clear();
    vi.clearAllMocks();
  });

  it("consumes a flow exactly once", async () => {
    const { flowId } = await startOAuthFlow({ client: "web", userId: "u1", workspaceId: "w1" });
    expect(await consumeOAuthFlow(flowId, "web")).toEqual({
      client: "web", userId: "u1", workspaceId: "w1",
    });
    expect(await consumeOAuthFlow(flowId, "web")).toBeNull();
  });

  it("redeems a mobile result only with the verifier issued to the app", async () => {
    const { flowId, verifier } = await startOAuthFlow({ client: "mobile-signup" });
    const flow = await consumeOAuthFlow(flowId, "mobile-signup");
    if (!flow || flow.client === "web") throw new Error("expected a mobile flow");

    const wrong = await storeOAuthResult({ ...flow, ...authorization });
    expect(await consumeOAuthResult(wrong, "someone-elses-verifier", "mobile-signup")).toBeNull();
    // A failed attempt still burns the code.
    expect(await consumeOAuthResult(wrong, verifier as string, "mobile-signup")).toBeNull();

    const code = await storeOAuthResult({ ...flow, ...authorization });
    expect(await consumeOAuthResult(code, verifier as string, "mobile-signup")).toMatchObject({
      instagramId: "ig_1",
    });
  });

  it("rejects a web callback that doesn't come back to the browser that started it", async () => {
    const { state } = await startOAuthFlow({ client: "web", userId: "u1", workspaceId: "w1" });
    mockAuth.mockResolvedValue({ user: { id: "u1" } });

    const response = await callback(callbackRequest(state));

    expect(await response.text()).toContain("was not completed");
    expect(mockAuthorize).not.toHaveBeenCalled();
    expect(mockConnect).not.toHaveBeenCalled();
  });

  it("connects a web flow for the user and browser that started it, once", async () => {
    const { state, flowId } = await startOAuthFlow({ client: "web", userId: "u1", workspaceId: "w1" });
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockAuthorize.mockResolvedValue(authorization);
    mockConnect.mockResolvedValue({ status: "connected" });

    const response = await callback(callbackRequest(state, `ig_oauth_flow=${flowId}`));
    expect(await response.text()).toContain("Instagram connected");
    expect(mockConnect).toHaveBeenCalledWith({
      actingUserId: "u1", workspaceId: "w1", authorization,
    });

    const replay = await callback(callbackRequest(state, `ig_oauth_flow=${flowId}`));
    expect(await replay.text()).toContain("was not completed");
    expect(mockConnect).toHaveBeenCalledTimes(1);
  });

  it("hands a mobile flow back as a one-time result without connecting anything", async () => {
    const { state } = await startOAuthFlow({ client: "mobile", userId: "u1", workspaceId: "w1" });
    mockAuthorize.mockResolvedValue(authorization);

    const response = await callback(callbackRequest(state));
    const location = response.headers.get("location") ?? "";

    expect(location).toMatch(/^autoreply:\/\/ig-connect\?status=authorized&result=/);
    expect(mockConnect).not.toHaveBeenCalled();
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
