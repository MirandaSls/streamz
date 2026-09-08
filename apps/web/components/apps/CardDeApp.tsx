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
 * | card | 244 × 164 |
 * | intervalo da grade | 16 |
 * | raio | ≈8 |
 * | ícone | **48** |
 * | padding interno | 16 |
 *
 * **O §11 do documento pede "ícone 80"; o Discord usa 48.** Fui na medida, e
 * não no documento: 80 num card de 244 come metade da altura útil e não sobra
 * espaço para a descrição de uma linha que o mesmo parágrafo pede. A
 * divergência está no PR.
 *
 * ## Por que o card é um `<button>` com um botão dentro
 *
 * Não é: são dois irmãos. O card inteiro abre a página do app, e "Adicionar" é
 * um botão à parte — aninhar `<button>` em `<button>` é HTML inválido e o
 * navegador desfaz a árvore sozinho, de um jeito que muda de motor para motor.
 * O `<article>` guarda os dois, o primeiro `<button>` cobre a área do card com
 * `absolute inset-0`, e o de adicionar fica acima dele no empilhamento.
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
      /* 244×164 medidos. `h-[164px]` literal, e não `h-41`: a raiz do app é
         15,5px e a escala do Tailwind mede em rem — todo número nominal sai 3%
         menor, e 164 é uma medida da captura, não uma escolha de escala. */
      className="relative flex h-[164px] w-[244px] flex-col rounded-[8px] bg-panel p-[16px] transition-colors hover:bg-hov celular:w-full"
    >
      <button
        type="button"
        onClick={aoAbrir}
        aria-label={`Ver ${app.name}`}
        className="absolute inset-0 rounded-[8px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
      />

      <div className="pointer-events-none flex min-h-0 flex-1 flex-col">
        <IconeDoApp app={app} lado={48} />
        <h3 className="mt-2 truncate text-base font-semibold leading-tight text-txt-primary">
          {app.name}
        </h3>
        {/* descrição de **uma** linha, como o §11 pede: `line-clamp-1` e não
            `truncate`, para que uma descrição sem espaços também corte */}
        <p className="mt-1 line-clamp-1 text-sm leading-tight text-txt-muted">
          {app.description ?? "Sem descrição."}
        </p>
        <p className="mt-auto text-xs text-txt-muted">{textoDeServidores(app.servidores)}</p>
      </div>

      <button
        type="button"
        onClick={aoAdicionar}
        data-adicionar-app={app.id}
        className="relative mt-2 h-8 shrink-0 self-start rounded-[8px] bg-accent px-3 text-sm font-medium text-accent-ink transition-colors hover:brightness-110"
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
      className="grid shrink-0 place-items-center rounded-full font-semibold text-white"
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
