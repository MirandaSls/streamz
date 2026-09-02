"use client";

import { ScrollText, Timer } from "@/components/ui/icones";
import { horaCompleta } from "@/lib/format";
import { useChannels } from "@/stores/channels";
import { useModeration } from "@/stores/moderation";

/**
 * O que aparece **no lugar do composer** quando escrever não é possível:
 * castigo valendo ou regras ainda não aceitas.
 *
 * Segue a mesma caixa cinza do canal somente-leitura (ver `design.md`), porque
 * é o mesmo tipo de estado: "você está aqui, mas não escreve agora".
 */

const CAIXA =
  "mx-4 mb-6 flex items-center justify-center gap-2 rounded-lg bg-input px-4 py-3 text-center text-sm text-txt-muted";

/** Aviso de castigo, com a hora em que ele acaba. */
export function TimeoutNotice({ until }: { until: string }) {
  return (
    <p className={CAIXA} role="status">
      <Timer size={18} className="shrink-0 text-red" aria-hidden="true" />
      Você está de castigo neste servidor até {horaCompleta(until)}. Dá para ler tudo, mas não para
      enviar mensagens nem reagir.
    </p>
  );
}

/** Aviso de regras não aceitas, com o atalho para ler e o botão de aceitar. */
export function RulesNotice({ rulesChannelId }: { rulesChannelId: string | null }) {
  const accept = useModeration((s) => s.acceptRules);
  const channels = useChannels((s) => s.channels);
  const select = useChannels((s) => s.select);
  const canal = channels.find((c) => c.id === rulesChannelId);

  return (
    <div className={`${CAIXA} flex-wrap`} role="status">
      <ScrollText size={18} className="shrink-0 text-yellow" aria-hidden="true" />
      <span>
        Leia as regras
        {canal && (
          <>
            {" em "}
            <button
              type="button"
              onClick={() => select(canal)}
              className="font-medium text-txt-link hover:underline"
            >
              #{canal.name}
            </button>
          </>
        )}{" "}
        antes de escrever neste servidor.
      </span>
      <button
        type="button"
        onClick={() => void accept()}
        className="h-8 rounded-[3px] bg-accent px-3 font-medium text-accent-ink transition hover:bg-accent-hover"
      >
        Li e aceito as regras
      </button>
    </div>
  );
}
