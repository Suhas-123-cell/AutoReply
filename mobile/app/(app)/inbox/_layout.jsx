import { Stack } from "expo-router";

// Inbox is a list+thread pattern (mirrors app/(dashboard)/inbox/page.tsx on
// the web): a conversation list that pushes to a thread-detail screen.
// Both screens build their own header row, so the native stack header stays
// hidden here.
export default function InboxLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="[conversationId]" />
    </Stack>
  );
}
