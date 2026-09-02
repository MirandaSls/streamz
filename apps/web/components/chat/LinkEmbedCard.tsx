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
 * Paleta da barra lateral.
 *
 * No Discord a cor vem do próprio embed (`embed.color`, do Open Graph / da
 * integração). O nosso `LinkEmbed` ainda não carrega esse campo — enquanto ele
 * não existir, a cor é derivada do **domínio**: é estável (o mesmo site sempre
 * na mesma cor), o que já entrega metade do que a cor comunica, e some sozinha
 * no dia em que o contrato ganhar `color`.
 */
const PALETA = ["#4c7ef3", "#0e9f8a", "#c2701c", "#d24a7b", "#7c5cf0", "#3aa0d6"];

function corDoDominio(url: string): string {
  let host = url;
  try {
    host = new URL(url).hostname;
  } catch {
    // URL malformada: o hash do texto cru serve igual
  }
  let h = 0;
  for (let i = 0; i < host.length; i++) h = (h * 31 + host.charCodeAt(i)) >>> 0;
  return PALETA[h % PALETA.length];
}

/**
 * Largura do cartão, com ou sem imagem. Medida no embed do Discord
 * (`173327.png`, linha y=165): x 455..886, barra de 4px incluída e a borda de
 * 1px à direita também. Antes o cartão com imagem ia a 516 e o sem imagem a
 * 432; no Discord os dois têm a mesma largura.
 */
const LARGURA = 432;

/**
 * Card de prévia de link, como o embed do Discord: barra colorida de 4px à
 * esquerda, nome do site, título em azul, descrição inteira e imagem na
 * proporção real.
 *
 * Medidas do print (`173327.png`, cartão da Perplexity): raio 4 (canto sobe
 * 3, 1, 0 px nas três primeiras linhas; raio 8 subiria 5, 3, 2); borda de 1px
 * mais clara que o fundo no topo, à direita e embaixo (y=91 e 433, x=886), e
 * nenhuma à esquerda, onde está a barra; texto começa em x=471 (4 de barra +
 * 12 de recuo); nome do site com a tinta 13px abaixo do topo, que é o que o
 * `padding-top` de 8 dá com 12px/16px; título 16/600, 25px abaixo do nome
 * (8 de margem com linha de 22); descrição 14 com passo de 18 entre linhas;
 * imagem com a largura do conteúdo (399) e raio 4.
 *
 * A descrição **não** é truncada: o Discord mostra o texto completo com as
 * quebras de linha do Open Graph, e o `line-clamp-3` cortava justamente o
 * trecho que explicava o link.
 */
export default function LinkEmbedCard({ embed }: { embed: LinkEmbed }) {
  return (
    <div
      // `border-y border-r`, sem borda à esquerda: lá fica a barra, encostada
      // no canto como no Discord. `border` é o token de divisória que já
      // existe; sobre `panel` dá o mesmo "um tom acima" da borda do Discord
      className="mt-1 grid grid-cols-[auto_1fr] overflow-hidden rounded border-y border-r border-border"
      style={{ maxWidth: LARGURA }}
    >
      <div className="w-1 bg-panel" style={{ backgroundColor: corDoDominio(embed.url) }} aria-hidden="true" />
      <div className="min-w-0 bg-panel" style={{ padding: "8px 16px 16px 12px" }}>
        {embed.siteName && <div className="text-xs text-txt-muted">{embed.siteName}</div>}
        {embed.title && (
          <a
            href={embed.url}
            target="_blank"
            rel="noreferrer"
            className="mt-2 block font-semibold leading-[22px] text-txt-link hover:underline"
          >
            {embed.title}
          </a>
        )}
        {embed.description && (
          <p className="mt-2 whitespace-pre-line text-sm leading-[18px] text-txt-normal">
            {embed.description}
          </p>
        )}
        {embed.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={embed.image}
            alt=""
            loading="lazy"
            // `contain`: `cover` recortava a prévia e escondia o que ela mostrava
            className="mt-4 max-h-[300px] max-w-full rounded object-contain"
          />
        )}
      </div>
    </div>
  );
}
