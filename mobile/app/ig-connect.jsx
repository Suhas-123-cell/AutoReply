import { Pressable, Text, View } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { useAuth } from "../src/auth/AuthContext";

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
  const { status, reason } = useRoute().params ?? {};
  const navigation = useNavigation();
  const { isSignedIn } = useAuth();
  const copy = STATUS_COPY[status] ?? { title: "Unknown status", tone: "error" };

  const handleContinue = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      // No back stack (e.g. this deep link was the very first screen to
      // mount) — land on whichever root entry point matches auth state,
      // same as the old router.replace("/(app)/dashboard") fallback.
      navigation.reset({ index: 0, routes: [{ name: isSignedIn ? "AppTabs" : "AuthStack" }] });
    }
  };

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

      <Pressable onPress={handleContinue} className="rounded-lg bg-accent px-6 py-3">
        <Text className="font-semibold text-background">Continue</Text>
      </Pressable>
    </View>
  );
}
