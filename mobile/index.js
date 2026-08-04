/**
 * Real bare-RN entry point, replacing "expo-router/entry".
 */
import { AppRegistry } from "react-native";
import App from "./src/App";

// Must match the native side's registered component name: iOS's
// AppDelegate.startReactNative(withModuleName: "main", ...) and Android's
// MainActivity.getMainComponentName() == "main".
AppRegistry.registerComponent("main", () => App);
