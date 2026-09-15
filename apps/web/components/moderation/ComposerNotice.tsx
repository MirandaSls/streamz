"use client";

import type { ReactNode } from "react";
import { Lock, ScrollText, Timer } from "@/components/ui/icones";
import { Button } from "@/components/ui/primitivos";
import { horaCompleta } from "@/lib/format";
import { useChannels } from "@/stores/channels";
import { useModeration } from "@/stores/moderation";

/**
 * O que aparece **no lugar do composer** quando escrever não é possível:
 * sem permissão, castigo valendo ou regras ainda não aceitas.
 *
 * No Discord esses estados não trocam a caixa por um parágrafo: a caixa do
 * campo continua lá, desabilitada (`.channelTextAreaDisabled__74017`,
 * `.innerDisabled__74017{cursor:not-allowed}`), com o texto no lugar do
 * placeholder e sem o "+" (`.sansAttachButton__74017{padding-inline-start:
 * calc(var(--space-16) - 1px)}` = 15px). Por isso o aviso tem a mesma caixa do
 * composer, medida no print 1:1 `Captura de tela 2026-09-02 180835.png`:
 * - 58px de altura com a borda (coluna x=700: borda 1px em y=964 e y=1021, 56
 *   de miolo `#222327` = `--chat-background-default`);
 * - borda 1px `#27282b` sobre `#1a1a1e`, que é `--border-subtle`
 *   (`.refresh-fast-follow-distinct-borders .channelTextArea__74017`);
 * - raio `--radius-sm` (8), a 10px das bordas da coluna (x 385–1640 em 375–1650);
 * - texto 16px com entrelinha 22 e `--text-muted` (`.textArea__74017`).
 *
 * Embaixo, `mb-2.5`: é o respiro que o `TypingIndicator` dá ao composer hoje
 * (10). O Discord mede 8 (`--custom-chat-input-margin-bottom`, e y 1022–1029 no
 * print); os dois mudam juntos, senão o aviso e o campo ficam desalinhados ao
 * trocar de canal.
 */
function CaixaDesabilitada({ icone, children, className = "" }: { icone: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div
      role="status"
      aria-disabled="true"
      className={`mx-2.5 mb-2.5 flex min-h-[58px] shrink-0 cursor-not-allowed items-center gap-2 rounded-lg border border-border-subtle bg-chat-background-default py-2 pl-[15px] pr-4 text-[1rem] leading-[1.375rem] text-text-muted celular:mx-3 celular:min-h-[40px] celular:rounded-[20px] ${className}`}
    >
      {icone}
      {children}
    </div>
  );
}

/**
 * Sem permissão de enviar mensagens (somente-leitura, ou `SEND_MESSAGES` negado).
 * O texto é o do Discord em pt-BR.
 */
export function SemPermissaoNotice() {
  return (
    <CaixaDesabilitada icone={<Lock size={20} aria-hidden="true" className="shrink-0" />}>
      <span className="min-w-0">Você não tem permissão para enviar mensagens neste canal.</span>
    </CaixaDesabilitada>
  );
}

/** Aviso de castigo, com a hora em que ele acaba. */
export function TimeoutNotice({ until }: { until: string }) {
  return (
    <CaixaDesabilitada icone={<Timer size={20} aria-hidden="true" className="shrink-0 text-status-danger" />}>
      <span className="min-w-0">
        Você está de castigo neste servidor até {horaCompleta(until)}. Dá para ler tudo, mas não para enviar
        mensagens nem reagir.
      </span>
    </CaixaDesabilitada>
  );
}

/** Aviso de regras não aceitas, com o atalho para ler e o botão de aceitar. */
export function RulesNotice({ rulesChannelId }: { rulesChannelId: string | null }) {
  const accept = useModeration((s) => s.acceptRules);
  const channels = useChannels((s) => s.channels);
  const select = useChannels((s) => s.select);
  const canal = channels.find((c) => c.id === rulesChannelId);

  return (
    // o botão é a saída deste estado: a caixa não pode ter cursor proibido
    <CaixaDesabilitada
      className="cursor-default flex-wrap"
      icone={<ScrollText size={20} aria-hidden="true" className="shrink-0 text-status-warning" />}
    >
      <span className="min-w-0 flex-1">
        Leia as regras
        {canal && (
          <>
            {" em "}
            <button
              type="button"
              onClick={() => select(canal)}
              className="font-medium text-text-link hover:underline"
            >
              #{canal.name}
            </button>
          </>
        )}{" "}
        antes de escrever neste servidor.
      </span>
      <Button variante="primario" tamanho="sm" onClick={() => void accept()}>
        Li e aceito as regras
      </Button>
    </CaixaDesabilitada>
  );
}
