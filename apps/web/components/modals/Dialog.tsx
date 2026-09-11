"use client";

import type { ReactNode } from "react";
import { Button, Modal } from "@/components/ui/primitivos";
import { useEhMobile } from "@/hooks/useEhMobile";

/**
 * Caixa de diálogo com a API antiga (`title`, `description`, `footer`…), agora
 * um invólucro do `Modal` de `components/ui/primitivos/Modal.tsx` — é lá que
 * moram as medidas do Discord, o foco preso, o Esc, o clique no véu, o portal,
 * a rolagem do corpo e a tela cheia do celular. Existe para os 29 modais não
 * mudarem de uma vez: tela nova usa o `Modal` direto.
 *
 * **Largura.** Sem `className` a caixa é o `medio` do Discord, 480 — o que os
 * prints 1:1 medem (confirmação, "Nova mensagem", convite; ver o cabeçalho do
 * `Modal`) e, por coincidência, o `w-[480px]` que este arquivo já usava. Com
 * `className` a largura é a de quem chamou (`tamanho="livre"`): os modais de
 * largura própria (440, 520, 570, o seletor de tela) continuam como estavam.
 */
export default function Dialog({
  title,
  description,
  onClose,
  children,
  footer,
  hideHeader = false,
  showClose = true,
  align = "center",
  bodyClassName = "",
  semPadding = false,
  telaCheiaNoCelular = false,
  className,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children?: ReactNode;
  footer?: ReactNode;
  /** esconde o cabeçalho visual mantendo o título para leitores de tela
   *  (quick switcher e perfil não têm título escrito no Discord). */
  hideHeader?: boolean;
  showClose?: boolean;
  /** o quick switcher fica no terço superior, não no centro. */
  align?: "center" | "top";
  bodyClassName?: string;
  /** o corpo sem padding nenhum: perfil e boas-vindas pintam a caixa inteira
   *  (faixa de cor até a borda) e cuidam do próprio respiro. */
  semPadding?: boolean;
  /** No celular a caixa vira tela cheia, com barra de 56 e seta de voltar
   *  (ver `telaCheiaNoCelular` no `Modal`). */
  telaCheiaNoCelular?: boolean;
  /** largura (e altura) própria da caixa; sem ela, 480 (`medio`). */
  className?: string;
}) {
  return (
    <Modal
      aoFechar={onClose}
      titulo={title}
      subtitulo={description}
      tamanho={className ? "livre" : "medio"}
      className={className ?? ""}
      rodape={footer}
      ocultarCabecalho={hideHeader}
      mostrarFechar={showClose}
      alinhamento={align === "top" ? "topo" : "centro"}
      classeDoCorpo={bodyClassName}
      semPadding={semPadding}
      telaCheiaNoCelular={telaCheiaNoCelular}
    >
      {children}
    </Modal>
  );
}

/**
 * Altura dos botões de rodapé no celular: 44, o piso de toque das duas
 * plataformas, contra os 40 do `md` do Discord (medidos no print, ver
 * `Button`). Vale justamente para os modais que continuam sendo cartão
 * centrado (confirmar, prompt, expulsar, banir, castigo), onde o botão errado
 * apaga mensagem, expulsa e bane. No desktop nada muda — lá o ponteiro é
 * preciso.
 *
 * Com `!` porque o `Button` já traz `h-[40px]`, e entre dois valores
 * arbitrários da mesma utilidade a ordem no CSS gerado não é garantida: 44
 * tem que ser 44.
 */
const ALTURA_DE_TOQUE = "!h-[44px]";

/**
 * Botão primário do rodapé de um modal: o `Button` `primario` (limão, texto
 * escuro) ou, com `danger`, o `critico`. Tamanho `md` (40), o do rodapé nos
 * prints.
 */
export function PrimaryButton({
  children,
  disabled,
  onClick,
  type = "button",
  danger = false,
  autoFocus = false,
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick?: () => void;
  type?: "button" | "submit";
  danger?: boolean;
  /** marca este botão como o alvo do foco inicial do modal. */
  autoFocus?: boolean;
}) {
  const ehMobile = useEhMobile();
  return (
    <Button
      variante={danger ? "critico" : "primario"}
      tamanho="md"
      type={type}
      onClick={onClick}
      disabled={disabled}
      data-autofocus={autoFocus ? "" : undefined}
      className={ehMobile ? ALTURA_DE_TOQUE : ""}
    >
      {children}
    </Button>
  );
}

/** Botão secundário (cancelar/fechar): o `Button` `secundario`, o "Cancelar" cinza do Discord. */
export function SecondaryButton({
  children,
  onClick,
  full = false,
  autoFocus = false,
}: {
  children: ReactNode;
  onClick?: () => void;
  full?: boolean;
  /** marca este botão como o alvo do foco inicial do modal. */
  autoFocus?: boolean;
}) {
  const ehMobile = useEhMobile();
  return (
    <Button
      variante="secundario"
      tamanho="md"
      onClick={onClick}
      larguraTotal={full}
      data-autofocus={autoFocus ? "" : undefined}
      className={ehMobile ? ALTURA_DE_TOQUE : ""}
    >
      {children}
    </Button>
  );
}
