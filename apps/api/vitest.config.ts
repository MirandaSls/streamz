import { defineConfig } from "vitest/config";

/**
 * Só a lógica pura de `src` — nada de `dist`. Sem esta exclusão, um `nest build`
 * feito antes do `vitest` deixaria os testes compilados no `dist` e eles seriam
 * coletados de novo, agora como CommonJS, quebrando a suíte inteira.
 */
export default defineConfig({
  test: {
    include: ["src/**/*.{test,spec}.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
  },
});
