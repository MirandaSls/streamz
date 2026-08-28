import type { ReactNode } from "react";

/**
 * Ilustrações de estado vazio da página Amigos.
 *
 * São desenho **nosso**, derivado do símbolo da marca (o balão de fala de
 * `ui/Marca`): um círculo com um ícone lucide dentro não é estado vazio, é
 * placeholder — e copiar a arte de outro produto não é opção. Tudo em traço,
 * `currentColor` no contorno e limão só no detalhe, para a ilustração pesar
 * menos que o texto que ela acompanha.
 */

export type ArteVazio = "amigos" | "online" | "pendentes" | "bloqueados" | "busca";

/** Contorno do balão — mesma geometria do símbolo, aberto para receber o miolo. */
const BALAO =
  "M44 20 H180 A20 20 0 0 1 200 40 V104 A20 20 0 0 1 180 124 H104 L68 152 V124 H44 A20 20 0 0 1 24 104 V40 A20 20 0 0 1 44 20 Z";

export function Ilustracao({
  arte,
  className = "",
}: {
  arte: ArteVazio;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 240 160"
      aria-hidden="true"
      className={`text-txt-faint ${className}`}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* balão de trás: só existe quando a cena fala de duas pessoas */}
      {arte === "amigos" && (
        <path
          d={BALAO}
          transform="translate(58 -6) scale(0.62)"
          stroke="currentColor"
          strokeOpacity="0.3"
          strokeWidth="9"
        />
      )}

      <path d={BALAO} stroke="currentColor" strokeOpacity="0.65" strokeWidth="6" />

      {arte === "amigos" && (
        <g className="text-accent" stroke="currentColor" strokeWidth="7">
          <path d="M96 72 H136" />
          <path d="M116 52 V92" />
        </g>
      )}

      {arte === "online" && (
        <>
          <circle cx="76" cy="72" r="11" className="text-accent" fill="currentColor" />
          <g stroke="currentColor" strokeOpacity="0.45" strokeWidth="7">
            <path d="M104 62 H176" />
            <path d="M104 84 H148" />
          </g>
        </>
      )}

      {arte === "pendentes" && (
        <g fill="currentColor">
          <circle cx="82" cy="72" r="9" className="text-accent" />
          <circle cx="112" cy="72" r="9" fillOpacity="0.45" />
          <circle cx="142" cy="72" r="9" fillOpacity="0.25" />
        </g>
      )}

      {arte === "bloqueados" && (
        <>
          <circle cx="112" cy="72" r="34" stroke="currentColor" strokeOpacity="0.5" strokeWidth="7" />
          <path d="M88 96 L136 48" stroke="currentColor" strokeOpacity="0.5" strokeWidth="7" />
        </>
      )}

      {arte === "busca" && (
        <g className="text-accent" stroke="currentColor" strokeWidth="7">
          <circle cx="112" cy="66" r="26" />
          <path d="M131 85 L152 106" />
        </g>
      )}
    </svg>
  );
}

/** Ilustração + título + explicação: o estado vazio inteiro de uma aba. */
export default function EstadoVazio({
  arte,
  titulo,
  texto,
  children,
}: {
  arte: ArteVazio;
  titulo: string;
  texto: string;
  /** ação opcional abaixo do texto (um botão, um link). */
  children?: ReactNode;
}) {
  return (
    <div className="mt-10 grid place-items-center px-8 text-center">
      <Ilustracao arte={arte} className="w-[220px] max-w-full" />
      <h3 className="mt-6 font-display text-lg font-semibold text-txt-primary">{titulo}</h3>
      <p className="mt-1 max-w-md text-sm text-txt-muted">{texto}</p>
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}
