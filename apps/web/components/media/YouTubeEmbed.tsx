"use client";

import { useState } from "react";
import { Play } from "@/components/ui/icones";

/**
 * Player do YouTube dentro da mensagem, como o Discord.
 *
 * Começa como capa + botão: um `<iframe>` por link de vídeo numa timeline
 * cheia carregaria o player do YouTube dezenas de vezes (e entregaria o
 * cookie de quem lê a cada mensagem). O iframe só nasce no clique — e aí já
 * com `autoplay`, para o clique valer como "tocar".
 *
 * `youtube-nocookie.com`: o domínio sem rastreamento até o vídeo rodar.
 *
 * Raio 4 (`rounded`, não `rounded-lg`): `.embedMedia__623de{border-radius:4px}`
 * e `.embedVideo__623de` herdam do mesmo `.embedImage__623de,.embedThumbnail__623de,
 * .embedVideo__623de{...} .../video{border-radius:4px}` em
 * `docs/referencias-discord/tokens/css-bruto/198496.7ea2af35bfe94977.css` — é
 * o raio que todo embed de mídia usa (mesmo do `LinkEmbedCard`), não medido
 * com um raio próprio maior.
 */
export default function YouTubeEmbed({ videoId, title }: { videoId: string; title: string }) {
  const [tocando, setTocando] = useState(false);
  // miniatura sem imagem (`videoId` inválido/apagado): fundo preto liso em
  // vez do ícone de imagem quebrada do navegador — o botão de tocar continua
  // clicável, e o erro real só aparece dentro do iframe do YouTube
  const [semMiniatura, setSemMiniatura] = useState(false);

  if (tocando) {
    return (
      <iframe
        src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1`}
        title={title}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture"
        allowFullScreen
        className="mt-1 aspect-video w-[400px] max-w-full rounded border-0 bg-black"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setTocando(true)}
      aria-label={`Tocar ${title}`}
      className="group/yt relative mt-1 block aspect-video w-[400px] max-w-full overflow-hidden rounded bg-black"
    >
      {!semMiniatura && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`}
          alt=""
          loading="lazy"
          onError={() => setSemMiniatura(true)}
          className="h-full w-full object-cover"
        />
      )}
      <span className="absolute inset-0 grid place-items-center bg-background-scrim/25 transition group-hover/yt:bg-background-scrim/40">
        <span className="grid h-14 w-14 place-items-center rounded-full bg-status-danger text-control-critical-primary-text-default">
          <Play size={26} fill="currentColor" aria-hidden="true" />
        </span>
      </span>
    </button>
  );
}
