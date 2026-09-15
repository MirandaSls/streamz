"use client";

import { useState } from "react";
import type { Sticker } from "@streamz/shared";
import { Sticker as IconeFigurinha } from "@/components/ui/icones";

/** Lado da figurinha na mensagem (o Discord usa 160px). */
const LADO = 160;

/**
 * Figurinha de uma mensagem. Some quando a figurinha é apagada do servidor —
 * a relação no banco é `SetNull`, então a mensagem antiga fica sem ela em vez
 * de sumir da conversa (`sticker` some de `message`, e `MessageItem` já não
 * chama este componente nesse caso — é o "vazio" desta peça).
 *
 * O outro caminho de falha é o arquivo em si (URL apagada do storage, CDN
 * fora do ar): sem tratamento, o navegador desenha o ícone de imagem
 * quebrada padrão dele, que não segue o acervo de ícones do app nem o
 * vocabulário de cor. `carregando` evita o "pulo" de layout (o quadro de
 * 160×160 já existe antes do arquivo chegar) e `erro` troca a imagem por um
 * quadro discreto com o ícone de figurinha do acervo — não é medido em
 * nenhum print porque é um estado de falha, não uma tela do Discord; a régua
 * aqui é só não vazar o navegador cru (§6.6 do PROCESSO).
 */
export default function StickerView({ sticker }: { sticker: Sticker }) {
  const [estado, setEstado] = useState<"carregando" | "ok" | "erro">("carregando");

  if (estado === "erro") {
    return (
      <div
        role="img"
        aria-label={`Figurinha indisponível: ${sticker.name}`}
        title={sticker.name}
        className="mt-1 grid place-items-center rounded-lg border border-border-subtle bg-background-base-lower text-text-muted"
        style={{ width: LADO, height: LADO }}
      >
        <IconeFigurinha size={40} aria-hidden="true" />
      </div>
    );
  }

  return (
    <div className="relative mt-1" style={{ width: LADO, height: LADO }}>
      {estado === "carregando" && (
        <div
          aria-hidden="true"
          className="absolute inset-0 animate-pulse rounded-lg bg-background-base-lower"
        />
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={sticker.url}
        alt={sticker.name}
        title={sticker.name}
        width={LADO}
        height={LADO}
        loading="lazy"
        onLoad={() => setEstado("ok")}
        onError={() => setEstado("erro")}
        className={`h-full w-full object-contain transition-opacity ${estado === "ok" ? "opacity-100" : "opacity-0"}`}
      />
    </div>
  );
}
