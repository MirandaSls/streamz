"use client";

import { useEffect, useMemo, useState } from "react";
import { displayNameOf, MAX_DM_GROUP_INVITEES, type PublicUser } from "@streamz/shared";
import Dialog, { PrimaryButton, SecondaryButton } from "@/components/modals/Dialog";
import Avatar from "@/components/ui/Avatar";
import { api } from "@/lib/api";
import { contactsFromDMs, useDMs } from "@/stores/dms";
import { useUI } from "@/stores/ui";

/** Grupo de DM: nome opcional e 2+ pessoas — contatos conhecidos ou busca por nome. */
export default function CreateGroupDMModal() {
  const closeModal = useUI((s) => s.closeModal);
  const channels = useDMs((s) => s.channels);
  const createGroup = useDMs((s) => s.createGroup);

  const contacts = useMemo(() => contactsFromDMs(channels), [channels]);
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<PublicUser[]>([]);
  const [picks, setPicks] = useState<PublicUser[]>([]);
  const [saving, setSaving] = useState(false);

  const q = query.trim();
  useEffect(() => {
    if (q.length < 2) {
      setFound([]);
      return;
    }
    let vivo = true;
    const t = window.setTimeout(() => {
      api
        .searchUsers(q)
        .then((users) => vivo && setFound(users))
        .catch(() => vivo && setFound([]));
    }, 250);
    return () => {
      vivo = false;
      window.clearTimeout(t);
    };
  }, [q]);

  // resultados da busca primeiro; sem busca, os contatos conhecidos
  const candidates = q.length >= 2 ? found : contacts;
  const pickedIds = new Set(picks.map((u) => u.id));

  function toggle(u: PublicUser) {
    setPicks((prev) => {
      if (prev.some((x) => x.id === u.id)) return prev.filter((x) => x.id !== u.id);
      if (prev.length >= MAX_DM_GROUP_INVITEES) return prev;
      return [...prev, u];
    });
  }

  async function submit() {
    if (picks.length < 2 || saving) return;
    setSaving(true);
    const ok = await createGroup(picks.map((u) => u.id), name.trim() || undefined);
    setSaving(false);
    if (ok) closeModal();
  }

  return (
    <Dialog
      title="Selecionar amigos"
      description={`Você pode adicionar até ${MAX_DM_GROUP_INVITEES} pessoas.`}
      onClose={closeModal}
      className="w-[440px]"
      footer={
        <>
          <PrimaryButton disabled={picks.length < 2 || saving} onClick={submit}>
            {saving ? "Criando…" : "Criar grupo"}
          </PrimaryButton>
          <SecondaryButton onClick={closeModal}>Cancelar</SecondaryButton>
        </>
      }
    >
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Nome do grupo (opcional)"
        aria-label="Nome do grupo"
        className="mb-3 h-10 w-full rounded-[3px] bg-rail px-2.5 text-txt-normal outline-none placeholder:text-txt-muted"
      />

      {picks.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1">
          {picks.map((u) => (
            <button
              key={u.id}
              type="button"
              onClick={() => toggle(u)}
              aria-label={`Remover ${displayNameOf(u)}`}
              className="rounded-[3px] bg-accent/30 px-2 py-0.5 text-sm text-txt-primary hover:bg-red hover:text-white"
            >
              {displayNameOf(u)} ✕
            </button>
          ))}
        </div>
      )}

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        type="search"
        placeholder="Digite o nome de um usuário"
        aria-label="Buscar usuário"
        className="mb-2 h-10 w-full rounded-[3px] bg-rail px-2.5 text-txt-normal outline-none placeholder:text-txt-muted"
      />

      <div className="max-h-56 overflow-y-auto rounded bg-rail/50">
        {candidates.length === 0 ? (
          <p className="px-3 py-3 text-sm text-txt-muted">
            {q.length >= 2 ? "Ninguém com esse nome." : "Busque alguém pelo nome acima."}
          </p>
        ) : (
          candidates.map((u) => (
            <label
              key={u.id}
              className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm text-txt-normal hover:bg-hov"
            >
              <input type="checkbox" checked={pickedIds.has(u.id)} onChange={() => toggle(u)} />
              <Avatar user={u} size="sm" />
              <span className="min-w-0">
                <span className="block truncate">{displayNameOf(u)}</span>
                <span className="block truncate text-xs text-txt-muted">@{u.username}</span>
              </span>
            </label>
          ))
        )}
      </div>
    </Dialog>
  );
}
