"use client";

import type { Message, Section as SectionPayload } from "@streamz/shared";
import { TIPO_DE_COMPONENTE } from "@streamz/shared";
import BotaoDeBot from "@/components/chat/bot/BotaoDeBot";
import TextDisplayDeBot from "./TextDisplayDeBot";
import Thumbnail from "./Thumbnail";

/**
 * ── onda 3 (cartão 3e) ── `Section` (`type: 9`): 1–3 text displays numa
 * coluna, com um acessório à direita — thumbnail ou botão (`BotaoDeBot` do
 * cartão 3c, reaproveitado como o cartão pede).
 *
 * **Alinhamento vertical: não medido.** `v2-section-com-thumbnail.webp` (a
 * doc oficial) mostra a thumbnail começando perto do topo do bloco de texto
 * (que tem título + parágrafo + 4 itens de lista, bem mais alto que os 80px
 * da thumbnail), não centrada nele — por isso `items-start`. É imagem de
 * catálogo, sem escala (regra de autoridade, ADR-0009 §7): serve para a
 * ordem (texto à esquerda, acessório à direita) e para este alinhamento, não
 * para nenhum px.
 *
 * `gap-4` (16px) entre coluna de texto e acessório: mesma folga que
 * `EmbedDeBot` usa entre a coluna de texto e a thumbnail do embed
 * (`margin-inline-start:16px`, `.embedThumbnail__623de`) — a peça mais
 * parecida medida no CSS bruto, reaproveitada em vez de inventar outro número.
 */
export default function Section({
  componente,
  message,
}: {
  componente: SectionPayload;
  message: Pick<Message, "id" | "channelId" | "efemera">;
}) {
  return (
    <div className="flex items-start gap-4">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {componente.components.map((td, i) => (
          <TextDisplayDeBot key={td.id ?? i} componente={td} />
        ))}
      </div>
      {componente.accessory.type === TIPO_DE_COMPONENTE.THUMBNAIL ? (
        <Thumbnail componente={componente.accessory} message={message} />
      ) : (
        <div className="mt-0.5 shrink-0">
          <BotaoDeBot componente={componente.accessory} message={message} />
        </div>
      )}
    </div>
  );
}
