"use client";

import { useEffect, useMemo, useState, type MouseEvent } from "react";
import {
  Copy,
  CornerUpLeft,
  CornerUpRight,
  EyeOff,
  Flag,
  Hash,
  Image as ImageIcon,
  Link2,
  MailOpen,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Smile,
  SmilePlus,
  Trash2,
} from "@/components/ui/icones";
import type { Message, PublicUser } from "@streamz/shared";
import {
  WS_EVENTS,
  displayNameOf,
  extractFirstUrl,
  isDirectImageUrl,
  isSystemMessage,
  mentionsMe as ehMencaoParaMim,
  messageLinkPath,
  parseCustomEmoji,
  youtubeVideoId,
} from "@streamz/shared";
import LinkEmbedCard, { useLinkEmbed } from "@/components/chat/LinkEmbedCard";
import PainelFlutuante from "@/components/chat/PainelFlutuante";
import TooltipReacao from "@/components/chat/TooltipReacao";
import { useMarcadorNaoLido } from "@/components/chat/marcador-nao-lido";
import { registrarUsoDeReacao, useFrequentes } from "@/components/chat/reacoes-rapidas";
import { shiftPressionado } from "@/components/chat/tecla-shift";
import MediaGroup from "@/components/media/MediaGroup";
import StickerView from "@/components/media/StickerView";
import YouTubeEmbed from "@/components/media/YouTubeEmbed";
// ── h-moderacao ──
import PollCard from "@/components/polls/PollCard";
import { emit } from "@/stores/socket-adapter";
import Avatar from "@/components/ui/Avatar";
import EmojiPicker from "@/components/ui/EmojiPicker";
import Tooltip from "@/components/ui/Tooltip";
import { API_URL } from "@/lib/config";
import { dataCompleta, hora, horaCompleta } from "@/lib/format";
import { Markdown } from "@/lib/markdown";
import { useAuth } from "@/stores/auth";
import { useChannels } from "@/stores/channels";
import { dmTitle, useDMs } from "@/stores/dms";
import { useGuilds } from "@/stores/guilds";
import { useAuthorColor, usePermissions } from "@/stores/permissions";
import { useMessages } from "@/stores/messages";
import SystemMessageItem from "@/components/chat/SystemMessageItem";
import { goToMessage } from "@/stores/messages-navigate";
import { usePins } from "@/stores/messages-pins";
import { useThreads } from "@/stores/messages-threads";
import { alturaDoChipDeReacao, useSettings } from "@/stores/settings";
import type { ChatMessage } from "@/stores/messages-core";
import { useLiveUser } from "@/stores/presence";
import { anchorOf, ui, type Anchor, type MenuItem } from "@/stores/ui";

/**
 * O emoji de uma reação: unicode sai como texto; personalizado é `<:nome:id>` e
 * vira a imagem daquele id — a mesma URL pública que o markdown usa, para a
 * reação não virar `<:festa:abc>` escrito na tela.
 *
 * Os dois casos ocupam a **mesma caixa quadrada** de lado `tamanho`, centrada.
 * O unicode é texto, e texto se posiciona pela linha de base da fonte: com
 * `line-height: 1.1` a caixa de linha ficava maior que a caixa de conteúdo do
 * chip e o glifo descia — no Segoe UI Emoji do Windows a tinta de 😂 tem a
 * altura inteira do em, então ele saía pela borda de baixo. Uma caixa fixa com
 * `line-height: 1` e centralização por flex tira a métrica da fonte da conta.
 *
 * Nada de Twemoji: a CSP não deixa buscar de CDN e o desktop roda offline. A
 * fonte é a do sistema; o que se acerta aqui é a caixa.
 */
function EmojiDaReacao({ emoji, tamanho }: { emoji: string; tamanho: number }) {
  const custom = parseCustomEmoji(emoji);
  // o tamanho é preferência do usuário (aba Acessibilidade de e-configuracoes)
  if (!custom)
    return (
      <span
        className="inline-flex shrink-0 items-center justify-center"
        style={{ fontSize: `${tamanho}px`, lineHeight: 1, height: tamanho, width: tamanho }}
      >
        {emoji}
      </span>
    );
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`${API_URL}/api/emojis/${custom.id}/image`}
      alt={`:${custom.name}:`}
      loading="lazy"
      style={{ height: tamanho, width: tamanho }}
      className="shrink-0 object-contain"
    />
  );
}

/** Texto acessível de uma reação (o leitor de tela não lê a imagem do emoji). */
function rotuloDaReacao(emoji: string): string {
  const custom = parseCustomEmoji(emoji);
  return custom ? `:${custom.name}:` : emoji;
}

/** Ícone-botão da barra de ações que aparece no hover da mensagem. */
function ActionButton({
  label,
  onClick,
  danger = false,
  children,
}: {
  label: string;
  onClick: (e: MouseEvent<HTMLButtonElement>) => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Tooltip label={label}>
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        // 28px com raio 6, medido no botão "…" da barra do Discord
        // (`2026-08-31 124022.png`, x 1222..1249, y 394..421; canto sobe
        // 4, 2, 1, 1, 0 px). Era 32 com raio 3.
        className={`grid h-7 w-7 place-items-center rounded-md text-txt-secondary transition hover:bg-hov ${
          danger ? "hover:text-red" : "hover:text-txt-primary"
        }`}
      >
        {children}
      </button>
    </Tooltip>
  );
}

/**
 * Linha de referência da resposta, acima da mensagem: avatar miúdo, nome e o
 * começo da original. O traço em "L" à esquerda é o mesmo do Discord — é ele
 * que amarra visualmente a resposta à mensagem citada, e por isso ele sobe do
 * topo do avatar de 40px (x≈40) até encostar na calha do conteúdo (x=80).
 *
 * Passar o mouse na linha inteira **destaca a original** na timeline: é o que
 * responde "a qual mensagem isso responde?" sem tirar ninguém do lugar.
 */
function ReplyReference({ message }: { message: Message }) {
  const ref = message.replyTo;
  const cor = useAuthorColor(ref?.author.id ?? "");
  if (!ref) return null;

  function realcar(ligado: boolean) {
    const el = document.getElementById(`mensagem-${ref!.id}`);
    // classe do Tailwind não serve: a original pode já ter fundo próprio
    // (menção, destaque do "ir para") e a cor precisa somar, não brigar
    if (el) el.style.backgroundColor = ligado ? "rgba(255,255,255,0.06)" : "";
  }

  function abrirPerfil(e: MouseEvent<HTMLElement>) {
    ui.openProfile(ref!.author, anchorOf(e.currentTarget));
  }

  return (
    <div
      onMouseEnter={() => realcar(true)}
      onMouseLeave={() => realcar(false)}
      className="relative flex items-center gap-1.5 pb-0.5 text-[13px] leading-[18px] text-txt-muted"
    >
      <span
        aria-hidden="true"
        className="absolute -left-10 bottom-[8px] h-3 w-10 rounded-tl-[6px] border-l-2 border-t-2 border-border-strong"
      />
      <button
        type="button"
        onClick={abrirPerfil}
        aria-label={`Perfil de ${displayNameOf(ref.author)}`}
        className="shrink-0 rounded-full transition hover:brightness-110"
      >
        <Avatar user={ref.author} size="xs" />
      </button>
      <button
        type="button"
        onClick={abrirPerfil}
        style={cor ? { color: cor } : undefined}
        className="shrink-0 font-medium text-txt-secondary hover:underline"
      >
        @{displayNameOf(ref.author)}
      </button>
      <button
        type="button"
        onClick={() =>
          void goToMessage({
            guildId: message.guildId,
            channelId: message.channelId,
            messageId: ref.id,
          })
        }
        className="flex min-w-0 items-center gap-1 truncate text-left hover:text-txt-normal"
      >
        {ref.content ? (
          ref.content
        ) : ref.hasAttachments ? (
          <>
            <ImageIcon size={14} aria-hidden="true" className="shrink-0" />
            <span className="italic">Clique para ver o anexo</span>
          </>
        ) : (
          <span className="italic text-txt-faint">Mensagem apagada</span>
        )}
      </button>
    </div>
  );
}

/**
 * Uma mensagem, no leiaute do Discord: avatar de 40px à esquerda, nome e hora na
 * primeira linha, corpo (markdown, menções, prévia de link) abaixo. Quando
 * `grouped`, é a continuação da anterior (mesmo autor, poucos minutos) e só
 * mostra o corpo, com a hora na margem ao passar o mouse.
 */
/** Sem cargos: referência estável, para o seletor do zustand não oscilar. */
const SEM_CARGOS: string[] = [];

/** Reações rápidas da mini-barra (o Discord mostra três). */
const RAPIDAS_NA_BARRA = 3;
/** Reações rápidas dentro do submenu "Adicionar Reação". */
const RAPIDAS_NO_MENU = 6;
/** Quantas cabem na fileira horizontal do topo do menu (é o número do print). */
const RAPIDAS_NA_FILEIRA = 4;

export default function MessageItem({
  message,
  grouped = false,
  primeiro = false,
  threadId = null,
  currentUserId,
  canModerate,
  onEdit,
  onDelete,
  onToggleReaction,
  onOpenThread,
  onRetry,
  onDiscard,
}: {
  message: ChatMessage;
  grouped?: boolean;
  /** primeiro item desenhado na lista: a mini-barra não pode sair por cima. */
  primeiro?: boolean;
  /** id da thread quando a lista é o painel de thread — escopo do "Responder". */
  threadId?: string | null;
  currentUserId?: string;
  canModerate?: boolean;
  onEdit: (id: string, content: string) => void;
  onDelete: (id: string, semConfirmar?: boolean) => void;
  onToggleReaction: (id: string, emoji: string) => void;
  /** ausente dentro do painel de thread (não se responde a uma resposta). */
  onOpenThread?: (message: Message) => void;
  /** reenvia uma mensagem otimista que o servidor não confirmou. */
  onRetry?: (nonce: string) => void;
  /** descarta uma mensagem otimista que o servidor não confirmou. */
  onDiscard?: (nonce: string) => void;
}) {
  // a edição mora na store: quem a abre pode ser o `↑` do composer
  const editing = useMessages((s) => s.editingId === message.id);
  const startEditing = useMessages((s) => s.startEditing);
  const stopEditing = useMessages((s) => s.stopEditing);
  const [draft, setDraft] = useState(message.content);
  /** âncora do seletor de emoji (reação ou edição); null = fechado. */
  const [picker, setPicker] = useState<{ alvo: "reacao" | "edicao"; ancora: Anchor } | null>(null);

  const author = useLiveUser(message.author);
  // nome do autor na cor do seu cargo mais alto, como no Discord
  const corDoAutor = useAuthorColor(message.author.id);
  const me = useAuth((s) => s.user);
  // ── c-cargos ── cargos do servidor (para desenhar `<@&id>`) e os meus
  const roles = usePermissions((s) => s.roles);
  const meusCargos = useGuilds((s) => s.members.find((m) => m.user.id === me?.id)?.roleIds ?? SEM_CARGOS);
  // ── e-configuracoes ── aparência/acessibilidade vêm da store de preferências
  const compacto = useSettings((s) => s.compactMode);
  const sempreHora = useSettings((s) => s.alwaysShowTime);
  const tamanhoEmoji = useSettings((s) => s.emojiSize);
  // "Copiar ID" só existe com o Modo Desenvolvedor ligado, como no Discord
  const modoDesenvolvedor = useSettings((s) => s.developerMode);
  const members = useGuilds((s) => s.members);
  const highlighted = useMessages((s) => s.highlightId === message.id);
  const startReply = useMessages((s) => s.startReply);
  const frequentes = useFrequentes(RAPIDAS_NO_MENU);
  // @usuario → nome de exibição, para as menções mostrarem o nome como o Discord
  const displayNames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const m of members) map[m.user.username.toLowerCase()] = displayNameOf(m.user);
    return map;
  }, [members]);
  // quem reagiu: os membros do servidor mais o autor (basta para o tooltip)
  const conhecidos = useMemo(() => {
    const map = new Map<string, PublicUser>();
    for (const m of members) map.set(m.user.id, m.user);
    map.set(message.author.id, message.author);
    if (me) map.set(me.id, me);
    return map;
  }, [members, message.author, me]);

  const isOwn = message.author.id === currentUserId;
  // sem confirmação do servidor a mensagem ainda não tem id real: editar,
  // apagar ou reagir não teriam a que se referir
  const unconfirmed = Boolean(message.pending || message.failed);
  const sistema = isSystemMessage(message);
  const canDelete = isOwn || Boolean(canModerate);
  // em conversa direta não há moderação: qualquer participante fixa (como no Discord)
  const canPin = message.guildId === null || Boolean(canModerate);

  // Prévia de link: uma URL só, a primeira. `suppressEmbeds` desliga a prévia
  // desta mensagem (item do menu, para o autor e a moderação); vídeo do YouTube
  // vira player e imagem direta vira a própria imagem — nos dois casos o card
  // de Open Graph não acrescentaria nada.
  const url =
    unconfirmed || sistema || message.suppressEmbeds ? null : extractFirstUrl(message.content);
  const videoId = url ? youtubeVideoId(url) : null;
  const imagemDireta = url && !videoId && isDirectImageUrl(url) ? url : null;
  const embed = useLinkEmbed(videoId || imagemDireta ? null : url);

  // abrir a edição pelo `↑` do composer não passa por `startEdit`: o rascunho
  // precisa ser semeado quando o estado da store vira este id
  useEffect(() => {
    if (editing) setDraft(message.content);
  }, [editing, message.content]);

  function submitEdit() {
    const t = draft.trim();
    if (t && t !== message.content) onEdit(message.id, t);
    stopEditing();
  }

  function startEdit() {
    setDraft(message.content);
    startEditing(message.id);
  }

  function openProfile(e: MouseEvent<HTMLElement>) {
    ui.openProfile(author, anchorOf(e.currentTarget));
  }

  function copiarLink() {
    const caminho = messageLinkPath(message.guildId, message.channelId, message.id);
    const url = typeof window === "undefined" ? caminho : `${window.location.origin}${caminho}`;
    void navigator.clipboard?.writeText(url);
    ui.toast("Link da mensagem copiado");
  }

  function responder() {
    startReply(message, threadId);
  }

  function reagir(emoji: string) {
    registrarUsoDeReacao(emoji);
    onToggleReaction(message.id, emoji);
  }

  function abrirSeletorDeReacao(e: MouseEvent<HTMLElement>) {
    setPicker({ alvo: "reacao", ancora: anchorOf(e.currentTarget) });
  }

  function alternarFixada() {
    const pins = usePins.getState();
    if (message.pinned) void pins.unpin(message.channelId, message.id);
    else void pins.pin(message.channelId, message.id);
  }

  async function criarThread() {
    const thread = await useThreads
      .getState()
      .create(message.channelId, message.id, message.content);
    if (thread) onOpenThread?.(message);
  }

  /** "Marcar como não lida": o divisor vermelho volta para cima desta mensagem. */
  function marcarNaoLida() {
    useMarcadorNaoLido.getState().marcarNaoLidaAPartirDe(message.channelId, message.createdAt);
    ui.toast("Marcado como não lido a partir daqui");
  }

  /**
   * Destinos de "Encaminhar": as conversas diretas e os canais de texto do
   * servidor aberto. Encaminhar reenvia o **texto** — os anexos ficam presos à
   * mensagem original (ver relatório de pendências).
   */
  function destinosParaEncaminhar(): MenuItem[] {
    const eu = useAuth.getState().user;
    if (!eu) return [];
    const send = useMessages.getState().send;
    const conversas = useDMs.getState().channels.slice(0, 8);
    const canais = useChannels
      .getState()
      .channels.filter((c) => c.type === "TEXT" && c.id !== message.channelId)
      .slice(0, 8);
    const encaminhar = (channelId: string, guildId: string | null, nome: string) => () => {
      send({ channelId, guildId, author: eu, content: message.content });
      ui.toast(`Mensagem encaminhada para ${nome}`);
    };
    return [
      ...conversas.map<MenuItem>((d) => ({
        label: dmTitle(d),
        onSelect: encaminhar(d.id, null, dmTitle(d)),
      })),
      ...(conversas.length && canais.length ? [{ separator: true } as MenuItem] : []),
      ...canais.map<MenuItem>((c) => ({
        label: `#${c.name ?? "canal"}`,
        icon: <Hash size={18} />,
        onSelect: encaminhar(c.id, c.guildId, `#${c.name ?? "canal"}`),
      })),
    ];
  }

  /** Submenu de reação: os emojis frequentes e a porta para o seletor completo. */
  function submenuDeReacao(ancora: Anchor): MenuItem[] {
    return [
      ...frequentes.map<MenuItem>((emoji) => ({
        label: rotuloDaReacao(emoji),
        icon: <EmojiDaReacao emoji={emoji} tamanho={18} />,
        onSelect: () => reagir(emoji),
      })),
      { separator: true },
      {
        label: "Mais emojis…",
        icon: <SmilePlus size={18} />,
        onSelect: () => setPicker({ alvo: "reacao", ancora }),
      },
    ];
  }

  function openMenu(e: MouseEvent) {
    if (unconfirmed) return;
    e.preventDefault();
    const ancora: Anchor = { x: e.clientX, y: e.clientY, width: 0, height: 0 };
    const items: MenuItem[] = [];

    if (!sistema) {
      // A fileira horizontal é a primeira coisa do menu no Discord: quatro
      // alvos do mesmo peso, escolhidos pela cara do emoji. Como itens comuns
      // eles viravam quatro linhas de texto, onde o desenho é o que identifica.
      items.push({
        reacoes: frequentes.slice(0, RAPIDAS_NA_FILEIRA).map((emoji) => ({
          chave: emoji,
          rotulo: rotuloDaReacao(emoji),
          nodo: <EmojiDaReacao emoji={emoji} tamanho={20} />,
          onSelect: () => reagir(emoji),
        })),
      });
      items.push({
        label: "Adicionar Reação",
        icon: <SmilePlus size={18} />,
        submenu: submenuDeReacao(ancora),
      });
      if (isOwn) items.push({ label: "Editar Mensagem", icon: <Pencil size={18} />, onSelect: startEdit });
      if (canPin) {
        items.push({
          label: message.pinned ? "Desafixar Mensagem" : "Fixar Mensagem",
          icon: message.pinned ? <PinOff size={18} /> : <Pin size={18} />,
          onSelect: alternarFixada,
        });
      }
      items.push({ label: "Responder", icon: <CornerUpLeft size={18} />, onSelect: responder });
      const destinos = destinosParaEncaminhar();
      if (destinos.length > 0) {
        items.push({ label: "Encaminhar", icon: <CornerUpRight size={18} />, submenu: destinos });
      }
      if (onOpenThread) {
        items.push({
          label: message.thread ? "Ver Tópico" : "Criar Tópico",
          icon: <MessageSquare size={18} />,
          onSelect: () => (message.thread ? onOpenThread(message) : void criarThread()),
        });
      }
      items.push({ separator: true });
      items.push({
        label: "Copiar Texto",
        icon: <Copy size={18} />,
        disabled: !message.content,
        onSelect: () => void navigator.clipboard?.writeText(message.content),
      });
    }

    items.push({ label: "Marcar Não Lida", icon: <MailOpen size={18} />, onSelect: marcarNaoLida });
    items.push({ label: "Copiar Link", icon: <Link2 size={18} />, onSelect: copiarLink });
    // só faz sentido quando há link, e só o autor/moderação pode mexer
    if (!sistema && (isOwn || canModerate) && extractFirstUrl(message.content)) {
      items.push({
        label: message.suppressEmbeds ? "Mostrar Prévia do Link" : "Remover Prévia do Link",
        icon: <EyeOff size={18} />,
        onSelect: () =>
          emit(WS_EVENTS.MESSAGE_SUPPRESS_EMBEDS, {
            messageId: message.id,
            suppress: !message.suppressEmbeds,
          }),
      });
    }

    if (canDelete || !isOwn) items.push({ separator: true });
    if (canDelete) {
      items.push({
        label: "Apagar Mensagem",
        icon: <Trash2 size={18} />,
        danger: true,
        // Shift pula a confirmação, como no Discord
        onSelect: () => onDelete(message.id, shiftPressionado()),
      });
    }
    // ── h-moderacao ──
    if (!isOwn) {
      items.push({
        label: "Denunciar Mensagem",
        icon: <Flag size={18} />,
        onSelect: () =>
          ui.openModal({ kind: "report", messageId: message.id, preview: message.content }),
      });
    }
    // sempre o último item do menu
    if (modoDesenvolvedor) {
      items.push({ separator: true });
      items.push({
        label: "Copiar ID da Mensagem",
        onSelect: () => void navigator.clipboard?.writeText(message.id),
      });
    }
    ui.openContextMenu(e.clientX, e.clientY, items);
  }

  // menção a mim: `@usuario`, um cargo meu (`<@&id>`) ou resposta minha com o
  // "@ ligado" — a regra mora no contrato para os dois lados não divergirem
  const mentionsMe = !!me && !isOwn && ehMencaoParaMim(message, { ...me, roleIds: meusCargos });

  const fundo = highlighted
    ? "bg-accent/20 hover:bg-accent/25"
    : mentionsMe
      ? "border-l-2 border-yellow bg-yellow/10 hover:bg-yellow/15"
      : "hover:bg-msghov";

  // narração do canal (fixar, entrada de membro, eventos de grupo): é o mesmo
  // componente que a timeline usa, para não haver duas versões do mesmo texto
  if (sistema) {
    return (
      <SystemMessageItem
        message={message}
        grouped={grouped}
        currentUserId={currentUserId}
        onToggleReaction={onToggleReaction}
        onMenu={openMenu}
      />
    );
  }

  return (
    <div
      id={`mensagem-${message.id}`}
      onContextMenu={openMenu}
      // o respiro entre grupos é preferência do usuário (aba Aparência)
      style={
        grouped && !message.replyTo
          ? undefined
          : { marginTop: "var(--espaco-entre-grupos, 17px)" }
      }
      // sem `transition-colors`: o Discord troca o fundo no mesmo quadro, e a
      // transição fazia o realce "arrastar" atrás do cursor ao correr a lista
      className={`group relative flex py-0.5 pr-12 ${
        compacto ? "gap-1.5 pl-4" : "gap-4 pl-[80px]"
      } ${fundo} ${message.pending ? "opacity-60" : ""}`}
    >
      {compacto ? null : grouped && !message.replyTo ? (
        // hora na calha, alinhada à direita e só no hover — como o Discord faz
        // com mensagens agrupadas
        <span
          className={`absolute left-0 top-1 w-14 select-none pr-0 text-right text-[11px] leading-[22px] text-txt-muted ${
            sempreHora ? "" : "opacity-0"
          } group-hover:opacity-100`}
        >
          {hora(message.createdAt)}
        </span>
      ) : (
        <button
          type="button"
          onClick={openProfile}
          aria-label={`Perfil de ${displayNameOf(author)}`}
          className={`absolute left-5 rounded-full transition hover:brightness-110 ${
            message.replyTo ? "top-[26px]" : "top-0.5"
          }`}
        >
          <Avatar user={author} size="lg" />
        </button>
      )}

      <div className="min-w-0 flex-1">
        <ReplyReference message={message} />

        {(!grouped || message.replyTo) && !compacto && (
          <div className="flex items-baseline gap-1.5 leading-[22px]">
            <button
              type="button"
              onClick={openProfile}
              style={corDoAutor ? { color: corDoAutor } : undefined}
              // 600, não 500: no print da DM (`142337.png`) a haste do "d"
              // de "Md" tem 2,1px contra 1,45px do "l" do corpo — a razão do
              // semibold (0,13em contra 0,09em em 16px); o medium daria ~1,75
              className="font-semibold text-txt-primary hover:underline"
            >
              {displayNameOf(author)}
            </button>
            <Tooltip label={dataCompleta(message.createdAt)}>
              <span className="ml-1 text-xs text-txt-muted">{horaCompleta(message.createdAt)}</span>
            </Tooltip>
          </div>
        )}

        {editing ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submitEdit();
            }}
            className="mt-1"
          >
            <div className="relative">
              <textarea
                autoFocus
                rows={Math.min(8, Math.max(1, draft.split("\n").length))}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") stopEditing();
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    submitEdit();
                  }
                }}
                aria-label="Editar mensagem"
                className="w-full resize-none rounded-lg bg-input py-[11px] pl-4 pr-12 text-txt-normal outline-none"
              />
              {/* o Discord mantém o emoji também na caixa de edição */}
              <button
                type="button"
                onClick={(e) => setPicker({ alvo: "edicao", ancora: anchorOf(e.currentTarget) })}
                aria-label="Emoji"
                className="absolute right-2 top-1.5 grid h-8 w-8 place-items-center text-txt-secondary transition hover:text-txt-primary"
              >
                <Smile size={22} />
              </button>
            </div>
            <div className="mt-1 text-xs text-txt-muted">
              escape para{" "}
              <button type="button" onClick={stopEditing} className="text-txt-link hover:underline">
                cancelar
              </button>{" "}
              • enter para{" "}
              <button type="submit" className="text-txt-link hover:underline">
                salvar
              </button>
            </div>
          </form>
        ) : (
          message.content && (
            <div className={`break-words text-txt-normal ${compacto ? "flex gap-1.5" : ""}`}>
              {compacto && (
                <>
                  <span className="shrink-0 text-[11px] leading-[22px] text-txt-muted">
                    {hora(message.createdAt)}
                  </span>
                  <button
                    type="button"
                    onClick={openProfile}
                    className="shrink-0 font-medium text-txt-primary hover:underline"
                  >
                    {displayNameOf(author)}
                  </button>
                </>
              )}
              <div className={compacto ? "min-w-0 flex-1" : undefined}>
                <Markdown
                  text={message.content}
                  meUsername={me?.username}
                  displayNames={displayNames}
                  roles={roles}
                  myRoleIds={meusCargos}
                />
                {message.editedAt && (
                  <span className="ml-1 text-[10px] text-txt-muted" title={horaCompleta(message.editedAt)}>
                    (editado)
                  </span>
                )}
              </div>
            </div>
          )
        )}

        {/* ordem do Discord: conteúdo → enquete → anexos → embeds → reações → thread */}
        {message.sticker && <StickerView sticker={message.sticker} />}
        {/* h-moderacao: a enquete é uma face da mensagem, não um bloco à parte */}
        {message.poll && (
          <PollCard poll={message.poll} canModerate={Boolean(canModerate)} isAuthor={isOwn} />
        )}
        <MediaGroup attachments={message.attachments} />
        {videoId && <YouTubeEmbed videoId={videoId} title={message.content} />}
        {imagemDireta && (
          <button
            type="button"
            onClick={() =>
              ui.openModal({ kind: "galeria", urls: [imagemDireta], alts: ["Imagem"], indice: 0 })
            }
            className="mt-1 block w-fit cursor-zoom-in overflow-hidden rounded-lg"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imagemDireta}
              alt="Imagem do link"
              loading="lazy"
              className="max-h-[350px] max-w-[550px] object-contain"
            />
          </button>
        )}
        {embed && <LinkEmbedCard embed={embed} />}

        {message.reactions.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {message.reactions.map((r) => {
              const mine = currentUserId ? r.userIds.includes(currentUserId) : false;
              return (
                <TooltipReacao
                  key={r.emoji}
                  emoji={r.emoji}
                  userIds={r.userIds}
                  conhecidos={conhecidos}
                >
                  <button
                    type="button"
                    aria-pressed={mine}
                    aria-label={`${rotuloDaReacao(r.emoji)}, ${r.count} ${r.count === 1 ? "reação" : "reações"}`}
                    onClick={() => reagir(r.emoji)}
                    style={{ height: alturaDoChipDeReacao(tamanhoEmoji) }}
                    className={`flex items-center gap-1.5 rounded-lg border px-1.5 transition ${
                      mine
                        ? "border-accent bg-accent/20 text-txt-primary"
                        : "border-transparent bg-panel text-txt-normal hover:border-border-strong"
                    }`}
                  >
                    <EmojiDaReacao emoji={r.emoji} tamanho={tamanhoEmoji} />
                    <span className="text-sm font-semibold leading-none">{r.count}</span>
                  </button>
                </TooltipReacao>
              );
            })}
            <Tooltip label="Adicionar reação">
              <button
                type="button"
                onClick={abrirSeletorDeReacao}
                aria-label="Adicionar reação"
                // mesma altura dos chips ao lado, inclusive quando o emoji cresce
                style={{ height: alturaDoChipDeReacao(tamanhoEmoji) }}
                className="grid min-w-[2.375rem] place-items-center rounded-lg border border-transparent bg-panel px-1.5 text-txt-muted opacity-0 transition hover:border-border-strong hover:text-txt-primary group-hover:opacity-100"
              >
                <SmilePlus size={16} />
              </button>
            </Tooltip>
          </div>
        )}

        {onOpenThread && (message.thread || message.replyCount > 0) && (
          <button
            type="button"
            onClick={() => onOpenThread(message)}
            className="mt-1 flex w-fit items-center gap-1.5 rounded-[4px] py-0.5 text-sm font-medium text-txt-link hover:underline"
          >
            {message.thread && message.thread.participants.length > 0 && (
              <span className="flex -space-x-1.5" aria-hidden="true">
                {message.thread.participants.map((p) => (
                  <Avatar key={p.id} user={p} size="xs" className="ring-2 ring-chat" />
                ))}
              </span>
            )}
            <MessageSquare size={16} aria-hidden="true" />
            {message.thread ? (
              <>
                <span className="text-txt-primary">{message.thread.name}</span>
                {message.thread.archived && (
                  <span className="text-xs font-normal text-txt-muted">(arquivada)</span>
                )}
              </>
            ) : (
              `${message.replyCount} ${message.replyCount === 1 ? "resposta" : "respostas"}`
            )}
            <span className="font-normal text-txt-muted">›</span>
          </button>
        )}

        {message.failed && message.nonce && (
          <div className="mt-1 flex items-center gap-2 text-xs text-red">
            <span>Não foi possível enviar.</span>
            <button
              type="button"
              onClick={() => onRetry?.(message.nonce as string)}
              className="rounded-[3px] bg-panel px-2 py-0.5 font-medium text-txt-normal hover:text-txt-primary"
            >
              Reenviar
            </button>
            <button
              type="button"
              onClick={() => onDiscard?.(message.nonce as string)}
              className="rounded-[3px] px-1 py-0.5 text-txt-muted hover:text-txt-primary"
            >
              Descartar
            </button>
          </div>
        )}
      </div>

      {/*
        Mini-barra, como no print: as reações rápidas, "Adicionar reação",
        responder/editar, encaminhar e o "…". Fixar, denunciar e apagar moram
        dentro do "…" — nove ícones em fila viravam uma régua ilegível.
        No primeiro item da lista ela desce para dentro da linha: subindo, seria
        cortada pelo topo da área rolável.

        Medidas do Discord (`2026-08-31 124022.png`, barra em x ..1252,
        y 391..424): 34px de altura = borda 1 + 2 + botão 28 + 2 + borda 1;
        raio 8 (canto sobe 4, 3, 2, 1, 0); borda de 1px **mais clara** que o
        fundo da barra (50 contra 36), não a `black/20` escura de antes — daí o
        token `border`, que já é a divisória do app; termina 14px antes da
        borda da linha e começa 25px acima do topo dela (entra 9 na linha).
      */}
      {!unconfirmed && !editing && (
        <div
          className={`absolute right-3.5 ${
            primeiro ? "top-0.5" : "-top-[25px]"
          } hidden rounded-lg border border-border bg-chat p-0.5 shadow-high group-focus-within:flex group-hover:flex`}
        >
          {frequentes.slice(0, RAPIDAS_NA_BARRA).map((emoji) => (
            <ActionButton
              key={emoji}
              label={`Reagir com ${rotuloDaReacao(emoji)}`}
              onClick={() => reagir(emoji)}
            >
              <EmojiDaReacao emoji={emoji} tamanho={20} />
            </ActionButton>
          ))}
          <ActionButton label="Adicionar reação" onClick={abrirSeletorDeReacao}>
            <SmilePlus size={20} />
          </ActionButton>
          {isOwn ? (
            <ActionButton label="Editar" onClick={startEdit}>
              <Pencil size={20} />
            </ActionButton>
          ) : (
            <ActionButton label="Responder" onClick={responder}>
              <CornerUpLeft size={20} />
            </ActionButton>
          )}
          {/* Encaminhar tem casa própria na barra do print, e não só dentro do
              "…": é uma das quatro coisas que se faz com a mensagem do outro.
              Abre a mesma lista de destinos do menu, ancorada no botão. */}
          <ActionButton
            label="Encaminhar"
            onClick={(e) => {
              const destinos = destinosParaEncaminhar();
              if (destinos.length === 0) {
                ui.toast("Não há para onde encaminhar ainda");
                return;
              }
              const r = e.currentTarget.getBoundingClientRect();
              ui.openContextMenu(r.left, r.bottom, destinos);
            }}
          >
            <CornerUpRight size={20} />
          </ActionButton>
          <ActionButton label="Mais" onClick={openMenu}>
            <MoreHorizontal size={20} />
          </ActionButton>
        </div>
      )}

      {picker && (
        <PainelFlutuante ancora={picker.ancora} onClose={() => setPicker(null)}>
          <EmojiPicker
            placeholder={
              picker.alvo === "reacao" ? "Encontre a reação perfeita" : "Encontre o emoji perfeito"
            }
            onClose={() => setPicker(null)}
            onPick={(texto, custom) => {
              if (picker.alvo === "edicao") {
                setDraft((d) => d + (custom ? `:${custom.name}:` : texto));
              } else {
                reagir(texto);
              }
              setPicker(null);
            }}
          />
        </PainelFlutuante>
      )}
    </div>
  );
}
