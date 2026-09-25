import {
  Alert,
  Linking,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import Ionicons from "react-native-vector-icons/Ionicons";
import Config from "react-native-config";
import { colors } from "../../../src/ui/tokens";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../../../src/api/client";
import { useAuth } from "../../../src/auth/AuthContext";

const ROWS = [
  { screen: "Instagram", label: "Instagram", icon: "logo-instagram" },
  { screen: "Telegram", label: "Telegram", icon: "paper-plane-outline" },
  { screen: "Overview", label: "Insights", icon: "stats-chart-outline" },
  { screen: "Members", label: "Team Members", icon: "people-outline" },
  { screen: "Usage", label: "Usage", icon: "speedometer-outline" },
  {
    screen: "Notifications",
    label: "Notifications",
    icon: "notifications-outline",
  },
  { screen: "Security", label: "Security", icon: "lock-closed-outline" },
  { screen: "Diagnostics", label: "Diagnostics", icon: "pulse-outline" },
  { screen: "Account", label: "Account", icon: "person-circle-outline" },
];

export default function MoreScreen() {
  const navigation = useNavigation();
  const { workspace, switchWorkspace } = useAuth();
  const { data: workspaces = [] } = useQuery({
    queryKey: ["workspaces"],
    queryFn: () => apiFetch("/api/workspaces"),
  });
  return (
    <ScrollView className="flex-1 bg-background">
      <View className="border-b border-border p-4">
        <Text className="mb-2 text-xs text-muted">Workspace</Text>
        {workspaces.map((w) => (
          <Pressable
            key={w.id}
            onPress={() =>
              switchWorkspace(w.id).catch((e) =>
                Alert.alert("Could not switch workspace", e.message)
              )
            }
            className="py-2"
          >
            <Text
              className={
                workspace?.id === w.id ? "text-accent" : "text-foreground"
              }
            >
              {w.name}
              {workspace?.id === w.id ? " · Selected" : ""}
            </Text>
            <Text className="text-xs text-muted">{w.role.toLowerCase()}</Text>
          </Pressable>
        ))}
      </View>
      {ROWS.map((row) => (
        <Pressable
          key={row.screen}
          onPress={() => navigation.navigate(row.screen)}
          className="flex-row items-center justify-between border-b border-border px-4 py-4"
        >
          <View className="flex-row items-center gap-3">
            <Ionicons name={row.icon} size={20} color={colors.muted} />
            <Text className="text-base text-foreground">{row.label}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.muted} />
        </Pressable>
      ))}
      <Pressable
        onPress={() => {
          const supportEmail = Config.SUPPORT_EMAIL?.trim();
          if (!supportEmail || supportEmail === "you@example.com") {
            Alert.alert(
              "Feedback is not configured",
              "Add the support address before release."
            );
            return;
          }
          Linking.openURL(
            `mailto:${supportEmail}?subject=${encodeURIComponent(
              "AutoReply feedback"
            )}`
          ).catch(() => Alert.alert("Could not open your email app"));
        }}
        className="flex-row items-center justify-between border-b border-border px-4 py-4"
      >
        <View className="flex-row items-center gap-3">
          <Ionicons
            name="chatbubble-ellipses-outline"
            size={20}
            color={colors.muted}
          />
          <Text className="text-base text-foreground">Send feedback</Text>
        </View>
        <Ionicons name="open-outline" size={18} color={colors.muted} />
      </Pressable>
    </ScrollView>
  );
}
