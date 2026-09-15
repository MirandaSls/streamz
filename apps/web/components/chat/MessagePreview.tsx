"use client";

import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { displayNameOf, extractFirstUrl, textoAchatadoDaMensagem, type Message } from "@streamz/shared";
import { ehComponentsV2, embedsSuprimidos, embedsVisiveis, estaPensando } from "@/components/chat/bot/embed-layout";
import LinkEmbedCard, { useLinkEmbed } from "@/components/chat/LinkEmbedCard";
import PensandoDoBot from "@/components/chat/mensagem/PensandoDoBot";
import { ReferenciaDeResposta } from "@/components/chat/mensagem/ReferenciaDaMensagem";
import MediaGroup from "@/components/media/MediaGroup";
import Avatar from "@/components/ui/Avatar";
import { BotaoDeIcone, Tooltip } from "@/components/ui/primitivos";
import { dataCompleta, horaCompleta } from "@/lib/format";
import { Markdown } from "@/lib/markdown";
import { useAuthorColor } from "@/stores/permissions";

/**
 * Uma mensagem como ela aparece **dentro de um painel** (fixadas, caixa de
 * entrada, busca).
 *
 * Os três painéis mostravam a mensagem truncada em `line-clamp` e trocavam
 * qualquer anexo pelo texto "(anexo)". No Discord o cartão traz a mensagem
 * inteira, com as imagens e a prévia de link — é ela que faz reconhecer o que
 * se procura. Aqui reaproveitamos os mesmos renderizadores da timeline
 * (`MediaGroup`, `LinkEmbedCard`, `Markdown`) para não existir uma segunda
 * versão da mensagem que envelhece sozinha.
 *
 * As ações do cartão ("saltar", "desafixar", "marcar como lida") só aparecem no
 * hover/foco, no canto superior direito — não como links de texto empilhados no
 * rodapé, que empurravam o conteúdo para baixo.
 *
 * `variante="resultado"` é o cartão do painel de busca (cartão 2m-busca), que
 * no Discord é outra peça — ver `CartaoDeResultado`.
 */
export default function MessagePreview({
  message,
  realce,
  acima,
  acoes,
  contexto,
  variante = "cartao",
  aoAbrir,
  className = "",
}: {
  message: Message;
  /** termo da busca, realçado dentro do texto. */
  realce?: string;
  /** linha acima do autor (caminho "Servidor › #canal", por exemplo). */
  acima?: ReactNode;
  /** botões do canto superior direito, visíveis no hover. */
  acoes?: ReactNode;
  /** mensagens vizinhas mostradas em cinza, como o contexto da busca. */
  contexto?: { antes?: Message | null; depois?: Message | null };
  /**
   * `cartao` (padrão): fixadas, caixa de entrada, confirmação e admin, como
   * sempre foi. `resultado`: a mensagem inteira no leiaute da timeline, dentro
   * da caixa de resultado de busca do Discord.
   */
  variante?: "cartao" | "resultado";
  /** só em `resultado`: clicar no cartão (ou em "Pular") leva à mensagem. */
  aoAbrir?: () => void;
  className?: string;
}) {
  const pensando = estaPensando(message);
  const texto = textoDaPrevia(message);
  // mesma regra da timeline (`MessageItem`): uma prévia de link só, a da
  // primeira URL do `content` — e nenhuma em "pensando", em v2 ou com
  // `SUPPRESS_EMBEDS`
  const url = pensando || ehComponentsV2(message) || embedsSuprimidos(message) ? null : extractFirstUrl(message.content);
  const embed = useLinkEmbed(url);
  const vazia = !pensando && !texto.trim() && message.attachments.length === 0;
  const corpoRef = useRef<HTMLDivElement>(null);
  useRealceDaBusca(corpoRef, realce, texto);
  const corpo = (
    <>
      {pensando && <PensandoDoBot nome={displayNameOf(message.author)} />}
      {texto && <Markdown text={texto} />}
      {message.attachments.length > 0 && <MediaGroup attachments={message.attachments} />}
      {embed && <LinkEmbedCard embed={embed} />}
      {vazia && <span className="italic text-text-muted">(mensagem vazia)</span>}
    </>
  );

  if (variante === "resultado") {
    return (
      <CartaoDeResultado message={message} aoAbrir={aoAbrir} className={className} corpoRef={corpoRef}>
        {corpo}
      </CartaoDeResultado>
    );
  }

  return (
    <article
      className={`group/msg relative rounded-[5px] bg-background-base-lower p-3 hover:bg-message-background-hover ${className}`}
    >
      {acima}
      {contexto?.antes && <Vizinha message={contexto.antes} />}
      <div className="flex items-center gap-2">
        <Avatar user={message.author} size="sm" />
        <span className="min-w-0 truncate font-medium text-text-strong">
          {displayNameOf(message.author)}
        </span>
        <span className="shrink-0 text-xs text-text-muted">{horaCompleta(message.createdAt)}</span>
      </div>
      {/* o teto de largura da timeline (550px) estoura num painel: as mídias
          são obrigadas a caber na coluna */}
      <div
        ref={corpoRef}
        className="mt-1 break-words text-sm text-text-default [&_img]:max-w-full [&_video]:max-w-full [&_video]:h-auto"
      >
        {corpo}
      </div>
      {contexto?.depois && <Vizinha message={contexto.depois} />}
      {acoes && (
        <div className="absolute right-2 top-2 hidden gap-0.5 rounded bg-background-surface-higher p-0.5 shadow-popout group-focus-within/msg:flex group-hover/msg:flex">
          {acoes}
        </div>
      )}
    </article>
  );
}

/**
 * O texto que a prévia mostra (e onde a busca realça).
 *
 * Ler só `message.content` deixava vazia, na busca, nas fixadas e na caixa de
 * entrada, toda mensagem de bot feita só de embed ou de componentes v2 — a tela
 * dizia "(mensagem vazia)" para uma mensagem que tem texto. O painel não tem os
 * renderizadores de embed e de componente da timeline, então usa o mesmo texto
 * achatado da notificação e da lista de conversas (`textoAchatadoDaMensagem`,
 * `packages/shared/src/mensagens-de-bot.ts`), obedecendo às flags como a
 * timeline obedece:
 * - `LOADING`: o `content` é o provisório do servidor e não aparece (quem
 *   desenha o estado é o `PensandoDoBot`);
 * - `IS_COMPONENTS_V2`: sem `content` nem embeds, o texto é o dos text
 *   displays;
 * - `SUPPRESS_EMBEDS`: os embeds não são desenhados, então também não entram
 *   no texto (o `embedsVisiveis` já corta os três casos).
 * Mensagem de humano sai com o próprio `content`, intacto.
 */
function textoDaPrevia(message: Message): string {
  if (estaPensando(message)) return "";
  return textoAchatadoDaMensagem({
    content: ehComponentsV2(message) ? "" : message.content,
    embeds: embedsVisiveis(message),
    components: message.components,
  });
}

/** Botão de canto do cartão (saltar, desafixar, marcar como lida). */
export function AcaoDoCartao({
  label,
  onClick,
  danger = false,
  children,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <BotaoDeIcone rotulo={label} icone={children} tamanho="sm" comFundo perigo={danger} onClick={onClick} />
  );
}

/** Mensagem vizinha da busca: uma linha, apagada, só para dar contexto. */
function Vizinha({ message }: { message: Message }) {
  return (
    <div className="flex items-center gap-1.5 py-0.5 text-xs text-channels-default">
      <Avatar user={message.author} size="xs" />
      <span className="shrink-0 font-medium">{displayNameOf(message.author)}</span>
      <span className="min-w-0 truncate">
        {textoDaPrevia(message) || (message.attachments.length > 0 ? "anexo" : "")}
      </span>
    </div>
  );
}

/**
 * Resultado de busca do Discord (`.searchResult__80bf8` e `.container__80bf8`,
 * no mesmo módulo do CSS bruto):
 *
 * - caixa: `background-color: var(--background-base-lower)`, `border: 1px
 *   solid var(--border-subtle)`, `border-radius: 8px`, `margin-bottom: 8px`
 *   (quem dá é o painel), `overflow: hidden`, `cursor: pointer`;
 * - "Pular": `.buttonsContainer__80bf8` em `top: 8px; inset-inline-end: 8px`,
 *   só no `:hover`/`:focus-within`; `.button__80bf8` com `height: 24px`,
 *   `padding: 4px`, `border-radius: 3px`, fundo `--background-base-lowest`,
 *   texto `--text-default`, hover `--interactive-text-hover` e `:active` 1px
 *   abaixo. O tamanho da letra não está no CSS (vem do JS): 12px, "não medido".
 *   Escondido com opacidade, não com `display:none` como lá — assim o Tab
 *   alcança o botão, e é o foco nele que o revela.
 * - dentro, a mensagem é a da timeline em cozy (GIFs de suporte
 *   `how-to-use-search-on-discord/01.gif` e `05.gif`: avatar, nome colorido,
 *   hora, resposta com espinha, markdown, mídia). Por isso as medidas são as do
 *   `MessageItem` — calha de 80, avatar de 40 a 20 da borda, nome semibold,
 *   hora 12px `--chat-text-muted`, linha de 22, 24 à direita
 *   (`.message__5126c{padding-inline-end:var(--space-xl)}`) — e a
 *   `ReferenciaDeResposta` é a mesma, com a espinha na mesma geometria.
 * - respiro vertical da mensagem dentro da caixa: **não medido** (nenhum print
 *   1:1 com resultados; no GIF, em proporção, dá perto de 8) — usamos 8.
 */
function CartaoDeResultado({
  message,
  aoAbrir,
  className,
  corpoRef,
  children,
}: {
  message: Message;
  aoAbrir?: () => void;
  className: string;
  corpoRef: RefObject<HTMLDivElement>;
  children: ReactNode;
}) {
  const cor = useAuthorColor(message.author.id, message.guildId);
  const temResposta = Boolean(message.replyTo);

  return (
    <article
      onClick={(e) => {
        // clique num link, botão, mídia ou na seleção de texto é deles, não "pular"
        const alvo = e.target as HTMLElement;
        if (alvo.closest("a, button, video, audio, [role=button]")) return;
        if (window.getSelection()?.toString()) return;
        aoAbrir?.();
      }}
      className={`group/msg relative cursor-pointer overflow-hidden rounded-lg border border-border-subtle bg-background-base-lower py-2 pl-[80px] pr-6 ${className}`}
    >
      {/* mesma geometria do avatar da timeline: no topo da linha, ou 24 abaixo
          quando há a linha da resposta (18 + 4 de margem + 2) */}
      <span className={`absolute left-5 ${temResposta ? "top-[32px]" : "top-2"}`}>
        <Avatar user={message.author} size="lg" />
      </span>
      <ReferenciaDeResposta message={message} compacto={false} />
      <div className="flex items-baseline gap-1.5 leading-[22px]">
        <span
          style={cor ? { color: cor } : undefined}
          className="min-w-0 truncate font-semibold text-text-strong"
        >
          {displayNameOf(message.author)}
        </span>
        <Tooltip rotulo={dataCompleta(message.createdAt)}>
          <span className="ml-1 shrink-0 text-xs font-medium text-chat-text-muted">
            {horaCompleta(message.createdAt)}
          </span>
        </Tooltip>
      </div>
      {/* o teto de largura da timeline (550px) estoura na coluna de 418: as
          mídias são obrigadas a caber */}
      <div
        ref={corpoRef}
        className="break-words text-text-default [&_img]:max-w-full [&_video]:h-auto [&_video]:max-w-full"
      >
        {children}
      </div>
      {aoAbrir && (
        <div className="pointer-events-none absolute right-2 top-2 flex opacity-0 group-focus-within/msg:pointer-events-auto group-focus-within/msg:opacity-100 group-hover/msg:pointer-events-auto group-hover/msg:opacity-100">
          <button
            type="button"
            onClick={aoAbrir}
            className="ml-1.5 h-[24px] rounded-[3px] bg-background-base-lowest p-1 text-xs font-medium leading-4 text-text-default hover:text-interactive-text-hover active:translate-y-px"
          >
            Pular
          </button>
        </div>
      )}
    </article>
  );
}

/**
 * Nome do realce no registro `CSS.highlights`. A regra `::highlight(streamz-busca)`
 * (cor e origem da medida) mora em `app/globals.css` — o Tailwind não gera
 * `::highlight()` — e o nome dos dois lados precisa bater.
 */
export const NOME_DO_REALCE_DA_BUSCA = "streamz-busca";

type RegistroDeRealce = { get(nome: string): Set<Range> | undefined; set(nome: string, h: Set<Range>): void };

/**
 * Realça cada palavra do termo **dentro do markdown já renderizado**.
 *
 * Antes o conteúdo ia como texto puro quando havia termo, porque realçar
 * dentro da árvore formatada exigia atravessar cada nó inline — e o resultado
 * do Discord mostra a mensagem formatada, com bloco de código e lista. A CSS
 * Custom Highlight API resolve sem tocar no DOM do React: marca `Range`s sobre
 * os nós de texto e o navegador pinta. Onde a API não existe (Firefox antes do
 * 140) a mensagem sai formatada e sem realce — nunca quebrada.
 */
function useRealceDaBusca(ref: RefObject<HTMLElement | null>, termo: string | undefined, conteudo: string) {
  useEffect(() => {
    const el = ref.current;
    const palavras = (termo ?? "")
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);
    const registro = typeof CSS !== "undefined" ? (CSS as unknown as { highlights?: RegistroDeRealce }).highlights : undefined;
    const Construtor = (globalThis as unknown as { Highlight?: new () => Set<Range> }).Highlight;
    if (!el || palavras.length === 0 || !registro || !Construtor) return;

    const faixas: Range[] = [];
    const andador = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let no = andador.nextNode(); no; no = andador.nextNode()) {
      const texto = (no.nodeValue ?? "").toLowerCase();
      for (const palavra of palavras) {
        for (let i = texto.indexOf(palavra); i >= 0; i = texto.indexOf(palavra, i + palavra.length)) {
          const faixa = document.createRange();
          faixa.setStart(no, i);
          faixa.setEnd(no, i + palavra.length);
          faixas.push(faixa);
        }
      }
    }
    if (faixas.length === 0) return;

    // um realce só para o app inteiro: cada cartão põe e tira as suas faixas
    let realce = registro.get(NOME_DO_REALCE_DA_BUSCA);
    if (!realce) {
      realce = new Construtor();
      registro.set(NOME_DO_REALCE_DA_BUSCA, realce);
    }
    for (const f of faixas) realce.add(f);
    const doRegistro = realce;
    return () => {
      for (const f of faixas) doRegistro.delete(f);
    };
  }, [ref, termo, conteudo]);
}
