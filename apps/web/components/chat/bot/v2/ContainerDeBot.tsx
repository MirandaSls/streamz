"use client";

import type { Container, Message } from "@streamz/shared";
import { TIPO_DE_COMPONENTE } from "@streamz/shared";
import ActionRow from "@/components/chat/bot/ActionRow";
import { LARGURA_MAXIMA_DO_EMBED } from "@/components/chat/bot/embed-layout";
import FileDeBot from "./FileDeBot";
import MediaGallery from "./MediaGallery";
import Section from "./Section";
import Separator from "./Separator";
import { SpoilerCobertura } from "./spoiler";
import TextDisplayDeBot from "./TextDisplayDeBot";

/**
 * ── onda 3 (cartão 3e) ── `Container` (`type: 17`): a mesma barra de cor à
 * esquerda que o embed rico já tem (`EmbedDeBot.tsx`), mas para um conjunto
 * livre de componentes (`FilhoDeContainer`: action row, text display,
 * section, media gallery, separator, file — nunca outro container, o zod do
 * shared não deixa aninhar). `desenvolvedores/imagens/componentes/
 * v2-container.webp` mostra exatamente isso: cartão arredondado com a barra
 * azul (a cor do `accent_color`) na borda esquerda, texto e imagem dentro,
 * botões na base.
 *
 * **Medidas reaproveitadas do embed, não medidas de novo para o container:**
 * fundo `background-surface-high`, borda 1px `border-subtle` +
 * `border-l-4` na cor do acento (ou `border-normal` sem uma), raio `rounded`
 * (4px) — os mesmos tokens de `EmbedDeBot.tsx` (`.embedFull__623de`), porque
 * a imagem de catálogo mostra a mesma família visual (barra + cartão
 * arredondado) e não há CSS bruto próprio de "container v2" capturado (só
 * cliente comum foi raspado, não uma mensagem de bot com Components v2 —
 * ver "nao_verificado" no retorno do cartão). O teto de largura é o mesmo
 * `LARGURA_MAXIMA_DO_EMBED` (516) importado de `embed-layout.ts`, pela mesma
 * razão — **suposição**, não medida para container.
 *
 * `padding` 16 nos quatro lados (`p-4`), diferente do embed (que tem o grid
 * assimétrico do `.gridContainer__623de`): o container v2 não tem a mesma
 * grade de campos/thumbnail do embed, então uso o padding uniforme que o
 * resto dos cartões do app usa (`Arquivo`/`Audio` de `MediaGroup.tsx`, o
 * `.file__0ccae{padding:16px}` medido) em vez do padding assimétrico
 * específico do embed.
 */
export default function ContainerDeBot({
  componente,
  message,
}: {
  componente: Container;
  message: Message;
}) {
  const cor = componente.accent_color != null ? corDoAccent(componente.accent_color) : null;

  const conteudo = (
    <div
      className="w-fit max-w-full rounded border border-l-4 border-border-subtle border-l-border-normal bg-background-surface-high"
      style={cor ? { borderLeftColor: cor } : undefined}
    >
      <div className="flex min-w-0 flex-col gap-2 p-4" style={{ maxWidth: LARGURA_MAXIMA_DO_EMBED }}>
        {componente.components.map((filho, indice) => (
          <FilhoDoContainer key={filho.id ?? indice} componente={filho} message={message} />
        ))}
      </div>
    </div>
  );

  if (!componente.spoiler) return conteudo;

  return (
    <SpoilerCobertura blurClassName="blur-md" rotulo="Spoiler: mostrar conteúdo" className="w-fit max-w-full">
      {conteudo}
    </SpoilerCobertura>
  );
}

function FilhoDoContainer({
  componente,
  message,
}: {
  componente: Container["components"][number];
  message: Message;
}) {
  switch (componente.type) {
    case TIPO_DE_COMPONENTE.ACTION_ROW:
      return <ActionRow componente={componente} message={message} />;
    case TIPO_DE_COMPONENTE.TEXT_DISPLAY:
      return <TextDisplayDeBot componente={componente} />;
    case TIPO_DE_COMPONENTE.SECTION:
      return <Section componente={componente} message={message} />;
    case TIPO_DE_COMPONENTE.MEDIA_GALLERY:
      return <MediaGallery componente={componente} message={message} />;
    case TIPO_DE_COMPONENTE.SEPARATOR:
      return <Separator componente={componente} />;
    case TIPO_DE_COMPONENTE.FILE:
      return <FileDeBot componente={componente} />;
    default:
      return null;
  }
}

/** `accent_color` (inteiro RGB) → `#rrggbb`; mesma conta de `corDaBarra` do embed (não exportada de lá). */
function corDoAccent(color: number): string | null {
  if (!Number.isInteger(color) || color < 0 || color > 0xffffff) return null;
  return `#${color.toString(16).padStart(6, "0")}`;
}
