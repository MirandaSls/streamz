"use client";

import { customStatusOf, displayNameOf, type PublicUser } from "@streamz/shared";
import Avatar from "@/components/ui/Avatar";
import { useChannels } from "@/stores/channels";
import { useDMs } from "@/stores/dms";
import { useFriends } from "@/stores/friends";
import { resolveStatus, useLiveUser, usePresence } from "@/stores/presence";
import { anchorOf, ui } from "@/stores/ui";
import { useVoice } from "@/stores/voice";

/**
 * Painel "Ativo agora" da página Amigos (coluna direita de ~360px).
 *
 * O MVP não tem atividade de jogo, então o painel mostra o que existe de
 * "atividade" de verdade, em duas camadas, nesta ordem:
 *
 * 1. amigos numa chamada de voz agora (`useVoice.states`, o mesmo estado que a
 *    barra lateral usa) — "Em chamada · <canal>";
 * 2. amigos com status personalizado, o texto dele como a linha cinza.
 *
 * Quem cai nas duas aparece uma vez só, como chamada (é a informação que muda
 * a decisão de falar com a pessoa). Offline sem chamada não entra: status
 * personalizado de quem saiu é resíduo, não atividade.
 *
 * Escondido abaixo de 1100px (a lista de amigos precisa da largura) e no
 * celular, onde o shell empilhado não tem espaço para uma terceira coluna.
 */

interface Atividade {
  user: PublicUser;
  texto: string;
  /** chamada vem antes de status personalizado */
  chamada: boolean;
}

function useAtividades(): Atividade[] {
  const friends = useFriends((s) => s.friends);
  const states = useVoice((s) => s.states);
  const statuses = usePresence((s) => s.statuses);
  const canaisDoServidor = useChannels((s) => s.channels);
  const dms = useDMs((s) => s.channels);

  // canal -> rótulo. Só conhecemos nomes do servidor aberto e das DMs; de
  // outro servidor sobra o rótulo genérico, sem inventar nome.
  const nomeDoCanal = (id: string): string | null => {
    const c = canaisDoServidor.find((x) => x.id === id);
    if (c) return c.name;
    return dms.some((d) => d.id === id) ? "Conversa direta" : null;
  };

  const emChamada = new Map<string, string>();
  for (const [canalId, lista] of Object.entries(states)) {
    for (const e of lista) {
      if (!e.connected || emChamada.has(e.user.id)) continue;
      const nome = nomeDoCanal(canalId);
      emChamada.set(e.user.id, nome ? `Em chamada · ${nome}` : "Em chamada");
    }
  }

  const itens: Atividade[] = [];
  for (const f of friends) {
    const voz = emChamada.get(f.id);
    if (voz) {
      itens.push({ user: f, texto: voz, chamada: true });
      continue;
    }
    const custom = customStatusOf(f);
    if (custom && resolveStatus(statuses, f) !== "OFFLINE") {
      itens.push({ user: f, texto: custom, chamada: false });
    }
  }
  // sort estável: dentro de cada grupo a ordem da lista de amigos se mantém
  return itens.sort((a, b) => Number(b.chamada) - Number(a.chamada));
}

function Cartao({ item }: { item: Atividade }) {
  const live = useLiveUser(item.user);
  const status = resolveStatus(usePresence((s) => s.statuses), live);
  const nome = displayNameOf(live);
  return (
    <button
      type="button"
      onClick={(e) => ui.openProfile(live, anchorOf(e.currentTarget))}
      aria-label={`Perfil de ${nome}`}
      className="flex w-full items-center gap-3 rounded-lg bg-background-surface-higher p-3 text-left transition hover:bg-interactive-background-hover"
    >
      <Avatar user={live} size="lg" status={status} surface="border-background-surface-higher" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-bold text-text-strong">{nome}</span>
        <span className="block truncate text-sm text-text-muted">{item.texto}</span>
      </span>
    </button>
  );
}

export default function AtivoAgora() {
  const itens = useAtividades();
  return (
    <aside
      aria-label="Ativo agora"
      // `celular:!hidden`: o breakpoint `celular` é uma media raw e o
      // `min-[1100px]:flex` vem depois dele no CSS gerado; sem o `!` o painel
      // reapareceria num tablet deitado que o hook trata como celular.
      className="hidden w-[360px] shrink-0 flex-col overflow-y-auto border-l border-border-subtle bg-background-base-lower min-[1100px]:flex celular:!hidden"
    >
      <h2 className="px-5 py-4 text-xl font-bold text-text-strong">Ativo agora</h2>
      {itens.length === 0 ? (
        <div className="flex flex-col items-center px-5 pt-6 text-center">
          <p className="text-base font-semibold text-text-strong">Ninguém está ativo agora</p>
          <p className="mt-1 text-sm text-text-muted">
            Quando um amigo começar uma atividade — como jogar ou conversar por voz — vamos mostrar
            aqui!
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2 px-5 pb-5">
          {itens.map((i) => (
            <li key={i.user.id}>
              <Cartao item={i} />
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
