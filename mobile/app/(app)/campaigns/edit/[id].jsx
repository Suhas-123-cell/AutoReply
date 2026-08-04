import { useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiError } from "../../../../src/api/client";
import { useAuth } from "../../../../src/auth/AuthContext";
import { canManageWorkspace } from "../../../../src/lib/workspace-access";
import { validateAll } from "../../../../src/lib/campaign-validation";
import CampaignPreviewSheet from "../../../../src/ui/CampaignPreviewSheet";
import KeywordChipInput from "../../../../src/ui/KeywordChipInput";
import Skeleton from "../../../../src/ui/Skeleton";
import Toggle from "../../../../src/ui/Toggle";

// Full field set as a flat scrolling form (NOT a wizard — matches the web's
// edit affordance, components/campaign-builder.tsx in "edit" mode, which is
// a single form rather than a step flow). Only fields that changed from the
// loaded campaign are sent in the PATCH body, since updateAutomationSchema
// treats every field as independently optional (undefined = unchanged).
export default function EditCampaignScreen() {
  const { id } = useRoute().params ?? {};
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const { role } = useAuth();
  const canManage = canManageWorkspace(role);

  const { data: campaigns, isLoading } = useQuery({
    queryKey: ["campaigns", "all"],
    queryFn: () => apiFetch("/api/automations?instagramAccountId=all"),
  });
  const campaign = campaigns?.find((c) => c.id === id);

  const [form, setForm] = useState(null);
  const [initial, setInitial] = useState(null);
  const [error, setError] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [secondLinkOpen, setSecondLinkOpen] = useState(false);
  // Tracks which campaign id the form was last hydrated from, so the
  // one-time hydration below (which must run once campaign data arrives,
  // but never again after that — the user may have started editing) can be
  // done as a state adjustment during render instead of an effect. This is
  // React's own documented pattern for "adjust state when a prop changes":
  // https://react.dev/learn/you-might-not-need-an-effect
  const [hydratedFor, setHydratedFor] = useState(null);

  if (campaign && hydratedFor !== campaign.id) {
    const link = campaign.trackedLinks?.[0];
    const secondLink = campaign.trackedLinks?.[1];
    const hydrated = {
      name: campaign.name ?? "",
      triggerScope: campaign.matchAnyPost ? "any" : campaign.pendingNextReel ? "next" : "specific",
      postId: campaign.postId ?? null,
      postUrl: campaign.postUrl ?? null,
      keywords: campaign.keywords ?? [],
      matchAnyWord: Boolean(campaign.matchAnyWord),
      wholeWordMatch: campaign.wholeWordMatch ?? true,
      dmMessage: campaign.dmMessage ?? "",
      openingDmEnabled: Boolean(campaign.openingDmEnabled),
      openingDmMessage: campaign.openingDmMessage ?? "",
      openingDmButtonLabel: campaign.openingDmButtonLabel ?? "",
      requireFollow: Boolean(campaign.requireFollow),
      followPromptMessage: campaign.followPromptMessage ?? "",
      followPromptButtonLabel: campaign.followPromptButtonLabel ?? "i'm following",
      trackedDestinationUrl: link?.destinationUrl ?? "",
      linkButtonLabel: campaign.linkButtonLabel ?? "Open link",
      secondaryDestinationUrl: secondLink?.destinationUrl ?? "",
      secondaryButtonLabel: secondLink?.label ?? "Open link",
      followUpEnabled: Boolean(campaign.followUpEnabled),
      followUpMessage: campaign.followUpMessage ?? "",
      publicReplyEnabled: Boolean(campaign.publicReplyEnabled),
      publicReplyMessages: campaign.publicReplyMessages?.length
        ? campaign.publicReplyMessages
        : campaign.publicReplyMessage
          ? [campaign.publicReplyMessage]
          : [""],
      isActive: Boolean(campaign.isActive),
    };
    setForm(hydrated);
    setInitial(hydrated);
    setLinkOpen(Boolean(hydrated.trackedDestinationUrl));
    setSecondLinkOpen(Boolean(hydrated.secondaryDestinationUrl));
    setHydratedFor(campaign.id);
  }

  const update = useMutation({
    mutationFn: (body) => apiFetch(`/api/automations?id=${id}`, { method: "PATCH", body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      navigation.goBack();
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : "Could not update campaign");
    },
  });

  const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = () => {
    if (!form) return;
    const err = validateAll({ ...form, instagramAccountId: campaign.instagramAccountId });
    if (err) return setError(err);
    setError(null);

    const full = {
      name: form.name.trim(),
      postId: form.triggerScope === "specific" ? form.postId : null,
      postUrl: form.triggerScope === "specific" ? form.postUrl : null,
      matchAnyPost: form.triggerScope === "any",
      pendingNextReel: form.triggerScope === "next",
      matchAnyWord: form.matchAnyWord,
      keywords: form.matchAnyWord ? [] : form.keywords,
      wholeWordMatch: form.wholeWordMatch,
      dmMessage: form.dmMessage.trim(),
      openingDmEnabled: form.openingDmEnabled,
      openingDmMessage: form.openingDmEnabled ? form.openingDmMessage.trim() : null,
      openingDmButtonLabel: form.openingDmEnabled ? form.openingDmButtonLabel.trim() : null,
      requireFollow: form.requireFollow,
      followPromptMessage: form.requireFollow ? form.followPromptMessage.trim() : "",
      followPromptButtonLabel: form.requireFollow
        ? form.followPromptButtonLabel.trim() || "i'm following"
        : "",
      trackedDestinationUrl: form.trackedDestinationUrl.trim() || "",
      secondaryDestinationUrl: form.secondaryDestinationUrl.trim() || "",
      secondaryButtonLabel: form.secondaryButtonLabel.trim() || "Open link",
      followUpEnabled: form.followUpEnabled,
      followUpMessage: form.followUpEnabled ? form.followUpMessage.trim() : "",
      publicReplyEnabled: form.publicReplyEnabled,
      publicReplyMessages: form.publicReplyEnabled
        ? form.publicReplyMessages.map((m) => m.trim()).filter(Boolean)
        : [],
      isActive: form.isActive,
    };

    // Only send fields that actually changed from the loaded campaign —
    // updateAutomationSchema treats every field as independently optional.
    const initialFull = {
      name: initial.name,
      postId: initial.triggerScope === "specific" ? initial.postId : null,
      postUrl: initial.triggerScope === "specific" ? initial.postUrl : null,
      matchAnyPost: initial.triggerScope === "any",
      pendingNextReel: initial.triggerScope === "next",
      matchAnyWord: initial.matchAnyWord,
      keywords: initial.matchAnyWord ? [] : initial.keywords,
      wholeWordMatch: initial.wholeWordMatch,
      dmMessage: initial.dmMessage,
      openingDmEnabled: initial.openingDmEnabled,
      openingDmMessage: initial.openingDmEnabled ? initial.openingDmMessage : null,
      openingDmButtonLabel: initial.openingDmEnabled ? initial.openingDmButtonLabel : null,
      requireFollow: initial.requireFollow,
      followPromptMessage: initial.requireFollow ? initial.followPromptMessage : "",
      followPromptButtonLabel: initial.requireFollow ? initial.followPromptButtonLabel : "",
      trackedDestinationUrl: initial.trackedDestinationUrl,
      secondaryDestinationUrl: initial.secondaryDestinationUrl,
      secondaryButtonLabel: initial.secondaryButtonLabel,
      followUpEnabled: initial.followUpEnabled,
      followUpMessage: initial.followUpEnabled ? initial.followUpMessage : "",
      publicReplyEnabled: initial.publicReplyEnabled,
      publicReplyMessages: initial.publicReplyEnabled
        ? initial.publicReplyMessages.map((m) => m.trim()).filter(Boolean)
        : [],
      isActive: initial.isActive,
    };

    const diff = {};
    for (const key of Object.keys(full)) {
      if (JSON.stringify(full[key]) !== JSON.stringify(initialFull[key])) {
        diff[key] = full[key];
      }
    }

    // The server's PATCH handler only applies secondaryButtonLabel when it
    // also receives a defined secondaryDestinationUrl (that's what gates
    // the whole "update the second tracked link" block) — see
    // app/api/automations/route.ts. If only the label changed, the URL
    // wouldn't otherwise be in this diff (it's unchanged), and the label
    // edit would silently be dropped with no error. Send both whenever
    // either changed.
    if ("secondaryButtonLabel" in diff && !("secondaryDestinationUrl" in diff)) {
      diff.secondaryDestinationUrl = full.secondaryDestinationUrl;
    }

    if (Object.keys(diff).length === 0) return navigation.goBack();
    update.mutate(diff);
  };

  if (!canManage) {
    return (
      <View className="flex-1 items-center justify-center bg-background p-6">
        <Text className="text-center text-sm text-muted">
          Only workspace owners and admins can edit campaigns.
        </Text>
      </View>
    );
  }

  if (isLoading || !form) {
    return (
      <View className="flex-1 gap-3 bg-background p-4">
        <Skeleton className="h-10" />
        <Skeleton className="h-10" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
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

  const publicReplyMessages = form.publicReplyMessages.length ? form.publicReplyMessages : [""];

  return (
    <View className="flex-1 bg-background">
      <ScrollView contentContainerStyle={{ padding: 16, gap: 20 }}>
        <View className="flex-row items-center justify-between">
          <Text className="text-lg font-bold text-foreground">Edit campaign</Text>
          <Pressable onPress={() => setPreviewOpen(true)}>
            <Text className="text-sm font-medium text-accent">Preview</Text>
          </Pressable>
        </View>

        <Field label="Campaign name">
          <TextInput
            value={form.name}
            onChangeText={(text) => setField("name", text)}
            placeholderTextColor="#9b9ba3"
            maxLength={100}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-foreground"
          />
        </Field>

        <Section title="And this comment has">
          <View className="flex-row items-center justify-between rounded-lg border border-border px-3 py-3">
            <Text className="flex-1 pr-3 text-sm text-foreground">Match any word</Text>
            <Toggle
              value={form.matchAnyWord}
              onValueChange={(value) => setField("matchAnyWord", value)}
            />
          </View>
          {!form.matchAnyWord ? (
            <KeywordChipInput
              keywords={form.keywords}
              onChange={(keywords) => setField("keywords", keywords)}
            />
          ) : null}
          <View className="flex-row items-center justify-between rounded-lg border border-border px-3 py-3">
            <Text className="flex-1 pr-3 text-sm text-foreground">Match whole words only</Text>
            <Toggle
              value={form.wholeWordMatch}
              onValueChange={(value) => setField("wholeWordMatch", value)}
            />
          </View>
        </Section>

        <Section title="They will get">
          <View className="gap-3 rounded-lg border border-border p-3">
            <View className="flex-row items-center justify-between">
              <Text className="flex-1 pr-3 text-sm text-foreground">An opening DM</Text>
              <Toggle
                value={form.openingDmEnabled}
                onValueChange={(value) => setField("openingDmEnabled", value)}
              />
            </View>
            {form.openingDmEnabled ? (
              <View className="gap-2">
                <TextInput
                  value={form.openingDmMessage}
                  onChangeText={(text) => setField("openingDmMessage", text)}
                  placeholderTextColor="#9b9ba3"
                  multiline
                  numberOfLines={3}
                  maxLength={1000}
                  className="rounded-lg border border-border bg-surface px-3 py-2 text-foreground"
                  style={{ minHeight: 76, textAlignVertical: "top" }}
                />
                <TextInput
                  value={form.openingDmButtonLabel}
                  onChangeText={(text) => setField("openingDmButtonLabel", text)}
                  placeholderTextColor="#9b9ba3"
                  maxLength={64}
                  className="rounded-lg border border-border bg-surface px-3 py-2 text-foreground"
                />
              </View>
            ) : null}
          </View>

          <View className="gap-3 rounded-lg border border-border p-3">
            <View className="flex-row items-center justify-between">
              <Text className="flex-1 pr-3 text-sm text-foreground">A follow requirement first</Text>
              <Toggle
                value={form.requireFollow}
                onValueChange={(value) => setField("requireFollow", value)}
              />
            </View>
            {form.requireFollow ? (
              <View className="gap-2">
                <TextInput
                  value={form.followPromptMessage}
                  onChangeText={(text) => setField("followPromptMessage", text)}
                  placeholderTextColor="#9b9ba3"
                  multiline
                  numberOfLines={3}
                  maxLength={1000}
                  className="rounded-lg border border-border bg-surface px-3 py-2 text-foreground"
                  style={{ minHeight: 76, textAlignVertical: "top" }}
                />
                <TextInput
                  value={form.followPromptButtonLabel}
                  onChangeText={(text) => setField("followPromptButtonLabel", text)}
                  placeholderTextColor="#9b9ba3"
                  maxLength={20}
                  className="rounded-lg border border-border bg-surface px-3 py-2 text-foreground"
                />
              </View>
            ) : null}
          </View>
        </Section>

        <Section title="And then, they will get">
          <View className="gap-3 rounded-lg border border-border p-3">
            <Text className="text-sm text-foreground">A DM with a link</Text>
            <TextInput
              value={form.dmMessage}
              onChangeText={(text) => setField("dmMessage", text)}
              placeholderTextColor="#9b9ba3"
              multiline
              numberOfLines={4}
              maxLength={1000}
              className="rounded-lg border border-border bg-surface px-3 py-2 text-foreground"
              style={{ minHeight: 96, textAlignVertical: "top" }}
            />
            {linkOpen ? (
              <View className="gap-2">
                <TextInput
                  value={form.trackedDestinationUrl}
                  onChangeText={(text) => setField("trackedDestinationUrl", text)}
                  placeholder="https://yourlink.com/offer"
                  placeholderTextColor="#9b9ba3"
                  autoCapitalize="none"
                  keyboardType="url"
                  className="rounded-lg border border-border bg-surface px-3 py-2 text-foreground"
                />
                <TextInput
                  value={form.linkButtonLabel}
                  onChangeText={(text) => setField("linkButtonLabel", text)}
                  placeholderTextColor="#9b9ba3"
                  maxLength={20}
                  className="rounded-lg border border-border bg-surface px-3 py-2 text-foreground"
                />
                {secondLinkOpen ? (
                  <View className="gap-2 border-t border-border pt-2">
                    <TextInput
                      value={form.secondaryDestinationUrl}
                      onChangeText={(text) => setField("secondaryDestinationUrl", text)}
                      placeholder="https://yourlink.com/second"
                      placeholderTextColor="#9b9ba3"
                      autoCapitalize="none"
                      keyboardType="url"
                      className="rounded-lg border border-border bg-surface px-3 py-2 text-foreground"
                    />
                    <TextInput
                      value={form.secondaryButtonLabel}
                      onChangeText={(text) => setField("secondaryButtonLabel", text)}
                      placeholderTextColor="#9b9ba3"
                      maxLength={20}
                      className="rounded-lg border border-border bg-surface px-3 py-2 text-foreground"
                    />
                  </View>
                ) : (
                  <Pressable
                    onPress={() => setSecondLinkOpen(true)}
                    className="rounded-lg border border-border py-2"
                  >
                    <Text className="text-center text-sm text-muted">+ Add a second link</Text>
                  </Pressable>
                )}
              </View>
            ) : (
              <Pressable
                onPress={() => setLinkOpen(true)}
                className="rounded-lg border border-border py-2"
              >
                <Text className="text-center text-sm text-muted">+ Add a link</Text>
              </Pressable>
            )}
          </View>

          <View className="gap-3 rounded-lg border border-border p-3">
            <View className="flex-row items-center justify-between">
              <Text className="flex-1 pr-3 text-sm text-foreground">A follow-up thank-you message</Text>
              <Toggle
                value={form.followUpEnabled}
                onValueChange={(value) => setField("followUpEnabled", value)}
              />
            </View>
            {form.followUpEnabled ? (
              <TextInput
                value={form.followUpMessage}
                onChangeText={(text) => setField("followUpMessage", text)}
                placeholderTextColor="#9b9ba3"
                multiline
                numberOfLines={3}
                maxLength={1000}
                className="rounded-lg border border-border bg-surface px-3 py-2 text-foreground"
                style={{ minHeight: 76, textAlignVertical: "top" }}
              />
            ) : null}
          </View>

          <View className="gap-3 rounded-lg border border-border p-3">
            <View className="flex-row items-center justify-between">
              <Text className="flex-1 pr-3 text-sm text-foreground">
                A public reply under their comment
              </Text>
              <Toggle
                value={form.publicReplyEnabled}
                onValueChange={(value) => setField("publicReplyEnabled", value)}
              />
            </View>
            {form.publicReplyEnabled ? (
              <View className="gap-2">
                {publicReplyMessages.map((msg, i) => (
                  <View key={i} className="flex-row items-center gap-2">
                    <TextInput
                      value={msg}
                      onChangeText={(text) =>
                        setField(
                          "publicReplyMessages",
                          publicReplyMessages.map((m, idx) => (idx === i ? text : m))
                        )
                      }
                      placeholderTextColor="#9b9ba3"
                      maxLength={1000}
                      className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-foreground"
                    />
                    {publicReplyMessages.length > 1 ? (
                      <Pressable
                        onPress={() =>
                          setField(
                            "publicReplyMessages",
                            publicReplyMessages.filter((_, idx) => idx !== i)
                          )
                        }
                        hitSlop={8}
                      >
                        <Text className="px-1 text-muted">✕</Text>
                      </Pressable>
                    ) : null}
                  </View>
                ))}
                {publicReplyMessages.length < 10 ? (
                  <Pressable
                    onPress={() =>
                      setField("publicReplyMessages", [...publicReplyMessages, ""])
                    }
                  >
                    <Text className="text-xs font-medium text-accent">+ Add another reply</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </View>
        </Section>

        <View className="flex-row items-center justify-between">
          <Text className="text-sm text-foreground">Active</Text>
          <Toggle value={form.isActive} onValueChange={(value) => setField("isActive", value)} />
        </View>

        {error ? <Text className="text-sm text-error">{error}</Text> : null}

        <Pressable
          onPress={handleSubmit}
          disabled={update.isPending}
          className={`rounded-lg px-4 py-3 ${update.isPending ? "bg-accent-hover opacity-60" : "bg-accent"}`}
        >
          <Text className="text-center text-sm font-semibold text-background">
            {update.isPending ? "Saving..." : "Save changes"}
          </Text>
        </Pressable>
      </ScrollView>

      <CampaignPreviewSheet
        visible={previewOpen}
        onClose={() => setPreviewOpen(false)}
        draft={form}
      />
    </View>
  );
}

function Field({ label, children }) {
  return (
    <View className="gap-1.5">
      <Text className="text-xs font-medium text-muted">{label}</Text>
      {children}
    </View>
  );
}

function Section({ title, children }) {
  return (
    <View className="gap-3">
      <Text className="text-sm font-semibold text-foreground">{title}</Text>
      {children}
    </View>
  );
}
