import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    // The native app has its own React Native ESLint configuration and
    // `mobile/npm run lint`; Next's DOM rules misclassify React Native Image.
    "mobile/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
