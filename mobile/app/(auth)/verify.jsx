import { useState } from "react";
import { ActivityIndicator, Platform, Pressable, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import Constants from "expo-constants";
import { apiFetch, ApiError } from "../../src/api/client";
import { useAuth } from "../../src/auth/AuthContext";
import { colors } from "../../src/ui/tokens";

export default function VerifyScreen() {
  const { email, devCode } = useLocalSearchParams();
  const [code, setCode] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
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
      const data = await apiFetch("/api/mobile/auth/verify-code", {
        method: "POST",
        body: {
          email,
          code: trimmed,
          platform: Platform.OS,
          deviceName: Constants.deviceName ?? undefined,
          appVersion: Constants.expoConfig?.version ?? undefined,
        },
      });
      await signIn(data);
      // No manual navigation here — app/_layout.jsx's redirect effect fires
      // once isSignedIn flips true and sends us to /(app)/dashboard.
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Invalid or expired code.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <View className="flex-1 justify-center bg-background px-6">
      <Text className="mb-2 text-2xl font-bold text-foreground">Enter your code</Text>
      <Text className="mb-8 text-muted">We sent a 6-digit code to {email}.</Text>

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

      <Pressable onPress={() => router.back()} className="mt-4 items-center">
        <Text className="text-muted">Use a different email</Text>
      </Pressable>
    </View>
  );
}
