"use client";

import { forwardRef, type ReactNode } from "react";
import { ArrowLeft, ChevronRight } from "@/components/ui/icones";
import { BotaoDeIcone } from "@/components/ui/primitivos";

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
 * A raiz do app é 16px (ver `globals.css`, ADR-0009) — com ela `h-11` já mede
 * 44px e `h-14`, 56 —, mas o literal fica: o número aqui não é um passo da
 * escala do Tailwind, é o piso de toque (HIG/Material) ou uma medida tirada
 * da captura do Discord, e ler a classe genérica e assumir o valor continua
 * errado se a raiz mudar de novo.
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
    <BotaoDeIcone
      rotulo={label}
      icone={children}
      tamanho="lg"
      ativo={ativo}
      comFundo
      onClick={onClick}
      // 44 literal (ver comentário do arquivo) sobre a caixa de 40 do `lg`
      className={`h-[44px] w-[44px] ${className}`}
    />
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
  chevron = false,
  acoes,
}: {
  /** ausente na base de uma aba: lá não há para onde voltar. */
  aoVoltar?: () => void;
  icone?: ReactNode;
  titulo: ReactNode;
  subtitulo?: ReactNode;
  /** o título vira botão (menu do servidor, perfil do contato). */
  aoTocarNoTitulo?: () => void;
  /**
   * `›` depois do título, como no `# general ›` da captura do chat. É o sinal
   * de que tocar ali abre alguma coisa — no nosso caso, quem está na conversa.
   */
  chevron?: boolean;
  acoes?: ReactNode;
}) {
  const miolo = (
    <>
      {icone && (
        <span className="shrink-0 text-text-muted" aria-hidden="true">
          {icone}
        </span>
      )}
      <span className="flex min-w-0 flex-col">
        <span className="flex min-w-0 items-center gap-1">
          <span className="truncate text-base font-semibold leading-tight text-text-strong">
            {titulo}
          </span>
          {chevron && (
            <ChevronRight size={16} aria-hidden="true" className="shrink-0 text-text-subtle" />
          )}
        </span>
        {subtitulo && (
          <span className="truncate text-xs leading-tight text-text-muted">{subtitulo}</span>
        )}
      </span>
    </>
  );

  return (
    /* 56pt de altura, medido em `discord-mobile-chat-canal-2024.png`
         (1px=1pt, MEDIDAS.md §6): a barra vai de y=44 a y=100. */
    <header className="relative z-10 flex h-[56px] shrink-0 items-center gap-2 border-b border-border-subtle bg-background-base-lowest pl-1 pr-1 shadow-elevation-low">
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
 *
 * A `ref` é do arrasto (`ShellMobile`): quem acompanha o dedo escreve o
 * `transform` direto no nó, sem passar por estado do React — um render por
 * quadro de gesto faria a conversa inteira reconciliar sessenta vezes por
 * segundo. `className` soma o que só vale com a gaveta aberta (o canto).
 */
export const TelaEmpilhada = forwardRef<
  HTMLDivElement,
  { className?: string; children: ReactNode }
>(function TelaEmpilhada({ className = "", children }, ref) {
  return (
    /* a área segura de baixo vem para cá: com uma tela empilhada a barra de
       abas sai de cena (ver `ShellMobile`), e sem isto o composer encostaria na
       barra de gestos do aparelho */
    <div
      ref={ref}
      className={`anim-empilhar absolute inset-0 z-10 flex flex-col bg-background-base-lower pb-[env(safe-area-inset-bottom)] ${className}`}
    >
      {children}
    </div>
  );
});
