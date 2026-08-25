"use client";

import { useState } from "react";
import { Hash, Lock, Megaphone, Volume2 } from "lucide-react";
import type { GuildChannelType } from "@newdisc/shared";
import Dialog, { PrimaryButton, SecondaryButton } from "@/components/modals/Dialog";
import { useAuth } from "@/stores/auth";
import { useCanModerate, useGuilds } from "@/stores/guilds";
import { useChannels } from "@/stores/channels";
import { useUI } from "@/stores/ui";

/** Criação de canal: nome, tipo e — para moderadores — privado/somente-leitura. */
export default function CreateChannelModal() {
  const closeModal = useUI((s) => s.closeModal);
  const guildId = useGuilds((s) => s.activeGuildId);
  const members = useGuilds((s) => s.members);
  const user = useAuth((s) => s.user);
  const canModerate = useCanModerate(user?.id);
  const create = useChannels((s) => s.create);

  const [name, setName] = useState("");
  const [type, setType] = useState<GuildChannelType>("TEXT");
  const [isPrivate, setPrivate] = useState(false);
  const [readOnly, setReadOnly] = useState(false);
  const [picks, setPicks] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const plainMembers = members.filter((m) => m.role === "MEMBER");

  async function submit() {
    if (!guildId || !name.trim() || saving) return;
    setSaving(true);
    const ok = await create(guildId, { name, type, isPrivate, readOnly, memberIds: picks });
    setSaving(false);
    if (ok) closeModal();
  }

  function togglePick(userId: string) {
    setPicks((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
    );
  }

  return (
    <Dialog
      title="Novo canal"
      onClose={closeModal}
      className="w-[400px]"
      footer={
        <>
          <PrimaryButton disabled={!name.trim() || saving} onClick={submit}>
            {saving ? "Criando…" : "Criar canal"}
          </PrimaryButton>
          <SecondaryButton onClick={closeModal}>Cancelar</SecondaryButton>
        </>
      }
    >
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void submit();
          }
        }}
        placeholder="Nome do canal"
        aria-label="Nome do canal"
        className="mb-3 w-full rounded bg-rail px-3 py-2 text-sm outline-none"
      />

      <div className="mb-3 flex gap-2" role="group" aria-label="Tipo do canal">
        {(["TEXT", "VOICE"] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setType(option)}
            aria-pressed={type === option}
            className={`flex flex-1 items-center justify-center gap-2 rounded-[3px] py-2 text-sm font-medium transition ${
              type === option ? "bg-accent text-white" : "bg-rail text-txt-normal hover:bg-hov"
            }`}
          >
            {option === "TEXT" ? <Hash size={18} aria-hidden="true" /> : <Volume2 size={18} aria-hidden="true" />}
            {option === "TEXT" ? "Texto" : "Voz"}
          </button>
        ))}
      </div>

      {canModerate && (
        <div className="mb-3 space-y-2 text-sm text-txt-normal">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={isPrivate}
              onChange={(e) => setPrivate(e.target.checked)}
            />
            <Lock size={16} className="text-txt-muted" aria-hidden="true" />
            Privado (só a allowlist e moderadores)
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={readOnly}
              onChange={(e) => setReadOnly(e.target.checked)}
            />
            <Megaphone size={16} className="text-txt-muted" aria-hidden="true" />
            Somente leitura (só moderadores postam)
          </label>
        </div>
      )}

      {isPrivate && (
        <div className="max-h-40 overflow-y-auto rounded bg-rail/50">
          {plainMembers.length === 0 ? (
            <p className="px-3 py-2 text-xs text-txt-muted">
              Sem membros comuns para liberar. Moderadores já têm acesso.
            </p>
          ) : (
            plainMembers.map((m) => (
              <label
                key={m.user.id}
                className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm text-txt-normal hover:bg-hov"
              >
                <input
                  type="checkbox"
                  checked={picks.includes(m.user.id)}
                  onChange={() => togglePick(m.user.id)}
                />
                {m.user.username}
              </label>
            ))
          )}
        </div>
      )}
    </Dialog>
  );
}
