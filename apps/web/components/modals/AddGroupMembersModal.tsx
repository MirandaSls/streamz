"use client";

import { useMemo, useState } from "react";
import { displayNameOf, type PublicUser } from "@streamz/shared";
import Dialog, { SecondaryButton } from "@/components/modals/Dialog";
import Avatar from "@/components/ui/Avatar";
import { useDMs } from "@/stores/dms";
import { useFriends } from "@/stores/friends";
import { useUI } from "@/stores/ui";

/**
 * "Adicionar pessoas" a um grupo de DM.
 *
 * Só amigos aparecem — é assim no Discord, e evita que o grupo vire um caminho
 * para chegar a quem não quer ser encontrado. Quem já está no grupo some da
 * lista assim que entra.
 */
export default function AddGroupMembersModal({ channelId }: { channelId: string }) {
  const closeModal = useUI((s) => s.closeModal);
  const dm = useDMs((s) => s.channels.find((d) => d.id === channelId) ?? null);
  const addMember = useDMs((s) => s.addMember);
  const friends = useFriends((s) => s.friends);
  const [query, setQuery] = useState("");
  const [ocupado, setOcupado] = useState<string | null>(null);

  const dentro = useMemo(() => new Set(dm?.others.map((u) => u.id) ?? []), [dm]);
  const q = query.trim().toLowerCase();
  const candidatos = friends.filter(
    (f) =>
      !dentro.has(f.id) &&
      (!q || displayNameOf(f).toLowerCase().includes(q) || f.username.toLowerCase().includes(q)),
  );

  async function adicionar(user: PublicUser) {
    setOcupado(user.id);
    await addMember(channelId, user.id);
    setOcupado(null);
  }

  return (
    <Dialog
      title="Adicionar pessoas"
      description="Só amigos aparecem aqui."
      onClose={closeModal}
      className="w-[440px]"
      footer={<SecondaryButton onClick={closeModal}>Fechar</SecondaryButton>}
    >
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        type="search"
        placeholder="Buscar entre seus amigos"
        aria-label="Buscar amigo"
        className="mb-2 h-10 w-full rounded-[3px] bg-rail px-2.5 text-txt-normal outline-none placeholder:text-txt-muted"
      />

      <div className="max-h-64 overflow-y-auto rounded bg-rail/50">
        {candidatos.length === 0 ? (
          <p className="px-3 py-3 text-sm text-txt-muted">
            {friends.length === 0
              ? "Você ainda não tem amigos para adicionar."
              : "Todos os seus amigos já estão neste grupo."}
          </p>
        ) : (
          candidatos.map((u) => (
            <div
              key={u.id}
              className="flex items-center gap-3 px-3 py-2 text-sm text-txt-normal hover:bg-hov"
            >
              <Avatar user={u} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate">{displayNameOf(u)}</span>
                <span className="block truncate text-xs text-txt-muted">@{u.username}</span>
              </span>
              <button
                type="button"
                disabled={ocupado === u.id}
                onClick={() => void adicionar(u)}
                className="h-8 shrink-0 rounded-[3px] border border-accent px-3 text-sm font-medium text-txt-primary transition hover:bg-accent hover:text-accent-ink disabled:opacity-50"
              >
                {ocupado === u.id ? "Adicionando…" : "Adicionar"}
              </button>
            </div>
          ))
        )}
      </div>
    </Dialog>
  );
}
