"use client";

/** Em que ponto uma opção de comando está. */
export type EstadoDoChip = "vazio" | "preenchido" | "ativo" | "erro";

/**
 * Chip de opção de comando de barra.
 *
 * `.option_a19535` (`css-bruto/862735.30278509527ce174.css`):
 * `border-radius:4px; padding:0 4px; font-weight:normal`, fundo
 * `var(--primary-800)` no escuro. `--primary-800` resolve `#121214`, o mesmo
 * valor de `--background-base-lowest`; o `tokens.css` do app não exporta a
 * paleta `primary-*`, então a classe é a do token semântico de mesmo valor.
 *
 * Estados, do mesmo módulo:
 * - `.set_a19535{opacity:.5}` — opção já preenchida;
 * - `.active_a19535{background-color:var(--brand-500);color:var(--white)}` — a
 *   que se está preenchendo; pelo ADR-0009 o brand vira limão e o texto sobre
 *   ele é o escuro (`control-primary-text-default`), nunca branco;
 * - `.error_a19535{color:var(--text-feedback-critical)}` — obrigatória em
 *   branco no Enter;
 * - `.clickable_a19535{cursor:pointer}`.
 */
export default function ChipDeOpcao({
  nome,
  estado = "vazio",
  onClick,
  className = "",
}: {
  nome: string;
  estado?: EstadoDoChip;
  /** presente = o chip acrescenta a opção ao campo. */
  onClick?: () => void;
  className?: string;
}) {
  const cor =
    estado === "ativo"
      ? "bg-brand-500 text-control-primary-text-default"
      : estado === "erro"
        ? "bg-background-base-lowest text-text-feedback-critical"
        : `bg-background-base-lowest text-text-default ${estado === "preenchido" ? "opacity-50" : ""}`;
  const classes = `block shrink-0 whitespace-nowrap rounded px-1 font-normal ${cor} ${className}`;

  if (!onClick) return <span className={classes}>{nome}</span>;
  return (
    <button
      type="button"
      // mousedown, não click: o clique tiraria o foco do campo antes da opção
      // entrar, e a barra que contém o chip fecharia no meio
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
      aria-label={`Acrescentar a opção ${nome}`}
      className={`${classes} cursor-pointer`}
    >
      {nome}
    </button>
  );
}
