import { Switch } from "react-native";
import { colors } from "./tokens";

/** Thin, token-styled wrapper around RN's Switch for on/off settings. */
export default function Toggle({ value, onValueChange, disabled = false }) {
  return (
    <Switch
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      trackColor={{ false: colors.border, true: colors.accent }}
      thumbColor={colors.foreground}
      ios_backgroundColor={colors.border}
    />
  );
}
