"use client";

import type { ScreenQuality } from "@streamz/shared";
import { ALVO_MINIMO } from "@/components/voice/palco-mobile";
import { useEhMobile } from "@/hooks/useEhMobile";
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
 *
 * **No celular os segmentos crescem para 44.** `h-8` desenha 31px com a raiz de
 * 15,5 (a escala do Tailwind é `rem`), e 31 é menos que dois terços do piso de
 * toque: no navegador é aqui que se escolhe a qualidade da transmissão (o
 * seletor com rodapé só existe no app de desktop), então estes são os botões da
 * escolha, não uma preferência escondida. O sulco acompanha, 44 + os 8 do `p-1`.
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
  const ehMobile = useEhMobile();
  return (
    <div className="flex items-center gap-2">
      <span className="whitespace-nowrap text-xs font-semibold uppercase tracking-[0.02em] text-text-muted">
        {rotulo}
      </span>
      <div
        role="group"
        aria-label={rotulo}
        style={ehMobile ? { height: ALVO_MINIMO + 8 } : undefined}
        className={`flex gap-1 rounded-lg bg-input-background-default p-1 ${ehMobile ? "" : "h-10"}`}
      >
        {opcoes.map((o) => (
          <button
            key={o.valor}
            type="button"
            aria-pressed={atual === o.valor}
            onClick={() => onEscolher(o.valor)}
            style={ehMobile ? { height: ALVO_MINIMO } : undefined}
            className={`rounded-md px-3 text-sm font-semibold transition ${ehMobile ? "" : "h-8"} ${
              atual === o.valor
                ? "bg-brand-500 text-control-primary-text-default"
                : "text-text-muted hover:bg-interactive-background-hover hover:text-text-strong"
            }`}
          >
            {o.texto}
          </button>
        ))}
      </div>
    </div>
  );
}
