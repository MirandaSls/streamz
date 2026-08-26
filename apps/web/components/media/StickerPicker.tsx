"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Settings2 } from "lucide-react";
import type { Sticker } from "@newdisc/shared";
import { useAuth } from "@/stores/auth";
import { useEmojis } from "@/stores/emojis";
import { useCanModerate, useGuilds } from "@/stores/guilds";
import { ui } from "@/stores/ui";

/**
 * Seletor de figurinha: as dos meus servidores, com o servidor aberto primeiro.
 *
 * A busca olha nome **e** palavras-chave — é para isso que a figurinha guarda
 * `tags`; procurar só pelo nome obrigaria a lembrar como quem subiu a batizou.
 */
export default function StickerPicker({
  onEscolher,
  onClose,
  className = "",
}: {
  onEscolher: (sticker: Sticker) => void;
  onClose: () => void;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [busca, setBusca] = useState("");
  const guildIdAtivo = useGuilds((s) => s.activeGuildId);
  const secoes = useEmojis((s) => s.stickerGuilds);
  const me = useAuth((s) => s.user);
  const podeGerenciar = useCanModerate(me?.id);

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

  const ordenadas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const ordem = guildIdAtivo
      ? [
          ...secoes.filter((s) => s.guildId === guildIdAtivo),
          ...secoes.filter((s) => s.guildId !== guildIdAtivo),
        ]
      : secoes;
    if (!q) return ordem;
    return ordem
      .map((s) => ({
        ...s,
        stickers: s.stickers.filter((f) => f.name.includes(q) || f.tags.includes(q)),
      }))
      .filter((s) => s.stickers.length > 0);
  }, [secoes, guildIdAtivo, busca]);

  const vazio = ordenadas.every((s) => s.stickers.length === 0);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Escolher figurinha"
      className={`z-[70] flex h-[420px] w-[352px] flex-col overflow-hidden rounded-lg bg-panel shadow-high ${className}`}
    >
      <div className="p-2">
        <input
          autoFocus
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar figurinha"
          aria-label="Buscar figurinha"
          className="h-8 w-full rounded bg-rail px-2 text-sm text-txt-normal outline-none placeholder:text-txt-muted"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {vazio ? (
          <p className="px-2 py-10 text-center text-sm text-txt-muted">
            {busca.trim()
              ? "Nenhuma figurinha com esse nome."
              : "Seus servidores ainda não têm figurinhas."}
          </p>
        ) : (
          ordenadas.map((secao) => (
            <section key={secao.guildId} className="mb-2">
              <h3 className="px-1 py-1 text-xs font-semibold uppercase text-txt-muted">
                {secao.guildName}
              </h3>
              <div className="grid grid-cols-3 gap-2">
                {secao.stickers.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    title={f.name}
                    aria-label={f.name}
                    onClick={() => onEscolher(f)}
                    className="grid h-24 place-items-center rounded hover:bg-hov"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={f.url}
                      alt={f.name}
                      loading="lazy"
                      className="h-20 w-20 object-contain"
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
          Gerenciar figurinhas do servidor
        </button>
      )}
    </div>
  );
}
