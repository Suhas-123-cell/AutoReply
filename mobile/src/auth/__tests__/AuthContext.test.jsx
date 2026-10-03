import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act, cleanup, render, waitFor } from "@testing-library/react-native";
import { AuthProvider, useAuth } from "../AuthContext";
import * as sessionStore from "../session-store";
import { apiFetch, ApiError, setWorkspaceId, setOfflineMode } from "../../api/client";
import { clearWorkspaceCache, startWorkspaceCache } from "../../query/persistence";

jest.mock("../session-store", () => ({
  getPendingInvite: jest.fn(), getToken: jest.fn(), getExpiresAt: jest.fn(),
  getProfile: jest.fn(), setProfile: jest.fn(), setSession: jest.fn(),
  clearSession: jest.fn(), setPendingInvite: jest.fn(),
}));
jest.mock("../../api/client", () => ({
  ApiError: class extends Error { constructor(status, message) { super(message); this.status = status; } },
  apiFetch: jest.fn(), setWorkspaceId: jest.fn(), setOfflineMode: jest.fn(),
  setAuthToken: jest.fn(), registerUnauthorizedHandler: jest.fn(),
}));
jest.mock("../../query/client", () => ({ queryClient: { cancelQueries: jest.fn(), clear: jest.fn() } }));
jest.mock("../../query/persistence", () => ({ clearWorkspaceCache: jest.fn(), startWorkspaceCache: jest.fn() }));
jest.mock("../../store/campaignWizardStore", () => ({ useCampaignWizardStore: { getState: () => ({ reset: jest.fn() }) } }));

let latestAuth;
function Probe() { latestAuth = useAuth(); return null; }

const verified = {
  user: { id: "user-1", email: "owner@example.com", phone: "+919876543210", phoneVerified: true },
  phoneVerificationRequired: false,
  workspace: { id: "workspace-1", name: "Workspace" }, role: "OWNER",
};
const pending = {
  user: { id: "user-1", email: "owner@example.com", phone: null, phoneVerified: false },
  phoneVerificationRequired: true, workspace: null, role: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  latestAuth = null;
  sessionStore.getToken.mockResolvedValue(null);
  sessionStore.getExpiresAt.mockResolvedValue(new Date(Date.now() + 60 * 60 * 1000).toISOString());
  sessionStore.getPendingInvite.mockResolvedValue(null);
});
afterEach(cleanup);

async function start() {
  render(<AuthProvider><Probe /></AuthProvider>);
  await waitFor(() => expect(latestAuth.isLoading).toBe(false));
}

describe("phone enrollment sessions", () => {
  it("keeps an app bearer token while withholding workspace and caches", async () => {
    await start();
    await act(async () => latestAuth.signIn({ ...pending, sessionToken: "pending-token", expiresAt: "2030-01-01" }));
    expect(sessionStore.setSession).toHaveBeenCalledWith({ token: "pending-token", expiresAt: "2030-01-01" });
    expect(latestAuth.isSignedIn).toBe(true);
    expect(latestAuth.isAuthorized).toBe(false);
    expect(latestAuth.phoneVerificationRequired).toBe(true);
    expect(latestAuth.workspace).toBeNull();
    expect(setWorkspaceId).toHaveBeenLastCalledWith(null);
    expect(startWorkspaceCache).not.toHaveBeenCalled();
    expect(clearWorkspaceCache).toHaveBeenCalled();
  });

  it("opens the workspace only after the server refresh reports a verified phone", async () => {
    await start();
    await act(async () => latestAuth.signIn({ ...pending, sessionToken: "pending-token" }));
    apiFetch.mockResolvedValue(verified);
    await act(async () => latestAuth.refreshSession());
    expect(latestAuth.isAuthorized).toBe(true);
    expect(latestAuth.phoneVerificationRequired).toBe(false);
    expect(startWorkspaceCache).toHaveBeenCalledWith("user-1:workspace-1:OWNER", false);
  });

  it("removes cached grants when an online session requires phone verification", async () => {
    sessionStore.getToken.mockResolvedValue("pending-token");
    sessionStore.getProfile.mockResolvedValue({ ...verified, cachedAt: new Date().toISOString() });
    apiFetch.mockResolvedValue(pending);
    await start();
    expect(latestAuth.isAuthorized).toBe(false);
    expect(latestAuth.workspace).toBeNull();
    expect(startWorkspaceCache).not.toHaveBeenCalled();
    expect(clearWorkspaceCache).toHaveBeenCalled();
  });

  it("cannot restore workspace access from a legacy offline profile", async () => {
    sessionStore.getToken.mockResolvedValue("legacy-token");
    sessionStore.getProfile.mockResolvedValue({
      user: { id: "user-1", email: "owner@example.com" },
      workspace: verified.workspace, role: "OWNER", cachedAt: new Date().toISOString(),
    });
    apiFetch.mockRejectedValue(new ApiError(0, "Offline"));
    await start();
    expect(latestAuth.isSignedIn).toBe(true);
    expect(latestAuth.isAuthorized).toBe(false);
    expect(latestAuth.workspace).toBeNull();
    expect(startWorkspaceCache).not.toHaveBeenCalled();
    expect(setOfflineMode).toHaveBeenLastCalledWith(false);
  });

  it("restores offline totals only for an explicit verified phone profile", async () => {
    sessionStore.getToken.mockResolvedValue("verified-token");
    sessionStore.getProfile.mockResolvedValue({ ...verified, cachedAt: new Date().toISOString() });
    apiFetch.mockRejectedValue(new ApiError(0, "Offline"));
    await start();
    expect(latestAuth.isAuthorized).toBe(true);
    expect(latestAuth.isOffline).toBe(true);
    expect(startWorkspaceCache).toHaveBeenCalledWith("user-1:workspace-1:OWNER", true);
  });
});
