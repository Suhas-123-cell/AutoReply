import { useMemo } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../../../src/api/client";
import { useAuth } from "../../../src/auth/AuthContext";
import { canManageWorkspace } from "../../../src/lib/workspace-access";
import Card from "../../../src/ui/Card";
import Skeleton from "../../../src/ui/Skeleton";

export default function CampaignDetailScreen() {
  const { id } = useRoute().params ?? {};
  const navigation = useNavigation();
  const { role } = useAuth();
  const canManage = canManageWorkspace(role);

  // Always fetches the unfiltered list so a detail screen opened from any
  // account filter on the list screen can still resolve the campaign.
  const { data: campaigns, isLoading } = useQuery({
    queryKey: ["campaigns", "all"],
    queryFn: () => apiFetch("/api/automations?instagramAccountId=all"),
  });

  const campaign = useMemo(() => campaigns?.find((c) => c.id === id), [campaigns, id]);

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
          <Stat label="Sent" value={campaign.analytics?.sent ?? 0} />
          <Stat label="Skipped" value={campaign.analytics?.skipped ?? 0} />
          <Stat label="Failed" value={campaign.analytics?.failed ?? 0} />
          <Stat label="Clicks" value={campaign.analytics?.clicks ?? 0} />
          <Stat label="CTR" value={`${campaign.analytics?.ctr ?? 0}%`} />
        </View>
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
                ? "Next reel"
                : campaign.postUrl ?? "Specific post"
          }
        />
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
