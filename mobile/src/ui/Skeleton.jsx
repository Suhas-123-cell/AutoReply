import { View } from "react-native";

/** Loading placeholder block. Pass width/height via className or style. */
export default function Skeleton({ className = "", style }) {
  return <View className={`rounded bg-surface-hover ${className}`} style={style} />;
}
