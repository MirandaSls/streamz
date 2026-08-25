import type { Config } from "tailwindcss";

/**
 * Tokens visuais — valores do tema escuro do Discord (2024+), para que o app
 * seja indistinguível na paleta. Ver design.md.
 */
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // superfícies
        rail: "#1e1f22", // background-tertiary: rail, inputs escuros, tooltips
        panel: "#2b2d31", // background-secondary: colunas laterais, modais
        chat: "#313338", // background-primary: área de mensagens
        footer: "#232428", // background-secondary-alt: rodapé do usuário
        input: "#383a40", // channeltextarea-background: composer
        hov: "#35373c", // background-modifier-hover sobre a coluna 2
        sel: "#404249", // background-modifier-selected: canal ativo
        msghov: "#2e3035", // hover de mensagem sobre o chat
        // marca e semântica
        accent: "#5865f2", // brand (blurple)
        "accent-hover": "#4752c4",
        green: "#23a559",
        yellow: "#f0b232",
        red: "#f23f43",
        "red-hover": "#da373c",
        // texto
        "txt-primary": "#f2f3f5", // header-primary: títulos, nome do autor
        "txt-normal": "#dbdee1", // text-normal: corpo da mensagem
        "txt-secondary": "#b5bac1", // header-secondary / interactive-normal
        "txt-muted": "#949ba4", // text-muted: timestamps, canais em repouso
        "txt-faint": "#80848e", // channels-default / offline
        "txt-link": "#00a8fc",
      },
      fontFamily: {
        sans: [
          "var(--font-sans)",
          "gg sans",
          "Noto Sans",
          "Helvetica Neue",
          "Helvetica",
          "Arial",
          "sans-serif",
        ],
      },
      boxShadow: {
        // elevação do cabeçalho de 48px sobre a lista (Discord: elevation-low)
        header: "0 1px 0 rgba(2,2,4,.2), 0 1.5px 0 rgba(6,6,7,.05), 0 2px 0 rgba(2,2,4,.05)",
        // menus, popovers e tooltips (elevation-high)
        high: "0 8px 16px rgba(0,0,0,.24)",
      },
    },
  },
  plugins: [],
} satisfies Config;
