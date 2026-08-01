import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../../src/ui/tokens";

const ROWS = [
  { href: "/more/instagram", label: "Instagram", icon: "logo-instagram" },
  { href: "/more/overview", label: "Insights", icon: "stats-chart-outline" },
  { href: "/more/members", label: "Team Members", icon: "people-outline" },
  { href: "/more/usage", label: "Usage", icon: "speedometer-outline" },
  { href: "/more/notifications", label: "Notifications", icon: "notifications-outline" },
  { href: "/more/security", label: "Security", icon: "lock-closed-outline" },
  { href: "/more/diagnostics", label: "Diagnostics", icon: "pulse-outline" },
  { href: "/more/account", label: "Account", icon: "person-circle-outline" },
];

export default function MoreScreen() {
  const router = useRouter();
  return (
    <View className="flex-1 bg-background">
      {ROWS.map((row) => (
        <Pressable
          key={row.href}
          onPress={() => router.push(row.href)}
          className="flex-row items-center justify-between border-b border-border px-4 py-4"
        >
          <View className="flex-row items-center gap-3">
            <Ionicons name={row.icon} size={20} color={colors.muted} />
            <Text className="text-base text-foreground">{row.label}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.muted} />
        </Pressable>
      ))}
    </View>
  );
}
