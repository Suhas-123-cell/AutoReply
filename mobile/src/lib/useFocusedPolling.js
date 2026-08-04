import { useCallback, useState } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "@react-navigation/native";

/**
 * Returns a `refetchInterval` value for @tanstack/react-query that is only
 * "live" while this screen is focused AND the app is in the foreground.
 * Otherwise returns `false` so react-query stops polling entirely — an
 * unthrottled background/blurred poll would drain battery for no reason
 * (the web app can get away with polling a visible browser tab; a phone
 * app cannot).
 */
export function useFocusedPolling(intervalMs) {
  const [isForeground, setIsForeground] = useState(AppState.currentState === "active");

  useFocusEffect(
    useCallback(() => {
      setIsForeground(AppState.currentState === "active");
      const subscription = AppState.addEventListener("change", (state) => {
        setIsForeground(state === "active");
      });
      return () => {
        subscription.remove();
        // Screen lost focus (e.g. navigated to the thread, or to another
        // tab) — stop polling until it's focused again.
        setIsForeground(false);
      };
    }, [])
  );

  return isForeground ? intervalMs : false;
}
