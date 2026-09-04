"use client";

import { parseCustomEmoji } from "@streamz/shared";
import { API_URL } from "@/lib/config";

/**
 * O emoji de uma reação: unicode sai como texto; personalizado é `<:nome:id>` e
 * vira a imagem daquele id — a mesma URL pública que o markdown usa, para a
 * reação não virar `<:festa:abc>` escrito na tela.
 *
 * Os dois casos ocupam a **mesma caixa quadrada** de lado `tamanho`, centrada.
 * O unicode é texto, e texto se posiciona pela linha de base da fonte: com
 * `line-height: 1.1` a caixa de linha ficava maior que a caixa de conteúdo do
 * chip e o glifo descia — no Segoe UI Emoji do Windows a tinta de 😂 tem a
 * altura inteira do em, então ele saía pela borda de baixo. Uma caixa fixa com
 * `line-height: 1` e centralização por flex tira a métrica da fonte da conta.
 *
 * Nada de Twemoji: a CSP não deixa buscar de CDN e o desktop roda offline. A
 * fonte é a do sistema; o que se acerta aqui é a caixa.
 *
 * Mora num arquivo próprio porque agora tem dois donos: a mensagem
 * (`components/MessageItem.tsx`) e o visualizador de imagem em tela cheia
 * (`components/modals/ImageModal.tsx`), que mostra as reações da mensagem da
 * imagem embaixo dela.
 */
export function EmojiDaReacao({ emoji, tamanho }: { emoji: string; tamanho: number }) {
  const custom = parseCustomEmoji(emoji);
  // o tamanho é preferência do usuário (aba Acessibilidade de e-configuracoes)
  if (!custom)
    return (
      <span
        className="inline-flex shrink-0 items-center justify-center"
        style={{ fontSize: `${tamanho}px`, lineHeight: 1, height: tamanho, width: tamanho }}
      >
        {emoji}
      </span>
    );
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`${API_URL}/api/emojis/${custom.id}/image`}
      alt={`:${custom.name}:`}
      loading="lazy"
      style={{ height: tamanho, width: tamanho }}
      className="shrink-0 object-contain"
    />
  );
}

/** Texto acessível de uma reação (o leitor de tela não lê a imagem do emoji). */
export function rotuloDaReacao(emoji: string): string {
  const custom = parseCustomEmoji(emoji);
  return custom ? `:${custom.name}:` : emoji;
}
