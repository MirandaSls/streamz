"use client";

import type { AppDoDiretorio } from "@streamz/shared";
import { IconeDoApp, textoDeServidores } from "@/components/apps/CardDeApp";
import { ArrowLeft } from "@/components/ui/icones";
import { useAplicativos } from "@/stores/aplicativos";

/**
 * A página de um aplicativo: ícone grande, nome, descrição, "em N servidores"
 * e "Adicionar ao servidor".
 *
 * ── j-bots · F4, lote B ──
 *
 * Medidas de `docs/Reference/apps/diretorio-pagina-do-app.png` (2,000 px/CSS,
 * ver `MEDIDAS.md` §3): ícone grande **237 px @2x → ≈118, nominal 120**,
 * circular; botão "Add to Server" **237×81 @2x → ≈118×40**.
 *
 * ⚠️ Daquela captura eu copiei **só o leiaute**. Ela é anterior ao refresh de
 * cor do Discord de julho/2022 (`#36393F`/`#2F3136`/`#202225`), e os hex de lá
 * não viram token nenhum aqui — a superfície usa os tokens que o app já tem
 * (`bg-background-base-lower`, `bg-background-base-lowest`, `text-txt-*`), que é a regra do §6.6 do processo.
 *
 * Não é uma rota: o diretório é uma tela só, e esta página é um estado dela
 * (`useAplicativos.selecionado`). O "voltar" é o mesmo botão nas duas
 * plataformas — no celular a seta do `CabecalhoMobile` também volta, porque a
 * `TelaDeAplicativos` a liga ao `voltarParaGrade` quando há app aberto.
 */
export default function PaginaDeApp({ app }: { app: AppDoDiretorio }) {
  const voltar = useAplicativos((s) => s.voltarParaGrade);
  const abrirInstalacao = useAplicativos((s) => s.abrirInstalacao);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-[1024px] px-6 py-6 celular:px-4">
        {/*
          Continua `<button>`: é um link de navegação fantasma (sem fundo,
          cor muda no hover) — não cabe em nenhuma variante do `<Button>`
          (`link` teria cor de destaque e sublinhado, mudando a cara; as
          outras têm fundo). Cor já é token.
        */}
        <button
          type="button"
          onClick={voltar}
          /* 44 de alvo de toque, literal — fixa a medida independente da
             raiz (16px, ADR-0009) */
          className="mb-4 flex h-[44px] items-center gap-1.5 text-sm font-medium text-text-muted transition-colors hover:text-text-strong celular:-ml-2"
        >
          <ArrowLeft size={18} aria-hidden="true" />
          Voltar aos aplicativos
        </button>

        {/*
          No desktop o ícone fica ao lado do texto, como na captura. No celular
          ele vai para cima e tudo centraliza: 120 de ícone mais o texto ao lado
          não cabem em 390 sem espremer o nome em duas linhas.
        */}
        <div className="flex items-start gap-6 celular:flex-col celular:items-center celular:gap-4 celular:text-center">
          <IconeDoApp app={app} lado={120} />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-3xl font-bold leading-tight text-text-strong">
              {app.name}
            </h1>
            <p className="mt-1 text-sm text-text-muted">{textoDeServidores(app.servidores)}</p>
            {/*
              Continua `<button>`, não `<Button>`: `data-adicionar-app` é
              seletor do e2e (`scripts/e2e-f4-integracao.mjs`) e `ButtonProps`
              não aceita `data-*` (sem índice na `ButtonHTMLAttributes` desta
              versão de `@types/react`) — passar quebraria o typecheck. Cor
              já é token.
            */}
            <button
              type="button"
              onClick={() => abrirInstalacao(app)}
              data-adicionar-app={app.id}
              /* 118×40 medidos; 118 é o número da captura, e a folga lateral
                 do texto é o que faz o botão crescer se o rótulo crescer */
              className="mt-4 h-[40px] min-w-[118px] rounded-[8px] bg-brand-500 px-4 text-sm font-medium text-control-primary-text-default transition-colors hover:brightness-110"
            >
              Adicionar ao servidor
            </button>
          </div>
        </div>

        <section className="mt-8">
          <h2 className="mb-2 text-xs font-bold uppercase tracking-[0.02em] text-text-subtle">
            Sobre
          </h2>
          {/* `whitespace-pre-line`: a descrição é texto livre do dono do app e
              pode ter quebras. Nada de markdown — o campo não é markdown em
              lugar nenhum do contrato, e interpretá-lo aqui e não no card faria
              a mesma descrição ter duas caras. */}
          <p className="whitespace-pre-line text-sm leading-relaxed text-text-default">
            {app.description ?? "Este aplicativo ainda não tem descrição."}
          </p>
        </section>

        <section className="mt-6">
          <h2 className="mb-2 text-xs font-bold uppercase tracking-[0.02em] text-text-subtle">
            Como ele aparece
          </h2>
          <p className="text-sm text-text-default">
            Na lista de membros como{" "}
            <strong className="font-semibold text-text-strong">
              {app.botUser.displayName || app.botUser.username}
            </strong>
            , com a etiqueta de bot.
          </p>
        </section>
      </div>
    </div>
  );
}
