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
import { BotaoDeIcone } from "@/components/ui/primitivos";
import { API_URL } from "@/lib/config";
import { horaCompleta } from "@/lib/format";
import { goToMessage } from "@/stores/messages-navigate";
import { useLiveUser } from "@/stores/presence";
import { anchorOf, ui, type Anchor } from "@/stores/ui";
import { registrarUsoDeReacao } from "@/components/chat/reacoes-rapidas";

/**
 * Ícone por tipo de narração, em 12px — não mais 18px. Medido em
 * `.userJoinSystemMessageIcon_c19a55{height:12px;width:12px}`
 * (css-bruto/sob-demanda/618416…, o módulo do `Message`; é o único ícone de
 * narração com classe própria no CSS do Discord, e serve de régua para os
 * outros tipos da mesma família — pin, saída, aviso de moderação — que não
 * têm classe própria). Cor: só a do ícone de fixar foi confirmada no print
 * (cinza, igual ao resto da frase — ver
 * `suporte/imagens/discord-basics/221421867-pin-messages-faq/10.png`); as
 * cores de entrada/saída/aviso não têm fonte encontrada e ficam como
 * estavam (ver "nao_verificado"). `DEFAULT` não é narração e por isso não
 * tem ícone — o `ArrowRight` genérico que ficava aqui não existe em lugar
 * nenhum do Discord.
 *
 * Foge do 16/20/24 do `design.md`: aqui não é ícone de ação, é o glifo da
 * narração, e o valor medido (12px) vale mais que o padrão geral (§7 da
 * ADR-0009 — CSS medido só perde para print 1:1, nunca para princípio).
 */
const ICONE: Partial<Record<MessageType, React.ReactNode>> = {
  SYSTEM_PIN: <Pin size={12} className="text-text-muted" />,
  SYSTEM_JOIN: <ArrowRight size={12} className="text-status-positive" />,
  SYSTEM_MOD_NOTICE: <ShieldAlert size={12} className="text-status-danger" />,
  SYSTEM_MEMBER_ADDED: <ArrowRight size={12} className="text-status-positive" />,
  SYSTEM_MEMBER_REMOVED: <ArrowLeft size={12} className="text-status-danger" />,
  SYSTEM_MEMBER_LEFT: <ArrowLeft size={12} className="text-status-danger" />,
  SYSTEM_GROUP_RENAMED: <Pencil size={12} className="text-text-muted" />,
  SYSTEM_GROUP_ICON: <ImagePlus size={12} className="text-text-muted" />,
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
      className="group relative py-0.5 pl-[80px] pr-12 text-text-sm text-text-muted hover:bg-message-background-hover"
    >
      {/* Indent de 80px e padding vertical de 2px batem com
          `.wrapper_c19a55{padding-inline-start:5rem}` +
          `--custom-message-padding-vertical-container-compact:0.125rem`
          (css-bruto 419070…): é a linha compacta que o Discord reaproveita
          para narração. O ícone fica colado no início do texto, não no meio
          da calha do avatar — `margin-inline-end:var(--custom-message-meta-space)`
          (0.25rem = 4px) no ícone de entrada é o único gap medido, então
          ícone (12px) + esse gap (4px) = 16px reservados antes do texto:
          left = 80 − 4 − 12 = 64px. Vertical: linha de texto em
          text-text-sm mede 18px (tailwind.config.ts:82); ícone de 12px
          centrado nela sobra 3px acima, mais os 2px do padding do bloco
          (py-0.5) = 5px do topo. */}
      <span aria-hidden="true" className="absolute left-[64px] top-[5px]">
        {ICONE[message.type]}
      </span>

      <span className="flex flex-wrap items-center gap-x-1.5">
        <span className="min-w-0 break-words">
          {partes.antes}
          {partes.temNome && (
            <button
              type="button"
              onClick={abrirPerfil}
              className="font-medium text-text-strong hover:underline"
            >
              {nome}
            </button>
          )}
          {partes.depois}
          {/* a-mensagens: a narração de "fixou" leva à mensagem fixada. No
              print (pin-messages-faq/10.png) "a message"/"pinned messages"
              não é azul (`--text-link`): é negrito na mesma cor clara do
              resto — só "Bread Dog" (o autor) tem cor, e essa é a cor de
              cargo dele, não a do link. Por isso `font-semibold
              text-text-default`, não `text-text-link`. */}
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
                className="font-semibold text-text-default hover:underline"
              >
                Ver mensagem
              </button>
            </>
          )}
        </span>
        {/* mesmo cinza do resto da frase: dois níveis de cinza na mesma linha
            faziam a hora parecer outro tipo de informação */}
        <span
          className={`shrink-0 text-text-xs text-text-muted ${grouped ? "opacity-0 group-hover:opacity-100" : ""}`}
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
                    ? "border-brand-500 bg-brand-500/20 text-text-strong"
                    : "border-transparent bg-background-base-lowest text-text-default hover:border-border-normal"
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
                <span className="text-text-sm font-semibold leading-none">{r.count}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* mesma casca de MessagePreview.tsx:79 (a barra de ações no hover da
          mensagem comum): `shadow-popout` já embute a borda
          (`var(--shadow-border)`), então `border border-black/20` era cor
          fora do sistema de tokens por cima de uma borda duplicada. */}
      {(onToggleReaction || onMenu) && (
        <div className="absolute -top-4 right-4 hidden rounded bg-background-surface-higher p-0.5 shadow-popout group-focus-within:flex group-hover:flex">
          {onToggleReaction && (
            <BotaoDeIcone
              rotulo="Adicionar reação"
              icone={<SmilePlus size={20} />}
              comFundo
              onClick={(e) => setAncora(anchorOf(e.currentTarget))}
            />
          )}
          {onMenu && (
            <BotaoDeIcone rotulo="Mais" icone={<MoreHorizontal size={20} />} comFundo onClick={onMenu} />
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
