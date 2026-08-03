module.exports = {
  preset: "react-native",
  transformIgnorePatterns: [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?)|react-navigation|@react-navigation/.*|native-base|react-native-svg|@react-native-async-storage/.*|zustand)",
  ],
  collectCoverageFrom: [
    "src/**/*.{js,jsx}",
    "!src/**/__tests__/**",
  ],
};
