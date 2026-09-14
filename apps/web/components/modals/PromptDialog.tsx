"use client";

import { useId, useState } from "react";
import Dialog, { PrimaryButton, SecondaryButton } from "@/components/modals/Dialog";
import { Campo, TextInput } from "@/components/ui/primitivos";
import type { Modal } from "@/stores/ui";

/**
 * Substitui o `prompt()` do browser. Enter confirma, Esc cancela.
 *
 * O campo usa `Campo` (rótulo 16px peso 500, **sem** caixa-alta — a refresh do
 * Discord aboliu a versal aqui, ver o cabeçalho de `TextInput.tsx`), não mais
 * o `Rotulo` de `ui/controls.tsx` com fallback para `modal.title`: sem um
 * `label` explícito, todo chamador (renomear canal, criar categoria…) ficava
 * com o título do modal repetido como legenda do campo logo abaixo dele — os
 * dois prints do mesmo texto, um em cima do outro. Nenhum diálogo do Discord
 * faz isso: um prompt simples só tem título, descrição e o campo, sem legenda
 * própria (a legenda existe quando ela diz algo que o título não diz — "DIGITE
 * O NOME DO SERVIDOR" antes de apagar, por exemplo, e aí quem chama passa
 * `label`). Por isso a legenda agora só aparece com `label` explícito.
 */
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

  const campo = (
    <TextInput
      id={campoId}
      autoFocus
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          submit();
        }
      }}
      placeholder={modal.placeholder}
    />
  );

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
      {modal.label ? (
        <Campo rotulo={modal.label} htmlFor={campoId}>
          {campo}
        </Campo>
      ) : (
        campo
      )}
    </Dialog>
  );
}
