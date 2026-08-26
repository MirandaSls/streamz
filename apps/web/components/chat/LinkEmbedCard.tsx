"use client";

import { useEffect, useState } from "react";
import type { LinkEmbed } from "@streamz/shared";
import { api } from "@/lib/api";

/** Cache por URL, compartilhado entre mensagens — a mesma URL não é buscada duas vezes. */
const cache = new Map<string, Promise<LinkEmbed | null>>();

export function useLinkEmbed(url: string | null): LinkEmbed | null | undefined {
  const [embed, setEmbed] = useState<LinkEmbed | null | undefined>(undefined);
  useEffect(() => {
    if (!url) return;
    let vivo = true;
    let p = cache.get(url);
    if (!p) {
      p = api.embed(url).catch(() => null);
      cache.set(url, p);
    }
    void p.then((e) => vivo && setEmbed(e));
    return () => {
      vivo = false;
    };
  }, [url]);
  return url ? embed : null;
}

/**
 * Card de prévia de link, como o embed do Discord: barra à esquerda, nome do
 * site, título em azul, descrição e imagem.
 */
export default function LinkEmbedCard({ embed }: { embed: LinkEmbed }) {
  return (
    <div className="mt-1 grid max-w-[520px] grid-cols-[auto_1fr] overflow-hidden rounded bg-panel">
      <div className="w-1 bg-[#1e1f22]" aria-hidden="true" />
      <div className="min-w-0 p-3 pl-3">
        {embed.siteName && <div className="text-xs text-txt-muted">{embed.siteName}</div>}
        {embed.title && (
          <a
            href={embed.url}
            target="_blank"
            rel="noreferrer"
            className="mt-0.5 block font-semibold text-txt-link hover:underline"
          >
            {embed.title}
          </a>
        )}
        {embed.description && (
          <p className="mt-1 line-clamp-3 text-sm text-txt-normal">{embed.description}</p>
        )}
        {embed.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={embed.image}
            alt=""
            loading="lazy"
            className="mt-3 max-h-[300px] max-w-full rounded object-cover"
          />
        )}
      </div>
    </div>
  );
}
