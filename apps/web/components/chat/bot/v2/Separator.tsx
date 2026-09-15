"use client";

import type { Separator as SeparatorPayload } from "@streamz/shared";
import { ESPACAMENTO_DO_SEPARATOR } from "@streamz/shared";
import { Divider } from "@/components/ui/primitivos";

/**
 * ── onda 3 (cartão 3e) ── `Separator` (`type: 14`): `divider` liga/desliga a
 * linha (padrão `true`) e `spacing` escolhe **1** pequeno ou **2** grande
 * (padrão 1). `desenvolvedores/imagens/componentes/v2-separator.webp` só
 * mostra uma linha entre dois blocos de texto, sem outro separador ao lado
 * para comparar os dois espaçamentos — não há como medir a diferença entre
 * "pequeno" e "grande" nessa imagem nem em nenhum print 1:1 do acervo.
 *
 * **Os dois números de altura são não medidos.** 8px (pequeno) e 16px
 * (grande) são o par mais comum de espaçamento do resto do app medido
 * (`gap-2`/`gap-4`, o mesmo `--space-8` que o cabeçalho de `ActionRow.tsx` já
 * cita como "espaçamento entre controles mais comum"), não um valor tirado
 * do Discord. Quem achar um print 1:1 com dois separators lado a lado troca
 * este par.
 *
 * `Divider` (primitivo, `tom="sutil"`) é a mesma linha 1px `--border-subtle`
 * que o resto do app usa — não uma classe nova.
 */
export default function SeparatorDeBot({ componente }: { componente: SeparatorPayload }) {
  const grande = componente.spacing === ESPACAMENTO_DO_SEPARATOR.LARGE;
  const altura = grande ? "h-4" : "h-2";
  const temLinha = componente.divider ?? true;

  if (!temLinha) return <div aria-hidden="true" className={altura} />;

  return (
    <div className={`flex items-center ${altura}`}>
      <Divider />
    </div>
  );
}
