"use client";

import { useState } from "react";
import Dialog, { PrimaryButton, SecondaryButton } from "@/components/modals/Dialog";
import type { Modal } from "@/stores/ui";

/** Substitui o `prompt()` do browser. Enter confirma, Esc cancela. */
export default function PromptDialog({
  modal,
}: {
  modal: Extract<Modal, { kind: "prompt" }>;
}) {
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
      className="w-[380px]"
      footer={
        <>
          <PrimaryButton disabled={empty} onClick={submit}>
            {modal.confirmLabel}
          </PrimaryButton>
          <SecondaryButton onClick={() => modal.resolve(null)}>Cancelar</SecondaryButton>
        </>
      }
    >
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
        placeholder={modal.placeholder}
        aria-label={modal.title}
        className="w-full rounded bg-rail px-3 py-2 text-sm outline-none"
      />
    </Dialog>
  );
}
