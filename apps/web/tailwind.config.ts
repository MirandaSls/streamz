import type { Config } from "tailwindcss";

/**
 * Tokens visuais da marca Streamz (ADR-0004). A escala de superfícies é
 * ancorada no Void Ink `#0B0B0F` e preserva os mesmos deltas de luminância que
 * a escala do Discord tinha — é o que mantém a hierarquia de profundidade
 * (rail < footer < panel < chat < input) sem mexer no leiaute. Ver design.md.
 *
 * Três regras não são preferência, são o sistema:
 *   1. Limão só sobre escuro — nunca como texto sobre `paper`.
 *   2. Texto e ícone sobre `accent` são `accent-ink`, nunca branco
 *      (branco sobre Volt Lime dá 1,57:1).
 *   3. `green` e `yellow` ficam afastados do limão em matiz, e bolinha de
 *      status nunca vai sobre superfície limão.
 */
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // superfícies
        rail: "#0B0B0F", // Void Ink puro: rail, inputs escuros, tooltips
        footer: "#101015", // painel do usuário
        panel: "#141419", // colunas laterais, rodapé de modal
        chat: "#1A1A20", // área de mensagens, corpo de modal
        input: "#23232B", // composer, campo de edição
        msghov: "#17171D", // hover de mensagem — mais escuro que `chat`
        hov: "#1E1E23", // hover de item de lista (sobre `panel`)
        sel: "#29292E", // item ativo
        // bordas e sobreposições (antes eram hex soltos no JSX)
        border: "#2A2A33", // divisórias e linhas de seção
        "border-strong": "#35353F", // borda de botão secundário
        "border-strong-hover": "#4C4C58", // hover dessa borda
        overlay: "#050507", // menu de contexto, popover, toast
        "rail-divider": "#1C1C22", // separador de 2px do rail
        scroll: "#2A2A33", // thumb da rolagem — precisa clarear, não escurecer
        // marca e semântica
        accent: "#9BE31F", // Volt Lime
        "accent-hover": "#B4EE4D", // sobre fundo escuro o hover clareia
        "accent-press": "#86C91A",
        "accent-ink": "#0B0B0F", // texto e ícone SOBRE o accent
        paper: "#FDFDFB", // Paper: cor de marca, nunca superfície (ADR-0004)
        mention: "#D9F5A8", // texto de @menção sobre o véu de accent
        green: "#1FB86B", // afastado do limão em matiz
        yellow: "#FF9F1C", // âmbar, longe do limão
        red: "#FF4D4F",
        "red-hover": "#E23A3D",
        // texto (ancorado no Paper)
        "txt-primary": "#FDFDFB", // títulos, nome do autor — 15,8:1 sobre chat
        "txt-normal": "#D8D8D4", // corpo da mensagem — 11,9:1
        "txt-secondary": "#A9A9A6", // ícones de toolbar — 7,4:1
        "txt-muted": "#8A8A8E", // timestamps, categorias — 5,0:1
        // canal em repouso e offline. 3,4:1 sobre `chat`: abaixo de AA, mesma
        // folga que o `#80848e` do Discord tinha. Dívida registrada na ADR-0004.
        "txt-faint": "#6E6E76",
        "txt-link": "#00a8fc", // ciano: não compete com o limão
      },
      fontFamily: {
        sans: [
          "var(--font-sans)",
          "Noto Sans",
          "Helvetica Neue",
          "Helvetica",
          "Arial",
          "sans-serif",
        ],
        // Archivo: títulos e wordmark. Peso 800 caixa-alta com tracking -4,5%
        // SÓ a partir de 24px — em caixa-alta pequena o tracking é positivo.
        display: [
          "var(--font-display)",
          "Archivo",
          "Helvetica Neue",
          "Helvetica",
          "Arial",
          "sans-serif",
        ],
        mono: [
          "var(--font-mono)",
          "JetBrains Mono",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Consolas",
          "monospace",
        ],
      },
      letterSpacing: {
        // tracking do wordmark e dos títulos de display (>= 24px)
        wordmark: "-0.045em",
        title: "-0.02em",
      },
      boxShadow: {
        // elevação do cabeçalho de 48px sobre a lista
        header: "0 1px 0 rgba(0,0,0,.28), 0 1.5px 0 rgba(0,0,0,.08), 0 2px 0 rgba(0,0,0,.06)",
        // menus, popovers e tooltips
        high: "0 8px 16px rgba(0,0,0,.4)",
      },
    },
  },
  plugins: [],
} satisfies Config;
