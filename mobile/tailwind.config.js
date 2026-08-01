/** @type {import('tailwindcss').Config} */
/* eslint-disable @typescript-eslint/no-require-imports -- Tailwind loads this file via Node's CommonJS require(), not ESM */
module.exports = {
  content: ["./app/**/*.{js,jsx}", "./src/**/*.{js,jsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        background: "#0b0b0d",
        foreground: "#f4f4f5",
        surface: "#161618",
        "surface-hover": "#1f1f22",
        border: "#2e2e33",
        "border-hover": "#45454d",
        muted: "#9b9ba3",
        accent: "#6b8afd",
        "accent-hover": "#5372e8",
        success: "#4ade80",
        error: "#f87171",
        warning: "#fbbf24",
      },
    },
  },
  plugins: [],
};
