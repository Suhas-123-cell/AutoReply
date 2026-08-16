import { useState } from "react";
import { FlatList, Image, Pressable, RefreshControl, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../../../src/api/client";
import Card from "../../../src/ui/Card";
import EmptyState from "../../../src/ui/EmptyState";
import Skeleton from "../../../src/ui/Skeleton";
import StatTile from "../../../src/ui/StatTile";
import FollowerChart from "../../../src/ui/FollowerChart";
import { colors } from "../../../src/ui/tokens";

// Mobile defaults lighter than the web (which can default to "all"): a
// desktop user tolerates a long spinner, a mobile user should not.
const RANGE_OPTIONS = [30, 50, 100];
const DEFAULT_RANGE = 30;

// /api/instagram/overview can take up to 60s on large accounts (paginated
// media + per-post insight calls). client.js's LONG_TIMEOUT_ROUTES only
// matches the bare path with no query string, so appending "?count=" here
// would silently fall back to the 20s default — pass timeoutMs explicitly
// instead of relying on that special-case.
const OVERVIEW_TIMEOUT_MS = 60000;

function formatNumber(n) {
  return (n ?? 0).toLocaleString();
}

function PostRow({ post }) {
  return (
    <Card className="flex-row gap-3">
      {post.thumbnailUrl ? (
        <Image source={{ uri: post.thumbnailUrl }} className="h-16 w-16 rounded-md bg-surface-hover" />
      ) : (
        <View className="h-16 w-16 items-center justify-center rounded-md bg-surface-hover">
          <Text className="text-[10px] text-muted">No thumb</Text>
        </View>
      )}
      <View className="flex-1">
        <Text className="text-sm text-foreground" numberOfLines={2}>
          {post.caption || "(no caption)"}
        </Text>
        <View className="mt-2 flex-row flex-wrap gap-x-3 gap-y-1">
          <Text className="text-xs text-muted">👁 {post.views ?? "—"}</Text>
          <Text className="text-xs text-muted">↗ {post.reach ?? "—"}</Text>
          <Text className="text-xs text-muted">♥ {formatNumber(post.likes)}</Text>
          <Text className="text-xs text-muted">💬 {formatNumber(post.comments)}</Text>
        </View>
      </View>
    </Card>
  );
}

export default function OverviewScreen() {
  const [count, setCount] = useState(DEFAULT_RANGE);

  const {
    data,
    isLoading,
    isFetching,
    refetch,
    error,
  } = useQuery({
    queryKey: ["instagram-overview", count],
    queryFn: () =>
      apiFetch(`/api/instagram/overview?count=${count}`, { timeoutMs: OVERVIEW_TIMEOUT_MS }),
    staleTime: 10 * 60 * 1000,
    // A 400 here means "no Instagram account connected" — retrying with
    // backoff just delays the error message for several seconds for a
    // request that can never succeed. Pull-to-refresh covers manual retry.
    retry: false,
  });

  const totals = data?.totals;
  const posts = data?.posts ?? [];

  if (isLoading) {
    return (
      <View className="flex-1 gap-3 bg-background p-4">
        <Skeleton className="h-24" />
        <View className="flex-row flex-wrap gap-3">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <Skeleton key={i} className="h-20 min-w-[45%] flex-1" />
          ))}
        </View>
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </View>
    );
  }

  if (error) {
    return (
      <View className="flex-1 bg-background p-4">
        <EmptyState
          title="Couldn't load Instagram overview"
          subtitle={error.message ?? "Please try again."}
        />
      </View>
    );
  }

  return (
    <FlatList
      className="flex-1 bg-background"
      contentContainerStyle={{ padding: 16, gap: 12 }}
      data={posts}
      keyExtractor={(p) => p.id}
      renderItem={({ item }) => <PostRow post={item} />}
      refreshControl={
        <RefreshControl refreshing={isFetching && !isLoading} onRefresh={refetch} tintColor={colors.accent} />
      }
      ListEmptyComponent={<EmptyState title="No posts in this range" />}
      ListHeaderComponent={
        <View className="gap-3 pb-2">
          <Card>
            <Text className="mb-2 text-sm font-semibold text-foreground">Followers</Text>
            <FollowerChart data={data?.followerHistory ?? []} followers={data?.followers ?? null} />
          </Card>

          <View className="flex-row flex-wrap gap-3">
            <StatTile label="Posts" value={formatNumber(totals?.posts)} />
            <StatTile label="Views" value={formatNumber(totals?.views)} />
            <StatTile label="Reach" value={formatNumber(totals?.reach)} />
            <StatTile label="Likes" value={formatNumber(totals?.likes)} />
            <StatTile label="Comments" value={formatNumber(totals?.comments)} />
            <StatTile label="Saved" value={formatNumber(totals?.saved)} />
            <StatTile label="Shares" value={formatNumber(totals?.shares)} />
            <StatTile label="Interactions" value={formatNumber(totals?.interactions)} />
          </View>

          <View className="flex-row gap-2">
            {RANGE_OPTIONS.map((option) => (
              <Pressable
                key={option}
                onPress={() => setCount(option)}
                className={`rounded-full border px-3 py-1.5 ${
                  count === option ? "border-accent bg-accent/20" : "border-border"
                }`}
              >
                <Text
                  className={`text-xs font-medium ${
                    count === option ? "text-accent" : "text-muted"
                  }`}
                >
                  Last {option}
                </Text>
              </Pressable>
            ))}
          </View>

          {data?.insightsAvailable === false ? (
            <Text className="text-xs text-warning">
              Views and reach need broader Instagram permissions — reconnect your account to see
              them.
            </Text>
          ) : null}
          {data?.truncated ? (
            <Text className="text-xs text-muted">Showing the most recent {count} posts.</Text>
          ) : null}

          <Text className="mt-1 text-sm font-semibold text-foreground">Posts</Text>
        </View>
      }
    />
  );
}
