import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useInfiniteQuery } from "@tanstack/react-query";
import { apiFetch } from "../../src/api/client";
import EmptyState from "../../src/ui/EmptyState";
import StatusBadge from "../../src/ui/StatusBadge";
import { colors } from "../../src/ui/tokens";

const STATUS_FILTERS = [
  { value: null, label: "All" },
  { value: "SENT", label: "Sent" },
  { value: "FAILED", label: "Failed" },
  { value: "PENDING", label: "Pending" },
  { value: "SKIPPED_DEDUP", label: "Dup" },
  { value: "SKIPPED_RATE_LIMIT", label: "Rate limit" },
  { value: "SKIPPED_PLAN_LIMIT", label: "Plan limit" },
  { value: "SKIPPED_NO_MATCH", label: "No match" },
];

const PAGE_SIZE = 20;

export default function ActivityScreen() {
  const insets = useSafeAreaInsets();
  const [status, setStatus] = useState(null);

  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch,
    isRefetching,
  } = useInfiniteQuery({
    queryKey: ["logs", status],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ page: String(pageParam), limit: String(PAGE_SIZE) });
      if (status) params.set("status", status);
      return apiFetch(`/api/logs?${params.toString()}`);
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.pagination.page < lastPage.pagination.totalPages
        ? lastPage.pagination.page + 1
        : undefined,
  });

  const logs = useMemo(() => data?.pages.flatMap((p) => p.logs) ?? [], [data]);

  const renderItem = useCallback(
    ({ item }) => (
      <View className="flex-row items-center justify-between border-b border-border px-4 py-3">
        <View className="flex-1 pr-2">
          <Text className="text-sm text-foreground" numberOfLines={1}>
            @{item.commenterName ?? "unknown"}
            {item.automation?.name ? ` · ${item.automation.name}` : ""}
          </Text>
          <Text className="text-xs text-muted" numberOfLines={1}>
            {item.instagramAccount ? `@${item.instagramAccount.username} · ` : ""}
            {item.commentText}
          </Text>
        </View>
        <StatusBadge status={item.status} />
      </View>
    ),
    []
  );

  return (
    <View className="flex-1 bg-background">
      <View className="border-b border-border" style={{ paddingTop: insets.top }}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={STATUS_FILTERS}
          keyExtractor={(f) => f.label}
          contentContainerStyle={{ padding: 12, gap: 8 }}
          renderItem={({ item }) => {
            const active = status === item.value;
            return (
              <Pressable
                onPress={() => setStatus(item.value)}
                className={`rounded-full border px-3 py-1.5 ${
                  active ? "border-accent bg-accent" : "border-border bg-surface"
                }`}
              >
                <Text className={active ? "text-xs font-medium text-background" : "text-xs text-muted"}>
                  {item.label}
                </Text>
              </Pressable>
            );
          }}
        />
      </View>

      <FlatList
        data={logs}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        onEndReached={() => hasNextPage && fetchNextPage()}
        onEndReachedThreshold={0.4}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.accent} />
        }
        ListEmptyComponent={isLoading ? null : <EmptyState title="No activity yet" />}
        ListFooterComponent={
          isFetchingNextPage ? (
            <ActivityIndicator style={{ marginVertical: 16 }} color={colors.accent} />
          ) : null
        }
      />
    </View>
  );
}
