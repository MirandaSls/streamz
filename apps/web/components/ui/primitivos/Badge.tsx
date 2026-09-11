/**
 * Selos do Discord.
 *
 * Especificação medida (cartão 0.4-pequenos implementa):
 * - `numero` (menções/não lidas): fundo `--badge-notification-background`,
 *   texto `--badge-text-default`, 12px peso 700; altura 16 e largura mínima 16,
 *   padding 0×4, pílula; acima de `max` (99) mostra "99+". Com `recorte` ganha o
 *   anel na cor da superfície de baixo (Discord: 4px em `--background-base-low`
 *   sobre avatar, `.textBadge__0034b`; o app usa 3px na rail — medir no print).
 *   Fontes: `GuildRail.tsx` e `ChannelSidebar.tsx` já medidos, e o CSS
 *   `.numberBadge__463b7`.
 * - `texto` ("NOVO"): altura 20, raio 12, padding 0×6, 10px peso 700;
 *   tom `marca` = fundo limão com texto ESCURO (regra do accent).
 * - `ponto`: bolinha de 8 (não lida sem número) — conferir no print.
 */
export type TomDoBadge = "perigo" | "marca" | "neutro";

export type BadgeProps =
  | { tipo: "numero"; valor: number; max?: number; recorte?: boolean; className?: string }
  | { tipo: "texto"; texto: string; tom?: TomDoBadge; className?: string }
  | { tipo: "ponto"; tom?: TomDoBadge; className?: string };

// Implementação provisória (cartão 0.4-pequenos substitui pelo medido).
export function Badge(props: BadgeProps) {
  const className = props.className ?? "";
  if (props.tipo === "numero") {
    const max = props.max ?? 99;
    return (
      <span
        className={`inline-grid h-4 min-w-4 place-items-center rounded-full bg-badge-notification-background px-1 text-[12px] font-bold leading-none text-badge-text-default ${className}`}
      >
        {props.valor > max ? `${max}+` : props.valor}
      </span>
    );
  }
  if (props.tipo === "texto") {
    return (
      <span
        className={`inline-flex h-5 items-center rounded-xl px-1.5 text-[10px] font-bold uppercase ${
          props.tom === "marca"
            ? "bg-brand-500 text-control-primary-text-default"
            : props.tom === "neutro"
              ? "bg-background-mod-strong text-text-default"
              : "bg-badge-notification-background text-badge-text-default"
        } ${className}`}
      >
        {props.texto}
      </span>
    );
  }
  return <span className={`inline-block h-2 w-2 rounded-full bg-badge-notification-background ${className}`} />;
}
