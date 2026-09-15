"use client";

import type { ReactNode } from "react";
import { AlertTriangle } from "@/components/ui/icones";

/**
 * As peças comuns das entradas do canal no celular (detalhes, busca, fixadas,
 * threads e a thread aberta): a moldura da camada, o botão redondo do cabeçalho
 * e os três estados de lista — carregando, vazio e erro.
 */

/**
 * Uma camada cheia **por cima da conversa**, dentro da tela empilhada.
 *
 * Não é portal de propósito: montada ali dentro, ela continua sob a
 * `AreaDeToqueLongo` do `ShellMobile`, e o toque longo num cartão de fixada ou
 * numa linha de thread abre o menu dele como em qualquer lista do app. Num
 * portal para o `body` o gesto não chegaria.
 *
 * **Sobe do fundo** (`anim-folha`), e não entra da direita como as telas da
 * pilha: no Discord do iOS os detalhes e a busca do canal são apresentados como
 * folha, com a conversa encolhida numa aba no topo — é o que se vê nos quadros
 * 26–40 de `suporte/.../pin-messages-faq/14.gif` e 11–20 de
 * `how-to-use-search-on-discord/03.gif`. A aba encolhida do fundo não foi
 * copiada: é um efeito do `UISheetPresentationController` do iOS, sem
 * equivalente no Android, e o acervo não tem o Android recente para desempatar
 * (segue-se o iOS no que dá para seguir sem inventar).
 *
 * `z-30`: acima do `CabecalhoMobile` (`z-10`) e do que a conversa põe por cima
 * da timeline; a thread aberta usa `z-40` para cobrir os detalhes quando é
 * aberta de dentro deles.
 */
export function CamadaDeEntrada({
  rotulo,
  acima = false,
  children,
}: {
  rotulo: string;
  /** a thread aberta, que precisa cobrir as outras entradas. */
  acima?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={rotulo}
      className={`anim-folha absolute inset-0 flex flex-col bg-background-base-lowest pb-[env(safe-area-inset-bottom)] motion-reduce:!animate-none ${
        acima ? "z-40" : "z-30"
      }`}
    >
      {children}
    </section>
  );
}

/**
 * Botão de ícone dos cabeçalhos: **círculo cheio de 32** dentro de um alvo de
 * **44**.
 *
 * O 32 é medido: a lupa do cabeçalho da conversa em
 * `docs/Reference/mobile/discord-mobile-chat-canal-2024.png` (1px = 1pt) é um
 * círculo de `x 327..358`, `y 56..87`, a 16 da borda direita (`x 359..374`).
 * Os três botões do cabeçalho dos detalhes (lupa, sino, engrenagem) têm, no
 * mesmo GIF, o tamanho da lupa da conversa — o GIF não tem escala conhecida,
 * então vale a relação, não um número tirado dele. O 44 é o piso de toque: o
 * desenho fica com a medida e a área clicável cresce por fora, a mesma solução
 * dos botões redondos do cabeçalho de conversas (`layout/DMList.tsx`).
 *
 * Cor do círculo: `--interactive-background-hover`, a mesma dos círculos da
 * lista de conversas. A captura mede `#262731` sobre o `#1C1D26` da barra, mas
 * ela está num tema da família Onyx (MEDIDAS.md §13) e o hex não é token.
 */
export function BotaoRedondo({
  rotulo,
  onClick,
  className = "",
  children,
}: {
  rotulo: string;
  onClick: () => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={rotulo}
      onClick={onClick}
      className={`grid h-[44px] w-[44px] shrink-0 place-items-center rounded-full text-interactive-icon-default ${className}`}
    >
      {/* `pointer-events-none`: o ícone de dentro pode trocar no meio do toque
          e, arrancado do DOM, levaria o clique junto */}
      <span className="pointer-events-none grid h-[32px] w-[32px] place-items-center rounded-full bg-interactive-background-hover transition-colors active:bg-border-normal">
        {children}
      </span>
    </button>
  );
}

/**
 * "Carregando": o mesmo girador de `MessageList.tsx` e `QuickSwitcher.tsx`
 * (`border-border-normal border-t-text-muted`), para o app ter um só.
 */
export function EstadoCarregando({ texto = "Carregando…" }: { texto?: string }) {
  return (
    <div role="status" className="flex flex-col items-center justify-center gap-3 px-4 py-10 text-text-sm text-text-muted">
      <span
        aria-hidden="true"
        className="h-6 w-6 animate-spin rounded-full border-2 border-border-normal border-t-text-muted motion-reduce:animate-none"
      />
      {texto}
    </div>
  );
}

/** Lista vazia: ícone grande apagado, a frase e, se houver, a dica embaixo. */
export function EstadoVazio({ icone, titulo, dica }: { icone: ReactNode; titulo: string; dica?: string }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
      <span aria-hidden="true" className="mb-3 text-channels-default">
        {icone}
      </span>
      <p className="text-text-md font-medium text-text-default">{titulo}</p>
      {dica && <p className="mt-2 text-text-sm text-text-muted">{dica}</p>}
    </div>
  );
}

/**
 * Erro com "Tentar de novo". O botão tem 44 de altura (piso de toque) e é o
 * secundário do Discord em tokens (`--control-secondary-*`); a forma do estado
 * de erro de lista do Discord no celular não está no acervo — **não medido**.
 */
export function EstadoErro({ titulo, aoTentarDeNovo }: { titulo: string; aoTentarDeNovo?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center justify-center px-6 py-10 text-center">
      <AlertTriangle size={32} aria-hidden="true" className="mb-3 text-text-feedback-critical" />
      <p className="text-text-md font-medium text-text-default">{titulo}</p>
      {aoTentarDeNovo && (
        <button
          type="button"
          onClick={aoTentarDeNovo}
          className="mt-4 h-[44px] rounded-lg bg-control-secondary-background-default px-4 text-text-sm font-medium text-control-secondary-text-default active:bg-control-secondary-background-active"
        >
          Tentar de novo
        </button>
      )}
    </div>
  );
}
