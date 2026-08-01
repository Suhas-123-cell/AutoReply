import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "./tokens";

/**
 * Full-screen lock shown by app/_layout.jsx when biometric lock is enabled
 * and the app returns to foreground after being backgrounded for a while.
 * "Sign out instead" is always visible — a user whose Face ID/fingerprint
 * fails for any reason (hardware issue, changed enrollment, etc.) must
 * always have a way out that isn't "stay locked out forever".
 */
export default function BiometricLockOverlay({ onUnlock, onSignOut }) {
  return (
    <View className="absolute inset-0 z-50 items-center justify-center bg-background px-6">
      <View className="mb-6 h-16 w-16 items-center justify-center rounded-full bg-surface">
        <Ionicons name="lock-closed-outline" size={28} color={colors.accent} />
      </View>
      <Text className="text-lg font-bold text-foreground">OpenReply is locked</Text>
      <Text className="mt-2 text-center text-sm text-muted">
        Unlock with Face ID / Touch ID to continue.
      </Text>

      <Pressable onPress={onUnlock} className="mt-8 items-center rounded-lg bg-accent px-6 py-3">
        <Text className="font-semibold text-background">Unlock</Text>
      </Pressable>

      <Pressable onPress={onSignOut} className="mt-4 items-center py-2">
        <Text className="text-sm text-muted">Sign out instead</Text>
      </Pressable>
    </View>
  );
}
