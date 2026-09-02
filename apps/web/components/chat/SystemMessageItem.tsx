"use client";

import { useState, type MouseEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ImagePlus,
  MoreHorizontal,
  Pencil,
  Pin,
  ShieldAlert,
  SmilePlus,
} from "@/components/ui/icones";
import {
  displayNameOf,
  parseCustomEmoji,
  systemMessageText,
  type Message,
  type MessageType,
} from "@streamz/shared";
import PainelFlutuante from "@/components/chat/PainelFlutuante";
import EmojiPicker from "@/components/ui/EmojiPicker";
import Tooltip from "@/components/ui/Tooltip";
import { API_URL } from "@/lib/config";
import { horaCompleta } from "@/lib/format";
import { goToMessage } from "@/stores/messages-navigate";
import { useLiveUser } from "@/stores/presence";
import { anchorOf, ui, type Anchor } from "@/stores/ui";
import { registrarUsoDeReacao } from "@/components/chat/reacoes-rapidas";

/**
 * Ícone por tipo de narração, em 18px: entrada em verde, saída em vermelho,
 * fixar em cinza. `DEFAULT` não é narração e por isso não tem ícone — o
 * `ArrowRight` genérico que ficava aqui não existe em lugar nenhum do Discord.
 */
const ICONE: Partial<Record<MessageType, React.ReactNode>> = {
  SYSTEM_PIN: <Pin size={18} className="text-txt-muted" />,
  SYSTEM_JOIN: <ArrowRight size={18} className="text-green" />,
  SYSTEM_MOD_NOTICE: <ShieldAlert size={18} className="text-red" />,
  SYSTEM_MEMBER_ADDED: <ArrowRight size={18} className="text-green" />,
  SYSTEM_MEMBER_REMOVED: <ArrowLeft size={18} className="text-red" />,
  SYSTEM_MEMBER_LEFT: <ArrowLeft size={18} className="text-red" />,
  SYSTEM_GROUP_RENAMED: <Pencil size={18} className="text-txt-muted" />,
  SYSTEM_GROUP_ICON: <ImagePlus size={18} className="text-txt-muted" />,
};

/**
 * Evento do grupo na timeline ("X adicionou Y"): uma linha discreta com ícone e
 * sem avatar — não é a fala de ninguém, é o que aconteceu.
 *
 * Mas continua sendo uma mensagem: tem menu de contexto (copiar link/ID) e
 * aceita reação, como no Discord. O texto vem do contrato
 * (`systemMessageText`) para a API e a UI não divergirem.
 */
export default function SystemMessageItem({
  message,
  grouped = false,
  currentUserId,
  onToggleReaction,
  onMenu,
}: {
  message: Message;
  /** continuação do bloco anterior: a hora só aparece no hover. */
  grouped?: boolean;
  currentUserId?: string;
  onToggleReaction?: (id: string, emoji: string) => void;
  /** menu da mensagem, montado por quem sabe o contexto (MessageItem). */
  onMenu?: (e: MouseEvent) => void;
}) {
  const autor = useLiveUser(message.author);
  const [ancora, setAncora] = useState<Anchor | null>(null);
  const nome = displayNameOf(autor);
  const partes = repartirPeloNome(systemMessageText(message, nome), nome);
  const reactions = message.reactions ?? [];

  function abrirPerfil(e: MouseEvent<HTMLElement>) {
    ui.openProfile(autor, anchorOf(e.currentTarget));
  }

  function reagir(emoji: string) {
    registrarUsoDeReacao(emoji);
    onToggleReaction?.(message.id, emoji);
  }

  return (
    <div
      id={`mensagem-${message.id}`}
      onContextMenu={onMenu}
      style={grouped ? undefined : { marginTop: "var(--espaco-entre-grupos, 17px)" }}
      className="group relative py-0.5 pl-[72px] pr-12 text-sm text-txt-muted hover:bg-msghov"
    >
      {/* o ícone fica no centro da calha do avatar (x≈46), não colado no texto */}
      <span aria-hidden="true" className="absolute left-[37px] top-1">
        {ICONE[message.type]}
      </span>

      <span className="flex flex-wrap items-center gap-x-1.5">
        <span className="min-w-0 break-words">
          {partes.antes}
          {partes.temNome && (
            <button
              type="button"
              onClick={abrirPerfil}
              className="font-medium text-txt-primary hover:underline"
            >
              {nome}
            </button>
          )}
          {partes.depois}
          {/* a-mensagens: a narração de "fixou" leva à mensagem fixada */}
          {message.type === "SYSTEM_PIN" && message.replyTo && (
            <>
              {" "}
              <button
                type="button"
                onClick={() =>
                  void goToMessage({
                    guildId: message.guildId,
                    channelId: message.channelId,
                    messageId: message.replyTo!.id,
                  })
                }
                className="text-txt-link hover:underline"
              >
                Ver mensagem
              </button>
            </>
          )}
        </span>
        {/* mesmo cinza do resto da frase: dois níveis de cinza na mesma linha
            faziam a hora parecer outro tipo de informação */}
        <span
          className={`shrink-0 text-xs text-txt-muted ${grouped ? "opacity-0 group-hover:opacity-100" : ""}`}
        >
          {horaCompleta(message.createdAt)}
        </span>
      </span>

      {reactions.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {reactions.map((r) => {
            const mine = currentUserId ? r.userIds.includes(currentUserId) : false;
            const custom = parseCustomEmoji(r.emoji);
            return (
              <button
                key={r.emoji}
                type="button"
                aria-pressed={mine}
                onClick={() => reagir(r.emoji)}
                className={`flex h-6 items-center gap-1.5 rounded-lg border px-1.5 transition ${
                  mine
                    ? "border-accent bg-accent/20 text-txt-primary"
                    : "border-transparent bg-panel text-txt-normal hover:border-border-strong"
                }`}
              >
                {custom ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`${API_URL}/api/emojis/${custom.id}/image`}
                    alt={`:${custom.name}:`}
                    className="h-[18px] w-[18px] object-contain"
                  />
                ) : (
                  <span className="text-base leading-none">{r.emoji}</span>
                )}
                <span className="text-sm font-semibold leading-none">{r.count}</span>
              </button>
            );
          })}
        </div>
      )}

      {(onToggleReaction || onMenu) && (
        <div className="absolute -top-4 right-4 hidden rounded border border-black/20 bg-chat p-0.5 shadow-high group-focus-within:flex group-hover:flex">
          {onToggleReaction && (
            <Tooltip label="Adicionar reação">
              <button
                type="button"
                onClick={(e) => setAncora(anchorOf(e.currentTarget))}
                aria-label="Adicionar reação"
                className="grid h-8 w-8 place-items-center rounded-[3px] text-txt-secondary transition hover:bg-hov hover:text-txt-primary"
              >
                <SmilePlus size={20} />
              </button>
            </Tooltip>
          )}
          {onMenu && (
            <Tooltip label="Mais">
              <button
                type="button"
                onClick={onMenu}
                aria-label="Mais"
                className="grid h-8 w-8 place-items-center rounded-[3px] text-txt-secondary transition hover:bg-hov hover:text-txt-primary"
              >
                <MoreHorizontal size={20} />
              </button>
            </Tooltip>
          )}
        </div>
      )}

      {ancora && (
        <PainelFlutuante ancora={ancora} onClose={() => setAncora(null)}>
          <EmojiPicker
            onClose={() => setAncora(null)}
            onPick={(texto) => {
              reagir(texto);
              setAncora(null);
            }}
          />
        </PainelFlutuante>
      )}
    </div>
  );
}

/**
 * Reparte a narração em torno do nome do autor, para ele virar botão de perfil.
 * O texto vem pronto do contrato — quebrar aqui é o que evita duplicar a frase
 * só para tornar um pedaço clicável.
 */
function repartirPeloNome(texto: string, nome: string) {
  const i = nome ? texto.indexOf(nome) : -1;
  if (i < 0) return { antes: texto, depois: "", temNome: false };
  return { antes: texto.slice(0, i), depois: texto.slice(i + nome.length), temNome: true };
}
