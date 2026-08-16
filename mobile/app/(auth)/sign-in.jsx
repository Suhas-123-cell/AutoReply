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
import Svg, { Circle, Path, Rect } from "react-native-svg";
import { useNavigation } from "@react-navigation/native";
import InAppBrowser from "react-native-inappbrowser-reborn";
import DeviceInfo from "react-native-device-info";
import { apiFetch, ApiError } from "../../src/api/client";
import { useAuth } from "../../src/auth/AuthContext";
import { signInWithGoogle } from "../../src/auth/google-signin";
import { colors } from "../../src/ui/tokens";

// Same brand mark as the web landing page (app/page.tsx's Logomark) — a chat
// bubble with a forward/send arrow.
function Logomark({ size = 56 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32">
      <Rect width="32" height="32" rx="8" fill={colors.accent} />
      <Path
        d="M9 12.5C9 10.6 10.6 9 12.5 9h7C21.4 9 23 10.6 23 12.5v4c0 1.9-1.6 3.5-3.5 3.5H15l-3.6 3.1c-.5.4-1.2 0-1.2-.6V19.9C9 19.9 9 12.5 9 12.5Z"
        fill={colors.background}
      />
      <Path d="M12.5 14.2l3.3-1.8 3.7 1.8-3.7 1.8-3.3-1.8z" fill={colors.accent} />
    </Svg>
  );
}

function GoogleGlyph() {
  return (
    <Svg width={18} height={18} viewBox="0 0 18 18">
      <Path
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 01-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.87 2.7-6.62z"
        fill="#4285F4"
      />
      <Path
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.83.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.95v2.33A9 9 0 009 18z"
        fill="#34A853"
      />
      <Path d="M3.95 10.7a5.4 5.4 0 010-3.4V4.97H.95a9 9 0 000 8.06l3-2.33z" fill="#FBBC05" />
      <Path
        d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 00.95 4.97l3 2.33C4.66 5.17 6.65 3.58 9 3.58z"
        fill="#EA4335"
      />
    </Svg>
  );
}

function InstagramGlyph() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24">
      <Rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke={colors.foreground} strokeWidth={1.7} />
      <Circle cx="12" cy="12" r="4.2" fill="none" stroke={colors.foreground} strokeWidth={1.7} />
      <Circle cx="17.2" cy="6.8" r="1.1" fill={colors.foreground} />
    </Svg>
  );
}

// Three sign-in/sign-up methods (Google, Instagram, email code) — see
// AuthStack.jsx / verify.jsx for how each resolves to the same
// createMobileSession() session shape server-side regardless of which one
// a person used. Email is one sign-in-or-sign-up flow: a code to a new
// address provisions an account, same as an existing one.
export default function SignInScreen() {
  const [email, setEmail] = useState("");
  const [showEmailInput, setShowEmailInput] = useState(false);
  const [busy, setBusy] = useState(null); // "google" | "instagram" | "email" | null
  const [error, setError] = useState(null);
  const navigation = useNavigation();
  const { signIn } = useAuth();

  async function deviceMeta() {
    return {
      platform: Platform.OS,
      deviceName: await DeviceInfo.getDeviceName().catch(() => undefined),
      appVersion: DeviceInfo.getVersion(),
    };
  }

  async function handleGoogle() {
    setError(null);
    setBusy("google");
    try {
      const idToken = await signInWithGoogle();
      if (!idToken) return; // cancelled
      const data = await apiFetch("/api/mobile/auth/google", {
        method: "POST",
        body: { idToken, ...(await deviceMeta()) },
      });
      await signIn(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Google sign-in failed. Try again.");
    } finally {
      setBusy(null);
    }
  }

  async function handleInstagram() {
    setError(null);
    setBusy("instagram");
    try {
      const { authorizeUrl } = await apiFetch("/api/mobile/auth/instagram/start");
      // Resolves once the in-app browser redirects to autoreply://ig-connect,
      // which app/ig-connect.jsx handles — it reads the `code` param this
      // flow produces and finishes signing in there. See that file.
      if (await InAppBrowser.isAvailable()) {
        await InAppBrowser.openAuth(authorizeUrl, "autoreply://ig-connect", {
          ephemeralWebSession: false,
        });
      } else {
        await InAppBrowser.open(authorizeUrl);
      }
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Couldn't open Instagram sign-in. Try again."
      );
    } finally {
      setBusy(null);
    }
  }

  async function handleSendEmailCode() {
    const trimmed = email.trim();
    if (!trimmed) {
      setError("Enter your email.");
      return;
    }
    setError(null);
    setBusy("email");
    try {
      const data = await apiFetch("/api/mobile/auth/request-code", {
        method: "POST",
        body: { email: trimmed },
      });
      navigation.navigate("Verify", {
        channel: "email",
        identifier: trimmed,
        devCode: data?.devCode ?? "",
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-background"
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View className="flex-1 justify-center px-6">
        <View className="mb-10 items-center">
          <Logomark />
          <Text className="mt-4 text-2xl font-bold text-foreground">AutoReply</Text>
          <Text className="mt-1 text-muted">Sign in to continue</Text>
        </View>

        <Pressable
          onPress={handleGoogle}
          disabled={busy !== null}
          className="mb-3 flex-row items-center justify-center gap-3 rounded-xl border border-border bg-surface py-3.5 active:opacity-80"
        >
          {busy === "google" ? (
            <ActivityIndicator color={colors.foreground} />
          ) : (
            <>
              <GoogleGlyph />
              <Text className="font-semibold text-foreground">Continue with Google</Text>
            </>
          )}
        </Pressable>

        <Pressable
          onPress={handleInstagram}
          disabled={busy !== null}
          className="mb-6 flex-row items-center justify-center gap-3 rounded-xl border border-border bg-surface py-3.5 active:opacity-80"
        >
          {busy === "instagram" ? (
            <ActivityIndicator color={colors.foreground} />
          ) : (
            <>
              <InstagramGlyph />
              <Text className="font-semibold text-foreground">Continue with Instagram</Text>
            </>
          )}
        </Pressable>

        <View className="mb-6 flex-row items-center gap-3">
          <View className="h-px flex-1 bg-border" />
          <Text className="text-xs text-muted">OR</Text>
          <View className="h-px flex-1 bg-border" />
        </View>

        {!showEmailInput ? (
          <Pressable
            onPress={() => setShowEmailInput(true)}
            disabled={busy !== null}
            className="items-center rounded-xl border border-border bg-surface py-3.5 active:opacity-80"
          >
            <Text className="font-semibold text-foreground">Continue with email</Text>
          </Pressable>
        ) : (
          <View>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor={colors.muted}
              keyboardType="email-address"
              textContentType="emailAddress"
              autoCapitalize="none"
              autoFocus
              onSubmitEditing={handleSendEmailCode}
              className="mb-3 rounded-xl border border-border bg-surface px-4 py-3.5 text-foreground"
            />
            <Pressable
              onPress={handleSendEmailCode}
              disabled={busy !== null}
              className="items-center rounded-xl bg-accent py-3.5 active:opacity-80"
            >
              {busy === "email" ? (
                <ActivityIndicator color={colors.background} />
              ) : (
                <Text className="font-semibold text-background">Send code</Text>
              )}
            </Pressable>
          </View>
        )}

        {error ? <Text className="mt-4 text-center text-error">{error}</Text> : null}
      </View>
    </KeyboardAvoidingView>
  );
}
