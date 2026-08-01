import { useState } from "react";
import { Alert, Pressable, ScrollView, Text } from "react-native";
import { apiFetch, ApiError } from "../../../src/api/client";
import { useAuth } from "../../../src/auth/AuthContext";
import Card from "../../../src/ui/Card";

export default function AccountScreen() {
  const { user, signOut } = useAuth();
  const [deleting, setDeleting] = useState(false);

  const handleSignOut = () => {
    Alert.alert("Sign out?", "You can sign back in any time.", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign out", style: "destructive", onPress: () => signOut() },
    ]);
  };

  const doDelete = async () => {
    setDeleting(true);
    try {
      await apiFetch("/api/mobile/account", { method: "DELETE" });
      await signOut();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const names = err.data?.workspaces?.map((w) => w.name).join(", ");
        Alert.alert(
          "Can't delete account",
          `${err.message}${names ? `\n\nWorkspaces: ${names}` : ""}`
        );
      } else {
        Alert.alert(
          "Couldn't delete account",
          err instanceof ApiError ? err.message : "Please try again."
        );
      }
    } finally {
      setDeleting(false);
    }
  };

  // Destructive confirm via a native Alert with an explicit "Delete" action
  // (simpler than a "type DELETE to confirm" text flow, and the standard
  // pattern for irreversible actions on iOS/Android).
  const handleDeleteAccount = () => {
    Alert.alert(
      "Delete account",
      "This permanently deletes your account and any workspace you solely own. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: doDelete },
      ]
    );
  };

  return (
    <ScrollView className="flex-1 bg-background" contentContainerStyle={{ padding: 16, gap: 16 }}>
      <Card>
        <Text className="text-sm font-medium text-foreground">{user?.name ?? "Signed in"}</Text>
        <Text className="mt-0.5 text-xs text-muted">{user?.email}</Text>
      </Card>

      <Pressable
        onPress={handleSignOut}
        className="rounded-lg border border-border bg-surface px-4 py-3"
      >
        <Text className="text-center text-sm font-medium text-foreground">Sign out</Text>
      </Pressable>

      <Pressable
        onPress={handleDeleteAccount}
        disabled={deleting}
        className={`rounded-lg border border-error/40 px-4 py-3 ${deleting ? "opacity-60" : ""}`}
      >
        <Text className="text-center text-sm font-medium text-error">
          {deleting ? "Deleting..." : "Delete account"}
        </Text>
      </Pressable>
    </ScrollView>
  );
}
