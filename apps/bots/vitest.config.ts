import { defineConfig } from "vitest/config";

/** Só a lógica pura de `src` — nada de `dist` (ver o mesmo em apps/api). */
export default defineConfig({
  test: {
    include: ["src/**/*.{test,spec}.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
  },
});
