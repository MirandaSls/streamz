"use client";

import { useMemo, useState } from "react";
import { arquivosTwemoji, urlTwemoji } from "@/lib/twemoji";

/**
 * Tamanho do emoji:
 * - `"inline"`: dentro do texto, **1.375em** — acompanha a fonte de quem o
 *   contém (a mensagem, um título);
 * - `"jumbo"`: mensagem feita só de emoji, **3rem** (48 px na base de 16);
 * - número: lado em px, para grade, chip e prévia, que têm caixa própria.
 *
 * Os dois nomes são as variáveis do Discord `--custom-emoji-size-emoji:1.375em`
 * e `--custom-emoji-size-jumbo-emoji:3rem` (css-bruto/419070.*.css, `:root`),
 * aplicadas por `.emoji` e `.emoji.jumboable` (css-bruto/552653.*.css).
 */
export type TamanhoDoEmoji = "inline" | "jumbo" | number;

/**
 * Classes da caixa do emoji no texto, compartilhadas com o emoji personalizado
 * do markdown — no Discord os dois são o mesmo `img.emoji`.
 *
 * `vertical-align: bottom`, e não um deslocamento em em: é o que o `.emoji` do
 * CSS atual do Discord declara (552653.*.css). Com a linha da mensagem de
 * 1.375rem (`.markup__75297` usa `--chat-markup-line-height`, 1.375rem em
 * VARIAVEIS.md) e o texto de 1rem, a imagem de 1.375em tem a altura exata da
 * linha e encosta embaixo — não sobra meia-linha para acertar à mão.
 * `object-fit: contain` vem da mesma regra.
 *
 * **`inline-block` é obrigatório**: o preflight do Tailwind põe `display: block`
 * em toda `<img>`, e sem isto cada emoji quebra a linha — o texto some para cima
 * e uma mensagem de três emoji vira três linhas (visto na captura da bancada).
 */
export const CLASSE_EMOJI_INLINE = "inline-block h-[1.375em] w-[1.375em] object-contain align-bottom";
/**
 * `.emoji.jumboable`: 3rem, com `min-height` para a linha não o espremer.
 *
 * `inline-block`, como o inline: vários jumbo ficam **lado a lado** na mesma
 * linha (o Discord embrulha cada um em `.emojiContainer__75abc{display:inline-block}`,
 * css-bruto/992956.*.css), e não empilhados.
 *
 * `py-1` + `box-content`: `.messageContentWrapper_d3c698 .emoji.jumboable{padding:4px 0}`
 * (css-bruto, mesma regra do sticker). Nenhum CSS do Discord põe
 * `box-sizing:border-box` universal — procurado em `*`, `img` e `html` nos 303
 * + 850 arquivos —, então a imagem continua com 48px e a caixa fica com 56px.
 * Com o `border-box` do preflight do Tailwind o padding comeria o desenho.
 */
export const CLASSE_EMOJI_JUMBO =
  "inline-block box-content h-[3rem] min-h-[3rem] w-[3rem] py-1 object-contain align-bottom";

/**
 * Emoji Unicode desenhado com o Twemoji local (`/twemoji/<codepoints>.svg`),
 * como no Discord.
 *
 * - `alt` é o próprio emoji: selecionar e copiar a mensagem devolve o caractere,
 *   não um nome — é o `alt` que o navegador põe no texto copiado.
 * - `draggable={false}`: arrastar a imagem soltaria uma URL no composer em vez
 *   do emoji.
 * - Se o arquivo não existe (emoji mais novo que o pacote, sequência que o
 *   Twemoji não desenha), tenta o nome alternativo de `arquivosTwemoji` e, por
 *   fim, cai no glifo do sistema. Quadrado quebrado nunca; texto sumido também
 *   não.
 */
export default function Emoji({
  emoji,
  tamanho = "inline",
  className = "",
}: {
  emoji: string;
  tamanho?: TamanhoDoEmoji;
  className?: string;
}) {
  const candidatos = useMemo(() => arquivosTwemoji(emoji), [emoji]);
  // as falhas são do emoji que as teve: se o mesmo nó passa a mostrar outro
  // emoji (lista reaproveitando o componente), a contagem recomeça
  const [falhas, setFalhas] = useState<{ emoji: string; n: number }>({ emoji, n: 0 });
  const n = falhas.emoji === emoji ? falhas.n : 0;

  const lado = typeof tamanho === "number" ? tamanho : null;

  if (n >= candidatos.length) {
    if (lado === null) {
      // no texto, o glifo do sistema entra no tamanho da fonte, como antes do
      // Twemoji; no jumbo, com a fonte do jumbo
      return (
        <span className={`${tamanho === "jumbo" ? "text-[3rem] leading-none" : ""} ${className}`}>
          {emoji}
        </span>
      );
    }
    // com caixa fixa o glifo ocupa a mesma caixa que a imagem ocuparia, e a
    // centralização por flex tira a métrica da fonte da conta (ver EmojiDeReacao)
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center leading-none ${className}`}
        style={{ width: lado, height: lado, fontSize: lado }}
      >
        {emoji}
      </span>
    );
  }

  const classeTamanho =
    tamanho === "jumbo" ? CLASSE_EMOJI_JUMBO : tamanho === "inline" ? CLASSE_EMOJI_INLINE : "object-contain";

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={urlTwemoji(candidatos[n])}
      alt={emoji}
      draggable={false}
      loading="lazy"
      decoding="async"
      width={lado ?? undefined}
      height={lado ?? undefined}
      style={lado !== null ? { width: lado, height: lado } : undefined}
      onError={() => setFalhas({ emoji, n: n + 1 })}
      className={`${classeTamanho} ${className}`}
    />
  );
}
