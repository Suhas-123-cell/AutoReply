import { Stack } from "expo-router";
import { colors } from "../../../src/ui/tokens";

// Same nested-Stack-inside-a-tab pattern as campaigns/_layout.jsx: more.jsx
// (M1 stub) becomes a menu (index.jsx) that pushes settings screens while
// keeping the tab bar visible.
export default function MoreLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.foreground,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="index" options={{ title: "More" }} />
      <Stack.Screen name="instagram" options={{ title: "Instagram" }} />
      <Stack.Screen name="members" options={{ title: "Team Members" }} />
      <Stack.Screen name="usage" options={{ title: "Usage" }} />
      <Stack.Screen name="account" options={{ title: "Account" }} />
      <Stack.Screen name="overview" options={{ title: "Insights" }} />
      <Stack.Screen name="diagnostics" options={{ title: "Diagnostics" }} />
      <Stack.Screen name="notifications" options={{ title: "Notifications" }} />
      <Stack.Screen name="security" options={{ title: "Security" }} />
    </Stack>
  );
}
