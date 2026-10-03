import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
  Pressable, ScrollView, Text, TextInput, View,
} from "react-native";
import {
  getAuth, getIdToken, onAuthStateChanged, signInWithPhoneNumber,
  signOut as firebaseSignOut,
} from "@react-native-firebase/auth";
import { apiFetch, ApiError } from "../../src/api/client";
import { useAuth } from "../../src/auth/AuthContext";
import { normalizePhoneNumber } from "../../src/auth/phone-number";
import { colors } from "../../src/ui/tokens";

const RESEND_SECONDS = 60;

async function clearFirebaseSession() {
  try { await firebaseSignOut(getAuth()); } catch {}
}

function phoneError(error) {
  if (error instanceof ApiError) return error.message;
  switch (error?.code) {
    case "auth/invalid-phone-number": return "Enter a valid phone number with its country code.";
    case "auth/invalid-verification-code": return "That code is incorrect. Try again.";
    case "auth/session-expired": return "That code expired. Request a new one.";
    case "auth/too-many-requests": return "Too many attempts. Please wait before trying again.";
    case "auth/quota-exceeded": return "SMS verification is temporarily unavailable. Please try again later.";
    case "auth/network-request-failed": return "Check your connection and try again.";
    default: return "Couldn't verify your phone. Please try again.";
  }
}

export default function VerifyPhoneScreen() {
  const { user, signOut, refreshSession } = useAuth();
  const [phone, setPhone] = useState("");
  const [sentPhone, setSentPhone] = useState(null);
  const [code, setCode] = useState("");
  const [confirmation, setConfirmation] = useState(null);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [resendSeconds, setResendSeconds] = useState(0);
  const [needsSessionRefresh, setNeedsSessionRefresh] = useState(false);
  const activeFlow = useRef(null);
  const unsubscribe = useRef(null);
  const mounted = useRef(true);
  const busyRef = useRef(null);

  function updateBusy(value) {
    busyRef.current = value;
    if (mounted.current) setBusy(value);
  }

  function stopFlow() {
    activeFlow.current = null;
    unsubscribe.current?.();
    unsubscribe.current = null;
  }

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      activeFlow.current = null;
      unsubscribe.current?.();
      clearFirebaseSession();
    };
  }, []);

  useEffect(() => {
    if (resendSeconds <= 0) return;
    const timer = setTimeout(() => setResendSeconds((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => clearTimeout(timer);
  }, [resendSeconds]);

  async function finishVerification(firebaseUser, flow) {
    if (!mounted.current || activeFlow.current !== flow || flow.submitted) return;
    flow.submitted = true;
    updateBusy("verify");
    setError(null);
    let linked = false;
    try {
      const idToken = await getIdToken(firebaseUser, true);
      if (!mounted.current || activeFlow.current !== flow) return;
      await apiFetch("/api/mobile/auth/verify-phone", { method: "POST", body: { idToken } });
      linked = true;
      if (!mounted.current || activeFlow.current !== flow) return;
      await refreshSession();
    } catch (err) {
      if (mounted.current && activeFlow.current === flow) {
        setNeedsSessionRefresh(linked);
        setError(linked ? "Your phone is verified. Reconnect to continue." : phoneError(err));
        setConfirmation(null);
        setCode("");
      }
    } finally {
      if (activeFlow.current === flow) {
        stopFlow();
        await clearFirebaseSession();
        updateBusy(null);
      }
    }
  }

  async function sendCode(resend = false) {
    if (busyRef.current || resendSeconds > 0) return;
    const normalized = normalizePhoneNumber(phone);
    if (!normalized) {
      setError("Include your country code, for example +91 98765 43210.");
      return;
    }
    updateBusy("send");
    setError(null);
    setCode("");
    setConfirmation(null);
    setNeedsSessionRefresh(false);
    stopFlow();
    const flow = { phone: normalized, submitted: false, startedAt: Date.now() };
    activeFlow.current = flow;
    try {
      const auth = getAuth();
      // A persisted Firebase user is never evidence for this app session.
      // Subscribe only after signing it out, then accept this request's result.
      await firebaseSignOut(auth);
      if (!mounted.current || activeFlow.current !== flow) return;
      unsubscribe.current = onAuthStateChanged(auth, (firebaseUser) => {
        if (!firebaseUser || firebaseUser.phoneNumber !== flow.phone) return;
        const signedInAt = Date.parse(firebaseUser.metadata?.lastSignInTime);
        if (Number.isFinite(signedInAt) && signedInAt + 5000 < flow.startedAt) return;
        finishVerification(firebaseUser, flow);
      });
      setSentPhone(normalized);
      setResendSeconds(RESEND_SECONDS);
      // v22's native modular implementation forwards the third argument as
      // forceResend to the Android/iOS SDK.
      const result = await signInWithPhoneNumber(auth, normalized, resend);
      if (!mounted.current || activeFlow.current !== flow || flow.submitted) return;
      setConfirmation(result);
    } catch (err) {
      if (mounted.current && activeFlow.current === flow && !flow.submitted) {
        setError(phoneError(err));
        stopFlow();
        await clearFirebaseSession();
      }
    } finally {
      if (!flow.submitted && busyRef.current === "send") updateBusy(null);
    }
  }

  async function confirmCode() {
    if (busyRef.current || !confirmation || !activeFlow.current) return;
    if (!/^\d{6}$/.test(code.trim())) {
      setError("Enter the 6-digit code.");
      return;
    }
    const flow = activeFlow.current;
    updateBusy("verify");
    setError(null);
    try {
      const credential = await confirmation.confirm(code.trim());
      await finishVerification(credential.user, flow);
    } catch (err) {
      if (mounted.current && activeFlow.current === flow && !flow.submitted) setError(phoneError(err));
    } finally {
      if (activeFlow.current === flow && !flow.submitted) updateBusy(null);
    }
  }

  async function leaveAccount() {
    stopFlow();
    updateBusy("signout");
    await clearFirebaseSession();
    await signOut();
  }

  function deleteAccount() {
    Alert.alert("Delete account", "This permanently deletes your account and any workspace you solely own. This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        stopFlow();
        updateBusy("delete");
        try {
          await clearFirebaseSession();
          await apiFetch("/api/mobile/account", { method: "DELETE" });
          await signOut();
        } catch (err) {
          if (mounted.current) setError(err instanceof ApiError ? err.message : "Couldn't delete your account. Please try again.");
        } finally { updateBusy(null); }
      } },
    ]);
  }

  async function retrySession() {
    updateBusy("verify");
    setError(null);
    try { await refreshSession(); }
    catch (err) { if (mounted.current) setError(phoneError(err)); }
    finally { updateBusy(null); }
  }

  return (
    <KeyboardAvoidingView className="flex-1 bg-background" behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 24 }} keyboardShouldPersistTaps="handled">
        <Text className="mb-2 text-2xl font-bold text-foreground">Verify your phone</Text>
        <Text className="mb-2 text-muted">Add a verified phone to continue to your workspace.</Text>
        {user?.email ? <Text className="mb-6 text-sm text-muted">Signed in as {user.email}</Text> : null}
        {confirmation ? (
          <View>
            <Text className="mb-4 text-muted">We sent a 6-digit code to {sentPhone}.</Text>
            <TextInput value={code} onChangeText={setCode} placeholder="6-digit code" placeholderTextColor={colors.muted}
              keyboardType="number-pad" textContentType="oneTimeCode" autoComplete="sms-otp" maxLength={6}
              editable={!busy} onSubmitEditing={confirmCode} accessibilityLabel="Verification code"
              className="mb-4 rounded-xl border border-border bg-surface px-4 py-3 text-center text-2xl tracking-widest text-foreground" />
          </View>
        ) : !needsSessionRefresh ? (
          <View>
            <Text className="mb-2 text-sm text-muted">Phone number with country code</Text>
            <TextInput value={phone} onChangeText={setPhone} placeholder="+91 98765 43210" placeholderTextColor={colors.muted}
              keyboardType="phone-pad" textContentType="telephoneNumber" autoComplete="tel" editable={!busy}
              onSubmitEditing={() => sendCode()} accessibilityLabel="Phone number with country code"
              className="mb-4 rounded-xl border border-border bg-surface px-4 py-3.5 text-foreground" />
            <Text className="mb-6 text-xs text-muted">Continuing sends your number to Google Firebase for SMS verification and abuse prevention.</Text>
          </View>
        ) : null}
        {error ? <Text className="mb-4 text-error" accessibilityRole="alert">{error}</Text> : null}
        <Pressable onPress={needsSessionRefresh ? retrySession : confirmation ? confirmCode : () => sendCode()}
          disabled={Boolean(busy) || (!confirmation && !needsSessionRefresh && resendSeconds > 0)}
          className={`items-center rounded-xl bg-accent py-3.5 ${busy ? "opacity-60" : ""}`}>
          {busy === "send" || busy === "verify" ? <ActivityIndicator color={colors.background} /> :
            <Text className="font-semibold text-background">{needsSessionRefresh ? "Continue" : confirmation ? "Verify phone" : resendSeconds > 0 ? `Send code in ${resendSeconds}s` : "Send SMS code"}</Text>}
        </Pressable>
        {confirmation ? (
          <>
            <Pressable onPress={() => sendCode(true)} disabled={Boolean(busy) || resendSeconds > 0} className="mt-4 items-center py-2">
              <Text className="text-muted">{resendSeconds > 0 ? `Resend in ${resendSeconds}s` : "Resend code"}</Text>
            </Pressable>
            <Pressable onPress={async () => {
              stopFlow();
              updateBusy("change");
              await clearFirebaseSession();
              if (mounted.current) { setConfirmation(null); setCode(""); setError(null); }
              updateBusy(null);
            }} disabled={Boolean(busy)} className="items-center py-2">
              <Text className="text-muted">Use a different number</Text>
            </Pressable>
          </>
        ) : null}
        <View className="mt-8 border-t border-border pt-4">
          <Pressable onPress={leaveAccount} disabled={busy === "delete" || busy === "signout"} className="items-center py-3">
            <Text className="text-foreground">{busy === "signout" ? "Signing out…" : "Sign out"}</Text>
          </Pressable>
          <Pressable onPress={deleteAccount} disabled={busy === "delete" || busy === "signout"} className="items-center py-3">
            <Text className="text-error">{busy === "delete" ? "Deleting…" : "Delete account"}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
