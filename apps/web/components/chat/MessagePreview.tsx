"use client";

import type { ReactNode } from "react";
import { displayNameOf, extractFirstUrl, type Message } from "@streamz/shared";
import LinkEmbedCard, { useLinkEmbed } from "@/components/chat/LinkEmbedCard";
import MediaGroup from "@/components/media/MediaGroup";
import Avatar from "@/components/ui/Avatar";
import { BotaoDeIcone } from "@/components/ui/primitivos";
import { horaCompleta } from "@/lib/format";
import { Markdown } from "@/lib/markdown";

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
 */
export default function MessagePreview({
  message,
  realce,
  acima,
  acoes,
  contexto,
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
  className?: string;
}) {
  // mesma regra da timeline: uma prévia de link só, a da primeira URL
  const url = message.suppressEmbeds ? null : extractFirstUrl(message.content);
  const embed = useLinkEmbed(url);
  const vazia = !message.content && message.attachments.length === 0;

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
      <div className="mt-1 break-words text-sm text-text-default [&_img]:max-w-full [&_video]:max-w-full [&_video]:h-auto">
        {message.content &&
          (realce ? (
            <Realcado texto={message.content} termo={realce} />
          ) : (
            <Markdown text={message.content} />
          ))}
        {message.attachments.length > 0 && <MediaGroup attachments={message.attachments} />}
        {embed && <LinkEmbedCard embed={embed} />}
        {vazia && <span className="italic text-text-muted">(mensagem vazia)</span>}
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
        {message.content || (message.attachments.length > 0 ? "anexo" : "")}
      </span>
    </div>
  );
}

/**
 * Texto com o termo buscado realçado.
 *
 * Aqui o conteúdo vai como texto puro, e não pelo `Markdown`: realçar dentro da
 * árvore já formatada exigiria atravessar cada nó inline, e o resultado da
 * busca vale mais legível que negrito-perfeito.
 */
function Realcado({ texto, termo }: { texto: string; termo: string }) {
  const alvo = termo.trim();
  if (!alvo) return <span className="whitespace-pre-wrap">{texto}</span>;
  const partes = texto.split(new RegExp(`(${escaparRegex(alvo)})`, "gi"));
  return (
    <span className="whitespace-pre-wrap">
      {partes.map((parte, i) =>
        parte.toLowerCase() === alvo.toLowerCase() ? (
          <mark key={i} className="rounded-[2px] bg-brand-500/30 text-text-strong">
            {parte}
          </mark>
        ) : (
          parte
        ),
      )}
    </span>
  );
}

function escaparRegex(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
