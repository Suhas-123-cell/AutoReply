import { useCallback, useState } from "react";
import { Alert, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import Card from "../../../src/ui/Card";
import Toggle from "../../../src/ui/Toggle";
import {
  authenticateAsync,
  isAvailableAsync,
  isBiometricLockEnabled,
  setBiometricLockEnabled,
} from "../../../src/lib/biometric";

export default function SecurityScreen() {
  const [available, setAvailable] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const [isAvail, isEnabled] = await Promise.all([
          isAvailableAsync(),
          isBiometricLockEnabled(),
        ]);
        setAvailable(isAvail);
        setEnabled(isEnabled);
      })();
    }, [])
  );

  const handleToggle = async (value) => {
    if (value) {
      // Confirm biometrics actually work on this device before turning the
      // lock on — enabling a broken lock would strand the user, "Sign out
      // instead" escape hatch notwithstanding.
      setBusy(true);
      try {
        const ok = await authenticateAsync("Confirm to enable app lock");
        if (!ok) {
          Alert.alert("Couldn't verify", "Face ID / Touch ID didn't succeed. App lock was not enabled.");
          return;
        }
        await setBiometricLockEnabled(true);
        setEnabled(true);
      } finally {
        setBusy(false);
      }
    } else {
      await setBiometricLockEnabled(false);
      setEnabled(false);
    }
  };

  return (
    <View className="flex-1 gap-3 bg-background p-4">
      <Card>
        <View className="flex-row items-center justify-between py-1">
          <View className="flex-1 pr-3">
            <Text className="text-sm font-medium text-foreground">App lock</Text>
            <Text className="mt-0.5 text-xs text-muted">
              {available
                ? "Require Face ID / Touch ID after AutoReply has been in the background for a while."
                : "No Face ID / Touch ID / fingerprint is set up on this device."}
            </Text>
          </View>
          <Toggle value={enabled} disabled={!available || busy} onValueChange={handleToggle} />
        </View>
      </Card>
    </View>
  );
}
