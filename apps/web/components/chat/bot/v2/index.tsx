"use client";

import type { ComponenteDeMensagem, Message } from "@streamz/shared";
import { TIPO_DE_COMPONENTE } from "@streamz/shared";
import ActionRow from "@/components/chat/bot/ActionRow";
import ContainerDeBot from "./ContainerDeBot";
import FileDeBot from "./FileDeBot";
import MediaGallery from "./MediaGallery";
import Section from "./Section";
import Separator from "./Separator";
import TextDisplayDeBot from "./TextDisplayDeBot";

/**
 * ── onda 3 (cartão 3e) ── O ponto de entrada dos componentes de **layout**
 * do Components v2 (contrato `docs/CONTRATO-ONDA-3.md` §1.2 e §9: "container,
 * section, thumbnail, text display, separator, media gallery, file"),
 * chamado por `ComponentesDaMensagem.tsx` (cartão 3c, fora da minha lista)
 * para todo `ComponenteDeMensagem` de primeiro nível quando a mensagem tem
 * `IS_COMPONENTS_V2` — inclusive `type: 1` (action row), que o próprio 3c
 * comentou que "devolve o próprio `<ActionRow>`".
 *
 * `Thumbnail` (`type: 11`) não aparece aqui: no shared ele só existe como
 * `Section.accessory`, nunca de primeiro nível (nem dentro de `Container`) —
 * `ComponenteDeMensagem`/`FilhoDeContainer` não o incluem, então não há
 * `case` para ele, e isso não é uma lacuna, é a forma do contrato.
 *
 * Cada peça é o arquivo homônimo desta pasta; o cabeçalho de cada um tem a
 * medida (ou a falta dela) daquele componente especificamente.
 */
export function ComponenteV2({
  componente,
  message,
}: {
  componente: ComponenteDeMensagem;
  message: Message;
}) {
  switch (componente.type) {
    case TIPO_DE_COMPONENTE.ACTION_ROW:
      return <ActionRow componente={componente} message={message} />;
    case TIPO_DE_COMPONENTE.SECTION:
      return <Section componente={componente} message={message} />;
    case TIPO_DE_COMPONENTE.TEXT_DISPLAY:
      return <TextDisplayDeBot componente={componente} />;
    case TIPO_DE_COMPONENTE.MEDIA_GALLERY:
      return <MediaGallery componente={componente} message={message} />;
    case TIPO_DE_COMPONENTE.FILE:
      return <FileDeBot componente={componente} />;
    case TIPO_DE_COMPONENTE.SEPARATOR:
      return <Separator componente={componente} />;
    case TIPO_DE_COMPONENTE.CONTAINER:
      return <ContainerDeBot componente={componente} message={message} />;
    default:
      return null;
  }
}
