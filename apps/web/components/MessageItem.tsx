"use client";

import { useEffect, useMemo, useState, type MouseEvent } from "react";
import {
  Copy,
  CornerUpLeft,
  CornerUpRight,
  EyeOff,
  Flag,
  Hash,
  Link2,
  MailOpen,
  MessageSquare,
  Pencil,
  Pin,
  PinOff,
  ScrollText,
  Smile,
  SmilePlus,
  Trash2,
  Vote,
} from "@/components/ui/icones";
import type { Message, PublicUser } from "@streamz/shared";
import {
  Permission,
  WS_EVENTS,
  displayNameOf,
  extractFirstUrl,
  isDirectImageUrl,
  isSystemMessage,
  mentionsMe as ehMencaoParaMim,
  messageLinkPath,
  youtubeVideoId,
} from "@streamz/shared";
import LinkEmbedCard, { useLinkEmbed } from "@/components/chat/LinkEmbedCard";
import InviteEmbed from "@/components/chat/InviteEmbed";
import { codigoDeConviteDaUrl } from "@/lib/links-de-convite";
import { urlPublica } from "@/lib/links-do-app";
import PainelFlutuante from "@/components/chat/PainelFlutuante";
import { ehMobileAgora, useEhMobile } from "@/hooks/useEhMobile";
import { useMarcadorNaoLido } from "@/components/chat/marcador-nao-lido";
import { EmojiDaReacao, rotuloDaReacao } from "@/components/chat/EmojiDeReacao";
import { registrarUsoDeReacao, useFrequentes } from "@/components/chat/reacoes-rapidas";
import { shiftPressionado } from "@/components/chat/tecla-shift";
import BarraDeAcoes from "@/components/chat/mensagem/BarraDeAcoes";
import { fundoDaLinha } from "@/components/chat/mensagem/fundo";
import PilulaDeReacao from "@/components/chat/mensagem/PilulaDeReacao";
import { ReferenciaDeInteracao, ReferenciaDeResposta } from "@/components/chat/mensagem/ReferenciaDaMensagem";
import RodapeEfemero from "@/components/chat/mensagem/RodapeEfemero";
// ── onda 3 ── mensagens de bot
import PensandoDoBot from "@/components/chat/mensagem/PensandoDoBot";
import EmbedDeBot from "@/components/chat/bot/EmbedDeBot";
import ComponentesDaMensagem from "@/components/chat/bot/ComponentesDaMensagem";
import {
  anexosVisiveis,
  ehComponentsV2,
  embedsSuprimidos,
  embedsVisiveis,
  estaPensando,
} from "@/components/chat/bot/embed-layout";
import MediaGroup from "@/components/media/MediaGroup";
import { itensDaImagem } from "@/components/media/menu-da-imagem";
import StickerView from "@/components/media/StickerView";
import YouTubeEmbed from "@/components/media/YouTubeEmbed";
// ── h-moderacao ──
import PollCard from "@/components/polls/PollCard";
import { emit } from "@/stores/socket-adapter";
import Avatar from "@/components/ui/Avatar";
import EmojiPicker from "@/components/ui/EmojiPicker";
import TagDeBot from "@/components/ui/TagDeBot";
import { BotaoDeIcone, Button, TextArea, Tooltip } from "@/components/ui/primitivos";
import { confirmacaoLembrada } from "@/lib/confirmacao-lembrada";
import { dataCompleta, hora, horaCompleta } from "@/lib/format";
import { Markdown } from "@/lib/markdown";
import { useAuth } from "@/stores/auth";
import { useChannels } from "@/stores/channels";
import { dmTitle, useDMs } from "@/stores/dms";
import { useGuilds } from "@/stores/guilds";
import { useAuthorColor, usePermissions, usePodeTalvez } from "@/stores/permissions";
import { useMessages } from "@/stores/messages";
import SystemMessageItem from "@/components/chat/SystemMessageItem";
import { usePins } from "@/stores/messages-pins";
import { useThreads } from "@/stores/messages-threads";
import { alturaDoChipDeReacao, useSettings } from "@/stores/settings";
import type { ChatMessage } from "@/stores/messages-core";
import { useLiveUser } from "@/stores/presence";
import { anchorOf, ui, useUI, type Anchor, type MenuItem } from "@/stores/ui";

/** Sem cargos: referência estável, para o seletor do zustand não oscilar. */
const SEM_CARGOS: string[] = [];

/** Reações rápidas da barra de hover (três no print `2026-08-31 111402.png`). */
const RAPIDAS_NA_BARRA = 3;
/** Reações rápidas dentro do submenu "Adicionar reação". */
const RAPIDAS_NO_MENU = 6;
/** Quantas cabem na fileira horizontal do topo do menu (é o número do print). */
const RAPIDAS_NA_FILEIRA = 4;

/** Dono do menu de contexto aberto sobre esta mensagem (ver `selecionada`). */
const donoDoMenu = (id: string) => `mensagem:${id}`;

/**
 * Uma mensagem, no leiaute do Discord (módulos `.message__5126c` e
 * `.cozy_/.compact_c19a55` do CSS bruto, prints 1:1 `2026-08-31 111402.png` e
 * `124022.png`).
 *
 * **Cozy** (padrão): avatar de 40px à esquerda, nome e hora na primeira linha,
 * corpo abaixo. Quando `grouped` (mesmo autor, poucos minutos), é continuação:
 * só o corpo, com a hora curta na calha ao passar o mouse.
 * **Compacto:** tudo numa linha — hora de largura fixa, nome, texto —, sem
 * avatar, e o texto que quebra volta para a calha de 80px (recuo pendurado).
 * No compacto toda mensagem mostra hora e nome; o agrupamento só decide o
 * respiro entre grupos.
 *
 * Geometria da linha:
 * - calha: avatar em x=20 e conteúdo em x=80 (print 111402: painel em 375,
 *   avatar em 395, texto em 455; divisor de data em 391 = 375 + 16, que é a
 *   margem do divisor, `.divider__5126c {margin-inline: 1rem .875rem}`). O CSS
 *   dá 16/72 (`--space-md`), o print dá 20/80 — vale o print.
 * - respiro vertical: `padding-block: .125rem` (2px) nos dois modos
 *   (`--custom-message-spacing-vertical-container-cozy`,
 *   `--custom-message-padding-vertical-container-compact`).
 * - direita: `padding-inline-end: --space-xl` (24px) e raio `--radius-xs` (4px)
 *   nos cantos da direita (`.message__5126c`).
 * - início de grupo: `margin-top: --custom-group-spacing-start` (1.0625rem =
 *   17px no `group-spacing-16` padrão, que aqui é a preferência
 *   `--espaco-entre-grupos`) e, no cozy, `min-height: 2.75rem`
 *   (`.cozyMessage__5126c.groupStart__5126c`).
 * - enviando: `opacity: .5` (`.isSending_c19a55`); falhou: texto em
 *   `--text-feedback-critical` (`.isFailed_c19a55`).
 */
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
  /** primeiro item desenhado na lista: a barra de ações não pode sair por cima. */
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
  // nome do autor na cor do seu cargo mais alto, como no Discord — só em canal
  // de servidor: conversa e grupo não têm cargo, e o nome fica na cor padrão
  const corDoAutor = useAuthorColor(message.author.id, message.guildId);
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
  // o menu de contexto desta mensagem está aberto: a linha fica "selecionada"
  // (fundo de hover e barra à vista), como o `.selected__5126c` do Discord
  const selecionada = useUI((s) => s.contextMenu?.dono === donoDoMenu(message.id));
  const highlighted = useMessages((s) => s.highlightId === message.id);
  // é a mensagem que o composer está respondendo agora (`.replying__5126c`)
  const respondendo = useMessages((s) => s.replyTarget?.message.id === message.id);
  const startReply = useMessages((s) => s.startReply);
  const frequentes = useFrequentes(RAPIDAS_NO_MENU);
  // a barra de hover não existe no celular (ver o comentário onde ela é montada)
  const ehMobile = useEhMobile();

  // Sem permissão, a UI esconde o que a API recusaria. Em conversa direta não
  // há cargo nem bit: `useMyPermissions` responde 0 fora de servidor, e quem
  // participa da conversa pode reagir e escrever — daí o `guildId === null`.
  // `usePodeTalvez` devolve `null` enquanto as permissões do servidor carregam
  // (logo depois de trocar de servidor): só `false` esconde, senão reações e
  // "Responder" sumiam e voltavam a cada troca.
  const emServidor = message.guildId !== null;
  const escopo = { guildId: message.guildId, channelId: message.channelId };
  const podeReagirNoCanal = usePodeTalvez(Permission.ADD_REACTIONS, escopo);
  const podeEscreverNoCanal = usePodeTalvez(Permission.SEND_MESSAGES, escopo);
  const podeReagir = !emServidor || podeReagirNoCanal !== false;
  const podeResponder = !emServidor || podeEscreverNoCanal !== false;

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

  // ── onda 3 ── o que as flags do bot mudam na tela (contrato, §1.3):
  // `LOADING` troca o texto provisório por "<bot> está pensando…"; v2 é só
  // componentes (sem texto, embed, prévia nem anexo solto); `SUPPRESS_EMBEDS`
  // (flag ou coluna) desliga o embed rico **e** a prévia de link.
  const pensando = estaPensando(message);
  const componentsV2 = ehComponentsV2(message);
  const embedsDoBot = embedsVisiveis(message);
  const temComponentes = !pensando && (message.components?.length ?? 0) > 0;

  // Prévia de link: uma URL só, a primeira. `suppressEmbeds` desliga a prévia
  // desta mensagem (item do menu, para o autor e a moderação); vídeo do YouTube
  // vira player e imagem direta vira a própria imagem — nos dois casos o card
  // de Open Graph não acrescentaria nada.
  const url =
    unconfirmed || sistema || pensando || componentsV2 || embedsSuprimidos(message)
      ? null
      : extractFirstUrl(message.content);
  const videoId = url ? youtubeVideoId(url) : null;
  const imagemDireta = url && !videoId && isDirectImageUrl(url) ? url : null;
  // convite do nosso servidor vira cartão com botão "Entrar", não prévia de
  // link — ver `lib/links-de-convite.ts` (o host do app de desktop não é o
  // host público, e era isso que fazia o cartão sumir lá)
  const codigoDeConvite = url ? codigoDeConviteDaUrl(url) : null;
  const embed = useLinkEmbed(videoId || imagemDireta || codigoDeConvite ? null : url);

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
    // a origem é a pública, não a da janela: no desktop `window.location.origin`
    // é `http://tauri.localhost` e o link copiado não abria para mais ninguém
    const url = urlPublica(messageLinkPath(message.guildId, message.channelId, message.id));
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

  /** "Marcar como não lido": o divisor vermelho volta para cima desta mensagem. */
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

  /** "Encaminhar" da barra: a mesma lista do menu, ancorada no botão. */
  function encaminharPelaBarra(e: MouseEvent<HTMLButtonElement>) {
    const destinos = destinosParaEncaminhar();
    if (destinos.length === 0) {
      ui.toast("Não há para onde encaminhar ainda");
      return;
    }
    const r = e.currentTarget.getBoundingClientRect();
    // o menu pertence à mensagem: ela fica selecionada enquanto ele está aberto
    ui.openContextMenu(r.left, r.bottom, destinos, undefined, undefined, donoDoMenu(message.id));
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
      if (podeReagir) {
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
          label: "Adicionar reação",
          icon: <SmilePlus size={18} />,
          submenu: submenuDeReacao(ancora),
        });
      }
      if (isOwn) items.push({ label: "Editar mensagem", icon: <Pencil size={18} />, onSelect: startEdit });
      if (canPin) {
        items.push({
          label: message.pinned ? "Desafixar mensagem" : "Fixar mensagem",
          icon: message.pinned ? <PinOff size={18} /> : <Pin size={18} />,
          onSelect: alternarFixada,
        });
      }
      if (podeResponder) {
        items.push({ label: "Responder", icon: <CornerUpLeft size={18} />, onSelect: responder });
      }
      const destinos = destinosParaEncaminhar();
      if (destinos.length > 0) {
        items.push({ label: "Encaminhar", icon: <CornerUpRight size={18} />, submenu: destinos });
      }
      if (onOpenThread) {
        items.push({
          label: message.thread ? "Ver tópico" : "Criar tópico",
          icon: <MessageSquare size={18} />,
          onSelect: () => (message.thread ? onOpenThread(message) : void criarThread()),
        });
      }
      items.push({ separator: true });
      items.push({
        label: "Copiar texto",
        icon: <Copy size={18} />,
        disabled: !message.content,
        onSelect: () => void navigator.clipboard?.writeText(message.content),
      });
      /*
        **Selecionar um trecho** — o que no computador se faz arrastando o
        mouse. No telefone o toque longo sobre a mensagem já tem dono (esta
        folha, como no app do Discord: as capturas
        `discord-mobile-menu-mensagem*.png` mostram a folha cobrindo a mensagem
        e a cópia pelo item "Copy Text", sem seleção parcial nenhuma). Em vez de
        disputar o gesto, a seleção ganha porta própria: o item marca o corpo da
        mensagem e devolve a tela, com as alças nativas do sistema no lugar —
        daí arrastar e copiar são os gestos de sempre.

        `requestAnimationFrame` porque o `ContextMenu` fecha e chama o
        `onSelect` no mesmo tique: sem esperar o quadro, a folha ainda está por
        cima do texto que acabou de ser marcado.
      */
      if (ehMobileAgora()) {
        items.push({
          label: "Selecionar texto",
          icon: <ScrollText size={18} />,
          disabled: !message.content,
          onSelect: () =>
            requestAnimationFrame(() => {
              const corpo = document
                .getElementById(`mensagem-${message.id}`)
                ?.querySelector(".break-words");
              if (!corpo) return;
              const selecao = window.getSelection();
              selecao?.removeAllRanges();
              selecao?.selectAllChildren(corpo);
            }),
        });
      }
    }

    // rótulos do print 1:1 124022: só a primeira palavra em maiúscula, e o
    // texto inteiro do Discord ("Marcar como não lido", "Copiar link da mensagem")
    items.push({ label: "Marcar como não lido", icon: <MailOpen size={18} />, onSelect: marcarNaoLida });
    items.push({ label: "Copiar link da mensagem", icon: <Link2 size={18} />, onSelect: copiarLink });
    // só faz sentido quando há link, e só o autor/moderação pode mexer
    if (!sistema && (isOwn || canModerate) && extractFirstUrl(message.content)) {
      items.push({
        label: message.suppressEmbeds ? "Mostrar prévia do link" : "Remover prévia do link",
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
        label: "Apagar mensagem",
        icon: <Trash2 size={18} />,
        danger: true,
        // Shift pula a confirmação, como no Discord; e também quem marcou "não
        // perguntar de novo" na caixa (`lib/confirmacao-lembrada`)
        onSelect: () =>
          onDelete(message.id, shiftPressionado() || confirmacaoLembrada("apagar-mensagem")),
      });
    }
    // ── h-moderacao ──
    if (!isOwn) {
      items.push({
        label: "Denunciar mensagem",
        icon: <Flag size={18} />,
        onSelect: () =>
          ui.openModal({ kind: "report", messageId: message.id, preview: message.content }),
      });
    }
    // sempre o último item do menu
    if (modoDesenvolvedor) {
      items.push({ separator: true });
      items.push({
        label: "Copiar ID da mensagem",
        onSelect: () => void navigator.clipboard?.writeText(message.id),
      });
    }
    ui.openContextMenu(e.clientX, e.clientY, items, undefined, undefined, donoDoMenu(message.id));
  }

  // menção a mim: `@usuario`, um cargo meu (`<@&id>`) ou resposta minha com o
  // "@ ligado" — a regra mora no contrato para os dois lados não divergirem
  const mentionsMe = !!me && !isOwn && ehMencaoParaMim(message, { ...me, roleIds: meusCargos });

  // ── j-bots ── a faixa de resposta ou de comando de barra ocupa a primeira
  // linha do bloco: com ela, a mensagem nunca é desenhada como continuação
  const temFaixa = !!message.replyTo || !!message.interacao;
  const inicioDeGrupo = !grouped || temFaixa;

  // ── j-bots ── a mensagem efêmera: só eu a vejo, e a tela tem de dizer isso
  const efemera = !!message.efemera;

  const { fundo, faixa } = fundoDaLinha({
    destacada: highlighted,
    respondendo,
    mencionada: mentionsMe,
    selecionada,
    efemera,
  });

  // narração do canal (fixar, entrada de membro, eventos de grupo): é o mesmo
  // componente que a timeline usa, para não haver duas versões do mesmo texto
  if (sistema) {
    return (
      <SystemMessageItem
        message={message}
        grouped={grouped}
        primeiro={primeiro}
        currentUserId={currentUserId}
        destacada={highlighted}
        mencionada={mentionsMe}
        selecionada={selecionada}
        podeReagir={unconfirmed ? false : podeReagir}
        conhecidos={conhecidos}
        onToggleReaction={onToggleReaction}
        onMenu={openMenu}
      />
    );
  }

  const corDoTexto = message.failed ? "text-text-feedback-critical" : "text-text-default";

  const editado = message.editedAt && (
    <Tooltip rotulo={horaCompleta(message.editedAt)} larguraLivre>
      {/* `.edited_c19a55`: 10px (`.625rem`), peso normal, linha 1. No print
          111402 o "(editado)" começa 6px depois do fim do texto (x 955 → 961),
          o espaço de 4px mais o recuo dos glifos. */}
      <span className="ml-1 select-none text-[10px] font-normal leading-none text-text-muted">(editado)</span>
    </Tooltip>
  );

  // ── onda 3 ── "pensando" ignora o `content` (é o `TEXTO_PENSANDO` do
  // servidor); v2 não tem texto nenhum, mesmo que um payload velho traga
  /*
    "(editado)" e parágrafos em linha. No Discord o "(editado)" fica **na mesma
    linha** do fim do texto (print 111402: "…é individual (editado)", y=645) e,
    no compacto, o texto começa na linha do nome. Quem sabe desenhar isso é o
    próprio `Markdown`: `sufixo` entra dentro do último parágrafo e `emLinha`
    diz quais parágrafos ficam em linha — os dois no compacto (o primeiro
    continua a linha do nome), só o último no cozy.

    Sem jumbo no compacto: lá a mensagem só de emoji continua na linha do nome,
    do tamanho do emoji em linha — `.compact_c19a55 .messageContent_c19a55
    .jumboable` põe o emoji "jumbo" em `--custom-emoji-size-emoji` (1.375em).
  */
  const corpo = pensando ? (
    <PensandoDoBot nome={displayNameOf(author)} />
  ) : message.content && !componentsV2 ? (
    <Markdown
      text={message.content}
      meUsername={me?.username}
      displayNames={displayNames}
      roles={roles}
      myRoleIds={meusCargos}
      jumbo={compacto ? false : undefined}
      emLinha={compacto ? "ambos" : "ultimo"}
      sufixo={editado}
    />
  ) : null;

  /*
    Selo de enquete, depois da hora (cozy). Print
    `desenvolvedores/imagens/mensagens-de-bot/enquete.png` (1:1, tema antigo):
    pílula em x=205–266 e y=14–29 — 62×16 com o antisserrilhado —, o glifo de
    lista em x=214–223 e "POLL" em x=229–258, em caixa-alta e negrito, com a
    versal de 8px (y=18–25), a mesma altura da versal da hora ao lado ("T" em
    y=19–27), que é de 12px: daí `text-text-xs`. 6px de respiro de cada lado
    (o glifo de 12 tem 1px de folga dentro da caixa) e 4px entre glifo e texto.
    Do fim da hora (x=195) ao começo da pílula são 9–10px: o `gap-1.5` da linha
    mais o `margin-inline-start: .25rem` do
    `.cozy_c19a55 .pollBadgeDefault_c19a55`. A mesma animação `07.gif` do
    `polls-faq` mostra "≡ POLL" ao lado de "Today at 4:12 PM".
    Cor do fundo: **não medida** no tema atual (o `#393b41` do print é do tema
    antigo) — `background-mod-strong`, o chip neutro do CSS atual
    (`.clanTagChiplet_c19a55` compacto). Texto branco → `text-strong`.
  */
  const seloDeEnquete = (posicao: string) =>
    message.poll ? (
      <span
        className={`inline-flex h-4 shrink-0 items-center gap-1 rounded-full bg-background-mod-strong px-1.5 indent-0 text-text-xs font-bold uppercase leading-none text-text-strong ${posicao}`}
      >
        <Vote size={12} aria-hidden="true" />
        Enquete
      </span>
    ) : null;

  return (
    <div
      id={`mensagem-${message.id}`}
      /* ── j-bots ── a efêmera não tem menu: responder, reagir, fixar, copiar
         link, encaminhar e apagar apontariam todos para uma mensagem que não
         existe no canal. O gesto que ela tem é o "Dispensar" do rodapé. */
      onContextMenu={efemera ? undefined : openMenu}
      // o respiro entre grupos é preferência do usuário (aba Aparência)
      style={inicioDeGrupo ? { marginTop: "var(--espaco-entre-grupos, 17px)" } : undefined}
      // sem `transition-colors`: o Discord troca o fundo no mesmo quadro, e a
      // transição fazia o realce "arrastar" atrás do cursor ao correr a lista
      /*
        No celular a linha é mais estreita. Medido na captura
        `norm/discord-mobile-chat-canal.png` (390px): o texto e a mídia vão de
        x=62 a x=376. Com `celular:pl-[64px] celular:pr-3` a nossa coluna sai
        em 64 → 378, dentro de 2px da referência — e é isso que dá ao GIF a
        mesma largura que ele tem lá. O compacto não muda no celular: o app do
        Discord no telefone não tem modo compacto para medir.
      */
      className={`group relative rounded-r py-0.5 pl-[80px] pr-6 ${
        compacto ? "" : "celular:pl-[64px] celular:pr-3"
      } ${!compacto && inicioDeGrupo ? "min-h-[2.75rem]" : ""} ${fundo} ${
        message.pending ? "opacity-50" : ""
      }`}
    >
      {faixa && (
        <span aria-hidden="true" className={`pointer-events-none absolute inset-y-0 left-0 w-[2px] ${faixa}`} />
      )}

      {compacto ? null : !inicioDeGrupo ? (
        /* Hora curta na calha, só no hover (ou sempre, pela preferência).
           `.cozy_c19a55 .timestamp_c19a55.alt_c19a55`: absoluta em
           `inset-inline-start: 0`, largura 56px, alinhada à direita, 22px de
           altura e de linha, 11px (`.6875rem`), `--text-muted`, peso `medium`
           (`.timestamp_c19a55`). O topo é o da primeira linha do texto (o
           respiro de 2px da linha), por isso `top-0.5`. */
        <Tooltip
          rotulo={dataCompleta(message.createdAt)}
          larguraLivre
          className={`absolute left-0 top-0.5 h-[22px] w-14 select-none justify-end text-[11px] font-medium leading-[22px] text-text-muted ${
            sempreHora ? "" : "opacity-0"
          } group-hover:opacity-100`}
        >
          <span>{hora(message.createdAt)}</span>
        </Tooltip>
      ) : (
        <button
          type="button"
          onClick={openProfile}
          aria-label={`Perfil de ${displayNameOf(author)}`}
          /* 40px (`--custom-message-avatar-size`). Topo: no print 111402 a
             caixa-alta do nome fica 3px abaixo do topo do avatar ("Md": avatar
             em y=398, "M" em 401); na nossa captura, 2px — diferença dentro do
             antisserrilhado da borda escura, então fica em 2px. Com faixa de
             referência ele desce 18 + 4 da linha e mais os 2 do topo (26).
             `:active` desce 1px (`.avatar_c19a55.clickable_c19a55:active`).
             O avatar acompanha a calha mais estreita do celular (x=12). */
          className={`absolute left-5 rounded-full active:translate-y-px celular:left-3 ${
            temFaixa ? "top-[26px]" : "top-0.5"
          }`}
        >
          <Avatar user={author} size="lg" />
        </button>
      )}

      <div className="min-w-0">
        <ReferenciaDeResposta message={message} compacto={compacto} />
        <ReferenciaDeInteracao message={message} compacto={compacto} />

        {compacto ? (
          /* Compacto (`.compact_c19a55`): a linha tem `padding-inline-start:
             5rem` (80) e o bloco, `text-indent: -(5rem - 1rem)` = −64px — a
             primeira linha começa em x=16 e as seguintes voltam para 80.
             Hora com largura fixa de 3.1rem (`.latin24CompactTimeStamp_`,
             relógio de 24h), 11px, `--text-muted`, peso `medium`, alinhada à
             direita, `margin-inline-end: 4px`. Pílula BOT **antes** do nome
             (`.botTagCompact_c19a55 {margin-inline-end: .25rem}`). Nome 16px,
             peso `medium`, linha 22, `margin-inline-end: .25rem`. */
          <div className={`leading-[22px] -indent-[64px] ${corDoTexto}`}>
            <Tooltip
              rotulo={dataCompleta(message.createdAt)}
              larguraLivre
              className="mr-1 w-[3.1rem] select-none justify-end indent-0 align-baseline text-[11px] font-medium leading-[22px] text-text-muted"
            >
              <span>{hora(message.createdAt)}</span>
            </Tooltip>
            {/* ── j-bots ── `vertical-align: top` + `margin-top: .2em` (2px na
                fonte de 10px da pílula) + `top: .1rem` (`.botTag__82f07`,
                `.botTag_c19a55`): o topo fica 3,6px abaixo da linha de 22,
                centrando a pílula de 15 na primeira linha. */}
            {author.bot && <TagDeBot className="relative top-[0.1rem] mr-1 mt-[2px] indent-0 align-top" />}
            <button
              type="button"
              onClick={openProfile}
              style={corDoAutor ? { color: corDoAutor } : undefined}
              className="mr-1 indent-0 font-medium leading-[22px] text-text-strong hover:underline"
            >
              {displayNameOf(author)}
            </button>
            {/* Selo de enquete no compacto: depois do nome, antes do texto.
                Posição e margem **não medidas** (sem print do compacto com
                enquete); `mr-1` repete a margem do nome, e `align-top` +
                `mt-[3px]` centram os 16px na linha de 22, como a pílula BOT. */}
            {seloDeEnquete("mr-1 mt-[3px] align-top")}
            {!editing && corpo && <span className="break-words indent-0">{corpo}</span>}
          </div>
        ) : (
          inicioDeGrupo && (
            <div className="flex items-baseline gap-1.5 leading-[22px]">
              <button
                type="button"
                onClick={openProfile}
                style={corDoAutor ? { color: corDoAutor } : undefined}
                // 600, não o `medium` do `.username_c19a55`: no print da DM
                // (`142337.png`) a haste do "d" de "Md" tem 2,1px contra 1,45px
                // do "l" do corpo — a razão do semibold (0,13em contra 0,09em em
                // 16px); o medium daria ~1,75. Print vence CSS.
                className="font-semibold text-text-strong hover:underline"
              >
                {displayNameOf(author)}
              </button>
              {/* ── j-bots ── entre o nome e a hora, como no Discord. A caixa é
                  `items-baseline`, e uma pílula alinhada pela linha de base
                  desceria abaixo dela; `self-center` a recentra na linha de 22px
                  ((22 − 15)/2 = 3,5, o mesmo 3,6 do `margin-top .2em + top
                  .1rem` do CSS) sem mexer no nome nem na hora. */}
              {author.bot && <TagDeBot className="self-center" />}
              {/* `.cozy_c19a55 .timestamp_c19a55`: 12px (`.75rem`), linha 22,
                  `--chat-text-muted`, peso `medium`. No print 111402 o fim de
                  "elle" e o começo de "21/05/2022" ficam 12px de glifo a glifo
                  (x 479 → 492), que é o `gap` de 6 + os 4 da margem mais o
                  recuo dos glifos. */}
              <Tooltip rotulo={dataCompleta(message.createdAt)} larguraLivre>
                <span className="ml-1 text-xs font-medium text-chat-text-muted">
                  {horaCompleta(message.createdAt)}
                </span>
              </Tooltip>
              {/* `self-center`, o mesmo do TagDeBot: na caixa `items-baseline`
                  a pílula desceria abaixo da linha */}
              {seloDeEnquete("ml-1 self-center")}
            </div>
          )
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
              <TextArea
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
                // a caixa de edição usa o fundo do composer, sem borda — a
                // borda e o padding padrão do primitivo (pensado para
                // formulário) não são o desenho daqui
                classeDaCaixa="rounded-lg border-transparent bg-chat-background-default"
                className="py-[11px] pl-4 pr-12 text-text-default"
              />
              {/* o Discord mantém o emoji também na caixa de edição */}
              <BotaoDeIcone
                rotulo="Emoji"
                icone={<Smile size={22} />}
                tamanho="md"
                onClick={(e) => setPicker({ alvo: "edicao", ancora: anchorOf(e.currentTarget) })}
                className="absolute right-2 top-1.5"
              />
            </div>
            <div className="mt-1 text-xs text-text-muted">
              escape para{" "}
              <button type="button" onClick={stopEditing} className="text-text-link hover:underline">
                cancelar
              </button>{" "}
              • enter para{" "}
              <button type="submit" className="text-text-link hover:underline">
                salvar
              </button>
            </div>
          </form>
        ) : (
          !compacto &&
          corpo && (
            <div className={`break-words ${corDoTexto}`}>{corpo}</div>
          )
        )}

        {/* ordem do Discord: conteúdo → enquete → anexos → embeds → reações → thread */}
        {message.sticker && <StickerView sticker={message.sticker} />}
        {/* h-moderacao: a enquete é uma face da mensagem, não um bloco à parte */}
        {message.poll && (
          <PollCard poll={message.poll} canModerate={Boolean(canModerate)} isAuthor={isOwn} />
        )}
        {/* ── onda 3 ── em v2 nenhum anexo solto (o componente que o cita é
            quem desenha), e o anexo que um embed usa por `attachment://` não
            aparece duas vezes — ver `anexosVisiveis` */}
        <MediaGroup
          attachments={anexosVisiveis(message)}
          mensagemId={unconfirmed ? undefined : message.id}
        />
        {/* ── onda 3 ── Embeds ricos do bot, em sequência, antes da prévia de
            link (no Discord os dois são `embeds` da mesma mensagem, e os do bot
            vêm primeiro). A caixa é o `.container_b7e1cb` dos acessórios da
            mensagem (`css-bruto/653383.9d407f1fef76e564.css`): grade de uma
            coluna com `grid-row-gap:.25rem` (4px) e `padding-block:.125rem`
            (2px). `minmax(0,1fr)` deixa o embed encolher no celular.
            A efêmera passa por aqui também: é este mesmo componente. */}
        {embedsDoBot.length > 0 && (
          <div className="grid grid-cols-[minmax(0,1fr)] gap-1 py-0.5">
            {embedsDoBot.map((e, i) => (
              <EmbedDeBot key={i} embed={e} message={message} />
            ))}
          </div>
        )}
        {videoId && <YouTubeEmbed videoId={videoId} title={message.content} />}
        {imagemDireta && (
          <button
            type="button"
            onClick={() =>
              ui.openModal({
                kind: "galeria",
                urls: [imagemDireta],
                alts: ["Imagem"],
                indice: 0,
                messageId: unconfirmed ? undefined : message.id,
              })
            }
            onContextMenu={(e) => {
              // a imagem de uma prévia de link tem as mesmas ações da imagem
              // anexada; no desktop, sem isto, o botão direito não faz nada
              e.preventDefault();
              e.stopPropagation();
              const ancora: Anchor = { x: e.clientX, y: e.clientY, width: 0, height: 0 };
              ui.openContextMenu(
                e.clientX,
                e.clientY,
                itensDaImagem({
                  url: imagemDireta,
                  alt: "Imagem",
                  onReagir: unconfirmed ? undefined : () => setPicker({ alvo: "reacao", ancora }),
                }),
              );
            }}
            className="mt-1 block w-fit cursor-zoom-in overflow-hidden rounded-lg"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imagemDireta}
              alt="Imagem do link"
              loading="lazy"
              className="max-h-[350px] max-w-[min(550px,100%)] object-contain"
            />
          </button>
        )}
        {codigoDeConvite && <InviteEmbed code={codigoDeConvite} />}
        {embed && <LinkEmbedCard embed={embed} />}

        {/* ── onda 3 ── Componentes do bot (action rows e, com
            `IS_COMPONENTS_V2`, os de leiaute), abaixo dos embeds e antes das
            reações, como no Discord. O despacho v1/v2, os estados de carregando
            e o "Esta interação falhou" são do `ComponentesDaMensagem` (cartão
            3c); aqui só a caixa dos acessórios, a mesma dos embeds.
            `empty:hidden` (`.container_b7e1cb:empty{display:none}`): se o
            componente não desenhar nada, a caixa não deixa os 4px de respiro. */}
        {temComponentes && (
          <div className="grid grid-cols-[minmax(0,1fr)] gap-1 py-0.5 empty:hidden">
            <ComponentesDaMensagem message={message} />
          </div>
        )}

        {message.reactions.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {message.reactions.map((r) => (
              <PilulaDeReacao
                key={r.emoji}
                emoji={r.emoji}
                count={r.count}
                userIds={r.userIds}
                minha={currentUserId ? r.userIds.includes(currentUserId) : false}
                conhecidos={conhecidos}
                onClick={() => reagir(r.emoji)}
              />
            ))}
            {podeReagir && (
              <Tooltip rotulo="Adicionar reação">
                <button
                  type="button"
                  onClick={abrirSeletorDeReacao}
                  aria-label="Adicionar reação"
                  // mesma altura dos chips ao lado, inclusive quando o emoji cresce
                  style={{ height: alturaDoChipDeReacao(tamanhoEmoji) }}
                  /* No celular ele é **opaco desde sempre**: era `opacity-0` até
                     o hover, e no dedo isso quer dizer "não existe". O toque
                     longo abre o menu com "Adicionar reação", mas o "+" ao lado
                     das reações é o gesto direto, e some-se dele custava um menu
                     inteiro por reação. */
                  className="grid min-w-[2.375rem] place-items-center rounded-lg border border-transparent bg-background-base-lowest px-1.5 text-text-muted opacity-0 transition hover:border-border-normal hover:text-text-strong group-hover:opacity-100 celular:min-h-[44px] celular:min-w-[44px] celular:opacity-100"
                >
                  <SmilePlus size={16} />
                </button>
              </Tooltip>
            )}
          </div>
        )}

        {onOpenThread && (message.thread || message.replyCount > 0) && (
          <button
            type="button"
            onClick={() => onOpenThread(message)}
            className="mt-1 flex w-fit items-center gap-1.5 rounded-[4px] py-0.5 text-sm font-medium text-text-link hover:underline celular:min-h-[44px] celular:py-2"
          >
            {message.thread && message.thread.participants.length > 0 && (
              <span className="flex -space-x-1.5" aria-hidden="true">
                {message.thread.participants.map((p) => (
                  <Avatar key={p.id} user={p} size="xs" className="ring-2 ring-background-base-lower" />
                ))}
              </span>
            )}
            <MessageSquare size={16} aria-hidden="true" />
            {message.thread ? (
              <>
                <span className="text-text-strong">{message.thread.name}</span>
                {message.thread.archived && (
                  <span className="text-xs font-normal text-text-muted">(arquivada)</span>
                )}
              </>
            ) : (
              `${message.replyCount} ${message.replyCount === 1 ? "resposta" : "respostas"}`
            )}
            <span className="font-normal text-text-muted">›</span>
          </button>
        )}

        {efemera && <RodapeEfemero message={message} />}

        {message.failed && message.nonce && (
          <div className="mt-1 flex items-center gap-2 text-xs text-text-feedback-critical">
            <span>Não foi possível enviar.</span>
            <Button variante="secundario" tamanho="xs" onClick={() => onRetry?.(message.nonce as string)}>
              Reenviar
            </Button>
            <Button variante="link" tamanho="xs" onClick={() => onDiscard?.(message.nonce as string)}>
              Descartar
            </Button>
          </div>
        )}
      </div>

      {/*
        Barra de ações do hover — medidas em `mensagem/BarraDeAcoes.tsx`.
        Não existe no celular, e por isso nem é montada lá: ela é de `hover`,
        que o dedo não tem, e `group-focus-within` a fazia aparecer sozinha
        depois de qualquer toque que desse foco dentro da mensagem, com os
        botões empilhados sobre o texto (medido em 390×844). As mesmas ações
        estão no menu de toque longo, que é onde elas pertencem no telefone.
        Montar condicionalmente, e não `celular:hidden`, porque o
        `group-hover:block` tem especificidade maior que a da variante de mídia
        e só perderia com `!important`.
      */}
      {!ehMobile && !unconfirmed && !editing && !efemera && (
        <BarraDeAcoes
          primeiro={primeiro}
          cabecalho={!compacto && inicioDeGrupo}
          selecionada={selecionada}
          rapidas={frequentes.slice(0, RAPIDAS_NA_BARRA)}
          propria={isOwn}
          podeReagir={podeReagir}
          podeResponder={podeResponder}
          onReagir={reagir}
          onAbrirSeletor={abrirSeletorDeReacao}
          onEditar={startEdit}
          onResponder={responder}
          onEncaminhar={encaminharPelaBarra}
          onMais={openMenu}
        />
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
