"use client";

import { useState, type MouseEvent, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ImagePlus,
  Pencil,
  Pin,
  ShieldAlert,
} from "@/components/ui/icones";
import {
  displayNameOf,
  systemMessageText,
  type Message,
  type MessageType,
  type PublicUser,
} from "@streamz/shared";
import PainelFlutuante from "@/components/chat/PainelFlutuante";
import BarraDeAcoes from "@/components/chat/mensagem/BarraDeAcoes";
import { fundoDaLinha } from "@/components/chat/mensagem/fundo";
import PilulaDeReacao from "@/components/chat/mensagem/PilulaDeReacao";
import EmojiPicker from "@/components/ui/EmojiPicker";
import { useEhMobile } from "@/hooks/useEhMobile";
import { horaCompleta } from "@/lib/format";
import { goToMessage } from "@/stores/messages-navigate";
import { useAuthorColor } from "@/stores/permissions";
import { useLiveUser } from "@/stores/presence";
import { useSettings } from "@/stores/settings";
import { anchorOf, ui, type Anchor } from "@/stores/ui";
import { registrarUsoDeReacao } from "@/components/chat/reacoes-rapidas";

/** Mapa vazio estável, para quando quem monta não passa os conhecidos. */
const SEM_CONHECIDOS = new Map<string, PublicUser>();

/**
 * Ícone por tipo de narração.
 *
 * **Fixar: 16px**, do print `suporte/imagens/discord-basics/221421867-pin-messages-faq/10.png`
 * (@2x): o alfinete ocupa y=1628–1655 e x=80–106, um glifo de ~14px numa caixa
 * de 16, cinza como o resto da frase.
 *
 * Os outros tipos ficam em **12px**, de
 * `.userJoinSystemMessageIcon_c19a55{height:12px;width:12px}`
 * (css-bruto/sob-demanda/618416…) — o único ícone de narração com classe
 * própria no CSS. As cores de entrada/saída/aviso não têm fonte encontrada e
 * ficam como estavam. `DEFAULT` não é narração e por isso não tem ícone.
 *
 * Todos moram na mesma caixa de 16×16 (ver a posição no componente): o de 12
 * fica centrado nela.
 */
const ICONE: Partial<Record<MessageType, ReactNode>> = {
  SYSTEM_PIN: <Pin size={16} className="text-text-muted" />,
  SYSTEM_JOIN: <ArrowRight size={12} className="text-status-positive" />,
  SYSTEM_MOD_NOTICE: <ShieldAlert size={12} className="text-status-danger" />,
  SYSTEM_MEMBER_ADDED: <ArrowRight size={12} className="text-status-positive" />,
  SYSTEM_MEMBER_REMOVED: <ArrowLeft size={12} className="text-status-danger" />,
  SYSTEM_MEMBER_LEFT: <ArrowLeft size={12} className="text-status-danger" />,
  SYSTEM_GROUP_RENAMED: <Pencil size={12} className="text-text-muted" />,
  SYSTEM_GROUP_ICON: <ImagePlus size={12} className="text-text-muted" />,
};

/** Os trechos clicáveis da frase de fixar: negrito claro, sem cor de link. */
const TRECHO_DA_FRASE = "font-semibold text-text-strong hover:underline";

/**
 * Evento do canal na timeline ("X fixou uma mensagem"): uma linha discreta com
 * ícone e sem avatar — não é a fala de ninguém, é o que aconteceu.
 *
 * Mas continua sendo uma mensagem, no mesmo leiaute da `MessageItem`: fundo por
 * estado (`fundoDaLinha` — destaque do "ir para", menção e menu aberto), a
 * mesma barra de ações do hover (no modo `sistema`: reagir e "Mais"), a mesma
 * pílula de reação e o menu de contexto montado por quem sabe o contexto. O
 * texto vem do contrato (`systemMessageText`) para a API e a UI não divergirem,
 * exceto o de fixar, que tem dois trechos clicáveis (ver abaixo).
 */
export default function SystemMessageItem({
  message,
  grouped = false,
  primeiro = false,
  currentUserId,
  destacada = false,
  mencionada = false,
  selecionada = false,
  podeReagir = true,
  conhecidos = SEM_CONHECIDOS,
  onToggleReaction,
  onMenu,
}: {
  message: Message;
  /** continuação do bloco anterior: a hora só aparece no hover. */
  grouped?: boolean;
  /** primeiro item desenhado na lista: a barra de ações não pode sair por cima. */
  primeiro?: boolean;
  currentUserId?: string;
  /** destino do "ir para" (`highlightId`). */
  destacada?: boolean;
  /** menciona quem está lendo. */
  mencionada?: boolean;
  /** o menu de contexto desta mensagem está aberto. */
  selecionada?: boolean;
  /** `null` = permissões carregando; só `false` esconde o "Adicionar reação". */
  podeReagir?: boolean | null;
  /** quem pode aparecer na dica da pílula de reação. */
  conhecidos?: Map<string, PublicUser>;
  onToggleReaction?: (id: string, emoji: string) => void;
  /** menu da mensagem, montado por quem sabe o contexto (MessageItem). */
  onMenu?: (e: MouseEvent) => void;
}) {
  const autor = useLiveUser(message.author);
  // o nome do autor na cor do cargo, como no nome da mensagem comum: no print
  // 10.png "Bread Dog" sai em `#917ec3` (x=164–180, y=1645), a mesma cor dele
  // nas mensagens (19.png). Sem cargo colorido, `text-strong`.
  const corDoAutor = useAuthorColor(message.author.id, message.guildId);
  const compacto = useSettings((s) => s.compactMode);
  // a barra é de hover, que o dedo não tem (ver o comentário em MessageItem)
  const ehMobile = useEhMobile();
  const [ancora, setAncora] = useState<Anchor | null>(null);
  const nome = displayNameOf(autor);
  const reactions = message.reactions ?? [];
  const fixar = message.type === "SYSTEM_PIN";
  const partes = fixar ? null : repartirPeloNome(systemMessageText(message, nome), nome);

  const { fundo, faixa } = fundoDaLinha({
    destacada,
    respondendo: false,
    mencionada,
    selecionada,
    efemera: false,
  });

  function abrirPerfil(e: MouseEvent<HTMLElement>) {
    ui.openProfile(autor, anchorOf(e.currentTarget));
  }

  function reagir(emoji: string) {
    registrarUsoDeReacao(emoji);
    onToggleReaction?.(message.id, emoji);
  }

  function irParaAFixada() {
    if (!message.replyTo) return;
    void goToMessage({
      guildId: message.guildId,
      channelId: message.channelId,
      messageId: message.replyTo.id,
    });
  }

  const botaoDoNome = (
    <button
      type="button"
      onClick={abrirPerfil}
      style={corDoAutor ? { color: corDoAutor } : undefined}
      className="font-medium text-text-strong hover:underline"
    >
      {nome}
    </button>
  );

  return (
    <div
      id={`mensagem-${message.id}`}
      onContextMenu={onMenu}
      style={grouped ? undefined : { marginTop: "var(--espaco-entre-grupos, 17px)" }}
      /* Recuo de 80px e respiro vertical de 2px, os da `MessageItem`
         (`.wrapper_c19a55{padding-inline-start:5rem}`). O respiro é o mesmo
         nos dois modos: `--custom-message-padding-vertical-container-compact` e
         `--custom-message-spacing-vertical-container-cozy` valem .125rem. À
         direita, os 24px e o raio de 4px do `.message__5126c`.

         Corpo em 16px (`text-text-md`), não 14: no print 10.png (@2x) a versal
         "B" de "Bread Dog" vai de y=1632 a 1654 (≈11px de versal em 1x, corpo
         de 16), a mesma altura do corpo das mensagens ao lado ("I" em
         y=1455–1476). Print vence a régua compacta do CSS. */
      className={`group relative rounded-r py-0.5 pl-[80px] pr-6 text-text-md text-text-muted ${fundo}`}
    >
      {faixa && (
        <span aria-hidden="true" className={`pointer-events-none absolute inset-y-0 left-0 w-[2px] ${faixa}`} />
      )}

      {/* O ícone fica **na calha do avatar**, centrado nela: no print 10.png o
          alfinete termina em x=108 e o texto começa em x=162 (27px de folga em
          1x), com o centro do glifo no centro dos avatares das mensagens. Aqui
          o avatar mora em x=20 com 40px (centro em 40), então a caixa de 16
          começa em 32. Vertical: linha de 20px (`text-text-md`) + 2px de
          respiro — a caixa de 16 centrada nela começa em 2 + 2 = 4. */}
      <span aria-hidden="true" className="absolute left-[32px] top-[4px] grid h-4 w-4 place-items-center">
        {ICONE[message.type]}
      </span>

      <span className="flex flex-wrap items-center gap-x-1.5">
        <span className="min-w-0 break-words">
          {fixar ? (
            /* A frase de fixar é montada aqui, não no contrato: no print 10.png
               ela é "Bread Dog pinned **a message** to this channel. See all
               **pinned messages**." — dois trechos em negrito claro e
               clicáveis, na mesma cor clara (não azul de link). O primeiro
               leva à mensagem fixada; o segundo abre a lista de fixadas do
               canal. Sem o alvo (mensagem já apagada), "uma mensagem" fica só
               em negrito. */
            <>
              {botaoDoNome} fixou{" "}
              {message.replyTo ? (
                <button type="button" onClick={irParaAFixada} className={TRECHO_DA_FRASE}>
                  uma mensagem
                </button>
              ) : (
                <b className="font-semibold text-text-strong">uma mensagem</b>
              )}{" "}
              neste canal. Veja todas as{" "}
              <button type="button" onClick={() => ui.openPins(message.channelId)} className={TRECHO_DA_FRASE}>
                mensagens fixadas
              </button>
              .
            </>
          ) : (
            partes && (
              <>
                {partes.antes}
                {partes.temNome && botaoDoNome}
                {partes.depois}
              </>
            )
          )}
        </span>
        {/* mesmo cinza do resto da frase: dois níveis de cinza na mesma linha
            faziam a hora parecer outro tipo de informação. No compacto toda
            linha mostra a hora, como na `MessageItem` compacta. */}
        <span
          className={`shrink-0 text-text-xs text-text-muted ${
            grouped && !compacto ? "opacity-0 group-hover:opacity-100" : ""
          }`}
        >
          {horaCompleta(message.createdAt)}
        </span>
      </span>

      {reactions.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {reactions.map((r) => (
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
        </div>
      )}

      {/* A barra do hover é a da mensagem comum, no modo de narração. Linha
          sem cabeçalho: fica nos −25 do `.container__040f0`. */}
      {!ehMobile && onMenu && (
        <BarraDeAcoes
          primeiro={primeiro}
          sistema
          selecionada={selecionada}
          podeReagir={onToggleReaction ? podeReagir : false}
          onAbrirSeletor={(e) => setAncora(anchorOf(e.currentTarget))}
          onMais={onMenu}
        />
      )}

      {ancora && (
        <PainelFlutuante ancora={ancora} onClose={() => setAncora(null)}>
          <EmojiPicker
            placeholder="Encontre a reação perfeita"
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
