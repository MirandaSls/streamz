"use client";

import Avatar from "@/components/ui/Avatar";
import { useAuth } from "@/stores/auth";
import { alturaDoChipDeReacao, useSettings } from "@/stores/settings";

/**
 * O cartão "Prévia" que fica no topo de Aparência e de Acessibilidade.
 *
 * Ele existe porque nenhuma dessas preferências se decide lendo o rótulo: o
 * respiro entre grupos, o modo compacto e o tamanho do emoji só querem dizer
 * alguma coisa **vendo**. No Discord a prévia é a primeira coisa das duas
 * páginas, e reage enquanto se arrasta o controle lá embaixo — é ela que
 * transforma o ajuste em decisão em vez de tentativa e erro.
 *
 * Estava embutido na aba de Aparência. Virou componente porque a de
 * Acessibilidade mexe nos mesmos pixels (hora sempre visível, tamanho do emoji)
 * e mostrava só rótulos.
 */
export default function PreviaDeMensagens() {
  const user = useAuth((s) => s.user);
  const s = useSettings();
  const nome = user?.displayName || user?.username || "você";

  return (
    <div className="rounded-lg bg-background-base-lower p-3">
      {s.compactMode ? (
        <>
          <p className="text-text-default">
            <Hora s={s} valor="14:03" />
            <span className="mr-1 font-medium text-text-strong">{nome}</span>
            Assim ficam as mensagens no modo compacto.
          </p>
          <p className="text-text-default" style={{ marginTop: `${s.groupSpacing}px` }}>
            <Hora s={s} valor="14:04" />
            <span className="mr-1 font-medium text-text-strong">streamz</span>
            E este é o respiro entre grupos.
          </p>
        </>
      ) : (
        <>
          <div className="flex gap-3">
            {user && <Avatar user={user} size="lg" surface="border-background-base-lower" />}
            <div className="min-w-0">
              <span className="font-medium text-text-strong">{nome}</span>
              <span className="ml-1.5 text-xs text-text-muted">Hoje às 14:03</span>
              <p className="text-text-default">Assim ficam as mensagens no modo padrão.</p>
              <Reacao tamanho={s.emojiSize} />
            </div>
          </div>
          <div className="flex gap-3" style={{ marginTop: `${s.groupSpacing}px` }}>
            {/* achado da revisão visual: era um `div` só `bg-brand-500`, sem
                glifo — limão sobre limão, ilegível. `Avatar` sem `avatarUrl`
                já resolve isso sozinho (iniciais sobre uma cor de hash, com o
                token de contraste garantido `text-text-overlay-light`), então
                a segunda mensagem da prévia usa o mesmo componente da
                primeira em vez de reimplementar o círculo */}
            <Avatar
              user={{ id: "previa-streamz", username: "streamz", avatarUrl: null }}
              size="lg"
              surface="border-background-base-lower"
            />
            <div className="min-w-0">
              <span className="font-medium text-text-strong">streamz</span>
              <span className="ml-1.5 text-xs text-text-muted">Hoje às 14:04</span>
              <p className="text-text-default">E este é o respiro entre grupos.</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * No modo compacto a hora fica sempre visível; no padrão ela acompanha a
 * preferência — que é justamente a que se está ajustando na aba ao lado.
 */
function Hora({ s, valor }: { s: { alwaysShowTime: boolean }; valor: string }) {
  if (!s.alwaysShowTime) return null;
  return <span className="mr-2 text-[11px] text-text-muted">{valor}</span>;
}

/**
 * Chip de reação — é onde o tamanho do emoji aparece de verdade.
 *
 * Mesma geometria do chip real (`components/MessageItem.tsx`): raio 8, 6px de
 * padding, 6px de gap, altura por `alturaDoChipDeReacao` e o emoji numa caixa
 * quadrada centrada. Uma prévia com outra caixa mentiria sobre o que o controle
 * faz — era ela que estava com raio 4 e sem altura.
 */
function Reacao({ tamanho }: { tamanho: number }) {
  return (
    <span
      style={{ height: alturaDoChipDeReacao(tamanho) }}
      className="mt-1 inline-flex items-center gap-1.5 rounded-lg border border-brand-500 bg-brand-500/20 px-1.5"
    >
      <span
        aria-hidden="true"
        className="inline-flex shrink-0 items-center justify-center"
        style={{ fontSize: `${tamanho}px`, lineHeight: 1, height: tamanho, width: tamanho }}
      >
        👍
      </span>
      <span className="text-sm font-semibold leading-none text-text-strong">3</span>
    </span>
  );
}
