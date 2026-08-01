module.exports = function (api) {
  const isWeb = api.caller((caller) => !!caller && caller.platform === "web");
  // api.cache(true) (unconditional/forever caching) is incompatible with
  // api.caller() above, which needs the cached config to vary by platform —
  // cache keyed on that same isWeb value instead.
  api.cache.using(() => isWeb);
  return {
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
    // Metro's web bundle ships as a classic (non-module) script, so any
    // `import.meta` syntax anywhere in the dependency graph fails to parse
    // in the browser — even inside a function that's never called (Zustand's
    // devtools middleware, bundled together with the persist middleware we
    // actually use, references import.meta.env at module scope). This
    // strips it at build time; native builds are unaffected since Hermes
    // handles import.meta itself and this only applies on web.
    plugins: isWeb ? ["babel-plugin-transform-import-meta"] : [],
  };
};
