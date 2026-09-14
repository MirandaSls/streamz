"use client";

import { useState, type ReactNode } from "react";
import { EyeOff } from "@/components/ui/icones";

/**
 * ── onda 3 (cartão 3e) ── A cortina de "Spoiler" que `Thumbnail`, item de
 * `MediaGallery`, `Arquivo` e `Container` usam quando o bot marca `spoiler:
 * true` (contrato §1.2). Mesma pílula que `MediaGroup.tsx` (`Imagem`, fora da
 * minha lista — leitura só) já usa para o anexo comum: `bg-background-scrim`,
 * texto `text-overlay-light` maiúsculo, `EyeOff` 16px. Reaproveitar a pílula é
 * reaproveitar a medida que aquele cartão já tirou; não há CSS bruto próprio
 * de "spoiler de componente v2" nem print 1:1 com um (ver "nao_verificado").
 *
 * O borrão em si varia por chamador (`blur-2xl` numa imagem, como o
 * `MediaGroup`; `blur-md` num cartão de texto, que não existe no acervo então
 * é só "obscurecer o suficiente para não ler" — **não medido**), por isso este
 * arquivo só exporta a pílula e o botão que revela; quem chama decide o que
 * borra.
 */
export function PilulaDeSpoiler() {
  return (
    <span className="absolute inset-0 grid place-items-center">
      <span className="flex items-center gap-1.5 rounded-full bg-background-scrim px-3 py-1 text-sm font-bold uppercase text-text-overlay-light">
        <EyeOff size={16} aria-hidden="true" />
        Spoiler
      </span>
    </span>
  );
}

/**
 * Envolve `children` borrado (`blurClassName`) com a pílula por cima; clique
 * ou Enter/Espaço revela **sem avisar o bot** (o Discord também não faz
 * round-trip nenhum ao abrir um spoiler — é só estado local de quem olha).
 * Depois de revelado devolve `children` puro, sem o botão: um spoiler aberto
 * não é mais um alvo de clique.
 */
export function SpoilerCobertura({
  children,
  blurClassName,
  rotulo,
  className = "",
}: {
  children: ReactNode;
  /** classes de blur aplicadas ao conteúdo oculto (`blur-2xl` para mídia, `blur-md` para cartão). */
  blurClassName: string;
  rotulo: string;
  className?: string;
}) {
  const [revelado, setRevelado] = useState(false);
  if (revelado) return <>{children}</>;
  return (
    <button
      type="button"
      onClick={() => setRevelado(true)}
      aria-label={rotulo}
      className={`relative block w-full overflow-hidden rounded text-left ${className}`}
    >
      <div aria-hidden="true" className={`pointer-events-none select-none ${blurClassName}`}>
        {children}
      </div>
      <PilulaDeSpoiler />
    </button>
  );
}
