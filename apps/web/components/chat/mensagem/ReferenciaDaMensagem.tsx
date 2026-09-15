"use client";

import type { MouseEvent, ReactNode } from "react";
import type { Message } from "@streamz/shared";
import { displayNameOf } from "@streamz/shared";
import { Image as ImageIcon } from "@/components/ui/icones";
import Avatar from "@/components/ui/Avatar";
import TagDeBot from "@/components/ui/TagDeBot";
import { goToMessage } from "@/stores/messages-navigate";
import { useAuthorColor } from "@/stores/permissions";
import { anchorOf, ui } from "@/stores/ui";

/**
 * A "espinha": o traço em L que sai do centro do avatar e sobe até a linha de
 * referência. É ela que amarra a resposta à mensagem citada.
 *
 * `.repliedMessageClickableSpine_c19a55` / `.messageSpine_c19a55:before`
 * (`css-bruto/sob-demanda/618416.a8a67*.css`):
 * `border: 2px` só em cima e à esquerda, `border-start-start-radius: 6px`,
 * `--spine-default`; `top: 50%` e `bottom: 0` da linha (18px → 9px de altura);
 * `inset-inline-start: -(avatar/2 + gutter)` com `margin-inline-start: -1px`
 * (metade da espessura) e `inset-inline-end: 100%` com `margin-inline-end:
 * --reply-spacing` (4px). No hover da linha a cor sobe para
 * `--interactive-text-default`.
 *
 * - **Cozy:** avatar 40 e gutter = a margem horizontal da mensagem, 20px no
 *   print (avatar em x=395 com o painel em x=375, `2026-08-31 111402.png`) —
 *   não os 16 do `--space-md` do CSS, porque print vence. A linha começa na
 *   calha do conteúdo (80): espinha de 80 − 40 − 1 = 39 até 80 − 4 = 76.
 * - **Compacto:** avatar = largura da hora (3.1rem = 49,6px) e gutter = 4px
 *   (`--custom-message-meta-space`). A linha começa em 80 − 10,4 = 69,6 (ver
 *   `LinhaDeReferencia`), a espinha em 69,6 − (24,8 + 4) − 1 = 39,8 e termina
 *   em 69,6 + 10 − 4 = 75,6 (`inset-inline-end: calc(100% - 10px)`, o
 *   `--custom-message-reply-indent`).
 *
 * Os valores ficam relativos à própria linha, que é quem posiciona a espinha.
 */
function Espinha({ compacto }: { compacto: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute bottom-0 top-1/2 rounded-tl-[6px] border-l-2 border-t-2 border-spine-default group-hover/referencia:border-interactive-text-default ${
        compacto ? "left-[-29.8px] w-[35.8px]" : "left-[-41px] w-[37px]"
      }`}
    />
  );
}

/**
 * A linha de referência acima da mensagem (resposta ou comando de barra).
 *
 * `.repliedMessage_c19a55`: `font-size: .875rem` (14px), `line-height:
 * --custom-message-reply-message-preview-line-height` (1.125rem = 18px), cor
 * `--text-default`, sem seleção de texto, `white-space: pre`.
 * No cozy, `margin-bottom: --reply-spacing` (4px). No compacto, sem margem
 * embaixo e com `margin-inline-start: timestamp + meta-space + text-indent` =
 * 49,6 + 4 − 64 = −10,4px e `padding-inline-start: 10px`: o texto cai em 79,6,
 * alinhado com a calha de 80 do conteúdo.
 */
function LinhaDeReferencia({
  compacto,
  children,
  onMouseEnter,
  onMouseLeave,
}: {
  compacto: boolean;
  children: ReactNode;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}) {
  return (
    <div
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={`group/referencia relative flex select-none items-center whitespace-pre text-[14px] leading-[18px] text-text-default ${
        compacto ? "ml-[-10.4px] pl-[10px]" : "mb-1"
      }`}
    >
      <Espinha compacto={compacto} />
      {children}
    </div>
  );
}

/**
 * Avatar (16px) e nome de quem é citado.
 *
 * `.replyAvatar_c19a55`: 16×16, redondo, `margin-inline-end: 4px`.
 * `.repliedMessage_c19a55 .username_c19a55`: tamanho e linha herdados (14/18),
 * `margin-inline-end: 4px`, `opacity: .64`, peso `medium` do `.username_`; a
 * cor é a do cargo (quando há) ou `--text-strong`, e a opacidade vale para as
 * duas.
 */
function QuemECitado({ user, cor }: { user: Message["author"]; cor: string | null }) {
  function abrirPerfil(e: MouseEvent<HTMLElement>) {
    ui.openProfile(user, anchorOf(e.currentTarget));
  }
  return (
    <>
      <button
        type="button"
        onClick={abrirPerfil}
        aria-label={`Perfil de ${displayNameOf(user)}`}
        className="mr-1 shrink-0 rounded-full"
      >
        <Avatar user={user} size="xs" />
      </button>
      <button
        type="button"
        onClick={abrirPerfil}
        style={cor ? { color: cor } : undefined}
        className="mr-1 shrink-0 font-medium text-text-strong opacity-[.64] hover:underline"
      >
        @{displayNameOf(user)}
      </button>
      {/* ── j-bots ── responder a um bot também diz que é um bot.
          `.repliedMessage_c19a55 .botTag_c19a55 {top:0}`: aqui a pílula não
          desce o 0,1rem que desce no cabeçalho; o `items-center` da linha já a
          centra. `caixaEstreita` porque a linha é `leading-[18px]` fixo nos
          dois leiautes (ver `TagDeBot`). */}
      {user.bot && <TagDeBot caixaEstreita className="mr-1" />}
    </>
  );
}

/**
 * Linha de referência da resposta: avatar miúdo, nome e o começo da original.
 *
 * Passar o mouse na linha **destaca a original** na timeline: responde "a qual
 * mensagem isso responde?" sem tirar ninguém do lugar. A cor do realce é o
 * `--message-background-hover`, o mesmo fundo que a original teria sob o
 * cursor. Vai em `style`, e não em classe, porque a original pode já ter fundo
 * próprio (menção, destaque do "ir para") e a classe brigaria com ele.
 *
 * O trecho citado: `.repliedTextPreview_c19a55` corta em uma linha
 * (`-webkit-line-clamp: 1`) e, no hover, sobe para `--text-strong`. O ícone do
 * anexo vai **depois** do texto (`.repliedTextContentTrailingIcon_c19a55`,
 * `margin-inline-start: 4px`).
 */
export function ReferenciaDeResposta({ message, compacto }: { message: Message; compacto: boolean }) {
  const ref = message.replyTo;
  // a citada está no mesmo canal da resposta: é o `guildId` dela que diz se há
  // cargo (null em conversa e em grupo — ver `corDeCargoNoCanal`)
  const cor = useAuthorColor(ref?.author.id ?? "", message.guildId);
  if (!ref) return null;

  function realcar(ligado: boolean) {
    const el = document.getElementById(`mensagem-${ref!.id}`);
    if (el) el.style.backgroundColor = ligado ? "var(--message-background-hover)" : "";
  }

  return (
    <LinhaDeReferencia compacto={compacto} onMouseEnter={() => realcar(true)} onMouseLeave={() => realcar(false)}>
      <QuemECitado user={ref.author} cor={cor} />
      <button
        type="button"
        onClick={() =>
          void goToMessage({
            guildId: message.guildId,
            channelId: message.channelId,
            messageId: ref.id,
          })
        }
        className="flex min-w-0 items-center text-left group-hover/referencia:text-text-strong"
      >
        {ref.content ? (
          <span className="truncate">{ref.content}</span>
        ) : ref.hasAttachments ? (
          <>
            <span className="truncate italic">Clique para ver o anexo</span>
            {/* 14px: o tamanho do ícone ao lado do trecho não foi medido */}
            <ImageIcon size={14} aria-hidden="true" className="ml-1 shrink-0" />
          </>
        ) : (
          <span className="truncate italic">Mensagem apagada</span>
        )}
      </button>
    </LinhaDeReferencia>
  );
}

/**
 * ── j-bots ── "fulano usou /play", acima da resposta do bot.
 *
 * A resposta de um bot a um comando de barra chega ao canal **sem** nenhuma
 * mensagem de quem pediu antes dela — uma interação não é mensagem. Sem esta
 * faixa o chat mostraria o bot falando sozinho, e ninguém saberia quem mandou.
 *
 * Ela sobrevive ao F5 porque o `interacao` vem do `include` da mensagem, e não
 * do payload do socket. No Discord é o `.executedCommand_c19a55`, que reusa a
 * geometria do `.repliedMessage_` (mesma espinha, avatar de 16, nome a 64%).
 */
export function ReferenciaDeInteracao({ message, compacto }: { message: Message; compacto: boolean }) {
  const interacao = message.interacao;
  const cor = useAuthorColor(interacao?.user.id ?? "", message.guildId);
  if (!interacao) return null;

  return (
    <LinhaDeReferencia compacto={compacto}>
      <QuemECitado user={interacao.user} cor={cor} />
      <span className="truncate">
        usou <span className="font-medium text-text-strong">/{interacao.name}</span>
      </span>
    </LinhaDeReferencia>
  );
}
