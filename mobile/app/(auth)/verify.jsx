import { useState } from "react";
import { ActivityIndicator, Platform, Pressable, Text, TextInput, View } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import DeviceInfo from "react-native-device-info";
import { apiFetch, ApiError } from "../../src/api/client";
import { useAuth } from "../../src/auth/AuthContext";
import { colors } from "../../src/ui/tokens";

// Shared by both code-based sign-in methods (email and phone) — `channel`
// picks which endpoint and request body shape to use. Google and Instagram
// sign-in never route through here; see sign-in.jsx for those.
const CHANNEL_CONFIG = {
  email: { endpoint: "/api/mobile/auth/verify-code", field: "email" },
  phone: { endpoint: "/api/mobile/auth/verify-phone-code", field: "phone" },
};

export default function VerifyScreen() {
  const { channel = "email", identifier, devCode } = useRoute().params ?? {};
  const { endpoint, field } = CHANNEL_CONFIG[channel];
  const [code, setCode] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const navigation = useNavigation();
  const { signIn } = useAuth();

  async function handleVerify() {
    const trimmed = code.trim();
    if (trimmed.length !== 6) {
      setError("Enter the 6-digit code.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const deviceName = await DeviceInfo.getDeviceName().catch(() => undefined);
      const data = await apiFetch(endpoint, {
        method: "POST",
        body: {
          [field]: identifier,
          code: trimmed,
          platform: Platform.OS,
          deviceName,
          appVersion: DeviceInfo.getVersion(),
        },
      });
      await signIn(data);
      // No manual navigation here — RootNavigator's conditional tree swaps
      // to AppTabs on its own once isSignedIn flips true.
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Invalid or expired code.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <View className="flex-1 justify-center bg-background px-6">
      <Text className="mb-2 text-2xl font-bold text-foreground">Enter your code</Text>
      <Text className="mb-8 text-muted">We sent a 6-digit code to {identifier}.</Text>

      <TextInput
        value={code}
        onChangeText={setCode}
        placeholder={devCode ? `Dev code: ${devCode}` : "123456"}
        placeholderTextColor={colors.muted}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        maxLength={6}
        onSubmitEditing={handleVerify}
        className="mb-4 rounded-lg border border-border bg-surface px-4 py-3 text-center text-2xl tracking-widest text-foreground"
      />

      {error ? <Text className="mb-4 text-error">{error}</Text> : null}

      <Pressable
        onPress={handleVerify}
        disabled={loading}
        className="items-center rounded-lg bg-accent py-3"
      >
        {loading ? (
          <ActivityIndicator color={colors.background} />
        ) : (
          <Text className="font-semibold text-background">Verify</Text>
        )}
      </Pressable>

      <Pressable onPress={() => navigation.goBack()} className="mt-4 items-center">
        <Text className="text-muted">
          Use a different {channel === "phone" ? "phone number" : "email"}
        </Text>
      </Pressable>
    </View>
  );
}
