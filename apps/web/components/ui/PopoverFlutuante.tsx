"use client";

import type { ReactNode, RefObject } from "react";
import { Popout } from "@/components/ui/primitivos/Popout";

/**
 * Caixa flutuante ancorada num botão — hoje um invólucro do `Popout` único
 * (onda 0.4), com a API de antes para os consumidores não mudarem.
 *
 * Existe porque `absolute` dentro da barra lateral não serve: a caixa precisa
 * crescer **para a direita, por cima do conteúdo**, e de dentro da coluna ela
 * ou é cortada pelo `overflow` de um ancestral, ou cresce para a esquerda por
 * cima do rail de servidores e sai da janela (foi o que aconteceu com a
 * supressão de ruído). Em portal e presa à janela, o problema não existe.
 *
 * O que vem do `Popout` e antes morava aqui: portal, conta de posição, folha
 * inferior no celular (com `useVoltarNoCelular` e alça que é botão), Esc que
 * não vaza para o Esc global, clique fora que ignora o botão que abriu e os
 * submenus em portal (`[data-submenu-de-popover]`, o nome antigo, continua
 * valendo), e a medida por `offsetWidth`/`offsetHeight` que não se engana com a
 * escala da animação. Ganho da troca: foco entra na caixa, Tab fica preso e o
 * foco volta ao botão quando ela fecha — antes não havia nada disso.
 *
 * O que continua sendo daqui é a **direção**, que é a do print: sobe a partir
 * do botão (`lado="top"`), alinhada pela borda esquerda dele (`start`) e
 * crescendo para a direita. Sem espaço em cima, desce; sem espaço em cima nem
 * embaixo, abre ao lado. E o **respiro** de antes (`p-3`, `p-1.5` no `denso`),
 * porque os consumidores desenharam o conteúdo contando com ele.
 *
 * A superfície é a do `Popout`: `--background-surface-high` (antes era
 * `--background-surface-higher`, a do menu), raio 8 medido nos prints e
 * `shadow-popout`.
 */

/** folga entre o botão e a caixa (a de antes; a mesma distância padrão do `Popout`). */
const FOLGA = 8;

export default function PopoverFlutuante({
  ancora,
  aberto,
  onFechar,
  rotulo,
  largura = 300,
  denso = false,
  semRespiro = false,
  children,
}: {
  /** o botão que abriu — a caixa se posiciona por ele. */
  ancora: RefObject<HTMLElement | null>;
  aberto: boolean;
  onFechar: () => void;
  /** rótulo acessível: a caixa é um `dialog` sem título visível fixo. */
  rotulo: string;
  largura?: number;
  /** caixa que é lista de itens: o respiro vem dos itens, não da moldura. */
  denso?: boolean;
  /**
   * O filho pinta a caixa inteira, de borda a borda — sem respiro e com o
   * fundo dele por cima do da moldura.
   *
   * É o caso do painel de efeitos sonoros: ele tem cabeçalho com respiro
   * próprio, coluna lateral colada na borda esquerda e corpo rolável. Com o
   * `p-3` da moldura, a coluna lateral flutuaria a 12px da borda e o cabeçalho
   * ganharia respiro duas vezes. `overflow-hidden` para o fundo do filho
   * respeitar o raio da caixa.
   */
  semRespiro?: boolean;
  children: ReactNode;
}) {
  return (
    <Popout
      aberto={aberto}
      aoFechar={onFechar}
      ancora={ancora}
      lado="top"
      alinhamento="start"
      distancia={FOLGA}
      largura={largura}
      rotulo={rotulo}
      // o respiro é o de antes, não os 16 do `semRespiro={false}` do Popout
      semRespiro
      className={semRespiro ? "overflow-hidden" : denso ? "p-1.5" : "p-3"}
      // a folha de antes não tinha o respiro denso: 12 dos lados e embaixo,
      // e o conteúdo começando 40 abaixo do topo (28 da alça + 12)
      classeNaFolha={semRespiro ? "" : "p-3"}
    >
      {children}
    </Popout>
  );
}
