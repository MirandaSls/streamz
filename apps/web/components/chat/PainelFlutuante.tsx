"use client";

import type { ReactNode } from "react";
import { Popout } from "@/components/ui/primitivos";
import type { Anchor } from "@/stores/ui";

/**
 * Painel dos seletores abertos a partir de uma mensagem (reação, emoji da
 * edição, reação de mídia e de mensagem de sistema), ancorado ao retângulo do
 * botão que o abriu.
 *
 * Existe porque um picker preso com `absolute` dentro da mensagem é cortado
 * pela rolagem da timeline: nas últimas mensagens ele abria para baixo e ficava
 * pela metade. Hoje é um invólucro do `Popout` único (plano, onda 0.4): portal,
 * conta de colisão, Esc, clique fora, foco preso e devolvido, folha no celular
 * e animação de entrada vêm de lá. Aqui fica só o que é deste painel:
 *
 * - **Posição de antes.** Abaixo do botão, com a borda **direita** da caixa na
 *   borda direita dele (`alinhamento="end"`), a 8px do botão e a 8px da borda da
 *   janela — os mesmos 8 e 8 do `GAP`/`EDGE` que moravam aqui, que também são os
 *   padrões do `Popout` e também não foram medidos. O `Popout` vira para cima
 *   quando não cabe embaixo, como antes; o que ele faz a mais é espelhar para
 *   `start` antes de deslizar e tentar os lados perpendiculares quando nem em
 *   cima nem embaixo cabe.
 * - **Fecha ao rolar e ao redimensionar** (`fecharAoRolar`): a âncora é um
 *   retângulo lido no clique, e rolar deixaria a caixa parada longe do botão.
 *   A diferença é que a lista **de dentro** rolando não fecha mais — antes o
 *   `scroll` em captura no `window` pegava também a rolagem da grade de emojis.
 * - **Esc e clique fora** já aconteciam antes, mas pelo filho: os quatro
 *   consumidores passam o `EmojiPicker` solto, cuja `CaixaPicker` escuta os dois
 *   (`useFecharFora`). Os do `Popout` chegam ao mesmo resultado; a diferença é
 *   que o Esc agora para no painel (o do `Popout` corta a propagação na
 *   captura), em vez de cancelar junto a resposta da `ReplyBar` ou chegar ao Esc
 *   do `ImageModal` — que já desistia de fechar o modal com o picker aberto.
 *   O botão que abriu continua reabrindo o painel no clique, como antes: o
 *   `mousedown` fecha e o `click` do consumidor abre de novo.
 *
 * ## Uma superfície só
 *
 * O filho é quem desenha a caixa (a `CaixaPicker`: 424×420, raio 8, fundo
 * `--background-base-lowest`, `shadow-popout`, `anim-menu`). Por isso a caixa do
 * `Popout` fica sem fundo e sem sombra no desktop: com as duas, a sombra dobrava
 * e o fundo `--background-surface-high` aparecia em volta do filho durante a
 * escala dele. Pelo mesmo motivo o `anim-menu` do filho é desligado: a entrada é
 * a do `Popout`, e as duas juntas somariam as escalas (.95 × .95).
 *
 * Na folha do celular a superfície é a folha, então o filho perde raio e sombra
 * e ocupa a largura dela — os 424px fixos da `CaixaPicker` vazavam de uma tela
 * de 390 (antes a caixa ficava presa a 8px da esquerda e cortada à direita).
 * Nada disso é medida do Discord mobile, que não foi medido.
 */
export default function PainelFlutuante({
  ancora,
  onClose,
  rotulo = "Escolher emoji",
  children,
}: {
  ancora: Anchor;
  onClose: () => void;
  /**
   * Nome acessível da caixa. O padrão é o do único conteúdo que os consumidores
   * põem aqui hoje, o `EmojiPicker` (o mesmo rótulo da `CaixaPicker` dele).
   */
  rotulo?: string;
  children: ReactNode;
}) {
  return (
    <Popout
      // quem abre o painel é o consumidor montá-lo; fechar é desmontá-lo
      aberto
      aoFechar={onClose}
      ancora={ancora}
      lado="bottom"
      alinhamento="end"
      fecharAoRolar
      rotulo={rotulo}
      // `!`: as classes da superfície do `Popout` vêm antes na mesma string, e
      // sem a marca a ordem das regras no CSS gerado é que decidiria
      className="!bg-transparent !shadow-none [&>*]:!animate-none"
      classeNaFolha="[&>*]:!w-full [&>*]:!rounded-none [&>*]:!shadow-none [&>*]:!animate-none"
    >
      {children}
    </Popout>
  );
}
