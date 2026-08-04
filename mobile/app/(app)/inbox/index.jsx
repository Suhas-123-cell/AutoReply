import { useMemo, useState } from "react";
import { FlatList, Modal, Pressable, RefreshControl, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { apiFetch } from "../../../src/api/client";
import EmptyState from "../../../src/ui/EmptyState";
import Skeleton from "../../../src/ui/Skeleton";
import { colors } from "../../../src/ui/tokens";
import { formatRelativeTime } from "../../../src/lib/formatRelativeTime";
import { useFocusedPolling } from "../../../src/lib/useFocusedPolling";

const POLL_MS = 12000;

export default function InboxListScreen() {
  const navigation = useNavigation();
  const [selectedAccountId, setSelectedAccountId] = useState(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const { data: accountsData } = useQuery({
    queryKey: ["instagram-accounts"],
    queryFn: () => apiFetch("/api/instagram/accounts"),
  });

  const accounts = accountsData?.instagramAccounts ?? [];
  const accountId =
    selectedAccountId ?? accountsData?.selectedInstagramAccountId ?? accounts[0]?.id ?? null;
  const activeAccount = accounts.find((a) => a.id === accountId) ?? null;

  const {
    data,
    isLoading,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ["instagram-conversations", accountId],
    queryFn: () =>
      apiFetch(`/api/instagram/conversations?instagramAccountId=${accountId}`),
    enabled: !!accountId,
    refetchInterval: useFocusedPolling(POLL_MS),
  });

  const conversations = useMemo(() => data?.conversations ?? [], [data]);

  function openConversation(item) {
    navigation.navigate("Conversation", {
      conversationId: item.id,
      accountId,
      recipientId: item.contact.id,
      username: item.contact.username ?? "",
    });
  }

  return (
    <View className="flex-1 bg-background">
      <View className="flex-row items-center justify-between border-b border-border px-4 py-3">
        <Text className="text-lg font-semibold text-foreground">Inbox</Text>
        {accounts.length > 1 && (
          <Pressable
            onPress={() => setPickerOpen(true)}
            className="flex-row items-center gap-1 rounded-full border border-border bg-surface px-3 py-1.5"
          >
            <Text className="text-xs font-medium text-foreground">
              @{activeAccount?.username ?? "select"}
            </Text>
            <Ionicons name="chevron-down" size={14} color={colors.muted} />
          </Pressable>
        )}
      </View>

      {isLoading ? (
        <View className="gap-3 p-4">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={colors.accent} />
          }
          ListEmptyComponent={
            <EmptyState
              title="No conversations yet"
              subtitle="Instagram DMs will show up here once someone messages this account."
            />
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => openConversation(item)}
              className="flex-row items-center justify-between border-b border-border px-4 py-3 active:bg-surface-hover"
            >
              <View className="flex-1 pr-2">
                <Text className="text-sm font-medium text-foreground" numberOfLines={1}>
                  @{item.contact.username ?? "unknown"}
                </Text>
                {item.lastMessage && (
                  <Text className="mt-0.5 text-xs text-muted" numberOfLines={1}>
                    {item.lastMessage.fromMe ? "You: " : ""}
                    {item.lastMessage.text || "(no text)"}
                  </Text>
                )}
              </View>
              <Text className="shrink-0 text-[11px] text-muted">
                {formatRelativeTime(item.updatedTime ?? item.lastMessage?.createdTime)}
              </Text>
            </Pressable>
          )}
        />
      )}

      <Modal visible={pickerOpen} transparent animationType="fade" onRequestClose={() => setPickerOpen(false)}>
        <Pressable
          className="flex-1 justify-end bg-black/50"
          onPress={() => setPickerOpen(false)}
        >
          <View className="rounded-t-xl border border-border bg-surface p-2">
            {accounts.map((a) => (
              <Pressable
                key={a.id}
                onPress={() => {
                  setSelectedAccountId(a.id);
                  setPickerOpen(false);
                }}
                className="rounded-lg px-4 py-3 active:bg-surface-hover"
              >
                <Text className="text-sm text-foreground">@{a.username}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}
