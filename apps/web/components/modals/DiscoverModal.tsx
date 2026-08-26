"use client";

import { useCallback, useEffect, useState } from "react";
import { Compass, Search } from "lucide-react";
import type { DiscoverableGuild } from "@streamz/shared";
import Dialog, { SecondaryButton } from "@/components/modals/Dialog";
import { api } from "@/lib/api";
import { useGuilds } from "@/stores/guilds";
import { errorMessage } from "@/stores/socket-adapter";
import { ui, useUI } from "@/stores/ui";

/** Iniciais do nome, como o rail faz com servidor sem ícone. */
function acronimo(nome: string): string {
  return nome
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .slice(0, 4)
    .toUpperCase();
}

/**
 * "Descobrir": servidores que os donos marcaram como públicos.
 *
 * O caminho antigo (entrar colando um código) não some — vira o link do topo,
 * como no Discord, porque continua sendo o jeito de entrar em servidor fechado.
 */
export default function DiscoverModal() {
  const closeModal = useUI((s) => s.closeModal);
  const joinByCode = useGuilds((s) => s.joinByCode);
  const load = useGuilds((s) => s.load);
  const select = useGuilds((s) => s.select);
  const [guilds, setGuilds] = useState<DiscoverableGuild[] | null>(null);
  const [q, setQ] = useState("");
  const [entrando, setEntrando] = useState<string | null>(null);

  const buscar = useCallback(async (termo: string) => {
    try {
      setGuilds(await api.discover(termo.trim() || undefined));
    } catch (e) {
      ui.toast(errorMessage(e, "Não foi possível carregar os servidores"), "error");
      setGuilds([]);
    }
  }, []);

  useEffect(() => {
    void buscar("");
  }, [buscar]);

  async function entrar(g: DiscoverableGuild) {
    if (g.joined) {
      select({ id: g.id, name: g.name });
      closeModal();
      return;
    }
    setEntrando(g.id);
    try {
      await api.joinDiscoverable(g.id);
      await load();
      select({ id: g.id, name: g.name });
      closeModal();
    } catch (e) {
      ui.toast(errorMessage(e, "Não foi possível entrar no servidor"), "error");
      setEntrando(null);
    }
  }

  return (
    <Dialog
      title="Descobrir servidores"
      description="Comunidades públicas em que qualquer pessoa pode entrar."
      onClose={closeModal}
      className="h-[80vh] w-[760px]"
      footer={<SecondaryButton onClick={closeModal}>Fechar</SecondaryButton>}
    >
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-[3px] bg-rail px-2.5">
          <Search size={16} className="shrink-0 text-txt-muted" aria-hidden="true" />
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              void buscar(e.target.value);
            }}
            aria-label="Buscar servidores"
            placeholder="Buscar comunidades"
            className="min-w-0 flex-1 bg-transparent text-txt-normal outline-none placeholder:text-txt-muted"
          />
        </div>
        <button
          type="button"
          onClick={() => {
            closeModal();
            void joinByCode();
          }}
          className="shrink-0 text-sm font-medium text-txt-link hover:underline"
        >
          Entrar com um código de convite
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {guilds === null && <p className="text-sm text-txt-muted">Carregando…</p>}
        {guilds?.length === 0 && (
          <div className="grid place-items-center py-10 text-center">
            <Compass size={42} className="mb-3 text-txt-muted" aria-hidden="true" />
            <p className="text-sm text-txt-muted">
              Nenhum servidor público por aqui ainda. Marque o seu em Configurações do servidor →
              Entrada e regras.
            </p>
          </div>
        )}

        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
          {guilds?.map((g) => (
            <article
              key={g.id}
              className="flex flex-col overflow-hidden rounded-lg bg-panel shadow-high"
            >
              <div className="h-16 bg-accent" />
              <div className="flex min-h-0 flex-1 flex-col p-3">
                <div className="-mt-8 mb-2 grid h-12 w-12 place-items-center rounded-2xl border-[3px] border-panel bg-rail text-sm font-semibold text-txt-primary">
                  {g.iconUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={g.iconUrl} alt="" className="h-full w-full rounded-2xl object-cover" />
                  ) : (
                    acronimo(g.name)
                  )}
                </div>
                <h3 className="truncate font-semibold text-txt-primary">{g.name}</h3>
                <p className="mb-2 line-clamp-3 min-h-0 flex-1 text-sm text-txt-muted">
                  {g.description || "Sem descrição."}
                </p>
                <p className="mb-3 flex items-center gap-3 text-xs text-txt-muted">
                  <span className="flex items-center gap-1">
                    <span aria-hidden="true" className="h-2 w-2 rounded-full bg-green" />
                    {g.onlineCount} online
                  </span>
                  <span>{g.memberCount} membros</span>
                </p>
                <button
                  type="button"
                  disabled={entrando === g.id}
                  onClick={() => void entrar(g)}
                  className={`h-9 rounded-[3px] text-sm font-medium transition disabled:opacity-50 ${
                    g.joined
                      ? "bg-rail text-txt-normal hover:bg-hov"
                      : "bg-green text-white hover:brightness-110"
                  }`}
                >
                  {g.joined ? "Abrir" : entrando === g.id ? "Entrando…" : "Entrar"}
                </button>
              </div>
            </article>
          ))}
        </div>
      </div>
    </Dialog>
  );
}
