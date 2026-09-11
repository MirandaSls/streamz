"use client";

import { useId, useState } from "react";
import Dialog, { PrimaryButton, SecondaryButton } from "@/components/modals/Dialog";
import { Rotulo } from "@/components/ui/controls";
import type { Modal } from "@/stores/ui";

/** Substitui o `prompt()` do browser. Enter confirma, Esc cancela. */
export default function PromptDialog({
  modal,
}: {
  modal: Extract<Modal, { kind: "prompt" }>;
}) {
  const campoId = useId();
  const [value, setValue] = useState(modal.initial);
  const empty = !value.trim();

  function submit() {
    if (empty) return;
    modal.resolve(value.trim());
  }

  return (
    <Dialog
      title={modal.title}
      description={modal.message}
      onClose={() => modal.resolve(null)}
      footer={
        <>
          <PrimaryButton danger={modal.danger} disabled={empty} onClick={submit}>
            {modal.confirmLabel}
          </PrimaryButton>
          <SecondaryButton onClick={() => modal.resolve(null)}>Cancelar</SecondaryButton>
        </>
      }
    >
      <Rotulo htmlFor={campoId}>{modal.label ?? modal.title}</Rotulo>
      <input
        id={campoId}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
        placeholder={modal.placeholder}
        className="h-10 w-full rounded-[3px] bg-input-background-default px-2.5 text-text-default outline-none placeholder:text-text-muted"
      />
    </Dialog>
  );
}
