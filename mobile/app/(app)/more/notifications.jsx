import { useCallback, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import Card from "../../../src/ui/Card";
import Toggle from "../../../src/ui/Toggle";
import {
  getStoredPushPreferences,
  getStoredPushToken,
  registerForPushNotificationsAsync,
  updatePushPreferences,
} from "../../../src/push/register";

export default function NotificationsScreen() {
  const [token, setToken] = useState(undefined); // undefined = still loading
  const [prefs, setPrefs] = useState({ leadAlerts: true, failureAlerts: true });
  const [enabling, setEnabling] = useState(false);
  const [saving, setSaving] = useState(null); // which key is in flight, or null

  const load = useCallback(async () => {
    const [storedToken, storedPrefs] = await Promise.all([
      getStoredPushToken(),
      getStoredPushPreferences(),
    ]);
    setToken(storedToken);
    setPrefs(storedPrefs);
  }, []);

  // Re-check every time this screen gains focus (e.g. after enabling
  // notifications from the security screen or the sign-in primer).
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleEnable = async () => {
    setEnabling(true);
    try {
      const newToken = await registerForPushNotificationsAsync();
      if (!newToken) {
        Alert.alert(
          "Couldn't enable notifications",
          "Permission wasn't granted, or this device couldn't register. Check Settings and try again."
        );
        return;
      }
      await load();
    } finally {
      setEnabling(false);
    }
  };

  const handleToggle = async (key, value) => {
    const previous = prefs;
    setPrefs((p) => ({ ...p, [key]: value }));
    setSaving(key);
    try {
      await updatePushPreferences({ [key]: value });
    } catch (err) {
      setPrefs(previous);
      Alert.alert("Couldn't save", err.message ?? "Please try again.");
    } finally {
      setSaving(null);
    }
  };

  if (token === undefined) {
    return <View className="flex-1 bg-background" />;
  }

  if (!token) {
    return (
      <View className="flex-1 gap-3 bg-background p-4">
        <Card>
          <Text className="text-sm font-semibold text-foreground">Notifications are off</Text>
          <Text className="mt-1 text-xs text-muted">
            Enable notifications to get alerted about new leads and DM send failures.
          </Text>
          <Pressable
            onPress={handleEnable}
            disabled={enabling}
            className={`mt-4 items-center rounded-lg py-3 ${
              enabling ? "bg-accent-hover opacity-60" : "bg-accent"
            }`}
          >
            <Text className="text-center text-sm font-semibold text-background">
              {enabling ? "Enabling..." : "Enable notifications"}
            </Text>
          </Pressable>
        </Card>
      </View>
    );
  }

  return (
    <View className="flex-1 gap-3 bg-background p-4">
      <Card>
        <View className="flex-row items-center justify-between py-1">
          <View className="flex-1 pr-3">
            <Text className="text-sm font-medium text-foreground">New leads</Text>
            <Text className="mt-0.5 text-xs text-muted">
              A comment turned into a DM automatically.
            </Text>
          </View>
          <Toggle
            value={!!prefs.leadAlerts}
            disabled={saving === "leadAlerts"}
            onValueChange={(v) => handleToggle("leadAlerts", v)}
          />
        </View>
      </Card>

      <Card>
        <View className="flex-row items-center justify-between py-1">
          <View className="flex-1 pr-3">
            <Text className="text-sm font-medium text-foreground">Send failures</Text>
            <Text className="mt-0.5 text-xs text-muted">A DM failed to send and needs attention.</Text>
          </View>
          <Toggle
            value={!!prefs.failureAlerts}
            disabled={saving === "failureAlerts"}
            onValueChange={(v) => handleToggle("failureAlerts", v)}
          />
        </View>
      </Card>
    </View>
  );
}
