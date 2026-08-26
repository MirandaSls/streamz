"use client";

import { useEffect } from "react";
import { displayNameOf } from "@streamz/shared";
import { useAuth } from "@/stores/auth";
import { useGuilds } from "@/stores/guilds";
import { typersOf, useTyping } from "@/stores/typing";

function frase(nomes: string[]): React.ReactNode {
  if (nomes.length === 0) return null;
  if (nomes.length > 3) return <>Várias pessoas estão digitando</>;
  const negrito = nomes.map((n, i) => (
    <span key={n}>
      <strong className="font-semibold text-txt-primary">{n}</strong>
      {i < nomes.length - 2 ? ", " : i === nomes.length - 2 ? " e " : ""}
    </span>
  ));
  return (
    <>
      {negrito} {nomes.length === 1 ? "está" : "estão"} digitando
    </>
  );
}

/** Linha de 24px sob o composer: os três pontos e quem está digitando. */
export default function TypingIndicator({ channelId }: { channelId: string }) {
  const me = useAuth((s) => s.user);
  const byChannel = useTyping((s) => s.byChannel);
  const prune = useTyping((s) => s.prune);
  const members = useGuilds((s) => s.members);
  // o evento só traz o username; o nome de exibição vem da lista de membros
  const nomes = typersOf(byChannel, channelId, me?.id).map((username) => {
    const m = members.find((x) => x.user.username === username);
    return m ? displayNameOf(m.user) : username;
  });

  // avisos vencem sozinhos: varre a cada segundo enquanto houver algum
  useEffect(() => {
    if (nomes.length === 0) return;
    const id = window.setInterval(() => prune(), 1000);
    return () => window.clearInterval(id);
  }, [nomes.length, prune]);

  return (
    <div aria-live="polite" className="flex h-6 items-center gap-1.5 px-4 text-sm text-txt-normal">
      {nomes.length > 0 && (
        <>
          <span aria-hidden="true" className="flex items-center gap-0.5">
            <span className="typing-dot h-1.5 w-1.5 rounded-full bg-txt-normal" />
            <span className="typing-dot h-1.5 w-1.5 rounded-full bg-txt-normal" />
            <span className="typing-dot h-1.5 w-1.5 rounded-full bg-txt-normal" />
          </span>
          <span>{frase(nomes)}…</span>
        </>
      )}
    </div>
  );
}
