"use client";

import type { ReactNode } from "react";
import { ArrowLeft } from "@/components/ui/icones";

/**
 * As peças pequenas do leiaute de celular: alvo de toque, cabeçalho de tela e
 * a moldura de uma tela cheia.
 *
 * Uma regra atravessa todas: **alvo de toque de 44px**. No desktop um botão de
 * 32 com hover é confortável porque o ponteiro é preciso e o hover avisa antes
 * do clique; no dedo não existe nem precisão nem aviso, e 44px é o piso das
 * duas plataformas (Apple HIG e Material). O glifo continua do tamanho de
 * sempre — o que cresce é a área clicável em volta dele.
 *
 * **Os tamanhos daqui são literais (`h-[44px]`, `h-[56px]`), não `h-11`/`h-14`.**
 * A raiz do app é 15,5px (ver `globals.css`), então todo `rem` do Tailwind sai
 * 3% menor que o nominal: `h-11` mede **42,6px** e `h-14`, 54,25. Onde o número
 * é um piso de segurança ou uma medida tirada da captura do Discord, ler a
 * classe e assumir o valor dá errado — e dava: os alvos "de 44" mediam 43.
 */

/** Botão de ícone do cabeçalho/rodapé: 44×44 de alvo, glifo no meio. */
export function BotaoDeToque({
  label,
  onClick,
  ativo = false,
  className = "",
  children,
}: {
  label: string;
  onClick: () => void;
  ativo?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={ativo || undefined}
      className={`grid h-[44px] w-[44px] shrink-0 place-items-center rounded-lg transition active:bg-hov ${
        ativo ? "text-txt-primary" : "text-txt-secondary"
      } ${className}`}
    >
      {children}
    </button>
  );
}

/**
 * Cabeçalho de uma tela do celular: voltar, ícone, título (e subtítulo) e as
 * ações à direita.
 *
 * 48px de altura, como o cabeçalho do app do Discord — e não os 49 do
 * cabeçalho do desktop, que carrega a busca de 244px e a fileira de
 * ferramentas. Aqui só cabem duas ou três ações; o resto vai para a folha
 * inferior do título.
 */
export function CabecalhoMobile({
  aoVoltar,
  icone,
  titulo,
  subtitulo,
  aoTocarNoTitulo,
  acoes,
}: {
  /** ausente na base de uma aba: lá não há para onde voltar. */
  aoVoltar?: () => void;
  icone?: ReactNode;
  titulo: ReactNode;
  subtitulo?: ReactNode;
  /** o título vira botão (menu do servidor, perfil do contato). */
  aoTocarNoTitulo?: () => void;
  acoes?: ReactNode;
}) {
  const miolo = (
    <>
      {icone && (
        <span className="shrink-0 text-txt-muted" aria-hidden="true">
          {icone}
        </span>
      )}
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-base font-semibold leading-tight text-txt-primary">
          {titulo}
        </span>
        {subtitulo && (
          <span className="truncate text-xs leading-tight text-txt-muted">{subtitulo}</span>
        )}
      </span>
    </>
  );

  return (
    /* 56pt de altura, medido em `discord-mobile-chat-canal-2024.png`
         (1px=1pt, MEDIDAS.md §6): a barra vai de y=44 a y=100. */
    <header className="relative z-10 flex h-[56px] shrink-0 items-center gap-2 border-b border-border bg-panel pl-1 pr-1 shadow-header">
      {aoVoltar && (
        <BotaoDeToque label="Voltar" onClick={aoVoltar}>
          <ArrowLeft size={24} />
        </BotaoDeToque>
      )}
      {aoTocarNoTitulo ? (
        <button
          type="button"
          onClick={aoTocarNoTitulo}
          className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg py-1 text-left ${
            aoVoltar ? "" : "pl-3"
          }`}
        >
          {miolo}
        </button>
      ) : (
        <div className={`flex min-w-0 flex-1 items-center gap-2 ${aoVoltar ? "" : "pl-3"}`}>
          {miolo}
        </div>
      )}
      {acoes && <div className="flex shrink-0 items-center">{acoes}</div>}
    </header>
  );
}

/**
 * Uma tela cheia da pilha: ocupa a área toda e entra deslizando da direita.
 *
 * A animação é só de **entrada**. A de saída exigiria manter o nó montado
 * depois de a tela sair da pilha, e uma conversa desmontando com a lista de
 * mensagens dentro custa mais do que os 200ms de polimento valem. Está
 * registrado no PR.
 */
export function TelaEmpilhada({ children }: { children: ReactNode }) {
  return (
    /* a área segura de baixo vem para cá: com uma tela empilhada a barra de
       abas sai de cena (ver `ShellMobile`), e sem isto o composer encostaria na
       barra de gestos do aparelho */
    <div className="anim-empilhar absolute inset-0 z-10 flex flex-col bg-chat pb-[env(safe-area-inset-bottom)]">
      {children}
    </div>
  );
}
