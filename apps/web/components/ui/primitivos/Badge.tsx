/**
 * Selos do Discord.
 *
 * Medido (cartão 0.4-pequenos):
 * - `numero` (menções/não lidas): fundo `--badge-notification-background`,
 *   texto `--badge-text-default`, 12px peso 700, leading none; altura 16 e
 *   largura mínima 16 (`.base__463b7{height:16px;min-width:16px}` no CSS
 *   bruto), padding 0×4 (`--space-4`, `px-1`), pílula; acima de `max` (99)
 *   mostra "99+". Já era a medida de `GuildRail.tsx` (badge local do rail) e
 *   bate com o CSS — só ganhou o `recorte` como prop. Com `recorte`, anel de
 *   3px na cor da superfície de baixo (`--background-base-lowest`): é a
 *   medida que `GuildRail.tsx` já usa (`ring-[3px]`); o Discord usa 4px em
 *   `--background-base-low` só quando o badge fica **sobre avatar**
 *   (`.textBadge__0034b`), que não é o nosso caso aqui.
 * - `texto` ("NOVO"): a mesma família de classes do número
 *   (`.base__463b7`/`.textBadge__463b7`) dá altura **16** — não 20 como a
 *   versão anterior deste arquivo supunha — e raio `--radius-sm` (8px, ou
 *   seja `rounded-lg`; a 16px de altura, 8 de raio já fecha em pílula, então
 *   não faz diferença visual usar `rounded-full`, mas o valor certo é o do
 *   Discord). Padding 0×6 (`--space-6`, `px-1.5`), confirmado também no print
 *   de Amigos (101638): a pílula branca "NOVO" ao lado de "Loja" mede y=189–
 *   202 (14px de miolo + 1px de antialiasing de cada lado = 16). Fonte:
 *   cap-height ~7–8px nas letras maiúsculas do mesmo print ⇒ ~10px, peso 700
 *   uppercase (`.eyebrow__463b7` do mesmo arquivo CSS confirma 700). tom
 *   `marca` = fundo limão com texto ESCURO (regra do accent, ADR-0009 §3.5).
 * - `ponto`: bolinha de 8 (`--space-8`), sem número — Discord não documenta
 *   altura em CSS aqui; 8 é a leitura visual consistente com o resto da
 *   escala de espaçamento (`--space-8`), "não confirmada" em print própria.
 */
export type TomDoBadge = "perigo" | "marca" | "neutro";

export type BadgeProps =
  | { tipo: "numero"; valor: number; max?: number; recorte?: boolean; className?: string }
  | { tipo: "texto"; texto: string; tom?: TomDoBadge; className?: string }
  | { tipo: "ponto"; tom?: TomDoBadge; className?: string };

/** Fundo do tom — usado sozinho pelo `ponto` (sem texto) e com o texto pelo `texto`. */
function fundoDoTom(tom: TomDoBadge | undefined): string {
  if (tom === "marca") return "bg-brand-500";
  if (tom === "neutro") return "bg-background-mod-strong";
  return "bg-badge-notification-background";
}

/** Texto sobre o fundo do tom — escuro sobre o limão da marca (ADR-0009 §3.5). */
function textoDoTom(tom: TomDoBadge | undefined): string {
  if (tom === "marca") return "text-control-primary-text-default";
  if (tom === "neutro") return "text-text-default";
  return "text-badge-text-default";
}

export function Badge(props: BadgeProps) {
  const className = props.className ?? "";

  if (props.tipo === "numero") {
    const max = props.max ?? 99;
    return (
      <span
        className={`inline-grid h-4 min-w-4 place-items-center rounded-full bg-badge-notification-background px-1 text-[12px] font-bold leading-none text-badge-text-default ${
          props.recorte ? "ring-[3px] ring-background-base-lowest" : ""
        } ${className}`}
      >
        {props.valor > max ? `${max}+` : props.valor}
      </span>
    );
  }

  if (props.tipo === "texto") {
    return (
      <span
        className={`inline-flex h-4 items-center rounded-lg px-1.5 text-[10px] font-bold uppercase leading-none ${fundoDoTom(props.tom)} ${textoDoTom(props.tom)} ${className}`}
      >
        {props.texto}
      </span>
    );
  }

  return <span className={`inline-block h-2 w-2 rounded-full ${fundoDoTom(props.tom)} ${className}`} />;
}
