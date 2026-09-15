import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@streamz/shared": resolve(__dirname, "../../packages/shared/src/index.ts"),
      "@": __dirname,
    },
  },
  // tsconfig tem `jsx: "preserve"` (quem compila é o Next); sem isto o Oxc do
  // Vite manteria o JSX dos `*.test.tsx` e dos componentes que eles importam
  oxc: {
    jsx: { runtime: "automatic", importSource: "react" },
  },
  test: {
    // ambiente node com stubs mínimos de browser: os módulos sob teste só usam
    // localStorage e window.location, e um DOM completo não pagaria o custo
    environment: "node",
    setupFiles: ["./test/ambiente.ts"],
    // `.tsx`: testes de render com `renderToStaticMarkup`, sem DOM
    include: ["**/*.test.ts", "**/*.test.tsx"],
  },
});
