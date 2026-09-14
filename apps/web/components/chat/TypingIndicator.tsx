"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { displayNameOf, type PublicUser } from "@streamz/shared";
import { useAuth } from "@/stores/auth";
import { useDMs } from "@/stores/dms";
import { useGuilds } from "@/stores/guilds";
import { typersOf, useTyping } from "@/stores/typing";

/**
 * Pulso dos três pontos: o Discord não os faz saltar, ele os faz pulsar —
 * `scale .8→1` e `opacity .32→1`, sem `translateY`. Fica aqui, e não em
 * `globals.css`, porque só este componente usa este keyframe.
 * Origem: css-bruto/sob-demanda/132839.8777680fa22a03e5.css `.dot_b88801` /
 * `@keyframes typing-dot-pulse_b88801` (duração 1.2s,
 * `cubic-bezier(.45,0,.55,1)`, atraso de 0,15s entre pontos — os -1.2s/-1.05s/
 * -0.9s de lá viram, no mesmo ciclo de 1,2s, 0/0,15s/0,3s aqui).
 */
const ANIMACAO = `@keyframes streamz-digitando {
  0%, 50%, 100% { opacity: .32; scale: .8 }
  25% { opacity: 1; scale: 1 }
}`;

function frase(nomes: string[]): React.ReactNode {
  if (nomes.length === 0) return null;
  if (nomes.length > 3) return <>Várias pessoas estão digitando</>;
  const negrito = nomes.map((n, i) => (
    <span key={n}>
      {/* `.text_b88801>strong{color:var(--text-default);font-weight:
          var(--font-weight-semibold)}` — o nome é `text-default`, não
          `text-strong` (esse é o título das boas-vindas, outra escala). */}
      <strong className="font-semibold text-text-default">{n}</strong>
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
        /*
          Medidas — css-bruto/sob-demanda/132839.8777680fa22a03e5.css
          `.base_b88801`/`.inTextChannel_b88801`: `font-size:12px;
          line-height:16px` (a nossa escala `text-text-xs`, 12/16 batendo
          exato), `font-weight:500` (`font-medium`), `color:var(--text-subtle)`
          — não `text-default`, que é só a cor do nome em negrito
          (`.text_b88801>strong`) e dos pontos (`.dots_b88801`). Sem
          `background-color` na regra: a faixa é transparente, não uma barra
          opaca. Padding: `inset-inline:0` com `padding-inline-start:
          var(--space-md)` (16px) — só a esquerda, não `px-4` nos dois lados.
        */
        <div
          className="absolute inset-x-0 bottom-full flex h-6 items-center gap-1.5 pl-4 text-text-xs font-medium text-text-subtle"
          style={{ marginBottom: alturaDoComposer }}
        >
          <style>{ANIMACAO}</style>
          {/* `.dots_b88801`: `gap:2px` (não 3), cor `--text-default` (herdada
              pelos pontos via `currentColor`, por isso o `bg-text-default`
              abaixo em vez de repetir o token no `<span>` pai). */}
          <span aria-hidden="true" className="flex items-center gap-0.5">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                style={{
                  animation: "streamz-digitando 1.2s cubic-bezier(.45,0,.55,1) infinite",
                  animationDelay: `${i * 0.15}s`,
                }}
                className="h-[7px] w-[7px] rounded-full bg-text-default"
              />
            ))}
          </span>
          <span>{frase(nomes)}…</span>
        </div>
      )}
    </div>
  );
}
