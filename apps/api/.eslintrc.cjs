/** ESLint da API (NestJS). Foco em erro real, não em estilo — formatação é do editor. */
module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  parserOptions: { ecmaVersion: 2022, sourceType: "module" },
  plugins: ["@typescript-eslint"],
  extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended"],
  env: { node: true, es2022: true },
  ignorePatterns: ["dist/", "node_modules/", "prisma/"],
  rules: {
    // decorators do Nest e services de DI têm parâmetros "não usados" por desenho
    "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    // `!` em env já validada no boot (config/env) é intencional
    "@typescript-eslint/no-non-null-assertion": "off",
  },
};
