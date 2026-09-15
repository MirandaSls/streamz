"use client";

import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { displayNameOf, type PublicUser } from "@streamz/shared";
import { EmojiDaReacao, rotuloDaReacao } from "@/components/chat/EmojiDeReacao";

/** Folga entre a pílula e a caixa — sem número medido para este tooltip (o
 *  CSS do Discord não declara offset de posicionamento, isso é floating-ui
 *  em runtime); mantém o valor já usado nos outros popouts flutuantes. */
const GAP = 8;
const EDGE = 8;

/**
 * Tooltip da pílula de reação: "Fulano, Beltrano e mais N reagiram com :x:",
 * com o emoji grande à esquerda — a dica que aparece ao passar o mouse sobre
 * a pílula, antes de abrir a lista completa de quem reagiu (essa é outra
 * superfície do Discord, fora do escopo deste cartão).
 *
 * Medido de `.reactionTooltip_bbcccb` / `.reactionTooltipEmoji_bbcccb` /
 * `.reactionTooltipText_bbcccb` / `.reactionTooltipInner_bbcccb`
 * (docs/referencias-discord/tokens/css-bruto/sob-demanda/377016.ee694f35e21f879f.css):
 * fundo `--background-surface-high`, raio `--radius-xs` (4px, `rounded`),
 * sombra `var(--shadow-border), var(--shadow-high)` (`shadow-popout` — é a
 * sombra que desenha o contorno de 1px, não existe `border` à parte), texto
 * `--text-default` peso `--font-weight-medium` (500), `max-width: 288px`,
 * `padding: 16px`, hyphens automático + quebra de palavra. Por dentro,
 * `reactionTooltipInner` é uma **linha** (`display: flex`): emoji
 * `reactionTooltipEmoji` de **32×32** e o texto com `margin-inline-start:
 * 12px`. Não existe classe de avatar/rosto perto de `reactionTooltip_bbcccb`
 * no CSS — essa superfície é só emoji grande + frase, sem fileira de rostos
 * (os rostos ficam na lista completa, que se abre num clique separado).
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
    // A dica ficava presa quando um véu (menu, modal, o próprio clique na
    // pílula) cobria o alvo sem passar por `pointerleave`/`blur`: um
    // `pointerdown` em qualquer lugar (capture, antes que alguém pare a
    // propagação) e uma troca de aba (`visibilitychange`) também fecham.
    document.addEventListener("pointerdown", fechar, true);
    document.addEventListener("visibilitychange", fechar);
    return () => {
      window.removeEventListener("scroll", fechar, true);
      window.removeEventListener("resize", fechar);
      document.removeEventListener("pointerdown", fechar, true);
      document.removeEventListener("visibilitychange", fechar);
    };
  }, [aberto, fechar]);

  // "carregando": quem ainda não chegou em `conhecidos` (membro fora da
  // página carregada) vira "alguém" — não trava a frase esperando o resto do
  // servidor. `userIds` vazio (não deveria existir — a pílula some com a
  // última reação) cai no mesmo caminho, em vez de virar frase quebrada.
  const pessoas = userIds.length > 0 ? userIds.map((id) => conhecidos.get(id)) : [undefined];

  return (
    <>
      <span
        ref={alvoRef}
        className="inline-flex"
        onPointerEnter={() => setAberto(true)}
        onPointerLeave={fechar}
        onPointerDown={fechar}
        onClick={fechar}
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
            className="pointer-events-none fixed z-[100] max-w-[288px] overflow-hidden rounded bg-background-surface-high p-4 font-medium text-text-default shadow-popout anim-menu"
          >
            <div className="flex items-center [hyphens:auto] break-words">
              <EmojiDaReacao emoji={emoji} tamanho={32} />
              <span className="ml-3 text-text-sm">{frase(pessoas, emoji)}</span>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

/** "Ana, Bia e mais 3 reagiram com :festa:" — o nome de quem não conhecemos
 *  vira "alguém", e a frase sempre termina no emoji, como no Discord. */
function frase(pessoas: (PublicUser | undefined)[], emoji: string): string {
  const nomes = pessoas.map((u) => (u ? displayNameOf(u) : "alguém"));
  const verbo = nomes.length === 1 ? "reagiu" : "reagiram";
  const lista =
    nomes.length <= 3
      ? nomes.length <= 1
        ? nomes.join("")
        : `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`
      : `${nomes.slice(0, 3).join(", ")} e mais ${nomes.length - 3}`;
  return `${lista} ${verbo} com ${rotuloDaReacao(emoji)}`;
}
