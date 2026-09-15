"use client";

import { useState } from "react";
import type { Message, Thumbnail as ThumbnailPayload } from "@streamz/shared";
import { THUMBNAIL_MAXIMA, tamanhoQueCabe } from "@/components/chat/bot/embed-layout";
import { ui } from "@/stores/ui";
import { SpoilerCobertura } from "./spoiler";

/** Anel de foco de teclado, o mesmo dos primitivos e do `EmbedDeBot`. */
const FOCO =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus";

/**
 * ── onda 3 (cartão 3e) ── `Thumbnail` (`type: 11`), só como acessório de
 * `Section` — não é componente de primeiro nível (`ComponenteDeMensagem` não
 * inclui `11`; ver `mensagens-de-bot.ts` §1.2). Mesmo teto que a thumbnail de
 * embed (`THUMBNAIL_MAXIMA`, `embed-layout.ts`, 80×80 **provisório** — lá
 * mesmo documentado como sem CSS bruto nem print 1:1 de embed com thumbnail):
 * a doc do Discord (`v2-section-com-thumbnail.webp`) desenha as duas do mesmo
 * jeito, quadrada, à direita do texto, e reusar o teto já provisório do embed
 * evita inventar um segundo número igualmente sem medida.
 *
 * Clique abre o visualizador que a mensagem já tem (`ui.openModal({kind:
 * "galeria", …})`, o mesmo caminho que `EmbedDeBot`/`MediaGroup` usam) — a
 * `url` já vem resolvida pelo `resolverAnexosDoPayload` do shared quando era
 * `attachment://`.
 */
export default function Thumbnail({
  componente,
  message,
}: {
  componente: ThumbnailPayload;
  message: Pick<Message, "id" | "efemera">;
}) {
  const [quebrou, setQuebrou] = useState(false);
  if (quebrou) return null;

  const tamanho = tamanhoQueCabe(componente.media.width, componente.media.height, THUMBNAIL_MAXIMA);
  const rotulo = componente.description ?? "Miniatura";
  const estilo = tamanho
    ? { width: tamanho.largura, aspectRatio: `${tamanho.largura} / ${tamanho.altura}` }
    : { maxWidth: THUMBNAIL_MAXIMA.largura, maxHeight: THUMBNAIL_MAXIMA.altura };

  const imagem = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={componente.media.url}
      alt=""
      loading="lazy"
      onError={() => setQuebrou(true)}
      className="block h-auto w-full rounded object-cover"
      style={estilo}
    />
  );

  if (componente.spoiler) {
    return (
      <div className="shrink-0" style={{ width: tamanho?.largura ?? THUMBNAIL_MAXIMA.largura }}>
        <SpoilerCobertura blurClassName="blur-2xl" rotulo={`Spoiler: mostrar ${rotulo}`}>
          {imagem}
        </SpoilerCobertura>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() =>
        ui.openModal({
          kind: "galeria",
          urls: [componente.media.url],
          alts: [rotulo],
          indice: 0,
          messageId: message.efemera ? undefined : message.id,
        })
      }
      aria-label={`Abrir ${rotulo}`}
      className={`block shrink-0 cursor-zoom-in overflow-hidden rounded ${FOCO}`}
      style={{ width: tamanho?.largura ?? THUMBNAIL_MAXIMA.largura }}
    >
      {imagem}
    </button>
  );
}
