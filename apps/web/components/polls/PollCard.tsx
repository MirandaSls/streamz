"use client";

import { useEffect } from "react";
import { BarChart3, Check, Users } from "@/components/ui/icones";
import { isPollClosed, pollPercent, type Poll } from "@streamz/shared";
import Tooltip from "@/components/ui/Tooltip";
import { horaCompleta } from "@/lib/format";
import { usePoll, usePolls } from "@/stores/polls";
import { ui } from "@/stores/ui";

/**
 * Enquete dentro da mensagem: pergunta, opções com barra de porcentagem ao
 * vivo, total de votos e o rodapé com o prazo.
 *
 * A barra só aparece depois que a pessoa vota (ou quando a enquete encerra) —
 * é o que o Discord faz para não induzir o voto pela contagem alheia.
 */
export default function PollCard({
  poll: fromMessage,
  canModerate = false,
  isAuthor = false,
}: {
  poll: Poll;
  canModerate?: boolean;
  isAuthor?: boolean;
}) {
  const seed = usePolls((s) => s.seed);
  const vote = usePolls((s) => s.vote);
  const close = usePolls((s) => s.close);
  const poll = usePoll(fromMessage) ?? fromMessage;

  // a versão que veio na mensagem entra na store; as atualizações ao vivo
  // (poll.updated) passam a mandar a partir daí
  useEffect(() => seed(fromMessage), [fromMessage, seed]);

  const encerrada = isPollClosed(poll);
  const votei = poll.options.some((o) => o.me);
  const mostrarResultado = votei || encerrada;

  return (
    <div className="mt-1 w-[432px] max-w-full rounded-lg border border-black/30 bg-background-base-lowest p-4">
      <div className="flex items-start gap-2">
        <BarChart3 size={18} className="mt-0.5 shrink-0 text-text-muted" aria-hidden="true" />
        <h3 className="min-w-0 flex-1 break-words font-semibold text-text-strong">{poll.question}</h3>
      </div>
      <p className="mb-3 ml-6 text-xs text-text-muted">
        {poll.multi ? "Escolha quantas quiser" : "Escolha uma opção"}
      </p>

      <div role="group" aria-label={poll.question} className="flex flex-col gap-2">
        {poll.options.map((o) => {
          const pct = pollPercent(o.votes, poll.totalVotes);
          return (
            <button
              key={o.index}
              type="button"
              disabled={encerrada}
              aria-pressed={o.me}
              onClick={() => vote(poll.messageId, o.index)}
              /* 48px no celular: votar é um alvo de dedo, e 39px ficam abaixo
                 do piso de 44 */
              className={`relative flex h-10 items-center gap-2 overflow-hidden rounded-[4px] border px-3 text-left transition celular:h-[48px] ${
                o.me ? "border-brand-500" : "border-border-normal"
              } ${encerrada ? "cursor-default opacity-80" : "hover:border-text-muted"}`}
            >
              {mostrarResultado && (
                <span
                  aria-hidden="true"
                  className={`absolute inset-y-0 left-0 ${o.me ? "bg-brand-500/30" : "bg-interactive-background-hover"}`}
                  style={{ width: `${pct}%` }}
                />
              )}
              <span
                aria-hidden="true"
                // caixa quadrada para múltipla escolha, redonda para escolha única
                className={`relative grid h-4 w-4 shrink-0 place-items-center border ${
                  poll.multi ? "rounded-[3px]" : "rounded-full"
                } ${o.me ? "border-brand-500 bg-brand-500 text-control-primary-text-default" : "border-text-muted"}`}
              >
                {o.me && <Check size={12} strokeWidth={3} />}
              </span>
              <span className="relative min-w-0 flex-1 truncate text-sm text-text-default">{o.text}</span>
              {mostrarResultado && (
                <span className="relative shrink-0 text-xs font-medium text-text-muted">{pct}%</span>
              )}
            </button>
          );
        })}
      </div>

      {/* o rodapé no celular: os dois botões de texto ("Quem votou", "Encerrar")
          mediam 16px de altura — abaixo de qualquer alvo de dedo */}
      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-muted celular:gap-x-3 celular:[&_button]:min-h-[44px]">
        <span>
          {poll.totalVotes} {poll.totalVotes === 1 ? "voto" : "votos"}
        </span>
        <span aria-hidden="true">·</span>
        <span>
          {encerrada
            ? "Enquete encerrada"
            : poll.expiresAt
              ? `Encerra ${horaCompleta(poll.expiresAt)}`
              : "Sem prazo"}
        </span>
        {canModerate && (
          <>
            <span aria-hidden="true">·</span>
            <Tooltip label="Ver quem votou">
              <button
                type="button"
                onClick={() => ui.openModal({ kind: "pollVoters", messageId: poll.messageId })}
                className="flex items-center gap-1 font-medium text-text-link hover:underline"
              >
                <Users size={12} aria-hidden="true" />
                Quem votou
              </button>
            </Tooltip>
          </>
        )}
        {!encerrada && (isAuthor || canModerate) && (
          <>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={() => void close(poll.messageId)}
              className="font-medium text-text-link hover:underline"
            >
              Encerrar
            </button>
          </>
        )}
      </div>
    </div>
  );
}
