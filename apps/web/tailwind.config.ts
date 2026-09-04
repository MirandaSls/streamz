import type { Config } from "tailwindcss";

/**
 * Tokens visuais da marca Streamz (ADR-0004). A escala de superfícies deixou de
 * ser derivada do Void Ink e passou a ser o **cinza neutro do Discord medido nos
 * prints** (`docs/Reference/Captura de tela 2026-09-04 102422, 102757 e
 * 100527.png`, getpixel em área plana): a nossa escala descia mais fundo que
 * a dele e a rail ficava quase preta ao lado do resto do app. A marca (Volt Lime) e os textos
 * (Paper e derivados) não mudaram. Ver a Emenda 1 da ADR-0004.
 *
 * Quatro regras não são preferência, são o sistema:
 *   1. No Discord a **rail de servidores, a coluna de canais/DMs e a barra de
 *      título são a MESMA superfície** (`#121214`), separadas por uma linha de
 *      1px `#222225` — não por uma diferença de cor. Por isso não existe mais
 *      um token `rail`: é `panel`, e quem separa é `rail-divider`.
 *   2. Limão só sobre escuro — nunca como texto sobre `paper`.
 *   3. Texto e ícone sobre `accent` são `accent-ink`, nunca branco
 *      (branco sobre Volt Lime dá 1,57:1).
 *   4. `green` e `yellow` ficam afastados do limão em matiz, e bolinha de
 *      status nunca vai sobre superfície limão.
 */
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // superfícies — hex medidos nos prints do Discord (getpixel)
        panel: "#121214", // rail, coluna de canais/DMs, barra de título, rodapé de modal
        footer: "#202024", // card do usuário — no Discord ele CLAREIA sobre a coluna
        chat: "#1A1A1E", // área de mensagens, cabeçalho, painel de membros, corpo de modal
        input: "#222327", // composer, campo de edição, cartão de perfil em DM
        msghov: "#17171A", // hover de mensagem — mais escuro que `chat` (não medido)
        hov: "#222225", // hover de item de lista e botão vazio da rail (sobre `panel`)
        sel: "#2C2C30", // item ativo
        // Void Ink: não é mais superfície de coluna, e sim o preto da marca —
        // campos escuros, tooltips, palco de chamada e trilhos. Era `rail`.
        void: "#0B0B0F",
        // bordas e sobreposições (antes eram hex soltos no JSX)
        border: "#2A2A33", // divisórias e linhas de seção
        "border-strong": "#35353F", // borda de botão secundário
        "border-strong-hover": "#4C4C58", // hover dessa borda
        // menu de contexto, popover, toast. O Discord usa `#28282D` (menu MAIS
        // claro que o app); aqui continua o nosso preto — fora do escopo deste PR.
        overlay: "#050507",
        "rail-divider": "#222225", // linha de 1px: rail|coluna e separador dentro da rail
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
        "txt-primary": "#FDFDFB", // títulos, nome do autor — 17,0:1 sobre chat
        "txt-normal": "#D8D8D4", // corpo da mensagem — 12,1:1
        "txt-secondary": "#A9A9A6", // ícones de toolbar — 7,4:1
        "txt-muted": "#8A8A8E", // timestamps, categorias — 5,1:1
        // canal em repouso e offline. 3,4:1 sobre `chat` (o novo `#1A1A1E` dá o
        // mesmo 3,43): abaixo de AA, mesma folga que o `#80848e` do Discord
        // tinha. Dívida registrada na ADR-0004.
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
