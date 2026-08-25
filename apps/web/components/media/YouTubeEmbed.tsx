"use client";

import { useState } from "react";
import { Play } from "lucide-react";

/**
 * Player do YouTube dentro da mensagem, como o Discord.
 *
 * Começa como capa + botão: um `<iframe>` por link de vídeo numa timeline
 * cheia carregaria o player do YouTube dezenas de vezes (e entregaria o
 * cookie de quem lê a cada mensagem). O iframe só nasce no clique — e aí já
 * com `autoplay`, para o clique valer como "tocar".
 *
 * `youtube-nocookie.com`: o domínio sem rastreamento até o vídeo rodar.
 */
export default function YouTubeEmbed({ videoId, title }: { videoId: string; title: string }) {
  const [tocando, setTocando] = useState(false);

  if (tocando) {
    return (
      <iframe
        src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1`}
        title={title}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture"
        allowFullScreen
        className="mt-1 aspect-video w-[400px] max-w-full rounded-lg border-0 bg-black"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setTocando(true)}
      aria-label={`Tocar ${title}`}
      className="group/yt relative mt-1 block aspect-video w-[400px] max-w-full overflow-hidden rounded-lg bg-black"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`}
        alt=""
        loading="lazy"
        className="h-full w-full object-cover"
      />
      <span className="absolute inset-0 grid place-items-center bg-black/25 transition group-hover/yt:bg-black/40">
        <span className="grid h-14 w-14 place-items-center rounded-full bg-red text-white">
          <Play size={26} fill="currentColor" aria-hidden="true" />
        </span>
      </span>
    </button>
  );
}
