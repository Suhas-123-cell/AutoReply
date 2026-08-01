import { View } from "react-native";

export default function Card({ children, className = "" }) {
  return (
    <View className={`rounded-lg border border-border bg-surface p-4 ${className}`}>
      {children}
    </View>
  );
}
