import { useState } from "react";
import { Alert, FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../../../src/api/client";
import { useAuth } from "../../../src/auth/AuthContext";
import { canManageWorkspace } from "../../../src/lib/workspace-access";
import { confirmAsync } from "../../../src/lib/confirm";
import Card from "../../../src/ui/Card";
import EmptyState from "../../../src/ui/EmptyState";
import Skeleton from "../../../src/ui/Skeleton";
import Toggle from "../../../src/ui/Toggle";
import { colors } from "../../../src/ui/tokens";

export default function CampaignsScreen() {
  const navigation = useNavigation();
  const { role } = useAuth();
  const canManage = canManageWorkspace(role);
  const queryClient = useQueryClient();
  const [accountId, setAccountId] = useState("all");

  const { data: accountsData } = useQuery({
    queryKey: ["instagram-accounts"],
    queryFn: () => apiFetch("/api/instagram/accounts"),
  });
  const accounts = accountsData?.instagramAccounts ?? [];

  const {
    data: campaigns,
    isLoading,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ["campaigns", accountId],
    queryFn: () => apiFetch(`/api/automations?instagramAccountId=${accountId}`),
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, isActive }) =>
      apiFetch(`/api/automations?id=${id}`, { method: "PATCH", body: { isActive } }),
    onMutate: async ({ id, isActive }) => {
      await queryClient.cancelQueries({ queryKey: ["campaigns", accountId] });
      const previous = queryClient.getQueryData(["campaigns", accountId]);
      queryClient.setQueryData(["campaigns", accountId], (old) =>
        old?.map((c) => (c.id === id ? { ...c, isActive } : c))
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["campaigns", accountId], context.previous);
      }
      Alert.alert("Couldn't update campaign", "Please try again.");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
    },
  });

  const deleteCampaign = useMutation({
    mutationFn: (id) => apiFetch(`/api/automations?id=${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
    },
    onError: () => Alert.alert("Couldn't delete campaign", "Please try again."),
  });

  const handleDelete = async (campaign) => {
    const ok = await confirmAsync(
      "Delete campaign?",
      `"${campaign.name}" will stop sending DMs and its history will be removed.`
    );
    if (ok) deleteCampaign.mutate(campaign.id);
  };

  if (isLoading) {
    return (
      <View className="flex-1 gap-3 bg-background p-4">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      {accounts.length > 1 ? (
        <View className="border-b border-border">
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={[{ id: "all", username: "All accounts" }, ...accounts]}
            keyExtractor={(a) => a.id}
            contentContainerStyle={{ padding: 12, gap: 8 }}
            renderItem={({ item }) => {
              const active = accountId === item.id;
              return (
                <Pressable
                  onPress={() => setAccountId(item.id)}
                  className={`rounded-full border px-3 py-1.5 ${
                    active ? "border-accent bg-accent" : "border-border bg-surface"
                  }`}
                >
                  <Text
                    className={active ? "text-xs font-medium text-background" : "text-xs text-muted"}
                  >
                    {item.id === "all" ? item.username : `@${item.username}`}
                  </Text>
                </Pressable>
              );
            }}
          />
        </View>
      ) : null}

      <FlatList
        data={campaigns ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, gap: 12, flexGrow: 1 }}
        refreshControl={
          <RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={colors.accent} />
        }
        ListEmptyComponent={
          <EmptyState
            title="No campaigns yet"
            subtitle={canManage ? "Create one to start automating DMs." : undefined}
          />
        }
        renderItem={({ item }) => (
          <Card className="mb-3">
            <Pressable onPress={() => navigation.navigate("CampaignDetail", { id: item.id })}>
              <View className="flex-row items-center justify-between">
                <Text
                  className="flex-1 pr-2 text-base font-semibold text-foreground"
                  numberOfLines={1}
                >
                  {item.name}
                </Text>
                <Toggle
                  value={item.isActive}
                  disabled={!canManage || toggleActive.isPending}
                  onValueChange={(value) => toggleActive.mutate({ id: item.id, isActive: value })}
                />
              </View>
              <Text className="mt-1 text-xs text-muted" numberOfLines={1}>
                @{item.instagramAccount?.username ?? "unknown"}
              </Text>

              <View className="mt-3 flex-row flex-wrap gap-4">
                <Stat label="Sent" value={item.analytics?.sent ?? 0} />
                <Stat label="Skipped" value={item.analytics?.skipped ?? 0} />
                <Stat label="Failed" value={item.analytics?.failed ?? 0} />
                <Stat label="Clicks" value={item.analytics?.clicks ?? 0} />
                <Stat label="CTR" value={`${item.analytics?.ctr ?? 0}%`} />
              </View>

              {item.analytics?.topKeywords?.length ? (
                <Text className="mt-2 text-xs text-muted" numberOfLines={1}>
                  Top: {item.analytics.topKeywords.map((k) => k.keyword).join(", ")}
                </Text>
              ) : null}
            </Pressable>

            {canManage ? (
              <Pressable onPress={() => handleDelete(item)} className="mt-3 self-start">
                <Text className="text-xs font-medium text-error">Delete</Text>
              </Pressable>
            ) : null}
          </Card>
        )}
      />

      {canManage ? (
        <Pressable
          onPress={() => navigation.navigate("CampaignNewStack")}
          className="absolute bottom-6 right-6 h-14 w-14 items-center justify-center rounded-full bg-accent"
          style={{ elevation: 4, shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 6 }}
        >
          <Text className="text-2xl font-bold text-background">+</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function Stat({ label, value }) {
  return (
    <View>
      <Text className="text-sm font-semibold text-foreground">{value}</Text>
      <Text className="text-[10px] text-muted">{label}</Text>
    </View>
  );
}
