"use client";

import { useEffect } from "react";
import { AtSign, X } from "@/components/ui/icones";
import { BotaoDeIcone } from "@/components/ui/primitivos";
import { displayNameOf } from "@streamz/shared";
import { useMessages } from "@/stores/messages";
import { useAuthorColor } from "@/stores/permissions";

/**
 * Barra "Respondendo a X", empilhada em cima da caixa do composer — inclusive o
 * interruptor "@ ligado/desligado", que decide se a resposta menciona (e
 * notifica) o autor da mensagem citada.
 *
 * Medido no CSS (`css-bruto/434168.4173c98904e6eb01.css`, módulo `__841c8`, e
 * `962953…css`, módulo `__74017`):
 * - `.replyBar__841c8{display:grid;grid-template-columns:1fr auto;align-items:center;
 *   border-start-*-radius:8px}`. O `background` dela é anulado pelo
 *   `background-color:unset` da mesma regra: quem pinta é o contêiner
 *   `.stackedBars__74017{background:var(--background-surface-higher)}`;
 * - texto `.text__841c8{margin-inline-start:var(--space-16);text-overflow:ellipsis}`,
 *   nome `.name__841c8{font-weight:var(--font-weight-semibold)}`;
 * - ações `.actions__841c8{margin-inline-end:var(--space-4)}`; botão de menção
 *   `.mentionButton__841c8{padding:8px 12px;text-transform:uppercase}` com o
 *   ícone `.mentionIcon__841c8{16×16;margin-inline-end:4px}`; separador
 *   `.separator__841c8{width:1px;height:20px;background:var(--border-subtle)}`.
 *
 * A altura sai do botão de menção (8 + 16 + 8 = 32); não há print 1:1 com a
 * barra aberta para confirmar. Antes eram 48px com 8 escondidos atrás da caixa
 * (`-mb-2`), sem origem: agora a caixa do composer perde o raio de cima quando
 * a barra existe (`.hasStackedBar__74017{border-start-*-radius:0}`), pela
 * classe `barra-empilhada` que o composer procura no irmão anterior.
 *
 * Não medido: tamanho da letra e cor do "@ ligado" (o módulo não pinta; fica o
 * `--text-brand`, que o ADR-0009 troca para o limão) e o × de fechar.
 */
export default function ReplyBar({
  channelId,
  threadId = null,
}: {
  channelId: string;
  /** escopo: o painel de thread e o canal dividem o mesmo `channelId`. */
  threadId?: string | null;
}) {
  const alvo = useMessages((s) => s.replyTarget);
  const mention = useMessages((s) => s.replyMention);
  const cancelReply = useMessages((s) => s.cancelReply);
  const toggleReplyMention = useMessages((s) => s.toggleReplyMention);
  // o nome do citado sai na cor do cargo dele, como na timeline
  const cor = useAuthorColor(alvo?.message.author.id ?? "");

  // Esc cancela a resposta mesmo com o foco fora do composer
  useEffect(() => {
    if (!alvo) return;
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === "Escape") cancelReply();
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [alvo, cancelReply]);

  if (!alvo || alvo.channelId !== channelId || alvo.threadId !== threadId) return null;

  return (
    /* `mx-2.5`: a barra tem a largura da caixa do composer, que fica a 10px das
       bordas da coluna (print 1:1 `180835.png`, caixa em x 385–1640 numa coluna
       de 375–1650). No telefone a cápsula usa `px-3`. */
    <div className="barra-empilhada mx-2.5 grid shrink-0 grid-cols-[1fr_auto] items-center rounded-t-lg bg-background-surface-higher text-text-sm text-text-default celular:mx-3">
      <p className="ml-4 min-w-0 truncate">
        Respondendo a{" "}
        <span style={cor ? { color: cor } : undefined} className="font-semibold text-text-strong">
          {displayNameOf(alvo.message.author)}
        </span>
      </p>
      <div className="mr-1 flex items-center">
        <button
          type="button"
          onClick={toggleReplyMention}
          aria-pressed={mention}
          aria-label={mention ? "Menção ligada: o autor será notificado" : "Menção desligada"}
          /* No celular o alvo vai a 44 de altura sem engordar o desenho: cresce
             só a área de toque. */
          className={`flex items-center px-3 py-2 text-text-xs font-bold uppercase transition-colors celular:min-h-[44px] ${
            mention ? "text-text-brand" : "text-text-muted hover:text-text-default"
          }`}
        >
          <AtSign size={16} aria-hidden="true" className="mr-1 shrink-0" />
          {mention ? "Ligado" : "Desligado"}
        </button>
        <span aria-hidden="true" className="h-5 w-px bg-border-subtle" />
        <BotaoDeIcone
          rotulo="Cancelar resposta"
          icone={<X size={16} />}
          onClick={cancelReply}
          tamanho="sm"
          fundo="hover"
          /* 24×24 no desktop; no telefone este × é o único jeito de desistir de
             uma resposta com o dedo, e a área vai a 44. O glifo continua 16. */
          className="mx-2 celular:h-[44px] celular:w-[44px]"
        />
      </div>
    </div>
  );
}
