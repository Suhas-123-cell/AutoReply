import { useMemo, useState } from "react";
import { FlatList, Image, Pressable, Text, TextInput, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../../../../src/api/client";
import { useCampaignWizardStore } from "../../../../src/store/campaignWizardStore";
import EmptyState from "../../../../src/ui/EmptyState";
import Skeleton from "../../../../src/ui/Skeleton";

/**
 * Full-screen post picker, mirroring components/post-picker.tsx: a grid of
 * the account's Instagram media (GET /api/instagram/posts?all=true), with
 * posts already assigned to another campaign flagged (not disabled — the
 * web lets you reassign, it just warns).
 *
 * The "used by" map isn't part of the posts response — the web computes it
 * client-side by cross-referencing GET /api/automations for the same
 * account (see campaign-builder.tsx's usedPosts effect). Mirrored here the
 * same way rather than inventing new backend behavior.
 */
export default function PostPickerScreen() {
  const navigation = useNavigation();
  const draft = useCampaignWizardStore((s) => s.draft);
  const setFields = useCampaignWizardStore((s) => s.setFields);
  const [query, setQuery] = useState("");

  const { data: posts, isLoading, isError } = useQuery({
    queryKey: ["instagram-posts", draft.instagramAccountId],
    queryFn: () =>
      apiFetch(
        `/api/instagram/posts?instagramAccountId=${draft.instagramAccountId}&all=true`
      ),
    enabled: Boolean(draft.instagramAccountId),
  });

  const { data: campaigns } = useQuery({
    queryKey: ["campaigns", "all"],
    queryFn: () => apiFetch("/api/automations?instagramAccountId=all"),
  });

  const usedPostIds = useMemo(() => {
    const map = {};
    for (const c of campaigns ?? []) {
      if (!c.postId) continue;
      if (c.instagramAccountId !== draft.instagramAccountId) continue;
      map[c.postId] = c.name;
    }
    return map;
  }, [campaigns, draft.instagramAccountId]);

  const visible = (posts ?? []).filter((p) =>
    query.trim() ? (p.caption ?? "").toLowerCase().includes(query.trim().toLowerCase()) : true
  );

  const handleSelect = (post) => {
    setFields({
      postId: post.id,
      postUrl: post.permalink ?? null,
      postThumb: post.thumbnail_url ?? post.media_url ?? null,
      postCaption: post.caption ?? "",
    });
    navigation.goBack();
  };

  if (isLoading) {
    return (
      <View className="flex-1 flex-row flex-wrap gap-2 bg-background p-4">
        {[...Array(9)].map((_, i) => (
          <Skeleton key={i} className="h-28 w-28" />
        ))}
      </View>
    );
  }

  if (isError) {
    return (
      <View className="flex-1 bg-background p-4">
        <EmptyState
          title="Couldn't load posts"
          subtitle="Check your Instagram connection and try again."
        />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
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
          const isSelected = draft.postId === item.id;
          const usedByName = usedPostIds[item.id];
          const isUsed = Boolean(usedByName) && !isSelected;
          const thumb = item.thumbnail_url ?? item.media_url;
          return (
            <Pressable
              onPress={() => handleSelect(item)}
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
