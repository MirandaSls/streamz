"use client";

import { useState } from "react";
import {
  MAX_MODERATION_REASON,
  PURGE_WINDOWS,
  displayNameOf,
  type PublicUser,
} from "@streamz/shared";
import Dialog, { PrimaryButton, SecondaryButton } from "@/components/modals/Dialog";
import { api } from "@/lib/api";
import { useGuilds } from "@/stores/guilds";
import { errorMessage } from "@/stores/socket-adapter";
import { ui, useUI } from "@/stores/ui";

/**
 * Banimento com motivo e limpeza opcional das mensagens recentes.
 *
 * A limpeza é a parte perigosa e por isso vem desligada por padrão ("Não apagar
 * mensagens"): apagar 7 dias de conversa por engano não tem desfazer.
 */
export default function BanModal({ guildId, user }: { guildId: string; user: PublicUser }) {
  const closeModal = useUI((s) => s.closeModal);
  const [reason, setReason] = useState("");
  const [hours, setHours] = useState(0);
  const [saving, setSaving] = useState(false);
  const nome = displayNameOf(user);

  async function submit() {
    if (saving) return;
    setSaving(true);
    try {
      await api.banWithReason(guildId, user.id, {
        reason: reason.trim() || undefined,
        deleteMessageHours: hours,
      });
      // a lista de membros também some pelo `member.left`, mas a resposta já
      // chegou: tirar aqui evita o membro piscar de volta em conexão lenta
      useGuilds.setState((s) => ({ members: s.members.filter((m) => m.user.id !== user.id) }));
      ui.toast(`${nome} foi banido.`);
      closeModal();
    } catch (e) {
      ui.toast(errorMessage(e, "Não foi possível banir"), "error");
      setSaving(false);
    }
  }

  return (
    <Dialog
      title={`Banir ${nome}`}
      description="Essa pessoa sai do servidor e não consegue voltar, nem com um novo convite."
      onClose={closeModal}
      className="w-[440px]"
      footer={
        <>
          <PrimaryButton danger disabled={saving} onClick={() => void submit()}>
            {saving ? "Banindo…" : "Banir"}
          </PrimaryButton>
          <SecondaryButton autoFocus onClick={closeModal}>
            Cancelar
          </SecondaryButton>
        </>
      }
    >
      <label
        htmlFor="ban-reason"
        className="mb-2 block text-xs font-bold uppercase tracking-[0.02em] text-txt-secondary"
      >
        Motivo (opcional)
      </label>
      <input
        id="ban-reason"
        value={reason}
        maxLength={MAX_MODERATION_REASON}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Ex.: divulgação em massa"
        className="h-10 w-full rounded-[3px] bg-rail px-2.5 text-txt-normal outline-none placeholder:text-txt-muted"
        autoFocus
      />
      <p className="mt-1 text-xs text-txt-muted">
        O motivo vai para o registro de auditoria, para a lista de banimentos e para o aviso que
        essa pessoa recebe na conversa direta.
      </p>

      <fieldset className="mt-5">
        <legend className="mb-2 text-xs font-bold uppercase tracking-[0.02em] text-txt-secondary">
          Apagar mensagens recentes
        </legend>
        <div className="flex flex-col gap-1">
          {PURGE_WINDOWS.map((w) => (
            <label
              key={w.hours}
              className="flex h-9 cursor-pointer items-center gap-2 rounded-[3px] px-2 text-sm text-txt-normal hover:bg-hov"
            >
              <input
                type="radio"
                name="purge"
                checked={hours === w.hours}
                onChange={() => setHours(w.hours)}
                className="accent-accent"
              />
              {w.label}
            </label>
          ))}
        </div>
      </fieldset>
    </Dialog>
  );
}
