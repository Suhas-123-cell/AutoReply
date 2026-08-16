import { RefreshControl, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../../src/api/client";
import Card from "../../src/ui/Card";
import EmptyState from "../../src/ui/EmptyState";
import Skeleton from "../../src/ui/Skeleton";
import StatTile from "../../src/ui/StatTile";
import StatusBadge from "../../src/ui/StatusBadge";
import { colors } from "../../src/ui/tokens";

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const {
    data: stats,
    isLoading,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: () => apiFetch("/api/dashboard/stats"),
  });

  const dailyDMs = stats?.dailyDMs ?? [];
  // Ported verbatim from app/(dashboard)/dashboard/page.tsx.
  const maxDM = Math.max(...dailyDMs.map((d) => d.count), 1);

  if (isLoading) {
    return (
      <View className="flex-1 gap-3 bg-background p-4" style={{ paddingTop: insets.top + 16 }}>
        <Skeleton className="h-8 w-40" />
        <View className="flex-row flex-wrap gap-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-24 min-w-[45%] flex-1" />
          ))}
        </View>
        <Skeleton className="h-48" />
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{ padding: 16, paddingTop: insets.top + 16, gap: 16 }}
      refreshControl={
        <RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={colors.accent} />
      }
    >
      <Text className="text-2xl font-bold text-foreground">
        Hello, {stats?.userName ?? "there"}
      </Text>

      <View className="flex-row flex-wrap gap-3">
        <StatTile label="DMs Today" value={stats?.dmsSentToday ?? 0} />
        <StatTile label="DMs This Week" value={stats?.dmsSentWeek ?? 0} />
        <StatTile label="DMs This Month" value={stats?.dmsSentMonth ?? 0} />
        <StatTile label="Total DMs" value={stats?.totalDMs ?? 0} />
        <StatTile label="Clicks" value={stats?.clicksThisMonth ?? 0} />
        <StatTile label="CTR" value={`${stats?.ctrThisMonth ?? 0}%`} />
      </View>

      <Card>
        <Text className="mb-4 text-sm font-semibold text-foreground">DMs — Last 7 Days</Text>
        <View className="h-40 flex-row items-end gap-2">
          {dailyDMs.map((day) => (
            <View key={day.date} className="flex-1 items-center gap-1">
              <Text className="text-xs text-muted">{day.count}</Text>
              <View
                className="w-full rounded-sm bg-accent"
                style={{ height: `${Math.max((day.count / maxDM) * 100, 4)}%` }}
              />
              <Text className="text-[10px] text-muted">{day.date}</Text>
            </View>
          ))}
        </View>
      </Card>

      <Card>
        <Text className="mb-3 text-sm font-semibold text-foreground">Top Keywords</Text>
        {(stats?.topKeywords?.length ?? 0) === 0 ? (
          <EmptyState title="No keyword matches yet" />
        ) : (
          stats.topKeywords.map((k) => (
            <View
              key={k.keyword}
              className="flex-row items-center justify-between border-b border-border py-2"
            >
              <Text className="flex-1 pr-2 text-sm text-foreground" numberOfLines={1}>
                {k.keyword}
              </Text>
              <Text className="text-xs text-muted">{k.count}</Text>
            </View>
          ))
        )}
      </Card>

      <Card>
        <Text className="mb-3 text-sm font-semibold text-foreground">Recent Activity</Text>
        {(stats?.recentLogs?.length ?? 0) === 0 ? (
          <EmptyState title="No activity yet" />
        ) : (
          stats.recentLogs.map((log) => (
            <View
              key={log.id}
              className="flex-row items-center justify-between border-b border-border py-2"
            >
              <View className="flex-1 pr-2">
                <Text className="text-sm text-foreground" numberOfLines={1}>
                  @{log.commenterName ?? "unknown"}
                </Text>
                <Text className="text-xs text-muted" numberOfLines={1}>
                  {log.instagramAccount ? `@${log.instagramAccount.username} · ` : ""}
                  {log.commentText}
                </Text>
              </View>
              <StatusBadge status={log.status} />
            </View>
          ))
        )}
      </Card>
    </ScrollView>
  );
}
