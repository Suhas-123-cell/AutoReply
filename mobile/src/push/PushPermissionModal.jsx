import { useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../ui/tokens";
import { registerForPushNotificationsAsync } from "./register";

/**
 * Pre-permission explainer shown at most once per install (gated by the
 * caller checking hasSeenPushPrimer() — see app/_layout.jsx) before the OS
 * permission dialog ever fires. A denied iOS permission can only be
 * reversed in Settings, so this is the one chance to make the case first.
 */
export default function PushPermissionModal({ visible, onDone }) {
  const [requesting, setRequesting] = useState(false);

  const handleEnable = async () => {
    setRequesting(true);
    try {
      await registerForPushNotificationsAsync();
    } finally {
      setRequesting(false);
      onDone();
    }
  };

  return (
    <Modal visible={visible} animationType="fade" transparent>
      <View className="flex-1 items-center justify-center bg-black/70 px-6">
        <View className="w-full max-w-sm rounded-xl border border-border bg-surface p-6">
          <View className="mb-4 h-12 w-12 items-center justify-center rounded-full bg-accent/20">
            <Ionicons name="notifications-outline" size={24} color={colors.accent} />
          </View>
          <Text className="text-lg font-bold text-foreground">Stay on top of new leads</Text>
          <Text className="mt-2 text-sm text-muted">
            Get notified the moment a comment turns into a DM, or if a send fails and needs
            attention. You can turn this off anytime in More → Notifications.
          </Text>

          <Pressable
            onPress={handleEnable}
            disabled={requesting}
            className={`mt-6 items-center rounded-lg py-3 ${
              requesting ? "bg-accent-hover opacity-60" : "bg-accent"
            }`}
          >
            <Text className="font-semibold text-background">
              {requesting ? "Enabling..." : "Enable notifications"}
            </Text>
          </Pressable>

          <Pressable onPress={onDone} disabled={requesting} className="mt-3 items-center py-2">
            <Text className="text-sm text-muted">Not now</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
