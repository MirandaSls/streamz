"use client";

import type { ScreenQuality } from "@streamz/shared";
import { RESOLUCOES, TAXAS, juntarPreset, separarPreset } from "@/lib/seletor-de-tela";

/**
 * Os dois controles segmentados da qualidade da transmissão de tela —
 * resolução e taxa de quadros —, num componente só porque agora eles moram em
 * dois lugares:
 *
 * - no **rodapé do seletor** do desktop (`ScreenSharePicker`), ao lado da
 *   grade de miniaturas, que é onde a escolha se vê;
 * - na **aba Voz das configurações** (`settings/VozTab`), que passou a ser o
 *   lugar da escolha no navegador, onde clicar em "Compartilhar tela" vai
 *   direto para o diálogo do próprio navegador e não há rodapé nenhum.
 *
 * Duplicar os segmentos deixaria as duas telas divergirem no primeiro ajuste;
 * a forma (sulco de 40px raio 8, segmentos de 32px, acento limão no ativo) é a
 * mesma da barra de abas do seletor e vale nos dois.
 */
export function SegmentosDeQualidade({
  quality,
  onQualidade,
  className = "flex flex-wrap items-center gap-4",
}: {
  quality: ScreenQuality;
  onQualidade: (q: ScreenQuality) => void;
  /** Como os dois segmentos se arrumam no contêiner de quem chama. */
  className?: string;
}) {
  const { resolucao, fps } = separarPreset(quality);
  return (
    <div className={className}>
      <Segmento
        rotulo="Resolução"
        opcoes={RESOLUCOES.map((r) => ({ valor: r, texto: r }))}
        atual={resolucao}
        onEscolher={(v) => onQualidade(juntarPreset(v, fps))}
      />
      <Segmento
        rotulo="Taxa de quadros"
        opcoes={TAXAS.map((f) => ({ valor: f, texto: `${f} fps` }))}
        atual={fps}
        onEscolher={(v) => onQualidade(juntarPreset(resolucao, v))}
      />
    </div>
  );
}

/**
 * Controle segmentado de uma linha (rótulo à esquerda, opções à direita), na
 * mesma forma da barra de abas do seletor: sulco de 40px raio 8, segmentos de
 * 32px. Dois deles cabem lado a lado; o rótulo em versalete é o que os separa
 * sem precisar de moldura.
 */
function Segmento({
  rotulo,
  opcoes,
  atual,
  onEscolher,
}: {
  rotulo: string;
  opcoes: { valor: string; texto: string }[];
  atual: string;
  onEscolher: (valor: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="whitespace-nowrap text-xs font-semibold uppercase tracking-[0.02em] text-txt-muted">
        {rotulo}
      </span>
      <div role="group" aria-label={rotulo} className="flex h-10 gap-1 rounded-lg bg-rail p-1">
        {opcoes.map((o) => (
          <button
            key={o.valor}
            type="button"
            aria-pressed={atual === o.valor}
            onClick={() => onEscolher(o.valor)}
            className={`h-8 rounded-md px-3 text-sm font-semibold transition ${
              atual === o.valor
                ? "bg-accent text-accent-ink"
                : "text-txt-muted hover:bg-hov hover:text-txt-primary"
            }`}
          >
            {o.texto}
          </button>
        ))}
      </div>
    </div>
  );
}
