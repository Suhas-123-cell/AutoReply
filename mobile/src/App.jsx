/**
 * App root, previously app/_layout.jsx (expo-router's file-based root
 * layout). expo-router provided its own NavigationContainer + Slot
 * implicitly; now that's explicit here: GestureHandlerRootView ->
 * SafeAreaProvider -> QueryClientProvider -> AuthProvider -> NavigationContainer.
 *
 * Splash-screen show/hide, the biometric re-lock AppState listener, and the
 * overlay rendering (BiometricLockOverlay, PushPermissionModal) are all
 * preserved verbatim from app/_layout.jsx — only the routing/navigation
 * parts changed.
 */
import { useEffect, useRef, useState } from "react";
import { AppState, StatusBar } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClientProvider } from "@tanstack/react-query";
import BootSplash from "react-native-bootsplash";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { queryClient } from "./query/client";
import { authenticateAsync, isBiometricLockEnabled } from "./lib/biometric";
import BiometricLockOverlay from "./ui/BiometricLockOverlay";
import {
  addNotificationResponseListener,
  configureAndroidChannels,
  hasSeenPushPrimer,
  markPushPrimerSeen,
} from "./push/register";
import PushPermissionModal from "./push/PushPermissionModal";
import { navigationRef } from "./navigation/navigationRef";
import { linking } from "./navigation/linking";
import RootNavigator from "./navigation/RootNavigator";
import "../global.css";

// Re-lock only after a "real" backgrounding, not a brief app-switcher glance.
const LOCK_AFTER_BACKGROUND_MS = 5 * 60 * 1000;

function RootNavigation() {
  const { isLoading, isSignedIn, signOut } = useAuth();

  const [showLock, setShowLock] = useState(false);
  const [showPushPrimer, setShowPushPrimer] = useState(false);
  const backgroundedAtRef = useRef(null);

  useEffect(() => {
    if (isLoading) return;
    BootSplash.hide({ fade: true }).catch(() => {});
  }, [isLoading]);

  // Android notification channels + tap-to-deep-link, registered once.
  useEffect(() => {
    configureAndroidChannels();
    const sub = addNotificationResponseListener();
    return () => sub.remove();
  }, []);

  // Pre-permission push explainer: shown at most once per install, the first
  // time this device is signed in (covers both a fresh sign-in and a cold
  // boot that rehydrates an existing session — hasSeenPushPrimer() is what
  // actually gates it to "once", not the sign-in transition itself).
  useEffect(() => {
    if (!isSignedIn) return;
    let cancelled = false;
    (async () => {
      const seen = await hasSeenPushPrimer();
      if (!cancelled && !seen) setShowPushPrimer(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [isSignedIn]);

  // Opt-in biometric app lock: re-lock only after a long-enough background.
  useEffect(() => {
    const sub = AppState.addEventListener("change", async (nextState) => {
      if (nextState === "background" || nextState === "inactive") {
        if (backgroundedAtRef.current === null) backgroundedAtRef.current = Date.now();
        return;
      }
      if (nextState === "active") {
        const backgroundedAt = backgroundedAtRef.current;
        backgroundedAtRef.current = null;
        if (!backgroundedAt) return;
        if (Date.now() - backgroundedAt < LOCK_AFTER_BACKGROUND_MS) return;
        if (await isBiometricLockEnabled()) setShowLock(true);
      }
    });
    return () => sub.remove();
  }, []);

  const handlePushPrimerDone = async () => {
    await markPushPrimerSeen();
    setShowPushPrimer(false);
  };

  const handleUnlock = async () => {
    if (await authenticateAsync()) setShowLock(false);
  };

  const handleSignOutFromLock = async () => {
    setShowLock(false);
    await signOut();
  };

  // Splash screen (native) stays visible until hideAsync() above fires.
  if (isLoading) return null;

  return (
    <>
      <NavigationContainer ref={navigationRef} linking={linking}>
        <RootNavigator />
      </NavigationContainer>
      {showLock ? (
        <BiometricLockOverlay onUnlock={handleUnlock} onSignOut={handleSignOutFromLock} />
      ) : null}
      <PushPermissionModal visible={showPushPrimer} onDone={handlePushPrimerDone} />
    </>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <StatusBar barStyle="light-content" />
            <RootNavigation />
          </AuthProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
