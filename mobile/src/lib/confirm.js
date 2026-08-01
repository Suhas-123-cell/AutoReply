import { Alert } from "react-native";

/**
 * Promise-based wrapper around Alert.alert for a destructive-confirm flow
 * (delete campaign, remove member, disconnect account, etc.). Resolves
 * `true` only if the destructive action was tapped.
 */
export function confirmAsync(title, message, confirmLabel = "Delete") {
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
      { text: confirmLabel, style: "destructive", onPress: () => resolve(true) },
    ]);
  });
}
