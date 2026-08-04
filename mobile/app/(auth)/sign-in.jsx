import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { apiFetch, ApiError } from "../../src/api/client";
import { colors } from "../../src/ui/tokens";

export default function SignInScreen() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const navigation = useNavigation();

  async function handleSubmit() {
    const trimmed = email.trim();
    if (!trimmed) {
      setError("Enter your email address.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const data = await apiFetch("/api/mobile/auth/request-code", {
        method: "POST",
        body: { email: trimmed },
      });
      navigation.navigate("Verify", { email: trimmed, devCode: data?.devCode ?? "" });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-background"
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View className="flex-1 justify-center px-6">
        <Text className="mb-2 text-3xl font-bold text-foreground">OpenReply</Text>
        <Text className="mb-8 text-muted">Sign in with your email to continue.</Text>

        <Text className="mb-2 text-sm text-muted">Email</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="emailAddress"
          onSubmitEditing={handleSubmit}
          className="mb-4 rounded-lg border border-border bg-surface px-4 py-3 text-foreground"
        />

        {error ? <Text className="mb-4 text-error">{error}</Text> : null}

        <Pressable
          onPress={handleSubmit}
          disabled={loading}
          className="items-center rounded-lg bg-accent py-3"
        >
          {loading ? (
            <ActivityIndicator color={colors.background} />
          ) : (
            <Text className="font-semibold text-background">Send code</Text>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
