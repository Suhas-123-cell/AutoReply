import { Pressable, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

// Deep-link landing screen for openreply://ig-connect?status=...&reason=...
// (Meta -> /api/instagram/callback -> this route, opened via
// expo-web-browser's openAuthSessionAsync from the future Settings screen.)
const STATUS_COPY = {
  connected: { title: "Instagram connected", tone: "success" },
  already_connected: { title: "Account already connected", tone: "success" },
  denied: { title: "Connection cancelled", tone: "error" },
  invalid: { title: "Something went wrong", tone: "error" },
  forbidden: { title: "Not allowed", tone: "error" },
  failed: { title: "Connection failed", tone: "error" },
};

export default function IgConnectScreen() {
  const { status, reason } = useLocalSearchParams();
  const router = useRouter();
  const copy = STATUS_COPY[status] ?? { title: "Unknown status", tone: "error" };

  return (
    <View className="flex-1 items-center justify-center bg-background px-6">
      <Text
        className={`mb-2 text-xl font-bold ${
          copy.tone === "success" ? "text-success" : "text-error"
        }`}
      >
        {copy.title}
      </Text>
      {reason ? <Text className="mb-6 text-center text-sm text-muted">{reason}</Text> : null}

      <Pressable
        onPress={() => (router.canGoBack() ? router.back() : router.replace("/(app)/dashboard"))}
        className="rounded-lg bg-accent px-6 py-3"
      >
        <Text className="font-semibold text-background">Continue</Text>
      </Pressable>
    </View>
  );
}
