"use client";

import { useState } from "react";
import Dialog, { SecondaryButton } from "@/components/modals/Dialog";
import { useUI } from "@/stores/ui";

/** Mostra o código do convite recém-criado, com cópia para a área de transferência. */
export default function InviteModal({ code }: { code: string }) {
  const closeModal = useUI((s) => s.closeModal);
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard?.writeText(code);
      setCopied(true);
    } catch {
      // sem permissão de clipboard: o código continua selecionável na tela
      setCopied(false);
    }
  }

  return (
    <Dialog
      title="Convite criado"
      description="Compartilhe este código para entrarem no servidor:"
      onClose={closeModal}
      className="w-[360px]"
      footer={<SecondaryButton full onClick={closeModal}>Fechar</SecondaryButton>}
    >
      <div className="flex items-center gap-2">
        <code className="flex-1 select-all rounded bg-rail px-3 py-2 font-mono text-sm text-accent">
          {code}
        </code>
        <button
          type="button"
          onClick={copy}
          className="rounded bg-accent px-3 py-2 text-sm font-medium text-white transition hover:brightness-110"
        >
          {copied ? "Copiado" : "Copiar"}
        </button>
      </div>
      <p aria-live="polite" className="mt-2 h-4 text-xs text-neutral-500">
        {copied ? "Código copiado." : ""}
      </p>
    </Dialog>
  );
}
