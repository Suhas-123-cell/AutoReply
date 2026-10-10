import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../src/api/client";
import { useAuth } from "../src/auth/AuthContext";
import { completeInstagramFlow, describeConnectOutcome } from "../src/auth/instagram-oauth";
import { colors } from "../src/ui/tokens";

// Deep-link landing screen for autoreply://ig-connect?status=…&result=…
// (Meta -> /api/instagram/callback -> here). The result is redeemed with the
// verifier this device kept when it started the flow — see
// src/auth/instagram-oauth.js. A link this device didn't start fails there.
export default function IgConnectScreen() {
  const { status, reason, result } = useRoute().params ?? {};
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const { isSignedIn, isAuthorized, signIn } = useAuth();
  const [outcome, setOutcome] = useState(null);

  useEffect(() => {
    let cancelled = false;
    completeInstagramFlow({ status, reason, result })
      .then(async ({ kind, data, first }) => {
        if (kind === "signup") {
          // RootNavigator opens phone verification until this account is verified.
          if (first) await signIn(data);
          if (!cancelled) setOutcome({ ok: true, title: "Signed in with Instagram", reason: null });
          return;
        }
        queryClient.invalidateQueries({ queryKey: ["instagram-accounts"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
        if (!cancelled) setOutcome(describeConnectOutcome(data));
      })
      .catch((err) => {
        if (cancelled) return;
        setOutcome({
          ok: false,
          title: "Instagram didn't connect",
          reason: err instanceof ApiError ? err.message : "Something went wrong. Try again.",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [status, reason, result, signIn, queryClient]);

  const handleContinue = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      // No back stack (this deep link was the first screen to mount) — land
      // on whichever root entry point matches auth state.
      navigation.reset({ index: 0, routes: [{ name: isAuthorized ? "AppTabs" : isSignedIn ? "VerifyPhone" : "AuthStack" }] });
    }
  };

  if (!outcome) {
    return (
      <View className="flex-1 items-center justify-center bg-background px-6">
        <ActivityIndicator color={colors.foreground} />
        <Text className="mt-4 text-muted">Finishing with Instagram…</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 items-center justify-center bg-background px-6">
      <Text
        className={`mb-2 text-center text-xl font-bold ${outcome.ok ? "text-success" : "text-error"}`}
      >
        {outcome.title}
      </Text>
      {outcome.reason ? (
        <Text className="mb-6 text-center text-sm text-muted">{outcome.reason}</Text>
      ) : null}

      <Pressable onPress={handleContinue} className="rounded-lg bg-accent px-6 py-3">
        <Text className="font-semibold text-background">Continue</Text>
      </Pressable>
    </View>
  );
}
