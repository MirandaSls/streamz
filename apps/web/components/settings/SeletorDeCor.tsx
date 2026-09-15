"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Pipette } from "@/components/ui/icones";
import { Popout, TextInput } from "@/components/ui/primitivos";

/**
 * Seletor de cor das configurações — cartão 6e-perfil (redesenho de paridade).
 *
 * ## Por que virou popout
 *
 * O cartão pede "seletor de cor em popout" para a aba Perfil, e o mesmo
 * componente é usado por `CargosTab` (cor de cargo) — não dá para mudar a API
 * (fora da lista deste cartão), só a apresentação. Isso bate com o próprio
 * Discord: `customColorPicker__459fb` (CSS sob-demanda) é o picker que os dois
 * lugares abrem, com as abas "Cor sólida"/"Gradiente" que `abas` já modela (o
 * gradiente é cargo com duas cores, que o contrato não guarda — mensagem
 * mantida).
 *
 * ## Medidas (origem: `docs/referencias-discord/tokens/css-bruto/
 * sob-demanda/3ee5233a8da681c2.css`, classes `.customColorPicker__459fb` e
 * vizinhas — não há print 1:1 desta caixa específica, então é CSS medido,
 * autoridade 2 da ADR-0009 §7)
 *
 * - Caixa: 220px de largura, padding 16, radius 4 (`rounded`, não
 *   `rounded-lg`: `.customColorPicker__459fb{border-radius:4px}`), fundo
 *   `--background-base-low`, borda 1px `--border-subtle`, sombra
 *   `var(--shadow-border),var(--shadow-high)` — a mesma combinação que
 *   `shadow-popout` já nomeia no primitivo `Popout`, só que sobre um fundo
 *   diferente do padrão dele (`--background-surface-high`); por isso o
 *   `Popout` entra com `superficie="nenhuma"` (mantém a animação de entrada,
 *   descarta só a caixa) e este arquivo desenha o fundo medido por cima.
 * - Linha do conta-gotas + hexadecimal: `gap-3` (12,
 *   `.customColorPickerInputContainer__459fb{gap:12px}`), conta-gotas 16×16
 *   (`.customColorPickerEyeDropper__459fb`), campo com 24 de altura
 *   (`.customColorPickerInput__459fb .input__459fb{height:24px}`) e
 *   maiúsculas (`text-transform:uppercase`).
 * - Amostra: 20×20, `rounded-lg` (radius 8,
 *   `.colorPickerSwatch__459fb{border-radius:8px}`), respiro entre amostras
 *   10px (`margin-inline-end:10px` → `gap-[10px]` num `flex-wrap`, porque o
 *   número de colunas por linha do Discord não está confirmado: o mesmo
 *   arquivo tem `.colorPickerRow__459fb{height:20px;overflow:hidden}`, que
 *   pode ser este grid ou uma faixa de outra tela — ver "não confirmado" no
 *   cabeçalho do cartão. Cortar cor por `overflow:hidden` esconderia opções,
 *   então aqui a grade quebra linha em vez de cortar).
 *
 * No celular as amostras crescem para 44px (`celular:h-11 celular:w-11`, o
 * alvo de toque do resto do app) — não é medida do Discord, é a mesma regra
 * de toque que já valia nas amostras de 32px de antes deste cartão.
 */

interface EyeDropperCtor {
  new (): { open: () => Promise<{ sRGBHex: string }> };
}

/** `#rrggbb` — o mesmo formato que o contrato aceita para cor de cargo. */
export function ehHex(valor: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(valor);
}

export default function SeletorDeCor({
  value,
  onChange,
  cores,
  rotulo,
  permitirSemCor = false,
  abas = false,
  disabled = false,
}: {
  /** hexadecimal atual, ou `""` para "sem cor". */
  value: string;
  onChange: (cor: string) => void;
  cores: readonly string[];
  rotulo: string;
  /** oferece a amostra "—", que devolve `""`. */
  permitirSemCor?: boolean;
  /** mostra as abas "Cor sólida / Gradiente" (cargos). */
  abas?: boolean;
  /**
   * Estado "carregando"/"sem permissão de mexer agora" de quem chama (ex.: a
   * aba Perfil enquanto a primeira busca do perfil não termina) — o gatilho
   * fecha, esmaece e para de abrir o popout, como `disabled` em qualquer
   * outro controle do formulário.
   */
  disabled?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [temContaGotas, setTemContaGotas] = useState(false);
  const [modo, setModo] = useState<"solida" | "gradiente">("solida");
  const gatilhoRef = useRef<HTMLButtonElement>(null);

  // feature detection no efeito: no servidor não existe `window`
  useEffect(() => {
    setTemContaGotas("EyeDropper" in window);
  }, []);

  // `disabled` pode chegar `true` com o popout já aberto (a busca do perfil
  // falha depois de aberto, por exemplo) — fechar evita um popout mexível
  // pairando sobre um formulário que virou somente leitura.
  useEffect(() => {
    if (disabled) setAberto(false);
  }, [disabled]);

  async function contaGotas() {
    const Ctor = (window as unknown as { EyeDropper?: EyeDropperCtor }).EyeDropper;
    if (!Ctor) return;
    try {
      const { sRGBHex } = await new Ctor().open();
      if (ehHex(sRGBHex)) onChange(sRGBHex.toLowerCase());
    } catch {
      // o usuário apertou Esc: cancelar não é erro
    }
  }

  const invalida = value !== "" && !ehHex(value);

  return (
    <>
      {/* gatilho: o mesmo campo do `Select` fechado (`rounded-lg
          border-input-border-default bg-input-background-default h-[40px]`,
          `ui/primitivos/Select.tsx`) — este seletor É um campo de escolha, só
          que a lista é uma grade de cores em vez de texto. A amostra à
          esquerda e a leitura hex não são medidas (não há print 1:1 nem CSS
          do estado FECHADO desta caixa no Discord — só do popout aberto, ver
          cabeçalho); o resto da caixa é o campo padrão do app. */}
      <button
        ref={gatilhoRef}
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={aberto}
        aria-label={`${rotulo}: ${value || "sem cor"}, escolher outra`}
        onClick={() => setAberto((v) => !v)}
        className="flex h-[40px] items-center gap-2 rounded-lg border border-input-border-default bg-input-background-default py-2 pl-2 pr-3 text-text-sm text-text-default outline-none transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus disabled:cursor-not-allowed disabled:opacity-50 celular:h-11"
      >
        <span
          aria-hidden="true"
          style={value ? { backgroundColor: value } : undefined}
          className={`grid h-6 w-6 shrink-0 place-items-center rounded ${
            value ? "" : "bg-border-normal text-xs text-text-overlay-light"
          }`}
        >
          {!value && "—"}
        </span>
        <span className="font-mono uppercase text-text-muted">{value || "Sem cor"}</span>
        <ChevronDown
          size={16}
          className={`shrink-0 text-icon-muted transition-transform duration-150 ${aberto ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>

      <Popout
        aberto={aberto}
        aoFechar={() => setAberto(false)}
        ancora={gatilhoRef}
        rotulo={rotulo}
        largura={220}
        superficie="nenhuma"
      >
        {/* a caixa medida (ver cabeçalho): fundo/borda/raio/sombra que o
            `Popout` não desenha em `superficie="nenhuma"` */}
        <div className="flex flex-col gap-4 rounded border border-border-subtle bg-background-base-low p-4 shadow-popout">
          {abas && (
            <div role="tablist" aria-label={rotulo} className="-mt-1 flex gap-1 border-b border-border-subtle">
              {(["solida", "gradiente"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={modo === m}
                  onClick={() => setModo(m)}
                  className={`-mb-px border-b-2 px-2 pb-2 text-sm font-medium outline-none transition celular:min-h-[44px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus ${
                    modo === m
                      ? "border-brand-500 text-text-strong"
                      : "border-transparent text-text-muted hover:text-text-default"
                  }`}
                >
                  {m === "solida" ? "Cor sólida" : "Gradiente"}
                </button>
              ))}
            </div>
          )}

          {modo === "gradiente" ? (
            <p className="text-sm text-text-muted">
              Cargo com gradiente precisa de duas cores, e o contrato guarda só
              uma (`Role.color`). Enquanto isso não muda, a cor sólida é a
              única possível.
            </p>
          ) : (
            <>
              {/* linha do conta-gotas + hexadecimal — ordem e gap medidos
                  (ver cabeçalho); o dado-de-dentro-pra-fora (amostras acima do
                  hex) é o padrão mais comum de seletor de cor e não tem CSS
                  que confirme a ordem exata — ver "não confirmado" */}
              <div className="flex items-center gap-3">
                {temContaGotas && (
                  <button
                    type="button"
                    onClick={() => void contaGotas()}
                    aria-label="Escolher uma cor da tela"
                    className="grid h-4 w-4 shrink-0 place-items-center text-icon-muted outline-none transition-colors hover:text-icon-subtle focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus celular:h-6 celular:w-6"
                  >
                    <Pipette size={16} aria-hidden="true" />
                  </button>
                )}
                <TextInput
                  value={value}
                  onChange={(e) => onChange(e.target.value)}
                  placeholder="#RRGGBB"
                  aria-label={`${rotulo} em hexadecimal`}
                  tamanho={24}
                  erro={invalida}
                  data-autofocus
                  className="font-mono uppercase celular:text-[max(16px,1em)]"
                />
              </div>

              <div className="flex flex-wrap gap-[10px]">
                {permitirSemCor && (
                  <button
                    type="button"
                    onClick={() => onChange("")}
                    aria-label="Sem cor"
                    aria-pressed={value === ""}
                    className={`grid h-5 w-5 place-items-center rounded-lg bg-border-normal text-[10px] text-text-overlay-light outline-none transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus celular:h-11 celular:w-11 ${
                      value === "" ? "ring-2 ring-brand-500 ring-offset-2 ring-offset-background-base-low" : "hover:opacity-80"
                    }`}
                  >
                    —
                  </button>
                )}

                {cores.map((c) => {
                  const ativo = value.toLowerCase() === c.toLowerCase();
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => onChange(c)}
                      aria-label={`Cor ${c}`}
                      aria-pressed={ativo}
                      style={{ backgroundColor: c }}
                      className={`grid h-5 w-5 place-items-center rounded-lg outline-none transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus celular:h-11 celular:w-11 ${
                        ativo
                          ? "ring-2 ring-brand-500 ring-offset-2 ring-offset-background-base-low"
                          : "hover:opacity-80"
                      }`}
                    >
                      {ativo && <Check size={12} className="text-icon-overlay-light drop-shadow" aria-hidden="true" />}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </Popout>
    </>
  );
}
