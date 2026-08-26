import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@streamz/shared": resolve(__dirname, "../../packages/shared/src/index.ts"),
      "@": __dirname,
    },
  },
  test: {
    // ambiente node com stubs mínimos de browser: os módulos sob teste só usam
    // localStorage e window.location, e um DOM completo não pagaria o custo
    environment: "node",
    setupFiles: ["./test/ambiente.ts"],
    include: ["**/*.test.ts"],
  },
});
