/**
 * Real bare-RN entry point, replacing "expo-router/entry".
 *
 * NOTE: this does not render the app yet. The app tree is still driven by
 * expo-router's file-based routing (app/_layout.jsx and friends), which is
 * untouched until Phase 3 (expo-router -> React Navigation). Once that
 * lands, this file will register the real React Navigation root instead of
 * this placeholder.
 */
import { AppRegistry } from "react-native";

function App() {
  return null;
}

// Must match the native side's registered component name: iOS's
// AppDelegate.startReactNative(withModuleName: "main", ...) and Android's
// MainActivity.getMainComponentName() == "main".
AppRegistry.registerComponent("main", () => App);
