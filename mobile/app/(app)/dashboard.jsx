import { useState } from "react";
import { Alert, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import InAppBrowser from "react-native-inappbrowser-reborn";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiError } from "../../src/api/client";
import Card from "../../src/ui/Card";
import EmptyState from "../../src/ui/EmptyState";
import Skeleton from "../../src/ui/Skeleton";
import StatTile from "../../src/ui/StatTile";
import StatusBadge from "../../src/ui/StatusBadge";
import { colors } from "../../src/ui/tokens";

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [connecting, setConnecting] = useState(false);
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

  // Same openAuth pattern as more/instagram.jsx's handleConnect — resolves
  // once the in-app browser redirects back to autoreply://ig-connect,
  // success or not, so just refetch either way.
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
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    }
  };

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

  // New workspaces have nothing to show until an Instagram account is
  // connected — every stat below would just be zero. Gate the dashboard on
  // that instead of rendering an empty shell.
  if ((stats?.instagramAccounts?.length ?? 0) === 0) {
    return (
      <View
        className="flex-1 items-center justify-center gap-4 bg-background px-6"
        style={{ paddingTop: insets.top }}
      >
        <Text className="text-center text-2xl font-bold text-foreground">
          Connect Instagram to get started
        </Text>
        <Text className="text-center text-sm text-muted">
          AutoReply automates comment-to-DM replies on your Instagram account. Connect one to
          start tracking activity here.
        </Text>
        <Pressable
          onPress={handleConnect}
          disabled={connecting}
          className={`mt-2 rounded-lg px-6 py-3 ${connecting ? "bg-accent-hover opacity-60" : "bg-accent"}`}
        >
          <Text className="font-semibold text-background">
            {connecting ? "Opening..." : "Connect Instagram"}
          </Text>
        </Pressable>
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
