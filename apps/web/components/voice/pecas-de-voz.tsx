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

/**
 * Medidor de segmentos do popover de supressão de ruído (o do Discord): barrinhas
 * finas que acendem da esquerda para a direita conforme o nível. Existe à parte
 * da `BarraDeNivel` porque a aba "Voz e vídeo" usa a barra contínua com limiar.
 *
 * Cor por posição, não por nível: as primeiras amarelas, o meio verde-oliva, o
 * fim verde. O oliva não tem token de status; é o ponto médio entre
 * `status-warning` e `status-positive`, daí o literal.
 * Sem transição: o nível chega ~30x/s e qualquer easing deixaria o medidor
 * atrás da voz (e já respeita prefers-reduced-motion por isso).
 */
export function MedidorSegmentado({
  nivel,
  segmentos = 24,
  preencher = false,
}: {
  nivel: number;
  segmentos?: number;
  /** barrinhas dividem a largura do pai (flex-1) em vez de ter 4px fixos: o menu do microfone tem 40. */
  preencher?: boolean;
}) {
  const n = Math.max(1, segmentos);
  const valor = Math.min(1, Math.max(0, nivel));
  const acesos = Math.round(valor * n);
  return (
    <div
      role="meter"
      aria-label="Nível do microfone"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(valor * 100)}
      className={`flex h-4 items-center ${preencher ? "w-full gap-[4px]" : "gap-[3px]"}`}
    >
      {Array.from({ length: n }, (_, i) => {
        const pos = i / n;
        const cor =
          pos < 0.33 ? "bg-status-warning" : pos < 0.66 ? "bg-[#8fa63a]" : "bg-status-positive";
        return (
          <span
            key={i}
            aria-hidden="true"
            className={`h-4 rounded-full ${preencher ? "min-w-0 flex-1" : "w-1 shrink-0"} ${i < acesos ? cor : "bg-slider-track-background"}`}
          />
        );
      })}
    </div>
  );
}

/** Interruptor do Discord: pílula que desliza, não caixa de seleção. */
export function Chave({
  rotulo,
  ligado,
  onChange,
  titulo = false,
}: {
  rotulo: string;
  ligado: boolean;
  onChange: (v: boolean) => void;
  /** rótulo no tamanho de título (16px), como no cabeçalho do popover de ruído. */
  titulo?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={`font-semibold text-text-strong ${titulo ? "text-base" : "text-sm"}`}>
        {rotulo}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={ligado}
        aria-label={rotulo}
        onClick={() => onChange(!ligado)}
        className={`relative h-6 w-10 shrink-0 rounded-full transition motion-reduce:transition-none before:absolute before:-inset-x-1 before:-inset-y-2.5 before:content-[''] ${
          ligado ? "bg-brand-500" : "bg-border-normal"
        }`}
      >
        <span
          className={`absolute top-1 h-4 w-4 rounded-full bg-switch-thumb-background-default transition-all motion-reduce:transition-none ${
            ligado ? "left-5" : "left-1"
          }`}
        />
      </button>
    </div>
  );
}

/**
 * Slider de volume 0–200%. O rótulo usa o texto normal do menu (`text-sm
 * font-semibold text-text-strong`), como "Dispositivo de entrada" no menu de
 * áudio.
 *
 * O trilho é desenhado à mão (`appearance-none`) porque o do navegador não
 * preenche até a bolinha nem aceita o cinza escuro sem borda do Discord: o
 * preenchimento é um gradiente no próprio input, calculado pelo valor.
 * `mostrarValor={false}` esconde o "100%": o menu de áudio do Discord só mostra
 * o rótulo; os outros usos (aba de voz) continuam com o número.
 */
export function SliderDeVolume({
  label,
  valor,
  onChange,
  mostrarValor = true,
}: {
  label: string;
  valor: number;
  onChange: (v: number) => void;
  mostrarValor?: boolean;
}) {
  const pct = Math.round(valor * 100);
  return (
    <label className="block">
      <span className="mb-2 flex items-center justify-between text-sm font-semibold text-text-strong">
        {label}
        {mostrarValor && <span className="tabular-nums">{pct}%</span>}
      </span>
      <input
        type="range"
        min={0}
        max={200}
        value={pct}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        aria-label={label}
        style={{
          backgroundImage: `linear-gradient(to right, var(--brand-500) ${pct / 2}%, transparent ${pct / 2}%)`,
        }}
        className="block h-1 w-full cursor-pointer appearance-none rounded-full bg-slider-track-background bg-no-repeat focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-border-focus [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-white [&::-moz-range-track]:bg-transparent [&::-webkit-slider-runnable-track]:bg-transparent [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-[0_1px_3px_rgba(0,0,0,0.4)]"
      />
    </label>
  );
}
