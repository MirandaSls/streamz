"use client";

import { useState } from "react";
import { MAX_REPORT_DETAILS, REPORT_REASONS, type ReportReason } from "@streamz/shared";
import Dialog, { PrimaryButton, SecondaryButton } from "@/components/modals/Dialog";
import { RadioLinha } from "@/components/ui/controls";
import { Campo, TextArea } from "@/components/ui/primitivos";
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
        <blockquote className="mb-4 max-h-24 overflow-y-auto break-words rounded-[3px] border-l-2 border-border-normal bg-input-background-default px-3 py-2 text-sm text-text-muted">
          {preview}
        </blockquote>
      )}

      {/*
       * `RadioLinha` (`components/ui/controls.tsx`) no lugar do
       * `<input type="radio">` cru que estava aqui: o indicador nativo só
       * ganha a cor da marca (`accent-brand-500`), não o círculo de 20×20 com
       * o miolo de 10 nos tokens `--radio-border-selected-default`/
       * `--radio-background-selected-default`/`--radio-thumb-background-active`
       * que o Discord desenha para uma lista de opções exclusivas com título e
       * círculo à direita — a mesma forma desta lista de motivos.
       */}
      <fieldset>
        <legend className="mb-2 text-xs font-bold uppercase tracking-[0.02em] text-text-subtle">
          Motivo
        </legend>
        <div className="flex flex-col gap-1">
          {REPORT_REASONS.map((r) => (
            <RadioLinha
              key={r.value}
              name="report-reason"
              checked={reason === r.value}
              onChange={() => setReason(r.value)}
              titulo={r.label}
            />
          ))}
        </div>
      </fieldset>

      <Campo rotulo="Detalhes (opcional)" htmlFor="report-details" className="mt-5">
        <TextArea
          id="report-details"
          rows={3}
          value={details}
          maxLength={MAX_REPORT_DETAILS}
          onChange={(e) => setDetails(e.target.value)}
          placeholder="Conte o que aconteceu, se ajudar."
        />
      </Campo>
    </Dialog>
  );
}
