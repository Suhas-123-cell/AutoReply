module.exports = {
  root: true,
  extends: "@react-native",
  rules: {
    // NativeWind covers most styling; the remaining small dynamic/native-only
    // objects are intentional and clearer beside the component that uses them.
    "react-native/no-inline-styles": "off",
  },
};
