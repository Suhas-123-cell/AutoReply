import { useMemo } from "react";
import { Alert, Pressable, ScrollView, Share, Text, View } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../../../src/api/client";
import { useAuth } from "../../../src/auth/AuthContext";
import { canManageCampaigns } from "../../../src/lib/workspace-access";
import Card from "../../../src/ui/Card";
import Skeleton from "../../../src/ui/Skeleton";

export default function CampaignDetailScreen() {
  const { id } = useRoute().params ?? {};
  const navigation = useNavigation();
  const { role } = useAuth();
  const canManage = canManageCampaigns(role);
  const queryClient = useQueryClient();

  // Always fetches the unfiltered list so a detail screen opened from any
  // account filter on the list screen can still resolve the campaign.
  const { data: campaigns, isLoading } = useQuery({
    queryKey: ["campaigns", "all"],
    queryFn: () => apiFetch("/api/automations?instagramAccountId=all"),
  });

  const campaign = useMemo(() => campaigns?.find((c) => c.id === id), [campaigns, id]);
  const { data: outcomes } = useQuery({
    queryKey: ["campaign-outcomes", id],
    queryFn: () => apiFetch(`/api/automations/outcomes?automationId=${id}`),
    enabled: Boolean(id && campaign),
  });
  const addOutcome = useMutation({
    mutationFn: (kind) =>
      apiFetch("/api/automations/outcomes", {
        method: "POST",
        body: { automationId: id, kind },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["campaign-outcomes", id] }),
    onError: () => Alert.alert("Couldn't record outcome", "Reconnect and try again."),
  });

  if (isLoading) {
    return (
      <View className="flex-1 gap-3 bg-background p-4">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </View>
    );
  }

  if (!campaign) {
    return (
      <View className="flex-1 items-center justify-center bg-background p-4">
        <Text className="text-base text-muted">Campaign not found</Text>
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-background" contentContainerStyle={{ padding: 16, gap: 16 }}>
      <Text className="text-2xl font-bold text-foreground">{campaign.name}</Text>
      <Text className="text-sm text-muted">
        @{campaign.instagramAccount?.username ?? "unknown"}
      </Text>

      <Card>
        <Text className="mb-3 text-sm font-semibold text-foreground">Performance</Text>
        <View className="flex-row flex-wrap gap-4">
          <Stat label="Delivered" value={campaign.analytics?.sent ?? 0} />
          <Stat label="Skipped" value={campaign.analytics?.skipped ?? 0} />
          <Stat label="Failed" value={campaign.analytics?.failed ?? 0} />
          <Stat label="Clicks" value={campaign.analytics?.clicks ?? 0} />
          <Stat label="Clicks / DM" value={`${campaign.analytics?.ctr ?? 0}%`} />
        </View>
        <Text className="mt-3 text-xs text-muted">
          Clicks are link opens, not unique buyers. Outcomes below are recorded manually.
        </Text>
      </Card>

      <Card>
        <View className="mb-3 flex-row items-center justify-between">
          <Text className="text-sm font-semibold text-foreground">Business outcomes</Text>
          <Pressable
            onPress={() =>
              Share.share({
                title: `${campaign.name} report`,
                message: [
                  `${campaign.name} — @${campaign.instagramAccount?.username ?? "unknown"}`,
                  `${campaign.analytics?.sent ?? 0} offer DMs delivered`,
                  `${campaign.analytics?.clicks ?? 0} link opens`,
                  `${outcomes?.summary?.QUALIFIED_LEAD?.quantity ?? 0} qualified leads`,
                  `${outcomes?.summary?.BOOKING?.quantity ?? 0} bookings`,
                  `${outcomes?.summary?.SALE?.quantity ?? 0} sales`,
                ].join("\n"),
              })
            }
          >
            <Text className="text-xs font-medium text-accent">Share report</Text>
          </Pressable>
        </View>
        <View className="flex-row flex-wrap gap-4">
          <Stat label="Qualified" value={outcomes?.summary?.QUALIFIED_LEAD?.quantity ?? 0} />
          <Stat label="Bookings" value={outcomes?.summary?.BOOKING?.quantity ?? 0} />
          <Stat label="Sales" value={outcomes?.summary?.SALE?.quantity ?? 0} />
        </View>
        {canManage ? (
          <View className="mt-4 flex-row flex-wrap gap-2">
            {[
              ["QUALIFIED_LEAD", "+ Qualified"],
              ["BOOKING", "+ Booking"],
              ["SALE", "+ Sale"],
            ].map(([kind, label]) => (
              <Pressable
                key={kind}
                onPress={() => addOutcome.mutate(kind)}
                disabled={addOutcome.isPending}
                className="rounded-full border border-border px-3 py-2"
              >
                <Text className="text-xs font-medium text-foreground">{label}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </Card>

      <Card>
        <Text className="mb-3 text-sm font-semibold text-foreground">Details</Text>
        <Row label="Status" value={campaign.isActive ? "Active" : "Paused"} />
        <Row
          label="Match"
          value={campaign.matchAnyWord ? "Any word" : (campaign.keywords ?? []).join(", ") || "—"}
        />
        <Row
          label="Targeting"
          value={
            campaign.matchAnyPost
              ? "Any post"
              : campaign.pendingNextReel
                ? "Next post or reel"
                : campaign.postId
                  ? campaign.postUrl ?? "Specific post"
                  : "DMs and Story replies only"
          }
        />
        {campaign.dmTriggerEnabled && campaign.postId ? (
          <Row
            label="Also on"
            value={`DMs and Story replies${campaign.requireFollow ? " (followers only)" : ""}`}
          />
        ) : campaign.dmTriggerEnabled && (campaign.matchAnyPost || campaign.pendingNextReel) ? (
          <Row
            label="Also on"
            value={`DMs and Story replies${campaign.requireFollow ? " (followers only)" : ""}`}
          />
        ) : null}
        <Row label="DM message" value={campaign.dmMessage} multiline />
      </Card>

      {campaign.trackedLinks?.length ? (
        <Card>
          <Text className="mb-3 text-sm font-semibold text-foreground">Tracked links</Text>
          {campaign.trackedLinks.map((link) => (
            <View key={link.id} className="mb-3 border-b border-border pb-3">
              <Text className="text-sm text-foreground">{link.label}</Text>
              <Text className="text-xs text-muted" numberOfLines={1}>
                {link.trackedUrl}
              </Text>
              <Text className="mt-1 text-xs text-muted">{link._count?.clicks ?? 0} clicks</Text>
            </View>
          ))}
        </Card>
      ) : null}

      {canManage ? (
        <Pressable
          onPress={() => navigation.navigate("CampaignEdit", { id: campaign.id })}
          className="rounded-lg bg-accent px-4 py-3"
        >
          <Text className="text-center text-sm font-semibold text-background">Edit campaign</Text>
        </Pressable>
      ) : null}
    </ScrollView>
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

function Row({ label, value, multiline }) {
  return (
    <View className="mb-2">
      <Text className="text-xs text-muted">{label}</Text>
      <Text className="text-sm text-foreground" numberOfLines={multiline ? undefined : 1}>
        {value}
      </Text>
    </View>
  );
}
