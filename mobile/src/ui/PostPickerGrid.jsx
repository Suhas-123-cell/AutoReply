import { useMemo, useState } from "react";
import { FlatList, Image, Pressable, Text, TextInput, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../api/client";
import EmptyState from "./EmptyState";
import Skeleton from "./Skeleton";

/**
 * Presentational grid of an Instagram account's posts/reels, shared by the
 * wizard's full-screen post-picker route (campaigns/new/post-picker.jsx)
 * and the edit form's "change post" modal (campaigns/edit/[id].jsx).
 *
 * Mirrors components/post-picker.tsx: fetches
 * GET /api/instagram/posts?instagramAccountId=&all=true, and flags posts
 * already assigned to another campaign by cross-referencing
 * GET /api/automations client-side — that "used by" map is not part of the
 * posts response (see components/campaign-builder.tsx's usedPosts effect),
 * so we compute it the same way here rather than inventing new backend
 * behavior.
 */
export default function PostPickerGrid({
  instagramAccountId,
  selectedPostId,
  excludeCampaignId,
  onSelect,
}) {
  const [query, setQuery] = useState("");

  const {
    data: posts,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["instagram-posts", instagramAccountId],
    queryFn: () =>
      apiFetch(`/api/instagram/posts?instagramAccountId=${instagramAccountId}&all=true`),
    enabled: Boolean(instagramAccountId),
  });

  const { data: campaigns } = useQuery({
    queryKey: ["campaigns", "all"],
    queryFn: () => apiFetch("/api/automations?instagramAccountId=all"),
  });

  const usedPostIds = useMemo(() => {
    const map = {};
    for (const c of campaigns ?? []) {
      if (!c.postId) continue;
      if (c.instagramAccountId !== instagramAccountId) continue;
      if (excludeCampaignId && c.id === excludeCampaignId) continue;
      map[c.postId] = c.name;
    }
    return map;
  }, [campaigns, instagramAccountId, excludeCampaignId]);

  const visible = (posts ?? []).filter((p) =>
    query.trim() ? (p.caption ?? "").toLowerCase().includes(query.trim().toLowerCase()) : true
  );

  if (isLoading) {
    return (
      <View className="flex-1 flex-row flex-wrap gap-2 p-4">
        {[...Array(9)].map((_, i) => (
          <Skeleton key={i} className="h-28 w-28" />
        ))}
      </View>
    );
  }

  if (isError) {
    return (
      <View className="flex-1 p-4">
        <EmptyState
          title="Couldn't load posts"
          subtitle="Check your Instagram connection and try again."
        />
      </View>
    );
  }

  return (
    <View className="flex-1">
      <View className="border-b border-border p-3">
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search your posts by caption..."
          placeholderTextColor="#9b9ba3"
          className="rounded-lg border border-border bg-surface px-3 py-2 text-foreground"
        />
      </View>

      {Object.keys(usedPostIds).length > 0 ? (
        <Text className="px-4 pt-3 text-xs text-muted">
          Posts outlined in yellow are already used by another campaign.
        </Text>
      ) : null}

      <FlatList
        data={visible}
        keyExtractor={(item) => item.id}
        numColumns={3}
        contentContainerStyle={{ padding: 12, gap: 8 }}
        columnWrapperStyle={{ gap: 8 }}
        ListEmptyComponent={
          <EmptyState
            title={query ? "No matching posts" : "No posts found"}
            subtitle={query ? undefined : "Connect Instagram and publish a post or reel first."}
          />
        }
        renderItem={({ item }) => {
          const isSelected = selectedPostId === item.id;
          const usedByName = usedPostIds[item.id];
          const isUsed = Boolean(usedByName) && !isSelected;
          const thumb = item.thumbnail_url ?? item.media_url;
          return (
            <Pressable
              onPress={() => onSelect(item)}
              className={`aspect-square flex-1 overflow-hidden rounded-md border-2 ${
                isSelected ? "border-accent" : isUsed ? "border-warning" : "border-border"
              }`}
            >
              {thumb ? (
                <Image
                  source={{ uri: thumb }}
                  className="h-full w-full"
                  style={{ opacity: isUsed ? 0.6 : 1 }}
                />
              ) : (
                <View className="h-full w-full items-center justify-center bg-surface">
                  <Text className="text-xs text-muted">No image</Text>
                </View>
              )}
              {isSelected ? (
                <View className="absolute inset-x-0 bottom-0 bg-accent py-1">
                  <Text className="text-center text-[10px] font-semibold text-background">
                    Selected
                  </Text>
                </View>
              ) : isUsed ? (
                <View className="absolute inset-x-0 bottom-0 bg-warning py-1">
                  <Text className="text-center text-[10px] font-semibold text-background">
                    In use
                  </Text>
                </View>
              ) : null}
            </Pressable>
          );
        }}
      />
    </View>
  );
}
