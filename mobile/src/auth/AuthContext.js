/**
 * Auth context/provider for the whole app.
 *
 * On mount: checks SecureStore for an existing token and, if present, validates
 * it against GET /api/mobile/auth/session to hydrate user/workspace/role.
 *
 * signIn(sessionData) is called by app/(auth)/verify.jsx after a successful
 * verify-code call. signOut() calls POST /api/mobile/auth/logout best-effort
 * (it's idempotent server-side) and always clears local session state.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { apiFetch, registerUnauthorizedHandler, setAuthToken } from "../api/client";
import * as sessionStore from "./session-store";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [workspace, setWorkspace] = useState(null);
  const [role, setRole] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const resetLocalState = useCallback(() => {
    setUser(null);
    setWorkspace(null);
    setRole(null);
  }, []);

  const signOut = useCallback(async () => {
    try {
      await apiFetch("/api/mobile/auth/logout", { method: "POST" });
    } catch {
      // Best-effort: proceed to clear local session even if the network call fails.
    }
    setAuthToken(null);
    await sessionStore.clearSession();
    resetLocalState();
  }, [resetLocalState]);

  const signIn = useCallback(async (sessionData) => {
    const { sessionToken, expiresAt, user: u, workspace: w, role: r } = sessionData;
    setAuthToken(sessionToken);
    await sessionStore.setSession({ token: sessionToken, expiresAt });
    setUser(u);
    setWorkspace(w);
    setRole(r);
  }, []);

  // Wire the API client's single-flight 401 handler to a local sign-out
  // (skip the /logout network call — the token is already invalid server-side).
  useEffect(() => {
    registerUnauthorizedHandler(async () => {
      await sessionStore.clearSession();
      resetLocalState();
    });
  }, [resetLocalState]);

  // Boot: hydrate token from SecureStore once, validate via /session.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // The whole body is wrapped, not just the apiFetch call — getToken()
      // (a SecureStore read) can throw on a real device (e.g. a corrupted
      // Android Keystore entry), and an unhandled rejection here previously
      // meant isLoading never got set to false, permanently stranding the
      // app on its boot/splash screen with no recovery short of a reinstall.
      try {
        const token = await sessionStore.getToken();
        if (!token) return;
        setAuthToken(token);
        const data = await apiFetch("/api/mobile/auth/session");
        if (cancelled) return;
        setUser(data.user);
        setWorkspace(data.workspace);
        setRole(data.role);
      } catch {
        if (cancelled) return;
        setAuthToken(null);
        await sessionStore.clearSession().catch(() => {});
        resetLocalState();
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [resetLocalState]);

  const value = useMemo(
    () => ({
      user,
      workspace,
      role,
      isLoading,
      isSignedIn: !!user,
      signIn,
      signOut,
    }),
    [user, workspace, role, isLoading, signIn, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
