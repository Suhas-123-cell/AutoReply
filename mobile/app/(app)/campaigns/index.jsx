import { useState } from "react";
import { Alert, FlatList, Modal, Pressable, RefreshControl, ScrollView, Share, Text, TextInput, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../../../src/api/client";
import { useAuth } from "../../../src/auth/AuthContext";
import { canManageCampaigns } from "../../../src/lib/workspace-access";
import { confirmAsync } from "../../../src/lib/confirm";
import Card from "../../../src/ui/Card";
import EmptyState from "../../../src/ui/EmptyState";
import Skeleton from "../../../src/ui/Skeleton";
import Toggle from "../../../src/ui/Toggle";
import { colors } from "../../../src/ui/tokens";

export default function CampaignsScreen() {
  const navigation = useNavigation();
  const { role } = useAuth();
  const canManage = canManageCampaigns(role);
  const queryClient = useQueryClient();
  const [accountId, setAccountId] = useState("all");
  const [cloneTarget, setCloneTarget] = useState(null);
  const [cloneSelection, setCloneSelection] = useState(new Set());
  const [cloneResult, setCloneResult] = useState(null);
  const [importVisible, setImportVisible] = useState(false);
  const [importText, setImportText] = useState("");
  const [importAccountId, setImportAccountId] = useState(null);

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

  const importCampaigns = useMutation({
    mutationFn: ({ document, targetAccountId }) =>
      apiFetch("/api/automations/import", {
        method: "POST",
        body: { ...document, instagramAccountId: targetAccountId },
      }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      setImportVisible(false);
      setImportText("");
      Alert.alert(
        "Import complete",
        `${result.created.length} paused campaign${result.created.length === 1 ? "" : "s"} created. Review each before activating.`
      );
    },
    onError: (error) => Alert.alert("Couldn't import campaigns", error?.message ?? "Check the JSON and try again."),
  });

  const submitImport = () => {
    if (!importAccountId) {
      Alert.alert("Choose an account", "Select the Instagram account that will own these drafts.");
      return;
    }
    try {
      const document = JSON.parse(importText);
      if (!document || !Array.isArray(document.campaigns)) throw new Error();
      importCampaigns.mutate({ document, targetAccountId: importAccountId });
    } catch {
      Alert.alert("Invalid JSON", "Paste an AutoReply campaign export.");
    }
  };

  const exportCampaigns = async () => {
    const exported = (campaigns ?? []).map((campaign) => ({
      sourceInstagramAccountId: campaign.instagramAccountId,
      name: campaign.name,
      goal: campaign.goal,
      postId: campaign.postId,
      postUrl: campaign.postUrl,
      pendingNextReel: campaign.pendingNextReel,
      matchAnyPost: campaign.matchAnyPost,
      dmTriggerEnabled: campaign.dmTriggerEnabled,
      keywords: campaign.keywords,
      matchAnyWord: campaign.matchAnyWord,
      wholeWordMatch: campaign.wholeWordMatch,
      dmMessage: campaign.dmMessage,
      openingDmEnabled: campaign.openingDmEnabled,
      openingDmMessage: campaign.openingDmMessage,
      openingDmButtonLabel: campaign.openingDmButtonLabel,
      linkButtonLabel: campaign.linkButtonLabel,
      requireFollow: campaign.requireFollow,
      followPromptMessage: campaign.followPromptMessage,
      followPromptButtonLabel: campaign.followPromptButtonLabel,
      followUpEnabled: campaign.followUpEnabled,
      followUpMessage: campaign.followUpMessage,
      publicReplyEnabled: campaign.publicReplyEnabled,
      publicReplyMessages: campaign.publicReplyMessages,
      trackedLinks: (campaign.trackedLinks ?? []).map((link) => ({
        label: link.label,
        destinationUrl: link.destinationUrl,
      })),
    }));
    await Share.share({
      title: "AutoReply campaign export",
      message: JSON.stringify({ version: 1, campaigns: exported }, null, 2),
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
      {canManage && (campaigns?.length ?? 0) > 0 ? (
        <View className="flex-row justify-end gap-4 border-b border-border px-4 py-2">
          <Pressable onPress={exportCampaigns}>
            <Text className="text-xs font-medium text-accent">Export JSON</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              setImportAccountId(accountId === "all" ? accounts[0]?.id ?? null : accountId);
              setImportVisible(true);
            }}
          >
            <Text className="text-xs font-medium text-accent">Import JSON</Text>
          </Pressable>
        </View>
      ) : canManage && accounts.length > 0 ? (
        <Pressable
          onPress={() => {
            setImportAccountId(accounts[0]?.id ?? null);
            setImportVisible(true);
          }}
          className="items-end border-b border-border px-4 py-2"
        >
          <Text className="text-xs font-medium text-accent">Import JSON</Text>
        </Pressable>
      ) : null}
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
                <Stat label="Delivered" value={item.analytics?.sent ?? 0} />
                <Stat label="Skipped" value={item.analytics?.skipped ?? 0} />
                <Stat label="Failed" value={item.analytics?.failed ?? 0} />
                <Stat label="Clicks" value={item.analytics?.clicks ?? 0} />
                <Stat label="Clicks / DM" value={`${item.analytics?.ctr ?? 0}%`} />
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
              Copies the messages and links into paused drafts. Specific-post campaigns wait for
              each account&apos;s next post or reel, so another account&apos;s media ID is never reused.
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
                {cloneResult.created.length} paused campaign{cloneResult.created.length === 1 ? "" : "s"} created
              </Text>
              <Text className="mt-1 text-xs text-muted">Review each draft before activating it.</Text>
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

      <Modal
        visible={importVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setImportVisible(false)}
      >
        <Pressable className="flex-1 bg-black/50" onPress={() => setImportVisible(false)} />
        <View className="max-h-[85%] rounded-t-2xl border border-border bg-background p-4">
          <Text className="text-base font-semibold text-foreground">Import paused campaigns</Text>
          <Text className="mt-1 text-xs text-muted">
            Paste JSON exported by AutoReply. Cross-account post IDs are replaced with “next post or reel” targeting.
          </Text>
          <ScrollView horizontal className="mt-3" showsHorizontalScrollIndicator={false}>
            <View className="flex-row gap-2">
              {accounts.map((account) => (
                <Pressable
                  key={account.id}
                  onPress={() => setImportAccountId(account.id)}
                  className={`rounded-full border px-3 py-2 ${
                    importAccountId === account.id ? "border-accent bg-accent" : "border-border"
                  }`}
                >
                  <Text className={importAccountId === account.id ? "text-xs text-background" : "text-xs text-foreground"}>
                    @{account.username}
                  </Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
          <TextInput
            value={importText}
            onChangeText={setImportText}
            multiline
            autoCapitalize="none"
            autoCorrect={false}
            placeholder={'{ "version": 1, "campaigns": [...] }'}
            placeholderTextColor={colors.muted}
            className="mt-3 min-h-40 rounded-lg border border-border p-3 text-xs text-foreground"
            style={{ textAlignVertical: "top" }}
          />
          <View className="mt-3 flex-row gap-3">
            <Pressable onPress={() => setImportVisible(false)} className="flex-1 rounded-lg border border-border px-4 py-3">
              <Text className="text-center text-sm text-foreground">Cancel</Text>
            </Pressable>
            <Pressable
              onPress={submitImport}
              disabled={importCampaigns.isPending || !importText.trim()}
              className={`flex-1 rounded-lg px-4 py-3 ${importCampaigns.isPending || !importText.trim() ? "bg-accent-hover opacity-60" : "bg-accent"}`}
            >
              <Text className="text-center text-sm font-semibold text-background">
                {importCampaigns.isPending ? "Importing..." : "Import"}
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
