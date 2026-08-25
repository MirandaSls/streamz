"use client";

import type { Sticker } from "@newdisc/shared";

/** Lado da figurinha na mensagem (o Discord usa 160px). */
const LADO = 160;

/**
 * Figurinha de uma mensagem. Some quando a figurinha é apagada do servidor —
 * a relação no banco é `SetNull`, então a mensagem antiga fica sem ela em vez
 * de sumir da conversa.
 */
export default function StickerView({ sticker }: { sticker: Sticker }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={sticker.url}
      alt={sticker.name}
      title={sticker.name}
      width={LADO}
      height={LADO}
      loading="lazy"
      className="mt-1 object-contain"
      style={{ width: LADO, height: LADO }}
    />
  );
}
