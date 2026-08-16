import { useEffect, useState } from "react";
import { ActivityIndicator, Platform, Pressable, Text, View } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import DeviceInfo from "react-native-device-info";
import { apiFetch, ApiError } from "../src/api/client";
import { useAuth } from "../src/auth/AuthContext";
import { colors } from "../src/ui/tokens";

// Deep-link landing screen for autoreply://ig-connect?status=...&reason=...
// (Meta -> /api/instagram/callback -> this route, opened via
// react-native-inappbrowser-reborn's openAuth from either the Settings
// screen — connecting an account to an already-signed-in workspace — or
// sign-in.jsx's "Continue with Instagram" — a brand-new account, no prior
// session). Those two cases are told apart by whether a `code` param is
// present: only the sign-in case produces one (see
// app/api/instagram/callback/route.ts's mobile-signup branch).
const STATUS_COPY = {
  connected: { title: "Instagram connected", tone: "success" },
  already_connected: { title: "Account already connected", tone: "success" },
  denied: { title: "Connection cancelled", tone: "error" },
  invalid: { title: "Something went wrong", tone: "error" },
  forbidden: { title: "Not allowed", tone: "error" },
  failed: { title: "Connection failed", tone: "error" },
};

export default function IgConnectScreen() {
  const { status, reason, code } = useRoute().params ?? {};
  const navigation = useNavigation();
  const { isSignedIn, signIn } = useAuth();
  const [exchanging, setExchanging] = useState(Boolean(code));
  const [exchangeError, setExchangeError] = useState(null);

  useEffect(() => {
    if (!code) return;
    let cancelled = false;

    (async () => {
      try {
        const deviceName = await DeviceInfo.getDeviceName().catch(() => undefined);
        const data = await apiFetch("/api/mobile/auth/instagram/exchange", {
          method: "POST",
          body: {
            code,
            platform: Platform.OS,
            deviceName,
            appVersion: DeviceInfo.getVersion(),
          },
        });
        if (cancelled) return;
        await signIn(data);
        // No manual navigation — RootNavigator swaps to AppTabs once
        // isSignedIn flips true, same as email/phone verify.
      } catch (err) {
        if (cancelled) return;
        setExchangeError(
          err instanceof ApiError ? err.message : "Couldn't finish signing in. Try again."
        );
      } finally {
        if (!cancelled) setExchanging(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [code, signIn]);

  const copy = exchangeError
    ? { title: "Sign-in failed", tone: "error" }
    : STATUS_COPY[status] ?? { title: "Unknown status", tone: "error" };
  const displayedReason = exchangeError ?? reason;

  const handleContinue = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      // No back stack (e.g. this deep link was the very first screen to
      // mount) — land on whichever root entry point matches auth state,
      // same as the old router.replace("/(app)/dashboard") fallback.
      navigation.reset({ index: 0, routes: [{ name: isSignedIn ? "AppTabs" : "AuthStack" }] });
    }
  };

  if (exchanging) {
    return (
      <View className="flex-1 items-center justify-center bg-background px-6">
        <ActivityIndicator color={colors.foreground} />
        <Text className="mt-4 text-muted">Finishing sign-in…</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 items-center justify-center bg-background px-6">
      <Text
        className={`mb-2 text-xl font-bold ${
          copy.tone === "success" ? "text-success" : "text-error"
        }`}
      >
        {copy.title}
      </Text>
      {displayedReason ? (
        <Text className="mb-6 text-center text-sm text-muted">{displayedReason}</Text>
      ) : null}

      <Pressable onPress={handleContinue} className="rounded-lg bg-accent px-6 py-3">
        <Text className="font-semibold text-background">Continue</Text>
      </Pressable>
    </View>
  );
}
