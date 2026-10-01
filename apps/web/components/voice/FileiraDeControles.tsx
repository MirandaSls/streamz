"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { LarguraDaFileira, larguraDoCentro } from "@/components/voice/compactacao-da-barra";
import { janelaDe } from "@/lib/outra-janela";

/** `gap-4` entre as colunas da grade. */
const GAP_PX = 16;
/** `px-4` da raiz, dos dois lados. */
const PADDING_X_PX = 32;
/** Colchão além da conta exata, para não trocar de estado a cada pixel de arredondamento. */
const FOLGA_PADRAO_PX = 0;

/**
 * Decide quais slots laterais cabem ao lado da cápsula central, sem se
 * sobrepor a ela.
 *
 * Função pura — recebe larguras já medidas, não mede nada sozinha — para dar
 * para testar sem montar DOM.
 *
 * A conta **não** é "esconder a direita libera espaço para a esquerda": na
 * grade `1fr auto 1fr` as duas colunas laterais têm sempre a mesma largura,
 * `(raiz − padding − 2·gap − centro) / 2`, escondido ou não o vizinho — o
 * lado escondido fica `invisible`, não `hidden`, e a coluna continua `1fr`
 * do mesmo jeito. Cada lado cabe ou não sozinho, contra essa coluna fixa; a
 * pergunta nunca é "cabe X junto com Y", porque Y não empresta a própria
 * largura para X. A direita cai primeiro (o porquê está no cabeçalho do
 * componente) só por regra de exibição — nunca aparece sem a esquerda, mesmo
 * quando ela sozinha caberia.
 */
export function ladosVisiveis(
  raiz: number,
  centro: number,
  esquerda: number,
  direita: number,
  folga = FOLGA_PADRAO_PX,
): { esquerda: boolean; direita: boolean } {
  const coluna = (raiz - folga - PADDING_X_PX - 2 * GAP_PX - centro) / 2;
  const cabeEsq = esquerda <= coluna;
  const cabeDir = direita <= coluna;
  return { esquerda: cabeEsq, direita: cabeEsq && cabeDir };
}

/**
 * A fileira do rodapé do palco de voz: seta de expandir, cápsula de
 * controles e ícones do canto, todos no mesmo eixo horizontal.
 *
 * **Por que existe.** As três peças eram `absolute` independentes, cada uma
 * medida contra o canto da tela que lhe cabia. Em palco largo isso nunca
 * aparecia — sobrava espaço nos dois lados —, mas em janela estreita (o
 * palco de voz cabe dentro de uma coluna de chat, não só na tela cheia) as
 * caixas se cruzam: a seta de expandir passa por baixo da cápsula, os ícones
 * do canto por cima dela. `grid-cols-[1fr_auto_1fr]` resolve isso de uma vez
 * — a cápsula fica centralizada no **palco inteiro**, não no espaço que sobra
 * depois de posicionar os cantos primeiro (é essa ordem invertida que causava
 * a sobreposição: cada `absolute` reivindicava seu canto sem saber do
 * vizinho), e os dois `1fr` empurram os laterais para fora do caminho dela
 * antes de sequer cogitar se cabem.
 *
 * **Por que a direita some primeiro.** Pop-out e tela cheia (`direita`) são
 * ações sobre a **janela** — outra tela, outro modo de exibição — que fazem
 * sentido perder quando o espaço aperta: o palco continua usável sem elas. A
 * seta de expandir (`esquerda`) é ação sobre o **leiaute** deste palco, mais
 * perto do que a pessoa está fazendo agora; ela só some quando nem isso cabe
 * mais. A ordem não é estética, é o que dói menos perder primeiro.
 *
 * A raiz inteira é `pointer-events-none`: o vão entre as três colunas não é
 * clicável (ele é, por baixo, o vídeo do palco), só o conteúdo de cada slot
 * — devolvido pelo `pointer-events-auto` de cada um — recebe clique.
 *
 * Quando um lado não cabe mais ele não desmonta: fica `invisible` (mantém a
 * caixa no layout, só some da tela) e `aria-hidden`, porque desmontar
 * apagaria a própria medida que decide se ele volta a caber no redimensionamento
 * seguinte — teria que esperar o próximo frame remontado para saber se coube.
 */
export default function FileiraDeControles({
  esquerda,
  centro,
  direita,
}: {
  /** seta de expandir / convidar. */
  esquerda?: ReactNode;
  /** a cápsula (`VoiceControls`), em fluxo. */
  centro: ReactNode;
  /** `IconesDoCanto`, em fluxo. */
  direita?: ReactNode;
}) {
  const raizRef = useRef<HTMLDivElement>(null);
  const centroRef = useRef<HTMLDivElement>(null);
  const esquerdaRef = useRef<HTMLDivElement>(null);
  const direitaRef = useRef<HTMLDivElement>(null);

  // `null` até a primeira medição: antes disso mostra os dois lados (é o que
  // a marcação já mostra sem JS nenhum), para não piscar escondido no
  // primeiro frame por causa de um estado que ainda não foi medido.
  const [medidas, setMedidas] = useState<null | {
    raiz: number;
    centro: number;
    esquerda: number;
    direita: number;
  }>(null);

  const temEsquerda = !!esquerda;
  const temDireita = !!direita;

  useEffect(() => {
    if (typeof ResizeObserver === "undefined") return;
    const raizEl = raizRef.current;
    const centroEl = centroRef.current;
    if (!raizEl || !centroEl) return;

    const alvos: [HTMLElement, "raiz" | "centro" | "esquerda" | "direita"][] = [
      [raizEl, "raiz"],
      [centroEl, "centro"],
    ];
    if (esquerdaRef.current) alvos.push([esquerdaRef.current, "esquerda"]);
    if (direitaRef.current) alvos.push([direitaRef.current, "direita"]);

    const medir = () =>
      setMedidas((atual) => {
        const base = atual ?? { raiz: 0, centro: 0, esquerda: 0, direita: 0 };
        const proximo = { ...base };
        // largura do próprio slot, não da coluna `1fr` da grade — como o
        // slot não estica (`justify-self-start`/`justify-self-end`), o
        // tamanho dele já é o conteúdo, e não o espaço que a grade reservou.
        for (const [el, chave] of alvos) proximo[chave] = el.offsetWidth;
        return proximo;
      });

    // o da janela da fileira: na solta da chamada, o da principal não mede
    const ro = new (janelaDe(raizEl).ResizeObserver)(medir);
    alvos.forEach(([el]) => ro.observe(el));
    medir();
    return () => ro.disconnect();
  }, [temEsquerda, temDireita]);

  const visiveis = medidas
    ? ladosVisiveis(medidas.raiz, medidas.centro, medidas.esquerda, medidas.direita)
    : { esquerda: true, direita: true };

  // A direita nunca aparece sem a esquerda, então basta olhar a esquerda.
  const lateraisEscondidos = !visiveis.esquerda;

  return (
    // Consumido pelo `VoiceControls` para compactar a cápsula central.
    <LarguraDaFileira.Provider value={medidas ? larguraDoCentro(medidas.raiz, lateraisEscondidos) : null}>
      <div
        ref={raizRef}
        // Sem laterais, as colunas `1fr` vazias ainda cobrariam gap e padding do
        // centro; `gap-0 px-2` devolve esse espaço (só esconder nunca faz voltar).
        className={`pointer-events-none absolute inset-x-0 bottom-5 z-10 grid grid-cols-[1fr_auto_1fr] items-center ${
          lateraisEscondidos ? "gap-0 px-2" : "gap-4 px-4"
        }`}
      >
        <div className="min-w-0 justify-self-start">
          {esquerda && (
            <div
              ref={esquerdaRef}
              aria-hidden={!visiveis.esquerda}
              className={`inline-flex pointer-events-auto ${
                visiveis.esquerda ? "" : "invisible pointer-events-none"
              }`}
            >
              {esquerda}
            </div>
          )}
        </div>

        <div ref={centroRef} className="pointer-events-auto">
          {centro}
        </div>

        <div className="min-w-0 justify-self-end">
          {direita && (
            <div
              ref={direitaRef}
              aria-hidden={!visiveis.direita}
              className={`inline-flex pointer-events-auto ${
                visiveis.direita ? "" : "invisible pointer-events-none"
              }`}
            >
              {direita}
            </div>
          )}
        </div>
      </div>
    </LarguraDaFileira.Provider>
  );
}
