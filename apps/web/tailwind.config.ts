import type { Config } from "tailwindcss";

export default {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // paleta base tipo Discord (ajuste depois)
        panel: "#2b2d31",
        rail: "#1e1f22",
        chat: "#313338",
        accent: "#5865f2",
      },
    },
  },
  plugins: [],
} satisfies Config;
