"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { displayNameOf, type PublicUser } from "@streamz/shared";
import { useAuth } from "@/stores/auth";
import { useDMs } from "@/stores/dms";
import { useGuilds } from "@/stores/guilds";
import { typersOf, useTyping } from "@/stores/typing";

/**
 * Animação dos três pontos.
 *
 * Fica aqui, e não em `globals.css`, porque só este componente a usa e a
 * amplitude (6px) é parte do desenho: com os 3px de antes o movimento sumia no
 * meio do texto e a linha parecia estática.
 */
const ANIMACAO = `@keyframes streamz-digitando {
  0%, 60%, 100% { transform: translateY(0); opacity: .6 }
  30% { transform: translateY(-6px); opacity: 1 }
}`;

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

/**
 * Respiro entre o composer e o fundo da janela, medido no Discord
 * (`173327.png`, coluna x=800: caixa termina em y=1021, borda da janela em
 * 1032). Antes eram 24px, porque esta faixa reservava `h-6` para o texto.
 */
const RESPIRO = 10;

/**
 * Quem está digitando: os três pontos e os nomes, **por cima** da lista, logo
 * acima do composer.
 *
 * Este componente é o irmão seguinte do composer (`ChatView`, `DMView`), e é
 * dele que vem o respiro de 10px até o fundo. O texto não pode ocupar espaço
 * próprio — reservar 24px aqui era o que empurrava o composer para 24px do
 * fundo, contra os 10 do Discord —, então ele flutua: `bottom-full` deste
 * espaçador é a base do composer, e o `marginBottom` com a altura do composer
 * (lida no irmão anterior por `ResizeObserver`, porque ela muda com linhas e
 * anexos) leva a faixa para cima dele, sobre o `pb-4` da lista.
 *
 * Limite conhecido: com a `ReplyBar` aberta, a faixa cobre os 24px de baixo
 * dela enquanto alguém digita.
 */
export default function TypingIndicator({ channelId }: { channelId: string }) {
  const raiz = useRef<HTMLDivElement>(null);
  const [alturaDoComposer, setAlturaDoComposer] = useState(0);
  useLayoutEffect(() => {
    const composer = raiz.current?.previousElementSibling;
    if (!(composer instanceof HTMLElement)) return;
    const medir = () => setAlturaDoComposer(composer.offsetHeight);
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(composer);
    return () => observador.disconnect();
  }, []);

  const me = useAuth((s) => s.user);
  const byChannel = useTyping((s) => s.byChannel);
  const prune = useTyping((s) => s.prune);
  const members = useGuilds((s) => s.members);
  const dms = useDMs((s) => s.channels);

  /**
   * O evento só traz o username. O nome de exibição vinha só da lista de
   * membros do servidor — que numa conversa direta ou num grupo está vazia, e
   * por isso aparecia o username cru. Aqui as duas fontes entram juntas.
   */
  const porUsername = useMemo(() => {
    const map = new Map<string, PublicUser>();
    for (const m of members) map.set(m.user.username, m.user);
    for (const d of dms) for (const u of d.others) map.set(u.username, u);
    if (me) map.set(me.username, me);
    return map;
  }, [members, dms, me]);

  const nomes = typersOf(byChannel, channelId, me?.id).map((username) => {
    const u = porUsername.get(username);
    return u ? displayNameOf(u) : username;
  });

  // avisos vencem sozinhos: varre a cada segundo enquanto houver algum
  useEffect(() => {
    if (nomes.length === 0) return;
    const id = window.setInterval(() => prune(), 1000);
    return () => window.clearInterval(id);
  }, [nomes.length, prune]);

  return (
    <div ref={raiz} aria-live="polite" className="relative shrink-0" style={{ height: RESPIRO }}>
      {nomes.length > 0 && (
        <div
          className="absolute inset-x-0 bottom-full flex h-6 items-center gap-1.5 bg-chat px-4 text-[13px] text-txt-normal"
          style={{ marginBottom: alturaDoComposer }}
        >
          <style>{ANIMACAO}</style>
          <span aria-hidden="true" className="flex items-center gap-[3px]">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                style={{
                  animation: "streamz-digitando 1.2s infinite ease-in-out",
                  animationDelay: `${i * 0.16}s`,
                }}
                className="h-[7px] w-[7px] rounded-full bg-txt-normal"
              />
            ))}
          </span>
          <span>{frase(nomes)}…</span>
        </div>
      )}
    </div>
  );
}
