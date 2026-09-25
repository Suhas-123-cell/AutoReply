import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { apiFetch, ApiError, registerUnauthorizedHandler, setAuthToken, setOfflineMode, setWorkspaceId } from "../api/client";
import * as sessionStore from "./session-store";
import { queryClient } from "../query/client";
import { clearWorkspaceCache, startWorkspaceCache } from "../query/persistence";
import { useCampaignWizardStore } from "../store/campaignWizardStore";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [profile, setProfile] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSwitching, setIsSwitching] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [pendingInvitation, setPendingInvitation] = useState(null);

  const rememberInvitation = useCallback(async (token) => {
    await sessionStore.setPendingInvite(token);
    setPendingInvitation(token);
  }, []);

  const resetLocalState = useCallback(async () => {
    setProfile(null);
    setIsOffline(false);
    setOfflineMode(false);
    setAuthToken(null);
    setWorkspaceId(null);
    await queryClient.cancelQueries();
    await clearWorkspaceCache();
    queryClient.clear();
    useCampaignWizardStore.getState().reset();
  }, []);

  const applyProfile = useCallback(async (data, offline = false) => {
    setWorkspaceId(data.workspace.id);
    await startWorkspaceCache(`${data.user.id}:${data.workspace.id}:${data.role}`, offline);
    setProfile(data);
    setIsOffline(offline);
    setOfflineMode(offline);
    if (!offline) await sessionStore.setProfile(data);
  }, []);

  const signOut = useCallback(async () => {
    // Hide protected screens before clearing storage or making network calls.
    setProfile(null);
    try { await apiFetch("/api/mobile/auth/logout", { method: "POST" }); } catch {}
    await resetLocalState();
    await sessionStore.clearSession();
    await rememberInvitation(null);
  }, [resetLocalState, rememberInvitation]);

  const signIn = useCallback(async (data) => {
    await resetLocalState();
    setAuthToken(data.sessionToken);
    await sessionStore.setSession({ token: data.sessionToken, expiresAt: data.expiresAt });
    await applyProfile(data);
  }, [applyProfile, resetLocalState]);

  const refreshSession = useCallback(async () => {
    const data = await apiFetch("/api/mobile/auth/session", { skipUnauthorized: true });
    await applyProfile(data);
    return data;
  }, [applyProfile]);

  const switchWorkspace = useCallback(async (id) => {
    if (isSwitching || id === profile?.workspace.id) return;
    setIsSwitching(true);
    const oldId = profile?.workspace.id;
    try {
      await queryClient.cancelQueries();
      setWorkspaceId(id);
      const data = await apiFetch("/api/mobile/auth/session", { skipUnauthorized: true });
      await clearWorkspaceCache();
      queryClient.clear();
      useCampaignWizardStore.getState().reset();
      await applyProfile(data);
    } catch (error) {
      setWorkspaceId(oldId);
      throw error;
    } finally { setIsSwitching(false); }
  }, [profile, isSwitching, applyProfile]);

  useEffect(() => {
    registerUnauthorizedHandler(async () => {
      await resetLocalState();
    });
    return () => registerUnauthorizedHandler(null);
  }, [resetLocalState]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setPendingInvitation(await sessionStore.getPendingInvite());
        const token = await sessionStore.getToken();
        if (!token) return;
        const expiresAt = await sessionStore.getExpiresAt();
        const expiryMs = expiresAt ? Date.parse(expiresAt) : Number.NaN;
        if (!Number.isFinite(expiryMs) || expiryMs <= Date.now()) {
          throw new Error("Session expired");
        }
        const cached = await sessionStore.getProfile();
        const cachedAtMs = cached?.cachedAt ? Date.parse(cached.cachedAt) : Number.NaN;
        const cachedIsFresh =
          Number.isFinite(cachedAtMs) && Date.now() - cachedAtMs <= 24 * 60 * 60 * 1000;
        setAuthToken(token);
        setWorkspaceId(cached?.workspace?.id ?? null);
        try {
          let data;
          try {
            data = await apiFetch("/api/mobile/auth/session", { skipUnauthorized: true });
          } catch (error) {
            // A removed workspace must not strand a valid account. Retry its primary workspace.
            if (!(error instanceof ApiError) || error.status !== 401 || !cached?.workspace) throw error;
            setWorkspaceId(null);
            data = await apiFetch("/api/mobile/auth/session", { skipUnauthorized: true });
          }
          if (!cancelled) await applyProfile(data);
        } catch (error) {
          if (
            error instanceof ApiError &&
            error.status === 0 &&
            cachedIsFresh &&
            cached?.user &&
            cached?.workspace
          ) {
            if (!cancelled) await applyProfile(cached, true);
          } else { throw error; }
        }
      } catch {
        if (!cancelled) {
          await resetLocalState();
          await sessionStore.clearSession().catch(() => {});
        }
      } finally { if (!cancelled) setIsLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [applyProfile, resetLocalState]);

  const value = useMemo(() => ({
    user: profile?.user, workspace: profile?.workspace, role: profile?.role,
    isLoading, isSwitching, isOffline, isSignedIn: Boolean(profile?.user),
    signIn, signOut, switchWorkspace, refreshSession, pendingInvitation, rememberInvitation,
  }), [profile, isLoading, isSwitching, isOffline, signIn, signOut, switchWorkspace, refreshSession, pendingInvitation, rememberInvitation]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
}
