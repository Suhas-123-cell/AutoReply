/**
 * Android-specific entry point. Identical to index.js — Android's native
 * runtime requests the dev bundle via the literal `index.android.bundle`
 * path (confirmed: Metro serves /index.bundle fine but 404s on
 * /index.android.bundle unless this file exists), unlike iOS which requests
 * via the ?platform=ios query-param convention. Metro's per-platform
 * extension resolution only kicks in once a matching file for the platform
 * suffix exists at all.
 */
import { AppRegistry } from "react-native";
import App from "./src/App";

AppRegistry.registerComponent("main", () => App);
