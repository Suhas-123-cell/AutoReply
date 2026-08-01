import { Stack } from "expo-router";
import { colors } from "../../../../src/ui/tokens";

// Nested Stack for the 5-step campaign creation wizard. The outer
// campaigns/_layout.jsx pushes "new" as a modal (headerShown: false there) —
// this inner Stack owns the per-step headers so each step gets its own
// title/back button while the whole flow still slides up as one sheet.
//
// index.jsx is step 1 (account + trigger scope) rather than a separate
// "step-1.jsx" + redirect: expo-router resolves a directory route to its
// index file by default, so this avoids an extra redirect hop.
export default function NewCampaignWizardLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.foreground,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="index" options={{ title: "New campaign" }} />
      <Stack.Screen name="step-2" options={{ title: "Keywords" }} />
      <Stack.Screen name="step-3" options={{ title: "Opening DM" }} />
      <Stack.Screen name="step-4" options={{ title: "Reveal message" }} />
      <Stack.Screen name="step-5" options={{ title: "Finish up" }} />
      <Stack.Screen
        name="post-picker"
        options={{ title: "Choose a post", presentation: "modal" }}
      />
    </Stack>
  );
}
