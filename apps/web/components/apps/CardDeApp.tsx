"use client";

import type { AppDoDiretorio } from "@streamz/shared";
import { corDoAvatar } from "@/components/ui/avatar-cores";

/**
 * Um aplicativo na grade de "Descobrir aplicativos".
 *
 * ── j-bots · F4, lote B ──
 *
 * ## As medidas, e de onde saem
 *
 * Medidas com Pillow em `docs/Reference/apps/diretorio-grade.png` (2,000
 * px/CSS, aferida por quatro valores redondos simultâneos — ver `MEDIDAS.md`
 * §1 e §2). Conferi de novo aqui, varrendo a linha `y=1345` da captura: os
 * quatro cards começam em x = 22, 542, 1062, 1582 e medem **488 px** cada, com
 * 32 de intervalo — 244 e 16 px CSS. O ícone, varrido na coluna do primeiro
 * card, vai de `y=1348` a `y=1443`: **96 px**, ou 48 CSS, a 32 (16 CSS) da
 * borda.
 *
 * | peça | px CSS |
 * |---|---|
 * | card | 244 × **164** |
 * | intervalo da grade | 16 |
 * | raio | ≈8 |
 * | ícone | **48**, à esquerda, com o nome ao lado |
 * | padding interno | 16 |
 *
 * ## Três divergências do §11, todas a favor da medida
 *
 * 1. **"ícone 80"** → é **48**. O card do Discord tem 164 de altura e o ícone
 *    fica na horizontal, ao lado do nome; 80 empilhado come metade da altura
 *    útil e não sobra linha nenhuma para a descrição que o mesmo parágrafo
 *    pede.
 * 2. **"descrição de uma linha"** → são **duas**, que é o que a captura mostra
 *    (`Connect your DeviantArt account / with Discord. Share your profile…`) e
 *    o que o retângulo comporta com o ícone na horizontal.
 * 3. **A altura sai de 164 para 204.** No Discord o card **não tem botão** — o
 *    "Add to Server" mora só na página do app. O §11 pede o botão no card, e
 *    ele custa 32 de altura mais 8 de folga. Largura, ícone, intervalo, raio e
 *    padding continuam sendo os números medidos; o que muda é só a altura, e
 *    só porque há uma peça a mais dentro.
 *
 * ## Por que o card não é um `<button>` com um botão dentro
 *
 * São dois irmãos. O card inteiro abre a página do app, e "Adicionar" é um
 * botão à parte — aninhar `<button>` em `<button>` é HTML inválido e cada
 * motor desfaz a árvore de um jeito. O `<article>` guarda os dois, o primeiro
 * `<button>` cobre a área com `absolute inset-0`, e o de adicionar fica acima
 * dele no empilhamento.
 *
 * **Todo filho é `shrink-0`.** Sem isso o flex encolhe o texto para caber e o
 * nome sobe por cima da descrição — foi o que a primeira captura mostrou, e é o
 * tipo de coisa que nenhum typecheck pega (§3.3 do processo).
 */
export default function CardDeApp({
  app,
  aoAbrir,
  aoAdicionar,
}: {
  app: AppDoDiretorio;
  aoAbrir: () => void;
  aoAdicionar: () => void;
}) {
  return (
    <article
      /* px literais, e não a escala do Tailwind: 244 e 16 são medidas da
         captura (a raiz do app é 16px, ADR-0009), não escolhas de escala —
         o literal fixa o valor medido independente da raiz (a regra do §6.3
         do processo). */
      className="relative flex h-[204px] w-[244px] flex-col rounded-[8px] bg-background-base-lowest p-[16px] transition-colors hover:bg-interactive-background-hover celular:w-full"
    >
      {/*
        Cobre o card inteiro e abre a página do app — não é `<Button>`/
        `<BotaoDeIcone>`: é a peça "cartão clicável" (regra 3 da migração),
        irmã do botão "Adicionar" abaixo, não um botão de ação com texto.
      */}
      <button
        type="button"
        onClick={aoAbrir}
        aria-label={`Ver ${app.name}`}
        className="absolute inset-0 rounded-[8px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500"
      />

      {/* o cabeçalho do card: ícone à esquerda, nome ao lado — é o leiaute da
          captura, e é o que faz 48 de ícone caberem sem comer a descrição */}
      <div className="pointer-events-none flex shrink-0 items-center gap-3">
        <IconeDoApp app={app} lado={48} />
        <h3 className="min-w-0 flex-1 truncate text-base font-semibold leading-tight text-text-strong">
          {app.name}
        </h3>
      </div>

      {/* duas linhas, como na captura. `line-clamp-2` e não `truncate`: uma
          descrição sem espaço nenhum também tem de cortar */}
      <p className="pointer-events-none mt-3 line-clamp-2 shrink-0 text-sm leading-[18px] text-text-muted">
        {app.description ?? "Sem descrição."}
      </p>

      <p className="pointer-events-none mt-auto shrink-0 pt-2 text-xs leading-tight text-text-muted">
        {textoDeServidores(app.servidores)}
      </p>

      {/*
        Continua `<button>`, não `<Button>`: `data-adicionar-app` é seletor do
        e2e (`scripts/e2e-f4-integracao.mjs`) e `ButtonProps` (que estende
        `ButtonHTMLAttributes`, sem índice `data-*` nesta versão de
        `@types/react`) não aceita a prop — passar quebraria o typecheck.
        Cor já é token (`bg-brand-500` / `control-primary-text-default`).
      */}
      <button
        type="button"
        onClick={aoAdicionar}
        data-adicionar-app={app.id}
        className="relative mt-2 h-[32px] shrink-0 self-start rounded-[8px] bg-brand-500 px-3 text-sm font-medium text-control-primary-text-default transition-colors hover:brightness-110"
      >
        Adicionar ao servidor
      </button>
    </article>
  );
}

/**
 * O ícone do aplicativo: a imagem quando existe, as iniciais quando não.
 *
 * Não usa `Avatar`: ele traz o próprio tamanho de uma tabela fechada (`sm`,
 * `md`, …) e aqui o número é uma medida — 48 no card, 120 na página do app. A
 * cor de fundo é a mesma função do `Avatar` (`corDoAvatar`, derivada do id), o
 * que faz um app sem ícone ter a mesma cara nas duas telas e na lista de
 * membros.
 *
 * `iconUrl` é `null` até o **lote A** publicar o upload e o proxy do ícone; a
 * API já deriva a URL quando a chave existir, e nada aqui muda nesse dia.
 */
export function IconeDoApp({ app, lado }: { app: AppDoDiretorio; lado: number }) {
  const estilo = { width: lado, height: lado };
  if (app.iconUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={app.iconUrl}
        alt=""
        style={estilo}
        className="shrink-0 rounded-full object-cover"
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      style={{ ...estilo, backgroundColor: corDoAvatar(app.id), fontSize: Math.round(lado / 2.5) }}
      className="grid shrink-0 place-items-center rounded-full font-semibold text-text-overlay-light"
    >
      {app.name.slice(0, 2).toUpperCase()}
    </span>
  );
}

/** "em N servidores" — o número inteiro, não "os meus". */
export function textoDeServidores(n: number): string {
  if (n === 0) return "Ainda não está em nenhum servidor";
  return n === 1 ? "Em 1 servidor" : `Em ${n} servidores`;
}
