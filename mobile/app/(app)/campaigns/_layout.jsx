import { Stack } from "expo-router";
import { colors } from "../../../src/ui/tokens";

// campaigns.jsx (M1 stub) becomes a nested Stack: the tab shows the list
// (index.jsx) and pushing new/[id]/edit screens keeps the tab bar visible
// (the outer Tabs layout in (app)/_layout.jsx owns the tab bar; this Stack
// only replaces the content area for this one tab).
export default function CampaignsLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.foreground,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="index" options={{ title: "Campaigns" }} />
      <Stack.Screen name="[id]" options={{ title: "Campaign" }} />
      {/* "new" is a directory (its own nested Stack, see new/_layout.jsx) that
          owns per-step headers, so this screen's header is hidden and only
          the modal presentation is set here. */}
      <Stack.Screen name="new" options={{ presentation: "modal", headerShown: false }} />
      <Stack.Screen name="edit/[id]" options={{ title: "Edit Campaign", presentation: "modal" }} />
    </Stack>
  );
}
