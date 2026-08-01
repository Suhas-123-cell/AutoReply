import { Text, View } from "react-native";

export default function StatTile({ label, value }) {
  return (
    <View className="min-w-[45%] flex-1 rounded-lg border border-border bg-surface p-4">
      <Text className="text-2xl font-bold text-foreground">{value}</Text>
      <Text className="mt-1 text-xs text-muted">{label}</Text>
    </View>
  );
}
