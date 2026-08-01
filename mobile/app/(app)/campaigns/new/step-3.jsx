import { useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { validateStep3 } from "../../../../src/lib/campaign-validation";
import { useCampaignWizardStore } from "../../../../src/store/campaignWizardStore";
import CampaignPreviewSheet from "../../../../src/ui/CampaignPreviewSheet";
import Toggle from "../../../../src/ui/Toggle";
import WizardFooter from "../../../../src/ui/WizardFooter";

export default function WizardStep3() {
  const router = useRouter();
  const draft = useCampaignWizardStore((s) => s.draft);
  const setFields = useCampaignWizardStore((s) => s.setFields);
  const [error, setError] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const handleNext = () => {
    const err = validateStep3(draft);
    if (err) return setError(err);
    router.push("/campaigns/new/step-4");
  };

  return (
    <View className="flex-1 bg-background">
      <ScrollView contentContainerStyle={{ padding: 16, gap: 20 }}>
        <View className="flex-row items-center justify-between">
          <Text className="text-sm font-semibold text-foreground">They will get</Text>
          <Pressable onPress={() => setPreviewOpen(true)}>
            <Text className="text-sm font-medium text-accent">Preview</Text>
          </Pressable>
        </View>

        <View className="gap-3 rounded-lg border border-border p-3">
          <View className="flex-row items-center justify-between">
            <Text className="flex-1 pr-3 text-sm text-foreground">
              An opening DM before the reveal
            </Text>
            <Toggle
              value={draft.openingDmEnabled}
              onValueChange={(value) => setFields({ openingDmEnabled: value })}
            />
          </View>
          {draft.openingDmEnabled ? (
            <View className="gap-2">
              <TextInput
                value={draft.openingDmMessage}
                onChangeText={(text) => setFields({ openingDmMessage: text })}
                placeholder="Hey there! I'm so happy you're here 😊"
                placeholderTextColor="#9b9ba3"
                multiline
                numberOfLines={3}
                maxLength={1000}
                className="rounded-lg border border-border bg-surface px-3 py-2 text-foreground"
                style={{ minHeight: 76, textAlignVertical: "top" }}
              />
              <TextInput
                value={draft.openingDmButtonLabel}
                onChangeText={(text) => setFields({ openingDmButtonLabel: text })}
                placeholder="Send me the link"
                placeholderTextColor="#9b9ba3"
                maxLength={64}
                className="rounded-lg border border-border bg-surface px-3 py-2 text-foreground"
              />
            </View>
          ) : null}
        </View>

        <View className="gap-3 rounded-lg border border-border p-3">
          <View className="flex-row items-center justify-between">
            <Text className="flex-1 pr-3 text-sm text-foreground">
              A follow requirement first
            </Text>
            <Toggle
              value={draft.requireFollow}
              onValueChange={(value) => setFields({ requireFollow: value })}
            />
          </View>
          {draft.requireFollow ? (
            <View className="gap-2">
              <TextInput
                value={draft.followPromptMessage}
                onChangeText={(text) => setFields({ followPromptMessage: text })}
                placeholder="Quick favor before I send your link — tap the button once you're following."
                placeholderTextColor="#9b9ba3"
                multiline
                numberOfLines={3}
                maxLength={1000}
                className="rounded-lg border border-border bg-surface px-3 py-2 text-foreground"
                style={{ minHeight: 76, textAlignVertical: "top" }}
              />
              <TextInput
                value={draft.followPromptButtonLabel}
                onChangeText={(text) => setFields({ followPromptButtonLabel: text })}
                placeholder="i'm following"
                placeholderTextColor="#9b9ba3"
                maxLength={20}
                className="rounded-lg border border-border bg-surface px-3 py-2 text-foreground"
              />
              <Text className="text-xs text-muted">
                We send the link only after they tap the button and Instagram confirms the
                follow. If it can&apos;t be verified, we send it anyway.
              </Text>
            </View>
          ) : null}
        </View>
      </ScrollView>

      <WizardFooter
        step={3}
        error={error}
        onBack={() => router.back()}
        onNext={handleNext}
      />

      <CampaignPreviewSheet
        visible={previewOpen}
        onClose={() => setPreviewOpen(false)}
        draft={draft}
      />
    </View>
  );
}
