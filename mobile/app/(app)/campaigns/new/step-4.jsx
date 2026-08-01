import { useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { validateStep4 } from "../../../../src/lib/campaign-validation";
import { useCampaignWizardStore } from "../../../../src/store/campaignWizardStore";
import CampaignPreviewSheet from "../../../../src/ui/CampaignPreviewSheet";
import WizardFooter from "../../../../src/ui/WizardFooter";

export default function WizardStep4() {
  const router = useRouter();
  const draft = useCampaignWizardStore((s) => s.draft);
  const setFields = useCampaignWizardStore((s) => s.setFields);
  const [error, setError] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(Boolean(draft.trackedDestinationUrl));
  const [secondLinkOpen, setSecondLinkOpen] = useState(Boolean(draft.secondaryDestinationUrl));

  const handleNext = () => {
    const err = validateStep4(draft);
    if (err) return setError(err);
    router.push("/campaigns/new/step-5");
  };

  return (
    <View className="flex-1 bg-background">
      <ScrollView contentContainerStyle={{ padding: 16, gap: 20 }}>
        <View className="flex-row items-center justify-between">
          <Text className="text-sm font-semibold text-foreground">Reveal DM</Text>
          <Pressable onPress={() => setPreviewOpen(true)}>
            <Text className="text-sm font-medium text-accent">Preview</Text>
          </Pressable>
        </View>

        <View className="gap-3 rounded-lg border border-border p-3">
          <Text className="text-sm text-foreground">A DM with a link</Text>
          <TextInput
            value={draft.dmMessage}
            onChangeText={(text) => setFields({ dmMessage: text })}
            placeholder="Thanks for the comment! Here's the link {link}"
            placeholderTextColor="#9b9ba3"
            multiline
            numberOfLines={4}
            maxLength={1000}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-foreground"
            style={{ minHeight: 96, textAlignVertical: "top" }}
          />
          <Text className="text-xs text-muted">
            {"{link}"} inserts the tracked link; {"{username}"} personalizes it.
          </Text>

          {linkOpen ? (
            <View className="gap-2">
              <TextInput
                value={draft.trackedDestinationUrl}
                onChangeText={(text) => setFields({ trackedDestinationUrl: text })}
                placeholder="https://yourlink.com/offer"
                placeholderTextColor="#9b9ba3"
                autoCapitalize="none"
                keyboardType="url"
                className="rounded-lg border border-border bg-surface px-3 py-2 text-foreground"
              />
              <TextInput
                value={draft.linkButtonLabel}
                onChangeText={(text) => setFields({ linkButtonLabel: text })}
                placeholder="Button label (e.g. Open link)"
                placeholderTextColor="#9b9ba3"
                maxLength={20}
                className="rounded-lg border border-border bg-surface px-3 py-2 text-foreground"
              />

              {secondLinkOpen ? (
                <View className="gap-2 border-t border-border pt-2">
                  <TextInput
                    value={draft.secondaryDestinationUrl}
                    onChangeText={(text) => setFields({ secondaryDestinationUrl: text })}
                    placeholder="https://yourlink.com/second"
                    placeholderTextColor="#9b9ba3"
                    autoCapitalize="none"
                    keyboardType="url"
                    className="rounded-lg border border-border bg-surface px-3 py-2 text-foreground"
                  />
                  <TextInput
                    value={draft.secondaryButtonLabel}
                    onChangeText={(text) => setFields({ secondaryButtonLabel: text })}
                    placeholder="Second button label"
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
      </ScrollView>

      <WizardFooter
        step={4}
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
