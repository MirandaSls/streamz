"use client";

import { ArrowRight, Bot, Code } from "@/components/ui/icones";
import { Button } from "@/components/ui/primitivos";
import { BotaoCopiar } from "@/components/desenvolvedores/Codigo";
import { hrefDaAncora } from "@/components/desenvolvedores/especificacao";

/**
 * O topo da página de desenvolvedores: o que é, para quem é, e as duas ações
 * que importam — criar o aplicativo (é de lá que sai o token) e ir para a
 * referência.
 *
 * O endereço da API aparece já no topo, com botão de copiar, porque ele é
 * literalmente a única coisa que muda num bot escrito para o Discord. Deixá-lo
 * para a terceira dobra seria esconder a resposta.
 *
 * Não depende da especificação: se a API estiver fora do ar, este bloco e o
 * guia de primeiros passos continuam de pé, e só a referência mostra erro.
 */
export function Topo({ servidor, versao }: { servidor: string; versao?: string }) {
  return (
    <header className="relative overflow-hidden border-b border-border-subtle bg-background-base-lowest">
      {/* brilho da marca atrás do título: o limão a 8%, que some no Onyx por
          ser o mesmo token da escala em todos os temas */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-40 left-1/2 h-[420px] w-[820px] -translate-x-1/2 rounded-full bg-brand-500 opacity-[0.07] blur-3xl"
      />
      <div className="relative mx-auto flex max-w-[860px] flex-col items-start px-6 py-16 celular:px-4 celular:py-10">
        <span className="mb-5 inline-flex items-center gap-2 rounded-full border border-border-subtle bg-background-surface-high px-3 py-1 text-text-xs font-semibold uppercase tracking-wide text-text-subtle">
          <Bot size={14} aria-hidden="true" />
          Plataforma de bots
          {versao ? <span className="font-mono normal-case text-text-muted">{versao}</span> : null}
        </span>

        <h1 className="font-headline text-[56px] font-extrabold leading-[1.05] text-text-strong celular:text-[34px]">
          Escreva um bot para o Streamz
        </h1>

        <p className="mt-5 max-w-[640px] text-text-lg leading-[1.55] text-text-subtle celular:text-text-md">
          Use <strong className="font-semibold text-text-default">discord.js</strong>,{" "}
          <strong className="font-semibold text-text-default">discord.py</strong> ou qualquer biblioteca do
          Discord: aqui você troca a URL da API e o token, e o resto do seu código continua igual.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-3 celular:w-full celular:flex-col celular:items-stretch">
          <Button
            href="/app?settings=aplicativos"
            variante="primario"
            // 48px: fora dos três degraus do Discord de propósito — é a ação
            // principal de uma página de vitrine, não um botão de diálogo
            tamanho={48}
            iconeDireita={<ArrowRight size={18} aria-hidden="true" />}
          >
            Criar aplicativo
          </Button>
          <Button
            href={hrefDaAncora("referencia")}
            variante="secundario"
            tamanho={48}
            icone={<Code size={18} aria-hidden="true" />}
          >
            Ver a referência
          </Button>
        </div>

        <div className="mt-8 flex w-full max-w-[640px] items-center gap-3 rounded-lg border border-border-subtle bg-background-base-low px-3 py-2 celular:flex-col celular:items-stretch">
          <span className="shrink-0 text-text-xs font-semibold uppercase tracking-wide text-text-muted">
            Base da API
          </span>
          <code className="min-w-0 flex-1 overflow-x-auto scroller-thin whitespace-nowrap font-mono text-text-sm text-text-default">
            {servidor}
          </code>
          <BotaoCopiar texto={servidor} rotulo="Copiar" />
        </div>
      </div>
    </header>
  );
}
