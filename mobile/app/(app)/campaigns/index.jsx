import { useState } from "react";
import { Alert, FlatList, Modal, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
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
  const [cloneTarget, setCloneTarget] = useState(null);
  const [cloneSelection, setCloneSelection] = useState(new Set());
  const [cloneResult, setCloneResult] = useState(null);

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

  const clone = useMutation({
    mutationFn: ({ sourceAutomationId, targetInstagramAccountIds }) =>
      apiFetch("/api/automations/clone", {
        method: "POST",
        body: { sourceAutomationId, targetInstagramAccountIds },
      }),
    onSuccess: (data) => {
      setCloneResult(data);
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
    },
    onError: () => Alert.alert("Couldn't clone campaign", "Please try again."),
  });

  const openClone = (campaign) => {
    setCloneResult(null);
    setCloneSelection(new Set());
    setCloneTarget(campaign);
  };

  const toggleCloneAccount = (id) => {
    setCloneSelection((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const submitClone = () => {
    if (!cloneTarget || cloneSelection.size === 0) return;
    clone.mutate({
      sourceAutomationId: cloneTarget.id,
      targetInstagramAccountIds: [...cloneSelection],
    });
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
              <View className="mt-3 flex-row gap-4">
                {accounts.length > 1 ? (
                  <Pressable onPress={() => openClone(item)}>
                    <Text className="text-xs font-medium text-accent">Clone to other clients</Text>
                  </Pressable>
                ) : null}
                <Pressable onPress={() => handleDelete(item)}>
                  <Text className="text-xs font-medium text-error">Delete</Text>
                </Pressable>
              </View>
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

      <Modal
        visible={Boolean(cloneTarget)}
        animationType="slide"
        transparent
        onRequestClose={() => setCloneTarget(null)}
      >
        <Pressable className="flex-1 bg-black/50" onPress={() => setCloneTarget(null)} />
        <View
          className="max-h-[80%] rounded-t-2xl border border-border bg-background"
          style={{ shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 12 }}
        >
          <View className="items-center py-2.5">
            <View className="h-1 w-10 rounded-full bg-border-hover" />
          </View>
          <View className="px-4 pb-3">
            <Text className="text-base font-semibold text-foreground">
              Clone &ldquo;{cloneTarget?.name}&rdquo;
            </Text>
            <Text className="mt-1 text-xs text-muted">
              Deploys this flow as a new campaign on each selected client account. The post must
              exist on that account too.
            </Text>
          </View>

          <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 8, gap: 4 }}>
            {accounts
              .filter((a) => a.id !== cloneTarget?.instagramAccountId)
              .map((account) => {
                const checked = cloneSelection.has(account.id);
                return (
                  <Pressable
                    key={account.id}
                    onPress={() => toggleCloneAccount(account.id)}
                    className="flex-row items-center gap-3 rounded-lg px-2 py-2.5"
                  >
                    <View
                      className={`h-5 w-5 items-center justify-center rounded border ${
                        checked ? "border-accent bg-accent" : "border-border"
                      }`}
                    >
                      {checked ? <Text className="text-xs font-bold text-background">✓</Text> : null}
                    </View>
                    <Text className="text-sm text-foreground">@{account.username}</Text>
                  </Pressable>
                );
              })}
          </ScrollView>

          {cloneResult ? (
            <View className="mx-4 mb-2 rounded-lg border border-border bg-surface p-3">
              <Text className="text-xs text-success">
                {cloneResult.created.length} campaign{cloneResult.created.length === 1 ? "" : "s"} created
              </Text>
              {cloneResult.skipped.map((s) => (
                <Text key={s.instagramAccountId} className="mt-1 text-xs text-muted">
                  Skipped: {s.reason}
                </Text>
              ))}
            </View>
          ) : null}

          <View className="flex-row gap-3 px-4 pb-6 pt-2">
            <Pressable
              onPress={() => setCloneTarget(null)}
              className="flex-1 items-center rounded-lg border border-border px-4 py-3"
            >
              <Text className="text-sm font-medium text-foreground">Close</Text>
            </Pressable>
            <Pressable
              onPress={submitClone}
              disabled={clone.isPending || cloneSelection.size === 0}
              className={`flex-1 items-center rounded-lg px-4 py-3 ${
                clone.isPending || cloneSelection.size === 0 ? "bg-accent-hover opacity-60" : "bg-accent"
              }`}
            >
              <Text className="text-sm font-semibold text-background">
                {clone.isPending ? "Cloning..." : "Clone"}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
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
