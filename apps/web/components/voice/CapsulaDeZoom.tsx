"use client";

import { Minus, Plus } from "@/components/ui/icones";
import { BotaoDeIcone, Tooltip } from "@/components/ui/primitivos";

/**
 * O controle de zoom sobre uma transmissão de tela.
 *
 * O Discord não tem isto no desktop — lá o zoom de transmissão só existe por
 * pinça, no celular (`TelaCheiaDeVideo`/`zoom-de-video.ts`). Aqui a roda do
 * mouse amplia e o arrasto move a imagem ampliada; esta cápsula é o controle
 * visível dos dois gestos, no mesmo vocabulário dos outros controles flutuando
 * sobre vídeo (`control-overlay-secondary-*`, ver `TelaCheiaDeVideo` e
 * `TileDeVoz`) — sem medida do Discord para copiar, porque ele não tem a peça.
 */
export default function CapsulaDeZoom({
  percentual,
  podeAmpliar,
  podeReduzir,
  onAmpliar,
  onReduzir,
  onRedefinir,
  visivel,
  className = "",
}: {
  percentual: number;
  podeAmpliar: boolean;
  podeReduzir: boolean;
  onAmpliar: () => void;
  onReduzir: () => void;
  /** Clique no percentual: volta a 100%. */
  onRedefinir: () => void;
  visivel: boolean;
  /** Posicionamento vem de quem usa. */
  className?: string;
}) {
  // Os três botões seguram o clique, o duplo clique e o pointerdown para que
  // não cheguem ao tile por trás: ele usa clique para focar, duplo clique
  // para tela cheia e pointerdown para arrastar a imagem ampliada — sem isto,
  // tocar num botão da cápsula também moveria ou focaria o vídeo por baixo.
  const segurar = (e: React.SyntheticEvent) => e.stopPropagation();

  return (
    <div
      role="group"
      aria-label="Zoom da transmissão"
      onDoubleClick={segurar}
      onPointerDown={segurar}
      className={`flex items-center gap-1 rounded-full bg-control-overlay-secondary-background-default p-1 shadow-popout backdrop-blur transition-opacity duration-200 ${
        visivel ? "opacity-100" : "pointer-events-none opacity-0"
      } ${className}`}
    >
      <BotaoDeIcone
        rotulo="Diminuir zoom"
        icone={<Minus size={16} />}
        tamanho="sm"
        fundo="hover"
        desabilitado={!podeReduzir}
        onClick={(e) => {
          e.stopPropagation();
          onReduzir();
        }}
      />

      <Tooltip rotulo="Redefinir zoom">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRedefinir();
          }}
          aria-label="Redefinir zoom"
          disabled={percentual === 100}
          // largura fixa: o número não pode empurrar os botões dos lados ao
          // trocar de dígito (100% → 125%)
          className="grid h-6 w-12 shrink-0 place-items-center rounded-full text-text-xs font-semibold tabular-nums text-control-overlay-secondary-text-default transition-colors hover:enabled:bg-control-overlay-secondary-background-hover disabled:cursor-default"
        >
          {percentual}%
        </button>
      </Tooltip>

      <BotaoDeIcone
        rotulo="Aumentar zoom"
        icone={<Plus size={16} />}
        tamanho="sm"
        fundo="hover"
        desabilitado={!podeAmpliar}
        onClick={(e) => {
          e.stopPropagation();
          onAmpliar();
        }}
      />
    </div>
  );
}
