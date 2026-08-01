module.exports = {
  expo: {
    name: "OpenReply",
    slug: "openreply",
    version: "1.0.0",
    orientation: "portrait",
    scheme: "openreply",
    userInterfaceStyle: "dark",
    newArchEnabled: true,
    ios: {
      bundleIdentifier: "com.openreply.app",
      supportsTablet: false,
      // No custom encryption beyond standard HTTPS — answers Apple's export
      // compliance question the same way on every submission instead of
      // being asked interactively each time.
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
      },
    },
    android: {
      package: "com.openreply.app",
    },
    plugins: [
      "expo-router",
      "expo-notifications",
      [
        "expo-local-authentication",
        {
          faceIDPermission: "Allow OpenReply to use Face ID to unlock the app.",
        },
      ],
    ],
    extra: {
      apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL,
    },
  },
};
