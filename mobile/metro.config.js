/* eslint-disable @typescript-eslint/no-require-imports -- Metro loads this file via Node's CommonJS require(), not ESM */
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

module.exports = withNativeWind(config, { input: "./global.css" });
