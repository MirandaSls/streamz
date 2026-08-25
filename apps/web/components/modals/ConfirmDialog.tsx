"use client";

import Dialog, { PrimaryButton, SecondaryButton } from "@/components/modals/Dialog";
import type { Modal } from "@/stores/ui";

/** Substitui o `confirm()` do browser: mesmo fluxo, mas acessível e no tema. */
export default function ConfirmDialog({
  modal,
}: {
  modal: Extract<Modal, { kind: "confirm" }>;
}) {
  return (
    <Dialog
      title={modal.title}
      description={modal.message}
      onClose={() => modal.resolve(false)}
      className="w-[360px]"
      footer={
        <>
          <PrimaryButton danger={modal.danger} onClick={() => modal.resolve(true)}>
            {modal.confirmLabel}
          </PrimaryButton>
          <SecondaryButton autoFocus={modal.danger} onClick={() => modal.resolve(false)}>
            Cancelar
          </SecondaryButton>
        </>
      }
    />
  );
}
