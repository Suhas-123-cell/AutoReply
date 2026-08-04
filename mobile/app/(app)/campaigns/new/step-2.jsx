import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { validateStep2 } from "../../../../src/lib/campaign-validation";
import { useCampaignWizardStore } from "../../../../src/store/campaignWizardStore";
import KeywordChipInput from "../../../../src/ui/KeywordChipInput";
import Toggle from "../../../../src/ui/Toggle";
import WizardFooter from "../../../../src/ui/WizardFooter";

export default function WizardStep2() {
  const navigation = useNavigation();
  const draft = useCampaignWizardStore((s) => s.draft);
  const setFields = useCampaignWizardStore((s) => s.setFields);
  const [error, setError] = useState(null);

  const handleNext = () => {
    const err = validateStep2(draft);
    if (err) return setError(err);
    navigation.navigate("CampaignNewStep3");
  };

  return (
    <View className="flex-1 bg-background">
      <ScrollView contentContainerStyle={{ padding: 16, gap: 20 }}>
        <Text className="text-sm font-semibold text-foreground">And this comment has</Text>

        <View className="flex-row items-center justify-between rounded-lg border border-border px-3 py-3">
          <Text className="flex-1 pr-3 text-sm text-foreground">Match any word</Text>
          <Toggle
            value={draft.matchAnyWord}
            onValueChange={(value) => setFields({ matchAnyWord: value })}
          />
        </View>

        {!draft.matchAnyWord ? (
          <View className="gap-1.5">
            <Text className="text-xs font-medium text-muted">Keywords</Text>
            <KeywordChipInput
              keywords={draft.keywords}
              onChange={(keywords) => setFields({ keywords })}
            />
          </View>
        ) : null}

        <View className="flex-row items-center justify-between rounded-lg border border-border px-3 py-3">
          <View className="flex-1 pr-3">
            <Text className="text-sm text-foreground">Match whole words only</Text>
            <Text className="mt-0.5 text-xs text-muted">
              Off matches keywords inside longer words too (e.g. &quot;link&quot; inside &quot;linked&quot;).
            </Text>
          </View>
          <Toggle
            value={draft.wholeWordMatch}
            onValueChange={(value) => setFields({ wholeWordMatch: value })}
          />
        </View>
      </ScrollView>

      <WizardFooter
        step={2}
        error={error}
        onBack={() => navigation.goBack()}
        onNext={handleNext}
      />
    </View>
  );
}
