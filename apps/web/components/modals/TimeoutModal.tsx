"use client";

import { useState } from "react";
import {
  MAX_MODERATION_REASON,
  TIMEOUT_PRESETS,
  displayNameOf,
  type PublicUser,
} from "@newdisc/shared";
import Dialog, { PrimaryButton, SecondaryButton } from "@/components/modals/Dialog";
import { api } from "@/lib/api";
import { errorMessage } from "@/stores/socket-adapter";
import { ui, useUI } from "@/stores/ui";

/**
 * Castigo: escolhe a duração num dos presets do Discord e diz o motivo.
 *
 * Quem está de castigo continua lendo tudo — só não escreve nem reage. O texto
 * do modal diz isso porque é a diferença entre castigo e expulsão.
 */
export default function TimeoutModal({ guildId, user }: { guildId: string; user: PublicUser }) {
  const closeModal = useUI((s) => s.closeModal);
  const [minutes, setMinutes] = useState(TIMEOUT_PRESETS[1].minutes);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const nome = displayNameOf(user);

  async function submit() {
    if (saving) return;
    setSaving(true);
    try {
      await api.timeoutMember(guildId, user.id, { minutes, reason: reason.trim() || undefined });
      ui.toast(`${nome} está de castigo.`);
      closeModal();
    } catch (e) {
      ui.toast(errorMessage(e, "Não foi possível aplicar o castigo"), "error");
      setSaving(false);
    }
  }

  return (
    <Dialog
      title={`Colocar ${nome} de castigo`}
      description="Durante o castigo essa pessoa continua vendo o servidor, mas não pode enviar mensagens nem reagir."
      onClose={closeModal}
      className="w-[440px]"
      footer={
        <>
          <PrimaryButton danger disabled={saving} onClick={() => void submit()}>
            {saving ? "Aplicando…" : "Colocar de castigo"}
          </PrimaryButton>
          <SecondaryButton autoFocus onClick={closeModal}>
            Cancelar
          </SecondaryButton>
        </>
      }
    >
      <fieldset>
        <legend className="mb-2 text-xs font-bold uppercase tracking-[0.02em] text-txt-secondary">
          Duração
        </legend>
        <div className="flex flex-wrap gap-2">
          {TIMEOUT_PRESETS.map((p) => (
            <button
              key={p.minutes}
              type="button"
              aria-pressed={minutes === p.minutes}
              onClick={() => setMinutes(p.minutes)}
              className={`h-9 rounded-[3px] px-3 text-sm font-medium transition ${
                minutes === p.minutes
                  ? "bg-accent text-white"
                  : "bg-rail text-txt-normal hover:bg-hov"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </fieldset>

      <label
        htmlFor="timeout-reason"
        className="mb-2 mt-5 block text-xs font-bold uppercase tracking-[0.02em] text-txt-secondary"
      >
        Motivo (opcional)
      </label>
      <input
        id="timeout-reason"
        value={reason}
        maxLength={MAX_MODERATION_REASON}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Ex.: spam no canal geral"
        className="h-10 w-full rounded-[3px] bg-rail px-2.5 text-txt-normal outline-none placeholder:text-txt-muted"
      />
      <p className="mt-1 text-xs text-txt-muted">
        O motivo fica registrado no registro de auditoria do servidor.
      </p>
    </Dialog>
  );
}
