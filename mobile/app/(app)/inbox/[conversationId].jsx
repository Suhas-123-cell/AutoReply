import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Ionicons from "react-native-vector-icons/Ionicons";
import ReactNativeHapticFeedback from "react-native-haptic-feedback";
import { apiFetch, ApiError } from "../../../src/api/client";
import { colors } from "../../../src/ui/tokens";
import { formatRelativeTime } from "../../../src/lib/formatRelativeTime";
import { useFocusedPolling } from "../../../src/lib/useFocusedPolling";

const POLL_MS = 12000;
const REPLY_WINDOW_MS = 24 * 60 * 60 * 1000;

export default function ThreadScreen() {
  const navigation = useNavigation();
  const { conversationId, accountId, recipientId, username } = useRoute().params ?? {};
  const queryClient = useQueryClient();

  const [draft, setDraft] = useState("");
  // Outgoing messages not yet confirmed by the server: { id, text, createdTime, status }
  // status is "pending" (in flight) or "failed" (tap the bubble to retry).
  const [pending, setPending] = useState([]);

  // "now" lives in state, refreshed on an interval, so the 24h reply-window
  // check below can read it as a plain dependency instead of calling the
  // impure Date.now() directly inside useMemo (which would both violate
  // React's render-purity rules and silently go stale between message
  // updates — the window should close on its own once time passes, not
  // only when a new message triggers a recompute).
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(interval);
  }, []);

  // Local counter for optimistic-message ids, instead of Date.now() — keeps
  // sendText() free of impure global calls too.
  const localIdRef = useRef(0);

  const queryKey = ["conversation-messages", conversationId, accountId];

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () =>
      apiFetch(
        `/api/instagram/conversations/${conversationId}?instagramAccountId=${accountId}`
      ),
    enabled: !!conversationId && !!accountId,
    refetchInterval: useFocusedPolling(POLL_MS),
  });

  const serverMessages = useMemo(() => data?.messages ?? [], [data]);

  // Instagram only allows a reply within 24h of the customer's last inbound
  // message. Find the most recent non-fromMe message and check its age.
  const replyWindowOpen = useMemo(() => {
    const lastInbound = [...serverMessages].reverse().find((m) => !m.fromMe);
    if (!lastInbound?.createdTime) return false;
    const age = now - new Date(lastInbound.createdTime).getTime();
    return Number.isFinite(age) && age < REPLY_WINDOW_MS;
  }, [serverMessages, now]);

  // Server messages are chronological (oldest first); the pending/failed
  // outgoing ones are always the newest. Combine, then reverse once for the
  // inverted FlatList (which renders index 0 at the bottom of the screen).
  const rows = useMemo(
    () => [...serverMessages, ...pending].reverse(),
    [serverMessages, pending]
  );

  async function sendText(text, existingLocalId) {
    const localId = existingLocalId ?? `local-${localIdRef.current++}`;
    setPending((prev) => {
      const withoutRetried = prev.filter((m) => m.id !== localId);
      return [
        ...withoutRetried,
        { id: localId, text, fromMe: true, createdTime: new Date().toISOString(), status: "pending" },
      ];
    });

    ReactNativeHapticFeedback.trigger("impactLight", {
      enableVibrateFallback: true,
      ignoreAndroidSystemSettings: false,
    });

    try {
      await apiFetch("/api/instagram/conversations", {
        method: "POST",
        body: { instagramAccountId: accountId, recipientId, text },
      });
      setPending((prev) => prev.filter((m) => m.id !== localId));
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ["instagram-conversations", accountId] });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Failed to send message";
      setPending((prev) =>
        prev.map((m) => (m.id === localId ? { ...m, status: "failed", error: message } : m))
      );
      Alert.alert("Couldn't send message", message);
    }
  }

  function handleSend() {
    const text = draft.trim();
    if (!text || !replyWindowOpen) return;
    setDraft("");
    sendText(text);
  }

  function retry(message) {
    sendText(message.text, message.id);
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-background"
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
    >
      <View className="flex-row items-center gap-2 border-b border-border px-2 py-3">
        <Pressable onPress={() => navigation.goBack()} className="p-2" hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color={colors.foreground} />
        </Pressable>
        <Text className="text-base font-semibold text-foreground" numberOfLines={1}>
          @{username || "unknown"}
        </Text>
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <Text className="text-sm text-muted">Loading…</Text>
        </View>
      ) : (
        <FlatList
          inverted
          data={rows}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 12, gap: 8 }}
          renderItem={({ item }) => (
            <Bubble message={item} onRetry={() => retry(item)} />
          )}
        />
      )}

      <View className="border-t border-border p-3">
        {!replyWindowOpen && (
          <Text className="mb-2 text-xs text-warning">
            Instagram only allows replies within 24 hours of the customer&apos;s last message.
          </Text>
        )}
        <View className="flex-row items-end gap-2">
          <TextInput
            value={draft}
            onChangeText={setDraft}
            editable={replyWindowOpen}
            placeholder={replyWindowOpen ? "Write a reply…" : "Reply window closed"}
            placeholderTextColor={colors.muted}
            multiline
            className="max-h-28 flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
          />
          <Pressable
            onPress={handleSend}
            disabled={!replyWindowOpen || !draft.trim()}
            className="rounded-lg bg-accent px-4 py-2.5"
            style={!replyWindowOpen || !draft.trim() ? { opacity: 0.4 } : undefined}
          >
            <Ionicons name="send" size={16} color="#fff" />
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

function Bubble({ message, onRetry }) {
  const isFailed = message.status === "failed";
  const isPending = message.status === "pending";

  return (
    <Pressable
      disabled={!isFailed}
      onPress={onRetry}
      className={`flex-row ${message.fromMe ? "justify-end" : "justify-start"}`}
    >
      <View
        className={`max-w-[80%] rounded-lg px-3 py-2 ${
          message.fromMe ? "bg-accent" : "border border-border bg-surface"
        }`}
        style={isPending ? { opacity: 0.55 } : isFailed ? { opacity: 0.7 } : undefined}
      >
        <Text className={message.fromMe ? "text-sm text-white" : "text-sm text-foreground"}>
          {message.text}
        </Text>
        <Text
          className={`mt-1 text-[10px] ${message.fromMe ? "text-white/70" : "text-muted"}`}
        >
          {isFailed ? "Failed · tap to retry" : isPending ? "Sending…" : formatRelativeTime(message.createdTime)}
        </Text>
      </View>
    </Pressable>
  );
}
