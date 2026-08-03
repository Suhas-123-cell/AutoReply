module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      "@react-native/babel-preset",
      "nativewind/babel",
    ],
    // NativeWind's className -> style transform needs JSX pragma'd to
    // "nativewind" (this used to ride on babel-preset-expo's
    // `jsxImportSource: "nativewind"` option).
    plugins: [
      ["@babel/plugin-transform-react-jsx", { runtime: "automatic", importSource: "nativewind" }],
    ],
  };
};
