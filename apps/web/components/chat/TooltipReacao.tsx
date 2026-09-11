"use client";

import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { displayNameOf, parseCustomEmoji, type PublicUser } from "@streamz/shared";
import Avatar from "@/components/ui/Avatar";
import { API_URL } from "@/lib/config";

/** Folga entre a pílula e a caixa. */
const GAP = 8;
const EDGE = 8;
/** Quantos avatares cabem antes do "+N". */
const MAX_AVATARES = 6;

/**
 * Tooltip da pílula de reação: o emoji grande, os avatares de quem reagiu e a
 * frase por extenso — como no Discord.
 *
 * Não usa o `Tooltip` comum porque aquele só aceita texto, e o que informa aqui
 * é justamente **quem** reagiu: uma fileira de rostos é reconhecível de relance,
 * uma lista de nomes não.
 */
export default function TooltipReacao({
  emoji,
  userIds,
  conhecidos,
  children,
}: {
  emoji: string;
  userIds: string[];
  conhecidos: Map<string, PublicUser>;
  children: ReactNode;
}) {
  const [aberto, setAberto] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const alvoRef = useRef<HTMLSpanElement>(null);
  const caixaRef = useRef<HTMLDivElement>(null);

  const fechar = useCallback(() => {
    setAberto(false);
    setPos(null);
  }, []);

  useLayoutEffect(() => {
    if (!aberto) return;
    const alvo = alvoRef.current?.getBoundingClientRect();
    const caixa = caixaRef.current?.getBoundingClientRect();
    if (!alvo || !caixa) return;
    const acima = alvo.top - caixa.height - GAP;
    const top = acima >= EDGE ? acima : alvo.bottom + GAP;
    const left = Math.max(
      EDGE,
      Math.min(alvo.left + alvo.width / 2 - caixa.width / 2, window.innerWidth - caixa.width - EDGE),
    );
    setPos({ top, left });
  }, [aberto]);

  useLayoutEffect(() => {
    if (!aberto) return;
    window.addEventListener("scroll", fechar, true);
    window.addEventListener("resize", fechar);
    return () => {
      window.removeEventListener("scroll", fechar, true);
      window.removeEventListener("resize", fechar);
    };
  }, [aberto, fechar]);

  const pessoas = userIds.map((id) => conhecidos.get(id));
  const visiveis = pessoas.slice(0, MAX_AVATARES);
  const sobra = pessoas.length - visiveis.length;
  const custom = parseCustomEmoji(emoji);

  return (
    <>
      <span
        ref={alvoRef}
        className="inline-flex"
        onPointerEnter={() => setAberto(true)}
        onPointerLeave={fechar}
        onFocusCapture={() => setAberto(true)}
        onBlurCapture={fechar}
      >
        {children}
      </span>
      {aberto &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={caixaRef}
            role="tooltip"
            style={{
              top: pos?.top ?? 0,
              left: pos?.left ?? 0,
              visibility: pos ? "visible" : "hidden",
            }}
            className="pointer-events-none fixed z-[100] w-[220px] rounded-lg bg-input-background-default p-3 text-center shadow-popout anim-menu"
          >
            <span className="mx-auto block h-12 w-12">
              {custom ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`${API_URL}/api/emojis/${custom.id}/image`}
                  alt={`:${custom.name}:`}
                  className="h-12 w-12 object-contain"
                />
              ) : (
                <span className="text-[44px] leading-[48px]">{emoji}</span>
              )}
            </span>
            <span className="mt-2 flex items-center justify-center -space-x-1.5">
              {visiveis.map((u, i) =>
                u ? (
                  <Avatar key={u.id} user={u} size="sm" className="ring-2 ring-input-background-default" />
                ) : (
                  <span
                    key={`x${i}`}
                    className="grid h-6 w-6 place-items-center rounded-full bg-background-base-lowest text-[10px] text-text-muted ring-2 ring-input-background-default"
                  >
                    ?
                  </span>
                ),
              )}
              {sobra > 0 && (
                <span className="grid h-6 w-6 place-items-center rounded-full bg-background-base-lowest text-[10px] font-semibold text-text-muted ring-2 ring-input-background-default">
                  +{sobra}
                </span>
              )}
            </span>
            <span className="mt-2 block text-sm font-semibold text-text-strong">
              {frase(pessoas)}
            </span>
          </div>,
          document.body,
        )}
    </>
  );
}

/** "Ana, Bia e mais 3 reagiram" — o nome de quem não conhecemos vira "alguém". */
function frase(pessoas: (PublicUser | undefined)[]): string {
  const nomes = pessoas.map((u) => (u ? displayNameOf(u) : "alguém"));
  const verbo = nomes.length === 1 ? "reagiu" : "reagiram";
  if (nomes.length <= 3) {
    const lista =
      nomes.length <= 1 ? nomes.join("") : `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`;
    return `${lista} ${verbo}`;
  }
  return `${nomes.slice(0, 3).join(", ")} e mais ${nomes.length - 3} ${verbo}`;
}
