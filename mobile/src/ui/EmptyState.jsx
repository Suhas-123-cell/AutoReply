import { Text, View } from "react-native";

export default function EmptyState({ title = "Nothing here yet", subtitle }) {
  return (
    <View className="items-center justify-center px-6 py-12">
      <Text className="text-base font-semibold text-foreground">{title}</Text>
      {subtitle ? (
        <Text className="mt-1 text-center text-sm text-muted">{subtitle}</Text>
      ) : null}
    </View>
  );
}
