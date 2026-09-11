"use client";

/**
 * Peças de voz usadas em mais de um lugar: o anel de fala, a barra de nível, o
 * interruptor e o slider de volume.
 *
 * Elas moravam dentro do `VoiceSettingsPanel`, que era o único dono. Deixaram
 * de ser: o popover de supressão de ruído do painel "Voz conectada" tem o mesmo
 * teste de microfone, e duplicar a captura seria duplicar também o pedido de
 * permissão e o `AudioContext`.
 *
 * A captura em si saiu daqui: quem abre o microfone do teste é o hook
 * `useTesteDeMicrofone`, porque o teste passou a ser mais do que um medidor
 * (muta, ensurdece e devolve o próprio som). O que ficou é só desenho.
 */

/**
 * O anel verde de quem está falando — **uma** definição de cor e espessura,
 * para o palco e as listas não divergirem.
 *
 * Ele é um irmão posicionado por cima do avatar, e não um `ring` na caixa do
 * próprio avatar. A diferença não é estilística: sombra `inset` é pintada
 * acima do fundo e **abaixo do conteúdo**, então a `<img>` do avatar (ou o
 * círculo das iniciais, que também preenche a caixa inteira) cobria o anel por
 * completo. Era esse o defeito da lista lateral: a regra estava lá, e o anel
 * simplesmente não aparecia nunca.
 *
 * Desenhado **por dentro** do diâmetro, com o avatar encolhido por
 * `ENCOLHE_AO_FALAR`: por fora, o avatar cresce ao falar e a fileira inteira
 * pula a cada sílaba.
 *
 * Quem usa precisa de um pai `relative` (ou `inline-grid` posicionado).
 */
export function AnelDeFala() {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 rounded-full ring-2 ring-inset ring-status-positive"
    />
  );
}

/** Classe do avatar enquanto o anel está aceso: ele cede a folga para o anel. */
export const ENCOLHE_AO_FALAR = "scale-[0.925]";

/** Barra de nível; com `limiar`, marca onde a voz passa a contar. */
export function BarraDeNivel({ nivel, limiar }: { nivel: number; limiar?: number }) {
  const acima = limiar === undefined || nivel >= limiar;
  return (
    <div className="relative h-2 w-full overflow-hidden rounded-full bg-input-background-default">
      <div
        className={`h-full rounded-full transition-[width] duration-75 ${acima ? "bg-brand-500" : "bg-channels-default"}`}
        style={{ width: `${Math.round(nivel * 100)}%` }}
      />
      {limiar !== undefined && (
        <span
          aria-hidden="true"
          style={{ left: `${Math.round(limiar * 100)}%` }}
          className="absolute inset-y-0 w-0.5 bg-text-strong"
        />
      )}
    </div>
  );
}

/** Interruptor do Discord: pílula que desliza, não caixa de seleção. */
export function Chave({
  rotulo,
  ligado,
  onChange,
}: {
  rotulo: string;
  ligado: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span>{rotulo}</span>
      <button
        type="button"
        role="switch"
        aria-checked={ligado}
        aria-label={rotulo}
        onClick={() => onChange(!ligado)}
        className={`relative h-6 w-10 shrink-0 rounded-full transition ${
          ligado ? "bg-brand-500" : "bg-border-normal"
        }`}
      >
        <span
          className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-all ${
            ligado ? "left-5" : "left-1"
          }`}
        />
      </button>
    </div>
  );
}

/** Slider de volume 0–200% com o valor ao lado. */
export function SliderDeVolume({
  label,
  valor,
  onChange,
}: {
  label: string;
  valor: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center justify-between text-xs font-semibold uppercase tracking-[0.02em] text-text-muted">
        {label}
        <span className="tabular-nums normal-case tracking-normal">{Math.round(valor * 100)}%</span>
      </span>
      <input
        type="range"
        min={0}
        max={200}
        value={Math.round(valor * 100)}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        aria-label={label}
        className="w-full accent-brand-500"
      />
    </label>
  );
}
