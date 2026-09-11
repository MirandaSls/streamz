import type { Config } from "tailwindcss";
import { coresDoDiscord, sombrasDoDiscord } from "./tokens.gerados";

/**
 * Cor = token do Discord (ADR-0009). Os valores moram em `app/tokens.css` e o
 * mapa em `tokens.gerados.ts`, os dois gerados por
 * `scripts/paridade/gerar-tokens.mjs` — não se escreve hex aqui.
 *
 * A classe é o utilitário + o nome do token sem o `--`:
 * `bg-background-base-lower`, `text-text-muted`, `border-border-subtle`,
 * `bg-control-primary-background-default`. O prefixo repetido é o preço de um
 * nome que dá para procurar no CSS do Discord sem tradução.
 *
 * O limão entrou no lugar do blurple por regra mecânica (`--brand-*` e todo
 * token que derivava dele), e o texto sobre ele é escuro — nunca branco. Ver
 * `scripts/paridade/tokens-de-marca.json` para a lista do que foi trocado.
 */
const cor = (n: string) => `rgb(var(--${n}-rgb) / calc(var(--${n}-a) * <alpha-value>))`;

/**
 * Nomes antigos, apontando para o token do Discord que faz o mesmo papel.
 * **Temporários**: saem ao fim da onda 0, quando a migração (0.8) tiver trocado
 * cada uso pelo nome do Discord. Não use em código novo.
 */
const apelidosDaMigracao = {
  panel: cor("background-base-lowest"), // rail, coluna de canais/DMs, barra de título
  footer: cor("background-base-low"), // painel do usuário
  chat: cor("background-base-lower"), // mensagens, cabeçalho, membros
  input: cor("chat-background-default"), // composer
  msghov: cor("message-background-hover"),
  // Mensagem efêmera: o Discord não tem token próprio. No print de referência
  // (`docs/Reference/efemeras/`) o bloco é a mensagem comum + (2, 2, 9) em RGB,
  // que é o blurple a 4% por cima; aqui, o limão a 4%. O hover não foi medido.
  efem: "rgb(var(--brand-500-rgb) / 0.04)",
  efemhov: "rgb(var(--brand-500-rgb) / 0.08)",
  hov: cor("interactive-background-hover"),
  sel: cor("interactive-background-selected"),
  void: cor("input-background-default"), // campo escuro (90% dos usos)
  border: cor("border-subtle"),
  "border-strong": cor("border-normal"),
  "border-strong-hover": cor("border-strong"),
  overlay: cor("background-surface-higher"), // menu: no Discord é MAIS claro que o app
  "rail-divider": cor("app-frame-border"),
  scroll: cor("scrollbar-thin-thumb"),
  accent: cor("brand-500"),
  "accent-hover": cor("control-primary-background-hover"), // escurece, como no Discord
  "accent-press": cor("control-primary-background-active"),
  "accent-ink": cor("control-primary-text-default"), // texto SOBRE o limão
  mention: cor("mention-foreground"),
  green: cor("status-positive"),
  yellow: cor("status-warning"),
  red: cor("status-danger"),
  "red-hover": cor("control-critical-primary-background-hover"),
  "txt-primary": cor("text-strong"),
  "txt-normal": cor("text-default"),
  "txt-secondary": cor("text-subtle"),
  "txt-muted": cor("text-muted"),
  "txt-faint": cor("channels-default"),
  "txt-link": cor("text-link"),
};

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ...coresDoDiscord,
        ...apelidosDaMigracao,
        // Paper: cor de MARCA (wordmark, assets), nunca superfície nem texto de UI.
        paper: "#FDFDFB",
      },
      fontFamily: {
        // `--font-primary` do Discord: gg sans → Noto Sans
        sans: ["var(--font-sans)", "Noto Sans", "Helvetica Neue", "Helvetica", "Arial", "sans-serif"],
        // `--font-headline`: ABC Ginto Nord → Noto Sans (use com `font-extrabold`)
        headline: ["var(--font-sans)", "Noto Sans", "Helvetica Neue", "Helvetica", "Arial", "sans-serif"],
        // `--font-code`: gg mono → Source Code Pro, com o resto da pilha do Discord
        mono: [
          "var(--font-mono)",
          "Source Code Pro",
          "Consolas",
          "Andale Mono WT",
          "Andale Mono",
          "Lucida Console",
          "Lucida Sans Typewriter",
          "DejaVu Sans Mono",
          "Bitstream Vera Sans Mono",
          "Liberation Mono",
          "Nimbus Mono L",
          "Monaco",
          "Courier New",
          "Courier",
          "monospace",
        ],
        // Archivo: SÓ o wordmark (`MarcaLockup`). Marca, não interface.
        display: ["var(--font-display)", "Archivo", "Helvetica Neue", "Helvetica", "Arial", "sans-serif"],
      },
      /**
       * A escala de texto do Discord (`tipografia-e-formas.json`, `escalaTexto`),
       * com o nome dele: `text-text-sm`, `text-heading-lg`… O peso vai à parte
       * (`font-semibold`), como as variantes `/semibold` dele. Em `rem` para
       * acompanhar a escala da fonte das configurações, como lá.
       */
      fontSize: {
        "text-xxs": ["0.625rem", { lineHeight: "1.2" }], // 10
        "text-xs": ["0.75rem", { lineHeight: "1.3333" }], // 12
        "text-sm": ["0.875rem", { lineHeight: "1.2857" }], // 14
        "text-md": ["1rem", { lineHeight: "1.25" }], // 16
        "text-lg": ["1.25rem", { lineHeight: "1.2" }], // 20
        "heading-sm": ["0.875rem", { lineHeight: "1.2857" }], // 14
        "heading-md": ["1rem", { lineHeight: "1.25" }], // 16
        "heading-lg": ["1.25rem", { lineHeight: "1.2" }], // 20
        "heading-xl": ["1.5rem", { lineHeight: "1.25" }], // 24
        "heading-xxl": ["2rem", { lineHeight: "1.25" }], // 32
      },
      letterSpacing: {
        // tracking do wordmark (Archivo 800 caixa-alta, >= 24px)
        wordmark: "-0.045em",
      },
      boxShadow: {
        // `shadow-shadow-high`, `shadow-elevation-low`… — as do Discord, pelo nome
        ...sombrasDoDiscord,
        // apelidos da migração (saem com os de cor)
        header: "var(--elevation-low)", // cabeçalho de 48px sobre a lista
        high: "var(--shadow-border), var(--shadow-high)", // popout: a combinação mais usada no Discord
      },
      screens: {
        /**
         * `celular:` — a mesma pergunta do `hooks/useEhMobile`, só que em CSS.
         *
         * O leiaute de celular é ligado por JS (`CONSULTA_MOBILE`), mas há
         * ajuste que não passa por componente do shell: alvo de toque numa
         * lista, campo de 48px, área segura — e as telas de conta, que shell
         * nenhum embrulha. Esses vão em classe, e a classe precisa perguntar
         * **exatamente o mesmo** que o hook.
         *
         * Por isso não serve o `max-md:` do Tailwind: ele é só
         * `(max-width: 767px)` e deixa o **telefone deitado** de fora — 844×390
         * é celular para o hook (ponteiro grosso, 390 de altura) e desktop para
         * o `max-md`, ou seja, girar o aparelho devolvia os alvos de 31px.
         *
         * Mantenha as duas em sincronia: se `CONSULTA_MOBILE` mudar, esta linha
         * muda junto. `raw` porque não é um ponto de quebra de largura, e sim a
         * consulta inteira — a vírgula ali é "ou".
         */
        celular: {
          raw: "(max-width: 767px), (pointer: coarse) and (max-height: 599px)",
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
