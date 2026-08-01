import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { Slot, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClientProvider } from "@tanstack/react-query";
import * as SplashScreen from "expo-splash-screen";
import { AuthProvider, useAuth } from "../src/auth/AuthContext";
import { queryClient } from "../src/query/client";
import { authenticateAsync, isBiometricLockEnabled } from "../src/lib/biometric";
import BiometricLockOverlay from "../src/ui/BiometricLockOverlay";
import {
  addNotificationResponseListener,
  configureAndroidChannels,
  hasSeenPushPrimer,
  markPushPrimerSeen,
} from "../src/push/register";
import PushPermissionModal from "../src/push/PushPermissionModal";
import "../global.css";

SplashScreen.preventAutoHideAsync().catch(() => {});

// Re-lock only after a "real" backgrounding, not a brief app-switcher glance.
const LOCK_AFTER_BACKGROUND_MS = 5 * 60 * 1000;

function RootNavigation() {
  const { isLoading, isSignedIn, signOut } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  const [showLock, setShowLock] = useState(false);
  const [showPushPrimer, setShowPushPrimer] = useState(false);
  const backgroundedAtRef = useRef(null);

  useEffect(() => {
    if (isLoading) return;
    SplashScreen.hideAsync().catch(() => {});

    const inAuthGroup = segments[0] === "(auth)";

    if (!isSignedIn && !inAuthGroup) {
      router.replace("/(auth)/sign-in");
    } else if (isSignedIn && inAuthGroup) {
      router.replace("/(app)/dashboard");
    }
  }, [isLoading, isSignedIn, segments, router]);

  // Android notification channels + tap-to-deep-link, registered once.
  useEffect(() => {
    configureAndroidChannels();
    const sub = addNotificationResponseListener(router);
    return () => sub.remove();
  }, [router]);

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
      <Slot />
      {showLock ? (
        <BiometricLockOverlay onUnlock={handleUnlock} onSignOut={handleSignOutFromLock} />
      ) : null}
      <PushPermissionModal visible={showPushPrimer} onDone={handlePushPrimerDone} />
    </>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <StatusBar style="light" />
            <RootNavigation />
          </AuthProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
