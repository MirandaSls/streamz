"use client";

import { useRef, type KeyboardEvent } from "react";
import { Check, Slash, X } from "@/components/ui/icones";
import { Tooltip } from "@/components/ui/primitivos";
import type { EstadoDaRegra } from "@streamz/shared";

/**
 * O tri-estado de uma permissão: negar `✗`, herdar `╱`, permitir `✓`.
 *
 * Não é um interruptor de dois estados por um motivo que não é estético: numa
 * regra de canal "desligado" e "não decide nada" são coisas diferentes. O
 * ligado/desligado do cargo diz o que a pessoa recebe; aqui a coluna do meio é
 * o **silêncio** — a regra não fala daquele bit, e vale o que vier do cargo ou
 * da categoria. Um interruptor obrigaria toda regra a opinar sobre as vinte e
 * uma permissões, e negar por omissão é exatamente o bug que tranca gente para
 * fora do canal sem ninguém ter pedido.
 *
 * Medidas do print `docs/Reference/Captura de tela 2026-09-04 102249.png`:
 * grupo de 96×28 com cantos externos de ~4px, três botões de 32×28 colados
 * (sem vão entre eles), glifo de 18. As medidas vão em **pixel** (`w-[96px]`,
 * não `w-24`): a raiz do app é 16px (ADR-0009), então a escala em `rem` do
 * Tailwind já bate com o pixel, mas o desenho aqui é medido, não proporcional
 * (conferido no Chromium com o CSS compilado), e por isso ficou em pixel
 * literal mesmo assim. O botão ativo é uma superfície um passo
 * mais clara que o fundo, e o grupo em si **não tem fundo**: no print o vão dos
 * dois botões inativos é exatamente a cor da página (medido: `#202024` nos dois),
 * e só o ativo se destaca (`#38383D`). O ativo usa `bg-interactive-background-selected`, que é o token de
 * "item ativo" do `tailwind.config.ts` — nenhuma cor nova entrou por esta tela.
 * (A borda de 1px que o print insinua no contorno do grupo é antialiasing de
 * +3 de luminância; qualquer token de borda nosso seria mais forte que ela, e
 * desenhá-la deixaria a marca mais pesada que no Discord.)
 *
 * Os inativos ficam em `txt-muted`, e é aqui que a tela se afasta um pouco do
 * print: no Discord o `✗` continua avermelhado e o `✓` esverdeado mesmo
 * apagados. Cor só no ativo deixa o estado atual legível de relance numa lista
 * de vinte linhas — que é como esta tela é lida — em vez de três marcas
 * coloridas competindo em cada linha. O hover devolve a cor do estado, então a
 * dica de "o que este botão faz" não se perde.
 */

const ORDEM: { estado: EstadoDaRegra; rotulo: string }[] = [
  { estado: "negar", rotulo: "Negar" },
  { estado: "herdar", rotulo: "Herdar" },
  { estado: "permitir", rotulo: "Permitir" },
];

/** Cor do glifo quando o estado é o vigente. */
const COR_ATIVA: Record<EstadoDaRegra, string> = {
  negar: "text-status-danger",
  herdar: "text-text-strong",
  permitir: "text-status-positive",
};

/** E a que o hover antecipa, para o botão dizer o que vai virar. */
const COR_HOVER: Record<EstadoDaRegra, string> = {
  negar: "text-text-muted hover:text-status-danger",
  herdar: "text-text-muted hover:text-text-default",
  permitir: "text-text-muted hover:text-status-positive",
};

function Glifo({ estado }: { estado: EstadoDaRegra }) {
  if (estado === "negar") return <X size={18} aria-hidden="true" />;
  if (estado === "permitir") return <Check size={18} aria-hidden="true" />;
  return <Slash size={18} aria-hidden="true" />;
}

export default function TriEstado({
  rotulo,
  valor,
  onChange,
  disabled = false,
  motivoDesabilitado,
}: {
  /** nome da permissão — é o rótulo acessível do grupo. */
  rotulo: string;
  valor: EstadoDaRegra;
  onChange: (estado: EstadoDaRegra) => void;
  disabled?: boolean;
  /** explicação no tooltip quando o controle está travado. */
  motivoDesabilitado?: string;
}) {
  const grupoRef = useRef<HTMLDivElement>(null);

  /**
   * Setas andam pelo grupo, como manda o padrão de `radiogroup`. Sem isto o
   * único jeito de mudar o estado pelo teclado seria dar Tab três vezes — e o
   * `tabIndex` móvel abaixo já tira os dois inativos da ordem de tabulação,
   * então sem as setas eles ficariam inalcançáveis.
   */
  function aoTeclar(e: KeyboardEvent<HTMLDivElement>) {
    const adiante = e.key === "ArrowRight" || e.key === "ArrowDown";
    const atras = e.key === "ArrowLeft" || e.key === "ArrowUp";
    if (disabled || (!adiante && !atras)) return;
    const passo = adiante ? 1 : -1;
    e.preventDefault();
    const atual = ORDEM.findIndex((o) => o.estado === valor);
    const proximo = (atual + passo + ORDEM.length) % ORDEM.length;
    onChange(ORDEM[proximo].estado);
    grupoRef.current?.querySelectorAll("button")[proximo]?.focus();
  }

  const grupo = (
    <div
      ref={grupoRef}
      role="radiogroup"
      aria-label={rotulo}
      onKeyDown={aoTeclar}
      className={`inline-flex h-[28px] w-[96px] shrink-0 overflow-hidden rounded-[4px] celular:h-[44px] celular:w-[132px] ${
        disabled ? "opacity-50" : ""
      }`}
    >
      {ORDEM.map(({ estado, rotulo: nome }) => {
        const ativo = estado === valor;
        return (
          <button
            key={estado}
            type="button"
            role="radio"
            aria-checked={ativo}
            aria-label={nome}
            disabled={disabled}
            // `tabIndex` móvel: o grupo inteiro é uma parada de Tab só, e as
            // setas andam dentro dele
            tabIndex={ativo ? 0 : -1}
            onClick={() => onChange(estado)}
            className={`grid h-[28px] w-[32px] place-items-center transition disabled:cursor-not-allowed celular:h-[44px] celular:w-[44px] ${
              ativo ? `bg-interactive-background-selected ${COR_ATIVA[estado]}` : COR_HOVER[estado]
            }`}
          >
            <Glifo estado={estado} />
          </button>
        );
      })}
    </div>
  );

  // o tooltip só entra quando há o que explicar: envolver sempre acrescentaria
  // um `<span>` e um listener de ponteiro em cada uma das ~20 linhas da lista
  return disabled && motivoDesabilitado ? (
    <Tooltip rotulo={motivoDesabilitado} lado="left">
      {grupo}
    </Tooltip>
  ) : (
    grupo
  );
}
