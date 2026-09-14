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
 * Medidas, print 1:1 (`173327.png`, cartões da Perplexity/Comet) × CSS bruto
 * (`.embedFull__623de`/`.grid__623de` de
 * `docs/referencias-discord/tokens/css-bruto/198496.7ea2af35bfe94977.css`):
 * - **Fundo `background-surface-high`, não `background-base-lowest`.** A
 *   caixa mede `#242429` no print (coluna x=670, y=92–162) — é exatamente
 *   `--background-surface-high` (`VARIAVEIS.md`), um tom **mais claro** que o
 *   chat (`#1a1a1e`, `--background-base-lower`). `background-base-lowest`
 *   (`#121214`) é mais escuro que o chat, direção invertida da do Discord.
 * - Raio 4 (`.embed__623de{border-radius:4px}`, e o canto do print sobe 3, 1,
 *   0px nas três primeiras linhas — raio 8 subiria 5, 3, 2).
 * - Borda 1px `border-subtle` no topo/direita/baixo, nenhuma à esquerda
 *   (onde fica a barra).
 * - Padding do conteúdo (`.grid__623de{padding-block:.5rem 1rem;
 *   padding-inline:.75rem 1rem;padding-top:.125rem}`, a última regra vence a
 *   primeira no topo): **2px topo, 16px direita, 16px baixo, 12px esquerda**
 *   — bate com o texto começando em x=471 (barra em 455–458 + 12).
 * - Nome do site (`embedProvider`): sem `color`/`font-size` próprios no CSS,
 *   então herda do texto do embed; o pico de tinta no print (`#dedee1`,
 *   linha y=109) fica muito acima de `text-muted` (`#96979e`) e perto de
 *   `text-default` (`#efeff1`, o mesmo pico que a descrição bate exatamente
 *   em y=165) — por isso `text-default`, não `text-muted`. Tamanho 14
 *   (`embedAuthorName` — mesma família de texto do embed — é `.875rem`).
 * - Título: `font-size:1rem` (16), `font-weight:var(--font-weight-semibold)`,
 *   cor `text-strong` quando não é link e `text-link` quando é (sempre é,
 *   aqui) — `#4d96ee` bate pixel a pixel no print (y=136).
 * - `embedTitle`/`embedDescription`/`embedProvider` não têm `margin` no CSS:
 *   o espaço entre eles vem só da entrelinha de cada um, não de uma margem
 *   somada — por isso não há `mt-2` extra entre as linhas aqui.
 * - Imagem: `.embedFull__623de .embedMedia__623de{margin-top:16px}` e
 *   `.embedMedia__623de{border-radius:4px}`.
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
      // existe; sobre `background-surface-high` dá o mesmo "um tom acima" do
      // chat que o Discord tem.
      className="mt-1 grid grid-cols-[auto_1fr] overflow-hidden rounded border-y border-r border-border-subtle"
      style={{ maxWidth: LARGURA }}
    >
      <div className="w-1 bg-background-surface-high" style={{ backgroundColor: corDoDominio(embed.url) }} aria-hidden="true" />
      <div className="min-w-0 bg-background-surface-high" style={{ padding: "2px 16px 16px 12px" }}>
        {embed.siteName && <div className="text-sm font-medium text-text-default">{embed.siteName}</div>}
        {embed.title && (
          <a
            href={embed.url}
            target="_blank"
            rel="noreferrer"
            className="block font-semibold leading-[22px] text-text-link hover:underline"
          >
            {embed.title}
          </a>
        )}
        {embed.description && (
          <p className="whitespace-pre-line text-sm leading-[18px] text-text-default">
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
