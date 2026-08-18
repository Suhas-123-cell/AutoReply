import { useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiError } from "../../src/api/client";
import { useAuth } from "../../src/auth/AuthContext";
import { colors } from "../../src/ui/tokens";

// Deep-link landing screen for autoreply://invite/:token — the only way to
// accept a workspace invite now that /invite/[token] (the old web page) is
// gone. The owner shares this link directly (no email sends it); see
// lib/workspace-invitations.ts's buildInvitationUrl.
//
// Signed-out case (a brand-new teammate, no account yet): this screen shows
// the invite preview and sends them to sign in, but there's no way to
// resume the accept step automatically afterward — RootNavigator swaps
// straight to AppTabs once isSignedIn flips true, same as every other
// sign-in path. They need to tap the invite link again post-sign-in. A
// "paste an invite link" manual fallback would close that gap but hasn't
// been built.
export default function InviteAcceptScreen() {
  const { token } = useRoute().params ?? {};
  const navigation = useNavigation();
  const { isSignedIn } = useAuth();
  const queryClient = useQueryClient();
  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState(null);
  const [accepted, setAccepted] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["invitation-preview", token],
    queryFn: () => apiFetch(`/api/workspace/invitations/${token}`),
    enabled: Boolean(token),
    retry: false,
  });

  const handleClose = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.reset({ index: 0, routes: [{ name: isSignedIn ? "AppTabs" : "AuthStack" }] });
    }
  };

  const handleAccept = async () => {
    setAccepting(true);
    setAcceptError(null);
    try {
      await apiFetch("/api/workspace/invitations/accept", {
        method: "POST",
        body: { token },
      });
      setAccepted(true);
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    } catch (err) {
      setAcceptError(err instanceof ApiError ? err.message : "Please try again.");
    } finally {
      setAccepting(false);
    }
  };

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background px-6">
        <ActivityIndicator color={colors.foreground} />
      </View>
    );
  }

  if (error || !data) {
    return (
      <View className="flex-1 items-center justify-center bg-background px-6">
        <Text className="mb-2 text-xl font-bold text-error">Invitation unavailable</Text>
        <Text className="mb-6 text-center text-sm text-muted">
          {error instanceof ApiError ? error.message : "This invite link is no longer valid."}
        </Text>
        <Pressable onPress={handleClose} className="rounded-lg bg-accent px-6 py-3">
          <Text className="font-semibold text-background">Close</Text>
        </Pressable>
      </View>
    );
  }

  if (accepted) {
    return (
      <View className="flex-1 items-center justify-center bg-background px-6">
        <Text className="mb-2 text-xl font-bold text-success">You&apos;re in</Text>
        <Text className="mb-6 text-center text-sm text-muted">
          You&apos;ve joined {data.workspaceName}.
        </Text>
        <Pressable onPress={handleClose} className="rounded-lg bg-accent px-6 py-3">
          <Text className="font-semibold text-background">Continue</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="flex-1 items-center justify-center bg-background px-6">
      <Text className="mb-2 text-xl font-bold text-foreground">
        Join {data.workspaceName}
      </Text>
      <Text className="mb-6 text-center text-sm text-muted">
        You&apos;ve been invited as a {data.role?.toLowerCase()} for {data.email}.
      </Text>
      {acceptError ? (
        <Text className="mb-4 text-center text-sm text-error">{acceptError}</Text>
      ) : null}

      {isSignedIn ? (
        <Pressable
          onPress={handleAccept}
          disabled={accepting}
          className={`rounded-lg px-6 py-3 ${accepting ? "bg-accent-hover opacity-60" : "bg-accent"}`}
        >
          <Text className="font-semibold text-background">
            {accepting ? "Joining..." : "Accept invite"}
          </Text>
        </Pressable>
      ) : (
        <>
          <Text className="mb-4 text-center text-sm text-muted">
            Sign in with {data.email} to accept, then open this invite link again.
          </Text>
          <Pressable
            onPress={() => navigation.reset({ index: 0, routes: [{ name: "AuthStack" }] })}
            className="rounded-lg bg-accent px-6 py-3"
          >
            <Text className="font-semibold text-background">Sign in</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}
