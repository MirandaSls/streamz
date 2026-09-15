"use client";

import { useState } from "react";
import type { ItemDaGaleria, MediaGallery as MediaGalleryPayload, Message } from "@streamz/shared";
import { ui } from "@/stores/ui";
import { PilulaDeSpoiler } from "./spoiler";

/**
 * ── onda 3 (cartão 3e) ── `MediaGallery` (`type: 12`), 1–10 itens.
 *
 * **Grade de 3 itens: medida.** `css-bruto/sob-demanda/0b1df0210becea61.css` —
 * `.embedGalleryImagesWrapper__623de{display:grid;grid-template-columns:1fr
 * 1fr;column-gap:4px}` com `.embedGallerySide__623de{display:flex;flex-
 * direction:column}` e `.galleryImage__623de{min-height:calc(50% - 2px)}` —
 * é a galeria de várias imagens que o próprio Discord já tem (hoje usada em
 * embed com várias imagens), e bate exatamente com
 * `desenvolvedores/imagens/componentes/v2-media-gallery.webp` (3 fotos: uma
 * grande à esquerda, duas empilhadas à direita, mesma family de grade). Uso
 * essa estrutura para 3 itens.
 *
 * **1, 2, 4 e 5–10: não medido.** Nem o CSS bruto nem os prints 1:1 têm uma
 * galeria de bot com outra contagem — só a doc mostra 3. Para 1 uso a imagem
 * sozinha (mesmo teto de `IMAGEM_MAXIMA` do embed); para 2 e para 4, grades
 * simétricas (`grid-cols-2`); para 5–10, empacoto em duas colunas que
 * quebram linha — o mesmo comportamento genérico que `MediaGroup.tsx` (só
 * leitura) já usa para "muitas imagens", reaproveitado por ser a convenção
 * que o resto do app já assume nesse caso, não uma medida nova.
 *
 * Altura fixa de **300px** (2+ itens) e largura de até **550px**: os mesmos
 * dois números que `MediaGroup.tsx` usa para o mosaico de anexos comuns
 * (`IMAGEM_MAXIMA.altura` do embed e o teto de grade de anexos) — mesma
 * família visual, não um terceiro valor inventado.
 *
 * Clique abre o visualizador (`ui.openModal({kind:"galeria",…})`, mesma rota
 * que `EmbedDeBot`/`MediaGroup`/`Thumbnail` usam) com **todos** os itens da
 * galeria, para `←`/`→` percorrerem-na — como o mosaico de anexos já faz.
 */
export default function MediaGallery({
  componente,
  message,
}: {
  componente: MediaGalleryPayload;
  message: Pick<Message, "id" | "efemera">;
}) {
  const itens = componente.items;
  const urls = itens.map((i) => i.media.url);
  const alts = itens.map((i) => i.description ?? "Imagem da galeria");

  function abrir(indice: number) {
    ui.openModal({ kind: "galeria", urls, alts, indice, messageId: message.efemera ? undefined : message.id });
  }

  if (itens.length === 1) {
    return (
      <div className="max-w-[400px]">
        <ItemDeGaleria item={itens[0]} alt={alts[0]} onAbrir={() => abrir(0)} className="max-h-[300px] w-fit rounded object-contain" />
      </div>
    );
  }

  if (itens.length === 3) {
    return (
      <div className="flex h-[300px] max-w-[550px] gap-1 overflow-hidden rounded">
        <div className="min-w-0 flex-1">
          <ItemDeGaleria item={itens[0]} alt={alts[0]} onAbrir={() => abrir(0)} className="h-full w-full object-cover" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="min-h-0 flex-1">
            <ItemDeGaleria item={itens[1]} alt={alts[1]} onAbrir={() => abrir(1)} className="h-full w-full object-cover" />
          </div>
          <div className="min-h-0 flex-1">
            <ItemDeGaleria item={itens[2]} alt={alts[2]} onAbrir={() => abrir(2)} className="h-full w-full object-cover" />
          </div>
        </div>
      </div>
    );
  }

  // 2, 4–10: grade simétrica de 2 colunas, quebrando linha.
  return (
    <div className="grid max-w-[550px] grid-cols-2 gap-1 overflow-hidden rounded [&>*]:aspect-square">
      {itens.map((item, i) => (
        <ItemDeGaleria key={i} item={item} alt={alts[i]} onAbrir={() => abrir(i)} className="h-full w-full object-cover" />
      ))}
    </div>
  );
}

/** Anel de foco de teclado, o mesmo dos primitivos e do `EmbedDeBot`. */
const FOCO =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus";

/**
 * Um item da galeria: imagem (ou vídeo, quando `content_type` começa com
 * `video/` — o Discord aceita os dois num item de `MediaGallery`) com a
 * cortina de spoiler, como `MediaGroup.tsx` já faz para anexo comum: o
 * primeiro clique revela, o próximo abre o visualizador — não os dois de
 * uma vez, para ninguém abrir o que ainda não quis ver.
 */
function ItemDeGaleria({
  item,
  alt,
  onAbrir,
  className,
}: {
  item: ItemDaGaleria;
  alt: string;
  onAbrir: () => void;
  className: string;
}) {
  const [revelado, setRevelado] = useState(!item.spoiler);
  const [quebrou, setQuebrou] = useState(false);
  const ehVideo = item.media.content_type?.startsWith("video/") ?? false;

  if (quebrou) return null;

  if (!revelado) {
    return (
      <button
        type="button"
        onClick={() => setRevelado(true)}
        aria-label={`Spoiler: mostrar ${alt}`}
        className="relative block h-full w-full overflow-hidden"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={item.media.url} alt="" aria-hidden="true" className={`blur-2xl ${className}`} />
        <PilulaDeSpoiler />
      </button>
    );
  }

  if (ehVideo) {
    return (
      <video
        src={item.media.url}
        controls
        preload="metadata"
        aria-label={alt}
        onError={() => setQuebrou(true)}
        className={`bg-black ${className}`}
      />
    );
  }

  return (
    <button type="button" onClick={onAbrir} aria-label={`Abrir ${alt}`} className={`block cursor-zoom-in ${FOCO}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={item.media.url} alt={alt} loading="lazy" onError={() => setQuebrou(true)} className={className} />
    </button>
  );
}
