"use client";

import { useMemo, useState } from "react";
import { displayNameOf, type PublicUser } from "@streamz/shared";
import Dialog, { SecondaryButton } from "@/components/modals/Dialog";
import Avatar from "@/components/ui/Avatar";
import { Button, TextInput } from "@/components/ui/primitivos";
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
      telaCheiaNoCelular
      title="Adicionar pessoas"
      description="Só amigos aparecem aqui."
      onClose={closeModal}
      className="w-[440px]"
      footer={<SecondaryButton onClick={closeModal}>Fechar</SecondaryButton>}
    >
      <TextInput
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        type="search"
        placeholder="Buscar entre seus amigos"
        aria-label="Buscar amigo"
        classeDaCaixa="mb-2"
      />

      <div className="max-h-64 overflow-y-auto rounded bg-input-background-default/50">
        {candidatos.length === 0 ? (
          <p className="px-3 py-3 text-sm text-text-muted">
            {friends.length === 0
              ? "Você ainda não tem amigos para adicionar."
              : "Todos os seus amigos já estão neste grupo."}
          </p>
        ) : (
          candidatos.map((u) => (
            <div
              key={u.id}
              className="flex items-center gap-3 px-3 py-2 text-sm text-text-default hover:bg-interactive-background-hover"
            >
              <Avatar user={u} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate">{displayNameOf(u)}</span>
                <span className="block truncate text-xs text-text-muted">@{u.username}</span>
              </span>
              <Button
                variante="primario"
                tamanho="sm"
                disabled={ocupado === u.id}
                onClick={() => void adicionar(u)}
                className="shrink-0"
              >
                {ocupado === u.id ? "Adicionando…" : "Adicionar"}
              </Button>
            </div>
          ))
        )}
      </div>
    </Dialog>
  );
}
