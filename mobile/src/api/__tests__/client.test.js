/* global AbortSignal -- provided by RN's fetch polyfill at runtime; not in @react-native/eslint-config's known globals */
import { describe, it, expect, jest, beforeEach } from "@jest/globals";

jest.mock("../../auth/session-store", () => ({
  clearSession: jest.fn().mockResolvedValue(undefined),
}));

let apiFetch,
  ApiError,
  setAuthToken,
  setWorkspaceId,
  setOfflineMode,
  registerUnauthorizedHandler;

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  global.fetch = jest.fn();
  // apiFetch reads Config.API_BASE_URL (react-native-config) at module-eval
  // time; the mock at __mocks__/react-native-config.js re-exports
  // process.env, so setting this here is the same override react-native-config
  // itself does via its Podfile/Gradle .env injection at build time.
  process.env.API_BASE_URL = "https://api.test";
  // require(), not a dynamic import() — jest.resetModules() only produces a
  // fresh module instance (needed since client.js has top-level mutable
  // state like inMemoryToken) via the CJS registry Babel transforms this
  // file's ESM syntax into; dynamic import() bypasses that registry under
  // Jest's default (non --experimental-vm-modules) setup.
  const client = require("../client");
  apiFetch = client.apiFetch;
  ApiError = client.ApiError;
  setAuthToken = client.setAuthToken;
  setWorkspaceId = client.setWorkspaceId;
  setOfflineMode = client.setOfflineMode;
  registerUnauthorizedHandler = client.registerUnauthorizedHandler;
});

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

describe("apiFetch envelope handling", () => {
  it("returns the unwrapped data on success", async () => {
    global.fetch.mockResolvedValue(
      jsonResponse(200, { success: true, data: { hello: "world" } })
    );

    const result = await apiFetch("/api/dashboard/stats");

    expect(result).toEqual({ hello: "world" });
  });

  it("throws ApiError with the response's error message on success:false", async () => {
    global.fetch.mockResolvedValue(
      jsonResponse(400, { success: false, error: "Invalid input" })
    );

    await expect(
      apiFetch("/api/automations", { method: "POST", body: {} })
    ).rejects.toMatchObject({ status: 400, message: "Invalid input" });
  });

  it("carries the response's data field on the thrown ApiError", async () => {
    global.fetch.mockResolvedValue(
      jsonResponse(409, {
        success: false,
        error: "Transfer ownership first",
        data: { workspaces: [{ id: "w1", name: "Team" }] },
      })
    );

    try {
      await apiFetch("/api/mobile/account", { method: "DELETE" });
      throw new Error("expected apiFetch to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect(err.data).toEqual({ workspaces: [{ id: "w1", name: "Team" }] });
    }
  });

  it("attaches the Authorization header once a token is set", async () => {
    setAuthToken("session_abc");
    global.fetch.mockResolvedValue(
      jsonResponse(200, { success: true, data: null })
    );

    await apiFetch("/api/mobile/auth/session");

    const [, options] = global.fetch.mock.calls[0];
    expect(options.headers.Authorization).toBe("Bearer session_abc");
  });

  it("omits the Authorization header when signed out", async () => {
    setAuthToken(null);
    global.fetch.mockResolvedValue(
      jsonResponse(200, { success: true, data: null })
    );

    await apiFetch("/api/mobile/auth/request-code", {
      method: "POST",
      body: { email: "a@b.com" },
    });

    const [, options] = global.fetch.mock.calls[0];
    expect(options.headers.Authorization).toBeUndefined();
  });

  it("sends the selected workspace and mobile client headers", async () => {
    setWorkspaceId("workspace_123");
    global.fetch.mockResolvedValue(
      jsonResponse(200, { success: true, data: null })
    );

    await apiFetch("/api/automations");

    const [, options] = global.fetch.mock.calls[0];
    expect(options.headers["x-workspace-id"]).toBe("workspace_123");
    expect(options.headers["X-AutoReply-Client"]).toBe("mobile");
  });

  it("blocks mutations while using the offline cache", async () => {
    setOfflineMode(true);

    await expect(
      apiFetch("/api/automations", { method: "POST", body: {} })
    ).rejects.toMatchObject({
      status: 0,
      message: "Reconnect before making changes.",
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("rejects a response started before the workspace changed", async () => {
    let resolveFetch;
    global.fetch.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        })
    );
    setWorkspaceId("workspace_a");
    const pending = apiFetch("/api/dashboard/stats");
    setWorkspaceId("workspace_b");
    resolveFetch(jsonResponse(200, { success: true, data: { stale: true } }));

    await expect(pending).rejects.toMatchObject({
      status: 0,
      message: "Workspace changed; please retry.",
    });
  });
});

describe("401 single-flight handling", () => {
  it("fires the unauthorized handler exactly once for concurrent 401s", async () => {
    const handler = jest.fn().mockResolvedValue(undefined);
    registerUnauthorizedHandler(handler);
    global.fetch.mockResolvedValue(
      jsonResponse(401, { success: false, error: "Unauthorized" })
    );

    await Promise.allSettled([
      apiFetch("/api/dashboard/stats"),
      apiFetch("/api/logs"),
      apiFetch("/api/automations"),
    ]);

    // handleUnauthorized() is fire-and-forget from apiFetch's perspective, so
    // give its microtasks a tick to resolve before asserting.
    await new Promise((r) => setTimeout(r, 0));

    expect(handler).toHaveBeenCalledTimes(1);
  });
});

describe("per-route timeout", () => {
  it("passes an AbortSignal on every request", async () => {
    global.fetch.mockResolvedValue(
      jsonResponse(200, { success: true, data: null })
    );

    await apiFetch("/api/instagram/overview");

    const [, options] = global.fetch.mock.calls[0];
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });
});
