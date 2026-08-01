import { Pressable, Text, View } from "react-native";

/**
 * Shared bottom nav bar for the campaign creation wizard's 5 steps
 * (mobile/app/(app)/campaigns/new/*). Shows the step count, an inline
 * validation message (see src/lib/campaign-validation.js), and Back/Next.
 */
export default function WizardFooter({
  step,
  totalSteps = 5,
  error,
  onBack,
  backLabel = "Back",
  onNext,
  nextLabel = "Next",
  nextDisabled = false,
  nextLoading = false,
}) {
  return (
    <View className="gap-2 border-t border-border bg-background p-4">
      {error ? <Text className="text-sm text-error">{error}</Text> : null}
      <View className="flex-row items-center justify-between gap-3">
        <Text className="text-xs text-muted">
          Step {step} of {totalSteps}
        </Text>
        <View className="flex-row gap-2">
          {onBack ? (
            <Pressable
              onPress={onBack}
              className="rounded-lg border border-border px-4 py-2.5"
            >
              <Text className="text-sm font-medium text-foreground">{backLabel}</Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={onNext}
            disabled={nextDisabled || nextLoading}
            className={`rounded-lg px-5 py-2.5 ${
              nextDisabled || nextLoading ? "bg-accent-hover opacity-50" : "bg-accent"
            }`}
          >
            <Text className="text-sm font-semibold text-background">
              {nextLoading ? "Saving..." : nextLabel}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
