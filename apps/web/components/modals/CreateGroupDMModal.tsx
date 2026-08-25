"use client";

import { useMemo, useState } from "react";
import Dialog, { PrimaryButton, SecondaryButton } from "@/components/modals/Dialog";
import Avatar from "@/components/ui/Avatar";
import { contactsFromDMs, useDMs } from "@/stores/dms";
import { useUI } from "@/stores/ui";

/** Grupo de DM: nome opcional e 2+ contatos vindos das conversas 1-a-1. */
export default function CreateGroupDMModal() {
  const closeModal = useUI((s) => s.closeModal);
  const channels = useDMs((s) => s.channels);
  const createGroup = useDMs((s) => s.createGroup);

  const contacts = useMemo(() => contactsFromDMs(channels), [channels]);
  const [name, setName] = useState("");
  const [picks, setPicks] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  function togglePick(userId: string) {
    setPicks((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
    );
  }

  async function submit() {
    if (picks.length < 2 || saving) return;
    setSaving(true);
    const ok = await createGroup(picks, name.trim() || undefined);
    setSaving(false);
    if (ok) closeModal();
  }

  return (
    <Dialog
      title="Novo grupo"
      description="Escolha 2 ou mais contatos das suas conversas."
      onClose={closeModal}
      className="w-[380px]"
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
        className="mb-3 w-full rounded bg-rail px-3 py-2 text-sm outline-none"
      />
      <div className="max-h-56 overflow-y-auto rounded bg-rail/50">
        {contacts.length === 0 ? (
          <p className="px-3 py-3 text-sm text-txt-muted">
            Você ainda não tem contatos. Abra uma DM 1-a-1 primeiro, pela lista de
            membros de um servidor.
          </p>
        ) : (
          contacts.map((u) => (
            <label
              key={u.id}
              className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm text-txt-normal hover:bg-hov"
            >
              <input
                type="checkbox"
                checked={picks.includes(u.id)}
                onChange={() => togglePick(u.id)}
              />
              <Avatar user={u} size="sm" />
              {u.username}
            </label>
          ))
        )}
      </div>
    </Dialog>
  );
}
