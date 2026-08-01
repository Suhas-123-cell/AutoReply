import { RefreshControl, ScrollView, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../../../src/api/client";
import Card from "../../../src/ui/Card";
import Skeleton from "../../../src/ui/Skeleton";
import { colors } from "../../../src/ui/tokens";

// Mirrors app/(dashboard)/settings/page.tsx's "Usage" section exactly: this
// self-hosted app has no plan limits, so the only figure shown there is DMs
// sent this period — already present on /api/dashboard/stats, so no new
// endpoint is needed.
export default function UsageScreen() {
  const {
    data: stats,
    isLoading,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: () => apiFetch("/api/dashboard/stats"),
  });

  if (isLoading) {
    return (
      <View className="flex-1 gap-3 bg-background p-4">
        <Skeleton className="h-20" />
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{ padding: 16, gap: 16 }}
      refreshControl={
        <RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={colors.accent} />
      }
    >
      <Card>
        <View className="flex-row items-center justify-between">
          <View>
            <Text className="text-sm font-medium text-foreground">DMs sent this month</Text>
            <Text className="mt-0.5 text-xs text-muted">Self-hosted — no plan limits.</Text>
          </View>
          <Text className="text-lg font-semibold text-foreground">
            {stats?.workspace?.dmsSentThisPeriod ?? 0}
          </Text>
        </View>
      </Card>
    </ScrollView>
  );
}
