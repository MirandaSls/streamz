"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Picker, { Categories, EmojiStyle, Theme } from "emoji-picker-react";
import { Settings2 } from "lucide-react";
import { formatCustomEmoji, type CustomEmoji } from "@newdisc/shared";
import { useAuth } from "@/stores/auth";
import { useEmojisOrdenados } from "@/stores/emojis";
import { useCanModerate, useGuilds } from "@/stores/guilds";
import { ui } from "@/stores/ui";

/** Nomes das categorias em pt-BR (a biblioteca vem em inglês). */
const CATEGORIAS = [
  { category: Categories.SUGGESTED, name: "Recentes" },
  { category: Categories.SMILEYS_PEOPLE, name: "Pessoas" },
  { category: Categories.ANIMALS_NATURE, name: "Natureza" },
  { category: Categories.FOOD_DRINK, name: "Comida" },
  { category: Categories.TRAVEL_PLACES, name: "Viagem" },
  { category: Categories.ACTIVITIES, name: "Atividades" },
  { category: Categories.OBJECTS, name: "Objetos" },
  { category: Categories.SYMBOLS, name: "Símbolos" },
  { category: Categories.FLAGS, name: "Bandeiras" },
];

type Aba = "unicode" | "servidor";

/**
 * Seletor de emoji: os unicode (biblioteca completa, com busca e tons de pele)
 * e os personalizados dos meus servidores, em abas.
 *
 * Duas abas em vez de uma rolagem só porque as duas metades têm busca própria —
 * a da biblioteca é dela e não enxerga os nossos. Separadas, cada busca faz o
 * que promete; juntas, uma das duas mentiria.
 *
 * `onPick` recebe o texto a inserir e, quando é personalizado, o emoji inteiro:
 * o composer insere `:nome:` (é o que a pessoa vê e edita) e a reação usa a
 * forma interna `<:nome:id>`, que é o que fica gravado.
 */
export default function EmojiPicker({
  onPick,
  onClose,
  className = "",
}: {
  onPick: (texto: string, custom?: CustomEmoji) => void;
  onClose: () => void;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const guildIdAtivo = useGuilds((s) => s.activeGuildId);
  const secoes = useEmojisOrdenados(guildIdAtivo);
  const temPersonalizados = secoes.some((s) => s.emojis.length > 0);
  const [aba, setAba] = useState<Aba>("unicode");
  const [busca, setBusca] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Escolher emoji"
      className={`z-[70] w-[352px] overflow-hidden rounded-lg bg-panel shadow-high ${className}`}
    >
      <div className="flex border-b border-black/30" role="tablist" aria-label="Tipo de emoji">
        <AbaBotao ativa={aba === "unicode"} onClick={() => setAba("unicode")}>
          Emoji
        </AbaBotao>
        <AbaBotao
          ativa={aba === "servidor"}
          onClick={() => setAba("servidor")}
          badge={temPersonalizados ? undefined : "vazio"}
        >
          Do servidor
        </AbaBotao>
      </div>

      {aba === "unicode" ? (
        <Picker
          onEmojiClick={(e) => onPick(e.emoji)}
          theme={Theme.DARK}
          emojiStyle={EmojiStyle.NATIVE}
          lazyLoadEmojis
          skinTonesDisabled={false}
          searchPlaceholder="Buscar emoji"
          categories={CATEGORIAS}
          previewConfig={{ showPreview: false }}
          width={352}
          height={380}
          style={
            {
              "--epr-bg-color": "#2b2d31",
              "--epr-category-label-bg-color": "#2b2d31",
              "--epr-search-input-bg-color": "#1e1f22",
              "--epr-picker-border-color": "#1e1f22",
              "--epr-hover-bg-color": "#35373c",
              "--epr-text-color": "#dbdee1",
              "--epr-search-input-text-color": "#dbdee1",
              "--epr-category-icon-active-color": "#5865f2",
            } as React.CSSProperties
          }
        />
      ) : (
        <SecaoPersonalizados
          busca={busca}
          onBusca={setBusca}
          onPick={onPick}
          onClose={onClose}
        />
      )}
    </div>
  );
}

function AbaBotao({
  ativa,
  onClick,
  children,
  badge,
}: {
  ativa: boolean;
  onClick: () => void;
  children: React.ReactNode;
  badge?: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={ativa}
      onClick={onClick}
      className={`flex-1 border-b-2 px-3 py-2 text-sm font-medium transition ${
        ativa
          ? "border-accent text-txt-primary"
          : "border-transparent text-txt-muted hover:text-txt-normal"
      }`}
    >
      {children}
      {badge && <span className="ml-1 text-[10px] text-txt-faint">({badge})</span>}
    </button>
  );
}

/** Grade dos emojis personalizados, agrupada por servidor. */
function SecaoPersonalizados({
  busca,
  onBusca,
  onPick,
  onClose,
}: {
  busca: string;
  onBusca: (v: string) => void;
  onPick: (texto: string, custom?: CustomEmoji) => void;
  onClose: () => void;
}) {
  const guildIdAtivo = useGuilds((s) => s.activeGuildId);
  const secoes = useEmojisOrdenados(guildIdAtivo);
  const me = useAuth((s) => s.user);
  const podeGerenciar = useCanModerate(me?.id);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return secoes;
    return secoes
      .map((s) => ({ ...s, emojis: s.emojis.filter((e) => e.name.includes(q)) }))
      .filter((s) => s.emojis.length > 0);
  }, [secoes, busca]);

  const vazio = filtradas.every((s) => s.emojis.length === 0);

  return (
    <div className="flex h-[380px] flex-col">
      <div className="p-2">
        <input
          value={busca}
          onChange={(e) => onBusca(e.target.value)}
          placeholder="Buscar emoji do servidor"
          aria-label="Buscar emoji do servidor"
          className="h-8 w-full rounded bg-rail px-2 text-sm text-txt-normal outline-none placeholder:text-txt-muted"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {vazio ? (
          <p className="px-2 py-8 text-center text-sm text-txt-muted">
            {busca.trim()
              ? "Nenhum emoji com esse nome."
              : "Este servidor ainda não tem emojis personalizados."}
          </p>
        ) : (
          filtradas.map((secao) => (
            <section key={secao.guildId} className="mb-2">
              <h3 className="px-1 py-1 text-xs font-semibold uppercase text-txt-muted">
                {secao.guildName}
              </h3>
              <div className="grid grid-cols-8 gap-1">
                {secao.emojis.map((emoji) => (
                  <button
                    key={emoji.id}
                    type="button"
                    title={`:${emoji.name}:`}
                    aria-label={`:${emoji.name}:`}
                    onClick={() => onPick(formatCustomEmoji(emoji.name, emoji.id), emoji)}
                    className="grid h-10 w-10 place-items-center rounded hover:bg-hov"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={emoji.url}
                      alt={`:${emoji.name}:`}
                      loading="lazy"
                      className="h-7 w-7 object-contain"
                    />
                  </button>
                ))}
              </div>
            </section>
          ))
        )}
      </div>

      {podeGerenciar && guildIdAtivo && (
        <button
          type="button"
          onClick={() => {
            onClose();
            ui.openModal({ kind: "guildEmojis", guildId: guildIdAtivo });
          }}
          className="flex items-center gap-2 border-t border-black/30 px-3 py-2 text-sm text-txt-link hover:underline"
        >
          <Settings2 size={16} aria-hidden="true" />
          Gerenciar emojis do servidor
        </button>
      )}
    </div>
  );
}
