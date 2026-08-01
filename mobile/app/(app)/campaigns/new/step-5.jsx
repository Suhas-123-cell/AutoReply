import { useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiError } from "../../../../src/api/client";
import { buildAutomationPayload, validateStep5 } from "../../../../src/lib/campaign-validation";
import { useCampaignWizardStore } from "../../../../src/store/campaignWizardStore";
import CampaignPreviewSheet from "../../../../src/ui/CampaignPreviewSheet";
import Toggle from "../../../../src/ui/Toggle";
import WizardFooter from "../../../../src/ui/WizardFooter";

export default function WizardStep5() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const draft = useCampaignWizardStore((s) => s.draft);
  const setFields = useCampaignWizardStore((s) => s.setFields);
  const reset = useCampaignWizardStore((s) => s.reset);
  const [error, setError] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const create = useMutation({
    mutationFn: (body) => apiFetch("/api/automations", { method: "POST", body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      reset();
      router.dismissAll();
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : "Could not create campaign");
    },
  });

  const publicReplyMessages = draft.publicReplyMessages.length ? draft.publicReplyMessages : [""];

  const updateReplyAt = (index, text) => {
    setFields({
      publicReplyMessages: publicReplyMessages.map((m, i) => (i === index ? text : m)),
    });
  };

  const removeReplyAt = (index) => {
    setFields({ publicReplyMessages: publicReplyMessages.filter((_, i) => i !== index) });
  };

  const addReply = () => {
    if (publicReplyMessages.length >= 10) return;
    setFields({ publicReplyMessages: [...publicReplyMessages, ""] });
  };

  const handleSubmit = () => {
    const err = validateStep5(draft);
    if (err) return setError(err);
    setError(null);
    create.mutate(buildAutomationPayload(draft));
  };

  return (
    <View className="flex-1 bg-background">
      <ScrollView contentContainerStyle={{ padding: 16, gap: 20 }}>
        <View className="flex-row items-center justify-between">
          <Text className="text-sm font-semibold text-foreground">And then, they will get</Text>
          <Pressable onPress={() => setPreviewOpen(true)}>
            <Text className="text-sm font-medium text-accent">Preview</Text>
          </Pressable>
        </View>

        <View className="gap-3 rounded-lg border border-border p-3">
          <View className="flex-row items-center justify-between">
            <Text className="flex-1 pr-3 text-sm text-foreground">A follow-up thank-you message</Text>
            <Toggle
              value={draft.followUpEnabled}
              onValueChange={(value) => setFields({ followUpEnabled: value })}
            />
          </View>
          {draft.followUpEnabled ? (
            <TextInput
              value={draft.followUpMessage}
              onChangeText={(text) => setFields({ followUpMessage: text })}
              placeholder="Btw thanks for following, I appreciate it 🙌"
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
              value={draft.publicReplyEnabled}
              onValueChange={(value) => setFields({ publicReplyEnabled: value })}
            />
          </View>
          {draft.publicReplyEnabled ? (
            <View className="gap-2">
              {publicReplyMessages.map((msg, i) => (
                <View key={i} className="flex-row items-center gap-2">
                  <TextInput
                    value={msg}
                    onChangeText={(text) => updateReplyAt(i, text)}
                    placeholder="Sent you a DM! 📩"
                    placeholderTextColor="#9b9ba3"
                    maxLength={1000}
                    className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-foreground"
                  />
                  {publicReplyMessages.length > 1 ? (
                    <Pressable onPress={() => removeReplyAt(i)} hitSlop={8}>
                      <Text className="px-1 text-muted">✕</Text>
                    </Pressable>
                  ) : null}
                </View>
              ))}
              {publicReplyMessages.length < 10 ? (
                <Pressable onPress={addReply}>
                  <Text className="text-xs font-medium text-accent">+ Add another reply</Text>
                </Pressable>
              ) : null}
              <Text className="text-xs text-muted">
                One is picked at random each time, so replies don&apos;t look identical.
              </Text>
            </View>
          ) : null}
        </View>

        <View className="gap-1.5">
          <Text className="text-xs font-medium text-muted">Campaign name</Text>
          <TextInput
            value={draft.name}
            onChangeText={(text) => setFields({ name: text })}
            placeholder="Comment giveaway"
            placeholderTextColor="#9b9ba3"
            maxLength={100}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-foreground"
          />
        </View>

        <View className="flex-row items-center justify-between">
          <Text className="text-sm text-foreground">Active</Text>
          <Toggle
            value={draft.isActive}
            onValueChange={(value) => setFields({ isActive: value })}
          />
        </View>
      </ScrollView>

      <WizardFooter
        step={5}
        error={error}
        onBack={() => router.back()}
        onNext={handleSubmit}
        nextLabel="Create campaign"
        nextLoading={create.isPending}
      />

      <CampaignPreviewSheet
        visible={previewOpen}
        onClose={() => setPreviewOpen(false)}
        draft={draft}
      />
    </View>
  );
}
