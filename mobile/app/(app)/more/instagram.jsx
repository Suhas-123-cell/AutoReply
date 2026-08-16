import { useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import InAppBrowser from "react-native-inappbrowser-reborn";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiError } from "../../../src/api/client";
import { useAuth } from "../../../src/auth/AuthContext";
import { canManageWorkspace } from "../../../src/lib/workspace-access";
import { confirmAsync } from "../../../src/lib/confirm";
import Card from "../../../src/ui/Card";
import EmptyState from "../../../src/ui/EmptyState";
import Skeleton from "../../../src/ui/Skeleton";

export default function InstagramSettingsScreen() {
  const { role } = useAuth();
  const canManage = canManageWorkspace(role);
  const queryClient = useQueryClient();
  const [connecting, setConnecting] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["instagram-accounts"],
    queryFn: () => apiFetch("/api/instagram/accounts"),
  });
  const accounts = data?.instagramAccounts ?? [];

  const disconnect = useMutation({
    mutationFn: (instagramAccountId) =>
      apiFetch("/api/instagram/disconnect", { method: "POST", body: { instagramAccountId } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["instagram-accounts"] }),
    onError: () => Alert.alert("Couldn't disconnect", "Please try again."),
  });

  // openAuthSessionAsync resolves once the in-app browser redirects back to
  // autoreply://ig-connect (handled by app/ig-connect.jsx), whether that's a
  // success, denial, or failure — either way, refetch so the list reflects
  // whatever actually happened server-side.
  const handleConnect = async () => {
    setConnecting(true);
    try {
      const { authorizeUrl } = await apiFetch("/api/mobile/instagram/connect");
      if (await InAppBrowser.isAvailable()) {
        await InAppBrowser.openAuth(authorizeUrl, "autoreply://ig-connect", {
          ephemeralWebSession: false,
        });
      } else {
        await InAppBrowser.open(authorizeUrl);
      }
    } catch (err) {
      Alert.alert(
        "Couldn't start connection",
        err instanceof ApiError ? err.message : "Please try again."
      );
    } finally {
      setConnecting(false);
      queryClient.invalidateQueries({ queryKey: ["instagram-accounts"] });
    }
  };

  const handleDisconnect = async (account) => {
    const ok = await confirmAsync(
      "Disconnect Instagram?",
      `Campaigns for @${account.username} will stop sending DMs.`
    );
    if (ok) disconnect.mutate(account.id);
  };

  if (isLoading) {
    return (
      <View className="flex-1 gap-3 bg-background p-4">
        <Skeleton className="h-20" />
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-background" contentContainerStyle={{ padding: 16, gap: 12 }}>
      {accounts.length === 0 ? (
        <EmptyState
          title="No accounts connected"
          subtitle={
            canManage
              ? "Connect Instagram to launch campaigns."
              : "Ask an owner or admin to connect Instagram."
          }
        />
      ) : (
        accounts.map((account) => (
          <Card key={account.id}>
            <Text className="text-sm font-semibold text-foreground">@{account.username}</Text>
            <Text className="mt-1 text-xs text-muted">ID: {account.instagramId}</Text>
            {canManage ? (
              <Pressable onPress={() => handleDisconnect(account)} className="mt-3 self-start">
                <Text className="text-xs font-medium text-error">Disconnect</Text>
              </Pressable>
            ) : null}
          </Card>
        ))
      )}

      {canManage ? (
        <Pressable
          onPress={handleConnect}
          disabled={connecting}
          className={`rounded-lg px-4 py-3 ${connecting ? "bg-accent-hover opacity-60" : "bg-accent"}`}
        >
          <Text className="text-center text-sm font-semibold text-background">
            {connecting
              ? "Opening..."
              : accounts.length > 0
                ? "Connect another account"
                : "Connect Instagram"}
          </Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}
