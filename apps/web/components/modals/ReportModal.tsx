"use client";

import { useState } from "react";
import { MAX_REPORT_DETAILS, REPORT_REASONS, type ReportReason } from "@newdisc/shared";
import Dialog, { PrimaryButton, SecondaryButton } from "@/components/modals/Dialog";
import { api } from "@/lib/api";
import { errorMessage } from "@/stores/socket-adapter";
import { ui, useUI } from "@/stores/ui";

/**
 * Denúncia de mensagem. O texto denunciado é copiado no servidor no momento do
 * envio — se a mensagem for apagada depois, a moderação ainda vê o que foi
 * denunciado.
 */
export default function ReportModal({
  messageId,
  preview,
}: {
  messageId: string;
  /** trecho da mensagem, só para quem denuncia confirmar que é a certa. */
  preview: string;
}) {
  const closeModal = useUI((s) => s.closeModal);
  const [reason, setReason] = useState<ReportReason>(REPORT_REASONS[0].value);
  const [details, setDetails] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (saving) return;
    setSaving(true);
    try {
      await api.reportMessage(messageId, reason, details.trim() || undefined);
      ui.toast("Denúncia enviada. A moderação do servidor vai avaliar.");
      closeModal();
    } catch (e) {
      ui.toast(errorMessage(e, "Não foi possível enviar a denúncia"), "error");
      setSaving(false);
    }
  }

  return (
    <Dialog
      title="Denunciar mensagem"
      description="Só a moderação deste servidor vê as denúncias."
      onClose={closeModal}
      className="w-[440px]"
      footer={
        <>
          <PrimaryButton danger disabled={saving} onClick={() => void submit()}>
            {saving ? "Enviando…" : "Enviar denúncia"}
          </PrimaryButton>
          <SecondaryButton autoFocus onClick={closeModal}>
            Cancelar
          </SecondaryButton>
        </>
      }
    >
      {preview && (
        <blockquote className="mb-4 max-h-24 overflow-y-auto break-words rounded-[3px] border-l-2 border-[#4e5058] bg-rail px-3 py-2 text-sm text-txt-muted">
          {preview}
        </blockquote>
      )}

      <fieldset>
        <legend className="mb-2 text-xs font-bold uppercase tracking-[0.02em] text-txt-secondary">
          Motivo
        </legend>
        <div className="flex flex-col gap-1">
          {REPORT_REASONS.map((r) => (
            <label
              key={r.value}
              className="flex h-9 cursor-pointer items-center gap-2 rounded-[3px] px-2 text-sm text-txt-normal hover:bg-hov"
            >
              <input
                type="radio"
                name="report-reason"
                checked={reason === r.value}
                onChange={() => setReason(r.value)}
                className="accent-accent"
              />
              {r.label}
            </label>
          ))}
        </div>
      </fieldset>

      <label
        htmlFor="report-details"
        className="mb-2 mt-5 block text-xs font-bold uppercase tracking-[0.02em] text-txt-secondary"
      >
        Detalhes (opcional)
      </label>
      <textarea
        id="report-details"
        rows={3}
        value={details}
        maxLength={MAX_REPORT_DETAILS}
        onChange={(e) => setDetails(e.target.value)}
        placeholder="Conte o que aconteceu, se ajudar."
        className="w-full resize-none rounded-[3px] bg-rail px-2.5 py-2 text-txt-normal outline-none placeholder:text-txt-muted"
      />
    </Dialog>
  );
}
