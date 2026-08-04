/**
 * Module-level navigation handle, used anywhere that needs to navigate from
 * outside a screen's own render tree (e.g. a push-notification tap handler
 * in src/push/register.js). Attach to <NavigationContainer ref={navigationRef}>
 * in src/App.jsx.
 */
import { createNavigationContainerRef } from "@react-navigation/native";

export const navigationRef = createNavigationContainerRef();

/** Safe to call before the container has mounted — becomes a no-op. */
export function navigate(name, params) {
  if (navigationRef.isReady()) {
    navigationRef.navigate(name, params);
  }
}
