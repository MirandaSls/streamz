"use client";

import { useEffect, useState } from "react";
import { Check, Pipette } from "@/components/ui/icones";

/**
 * Seletor de cor das configurações — paleta de amostras, hexadecimal digitável
 * e conta-gotas.
 *
 * O `<input type="color">` nativo foi abandonado por dois motivos: ele abre o
 * seletor do sistema operacional (branco, com a cara do Windows, no meio de
 * uma tela escura) e não oferece a paleta do produto, que é o que o usuário
 * escolhe em 9 de cada 10 vezes.
 *
 * O conta-gotas só aparece onde existe (`EyeDropper` é Chromium por enquanto):
 * um botão que não funciona é pior que a ausência dele.
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
}) {
  const [temContaGotas, setTemContaGotas] = useState(false);
  const [modo, setModo] = useState<"solida" | "gradiente">("solida");

  // feature detection no efeito: no servidor não existe `window`
  useEffect(() => {
    setTemContaGotas("EyeDropper" in window);
  }, []);

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

  return (
    <div>
      {abas && (
        <div role="tablist" aria-label={rotulo} className="mb-3 flex gap-1 border-b border-border">
          {(["solida", "gradiente"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={modo === m}
              onClick={() => setModo(m)}
              className={`-mb-px border-b-2 px-3 pb-2 text-sm font-medium transition ${
                modo === m
                  ? "border-accent text-txt-primary"
                  : "border-transparent text-txt-muted hover:text-txt-normal"
              }`}
            >
              {m === "solida" ? "Cor sólida" : "Gradiente"}
            </button>
          ))}
        </div>
      )}

      {modo === "gradiente" ? (
        <p className="rounded-[4px] border border-border bg-panel px-3 py-2 text-sm text-txt-muted">
          Cargo com gradiente precisa de duas cores, e o contrato guarda só uma
          (`Role.color`). Enquanto isso não muda, a cor sólida é a única possível.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-1.5">
          {permitirSemCor && (
            <button
              type="button"
              onClick={() => onChange("")}
              aria-label="Sem cor"
              aria-pressed={value === ""}
              className={`grid h-8 w-8 place-items-center rounded-[4px] bg-border-strong text-xs text-white transition ${
                value === "" ? "ring-2 ring-white" : "hover:opacity-80"
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
                className={`grid h-8 w-8 place-items-center rounded-[4px] transition ${
                  ativo ? "ring-2 ring-white" : "hover:opacity-80"
                }`}
              >
                {ativo && <Check size={14} className="text-white drop-shadow" aria-hidden="true" />}
              </button>
            );
          })}

          {temContaGotas && (
            <button
              type="button"
              onClick={() => void contaGotas()}
              aria-label="Escolher uma cor da tela"
              className="grid h-8 w-8 place-items-center rounded-[4px] border border-border-strong text-txt-normal transition hover:bg-hov"
            >
              <Pipette size={16} />
            </button>
          )}

          <input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="#rrggbb"
            aria-label={`${rotulo} em hexadecimal`}
            className="h-8 w-[104px] rounded-[3px] border border-border bg-input px-2 font-mono text-sm text-txt-normal outline-none transition-colors placeholder:text-txt-muted focus:border-accent"
          />
        </div>
      )}
    </div>
  );
}
