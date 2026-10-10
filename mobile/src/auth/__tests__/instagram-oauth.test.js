import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockStore = new Map();

jest.mock("react-native-inappbrowser-reborn", () => ({
  __esModule: true,
  default: { isAvailable: jest.fn(async () => true), openAuth: jest.fn() },
}));
jest.mock("react-native-device-info", () => ({
  __esModule: true,
  default: { getDeviceName: jest.fn(async () => "Test phone"), getVersion: () => "1.0.0" },
}));
jest.mock("../../api/client", () => ({
  apiFetch: jest.fn(),
  ApiError: class ApiError extends Error {
    constructor(status, message) {
      super(message);
      this.status = status;
    }
  },
}));
jest.mock("../../lib/secure-kv", () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: "unlocked",
  getItemAsync: jest.fn(async (key) => mockStore.get(key) ?? null),
  setItemAsync: jest.fn(async (key, value) => mockStore.set(key, value)),
  deleteItemAsync: jest.fn(async (key) => mockStore.delete(key)),
}));

const InAppBrowser = require("react-native-inappbrowser-reborn").default;
const { apiFetch } = require("../../api/client");
const {
  completeInstagramFlow,
  parseIgConnectUrl,
  startInstagramFlow,
} = require("../instagram-oauth");

beforeEach(() => {
  mockStore.clear();
  jest.clearAllMocks();
});

describe("Instagram OAuth on mobile", () => {
  it("parses the callback deep link", () => {
    expect(
      parseIgConnectUrl("autoreply://ig-connect?status=authorized&result=abc_123&reason=Not+now")
    ).toEqual({ status: "authorized", result: "abc_123", reason: "Not now" });
  });

  it("redeems the redirect with the verifier this device was issued", async () => {
    apiFetch.mockResolvedValueOnce({ authorizeUrl: "https://ig/authorize", verifier: "v-1" });
    InAppBrowser.openAuth.mockResolvedValueOnce({
      type: "success",
      url: "autoreply://ig-connect?status=authorized&result=r-1",
    });
    const redirect = await startInstagramFlow("connect");

    apiFetch.mockResolvedValueOnce({ status: "connected" });
    const outcome = await completeInstagramFlow(redirect);

    expect(apiFetch).toHaveBeenLastCalledWith("/api/mobile/instagram/complete", {
      method: "POST",
      body: { result: "r-1", verifier: "v-1" },
    });
    expect(outcome).toEqual({ kind: "connect", data: { status: "connected" }, first: true });
  });

  it("refuses a link this device didn't start", async () => {
    await expect(
      completeInstagramFlow({ status: "authorized", result: "crafted" })
    ).rejects.toThrow("didn't start on this device");
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("completes once when both the browser and the deep link see the redirect", async () => {
    apiFetch.mockResolvedValueOnce({ authorizeUrl: "https://ig/authorize", verifier: "v-2" });
    InAppBrowser.openAuth.mockResolvedValueOnce({ type: "cancel" });
    await startInstagramFlow("signup");

    apiFetch.mockResolvedValueOnce({ sessionToken: "s" });
    const params = { status: "authorized", result: "r-2" };
    const [a, b] = await Promise.all([completeInstagramFlow(params), completeInstagramFlow(params)]);

    expect(apiFetch).toHaveBeenCalledTimes(2);
    expect([a.first, b.first].sort()).toEqual([false, true]);
    expect(a.kind).toBe("signup");
  });
});
