import { Pressable, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import Ionicons from "react-native-vector-icons/Ionicons";
import { colors } from "../../../src/ui/tokens";

const ROWS = [
  { screen: "Instagram", label: "Instagram", icon: "logo-instagram" },
  { screen: "Overview", label: "Insights", icon: "stats-chart-outline" },
  { screen: "Members", label: "Team Members", icon: "people-outline" },
  { screen: "Usage", label: "Usage", icon: "speedometer-outline" },
  { screen: "Notifications", label: "Notifications", icon: "notifications-outline" },
  { screen: "Security", label: "Security", icon: "lock-closed-outline" },
  { screen: "Diagnostics", label: "Diagnostics", icon: "pulse-outline" },
  { screen: "Account", label: "Account", icon: "person-circle-outline" },
];

export default function MoreScreen() {
  const navigation = useNavigation();
  return (
    <View className="flex-1 bg-background">
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
    </View>
  );
}
